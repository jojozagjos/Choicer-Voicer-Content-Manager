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

  const events = captions
    .filter((c) => c.text && c.end > c.start)
    .map((c) => {
      const speaker = style.showSpeaker !== false && c.character
        ? `{\\c${speakerColour}}${assEscape(c.character)}:{\\c${primary}} `
        : '';
      return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${speaker}${assEscape(c.text)}`;
    });

  return `${header.join('\n')}\n${events.join('\n')}\n`;
}

function buildSrt(captions) {
  return captions
    .filter((c) => c.text && c.end > c.start)
    .map((c, i) => {
      const speaker = c.character ? `${c.character}: ` : '';
      return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${speaker}${c.text}\n`;
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
  for (const track of tracks) {
    if (!track.path || track.enabled === false) continue;
    const start = (track.time || 0) + (track.offset || 0);
    const end = start + (track.duration || 0);
    if (trimEnd != null && start >= trimEnd) continue;
    if (end > 0 && end <= trimStart) continue;

    const seek = Math.max(0, trimStart - start);
    if (seek > 0) args.push('-ss', String(seek));
    args.push('-i', track.path);
    placements.push({
      index: inputs.length,
      delay: Math.max(0, Math.round((start - trimStart) * 1000)),
      volume: track.volume == null ? 1 : track.volume,
    });
    inputs.push('take');
  }

  // Audio graph
  const filters = [];
  const mixLabels = [];

  placements.forEach((p, i) => {
    const label = `dub${i}`;
    const chain = [`aresample=${SAMPLE_RATE}`];
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
    // Single-pass loudnorm: evens out takes recorded at wildly different levels.
    if (normalizeDub) post.push('loudnorm=I=-16:TP=-1.5:LRA=11');
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

  if (filters.length) args.push('-filter_complex', filters.join(';'));

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
async function runExport(job, { onProgress, signal } = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvexport-'));

  // A killed ffmpeg never writes the moov atom, so an interrupted mp4 is
  // unplayable. Anything we created and did not finish gets cleaned up, but a
  // file that was already there is left alone.
  const existedBefore = fs.existsSync(job.outputPath);

  try {
    fs.mkdirSync(path.dirname(job.outputPath), { recursive: true });

    const { args, duration } = buildArgs(job, workDir);
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
