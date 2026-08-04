'use strict';

/**
 * Checks the pack shrinker, mostly against the ways it could lose somebody's
 * audio rather than the ways it could save bytes.
 *
 *   node scripts/test-shrink.js
 *
 * The encoder itself is not under test here — it is ffmpeg, and it works. What
 * is under test is every decision made around it, because those are mine.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  shrinkPack, targetName, walk, WORTH_IT, VIDEO_BITRATE_FLOOR, VIDEO,
} = require('../src/main/shrink');

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

/** A throwaway folder with the given files in it. */
function makePack(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shrink-test-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const bin = (n) => Buffer.alloc(n, 7);
const temps = [];

/**
 * Writes a real WAV, because a buffer of repeated bytes is not one.
 *
 * An earlier version of this file faked them, and the conversion tests passed
 * for the wrong reason: ffmpeg refused the fake input, the code fell back to
 * copying exactly as designed, and the assertion that a wav becomes an ogg was
 * never actually exercised.
 */
async function makeWav(dir, name, seconds = 1) {
  const { runFfmpeg } = require('../src/main/ffmpeg');
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  await runFfmpeg([
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-c:a', 'pcm_s16le', '-y', full,
  ]);
  return full;
}
function pack(files) {
  const d = makePack(files);
  temps.push(d);
  return d;
}
function out() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'shrink-out-'));
  temps.push(d);
  return d;
}

async function main() {
console.log('\nNaming');

check('wav becomes ogg', targetName('clip.wav') === 'clip.ogg');
check('WAV in capitals too', targetName('CLIP.WAV') === 'CLIP.ogg');
check('ogg is left alone', targetName('clip.ogg') === 'clip.ogg');
check('mp3 is left alone', targetName('clip.mp3') === 'clip.mp3');
check('ogv keeps its name', targetName('dub_video.ogv') === 'dub_video.ogv');
check('a nested path keeps its folder', targetName(path.join('sub', 'a.wav')) === path.join('sub', 'a.ogg'));

console.log('\nWalking');

{
  const dir = pack({ 'a.txt': 'x', 'sub/b.txt': 'y', 'sub/deep/c.txt': 'z' });
  const found = walk(dir).map((f) => f.split(path.sep).join('/')).sort();
  check('walk finds nested files', found.join() === 'a.txt,sub/b.txt,sub/deep/c.txt', found.join());
}

console.log('\nEverything arrives on the other side');

{
  const dir = pack({ 'a.ini': 'x=1', 'b.txt': 'hello', 'c.png': bin(500), 'd.mp3': bin(900) });
  const dest = out();
  const r = await shrinkPack(dir, dest);
  const got = walk(dest).sort().join();
  check('every file comes out', got === 'a.ini,b.txt,c.png,d.mp3', got);
  check('nothing was lost or invented', r.files === 4);
  check('already-compressed files are unchanged in size', r.after === r.before);
  check('the originals are still there', walk(dir).length === 4);
}

console.log('\nThe collision that would eat a clip');

{
  // Both formats of the same clip. Converting the wav would land it exactly on
  // the ogg, and one of them would simply cease to exist.
  const dir = pack({ 'line.ogg': bin(300) });
  await makeWav(dir, 'line.wav', 1);
  const dest = out();
  await shrinkPack(dir, dest);
  const got = walk(dest).sort().join();
  check(
    'a wav is not converted onto an existing ogg',
    got === 'line.ogg,line.wav',
    `both files must survive, got: ${got}`,
  );
  check(
    '  and the existing ogg is the original one',
    fs.statSync(path.join(dest, 'line.ogg')).size === 300,
    'the ogg must not have been overwritten by the converted wav',
  );
}

{
  const dir = pack({ 'other.ogg': bin(300) });
  await makeWav(dir, 'line.wav', 1);
  const dest = out();
  const r = await shrinkPack(dir, dest);
  const got = walk(dest).sort().join();
  check('an unrelated ogg does not block conversion', got.includes('line.ogg'), got);
  check('  and the wav itself is gone, replaced', !got.includes('line.wav'), got);
  check('  and it actually got smaller', r.after < r.before, `${r.before} -> ${r.after}`);
}

console.log('\nLeaving things alone');

{
  const dir = pack({ 'weird.xyz': bin(2000) });
  const dest = out();
  await shrinkPack(dir, dest);
  check(
    'an unknown extension is copied, not guessed at',
    fs.existsSync(path.join(dest, 'weird.xyz'))
      && fs.statSync(path.join(dest, 'weird.xyz')).size === 2000,
  );
}

{
  const dir = pack({ 'notreally.ogv': Buffer.from('this is not a video') });
  const dest = out();
  const r = await shrinkPack(dir, dest);
  check(
    'a video ffmpeg cannot read falls back to the original',
    fs.existsSync(path.join(dest, 'notreally.ogv')),
    'failing to shrink must never mean failing to package',
  );
  check('  and it is reported rather than hidden', r.skipped.length === 1, JSON.stringify(r.skipped));
}

console.log('\nThe numbers it reports');

{
  const dir = pack({ 'a.mp3': bin(1000), 'b.mp3': bin(3000) });
  const dest = out();
  const r = await shrinkPack(dir, dest);
  check('before is the true total', r.before === 4000, String(r.before));
  check('after matches what was written', r.after === 4000);
  check('saved is the difference', r.saved === r.before - r.after);
  check('ratio is after over before', Math.abs(r.ratio - 1) < 1e-9);
}

console.log('\nSettings are the measured ones');

check('the floor is 3 Mbps', VIDEO_BITRATE_FLOOR === 3_000_000);
check('the target is 720p', VIDEO.height === 720);
check('quality is 6', VIDEO.quality === 6);
check('a result must beat 90% to be kept', WORTH_IT === 0.9);

}

main()
  .then(() => {
    for (const d of temps) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* tmp */ }
    }
    console.log(`\n${checks - failures}/${checks} passed`);
    process.exit(failures ? 1 : 0);
  })
  .catch((err) => {
    console.error(`\nThe suite itself fell over: ${err.stack || err.message}`);
    process.exit(2);
  });
