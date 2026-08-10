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
  // assets/ ships: the app draws its own icon, the character placeholder and
  // the pack type icons from there. Only the inputs that made the .ico are left
  // out, since the packager bakes that into the exe and nothing reads it at
  // runtime.
  /^\/assets\/app\/icon-source\.png$/,
  /^\/assets\/app\/icon\.ico$/,
  /^\/build($|\/)/,
  // docs/ is already excluded above, which covers the notices file living
  // there now; it is copied into licenses/ by copyLicenses instead.
  /^\/README\.md$/,
  /^\/\.gitignore$/,
  // Lives in src/main because the directory's workflows fetch it from there, so
  // that the rule for unlisting a dead link has one definition rather than two.
  // The app itself never loads it, so there is no reason to ship it.
  /^\/src\/main\/linkhealth\.js$/,
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
      from: path.join(ROOT, 'docs', 'THIRD-PARTY-NOTICES.md'),
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

/**
 * Zips the built folder so it can be attached to a release.
 *
 * PowerShell's Compress-Archive is deliberately not used. Zip stores times in
 * the old MS-DOS format, which cannot represent anything before 1980, and
 * Electron dates all of its own files 1979-12-31 so its builds come out
 * reproducible. Compress-Archive treats that as fatal, so it can never zip an
 * Electron app. Worse, it fails as a non-terminating error, so PowerShell
 * still exits 0 and the failure only surfaced later as a missing file.
 *
 * bsdtar has shipped in Windows as tar.exe since Windows 10 1803 and handles
 * those timestamps without complaint. It is addressed by full path because Git
 * for Windows puts GNU tar, which cannot write zips, earlier on PATH.
 */
/**
 * Drops the Chromium translations this app has no use for.
 *
 * Electron ships a `.pak` per language it supports, 55 of them, together about
 * 47 MB. They translate Chromium's own interface: the right-click menu, its
 * error pages, the print dialog. This app is written in English throughout and
 * has no way to be in anything else, so 54 of them are 47 MB of a download
 * nobody will ever see the effect of.
 *
 * en-US stays. Chromium falls back to it, and removing the one it falls back
 * to is the way this optimisation turns into a crash report.
 */
function dropUnusedLocales(appDir) {
  const dir = path.join(appDir, 'locales');
  const keep = new Set(['en-US.pak']);

  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return { dropped: 0, bytes: 0 }; // no locales folder on this platform
  }

  let dropped = 0;
  let bytes = 0;
  for (const name of files) {
    if (keep.has(name) || !name.endsWith('.pak')) continue;
    const full = path.join(dir, name);
    bytes += fs.statSync(full).size;
    fs.rmSync(full, { force: true });
    dropped++;
  }

  // Losing the fallback would leave Chromium with no strings at all, so this
  // is checked rather than assumed. Better a failed build than a release that
  // starts to a blank window on somebody else's machine.
  if (!fs.existsSync(path.join(dir, 'en-US.pak'))) {
    throw new Error('locales/en-US.pak is missing, so the app would have no interface strings');
  }

  return { dropped, bytes };
}

function makeZip(appDir, zipPath) {
  const parent = path.dirname(appDir);
  const name = path.basename(appDir);

  const attempts = [];

  if (platform === 'win32') {
    const bsdtar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (fs.existsSync(bsdtar)) {
      attempts.push({
        what: 'tar',
        run: () => execFileSync(bsdtar, ['-a', '-c', '-f', zipPath, '-C', parent, name],
          { stdio: 'ignore' }),
      });
    }
    const sevenZip = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
    if (fs.existsSync(sevenZip)) {
      attempts.push({
        what: '7za',
        run: () => execFileSync(sevenZip, ['a', '-tzip', '-mx=5', zipPath, appDir],
          { stdio: 'ignore' }),
      });
    }
  } else {
    attempts.push({
      what: 'zip',
      run: () => execFileSync('zip', ['-r', '-q', zipPath, name], { cwd: parent, stdio: 'ignore' }),
    });
    attempts.push({
      what: 'tar',
      run: () => execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', parent, name],
        { stdio: 'ignore' }),
    });
  }

  for (const attempt of attempts) {
    fs.rmSync(zipPath, { force: true });
    try {
      attempt.run();
    } catch (err) {
      console.log(`\n  ${attempt.what} failed: ${err.message.split('\n')[0]}`);
      continue;
    }
    // Exit code alone is not enough: the tool that used to be here reported
    // success and produced nothing.
    if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) return attempt.what;
    console.log(`\n  ${attempt.what} exited cleanly but wrote no archive`);
  }

  return null;
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
    icon: path.join(ROOT, 'assets', 'app', 'icon'),
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
  const droppedLocales = dropUnusedLocales(appDir);

  const exe = path.join(appDir, `${APP_NAME}${platform === 'win32' ? '.exe' : ''}`);
  console.log('\nApp built:');
  console.log(`  ${exe}`);
  console.log(`\nLicences shipped in licenses/: ${licenses.join(', ')}`);
  if (droppedLocales.dropped) {
    console.log(`Dropped ${droppedLocales.dropped} unused Chromium translations `
      + `(${(droppedLocales.bytes / 1e6).toFixed(0)} MB)`);
  }
  console.log('\nThe whole folder is the app. Move, copy or zip it as one piece.');

  if (WANT_ZIP) {
    const zipName = `${APP_NAME.replace(/ /g, '_')}_v${pkg.version}_${platform}_${arch}.zip`;
    const zipPath = path.join(OUT, zipName);
    fs.rmSync(zipPath, { force: true });
    process.stdout.write('\nZipping for release... ');

    const used = makeZip(appDir, zipPath);
    if (used) {
      const mb = (fs.statSync(zipPath).size / 1e6).toFixed(0);
      console.log(`done (${used})`);
      console.log(`  ${zipPath} (${mb} MB)`);
      console.log('\nAttach that zip to a GitHub release. Do not commit it: files');
      console.log('over 100 MB are rejected by git.');
    } else {
      console.log('failed');
      console.log('\nNothing available could write the archive. Zip the app folder yourself:');
      console.log(`  ${appDir}`);
      console.log('\nRight click it in Explorer and choose Send to, Compressed folder, will not');
      console.log('work here: Electron dates its files 1979 and the built in zip refuses those.');
      console.log('Use 7-Zip or WinRAR instead.');
    }
  }
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message || err}`);
  process.exit(1);
});
