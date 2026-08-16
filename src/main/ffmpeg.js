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

/**
 * How much of a file's audio is spread across the stereo field, in dB.
 *
 * Returns side level minus mid level. Around -6 is a wide, genuinely stereo
 * mix; -40 or below means the two channels are the same signal, which is a
 * mono recording carried in a stereo container and is very common.
 *
 * This decides whether centre cancellation is worth attempting on a file.
 * Dialogue is mixed dead centre in almost everything, so subtracting one
 * channel from the other removes it and leaves the music around it. On a file
 * whose channels are identical that subtraction leaves silence, so the same
 * technique that is the best available on one file destroys another.
 *
 * Measured over a sample rather than the whole file, because this runs before
 * a build that is already minutes long and the answer does not change.
 */
function probeStereoWidth(file, { seconds = 60 } = {}) {
  const level = (pan) => {
    const res = spawnSync(ffmpegPath(), [
      '-v', 'info', '-t', String(seconds), '-i', file,
      '-af', `pan=mono|c0=${pan},astats=metadata=1:reset=0`,
      '-f', 'null', '-',
    ], { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    const found = (res.stderr || '').match(/RMS level dB:\s*(-?[\d.]+|-inf)/g);
    if (!found) return null;
    const value = found[found.length - 1].split(':')[1].trim();
    return value === '-inf' ? -120 : parseFloat(value);
  };

  try {
    const mid = level('0.5*c0+0.5*c1');
    const side = level('0.5*c0-0.5*c1');
    if (mid === null || side === null || !Number.isFinite(mid) || !Number.isFinite(side)) {
      return null;
    }
    return side - mid;
  } catch {
    return null;
  }
}

function probeAudioRms(file, { seconds = 60 } = {}) {
  try {
    const res = spawnSync(ffmpegPath(), [
      '-v', 'info', '-t', String(seconds), '-i', file,
      '-af', 'astats=metadata=1:reset=0',
      '-f', 'null', '-',
    ], { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    const found = (res.stderr || '').match(/RMS level dB:\s*(-?[\d.]+|-inf)/g);
    if (!found) return null;
    const value = found[found.length - 1].split(':')[1].trim();
    return value === '-inf' ? -120 : parseFloat(value);
  } catch {
    return null;
  }
}

/**
 * When the video stream starts presenting, in seconds, or null if unreadable.
 *
 * Worth checking on anything freshly muxed. A file whose picture starts late
 * looks fine on a duration check and plays fine on its own, but everything in a
 * pack is timed from the first frame, so the whole dub would sit out by that
 * much.
 */
function probeStartTime(file) {
  const res = spawnSync(ffprobePath(), [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=start_time',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8', windowsHide: true });

  const value = parseFloat((res.stdout || '').trim());
  return Number.isFinite(value) ? value : null;
}

/** Whether the first video frame actually decodes. */
function probeFirstFrameDecodes(file) {
  const res = spawnSync(ffprobePath(), [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-read_intervals', '%+#1',
    '-show_entries', 'frame=pict_type',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8', windowsHide: true });

  return /\S/.test(res.stdout || '');
}

/**
 * Keyframe timestamps in a window around a point in the video.
 *
 * Only a window, because listing every keyframe in a long video means decoding
 * the whole thing. `-read_intervals` keeps it to the seconds that matter, which
 * is all a cut needs: somewhere close by to land on.
 */
function probeKeyframesNear(file, time, window = 6) {
  const from = Math.max(0, time - window);
  const res = spawnSync(ffprobePath(), [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'packet=pts_time,flags',
    '-of', 'csv=print_section=0',
    '-read_intervals', `${from}%+${window * 2}`,
    file,
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });

  const times = [];
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    // "12.100000,K_" — the flags field carries K on a keyframe.
    const [stamp, flags] = line.split(',');
    if (!flags || !flags.includes('K')) continue;
    const value = parseFloat(stamp);
    if (Number.isFinite(value)) times.push(value);
  }
  return times.sort((a, b) => a - b);
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
  probeStereoWidth,
  probeAudioRms,
  probeVideo,
  probeStartTime,
  probeFirstFrameDecodes,
  probeKeyframesNear,
  runFfmpeg,
};
