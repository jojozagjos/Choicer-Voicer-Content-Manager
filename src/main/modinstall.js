'use strict';

/**
 * Downloading a shared pack and putting it into the game folder.
 *
 * Stage two of docs/PLATFORM_PLAN.md. Everything here treats the downloaded
 * file as hostile, because it came from a stranger over the internet and the
 * only thing vouching for it is a checksum in a record.
 *
 * The order is deliberate and each step refuses rather than repairs:
 *
 *   1. download    to a temp file, capped, from an allowed host only
 *   2. verify      SHA-256 against the record, refuse on mismatch
 *   3. inspect     entry list checked before a single byte is written
 *   4. extract     into a staging folder, each path checked individually
 *   5. identify    does the result actually look like the type it claims
 *   6. move        into the game folder, as one step
 *
 * Nothing lands anywhere the game reads until step 6, so a failure at any point
 * leaves the library exactly as it was.
 */

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const yauzl = require('yauzl');

const { safeEntryPath, checkArchiveShape, ALLOWED_HOSTS, LIMITS } = require('./directory');
const { identifyPack } = require('./create');

// A redirect chain has to end somewhere. GitHub release links take two hops.
const MAX_REDIRECTS = 5;

/**
 * The record's name inside a pack zip.
 *
 * Carrying it inside the archive is what makes a shared pack one file instead
 * of two. A zip without it still installs — it is metadata, not a requirement —
 * but then nobody can be told who made the pack or what it is.
 */
const RECORD_ENTRY = 'pack.record.json';

/**
 * A short summary of a pack's contents, for noticing when it changes.
 *
 * Size and modified time for every file, plus the details that end up in the
 * record. Cheap to compute and enough to catch any edit somebody actually made;
 * it would miss a file changed without its size or timestamp moving, which is
 * not something that happens by accident.
 */
function stampFor(packDir, details = {}) {
  const parts = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const s = fs.statSync(full);
        parts.push(`${path.relative(packDir, full)}:${s.size}:${Math.floor(s.mtimeMs)}`);
      }
    }
  };
  walk(packDir);

  // The record's own fields matter too: changing a summary should produce a new
  // zip even though no media moved.
  parts.push(`~${details.type}|${details.title}|${details.summary}|${details.author}`
    + `|${details.licence}|${(details.tags || []).join(',')}|${details.shrink !== false}`);

  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

function readStamp(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** A folder name reduced to something usable as an id. */
function idFor(folderName) {
  return String(folderName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/** Copies a folder recursively, for staging a pack without altering it. */
function copyFolder(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyFolder(src, dest);
    else if (entry.isFile()) fs.copyFileSync(src, dest);
  }
}

/** Whether a host is one packs may be served from. Shared with the validator. */
function hostAllowed(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.some((ok) => host === ok || host.endsWith(`.${ok}`));
}

/**
 * Downloads to a temp file, refusing anything that grows past the stated size.
 *
 * Every redirect is checked against the host list again. A first address on an
 * allowed host that redirects somewhere else would otherwise be a way straight
 * through the check that made the record acceptable.
 */
function download(url, destFile, { expectedBytes, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    // A little slack over the stated size, and a hard ceiling regardless, so a
    // lying record cannot fill the disk.
    const ceiling = Math.min(LIMITS.bytes, Math.max(expectedBytes * 1.05, expectedBytes + 65536));

    const go = (target, hop) => {
      let parsed;
      try {
        parsed = new URL(target);
      } catch {
        reject(new Error('That download address is not a web address'));
        return;
      }
      if (parsed.protocol !== 'https:') {
        reject(new Error('Downloads have to be https'));
        return;
      }
      if (!hostAllowed(parsed.hostname)) {
        reject(new Error(`This download redirected to ${parsed.hostname}, which packs cannot be served from`));
        return;
      }

      const request = https.get(target, {
        headers: { 'user-agent': 'ChoicerVoicerContentManager' },
      }, (response) => {
        const status = response.statusCode;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (hop >= MAX_REDIRECTS) { reject(new Error('That download redirects too many times')); return; }
          go(new URL(response.headers.location, target).toString(), hop + 1);
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`The download answered ${status}. The link may be dead.`));
          return;
        }

        const out = fs.createWriteStream(destFile);
        let written = 0;

        response.on('data', (chunk) => {
          written += chunk.length;
          if (written > ceiling) {
            request.destroy();
            out.destroy();
            reject(new Error('The download is larger than the record says it should be'));
            return;
          }
          if (onProgress && expectedBytes) {
            onProgress({ percent: Math.min(100, (written / expectedBytes) * 100) });
          }
        });

        response.pipe(out);
        out.on('finish', () => out.close(() => resolve({ bytes: written })));
        out.on('error', reject);
        response.on('error', reject);
      });

      request.on('error', (err) => reject(new Error(`Could not reach the download: ${err.message}`)));
      if (signal) {
        signal.addEventListener('abort', () => {
          request.destroy();
          const err = new Error('Cancelled');
          err.cancelled = true;
          reject(err);
        }, { once: true });
      }
    };

    go(url, 0);
  });
}

