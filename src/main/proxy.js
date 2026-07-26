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
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runFfmpeg, probeVideo } = require('./ffmpeg');

const PROXY_HEIGHT = 720;
const MAX_CACHED = 12;

function cacheKey(videoPath) {
  const stat = fs.statSync(videoPath);
  return crypto
    .createHash('sha1')
    .update(`${videoPath}|${stat.size}|${Math.round(stat.mtimeMs)}|${PROXY_HEIGHT}`)
    .digest('hex')
    .slice(0, 16);
}

/** Drops the least recently used proxies so the cache can't grow forever. */
function prune(cacheDir) {
  let entries;
  try {
    entries = fs.readdirSync(cacheDir)
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => {
        const full = path.join(cacheDir, f);
        return { full, atime: fs.statSync(full).atimeMs };
      });
  } catch {
    return;
  }
  if (entries.length <= MAX_CACHED) return;
  entries.sort((a, b) => a.atime - b.atime);
  for (const entry of entries.slice(0, entries.length - MAX_CACHED)) {
    try { fs.unlinkSync(entry.full); } catch { /* fine, it's a cache */ }
  }
}

/**
 * Returns a playable MP4 for `videoPath`, building it if needed.
 * `onProgress` receives { percent } while transcoding.
 */
async function ensureProxy(videoPath, cacheDir, { onProgress, signal } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });

  const target = path.join(cacheDir, `${cacheKey(videoPath)}.mp4`);
  if (fs.existsSync(target)) {
    // Touch it so prune() treats it as recently used.
    const now = new Date();
    try { fs.utimesSync(target, now, now); } catch { /* not important */ }
    return { path: target, cached: true };
  }

  const info = probeVideo(videoPath);
  const partial = `${target}.part`;

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

  fs.renameSync(partial, target);
  prune(cacheDir);
  return { path: target, cached: false };
}

module.exports = { ensureProxy };
