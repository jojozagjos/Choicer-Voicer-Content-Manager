'use strict';

/**
 * Makes a smaller copy of a pack, for sharing.
 *
 * Packs are much bigger than they need to be, and the download is the part that
 * every single person who installs one pays for. Measured across a real 18-pack
 * library totalling 667 MB, video was 72% of every byte — and not because the
 * videos are long. They are 1920x1080 Theora at around 9 Mbps, for something the
 * game draws in a window.
 *
 * Re-encoding to 720p at quality 6 measured 61% smaller with no visible loss at
 * the size it is actually watched. WAV becomes Vorbis, which is inaudible on
 * voice and turns 87 MB into about 10 MB. Together that takes the library to
 * roughly 280 MB: the average pack goes from 37 MB to 16 MB.
 *
 * Three rules this must never break, in order of how badly they would hurt:
 *
 * 1. **It never touches the original.** Everything happens on a copy. What the
 *    author has in their game folder is what they recorded, always. A tool that
 *    silently degrades the master because someone ticked a box on the way to
 *    sharing is a tool nobody should trust with their work.
 * 2. **A file that would not get meaningfully smaller is copied instead.**
 *    Re-encoding lossy media to save two percent spends quality on nothing.
 * 3. **Failure falls back to the original file.** A pack that shares at full
 *    size is a mild disappointment. A pack that fails to share is a bug.
 */

const fs = require('fs');
const path = require('path');

const { probeVideo, runFfmpeg } = require('./ffmpeg');

/**
 * The encode settings, and why these numbers.
 *
 * `height: 720` because the game renders the video into a panel, not a cinema,
 * and 1080 costs roughly double for detail nobody sees. `quality: 6` from
 * measuring 4, 6 and 8 on the worst offender in a real library: q4 saved 75% but
 * softened faces, q8 saved only 37%, q6 saved 61% and I could not tell it from
 * the source at the size it plays.
 */
const VIDEO = { height: 720, quality: 6, audioKbps: 96 };

/** Vorbis at this rate is transparent for speech and tiny next to WAV. */
const AUDIO_KBPS = 96;

/**
 * Don't re-encode a video already leaner than this.
 *
 * The number is measured, not chosen. Bitrates across a real 18-pack library
 * turned out to be sharply bimodal: four packs sat between 3.4 and 9 Mbps and
 * held 346 MB of the 478 MB of video, while the other fourteen were all under
 * 2.4 Mbps and already efficient.
 *
 * Below this line, re-encoding does not merely save little — it actively loses.
 * A 1512 kbps 1080p video in that library came back from 720p q6 **44% larger**
 * (20.1 MB to 28.9 MB), because a fixed quality target costs more than material
 * that is already well compressed. `WORTH_IT` would catch that and throw the
 * result away, but only after spending three minutes making it. This floor is
 * what stops the waste, and it is set well clear of the break-even rather than
 * on top of it.
 */
const VIDEO_BITRATE_FLOOR = 3_000_000;

/** Keep the new file only if it saved at least this share of the original. */
const WORTH_IT = 0.9;

const VIDEO_EXT = new Set(['.ogv']);
const LOSSLESS_AUDIO_EXT = new Set(['.wav']);
const COPY_AS_IS = new Set(['.ogg', '.mp3', '.png', '.jpg', '.jpeg', '.ini', '.txt', '.json']);

/** Everything in a folder, deepest paths included, relative to it. */
function walk(dir, base = dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, found);
    else if (entry.isFile()) found.push(path.relative(base, full));
  }
  return found;
}

/**
 * Re-encodes one video, or returns null to mean "leave it alone".
 *
 * Returning null rather than throwing is deliberate: every reason to skip here
 * is ordinary, not exceptional.
 */
async function shrinkVideo(from, to, { signal, onProgress } = {}) {
  const bytes = fs.statSync(from).size;
  const info = probeVideo(from);

  if (info.duration) {
    const bitrate = (bytes * 8) / info.duration;
    if (bitrate < VIDEO_BITRATE_FLOOR) return null;
  }
  // Already at or below the target height, so there is nothing to scale away and
  // a re-encode would be a pure quality loss.
  if (info.height && info.height <= VIDEO.height) return null;

  await runFfmpeg([
    '-i', from,
    // -2 keeps the width even, which the encoder requires, and preserves the
    // aspect ratio rather than assuming 16:9.
    '-vf', `scale=-2:${VIDEO.height}`,
    '-c:v', 'libtheora', '-q:v', String(VIDEO.quality),
    '-c:a', 'libvorbis', '-b:a', `${VIDEO.audioKbps}k`,
    '-y', to,
  ], { signal, onProgress });

  return fs.existsSync(to) ? to : null;
}

