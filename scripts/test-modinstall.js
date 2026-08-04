'use strict';

/**
 * Checks the extractor against zips built to get past it.
 *
 *   node scripts/test-modinstall.js
 *
 * The zips are written here by hand rather than with a library, because no
 * library will let you put `../../evil.wav` in an entry name — which is the
 * exact thing that has to be tested. A stored (uncompressed) zip is a local
 * header, the bytes, and a central directory, so forging one is short.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const {
  extractInto, listEntries, checksum, availableZipPath, existsReally,
} = require('../src/main/modinstall');

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

/**
 * Writes a zip containing exactly the entries given, names unaltered.
 *
 * Stored, not deflated, so there is no compression to get wrong. Everything is
 * little endian, which is what the zip format asks for.
 */
function forgeZip(file, entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const body = Buffer.from(data, 'utf8');
    const crc = zlib.crc32 ? zlib.crc32(body) : crc32(body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(0, 8);            // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); // compressed
    local.writeUInt32LE(body.length, 22); // uncompressed
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(file, Buffer.concat([...locals, centralBuf, end]));
}

/** CRC-32, for Node versions without zlib.crc32. */
function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cvziptest-'));

async function tryExtract(name, entries) {
  const zip = path.join(root, `${name}.zip`);
  const into = path.join(root, name);
  forgeZip(zip, entries);
  fs.mkdirSync(into, { recursive: true });
  try {
    await extractInto(zip, into);
    return { ok: true, into, zip };
  } catch (err) {
    return { ok: false, error: err.message, into, zip };
  }
}

(async () => {
  console.log('\nA normal pack');
  {
    const r = await tryExtract('good', [
      { name: 'dub_video.ogv', data: 'video' },
      { name: 'clips/01_line.wav', data: 'audio' },
    ]);
    check('an ordinary pack extracts', r.ok, r.error);
    check('the file is where it should be',
      fs.existsSync(path.join(r.into, 'clips', '01_line.wav')));
  }

  console.log('\nZips built to escape the folder');
  {
    // The canonical attack. If this passes, the extractor writes outside the
    // folder it was told to write into.
    const r = await tryExtract('escape', [
      { name: 'ok.wav', data: 'fine' },
      { name: '../../escaped.wav', data: 'should never be written' },
    ]);
    // Asserted by outcome rather than by message, because two layers refuse
    // this independently: yauzl rejects a relative path that climbs out, and
    // safeEntryPath refuses it again if it ever gets past. Either is a pass;
    // which one fired is not the point.
    check('an entry climbing out is refused', !r.ok, 'it extracted, which is the bug');
    check('nothing landed outside the folder',
      !fs.existsSync(path.join(root, 'escaped.wav')));
    check('the refusal is readable', typeof r.error === 'string' && r.error.length > 0);
  }
  {
    const r = await tryExtract('absolute', [
      { name: 'C:/Windows/System32/evil.wav', data: 'no' },
    ]);
    check('an absolute path is refused', !r.ok);
  }
  {
    const r = await tryExtract('backslash', [
      { name: '..\\..\\evil.wav', data: 'no' },
    ]);
    check('backslash climbing is refused', !r.ok);
    check('nothing landed outside', !fs.existsSync(path.join(root, 'evil.wav')));
  }
  {
    const r = await tryExtract('deepescape', [
      { name: 'clips/../../../evil.wav', data: 'no' },
    ]);
    check('climbing part way through a path is refused', !r.ok);
  }

  console.log('\nZips carrying things the game does not read');
  {
    const r = await tryExtract('exe', [{ name: 'installer.exe', data: 'MZ' }]);
    check('an executable is refused', !r.ok);
    check('the refusal explains itself', /not a file the game reads/.test(r.error || ''));
  }
  {
    const r = await tryExtract('device', [{ name: 'CON.wav', data: 'x' }]);
    check('a Windows device name is refused', !r.ok);
  }

  console.log('\nReading a zip without extracting it');
  {
    const zip = path.join(root, 'list.zip');
    forgeZip(zip, [
      { name: 'a.wav', data: 'aaaa' },
      { name: 'clips/b.wav', data: 'bb' },
    ]);
    const entries = await listEntries(zip);
    check('every entry is listed', entries.length === 2);
    check('names come through', entries.some((e) => e.name === 'clips/b.wav'));
    check('sizes come through', entries[0].uncompressedSize === 4);
  }
  {
    // Reading the list must fail cleanly rather than throwing something raw,
    // since a hostile zip reaches this before anything is unpacked.
    const zip = path.join(root, 'listbad.zip');
    forgeZip(zip, [{ name: '../b.wav', data: 'bb' }]);
    let failed = null;
    try { await listEntries(zip); } catch (err) { failed = err; }
    check('a hostile zip is refused when listed', failed !== null);
    check('and refused with a message', failed && typeof failed.message === 'string');
  }

  console.log('\nChecksums');
  {
    const file = path.join(root, 'sum.bin');
    fs.writeFileSync(file, 'hello');
    const sum = await checksum(file);
    // The known SHA-256 of "hello".
    check('sha256 matches a known value',
      sum === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', sum);
  }

  console.log('\nChoosing where the zip goes');

  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zippath-'));

    check('a free name is used as-is',
      path.basename(availableZipPath(dir, 'Pack')) === 'Pack.zip');

    // An old zip that can be deleted is replaced, which is the normal case.
    fs.writeFileSync(path.join(dir, 'Pack.zip'), 'old');
    check('a removable old zip is replaced',
      path.basename(availableZipPath(dir, 'Pack')) === 'Pack.zip');
    check('  and it really was removed',
      !fs.existsSync(path.join(dir, 'Pack.zip')));

    // One that cannot be removed must not stop packaging. Simulated by making
    // the path a non-empty directory, which rmSync without recursive refuses —
    // the real cause on Windows is a file another process still has open, which
    // cannot be staged here.
    const blocked = path.join(dir, 'Blocked.zip');
    fs.mkdirSync(blocked);
    fs.writeFileSync(path.join(blocked, 'inside'), 'x');
    const fallback = path.basename(availableZipPath(dir, 'Blocked'));
    check('an unremovable old zip falls back to a number',
      fallback === 'Blocked (2).zip',
      `got ${fallback} — packaging must never be lost to a stale file`);

    check('existsReally sees a file that is there',
      existsReally(path.join(dir, 'Blocked.zip')));
    check('existsReally says no for a missing file',
      !existsReally(path.join(dir, 'nope.zip')));

    fs.rmSync(dir, { recursive: true, force: true });
  }

  fs.rmSync(root, { recursive: true, force: true });

  console.log(`\n${checks - failures}/${checks} passed`);
  if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
})();
