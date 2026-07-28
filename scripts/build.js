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
  // The icon is baked into the exe by the packager, so the sources that made
  // it do not need to ship inside the app as well.
  /^\/assets($|\/)/,
  /^\/build($|\/)/,
  /^\/README\.md$/,
  /^\/THIRD-PARTY-NOTICES\.md$/,
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

/**
 * Puts the licences of everything the build carries into `licenses/`.
 *
 * This is not decoration. The bundled ffmpeg is a GPL v3 build, and shipping it
 * without its licence text and an offer of corresponding source does not meet
 * the terms. The About screen claimed this was happening long before anything
 * actually copied a file, so the check below fails the build rather than
 * letting that drift back.
 */
function copyLicenses(appDir) {
  const dest = path.join(appDir, 'licenses');
  fs.mkdirSync(dest, { recursive: true });

  const wanted = [
    {
      as: 'FFmpeg-GPLv3.txt',
      from: path.join(ROOT, 'node_modules', 'ffmpeg-static', 'LICENSE'),
      required: true,
    },
    {
      as: 'THIRD-PARTY-NOTICES.md',
      from: path.join(ROOT, 'THIRD-PARTY-NOTICES.md'),
      required: true,
    },
    {
      as: 'Choicer-Voicer-Content-Manager-LICENSE.txt',
      from: path.join(ROOT, 'LICENSE'),
      required: true,
    },
    {
      as: 'ffprobe-static-LICENSE.txt',
      from: path.join(ROOT, 'node_modules', 'ffprobe-static', 'LICENSE'),
      required: false,
    },
    {
      as: 'Electron-LICENSE.txt',
      from: path.join(ROOT, 'node_modules', 'electron', 'dist', 'LICENSE'),
      required: false,
    },
  ];

  const copied = [];
  for (const item of wanted) {
    if (!fs.existsSync(item.from)) {
      if (item.required) {
        throw new Error(
          `Cannot ship a build without ${item.as}: ${item.from} is missing. `
          + 'The bundled ffmpeg is GPL v3 and its licence has to travel with it.'
        );
      }
      continue;
    }
    fs.copyFileSync(item.from, path.join(dest, item.as));
    copied.push(item.as);
  }

  // Sanity check the ffmpeg licence really is the GPL, in case the upstream
  // package ever switches to an LGPL build without us noticing.
  const gpl = fs.readFileSync(path.join(dest, 'FFmpeg-GPLv3.txt'), 'utf8');
  if (!/GNU GENERAL PUBLIC LICENSE/i.test(gpl)) {
    throw new Error('The ffmpeg licence file does not look like the GPL. Check what changed.');
  }

  return copied;
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
    icon: path.join(ROOT, 'assets', 'icon'),
    // Windows shows these in the file properties and in SmartScreen prompts,
    // which for an unsigned app is often the first thing anyone reads about
    // it. Saying plainly that it is a fan tool belongs there too.
    //
    // The copyright is its own top level option rather than part of
    // win32metadata; putting it in the latter is silently ignored and leaves
    // Electron's own copyright on the file.
    appCopyright: `Copyright (c) ${new Date().getFullYear()} jojozagjos. MIT licensed. `
      + 'Unofficial fan tool, not affiliated with or endorsed by Yeah Maybe. '
      + 'Includes FFmpeg under the GPL v3, see the licenses folder.',
    win32metadata: {
      CompanyName: 'jojozagjos',
      FileDescription: pkg.description,
      ProductName: APP_NAME,
    },
  });

  const appDir = path.join(OUT, APP_NAME);
  moveInto(built, appDir);
  fs.rmSync(staging, { recursive: true, force: true });

  const licenses = copyLicenses(appDir);

  const exe = path.join(appDir, `${APP_NAME}${platform === 'win32' ? '.exe' : ''}`);
  console.log('\nApp built:');
  console.log(`  ${exe}`);
  console.log(`\nLicences shipped in licenses/: ${licenses.join(', ')}`);
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
