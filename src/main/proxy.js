'use strict';

/**
 * Preview proxies.
 *
 * Pack videos are Ogg Theora. Chromium dropped Theora decoding in M123, so the
 * <video> element loads these files, reports the right duration, and then
 * renders nothing: videoWidth stays 0. ffmpeg still decodes Theora fine, so
 * the fix is to transcode each pack video once into a small H.264 MP4 and
 * preview that instead.
 *
 * Proxies are cached by path+size+mtime and reused, so this cost is paid once
 * per pack. Exports always read the original .ogv, never the proxy.
 *
 * Two rules keep the cache trustworthy:
 *
 * 1. Each build writes to a temp name unique to this process. An earlier
 *    version used a fixed "<hash>.mp4.part", so two app instances transcoding
 *    the same video at once wrote over each other and produced a file that
 *    played as a black screen.
 * 2. Nothing is renamed into the cache until ffprobe has confirmed it decodes.
 *    A file present in the cache is therefore known good.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { runFfmpeg, probeVideo, ffprobePath } = require('./ffmpeg');

const execFileAsync = promisify(execFile);

const PROXY_HEIGHT = 720;
const MAX_CACHED = 12;

// Bumped when the cache can no longer be trusted. v1 files were written by the
// racy code above and some of them are corrupt, so they are simply ignored.
const PROXY_VERSION = 2;

function cacheKey(videoPath) {
  const stat = fs.statSync(videoPath);
  return crypto
    .createHash('sha1')
    .update(`${videoPath}|${stat.size}|${Math.round(stat.mtimeMs)}|${PROXY_HEIGHT}|v${PROXY_VERSION}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Confirms a file really is a playable video. ffprobe reads frames to work out
 * stream properties, so a torn file shows up as decode errors on stderr even
 * though the header still parses.
 */
async function isPlayable(file) {
  try {
    const { stdout, stderr } = await execFileAsync(ffprobePath(), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ], { windowsHide: true, maxBuffer: 1024 * 1024 });

    if (stderr && stderr.trim()) return false;
    const [width, height] = String(stdout).trim().split(/\s+/).map(Number);
    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  } catch {
    return false;
  }
}

/** Drops least recently used proxies, plus any abandoned temp files. */
function prune(cacheDir) {
  let names;
  try {
    names = fs.readdirSync(cacheDir);
  } catch {
    return;
  }

  // Temp files from a build that died part way through.
  for (const name of names) {
    if (!name.includes('.part')) continue;
    const full = path.join(cacheDir, name);
    try {
      if (Date.now() - fs.statSync(full).mtimeMs > 60 * 60 * 1000) fs.unlinkSync(full);
    } catch { /* fine, it's a cache */ }
  }

  const entries = names
    .filter((f) => f.endsWith('.mp4'))
    .map((f) => {
      const full = path.join(cacheDir, f);
      try { return { full, atime: fs.statSync(full).atimeMs }; } catch { return null; }
    })
    .filter(Boolean);

  if (entries.length <= MAX_CACHED) return;
  entries.sort((a, b) => a.atime - b.atime);
  for (const entry of entries.slice(0, entries.length - MAX_CACHED)) {
    try { fs.unlinkSync(entry.full); } catch { /* fine, it's a cache */ }
  }
}

/**
 * Returns a playable MP4 for `videoPath`, building it if needed.
 * `onProgress` receives { percent } while transcoding.
 * Pass `rebuild` to discard any cached copy first.
 */
async function ensureProxy(videoPath, cacheDir, { onProgress, signal, rebuild = false } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });

  const target = path.join(cacheDir, `${cacheKey(videoPath)}.mp4`);

  // A rebuild deliberately skips the cache read, but the existing file is left
  // in place until the replacement is proven good. The rename below overwrites
  // it atomically, so a cancelled rebuild costs nothing.
  if (!rebuild && fs.existsSync(target)) {
    // Touch it so prune() treats it as recently used.
    const now = new Date();
    try { fs.utimesSync(target, now, now); } catch { /* not important */ }
    return { path: target, cached: true };
  }

  const info = probeVideo(videoPath);

  // Unique per process and per attempt, so concurrent builds cannot collide.
  const partial = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.part`;

  try {
    await runFfmpeg([
      '-i', videoPath,
      // Keep it light: this is only ever shown in the preview pane.
      '-vf', `scale=-2:${Math.min(PROXY_HEIGHT, info.height || PROXY_HEIGHT)}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
      // The original dialogue is kept so it can be faded in for reference.
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      // Written to a .part file first, so the container has to be stated
      // outright, since ffmpeg can't infer it from that extension.
      '-f', 'mp4',
      '-y', partial,
    ], {
      signal,
      onProgress: (seconds) => {
        if (onProgress && info.duration) {
          onProgress({ percent: Math.min(100, (seconds / info.duration) * 100) });
        }
      },
    });

    if (!await isPlayable(partial)) {
      throw new Error('The preview transcode came out unreadable. Try opening the pack again.');
    }

    // Atomic swap, so readers only ever see a complete file.
    fs.renameSync(partial, target);
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { /* already gone */ }
    throw err;
  }

  prune(cacheDir);
  return { path: target, cached: false };
}

module.exports = { ensureProxy, isPlayable };
