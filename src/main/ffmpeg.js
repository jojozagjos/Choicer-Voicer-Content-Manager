'use strict';

/**
 * Locating and driving ffmpeg/ffprobe.
 *
 * Resolution order: an explicit user override, then the bundled static
 * binaries, then whatever is on PATH. The bundled ones make the packaged app
 * self-contained; the PATH fallback keeps `npm start` working before deps are
 * fully installed.
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');

let overrides = { ffmpeg: null, ffprobe: null };

/** Static binaries ship inside app.asar, which can't be executed in place. */
function unpacked(p) {
  return p ? p.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep)
             .replace('app.asar/', 'app.asar.unpacked/') : p;
}

function fromStaticPackage(name) {
  try {
    const mod = require(name);
    const p = typeof mod === 'string' ? mod : mod && mod.path;
    if (!p) return null;
    const resolved = unpacked(p);
    return fs.existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function onPath(bin) {
  const probe = spawnSync(bin, ['-version'], { windowsHide: true });
  return probe.status === 0 ? bin : null;
}

function resolveBinary(kind) {
  if (overrides[kind] && fs.existsSync(overrides[kind])) return overrides[kind];
  const bundled = fromStaticPackage(kind === 'ffmpeg' ? 'ffmpeg-static' : 'ffprobe-static');
  if (bundled) return bundled;
  return onPath(kind);
}

function setOverrides(next = {}) {
  overrides = {
    ffmpeg: next.ffmpeg || null,
    ffprobe: next.ffprobe || null,
  };
}

function ffmpegPath() {
  const p = resolveBinary('ffmpeg');
  if (!p) throw new Error('ffmpeg not found. Install ffmpeg or set its path in Settings.');
  return p;
}

function ffprobePath() {
  const p = resolveBinary('ffprobe');
  if (!p) throw new Error('ffprobe not found. Install ffmpeg or set its path in Settings.');
  return p;
}

function status() {
  const ffmpeg = resolveBinary('ffmpeg');
  const ffprobe = resolveBinary('ffprobe');
  return {
    ffmpeg,
    ffprobe,
    ok: Boolean(ffmpeg && ffprobe),
    version: ffmpeg ? readVersion(ffmpeg) : null,
  };
}

function readVersion(bin) {
  const res = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true });
  const first = (res.stdout || '').split('\n')[0] || '';
  const m = first.match(/ffmpeg version (\S+)/);
  return m ? m[1] : null;
}

/** Media duration in seconds, or null if it can't be determined. */
function probeDuration(file) {
  const res = spawnSync(ffprobePath(), [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8', windowsHide: true });

  const value = parseFloat((res.stdout || '').trim());
  return Number.isFinite(value) ? value : null;
}

/** Video dimensions + frame rate, used to drive export presets. */
function probeVideo(file) {
  const res = spawnSync(ffprobePath(), [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1',
    file,
  ], { encoding: 'utf8', windowsHide: true });

  const out = {};
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
  }

  let fps = 30;
  if (out.r_frame_rate && out.r_frame_rate.includes('/')) {
    const [num, den] = out.r_frame_rate.split('/').map(Number);
    if (den) fps = num / den;
  }

  return {
    width: Number(out.width) || 1920,
    height: Number(out.height) || 1080,
    fps,
    duration: parseFloat(out.duration) || null,
  };
}

/**
 * Runs ffmpeg, reporting progress via `-progress pipe:1`.
 * Resolves with the tail of stderr so failures can be explained.
 */
function runFfmpeg(args, { onProgress, cwd, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ['-progress', 'pipe:1', '-nostats', ...args], {
      cwd,
      windowsHide: true,
    });

    // Keep only the tail: ffmpeg is chatty and the useful error is at the end.
    const errorLines = [];
    let progressBuf = '';

    child.stdout.on('data', (chunk) => {
      progressBuf += chunk.toString();
      const parts = progressBuf.split('\n');
      progressBuf = parts.pop() || '';
      for (const line of parts) {
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        if (key === 'out_time_us' || key === 'out_time_ms') {
          const seconds = Number(value) / 1_000_000;
          if (Number.isFinite(seconds) && onProgress) onProgress(Math.max(0, seconds));
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        errorLines.push(line);
        if (errorLines.length > 40) errorLines.shift();
      }
    });

    if (signal) {
      if (signal.aborted) child.kill('SIGKILL');
      else signal.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ log: errorLines.join('\n') });
      if (signal && signal.aborted) {
        const err = new Error('Export cancelled');
        err.cancelled = true;
        return reject(err);
      }
      reject(new Error(`ffmpeg exited with code ${code}\n\n${errorLines.join('\n')}`));
    });
  });
}

module.exports = {
  setOverrides,
  status,
  ffmpegPath,
  ffprobePath,
  probeDuration,
  probeVideo,
  runFfmpeg,
};
