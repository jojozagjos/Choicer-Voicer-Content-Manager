'use strict';

/**
 * A pack's download total across a republish, through both scripts.
 *
 * The count is the only number on a listing that cannot be recomputed from
 * scratch, so anything that loses it loses it permanently. The failure this
 * pins down is quiet: publishing an update swapped the file for one GitHub
 * counts from zero, and the next count run wrote that zero over the real
 * total.
 */

const { validateRecord, validateIndex } = require('../src/main/directory.js');

let failures = 0;
const check = (what, ok, note) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${ok || !note ? '' : `\n          ${note}`}`);
  if (!ok) failures++;
};

const submitted = (over = {}) => ({
  id: 'a-pack', type: 'voice', title: 'A Pack', summary: 'Lines.',
  author: 'someone', licence: 'unstated',
  downloadUrl: 'https://github.com/someone/packs/releases/download/v1/a.zip',
  sha256: 'a'.repeat(64), bytes: 4_200_000,
  published: '2026-01-01T00:00:00.000Z',
  ...over,
});

// What add-submission.js does when a pack with this id already exists.
function applyUpdate(index, incoming) {
  const at = index.packs.findIndex((p) => p.id === incoming.id);
  const record = { ...incoming };
  record.published = index.packs[at].published;
  record.downloads = index.packs[at].downloads || 0;
  record.downloadsBase = record.downloads;
  record.countedUrl = null;
  record.listed = index.packs[at].listed !== false;
  index.packs[at] = record;
  return validateIndex(index);
}

// What count-downloads.js does for one pack, given what GitHub says.
function applyCount(pack, assetCount) {
  const base = Number(pack.downloadsBase) || 0;
  if (pack.countedUrl && pack.countedUrl !== pack.downloadUrl) {
    pack.downloadsBase = Math.max(0, Number(pack.downloads) || 0);
  }
  pack.downloads = (Number(pack.downloadsBase) || base) + assetCount;
  pack.countedUrl = pack.downloadUrl;
  return pack.downloads;
}

console.log('\nA pack is published, downloaded, then updated');

let index = validateIndex({ packs: [validateRecord(submitted()).record] });
check('starts at zero', index.packs[0].downloads === 0);

applyCount(index.packs[0], 140);
check('counts what GitHub reports', index.packs[0].downloads === 140);

applyCount(index.packs[0], 210);
check('follows it upwards', index.packs[0].downloads === 210);

// The author fixes a caption and publishes again. New release, new asset.
index = applyUpdate(index, validateRecord(submitted({
  downloadUrl: 'https://github.com/someone/packs/releases/download/v2/a.zip',
  sha256: 'b'.repeat(64),
})).record);

check('the total survives the update itself', index.packs[0].downloads === 210,
  `was ${index.packs[0].downloads}`);
check('the total is banked for the next count', index.packs[0].downloadsBase === 210,
  `base was ${index.packs[0].downloadsBase}`);

// GitHub is counting the new file from scratch.
const after = applyCount(index.packs[0], 3);
check('a fresh asset adds to the total rather than replacing it', after === 213,
  `expected 213, got ${after}`);

const later = applyCount(index.packs[0], 60);
check('and keeps adding to it', later === 270, `expected 270, got ${later}`);

console.log('\nAnd the index still validates');
const whole = validateIndex({ packs: [index.packs[0]] });
check('nothing was dropped by validation', whole.packs.length === 1
  && whole.packs[0].downloads === 270 && whole.packs[0].downloadsBase === 210);

console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
process.exit(failures ? 1 : 0);
