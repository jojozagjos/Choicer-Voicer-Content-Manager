'use strict';

/**
 * Exporting a pack with more lines than one command line can name.
 *
 *   node scripts/test-export-scale.js
 *
 * Windows refuses to start a process whose command line runs past about
 * 32,767 characters. The export named every take on it, so a pack with enough
 * lines failed with "spawn ENAMETOOLONG" and nothing else, which says nothing
 * about packs or lines to whoever is reading it. There is no cap now: the
 * takes are mixed in batches and the batches mixed together.
 *
 * This builds real audio and runs real ffmpeg, because the failure was in what
 * the operating system would accept, and nothing short of asking it proves
 * anything.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runExport, buildArgs } = require('../src/main/exporter');
const { runFfmpeg, probeDuration } = require('../src/main/ffmpeg');

let failures = 0;
let checks = 0;
function check(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-scale-'));

// Deliberately deep, because the length of somebody's game folder is the
// thing that decides how many lines fit on one command line.
const deep = path.join(root,
  'a-rather-long-folder-name-of-the-kind-people-actually-have',
  'The Choicer Voicer', 'game', 'packs_voice', 'A Pack With A Long Name');
fs.mkdirSync(deep, { recursive: true });

(async () => {
  console.log('\nBuilding something to export');

  const video = path.join(root, 'source.mp4');
  await runFfmpeg([
    '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=30',
    '-f', 'lavfi', '-i', 'sine=frequency=200:duration=30',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-y', video,
  ]);
  check('a source video exists', fs.existsSync(video));

  // One short take per line, each named long enough to eat the budget.
  const LINES = 220;
  const tracks = [];
  for (let i = 0; i < LINES; i++) {
    const name = `${String(i).padStart(3, '0')}_a_line_with_a_deliberately_long_file_name.wav`;
    const file = path.join(deep, name);
    if (i === 0) {
      await runFfmpeg([
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.4',
        '-c:a', 'pcm_s16le', '-ar', '48000', '-y', file,
      ]);
    } else {
      fs.copyFileSync(path.join(deep,
        '000_a_line_with_a_deliberately_long_file_name.wav'), file);
    }
    tracks.push({
      path: file, time: i * 0.1, offset: 0, duration: 0.4, volume: 1, enabled: true,
    });
  }
  check(`${LINES} takes were made`, tracks.length === LINES);

  const outputPath = path.join(root, 'exported.mp4');
  const job = {
    videoPath: video,
    backingPath: null,
    tracks,
    captions: [],
    outputPath,
    options: { format: 'mp4', preset: 'source', dubVolume: 1, normalizeDub: false },
  };

  console.log('\nThe command line this would have needed');
  {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-scale-args-'));
    const { args } = buildArgs(job, work);
    const length = args.reduce((n, a) => n + String(a).length + 3, 0);
    console.log(`  ${length} characters, against a limit of about 32767`);
    check('this pack really is past what Windows accepts', length > 32767,
      `only ${length}, so the test is no longer testing anything`);
    check('the graph is not on the command line',
      args.includes('-filter_complex_script') && !args.includes('-filter_complex'));
    fs.rmSync(work, { recursive: true, force: true });
  }

  console.log('\nExporting it anyway');
  {
    let failed = null;
    try {
      await runExport(job, {});
    } catch (err) {
      failed = err;
    }
    check('the export finishes', failed === null,
      failed && failed.message.split('\n')[0]);
    check('a file comes out', fs.existsSync(outputPath));

    if (fs.existsSync(outputPath)) {
      check('it is not empty', fs.statSync(outputPath).size > 1000,
        `${fs.statSync(outputPath).size} bytes`);
      const seconds = probeDuration(outputPath);
      check('it is as long as the video', seconds !== null && seconds > 25,
        `got ${seconds}`);
    }
  }

  console.log('\nAnd a small pack still goes the direct way');
  {
    const small = { ...job, tracks: tracks.slice(0, 3), outputPath: path.join(root, 'small.mp4') };
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-scale-small-'));
    const { args } = buildArgs(small, work);
    const length = args.reduce((n, a) => n + String(a).length + 3, 0);
    check('a short pack fits on one command line', length < 24000, `${length}`);
    fs.rmSync(work, { recursive: true, force: true });

    await runExport(small, {});
    check('and exports', fs.existsSync(small.outputPath));
  }

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n${checks - failures}/${checks} passed\n`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
});