/** The SHA-256 of a file, as lower case hex. */
function checksum(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => {
      // Closed explicitly. On Windows a read stream left open holds the file,
      // and the next attempt to replace it fails with EPERM long after whatever
      // went wrong here has been forgotten.
      stream.destroy();
      reject(err);
    });
  });
}

/**
 * A zip path that can actually be written.
 *
 * Replacing the previous zip is the normal case, but it is not always possible:
 * something else may still be holding it open, and on Windows an open file
 * cannot be deleted or overwritten. Packaging takes minutes of re-encoding, so
 * discovering that at the end and throwing all of it away is the worst possible
 * outcome — far worse than a file with a number on the end.
 */
function availableZipPath(outDir, folderName) {
  const first = path.join(outDir, `${folderName}.zip`);

  if (!existsReally(first)) return first;
  try {
    fs.rmSync(first, { force: true });
    if (!existsReally(first)) return first;
  } catch { /* still there and not ours to remove */ }

  for (let n = 2; n < 100; n++) {
    const next = path.join(outDir, `${folderName} (${n}).zip`);
    if (!existsReally(next)) return next;
    try {
      fs.rmSync(next, { force: true });
      if (!existsReally(next)) return next;
    } catch { /* try the next number */ }
  }

  throw new Error('There are too many old copies of this pack in the exports folder.');
}

/**
 * Whether a path exists, treating "cannot tell" as "yes".
 *
 * `fs.existsSync` answers false for a file it is not allowed to look at, which
 * is exactly the file that must not be written over. Anything other than a
 * plain "not found" is taken as the file being there.
 */
function existsReally(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (err) {
    return err.code !== 'ENOENT';
  }
}

/** Reads the entry list without extracting, so the shape can be judged first. */
function listEntries(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) { reject(new Error(`That file is not a readable zip: ${err.message}`)); return; }

      const entries = [];
      zipfile.on('entry', (entry) => {
        const mode = (entry.externalFileAttributes >>> 16) & 0xF000;
        entries.push({
          name: entry.fileName,
          uncompressedSize: entry.uncompressedSize,
          compressedSize: entry.compressedSize,
          isDirectory: /\/$/.test(entry.fileName),
          // A link can point anywhere, which would put the path check back in
          // play after it has already passed.
          isSymlink: mode === 0xA000,
        });
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(entries));
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });
}

/**
 * Extracts into a folder, checking every entry's destination before writing it.
 *
 * The check is safeEntryPath, tested separately against every hostile name
 * worth trying. Nothing here writes a file whose path has not been through it.
 */
