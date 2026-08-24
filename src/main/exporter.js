'use strict';

/**
 * Turns a dub into a video file.
 *
 * The audio graph mirrors how the game plays a dub back:
 *
 *   1. Every take is resampled, gained, and delayed to its line's start time,
 *      then mixed together into a single dub bus.
 *   2. The dub bus optionally passes through loudnorm, then its own gain.
 *   3. The dub bus, the backing track, and (off by default) the video's
 *      original audio are mixed, limited, and padded to the video length.
 *
 * `amix` is given `normalize=0` deliberately: the default divides every input
 * by the input count, which would make a 30-line dub almost inaudible.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { runFfmpeg, probeVideo } = require('./ffmpeg');

const SAMPLE_RATE = 48000;

// The filter graph, written beside the job rather than passed as an argument.
const GRAPH_FILE = 'graph.txt';

/**
 * What Windows will accept as a command line, with room to spare.
 *
 * The real ceiling is about 32,767 characters. Staying well under it leaves
 * room for the quoting the operating system adds and for a path longer than
 * any seen while testing, because the length of somebody's game folder is not
 * something this can know in advance.
 */
const COMMAND_BUDGET = 24000;

/** Roughly what the operating system sees, including quotes around arguments. */
function commandLength(args) {
  return args.reduce((n, a) => n + String(a).length + 3, 0);
}

// Subtitles

