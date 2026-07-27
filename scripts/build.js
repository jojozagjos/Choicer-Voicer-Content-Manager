'use strict';

/**
 * Builds the standalone app.
 *
 *   npm run build         the app folder, ready to run
 *   npm run build:zip     the same, plus a zip to attach to a GitHub release
 *
 * Two things need care:
 *
 * 1. ffmpeg and ffprobe must sit OUTSIDE app.asar. Binaries inside an asar
 *    archive cannot be executed, and the app shells out to both.
 * 2. ffprobe-static ships binaries for every platform. Only the one we're
 *    building for is worth carrying, which takes the build from roughly
 *    450 MB down to something sane.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { packager } = require('@electron/packager');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));

const APP_NAME = 'Choicer Voicer Content Manager';
const platform = process.platform;
const arch = process.arch;

const WANT_ZIP = process.argv.includes('--zip');

// Building into a synced folder means the sync client uploads ~400 MB and can
// lock files mid-build. Staged in temp, then moved into place.
const OUT = process.env.CV_BUILD_OUT || path.join(ROOT, 'dist');

// Drop the platform and architecture binaries we are not shipping.
const otherPlatforms = ['darwin', 'linux', 'win32'].filter((p) => p !== platform);
const otherArchs = ['ia32', 'x64', 'arm64'].filter((a) => a !== arch);

const ignore = [
  /^\/dist($|\/)/,
  /^\/\.git($|\/)/,
  /^\/\.claude($|\/)/,
  /^\/scripts($|\/)/,
  /^\/docs($|\/)/,
  /^\/README\.md$/,
  new RegExp(`^/node_modules/ffprobe-static/bin/(${otherPlatforms.join('|')})($|/)`),
  new RegExp(`^/node_modules/ffprobe-static/bin/[^/]+/(${otherArchs.join('|')})($|/)`),
];

function moveInto(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch {
    fs.cpSync(from, to, { recursive: true }); // different volume
    fs.rmSync(from, { recursive: true, force: true });
  }
}

/** Zips the built folder so it can be attached to a release. */
function makeZip(appDir, zipPath) {
  const sevenZip = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  if (platform === 'win32' && fs.existsSync(sevenZip)) {
    execFileSync(sevenZip, ['a', '-tzip', '-mx=5', zipPath, appDir], { stdio: 'ignore' });
    return true;
  }

  // Fall back to whatever the platform provides.
  try {
    if (platform === 'win32') {
      execFileSync('powershell', [
        '-NoProfile', '-Command',
        `Compress-Archive -Path "${appDir}" -DestinationPath "${zipPath}" -Force`,
      ], { stdio: 'ignore' });
    } else {
      execFileSync('zip', ['-r', '-q', zipPath, path.basename(appDir)], {
        cwd: path.dirname(appDir), stdio: 'ignore',
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'cvcm-build-'));

  const [built] = await packager({
    dir: ROOT,
    out: staging,
    name: APP_NAME,
    appVersion: pkg.version,
    overwrite: true,
    prune: true,
    asar: {
      // Everything these two packages ship stays on disk as real files.
      unpack: '**/node_modules/{ffmpeg-static,ffprobe-static}/**',
    },
    ignore,
    win32metadata: {
      CompanyName: 'jojozagjos',
      FileDescription: pkg.description,
      ProductName: APP_NAME,
    },
  });

  const appDir = path.join(OUT, APP_NAME);
  moveInto(built, appDir);
  fs.rmSync(staging, { recursive: true, force: true });

  const exe = path.join(appDir, `${APP_NAME}${platform === 'win32' ? '.exe' : ''}`);
  console.log('\nApp built:');
  console.log(`  ${exe}`);
  console.log('\nThe whole folder is the app. Move, copy or zip it as one piece.');

  if (WANT_ZIP) {
    const zipName = `${APP_NAME.replace(/ /g, '_')}_v${pkg.version}_${platform}_${arch}.zip`;
    const zipPath = path.join(OUT, zipName);
    fs.rmSync(zipPath, { force: true });
    process.stdout.write('\nZipping for release... ');
    if (makeZip(appDir, zipPath)) {
      const mb = (fs.statSync(zipPath).size / 1e6).toFixed(0);
      console.log('done');
      console.log(`  ${zipPath} (${mb} MB)`);
      console.log('\nAttach that zip to a GitHub release. Do not commit it: files');
      console.log('over 100 MB are rejected by git.');
    } else {
      console.log('failed (zip it yourself)');
    }
  }
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message || err}`);
  process.exit(1);
});