function extractInto(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) { reject(err); return; }

      const written = [];
      const finish = (error) => {
        zipfile.close();
        if (error) reject(error); else resolve(written);
      };

      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) { zipfile.readEntry(); return; } // a folder

        const decision = safeEntryPath(targetDir, entry.fileName);
        if (!decision.ok) { finish(new Error(`This pack contains ${decision.reason}`)); return; }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) { finish(streamErr); return; }
          fs.mkdirSync(path.dirname(decision.path), { recursive: true });
          const out = fs.createWriteStream(decision.path);
          readStream.pipe(out);
          out.on('finish', () => { written.push(decision.path); zipfile.readEntry(); });
          out.on('error', finish);
        });
      });

      zipfile.on('end', () => finish(null));
      zipfile.on('error', finish);
      zipfile.readEntry();
    });
  });
}

/**
 * The whole journey, from a record to a pack in the game folder.
 *
 * `record` has already been through validateRecord. `gameDir` is the folder the
 * app is pointed at. Returns where the pack landed.
 */
async function installFromRecord(record, gameDir, { onStage, onProgress, signal } = {}) {
  const stage = (name) => { if (onStage) onStage(name); };
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cvmod-'));
  const zipPath = path.join(scratch, 'pack.zip');
  const staging = path.join(scratch, 'unpacked');

  try {
    stage('downloading');
    await download(record.downloadUrl, zipPath, {
      expectedBytes: record.bytes, onProgress, signal,
    });

    stage('checking');
    const got = await checksum(zipPath);
    if (got !== record.sha256) {
      // Refused rather than warned about. This is the one thing standing between
      // the record somebody reviewed and the file that actually arrived.
      throw new Error(
        'This download does not match what the listing says it should be. It may have been '
        + 'changed since it was published, so it has not been installed.'
      );
    }

    return await unpackAndInstall(zipPath, gameDir, {
      expectType: record.type,
      describeSource: 'listing',
      onStage,
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * The half of installing that happens once a zip is on disk, wherever it came
 * from: inspect, unpack, identify, install.
 *
 * Shared by the directory path and the "somebody sent me this file" path so
 * that both get exactly the same safety checks. The checks are the point — a
 * zip handed over by a friend has had no review at all, so it is the case that
 * needs them most, not least.
 */
async function unpackAndInstall(zipPath, gameDir, { expectType, describeSource, onStage } = {}) {
  const stage = (name) => { if (onStage) onStage(name); };
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'cvunpack-'));

  try {
    stage('inspecting');
    const entries = await listEntries(zipPath);
    const shape = checkArchiveShape(entries);
    if (!shape.ok) throw new Error(`This pack looks wrong: ${shape.problems.join('; ')}`);

    stage('unpacking');
    await extractInto(zipPath, staging);

    // A zip may hold the pack at its root or inside one folder. Both are normal;
    // anything deeper is not a pack.
    let packRoot = staging;
    const top = fs.readdirSync(staging);
    if (top.length === 1 && fs.statSync(path.join(staging, top[0])).isDirectory()) {
      packRoot = path.join(staging, top[0]);
    }

    // The record travels inside the zip so a pack is one file rather than two,
    // but it describes the pack — it is not part of it, and the game has no use
    // for it. Read, then removed before anything is installed.
    let embedded = null;
    const embeddedAt = path.join(packRoot, RECORD_ENTRY);
    if (fs.existsSync(embeddedAt)) {
      try { embedded = JSON.parse(fs.readFileSync(embeddedAt, 'utf8')); } catch { embedded = null; }
      fs.rmSync(embeddedAt, { force: true });
    }

    stage('identifying');
    const actualType = identifyPack(packRoot);
    if (!actualType) {
      throw new Error('That file does not contain a pack this app recognises');
    }

    // What the files actually are always wins. The embedded record is metadata
    // written by whoever made the zip, so it is never allowed to be the reason
    // something installs — only a reason to refuse.
    const claimed = expectType || (embedded && embedded.type);
    if (claimed && claimed !== actualType) {
      throw new Error(
        `The ${describeSource || 'record'} calls this a ${claimed} pack, but the files are a ${actualType} pack.`
      );
    }

    stage('installing');
    const { installPack } = require('./create');
    const installed = installPack(gameDir, packRoot);
    return { ok: true, type: actualType, record: embedded, ...installed };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// The other direction: preparing a pack to be shared
// ---------------------------------------------------------------------------

/**
 * Zips a folder.
 *
 * The same reasoning as the release build: Windows ships bsdtar as tar.exe and
 * it handles these files without complaint, so nothing extra has to be carried
 * to write a zip. Addressed by full path because Git for Windows puts GNU tar,
 * which cannot write zips, earlier on PATH.
 */
function zipFolder(sourceDir, zipPath) {
  const { execFileSync } = require('child_process');
  const parent = path.dirname(sourceDir);
  const name = path.basename(sourceDir);

  const attempts = [];
  if (process.platform === 'win32') {
    const bsdtar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (fs.existsSync(bsdtar)) {
      attempts.push(() => execFileSync(bsdtar, ['-a', '-c', '-f', zipPath, '-C', parent, name],
        { stdio: 'ignore' }));
    }
  } else {
    attempts.push(() => execFileSync('zip', ['-r', '-q', zipPath, name],
      { cwd: parent, stdio: 'ignore' }));
    attempts.push(() => execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', parent, name],
      { stdio: 'ignore' }));
  }

  for (const attempt of attempts) {
    fs.rmSync(zipPath, { force: true });
    try {
      attempt();
    } catch { continue; }
    // Exit code alone is not enough; the build learned that the hard way.
    if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) return true;
  }
  return false;
}

/**
 * Packages a pack for sharing: a zip, and the record that describes it.
 *
 * Stops short of publishing, because publishing needs an account and a place to
 * put the file. What it produces is everything that is tedious and easy to get
 * wrong by hand — the checksum especially, which has to match the zip exactly
 * or nobody will be able to install it.
 *
 * The record comes back with the download address left blank, since only the
 * author knows where they are about to upload it.
 */
async function packForSharing(packDir, outDir, details) {
  const { validateRecord } = require('./directory');

  const folderName = path.basename(packDir);

  fs.mkdirSync(outDir, { recursive: true });

  // A pack that has not changed since it was last packaged does not need
  // re-encoding. On a large pack that is minutes of work to produce a file
  // identical to the one already sitting there.
  //
  // "Changed" is judged by every file's size and modified time, which is enough
  // to notice an edit without reading hundreds of megabytes to find out that
  // nothing happened.
  const stampPath = path.join(outDir, `.${folderName}.stamp.json`);
  const stamp = stampFor(packDir, details);
  if (details.reuse !== false) {
    const previous = readStamp(stampPath);
    if (previous && previous.stamp === stamp && fs.existsSync(previous.zipPath)) {
      const bytes = fs.statSync(previous.zipPath).size;
      return {
        ok: true,
        zipPath: previous.zipPath,
        recordPath: previous.recordPath,
        sha256: previous.sha256,
        bytes,
        // Said plainly so the interface can explain why it was instant, rather
        // than looking as though the shrink silently did nothing.
        reused: true,
        shrunk: previous.shrunk || null,
        problems: [],
      };
    }
  }

  // Settled before the expensive work starts, so a zip that cannot be replaced
  // is discovered now rather than after several minutes of re-encoding.
  const zipPath = availableZipPath(outDir, folderName);

  // Everything is staged, always. The zip needs a record inside it and the
  // author's own pack folder is never written to, so there has to be somewhere
  // else to assemble it even when nothing is being shrunk.
  //
  // The staged copy sits *inside* a scratch parent under its real name, because
  // the zip takes its top-level folder name from this directory. Zipping the
  // scratch folder itself would name the pack something like
  // ".Superman.stage.part", which is what it would then install as.
  const scratchParent = path.join(outDir, `.${folderName}.stage.part`);
  const scratch = path.join(scratchParent, folderName);
  fs.rmSync(scratchParent, { recursive: true, force: true });
  let shrunk = null;

  try {
    if (details.shrink !== false) {
      const { shrinkPack } = require('./shrink');
      try {
        shrunk = await shrinkPack(packDir, scratch, {
          signal: details.signal,
          onProgress: details.onProgress,
        });
      } catch (err) {
        if (details.signal && details.signal.aborted) throw err;
        // Sharing a big pack beats failing to share one, so a shrink that falls
        // over copies the pack across untouched rather than stopping.
        fs.rmSync(scratch, { recursive: true, force: true });
        copyFolder(packDir, scratch);
        shrunk = { failed: err.message };
      }
    } else {
      copyFolder(packDir, scratch);
    }

    // Written before zipping so the pack is a single file end to end. Deliberately
    // without sha256, bytes or downloadUrl: those describe how a copy travelled,
    // and the copy inside the zip has not travelled anywhere.
    const inner = {
      version: 1,
      id: idFor(folderName),
      type: details.type,
      title: details.title || folderName,
      summary: details.summary || '',
      description: details.description || '',
      author: details.author || '',
      licence: details.licence || 'unstated',
      tags: details.tags || [],
      gameVersion: details.gameVersion || null,
    };
    fs.writeFileSync(
      path.join(scratch, RECORD_ENTRY),
      `${JSON.stringify(inner, null, 2)}\n`,
      'utf8',
    );

    if (!zipFolder(scratch, zipPath)) {
      throw new Error('Could not make a zip of that pack on this machine');
    }
  } finally {
    fs.rmSync(scratchParent, { recursive: true, force: true });
  }

  const sum = await checksum(zipPath);
  const bytes = fs.statSync(zipPath).size;
  const now = new Date().toISOString();

  const record = {
    version: 1,
    id: idFor(folderName),
    type: details.type,
    title: details.title || folderName,
    summary: details.summary || '',
    description: details.description || '',
    author: details.author || '',
    licence: details.licence || 'unstated',
    tags: details.tags || [],
    // Filled in once the zip has been uploaded somewhere. Left obviously blank
    // rather than guessed at.
    downloadUrl: '',
    sha256: sum,
    bytes,
    gameVersion: details.gameVersion || null,
    published: now,
    updated: now,
    downloads: 0,
  };

  const recordPath = path.join(outDir, `${folderName}.record.json`);
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  // Remembered so an unchanged pack does not have to be re-encoded next time.
  try {
    fs.writeFileSync(stampPath, `${JSON.stringify({
      stamp, zipPath, recordPath, sha256: sum, shrunk,
    }, null, 2)}\n`);
  } catch { /* losing this only costs time later */ }

  // Checked with a stand-in address, so everything except the upload is known
  // to be right before publishing is attempted.
  //
  // The stand-in is built from the author rather than being a fixed string,
  // because a record has to be hosted by the person it credits. A generic
  // placeholder fails that check every time and reports an impersonation
  // problem about a URL that does not exist yet.
  const owner = (record.author || 'someone').toLowerCase();
  const dryRun = validateRecord({
    ...record,
    downloadUrl: `https://github.com/${owner}/packs/releases/download/v1/pack.zip`,
  });

  return {
    ok: true,
    zipPath,
    recordPath,
    sha256: sum,
    bytes,
    reused: false,
    // Reported so the author can be told what the wait bought them, and so a
    // shrink that quietly fell back to the original is visible rather than
    // looking like a shrink that simply achieved nothing.
    shrunk,
    problems: dryRun.ok ? [] : dryRun.problems,
  };
}

module.exports = {
  download,
  checksum,
  listEntries,
  extractInto,
  availableZipPath,
  existsReally,
  installFromRecord,
  packForSharing,
};