/** WAV to Vorbis. Nothing to decide here; WAV is always worth converting. */
async function shrinkAudio(from, to, { signal } = {}) {
  await runFfmpeg([
    '-i', from,
    '-c:a', 'libvorbis', '-b:a', `${AUDIO_KBPS}k`,
    '-y', to,
  ], { signal });
  return fs.existsSync(to) ? to : null;
}

/** What the shrunk version of a file should be called. */
function targetName(relative) {
  const ext = path.extname(relative).toLowerCase();
  if (LOSSLESS_AUDIO_EXT.has(ext)) return `${relative.slice(0, -ext.length)}.ogg`;
  return relative;
}

/**
 * Writes a smaller copy of `packDir` into `outDir`.
 *
 * Reports per-file progress, because on a big pack this is minutes of work and a
 * frozen dialog is indistinguishable from a hang.
 *
 * Resolves with what it managed to save, so the caller can tell the author
 * whether it was worth the wait.
 */
async function shrinkPack(packDir, outDir, { signal, onProgress } = {}) {
  const files = walk(packDir);
  fs.mkdirSync(outDir, { recursive: true });

  // Converting foo.wav to foo.ogg is fine until the pack already contains a
  // foo.ogg, at which point one of them lands on the other and a clip is lost
  // to whichever happened to be walked second. The app normally keeps a single
  // format per clip, but "normally" is not a guarantee worth destroying audio
  // over, so a name that is already taken means that file is left alone.
  const taken = new Set(files.map((f) => f.toLowerCase()));

  let before = 0;
  let after = 0;
  const skipped = [];
  let done = 0;

  for (const relative of files) {
    if (signal && signal.aborted) throw new Error('Cancelled');

    const from = path.join(packDir, relative);
    const ext = path.extname(relative).toLowerCase();
    const originalBytes = fs.statSync(from).size;
    before += originalBytes;

    const say = (stage) => {
      if (onProgress) {
        onProgress({ file: relative, stage, done, total: files.length });
      }
    };

    const renamed = targetName(relative);
    const collides = renamed !== relative && taken.has(renamed.toLowerCase());
    const to = path.join(outDir, renamed);
    fs.mkdirSync(path.dirname(to), { recursive: true });

    let made = null;
    try {
      if (VIDEO_EXT.has(ext)) {
        say('video');
        made = await shrinkVideo(from, to, { signal });
      } else if (LOSSLESS_AUDIO_EXT.has(ext) && !collides) {
        say('audio');
        made = await shrinkAudio(from, to, { signal });
      } else if (!COPY_AS_IS.has(ext)) {
        // An extension nobody planned for. Copying it is the only safe answer:
        // guessing at how to compress an unknown format is how packs break.
        say('copy');
      }
    } catch (err) {
      if (signal && signal.aborted) throw err;
      // Falling back to the original is always correct here. Sharing a big pack
      // beats failing to share one.
      skipped.push({ file: relative, why: err.message });
      made = null;
    }

    // Keep the new file only if it actually earned its place. This catches the
    // encoder producing something larger, which Theora will happily do on
    // material that is already efficient.
    if (made && fs.existsSync(made)) {
      const newBytes = fs.statSync(made).size;
      if (newBytes < originalBytes * WORTH_IT) {
        after += newBytes;
        done++;
        continue;
      }
      try { fs.unlinkSync(made); } catch { /* the copy below replaces it */ }
    }

    // Either nothing was attempted, or what came back was not worth keeping.
    const plainTo = path.join(outDir, relative);
    fs.mkdirSync(path.dirname(plainTo), { recursive: true });
    fs.copyFileSync(from, plainTo);
    after += originalBytes;
    done++;
  }

  return {
    before,
    after,
    saved: before - after,
    ratio: before ? after / before : 1,
    files: files.length,
    skipped,
  };
}

module.exports = {
  VIDEO,
  VIDEO_BITRATE_FLOOR,
  WORTH_IT,
  targetName,
  walk,
  shrinkPack,
};
