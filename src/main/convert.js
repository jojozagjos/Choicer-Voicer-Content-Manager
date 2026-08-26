'use strict';

/**
 * Turns whatever someone drops in into what the game can actually load.
 *
 * The game is a Godot project, so its tolerance is narrow:
 *
 *   video   OGV (Theora) and nothing else
 *   audio   WAV, MP3, OGG
 *   images  PNG, JPG
 *
 * Dropping in an .mp4 is the single most common reason a pack silently does
 * nothing, and it is always fixable. Everything here converts by re-encoding
 * through ffmpeg, except when the file is already acceptable, in which case it
 * is copied so nothing is lost to a needless re-encode.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runFfmpeg, probeVideo, probeDuration, probeStereoWidth, probeAudioRms,
  probeStartTime, probeFirstFrameDecodes, probeKeyframesNear,
} = require('./ffmpeg');
const demucs = require('./demucs');

const OK_VIDEO = ['.ogv'];
const OK_AUDIO = ['.wav', '.mp3', '.ogg'];
// Everything the game or this app will treat as a clip's audio. Wider than
// OK_AUDIO, which is only what a pack may be written as.
const ALL_AUDIO = ['.wav', '.mp3', '.ogg', '.opus'];
const OK_IMAGE = ['.png', '.jpg', '.jpeg'];

// Theora quality runs 0-10. Seven keeps pack videos sharp without the file
// size running away, since these get shipped around as pack downloads.
const THEORA_QUALITY = 7;
const VORBIS_QUALITY = 4;

const extOf = (f) => path.extname(f).toLowerCase();

/**
 * A scratch path for a job to write into before it replaces the real file.
 *
 * Two details, both learned the hard way:
 *
 * The counter. These used to be named by process id alone, which is the same for
 * every job in the app, so two jobs working on one pack wrote to the same scratch
 * file and raced to rename it over the video. Reachable by ordinary use: start a
 * trim, leave the tab, come back and start another.
 *
 * The `.part` on the end. These used to keep the real extension, so an
 * interrupted conversion left something named like `dub_video.ogv.1234.part.ogv`
 * sitting in the pack folder, which is exactly the half-file in a pack folder
 * that writing to a scratch name is supposed to prevent. Ending in `.part`
 * instead means nothing can read it as media whatever happens. Every caller
 * passes ffmpeg an explicit `-f`, so the extension is not carrying any meaning.
 */
let partialSeq = 0;
function partialPath(target, tag, ext) {
  return `${target}.${process.pid}.${++partialSeq}.${tag}-${ext}.part`;
}

