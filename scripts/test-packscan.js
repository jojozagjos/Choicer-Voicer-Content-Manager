'use strict';

/**
 * Checks the pack report shown to a reviewer.
 *
 *   node scripts/test-packscan.js
 *
 * The bias here is against crying wolf. A reviewer who is warned about every
 * ordinary pack stops reading the warnings, and then the one that mattered goes
 * past unread — so "a normal pack produces nothing" is the most important case
 * in this file, not an afterthought.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanPack } = require('../src/main/packscan');

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

const file = (name, bytes = 500000) => ({ name, bytes });

/** A pack with nothing wrong with it. */
const normal = {
  type: 'voice',
  claimedType: 'voice',
  files: [
    file('dub_video.ogv', 20000000),
    file('01_caine.mp3', 277440),
    file('01_caine.ini', 186),
    file('player.png', 40000),
  ],
  captions: [{ name: '01_caine.ini', text: 'Hello there.' }],
};

console.log('\nA normal pack says nothing');

{
  const said = scanPack(normal);
  check('nothing is reported', said.findings.length === 0,
    JSON.stringify(said.findings));
  check('  and there is no worst', said.worst === null);
  check('  counts are still filled in', said.counts.files === 4 && said.counts.bytes > 0);
}

console.log('\nThings worth stopping for');

{
  const said = scanPack({ ...normal, type: 'menu' });
  check('files not matching the record is an alarm', said.worst === 'alarm');
  check('  and it says which is which',
    /voice/.test(said.findings[0].detail) && /menu/.test(said.findings[0].detail));
}

{
  const said = scanPack({ ...normal, type: null, claimedType: null });
  check('an unrecognisable pack is an alarm', said.worst === 'alarm');
}

{
  const said = scanPack({ ...normal, files: [] });
  check('an empty pack is an alarm', said.worst === 'alarm');
}

{
  // A right-to-left override can make "evil_gpj.exe" display as "evil_exe.jpg".
  const sneaky = { ...normal, files: [...normal.files, file(`quiet${String.fromCharCode(0x202E)}.png`)] };
  const said = scanPack(sneaky);
  check('a hidden direction character is an alarm', said.worst === 'alarm');
  check('  and it explains why that matters',
    /display/.test(said.findings.find((f) => /hidden/.test(f.what)).detail));
}

console.log('\nThings worth mentioning, not refusing');

{
  const said = scanPack({ ...normal, files: [...normal.files, file('notes.docx')] });
  check('an unreadable extension is a warning, not an alarm', said.worst === 'warn');
  check('  and it names the file', /notes\.docx/.test(said.findings[0].detail));
}

{
  const said = scanPack({ ...normal, files: [...normal.files, file('silent.wav', 44)] });
  check('an empty-looking media file is a warning', said.worst === 'warn');
}

{
  const said = scanPack({ ...normal, captions: [{ name: 'a.ini', text: '   ' }] });
  check('blank captions are only a note', said.worst === 'note');
}

console.log('\nOrdering and shape');

{
  const said = scanPack({
    ...normal,
    type: 'menu',
    files: [...normal.files, file('notes.docx'), file('silent.wav', 12)],
  });
  check('the worst finding comes first', said.findings[0].level === 'alarm');
  check('  and everything else is still listed', said.findings.length >= 3);
  check('  worst matches the first finding', said.worst === said.findings[0].level);
}

{
  const said = scanPack({});
  check('an empty call does not throw', said && Array.isArray(said.findings));
}

{
  const many = { ...normal, files: [...normal.files, ...Array.from({ length: 20 }, (_, i) => file(`x${i}.docx`)) ] };
  const said = scanPack(many);
  check('a long list is cut short rather than pasted whole',
    said.findings[0].detail.endsWith('…'),
    said.findings[0].detail);
}

// ---------------------------------------------------------------------------

console.log('\nUpdating a pack replaces it rather than installing a second copy');
{
  const { installPack } = require('../src/main/create');
  const game = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-replace-'));
  const made = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-src-'));

  // Two versions of the same pack, told apart by a file only the second has.
  const build = (where, marker) => {
    const dir = path.join(where, 'Some Pack');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '_pack_info.ini'), 'title=Some Pack\n');
    fs.writeFileSync(path.join(dir, 'dub_video.ogv'), 'not really a video');
    fs.writeFileSync(path.join(dir, marker), 'x');
    return dir;
  };

  const first = installPack(game, build(made, 'version-one.txt'));
  const parent = path.dirname(first.dir);
  check('the first install lands', fs.existsSync(first.dir));

  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-src2-'));
  const updated = installPack(game, build(second, 'version-two.txt'), { replaceDir: first.dir });

  check('an update stays in the same folder', updated.dir === first.dir,
    `went to ${updated.dir}`);
  check('it says it replaced something', updated.replaced === true);
  check('only one copy of the pack exists',
    fs.readdirSync(parent).filter((n) => n.startsWith('Some Pack')).length === 1,
    `found ${fs.readdirSync(parent).join(', ')}`);
  check('the new version is what is there', fs.existsSync(path.join(updated.dir, 'version-two.txt')));
  check('the old version is gone', !fs.existsSync(path.join(updated.dir, 'version-one.txt')));
  check('no scratch folder is left behind',
    fs.readdirSync(parent).every((n) => !n.endsWith('.replacing')));

  // Without the hint the old behaviour stands, which is what a fresh install
  // of a differently named pack still needs.
  const third = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-src3-'));
  const beside = installPack(game, build(third, 'version-three.txt'));
  check('a plain install still avoids the name it finds taken', beside.dir !== first.dir);
  check('and reports that it replaced nothing', beside.replaced === false);

  // A folder outside the game folder is never deleted, whatever is asked for.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-outside-'));
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'do not delete me');
  const fourth = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-src4-'));
  installPack(game, build(fourth, 'version-four.txt'), { replaceDir: outside });
  check('a replace target outside the game folder is refused',
    fs.existsSync(path.join(outside, 'precious.txt')));

  for (const dir of [game, made, second, third, fourth, outside]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`
${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
