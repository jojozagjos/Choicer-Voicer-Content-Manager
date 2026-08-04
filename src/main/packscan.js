'use strict';

/**
 * Looks over an unpacked pack and reports anything a reviewer should know
 * before listing it.
 *
 * This is **not** a virus scanner and must not be described as one. Anything
 * genuinely dangerous — a path escaping the folder, a symlink, a zip bomb, an
 * executable extension — is refused outright before extraction ever happens,
 * by `directory.js` and `modinstall.js`. By the time anything reaches here, the
 * archive has already passed those checks.
 *
 * What is left is the softer question: is this pack *right*. Empty audio, a
 * video that is silent, a picture the game cannot use, a name designed to
 * mislead. None of those are attacks and none should refuse a pack on their
 * own; they are things worth a second look from the person deciding.
 *
 * Pure, so every rule can be tested without unpacking anything.
 */

const path = require('path');

/** What the game actually reads. Anything else is passenger weight. */
const KNOWN_EXTS = new Set([
  '.ogv', '.mp4', '.wav', '.mp3', '.ogg', '.opus',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.ini', '.txt', '.json', '.cfg', '.glb', '.gltf',
]);

/** A file this small is almost certainly empty rather than short. */
const TINY_BYTES = 1024;

/** Characters that make a name read as something other than what it is. */
const DECEPTIVE = /[‪-‮⁦-⁩​-‏]/;

const LEVELS = { note: 0, warn: 1, alarm: 2 };

/**
 * Reports on a pack.
 *
 * `findings` are ordered worst first. `worst` is what the interface should lead
 * with, and is `null` when there is nothing to say — which is the normal
 * outcome and should look like one rather than like a pass mark.
 */
function scanPack({ files = [], type = null, claimedType = null, captions = [] } = {}) {
  const findings = [];
  const add = (level, what, detail) => findings.push({ level, what, detail });

  const total = files.reduce((n, f) => n + (f.bytes || 0), 0);
  const named = (f) => path.basename(f.name);

  // The one thing here that genuinely matters: the files are not what the
  // record says they are. Everything else is advisory.
  if (claimedType && type && claimedType !== type) {
    add('alarm', 'Not the kind of pack it says it is',
      `The record calls this a ${claimedType} pack, but the files are a ${type} pack.`);
  }
  if (!type) {
    add('alarm', 'Not recognisable as a pack',
      'Nothing in here matches the shape of any pack the game reads.');
  }

  const strange = files.filter((f) => !KNOWN_EXTS.has(path.extname(f.name).toLowerCase()));
  if (strange.length) {
    add('warn', `${strange.length} file${strange.length === 1 ? '' : 's'} the game does not read`,
      strange.slice(0, 6).map(named).join(', ') + (strange.length > 6 ? ', …' : ''));
  }

  const empty = files.filter((f) => (f.bytes || 0) < TINY_BYTES
    && /\.(wav|mp3|ogg|opus|ogv|mp4|png|jpg|jpeg)$/i.test(f.name));
  if (empty.length) {
    add('warn', `${empty.length} media file${empty.length === 1 ? '' : 's'} look empty`,
      empty.slice(0, 6).map(named).join(', ') + (empty.length > 6 ? ', …' : ''));
  }

  // A name with a direction override in it can be made to display backwards,
  // so a reviewer reads something other than what is there.
  const deceptive = files.filter((f) => DECEPTIVE.test(f.name));
  if (deceptive.length) {
    add('alarm', 'File names contain hidden characters',
      'These can make a name display as something other than what it is.');
  }

  const spoken = captions.map((c) => c.text || '').join('\n');
  if (captions.length && !spoken.trim()) {
    add('note', 'Captions are empty', 'There is nothing written for anyone to read.');
  }

  if (!files.length) add('alarm', 'The pack is empty', 'There are no files in it at all.');

  findings.sort((a, b) => LEVELS[b.level] - LEVELS[a.level]);

  return {
    findings,
    worst: findings.length ? findings[0].level : null,
    counts: {
      files: files.length,
      bytes: total,
      strange: strange.length,
      empty: empty.length,
    },
  };
}

module.exports = { scanPack, KNOWN_EXTS, TINY_BYTES, LEVELS };