function assTime(seconds) {
  const t = Math.max(0, seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t - Math.floor(t)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function srtTime(seconds) {
  const t = Math.max(0, seconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function assEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

/** ASS colours are &HBBGGRR, the reverse of hex CSS. */
function assColour(hex, alpha = '00') {
  const clean = String(hex || '#ffffff').replace('#', '');
  const r = clean.slice(0, 2) || 'ff';
  const g = clean.slice(2, 4) || 'ff';
  const b = clean.slice(4, 6) || 'ff';
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function buildAss(captions, { width, height, style = {} }) {
  const fontSize = Math.round((style.fontSize || 46) * (height / 1080));
  const outline = Math.max(1, Math.round((style.outline ?? 3.5) * (height / 1080)));
  const marginV = Math.round((style.marginV || 70) * (height / 1080));
  const primary = assColour(style.color || '#ffffff');
  const outlineColour = assColour(style.outlineColor || '#000000');
  const speakerColour = assColour(style.speakerColor || '#7fdcff');

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,'
      + ' Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline,'
      + ' Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${style.font || 'Arial'},${fontSize},${primary},&H000000FF,${outlineColour},`
      + `&H80000000,${style.bold === false ? '0' : '-1'},0,0,0,100,100,0,0,1,${outline},1,2,`
      + `${Math.round(width * 0.06)},${Math.round(width * 0.06)},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // Each speaker can carry their own colour; anything unassigned falls back to
  // the shared speaker colour.
  const perCharacter = style.characterColors || {};

  // A caption is one or more lines; two characters talking at the same moment
  // share an event and get a line each rather than being drawn on top of one
  // another. Older single-line captions still work.
  const linesOf = (c) => (c.lines && c.lines.length ? c.lines : [{ text: c.text, character: c.character }]);

  const events = captions
    .filter((c) => c.end > c.start && linesOf(c).some((l) => l.text))
    .map((c) => {
      const body = linesOf(c)
        .filter((l) => l.text)
        .map((l) => {
          const colour = perCharacter[l.character] ? assColour(perCharacter[l.character]) : speakerColour;
          const speaker = style.showSpeaker !== false && l.character
            ? `{\\c${colour}}${assEscape(l.character)}:{\\c${primary}} `
            : '';
          return `${speaker}${assEscape(l.text)}`;
        })
        .join('\\N');
      return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${body}`;
    });

  return `${header.join('\n')}\n${events.join('\n')}\n`;
}

function buildSrt(captions) {
  const linesOf = (c) => (c.lines && c.lines.length ? c.lines : [{ text: c.text, character: c.character }]);

  return captions
    .filter((c) => c.end > c.start && linesOf(c).some((l) => l.text))
    .map((c, i) => {
      const body = linesOf(c)
        .filter((l) => l.text)
        .map((l) => `${l.character ? `${l.character}: ` : ''}${l.text}`)
        .join('\n');
      return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${body}\n`;
    })
    .join('\n');
}

// Encoding presets

const QUALITY = {
  high: { crf: 16, preset: 'slow', audioBitrate: '256k', vp9crf: 28 },
  balanced: { crf: 20, preset: 'medium', audioBitrate: '192k', vp9crf: 33 },
  small: { crf: 26, preset: 'medium', audioBitrate: '128k', vp9crf: 38 },
};

/**
 * Video filter for a shape preset. `vertical`/`square` letterbox the source
 * over a blurred, zoomed copy of itself, which reads far better on phones
 * than black bars.
 */
function videoFilter(preset, source) {
  switch (preset) {
    case '1080p':
      return source.height === 1080 ? null : 'scale=-2:1080';
    case '720p':
      return 'scale=-2:720';
    case '480p':
      return 'scale=-2:480';
    case 'vertical':
      return blurPad(1080, 1920);
    case 'square':
      return blurPad(1080, 1080);
    case 'source':
    default:
      return null;
  }
}

function blurPad(w, h) {
  return [
    `split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=28[bgblur]`,
    `[fgsrc]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgscaled]`,
    `[bgblur][fgscaled]overlay=(W-w)/2:(H-h)/2`,
  ].join(';');
}

function videoCodecArgs(format, quality) {
  const q = QUALITY[quality] || QUALITY.balanced;
  if (format === 'webm') {
    return ['-c:v', 'libvpx-vp9', '-crf', String(q.vp9crf), '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p'];
  }
  return ['-c:v', 'libx264', '-preset', q.preset, '-crf', String(q.crf), '-pix_fmt', 'yuv420p'];
}

function audioCodecArgs(format, quality) {
  const q = QUALITY[quality] || QUALITY.balanced;
  if (format === 'webm') return ['-c:a', 'libopus', '-b:a', q.audioBitrate];
  return ['-c:a', 'aac', '-b:a', q.audioBitrate, '-ar', String(SAMPLE_RATE)];
}

// Job building

/**
 * Assembles the ffmpeg argument list for one export.
 *
 * `tracks` are absolute placements on the video timeline; `trim` (optional)
 * re-bases everything so a single line can be exported as its own clip.
 */
/**
 * Which takes land in the export, where each one starts, and how far into it
 * to begin.
 *
 * Worked out in one place because two things need the same answer: the export
 * itself, and the premix that stands in for it when a pack has more lines than
 * one command line can name. Two copies of this would drift, and the symptom
 * would be a dub sitting a fraction of a second out on long packs only.
 *
 * A take that begins before the trim window but runs into it is seeked into
 * rather than dropped, so a clip export does not lose mid-line audio.
 */
function planTakes(tracks, trimStart, trimEnd) {
  const takes = [];
  for (const track of tracks || []) {
    if (!track.path || track.enabled === false) continue;
    const start = (track.time || 0) + (track.offset || 0);
    const end = start + (track.duration || 0);
    if (trimEnd != null && start >= trimEnd) continue;
    if (end > 0 && end <= trimStart) continue;

    takes.push({
      path: track.path,
      seek: Math.max(0, trimStart - start),
      delay: Math.max(0, Math.round((start - trimStart) * 1000)),
      volume: track.volume == null ? 1 : track.volume,
    });
  }
  return takes;
}

function buildArgs(job, workDir) {
  const {
    videoPath,
    backingPath,
    tracks = [],
    captions = [],
    outputPath,
    options = {},
  } = job;

  const {
    format = 'mp4',
    preset = 'source',
    quality = 'balanced',
    burnCaptions = false,
    captionStyle = {},
    includeOriginalAudio = false,
    backingVolume = 1,
    dubVolume = 1,
    normalizeDub = false,
    trim = null,
  } = options;

  const source = job.videoInfo || probeVideo(videoPath);
  const trimStart = trim ? Math.max(0, trim.start) : 0;
  const trimEnd = trim ? trim.end : (source.duration || null);
  const outDuration = trimEnd != null ? Math.max(0.1, trimEnd - trimStart) : null;

  const args = [];
  const inputs = [];

  // Video input (input 0)
  if (trimStart > 0) args.push('-ss', String(trimStart));
  args.push('-i', videoPath);
  inputs.push('video');

  // Backing track
  let backingIndex = -1;
  if (backingPath && backingVolume > 0) {
    if (trimStart > 0) args.push('-ss', String(trimStart));
    args.push('-i', backingPath);
    backingIndex = inputs.length;
    inputs.push('backing');
  }

  // Dub takes
  // A take that begins before the trim window but runs into it is seeked into
  // rather than dropped, so a clip export doesn't lose mid-line audio.
  const placements = [];
  for (const take of planTakes(tracks, trimStart, trimEnd)) {
    if (take.seek > 0) args.push('-ss', String(take.seek));
    args.push('-i', take.path);
    placements.push({ index: inputs.length, delay: take.delay, volume: take.volume });
    inputs.push('take');
  }

  // Audio graph
  const filters = [];
  const mixLabels = [];

  placements.forEach((p, i) => {
    const label = `dub${i}`;
    const chain = [`aresample=${SAMPLE_RATE}`];

    // Evening out the takes has to happen to each take on its own. Run over the
    // finished mix, which is where it used to sit, loudnorm lifts the whole dub
    // to one overall loudness and leaves the difference between the lines
    // exactly as it was: two takes recorded 25 dB apart came out 25 dB apart.
    // Per take it closes that to a fraction of a decibel.
    //
    // Before the volume, so the balance deliberately set between lines and
    // between characters is applied to levelled takes rather than being undone
    // by the levelling.
    if (normalizeDub) chain.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    if (p.volume !== 1) chain.push(`volume=${p.volume.toFixed(3)}`);
    if (p.delay > 0) chain.push(`adelay=${p.delay}:all=1`);
    filters.push(`[${p.index}:a]${chain.join(',')}[${label}]`);
    mixLabels.push(label);
  });

  let dubBus = null;
  if (mixLabels.length === 1) {
    dubBus = mixLabels[0];
  } else if (mixLabels.length > 1) {
    filters.push(
      `${mixLabels.map((l) => `[${l}]`).join('')}`
      + `amix=inputs=${mixLabels.length}:normalize=0:dropout_transition=0[dubmix]`
    );
    dubBus = 'dubmix';
  }

  if (dubBus) {
    const post = [];
    // Levelling happens per take above, not here. The bus only carries the one
    // slider that applies to the dub as a whole.
    if (dubVolume !== 1) post.push(`volume=${Number(dubVolume).toFixed(3)}`);
    if (post.length) {
      filters.push(`[${dubBus}]${post.join(',')}[dubout]`);
      dubBus = 'dubout';
    }
  }

  const finalInputs = [];
  if (backingIndex >= 0) {
    filters.push(`[${backingIndex}:a]aresample=${SAMPLE_RATE},volume=${Number(backingVolume).toFixed(3)}[bg]`);
    finalInputs.push('bg');
  }
  if (includeOriginalAudio) {
    filters.push(`[0:a]aresample=${SAMPLE_RATE},volume=${Number(options.originalVolume ?? 1).toFixed(3)}[orig]`);
    finalInputs.push('orig');
  }
  if (dubBus) finalInputs.push(dubBus);

  let audioOut = null;
  if (finalInputs.length === 1) {
    // apad keeps the audio at least as long as the video so the tail isn't cut.
    filters.push(`[${finalInputs[0]}]alimiter=limit=0.97,apad[aout]`);
    audioOut = 'aout';
  } else if (finalInputs.length > 1) {
    filters.push(
      `${finalInputs.map((l) => `[${l}]`).join('')}`
      + `amix=inputs=${finalInputs.length}:normalize=0:dropout_transition=0,`
      + `alimiter=limit=0.97,apad[aout]`
    );
    audioOut = 'aout';
  }

  // Video graph
  const vFilters = [];
  const shape = videoFilter(preset, source);
  if (shape) vFilters.push(shape);

  let subsFile = null;
  if (burnCaptions && captions.length) {
    const shaped = shapeForPreset(preset, source);
    subsFile = 'captions.ass';
    fs.writeFileSync(
      path.join(workDir, subsFile),
      buildAss(
        captions
          .map((c) => ({ ...c, start: c.start - trimStart, end: c.end - trimStart }))
          .filter((c) => c.end > 0 && (outDuration == null || c.start < outDuration)),
        { width: shaped.width, height: shaped.height, style: captionStyle }
      ),
      'utf8'
    );
    // Run with cwd = workDir so the filter takes a bare filename; Windows
    // drive letters inside filtergraphs need painful double-escaping.
    vFilters.push(`subtitles=${subsFile}`);
  }

  // Chain video filters, giving the shape preset (which is multi-node) its own
  // pass-through labels.
  if (vFilters.length) {
    const joined = vFilters.join(',');
    // blurPad already contains ';' separated nodes; wire it up explicitly.
    if (shape && shape.includes(';')) {
      const rest = vFilters.slice(1);
      const tail = rest.length ? `,${rest.join(',')}` : '';
      filters.push(`[0:v]${shape}${tail}[vout]`);
    } else {
      filters.push(`[0:v]${joined}[vout]`);
    }
  }

  // Written to a file rather than passed as an argument.
  //
  // Windows refuses to start a process whose whole command line runs past
  // about 32,767 characters, and the graph grows with every line in the pack.
  // A file has no such limit, and ffmpeg reads one with -filter_complex_script.
  // The name is bare because the command runs with its working directory set
  // to workDir; a Windows drive letter inside a filtergraph needs painful
  // escaping and this sidesteps it, the same way the subtitles file does.
  if (filters.length) {
    fs.writeFileSync(path.join(workDir, GRAPH_FILE), filters.join(';\n'), 'utf8');
    args.push('-filter_complex_script', GRAPH_FILE);
  }

  args.push('-map', filters.some((f) => f.includes('[vout]')) ? '[vout]' : '0:v:0');
  if (audioOut) args.push('-map', `[${audioOut}]`);
  else args.push('-an');

  args.push(...videoCodecArgs(format, quality));
  if (audioOut) args.push(...audioCodecArgs(format, quality));

  if (format === 'mp4' || format === 'mov') args.push('-movflags', '+faststart');
  if (outDuration != null) args.push('-t', String(outDuration));

  args.push('-y', outputPath);
  return { args, duration: outDuration, source };
}

/** Output dimensions after a shape preset, for sizing burned-in captions. */
function shapeForPreset(preset, source) {
  switch (preset) {
    case 'vertical': return { width: 1080, height: 1920 };
    case 'square': return { width: 1080, height: 1080 };
    case '1080p': return { width: Math.round(source.width * (1080 / source.height) / 2) * 2, height: 1080 };
    case '720p': return { width: Math.round(source.width * (720 / source.height) / 2) * 2, height: 720 };
    case '480p': return { width: Math.round(source.width * (480 / source.height) / 2) * 2, height: 480 };
    default: return { width: source.width, height: source.height };
  }
}

/** Runs one export job end to end. */
/**
 * Mixes a batch of takes down to one file, keeping each where it belongs.
 *
 * Every take keeps its own levelling, volume and start time, so the result is
 * the same audio the export would have built, only already assembled. Delays
 * are absolute against the trimmed timeline, which is what lets the results of
 * several batches be laid on top of each other afterwards with nothing further
 * to line up.
 */
async function mixBatch(takes, outFile, { normalizeDub, signal, workDir }) {
  const args = [];
  const labels = [];

  takes.forEach((take, i) => {
    if (take.seek > 0) args.push('-ss', String(take.seek));
    args.push('-i', take.path);
  });

  const graph = takes.map((take, i) => {
    const chain = [`aresample=${SAMPLE_RATE}`];
    // Per take, for the same reason as in the export itself: run over a
    // finished mix, levelling lifts everything to one loudness and leaves the
    // difference between lines exactly as it was.
    if (normalizeDub) chain.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    if (take.volume !== 1) chain.push(`volume=${take.volume.toFixed(3)}`);
    if (take.delay > 0) chain.push(`adelay=${take.delay}:all=1`);
    labels.push(`t${i}`);
    return `[${i}:a]${chain.join(',')}[t${i}]`;
  });

  if (labels.length === 1) {
    graph.push(`[${labels[0]}]aformat=channel_layouts=stereo[mixed]`);
  } else {
    graph.push(`${labels.map((l) => `[${l}]`).join('')}`
      + `amix=inputs=${labels.length}:normalize=0:dropout_transition=0,`
      + 'aformat=channel_layouts=stereo[mixed]');
  }

  // The graph goes to a file here too. A batch is sized by its inputs, and
  // without this the graph would be the thing that put it over the limit.
  const graphName = `batch-${path.basename(outFile, '.wav')}.txt`;
  fs.writeFileSync(path.join(workDir, graphName), graph.join(';\n'), 'utf8');

  args.push(
    '-filter_complex_script', graphName,
    '-map', '[mixed]',
    // Kept lossless between passes so nothing is given away to compression on
    // the way to the real export.
    '-c:a', 'pcm_s16le', '-ar', String(SAMPLE_RATE), '-f', 'wav',
    '-y', outFile
  );

  await runFfmpeg(args, { cwd: workDir, signal });
}

/**
 * Reduces any number of takes to a single audio file.
 *
 * The export names every take on one command line, and Windows stops accepting
 * one at about 32,767 characters. A pack with enough lines went past that and
 * failed with nothing but "spawn ENAMETOOLONG", which says nothing about packs
 * or lines to whoever is reading it.
 *
 * Rather than capping the number of lines, the takes are mixed in batches and
 * the batches are then mixed together, as many rounds as it takes. Each round
 * divides the count by the batch size, so two rounds cover thousands of lines
 * and three cover more than anyone will record.
 *
 * The batch size is worked out from the actual paths rather than fixed, since
 * how much of the budget each take costs depends on how deep somebody's game
 * folder is.
 */
async function premixTakes(takes, { normalizeDub, signal, workDir, onStage }) {
  const longest = takes.reduce((n, t) => Math.max(n, t.path.length), 0);
  // Each input costs its path, the -i, quoting, and the odd -ss.
  const perTake = longest + 24;
  const batchSize = Math.max(2, Math.min(60, Math.floor(COMMAND_BUDGET / perTake)));

  let round = 0;
  let current = takes;

  while (current.length > 1) {
    const batches = [];
    for (let i = 0; i < current.length; i += batchSize) {
      batches.push(current.slice(i, i + batchSize));
    }

    if (onStage) onStage({ round: round + 1, batches: batches.length });

    const results = [];
    for (let i = 0; i < batches.length; i++) {
      const out = path.join(workDir, `premix-${round}-${i}.wav`);
      await mixBatch(batches[i], out, { normalizeDub, signal, workDir });
      // Everything after the first round is already levelled, positioned and
      // balanced, so later rounds only lay the results on top of each other.
      results.push({ path: out, seek: 0, delay: 0, volume: 1 });
    }

    current = results;
    normalizeDub = false;
    round++;

    // A single batch means this round produced the finished mix.
    if (batches.length === 1) break;
  }

  return current[0].path;
}

async function runExport(job, { onProgress, signal } = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvexport-'));

  // A killed ffmpeg never writes the moov atom, so an interrupted mp4 is
  // unplayable. Anything we created and did not finish gets cleaned up, but a
  // file that was already there is left alone.
  const existedBefore = fs.existsSync(job.outputPath);

  try {
    fs.mkdirSync(path.dirname(job.outputPath), { recursive: true });

    let ready = job;
    let built = buildArgs(ready, workDir);

    // Too many lines to name on one command line. The takes are mixed down
    // first and the export is handed the one file, which is the same audio by
    // a different route rather than a smaller version of the job.
    if (commandLength(built.args) > COMMAND_BUDGET) {
      const trimStart = job.options && job.options.trim ? Math.max(0, job.options.trim.start) : 0;
      const trimEnd = job.options && job.options.trim ? job.options.trim.end : null;
      const takes = planTakes(job.tracks, trimStart, trimEnd);

      if (takes.length > 1) {
        if (onProgress) onProgress({ stage: 'Preparing the dub', percent: null });
        const mixed = await premixTakes(takes, {
          normalizeDub: Boolean(job.options && job.options.normalizeDub),
          signal,
          workDir,
        });

        ready = {
          ...job,
          tracks: [{
            path: mixed,
            time: trimStart,
            offset: 0,
            // Long enough that the trim window never discards it. The real
            // length is whatever the file is; this only has to survive the
            // check that drops takes ending before the window starts.
            duration: Number.MAX_SAFE_INTEGER / 1000,
            volume: 1,
            enabled: true,
          }],
          // Already levelled, take by take, during the premix.
          options: { ...job.options, normalizeDub: false },
        };
        built = buildArgs(ready, workDir);
      }
    }

    const { args, duration } = built;
    await runFfmpeg(args, {
      cwd: workDir,
      signal,
      onProgress: (seconds) => {
        if (!onProgress) return;
        onProgress({
          seconds,
          duration,
          percent: duration ? Math.min(100, (seconds / duration) * 100) : null,
        });
      },
    });

    // Sidecar subtitles, for when you'd rather add captions in your editor.
    if (job.options && job.options.writeSrt && job.captions && job.captions.length) {
      const srtPath = job.outputPath.replace(/\.[^.]+$/, '') + '.srt';
      const trim = job.options.trim;
      const trimStart = trim ? trim.start : 0;
      const window = trim ? trim.end - trim.start : null;

      // Clipped the same way the burned-in captions are, so a single-line
      // export doesn't ship subtitles for the whole pack.
      const captions = job.captions
        .map((c) => ({ ...c, start: c.start - trimStart, end: c.end - trimStart }))
        .filter((c) => c.end > 0 && (window == null || c.start < window));

      fs.writeFileSync(srtPath, buildSrt(captions), 'utf8');
    }

    const stat = fs.statSync(job.outputPath);
    return { outputPath: job.outputPath, size: stat.size };
  } catch (err) {
    if (!existedBefore) {
      try { fs.unlinkSync(job.outputPath); } catch { /* never got created */ }
    }
    throw err;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { runExport, buildArgs, buildAss, buildSrt };