function uniquePath(target) {
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(target);
  const stem = target.slice(0, target.length - ext.length);
  for (let n = 2; n < 500; n++) {
    const candidate = `${stem}_${n}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  return target;
}

/** What kind of media a file is, by extension. */
function kindOf(file) {
  const ext = extOf(file);
  if (OK_VIDEO.includes(ext) || ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.wmv', '.flv'].includes(ext)) {
    return 'video';
  }
  if (OK_AUDIO.includes(ext) || ['.m4a', '.aac', '.flac', '.wma', '.aiff', '.aif', '.opus'].includes(ext)) {
    return 'audio';
  }
  if (OK_IMAGE.includes(ext) || ['.webp', '.bmp', '.gif', '.tif', '.tiff'].includes(ext)) return 'image';
  return null;
}

/** Whether the game could already load this file as-is. */
function isAcceptable(file, kind) {
  const ext = extOf(file);
  if (kind === 'video') return OK_VIDEO.includes(ext);
  if (kind === 'audio') return OK_AUDIO.includes(ext);
  if (kind === 'image') return OK_IMAGE.includes(ext);
  return false;
}

/**
 * Converts (or copies) `source` into `destDir` under `baseName`.
 *
 * `kind` forces the treatment; otherwise it is worked out from the extension.
 * `maxSeconds` trims over-long audio, which dub clips need since the game caps
 * them at six seconds.
 */
async function convertInto(source, destDir, baseName, options = {}) {
  const {
    kind = kindOf(source),
    audioFormat = 'wav',
    maxSeconds = null,
    overwrite = false,
    onProgress,
    signal,
    // Set by callers that know the picture is of a character but whose file is
    // not named for one, which is every clip picture: those are named after the
    // clip, so there is no pattern to recognise them by.
    characterImage = false,
  } = options;

  if (!kind) throw new Error(`Not a media file this app understands: ${path.basename(source)}`);
  if (!fs.existsSync(source)) throw new Error(`${path.basename(source)} no longer exists`);

  fs.mkdirSync(destDir, { recursive: true });

  const targetExt = kind === 'video' ? '.ogv'
    : kind === 'audio' ? `.${audioFormat}`
      : '.png';

  let target = path.join(destDir, `${baseName}${targetExt}`);
  if (!overwrite) target = uniquePath(target);

  const duration = kind === 'video' || kind === 'audio' ? probeDuration(source) : null;
  const needsTrim = maxSeconds != null && duration != null && duration > maxSeconds + 0.01;

  // A picture of a person that is larger than the game draws one at has to go
  // through ffmpeg to be brought down, even though its format is already fine.
  const wantsPortrait = characterImage || isCharacterImage(baseName);
  const oversized = kind === 'image' && wantsPortrait
    && isBiggerThan(source, CHARACTER_IMAGE_BOX);

  // Already in a format the game reads, nothing to trim: a plain copy keeps
  // the original quality rather than generation-losing it through a re-encode.
  if (isAcceptable(source, kind) && !needsTrim && !oversized && extOf(source) === targetExt) {
    fs.copyFileSync(source, target);
    return { path: target, converted: false, trimmed: false, duration };
  }

  const args = ['-i', source];
  if (needsTrim) args.push('-t', String(maxSeconds));

  if (kind === 'video') {
    args.push(
      '-c:v', 'libtheora', '-q:v', String(THEORA_QUALITY),
      '-c:a', 'libvorbis', '-q:a', String(VORBIS_QUALITY),
      '-f', 'ogv'
    );
  } else if (kind === 'audio') {
    args.push('-vn');
    if (audioFormat === 'wav') args.push('-c:a', 'pcm_s16le', '-ar', '48000', '-f', 'wav');
    else if (audioFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3');
    else args.push('-c:a', 'libvorbis', '-q:a', '5', '-f', 'ogg');
  } else {
    // A picture of a person is brought down to about the size the game draws
    // one at. Only these: a menu background or an overlay is meant to be large,
    // and shrinking those would ruin them.
    if (wantsPortrait) {
      const box = CHARACTER_IMAGE_BOX;
      // force_original_aspect_ratio=decrease fits inside the box without
      // stretching, and the min() pair stops a small picture being blown up to
      // meet it.
      args.push('-vf',
        `scale=w='min(${box.width},iw)':h='min(${box.height},ih)'`
        + ':force_original_aspect_ratio=decrease:flags=lanczos');
    }
    // One frame, and drop any alpha-less weirdness the source might carry.
    args.push('-frames:v', '1', '-f', 'image2', '-c:v', 'png');
  }

  // Written to a temp name first so a failure cannot leave a half-file in a
  // pack folder, where the game would try to load it.
  const partial = partialPath(target, 'part', targetExt.replace(/^\./, ''));
  args.push('-y', partial);

  try {
    await runFfmpeg(args, {
      signal,
      onProgress: (seconds) => {
        if (onProgress && duration) onProgress({ percent: Math.min(100, (seconds / duration) * 100) });
      },
    });
    fs.renameSync(partial, target);
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { /* never created */ }
    throw err;
  }

  // Replacing a slot's sound means replacing it, whatever format it was in. A
  // slot holding menu.ogg and given a .wav would otherwise keep both, and which
  // one the game picks is not something the person choosing it decided.
  const replaced = overwrite && kind === 'audio'
    ? dropOtherAudio(destDir, baseName, target)
    : [];

  return {
    path: target,
    converted: true,
    trimmed: needsTrim,
    duration: needsTrim ? maxSeconds : duration,
    replaced,
  };
}

// The files a pack uses for music rather than for a sound effect. Minutes long,
// where everything else here is a click or a line.
const MUSIC_BASES = ['music_menu', 'music_studio'];

// Pictures of a person, which the game stands on screen at roughly the size of
// its own cardboard cutout. A photo straight from a phone or a render out of an
// art program is several times that, which the game then draws at full size.
// Clip pictures are in here too: they are portraits of whoever is speaking and
// belong at the same size as the rest.
const CHARACTER_IMAGE_BASES = [/^player$/i, /^host$/i, /^judge[1-5]$/i];

// The cutout the game itself uses is 500x1000. Fitting inside a box this size
// keeps a character in proportion with the rest without being exact about it,
// and anything already smaller is left alone rather than blown up.
const CHARACTER_IMAGE_BOX = { width: 500, height: 1000 };

function isCharacterImage(baseName) {
  return CHARACTER_IMAGE_BASES.some((pattern) => pattern.test(String(baseName)));
}

/** Whether a picture is larger than the box, in either direction. */
function isBiggerThan(file, box) {
  const probed = probeVideo(file);
  if (!probed || !probed.width || !probed.height) return false;
  return probed.width > box.width || probed.height > box.height;
}

/**
 * What format a piece of audio should be stored as, decided by where it is
 * going rather than by which part of the app is putting it there.
 *
 * WAV is right for a button click: it decodes instantly and costs nothing at a
 * few kilobytes. It is wrong for a music loop, where the same choice turned a
 * nine minute track into a 105 MB file. Keying this on the destination name
 * means a file reaches the right format whether it arrived through the slot that
 * names it, a drop onto the pack, or a folder dragged in whole.
 */
function audioFormatFor(baseName, asked) {
  if (MUSIC_BASES.includes(String(baseName).toLowerCase())) return 'ogg';
  return asked || 'wav';
}

/**
 * Converts several files into a pack folder, reporting each result. One bad
 * file does not stop the rest, since dropping in a folder of mixed content is
 * the normal case.
 */
async function convertMany(sources, destDir, options = {}) {
  const results = [];
  for (const source of sources) {
    const base = options.baseName || path.basename(source, path.extname(source));
    try {
      const result = await convertInto(source, destDir, base, {
        ...options,
        audioFormat: audioFormatFor(base, options.audioFormat),
      });
      results.push({ ok: true, source, ...result });
    } catch (err) {
      results.push({ ok: false, source, error: err.message });
    }
    if (options.onFile) options.onFile(results[results.length - 1], results.length, sources.length);
  }
  return results;
}

/**
 * Pulls a slice of audio out of a video (or another audio file) and writes it
 * as a clip. This is what makes a dub pack buildable without ever opening an
 * audio editor: mark a range against the video and the clip falls out of it.
 */
async function extractAudioRange(source, destDir, baseName, start, duration, options = {}) {
  const { audioFormat = 'wav', overwrite = false, signal } = options;

  fs.mkdirSync(destDir, { recursive: true });

  // Recutting a clip keeps whatever format it was already stored as, rather than
  // always writing .wav. A pack shipped with .ogg clips stays a pack of .ogg
  // clips, and the file being replaced is the one that was already there instead
  // of a second file appearing beside it.
  const format = overwrite
    ? (existingAudioFormat(destDir, baseName) || audioFormat)
    : audioFormat;

  let target = path.join(destDir, `${baseName}.${format}`);
  if (!overwrite) target = uniquePath(target);

  const partial = partialPath(target, 'part', format);

  // -ss before -i seeks quickly; -t after it bounds the copy. The codec follows
  // the format actually being written, not the one that was asked for, or a
  // clip kept as .ogg would be handed PCM.
  const args = ['-ss', String(Math.max(0, start)), '-i', source, '-t', String(Math.max(0.05, duration)), '-vn'];
  if (format === 'wav') args.push('-c:a', 'pcm_s16le', '-ar', '48000', '-f', 'wav');
  else if (format === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3');
  else if (format === 'opus') args.push('-c:a', 'libopus', '-b:a', '128k', '-f', 'opus');
  else args.push('-c:a', 'libvorbis', '-q:a', '5', '-f', 'ogg');
  args.push('-y', partial);

  try {
    await runFfmpeg(args, { signal });
    fs.renameSync(partial, target);
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { /* never created */ }
    throw err;
  }

  // Replacing a clip's audio means replacing it, whatever it was stored as.
  // Cutting always writes .wav, so a clip that arrived as .ogg or .mp3 used to
  // end up holding both: the old file and the new one, under the same name. The
  // app then showed one of them and the game found the other, so a line that had
  // been retimed played twice.
  const replaced = overwrite ? dropOtherAudio(destDir, baseName, target) : [];

  return { path: target, start, duration, replaced };
}

/**
 * Removes a clip's audio in any format other than the one just written.
 *
 * Only ever touches files named exactly for this clip, and never the file it was
 * told to keep.
 */
function dropOtherAudio(dir, baseName, keepPath) {
  const keep = path.resolve(keepPath);
  const wanted = baseName.toLowerCase();
  const gone = [];

  // The folder is read rather than the names guessed, so an extension in a
  // different case is caught too.
  for (const name of fs.readdirSync(dir)) {
    if (!ALL_AUDIO.includes(extOf(name))) continue;
    if (path.basename(name, path.extname(name)).toLowerCase() !== wanted) continue;
    const full = path.join(dir, name);
    if (path.resolve(full) === keep) continue;
    try {
      fs.unlinkSync(full);
      gone.push(name);
    } catch { /* still open, or already gone */ }
  }
  return gone;
}

/** The audio a clip might already be stored as, given the same clip's name. */
function existingAudioFormat(dir, baseName) {
  const wanted = baseName.toLowerCase();
  let found = null;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!ALL_AUDIO.includes(extOf(name))) continue;
      if (path.basename(name, path.extname(name)).toLowerCase() !== wanted) continue;
      const ext = extOf(name).slice(1);
      // A .wav beside another format is the one this app wrote, so it does not
      // get to decide the format; the other one is what the pack came with.
      if (!found || found === 'wav') found = ext;
    }
  } catch { /* no folder yet */ }
  return found;
}

/**
 * Builds a backing track by quietening the original audio wherever a clip
 * speaks.
 *
 * Properly separating a voice from music needs a trained model, which is far
 * too heavy to bundle. This gets most of the way there without one, because a
 * dub pack already knows exactly when every line happens: take the video's own
 * audio and duck it across those ranges. Music and room tone between lines
 * survive untouched, which is the part that makes a dub feel right.
 *
 * It cannot recover music that was underneath a voice, so a scene with
 * continuous scoring dips during dialogue. `level` sets how far: 0 silences
 * the speech entirely, higher values leave a bed of the original under it.
 */
async function buildBackingTrack(videoPath, ranges, destDir, options = {}) {
  const {
    mode = 'muffle',      // 'muffle' keeps the music, 'silence' removes everything
    level = null,         // overrides the mode's own attenuation
    // How hard to press on the voices, 0 to 1. There is no setting here that
    // is right for every pack: how well any of this works depends on how the
    // scene was mixed, which is why it is offered rather than decided.
    strength = 0.5,
    // Builds a short sample instead of the whole track, for listening to
    // before committing several minutes to a setting.
    sampleFrom = null,
    sampleFor = 0,
    fade = 0.08,          // seconds of ramp, so the duck does not click
    audioFormat = 'wav',
    baseName = '_backing_track',
    signal,
    onProgress,
    aiRoot,
  } = options;

  if (!ranges || !ranges.length) throw new Error('This pack has no clips to work from');

  fs.mkdirSync(destDir, { recursive: true });
  const target = path.join(destDir, `${baseName}.${audioFormat}`);
  const partial = partialPath(target, 'part', audioFormat);

  if (mode === 'ai') {
    return buildAiBackingTrack(videoPath, ranges, target, partial, {
      audioFormat, sampleFrom, sampleFor, signal, onProgress, aiRoot,
    });
  }

  // One enable window per line, widened slightly so the ramp sits outside the
  // speech rather than clipping its first syllable.
  const windows = ranges
    .filter((r) => Number.isFinite(r.start) && r.duration > 0)
    .sort((a, b) => a.start - b.start)
    .map((r) => {
      const from = Math.max(0, r.start - fade);
      const to = r.start + r.duration + fade;
      return `between(t,${from.toFixed(3)},${to.toFixed(3)})`;
    });

  // Every range was unusable, which is not the same as none being given and is
  // caught separately from it. An empty condition below builds `enable=''`,
  // which ffmpeg refuses with a parse error rather than anything that points
  // at the pack, and the check above only looks at how many ranges arrived
  // rather than how many survived being read.
  if (!windows.length) {
    throw new Error('None of this pack\'s lines have a usable time and length, so there is '
      + 'nothing to quieten the audio under.');
  }

  const when = windows.join('+');

  // How the muffle got here, because two earlier versions of it were wrong in
  // ways that are not obvious from the result.
  //
  // It began as a lowpass at 600 Hz plus a global drop to 0.15. That removed
  // the music, since music is mostly above 600 Hz.
  //
  // It then became a band cut across 300 Hz to 3.4 kHz, on the reasoning that
  // speech is intelligible almost entirely inside that band. Better, and still
  // wrong twice over. Consonants live at 4 to 8 kHz, and that version
  // deliberately kept everything above 4 kHz as "air", so it preserved the
  // sibilance that makes speech followable. And a wide peaking filter at -38 dB
  // has shallow skirts, so it pulled the whole scene down by 15 dB rather than
  // cutting a band out of it. Voice and music dropped together, which changes
  // nothing about how audible the voice is over the music.
  //
  // That last point is the one that matters and the one both earlier versions
  // missed. What counts is not how far the voice drops. It is how much further
  // the voice drops than the music, because anyone who has lost 15 dB of music
  // simply turns the music up, and brings the voice back with it.
  //
  // Measured by running each chain over a real dialogue clip panned centre and
  // over a stretch of the same pack with nobody speaking, separately, which is
  // valid because these filters are linear. In dB:
  //
  //                          voice   music    gap
  //   Popped the AI Bubble
  //     lowpass 600          -23.5   -17.7   +5.7
  //     300-3400 band cut    -33.2   -17.5  +15.7
  //     centre + scoop       -25.1    -7.0  +18.1
  //   Caine's Crashout
  //     lowpass 600          -21.7   -16.7   +5.0
  //     300-3400 band cut    -21.9    -5.8  +16.0
  //     centre + scoop       -15.7    -0.6  +15.1
  //
  // Centre cancellation wins because it is the only one of the three aimed at
  // the voice rather than at a frequency range the voice happens to use.
  // Dialogue is mixed dead centre in almost everything, so subtracting one
  // channel from the other removes it and leaves the music that was spread
  // around it. Bass is taken from the original, because it is usually centred
  // too and is wanted.
  //
  // It only works on a file that is genuinely stereo. A third of the pack
  // videos measured are the same signal in both channels, where the
  // subtraction leaves silence, so the file is asked first and the band cut is
  // used when the answer is no.
  // How wide a file has to be before cancelling its centre is worth doing.
  //
  // This was -20 dB, which let through a file measuring -19.8: nearly mono,
  // almost nothing in the side signal to keep, and the cancellation took about
  // 7 dB off the voice where a genuinely wide file gets 17. It looked like the
  // muffle had stopped working, and from where anybody was sitting it had.
  // -12 dB is comfortably inside real stereo and comfortably outside that.
  const spread = mode === 'silence' ? null : probeStereoWidth(videoPath);
  const wideEnough = spread != null && spread > -12;

  const CENTRE = 'asplit=2[lo][sd];'
    + '[lo]lowpass=f=200:poles=2[l];'
    + '[sd]pan=stereo|c0=0.5*c0-0.5*c1|c1=0.5*c1-0.5*c0,highpass=f=200:poles=2[s];'
    + '[l][s]amix=inputs=2:normalize=0,'
    // Whatever voice was not perfectly centred, scooped without touching the
    // bass or the top.
    + 'equalizer=f=1800:t=h:width=3000:g=-9';

  // The band cut, for a file with no stereo to work with, and as a second pass
  // on one that has.
  //
  // The lower edge was 220 Hz, to protect the bass a track is built on. That
  // is also where a deep voice keeps its fundamental, so on a pack with a low
  // male lead it was protecting the very thing it was aimed at: the words came
  // down 8 dB where a higher voice came down 25. Measured across three packs,
  // moving the edge to 90 Hz roughly doubles the separation and costs a few dB
  // of music. Sub-bass below 90 Hz, which is most of what a listener registers
  // as weight, is still untouched.
  const band = (mid, top) => 'asplit=3[blo][bmd][bhi];'
    + '[blo]lowpass=f=90:poles=2[bl];'
    + `[bmd]highpass=f=90:poles=2,lowpass=f=7000:poles=2,volume=${mid.toFixed(3)}[bm];`
    + `[bhi]highpass=f=7000:poles=2,volume=${top.toFixed(3)}[bh];`
    + '[bl][bm][bh]amix=inputs=3:normalize=0';

  // How hard to press, 0 to 1.
  //
  // Two things move together, because moving only the middle band ran out of
  // effect halfway along: once that band is crushed, what is still audible of
  // the voice is its consonants above 7 kHz, and no amount of further crushing
  // underneath them changes that. So the top comes down as well, and the whole
  // length of the slider does something.
  //
  // Both are curves rather than straight lines. The audible step from 0.30 to
  // 0.25 is small and the step from 0.05 to 0.03 is not, so an even mapping
  // feels dead at one end and twitchy at the other.
  const press = Math.min(1, Math.max(0, strength == null ? 0.5 : strength));
  const midGain = 0.30 * (0.03 / 0.30) ** press;
  const topGain = 0.90 * (0.30 / 0.90) ** press;

  // Centre cancellation first where the file allows it, because it is aimed at
  // the voice rather than at a frequency range, then the band cut over the top
  // for whatever it left behind. On a wide file the two together separate by
  // about 27 dB where either alone manages 17.
  const technique = wideEnough ? 'centre' : 'band';
  const suppress = wideEnough
    ? `${CENTRE},${band(midGain, topGain)}`
    : band(midGain, topGain);

  // A gentle overall duck on top, so the dub is unambiguously in front. This
  // is the part that used to be 0.15, which is where most of the music went.
  const gain = level != null ? level : (mode === 'silence' ? 0 : 0.85);

  // Silencing is one filter and needs no graph.
  //
  // Muffling does, because neither `pan` nor `amix` can be switched on and off
  // over time the way `volume` can. So the original and the suppressed version
  // are both built, and `volume` gates pick between them: the original is
  // silenced across the spoken windows and the suppressed copy is silenced
  // everywhere else. Summing the two gives the original outside a line and the
  // treated version inside it.
  const graph = mode === 'silence'
    ? `volume=${gain}:enable='${when}'`
    : `asplit=2[dry][wet];`
      + `[dry]volume=0:enable='${when}'[drygate];`
      + `[wet]${suppress},volume=${gain},volume=0:enable='not(${when})'[wetgate];`
      + '[drygate][wetgate]amix=inputs=2:normalize=0';

  const duration = probeDuration(videoPath);

  // A sample is cut out of the middle rather than built from the start, and
  // seeking happens after the input is opened rather than before it. The
  // windows above are absolute times in the video, and an input-side seek
  // would move the audio underneath them while leaving them where they were,
  // so the sample would duck a second or two away from the line it was
  // supposed to be demonstrating.
  const sampling = Number.isFinite(sampleFrom) && sampleFor > 0;
  const args = [
    '-i', videoPath,
    '-vn',
    '-filter_complex', graph,
  ];
  if (sampling) args.push('-ss', String(Math.max(0, sampleFrom)), '-t', String(sampleFor));
  if (audioFormat === 'wav') args.push('-c:a', 'pcm_s16le', '-ar', '48000', '-f', 'wav');
  else if (audioFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3');
  else args.push('-c:a', 'libvorbis', '-q:a', '5', '-f', 'ogg');
  args.push('-y', partial);

  try {
    await runFfmpeg(args, {
      signal,
      onProgress: (seconds) => {
        if (onProgress && duration) onProgress({ percent: Math.min(100, (seconds / duration) * 100) });
      },
    });
    await replaceFile(partial, target);
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { /* never created */ }
    throw err;
  }

  return {
    path: target,
    ducked: windows.length,
    mode,
    gain,
    technique,
    spread,
    strength: press,
    sample: sampling,
  };
}

async function buildAiBackingTrack(videoPath, ranges, target, partial, options) {
  const {
    audioFormat, sampleFrom, sampleFor, signal, onProgress, aiRoot,
  } = options;
  if (!aiRoot) throw new Error('The AI separator has no storage folder');

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'choicer-voicer-ai-'));
  const input = path.join(scratch, 'input.wav');
  const stems = path.join(scratch, 'stems');
  const sampling = Number.isFinite(sampleFrom) && sampleFor > 0;
  const duration = sampling ? sampleFor : probeDuration(videoPath);
  let lastPercent = -1;
  const report = (percent) => {
    const next = Math.max(lastPercent, Math.min(100, percent));
    if (onProgress && next > lastPercent) onProgress({ percent: next });
    lastPercent = next;
  };

  try {
    report(1);
    const extractArgs = [];
    if (sampling) extractArgs.push('-ss', String(Math.max(0, sampleFrom)), '-t', String(sampleFor));
    extractArgs.push(
      '-i', videoPath, '-vn', '-ac', '2', '-ar', '44100',
      '-c:a', 'pcm_f32le', '-f', 'wav', '-y', input
    );
    await runFfmpeg(extractArgs, { signal });
    report(5);

    const binary = await demucs.ensureBinary(aiRoot, {
      signal,
      onProgress: ({ percent }) => report(5 + percent * 0.07),
      onStage: ({ percent }) => report(percent),
    });
    await demucs.verifyModel();
    await demucs.separate(binary, input, stems, {
      signal,
      onStage: ({ percent }) => report(percent),
    });
    await demucs.verifyModel();

    const files = ['drums.wav', 'bass.wav', 'other.wav', 'vocals.wav']
      .map((name) => path.join(stems, name));
    if (files.some((file) => !fs.existsSync(file))) {
      throw new Error('The AI separator did not produce all four audio stems. Use Muffle on this computer.');
    }

    const inputRms = probeAudioRms(input);
    const loudestStem = Math.max(...files.map((file) => probeAudioRms(file) ?? -120));
    if (inputRms != null && inputRms > -70 && loudestStem < inputRms - 30) {
      throw new Error('The AI separator returned silent audio on this graphics hardware. Use Muffle instead.');
    }

    const args = [
      '-i', files[0], '-i', files[1], '-i', files[2],
      '-filter_complex', '[0:a][1:a][2:a]amix=inputs=3:normalize=0,alimiter=limit=0.98:level=0[out]',
      '-map', '[out]',
    ];
    if (audioFormat === 'wav') args.push('-c:a', 'pcm_s16le', '-ar', '48000', '-f', 'wav');
    else if (audioFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3');
    else args.push('-c:a', 'libvorbis', '-q:a', '5', '-f', 'ogg');
    args.push('-y', partial);

    await runFfmpeg(args, {
      signal,
      onProgress: (seconds) => {
        if (duration) report(90 + Math.min(10, (seconds / duration) * 10));
      },
    });
    await replaceFile(partial, target);
    report(100);

    return {
      path: target,
      ducked: ranges.length,
      mode: 'ai',
      gain: 1,
      technique: 'ai',
      spread: null,
      strength: null,
      sample: sampling,
    };
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { }
    throw err;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Trims a pack's video down to `start`..`end`, keeping the original aside so
 * the trim can be undone.
 *
 * Everything in a dub pack is timed against the video, so cutting seconds off
 * the front shifts every clip. The caller gets `shift` back and is expected to
 * move the clips by it; doing that here would mean this function knowing about
 * pack metadata, which it otherwise does not.
 */
async function trimVideo(source, start, end, backupPath, options = {}) {
  const { signal, onProgress } = options;

  // A video with no readable duration is not a video this can work from, and
  // saying so plainly matters: the most likely reason is that the file itself is
  // damaged, and "could not read how long it is" sent people looking for a
  // problem with the trim instead of with the video.
  const duration = probeDuration(source);
  if (!duration) {
    throw new Error(
      "This pack's video cannot be read, so there is nothing to trim from. "
      + 'The file looks damaged. Undo will put the previous one back if the trim '
      + 'that made it is still in this editor session; otherwise replace '
      + `${path.basename(source)} in the pack folder.`
    );
  }

  const from = Math.max(0, Math.min(start, duration));
  const to = Math.min(end == null ? duration : end, duration);
  const length = to - from;

  if (length < 0.5) throw new Error('That would leave less than half a second of video');
  if (from <= 0.001 && to >= duration - 0.001) throw new Error('That is the whole video already');

  const partial = partialPath(source, 'trim', 'ogv');

  // Copying the picture is worth a lot of trouble to get right. Re-encoding
  // Theora runs at about half real time on 1080p, so trimming a four minute
  // video took six and a half minutes, and nobody is going to sit through that
  // to shave a few seconds off the front. Copying the same packets takes about
  // two seconds. See fastTrim for what it costs.
  let cut = null;
  const snapped = snapToKeyframe(source, from);
  if (snapped != null) {
    const tried = await fastTrim(source, snapped, to, partial, { signal, onProgress });
    // A copy that does not come out right is not a failure, just a sign that this
    // video needs the slow path.
    if (tried && isGoodTrim(partial, tried.to - tried.from)) cut = tried;
    else if (tried) { try { fs.unlinkSync(partial); } catch { /* already gone */ } }
  }

  // Either there was no keyframe close enough to cut on, or the copy came out
  // wrong and was thrown away. Re-encoding always works, and is what this did
  // in every case before.
  if (!cut) {
    await runFfmpeg([
      '-ss', String(from),
      '-i', source,
      '-t', String(length),
      '-c:v', 'libtheora', '-q:v', String(THEORA_QUALITY),
      '-c:a', 'libvorbis', '-q:a', String(VORBIS_QUALITY),
      '-f', 'ogv', '-y', partial,
    ], {
      signal,
      onProgress: (seconds) => {
        if (onProgress && length) onProgress({ percent: Math.min(100, (seconds / length) * 100) });
      },
    }).catch((err) => {
      try { fs.unlinkSync(partial); } catch { /* never created */ }
      throw err;
    });

    // Checked as closely as the copy is. A trim that writes a video the game
    // cannot read is worse than one that fails outright, because it takes the
    // original's place and only shows up the next time somebody opens the pack.
    // Not hypothetical: two trims once shared a scratch path and left a pack
    // holding two encodes spliced together, which ffprobe cannot read at all.
    if (!isGoodTrim(partial, length)) {
      try { fs.unlinkSync(partial); } catch { /* already gone */ }
      throw new Error(
        'The trim produced a video that could not be read back, so the original '
        + 'has been left exactly as it was.'
      );
    }
    cut = { from, to, method: 'encode' };
  }

  // The original moves out of the pack before the trim takes its place, so a
  // failure at any point leaves either the old video or the new one, never
  // neither.
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.renameSync(source, backupPath);
  fs.renameSync(partial, source);

  return {
    path: source,
    backup: backupPath,
    from: cut.from,
    to: cut.to,
    // How far every clip has to move to stay in sync with the picture. Taken
    // from where the cut actually landed, not where it was asked for, so a cut
    // nudged back to a keyframe still leaves every line against the right frame.
    shift: -cut.from,
    method: cut.method,
    wasSeconds: duration,
    nowSeconds: cut.to - cut.from,
  };
}

// How far back a cut may be nudged to land on a keyframe. Pack videos here have
// keyframes about every 0.4s, so this is never reached in practice; it exists so
// a video with sparse keyframes re-encodes rather than silently keeping seconds
// the person asked to remove.
const SNAP_LIMIT = 0.5;

/**
 * The latest keyframe at or before `time`, if one is close enough to cut on.
 *
 * At or before rather than nearest, so the trim never removes a moment somebody
 * wanted to keep. Erring the other way keeps a fraction of a second they wanted
 * gone, which is the kinder mistake.
 */
function snapToKeyframe(source, time) {
  if (time <= 0.001) return 0; // the start of the file is always a keyframe

  let times;
  try {
    times = probeKeyframesNear(source, time);
  } catch {
    return null; // no keyframe list, so no fast path
  }

  let best = null;
  for (const candidate of times) {
    if (candidate <= time + 0.001 && (best == null || candidate > best)) best = candidate;
  }
  if (best == null || time - best > SNAP_LIMIT) return null;
  return best;
}

/**
 * Trims by copying the video packets instead of re-encoding them.
 *
 * Two things make this work, and both are easy to get wrong:
 *
 * - The cut has to start on a keyframe. A copy that starts mid-GOP has nothing
 *   to decode the opening frames against.
 * - `-avoid_negative_ts make_zero` is not optional. Ogg carries Theora timing in
 *   a granulepos that encodes the distance back to the last keyframe, and a
 *   plain copy hands the muxer values it cannot rebase. Without the flag the
 *   result comes out with a start time around 9.6e15 seconds and will not play
 *   at all, which is why this used to re-encode unconditionally.
 *
 * The audio is re-encoded even though it could be copied. It is a small part of
 * the cost, and re-encoding it is what pulls the output back to starting at
 * zero: copied Vorbis drags a lead-in with it and everything in the pack is
 * timed from the first frame.
 *
 * Returns null rather than throwing if ffmpeg refuses, so the caller re-encodes.
 * Whether what it wrote is fit to keep is the caller's judgement, made with the
 * same check the slow path answers to. A fast path that goes wrong should cost
 * time, not a pack.
 */
async function fastTrim(source, from, to, partial, { signal, onProgress } = {}) {
  const length = to - from;
  if (onProgress) onProgress({ percent: 0 });

  try {
    await runFfmpeg([
      '-ss', String(from),
      '-i', source,
      '-t', String(length),
      '-c:v', 'copy',
      '-c:a', 'libvorbis', '-q:a', String(VORBIS_QUALITY),
      '-avoid_negative_ts', 'make_zero',
      '-f', 'ogv', '-y', partial,
    ], { signal });
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { /* never created */ }
    if (err.cancelled) throw err; // a cancel is not a reason to try again slowly
    return null;
  }

  if (onProgress) onProgress({ percent: 100 });
  return { from, to, method: 'copy' };
}

/**
 * Whether a copied trim is fit to keep.
 *
 * Checked rather than assumed because the failure this guards against is not a
 * non-zero exit code: ffmpeg writes the file happily and the damage only shows
 * up in the timestamps, or later in the game, where it is far more expensive to
 * discover.
 */
function isGoodTrim(file, wantLength) {
  const probed = probeVideo(file);
  if (!probed.duration) return false;
  if (Math.abs(probed.duration - wantLength) > 0.5) return false;

  // A start time of anything but the first frame means every clip in the pack
  // would sit that far out from the picture.
  const start = probeStartTime(file);
  if (start == null) return false;
  if (start > 1.5 / (probed.fps || 30)) return false;

  return probeFirstFrameDecodes(file);
}

/**
 * Moves a freshly written file over the one it replaces.
 *
 * Windows refuses to replace a file while anything still holds it open, and
 * the app itself is the likely holder: the editor keeps an audio element
 * pointed at a pack's backing track so it can play it. The renderer lets go
 * before asking for a rebuild, but a handle can linger for a moment after
 * that, and something else entirely could be holding it. So this retries
 * briefly rather than failing on the first attempt, and only gives up once it
 * is clear the file is genuinely locked.
 */
async function replaceFile(from, to) {
  const LOCKED = new Set(['EPERM', 'EACCES', 'EBUSY']);
  let lastErr = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      lastErr = err;
      if (!LOCKED.has(err.code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  // Copying into the existing file writes through the handle that is open on
  // it, which Windows does allow, where swapping the directory entry is not.
  try {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
    return;
  } catch { /* fall through to the original failure, which is more useful */ }

  throw new Error(
    `Could not replace ${path.basename(to)}: it is open in another program. `
    + `Close whatever is playing it and try again. (${lastErr && lastErr.code})`
  );
}

/** Details useful for showing what will happen before committing to it. */
function describe(source) {
  const kind = kindOf(source);
  if (!kind) return { kind: null, acceptable: false };

  const acceptable = isAcceptable(source, kind);
  const info = { kind, acceptable, name: path.basename(source) };

  if (kind === 'video') {
    try {
      const video = probeVideo(source);
      Object.assign(info, { width: video.width, height: video.height, duration: video.duration });
    } catch { /* unreadable, the convert step will report it properly */ }
  } else if (kind === 'audio') {
    info.duration = probeDuration(source);
  }
  return info;
}

module.exports = {
  convertInto,
  convertMany,
  extractAudioRange,
  buildBackingTrack,
  trimVideo,
  describe,
  kindOf,
  isAcceptable,
  OK_VIDEO,
  OK_AUDIO,
  OK_IMAGE,
};
