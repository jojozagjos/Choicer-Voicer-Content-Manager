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
const path = require('path');
const { runFfmpeg, probeVideo, probeDuration } = require('./ffmpeg');

const OK_VIDEO = ['.ogv'];
const OK_AUDIO = ['.wav', '.mp3', '.ogg'];
const OK_IMAGE = ['.png', '.jpg', '.jpeg'];

// Theora quality runs 0-10. Seven keeps pack videos sharp without the file
// size running away, since these get shipped around as pack downloads.
const THEORA_QUALITY = 7;
const VORBIS_QUALITY = 4;

const extOf = (f) => path.extname(f).toLowerCase();

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

  // Already in a format the game reads, nothing to trim: a plain copy keeps
  // the original quality rather than generation-losing it through a re-encode.
  if (isAcceptable(source, kind) && !needsTrim && extOf(source) === targetExt) {
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
    // One frame, and drop any alpha-less weirdness the source might carry.
    args.push('-frames:v', '1', '-f', 'image2', '-c:v', 'png');
  }

  // Written to a temp name first so a failure cannot leave a half-file in a
  // pack folder, where the game would try to load it.
  const partial = `${target}.${process.pid}.part${targetExt}`;
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

  return {
    path: target,
    converted: true,
    trimmed: needsTrim,
    duration: needsTrim ? maxSeconds : duration,
  };
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
      const result = await convertInto(source, destDir, base, options);
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
  let target = path.join(destDir, `${baseName}.${audioFormat}`);
  if (!overwrite) target = uniquePath(target);

  const partial = `${target}.${process.pid}.part.${audioFormat}`;

  // -ss before -i seeks quickly; -t after it bounds the copy.
  const args = ['-ss', String(Math.max(0, start)), '-i', source, '-t', String(Math.max(0.05, duration)), '-vn'];
  if (audioFormat === 'wav') args.push('-c:a', 'pcm_s16le', '-ar', '48000', '-f', 'wav');
  else if (audioFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3');
  else args.push('-c:a', 'libvorbis', '-q:a', '5', '-f', 'ogg');
  args.push('-y', partial);

  try {
    await runFfmpeg(args, { signal });
    fs.renameSync(partial, target);
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { /* never created */ }
    throw err;
  }

  return { path: target, start, duration };
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
    mode = 'muffle',      // 'muffle' keeps a dulled bed, 'silence' removes it
    level = null,         // overrides the mode's own attenuation
    // Where the muffle rolls the top off. This has been tuned from both ends:
    // 500 Hz took nearly everything with it and left a barely audible rumble,
    // 1.4 kHz left the original dialogue clear enough to compete with the dub.
    // 900 Hz sits above the body of music and room tone but below where speech
    // becomes intelligible, so the scene stays present without being followed.
    cutoff = 900,
    fade = 0.08,          // seconds of ramp, so the duck does not click
    audioFormat = 'wav',
    baseName = '_backing_track',
    signal,
    onProgress,
  } = options;

  if (!ranges || !ranges.length) throw new Error('This pack has no clips to work from');

  fs.mkdirSync(destDir, { recursive: true });
  const target = path.join(destDir, `${baseName}.${audioFormat}`);
  const partial = `${target}.${process.pid}.part.${audioFormat}`;

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

  const when = windows.join('+');

  // Silencing under a line leaves a hole where the room tone was, which sounds
  // like the audio dropped out. Muffling instead rolls the top off and pulls it
  // down, so the scene keeps its atmosphere and the dub still sits in front.
  // 0.22 was about 13 dB down, which on top of the filtering left almost
  // nothing; 0.45, about 7 dB, was loud enough to hear the original lines
  // through. 0.30 is roughly 10 dB down: the scene is still there underneath
  // without drawing attention to itself.
  const gain = level != null ? level : (mode === 'silence' ? 0 : 0.30);
  const chain = mode === 'silence'
    ? [`volume=${gain}:enable='${when}'`]
    : [`lowpass=f=${cutoff}:enable='${when}'`, `volume=${gain}:enable='${when}'`];

  const duration = probeDuration(videoPath);
  const args = [
    '-i', videoPath,
    '-vn',
    '-af', chain.join(','),
  ];
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

  return { path: target, ducked: windows.length, mode, gain };
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

  const duration = probeDuration(source);
  if (!duration) throw new Error('Could not read how long the video is');

  const from = Math.max(0, Math.min(start, duration));
  const to = Math.min(end == null ? duration : end, duration);
  const length = to - from;

  if (length < 0.5) throw new Error('That would leave less than half a second of video');
  if (from <= 0.001 && to >= duration - 0.001) throw new Error('That is the whole video already');

  const partial = `${source}.${process.pid}.trim.ogv`;

  // -ss before -i seeks quickly, but re-encoding is still needed: cutting on a
  // non-keyframe with a stream copy leaves a frozen or blank opening.
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

  // The original moves out of the pack before the trim takes its place, so a
  // failure at any point leaves either the old video or the new one, never
  // neither.
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.renameSync(source, backupPath);
  fs.renameSync(partial, source);

  return {
    path: source,
    backup: backupPath,
    from,
    to,
    // How far every clip has to move to stay in sync with the picture.
    shift: -from,
    wasSeconds: duration,
    nowSeconds: length,
  };
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
