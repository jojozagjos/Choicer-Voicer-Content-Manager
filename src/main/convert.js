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
  describe,
  kindOf,
  isAcceptable,
  OK_VIDEO,
  OK_AUDIO,
  OK_IMAGE,
};
