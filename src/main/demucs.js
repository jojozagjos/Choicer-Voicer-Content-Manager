'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const yauzl = require('yauzl');
const { download, checksum, listEntries } = require('./modinstall');

const RELEASE = Object.freeze({
  version: 'v0.3.4',
  url: 'https://github.com/nikhilunni/demucs-rs/releases/download/v0.3.4/demucs-x86_64-pc-windows-msvc.zip',
  zipBytes: 11036578,
  zipSha256: '67e77186295a00758df0b760f3345fd0b9081b328f923ecc35307f6190f472d1',
  exeBytes: 33881088,
  exeSha256: '69f81431b4fc568973622e90b25495b8b44e621ab34803a4bb7bc1236d9c6630',
  modelBytes: 84030696,
  modelSha256: '8193504cdfb3943adaf039b8acb524a46e87ebf232c383ac7a32c80a6578423e',
});

function supported() {
  return process.platform === 'win32' && process.arch === 'x64';
}

function modelPath() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'demucs-rs', 'htdemucs.safetensors');
}

function binaryPath(root) {
  return path.join(root, 'demucs-rs', RELEASE.version, 'demucs.exe');
}

function status(root) {
  const exe = binaryPath(root);
  const model = modelPath();
  const correctSize = (file, bytes) => {
    try { return fs.statSync(file).size === bytes; } catch { return false; }
  };

  return {
    supported: supported(),
    reason: supported() ? null : 'AI separation currently needs 64-bit Windows.',
    installed: correctSize(exe, RELEASE.exeBytes),
    modelInstalled: correctSize(model, RELEASE.modelBytes),
    downloadBytes: RELEASE.zipBytes + RELEASE.modelBytes,
    version: RELEASE.version,
  };
}

async function verify(file, bytes, sha256, label) {
  let size = 0;
  try { size = fs.statSync(file).size; } catch { throw new Error(`${label} is missing`); }
  if (size !== bytes) throw new Error(`${label} has the wrong size`);
  if (await checksum(file) !== sha256) throw new Error(`${label} failed its safety check`);
}

function extractBinary(zip, target) {
  return new Promise((resolve, reject) => {
    yauzl.open(zip, { lazyEntries: true }, (openError, archive) => {
      if (openError) { reject(openError); return; }
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        archive.close();
        if (error) reject(error); else resolve();
      };
      archive.on('entry', (entry) => {
        if (entry.fileName !== 'demucs.exe') {
          finish(new Error('The AI separator download has unexpected contents'));
          return;
        }
        archive.openReadStream(entry, (streamError, input) => {
          if (streamError) { finish(streamError); return; }
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const output = fs.createWriteStream(target);
          input.on('error', finish);
          output.on('error', finish);
          output.on('close', () => finish(null));
          input.pipe(output);
        });
      });
      archive.on('error', finish);
      archive.readEntry();
    });
  });
}

async function ensureBinary(root, { signal, onProgress, onStage } = {}) {
  if (!supported()) throw new Error('AI separation currently needs 64-bit Windows. Use Muffle on this computer.');

  const target = binaryPath(root);
  if (fs.existsSync(target)) {
    try {
      await verify(target, RELEASE.exeBytes, RELEASE.exeSha256, 'The AI separator');
      return target;
    } catch {
      fs.rmSync(target, { force: true });
    }
  }

  fs.mkdirSync(root, { recursive: true });
  const stage = fs.mkdtempSync(path.join(root, 'demucs-install-'));
  const zip = path.join(stage, 'demucs.zip');
  const extracted = path.join(stage, 'extracted');

  try {
    if (onStage) onStage({ stage: 'download', percent: 5 });
    await download(RELEASE.url, zip, {
      expectedBytes: RELEASE.zipBytes,
      signal,
      onProgress: ({ percent }) => {
        if (onProgress) onProgress({ percent });
      },
    });
    await verify(zip, RELEASE.zipBytes, RELEASE.zipSha256, 'The AI separator download');

    const entries = await listEntries(zip);
    if (entries.length !== 1 || entries[0].name !== 'demucs.exe'
        || entries[0].isDirectory || entries[0].isSymlink
        || entries[0].uncompressedSize !== RELEASE.exeBytes) {
      throw new Error('The AI separator download has unexpected contents');
    }

    if (onStage) onStage({ stage: 'install', percent: 10 });
    await extractBinary(zip, path.join(extracted, 'demucs.exe'));
    const unpacked = path.join(extracted, 'demucs.exe');
    await verify(unpacked, RELEASE.exeBytes, RELEASE.exeSha256, 'The AI separator');

    fs.mkdirSync(path.dirname(target), { recursive: true });
    const partial = `${target}.part`;
    fs.copyFileSync(unpacked, partial);
    await verify(partial, RELEASE.exeBytes, RELEASE.exeSha256, 'The installed AI separator');
    fs.renameSync(partial, target);
    return target;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

async function verifyModel() {
  const file = modelPath();
  if (!fs.existsSync(file)) return false;
  try {
    await verify(file, RELEASE.modelBytes, RELEASE.modelSha256, 'The HTDemucs model');
    return true;
  } catch (err) {
    fs.rmSync(file, { force: true });
    throw err;
  }
}

function separate(binary, input, outputDir, { signal, onStage } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      const err = new Error('Cancelled');
      err.cancelled = true;
      reject(err);
      return;
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const child = spawn(binary, [input, '--model', 'htdemucs', '--output', outputDir], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    let cancelled = false;

    const read = (chunk) => {
      log = `${log}${chunk.toString()}`.slice(-16000);
      if (!onStage) return;
      if (/Downloading model/i.test(log)) onStage({ stage: 'model', percent: 12 });
      else if (/Loading model/i.test(log)) onStage({ stage: 'load', percent: 16 });
      if (/Separating/i.test(log)) onStage({ stage: 'separate', percent: 20 });
      const written = (log.match(/\bWrote\b/g) || []).length;
      if (written) onStage({ stage: 'write', percent: 65 + Math.min(4, written) * 6 });
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);

    const abort = () => {
      cancelled = true;
      child.kill('SIGKILL');
    };
    if (signal) signal.addEventListener('abort', abort, { once: true });

    child.on('error', reject);
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', abort);
      if (cancelled || (signal && signal.aborted)) {
        const err = new Error('Cancelled');
        err.cancelled = true;
        reject(err);
        return;
      }
      if (code !== 0) {
        reject(new Error(`The AI separator stopped unexpectedly. ${log.trim()}`));
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  RELEASE,
  status,
  ensureBinary,
  verifyModel,
  separate,
};
