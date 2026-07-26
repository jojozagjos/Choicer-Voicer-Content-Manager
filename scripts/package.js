'use strict';

/**
 * Builds the standalone app with @electron/packager.
 *
 *   node scripts/package.js              build into dist/
 *   node scripts/package.js --install    build, then replace the installed app
 *
 * Two things need care:
 *
 * 1. ffmpeg and ffprobe must sit OUTSIDE app.asar. Binaries inside an asar
 *    archive cannot be executed, and the app shells out to both.
 * 2. ffprobe-static ships binaries for every platform. Only the one we're
 *    building for is worth carrying, which takes the build from roughly
 *    450 MB down to something sane.
 *
 * electron-builder is the nicer tool but needs symlink privileges on Windows
 * to unpack its code-signing bundle, which means Developer Mode or an admin
 * shell. This route has no such requirement.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { packager } = require('@electron/packager');

const ROOT = path.join(__dirname, '..');
const platform = process.platform;
const arch = process.arch;
const APP_NAME = 'Choicer Voicer Export';

const INSTALL = process.argv.includes('--install');

// Where the finished app lives once installed. Sits beside the repo by
// default, which keeps a 400 MB build out of git's way.
const INSTALL_DIR = process.env.CV_INSTALL_DIR || path.join(ROOT, '..', APP_NAME);

// Installing stages the build in a temp folder first. That dodges the file
// locks a sync client puts on the destination while it uploads.
const OUT = INSTALL
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'cv-build-'))
  : (process.env.CV_BUILD_OUT || path.join(ROOT, 'dist'));

if (!INSTALL && /onedrive|dropbox|google drive/i.test(OUT)) {
  console.warn(
    `\nHeads up: the build output is inside a synced folder.\n  ${OUT}\n`
    + 'Your sync client may lock files and fail the build, and it will upload\n'
    + 'around 400 MB. Either use "npm run update-app", or set CV_BUILD_OUT:\n'
    + '  CV_BUILD_OUT=%LOCALAPPDATA%\\ChoicerVoicerExport npm run package\n'
  );
}

// Drop the platform and architecture binaries we are not shipping.
const otherPlatforms = ['darwin', 'linux', 'win32'].filter((p) => p !== platform);
const otherArchs = ['ia32', 'x64', 'arm64'].filter((a) => a !== arch);

const ignore = [
  /^\/dist($|\/)/,
  /^\/\.git($|\/)/,
  /^\/\.claude($|\/)/,
  /^\/scripts($|\/)/,
  /^\/README\.md$/,
  new RegExp(`^/node_modules/ffprobe-static/bin/(${otherPlatforms.join('|')})($|/)`),
  new RegExp(`^/node_modules/ffprobe-static/bin/[^/]+/(${otherArchs.join('|')})($|/)`),
];

/** Swaps the freshly built app into INSTALL_DIR, replacing what's there. */
function install(built) {
  if (fs.existsSync(INSTALL_DIR)) {
    try {
      fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
    } catch (err) {
      throw new Error(
        `Could not replace the installed app at:\n  ${INSTALL_DIR}\n\n`
        + `${err.code === 'EBUSY' || err.code === 'EPERM'
          ? 'Close Choicer Voicer Export if it is running, then try again. '
            + 'A sync client can also hold the folder open for a moment.'
          : err.message}`
      );
    }
  }

  fs.mkdirSync(path.dirname(INSTALL_DIR), { recursive: true });
  try {
    fs.renameSync(built, INSTALL_DIR);
  } catch {
    // Different volume, so fall back to a copy.
    fs.cpSync(built, INSTALL_DIR, { recursive: true });
    fs.rmSync(built, { recursive: true, force: true });
  }
  return INSTALL_DIR;
}

packager({
  dir: ROOT,
  out: OUT,
  name: APP_NAME,
  appVersion: require(path.join(ROOT, 'package.json')).version,
  overwrite: true,
  prune: true,
  asar: {
    // Everything these two packages ship stays on disk as real files.
    unpack: '**/node_modules/{ffmpeg-static,ffprobe-static}/**',
  },
  ignore,
  win32metadata: {
    CompanyName: 'Joseph Slade',
    FileDescription: 'Preview and export your Choicer Voicer dubs as video',
    ProductName: APP_NAME,
  },
})
  .then(([built]) => {
    const ext = platform === 'win32' ? '.exe' : '';
    if (!INSTALL) {
      console.log(`\nBuilt for ${platform}/${arch}:\n  ${built}`);
      console.log(`\nRun it by double-clicking "${APP_NAME}${ext}" inside that folder.`);
      console.log('The whole folder is the app, so move or zip it as one piece.');
      return;
    }

    const dest = install(built);
    fs.rmSync(OUT, { recursive: true, force: true });
    console.log(`\nUpdated the installed app:\n  ${path.join(dest, APP_NAME + ext)}`);
    console.log('\nAny existing shortcut to it still works.');
  })
  .catch((err) => {
    console.error(`\n${err.message || err}`);
    fs.rmSync(OUT, { recursive: true, force: true });
    process.exit(1);
  });
