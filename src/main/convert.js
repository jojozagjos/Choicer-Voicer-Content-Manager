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
    level = 0,
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

  const duration = probeDuration(videoPath);
  const args = [
    '-i', videoPath,
    '-vn',
    '-af', `volume=${level}:enable='${windows.join('+')}'`,
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
    fs.renameSync(partial, target);
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { /* never created */ }
    throw err;
  }

  return { path: target, ducked: windows.length };
}

/**
 * Crops a video in place, keeping the original aside so the crop can be undone.
 *
 * `crop` is in fractions of the source (0-1), not pixels, so the caller can
 * work from a preview at whatever size it happens to be displayed. Theora wants
 * even dimensions, so the pixel rectangle is rounded to a multiple of two.
 */
async function cropVideo(source, crop, backupPath, options = {}) {
  const { signal, onProgress } = options;

  const info = probeVideo(source);
  if (!info.width || !info.height) throw new Error('Could not read the video size');

  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  const w = even(info.width * crop.width);
  const h = even(info.height * crop.height);
  const x = even(info.width * crop.x);
  const y = even(info.height * crop.y);

  if (x + w > info.width || y + h > info.height) throw new Error('That crop falls outside the video');
  if (w < 16 || h < 16) throw new Error('That crop is too small');

  const duration = probeDuration(source);
  const partial = `${source}.${process.pid}.crop.ogv`;

  await runFfmpeg([
    '-i', source,
    '-vf', `crop=${w}:${h}:${x}:${y}`,
    '-c:v', 'libtheora', '-q:v', String(THEORA_QUALITY),
    '-c:a', 'libvorbis', '-q:a', String(VORBIS_QUALITY),
    '-f', 'ogv', '-y', partial,
  ], {
    signal,
    onProgress: (seconds) => {
      if (onProgress && duration) onProgress({ percent: Math.min(100, (seconds / duration) * 100) });
    },
  }).catch((err) => {
    try { fs.unlinkSync(partial); } catch { /* never created */ }
    throw err;
  });

  // The original moves out of the pack before the crop takes its place, so a
  // failure at any point leaves either the old video or the new one, never
  // neither.
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.renameSync(source, backupPath);
  fs.renameSync(partial, source);

  return {
    path: source,
    backup: backupPath,
    from: { width: info.width, height: info.height },
    to: { width: w, height: h },
  };
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
  cropVideo,
  describe,
  kindOf,
  isAcceptable,
  OK_VIDEO,
  OK_AUDIO,
  OK_IMAGE,
};
