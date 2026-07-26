'use strict';

/**
 * Builds the standalone app with @electron/packager.
 *
 * Two things need care:
 *
 * 1. ffmpeg and ffprobe must sit OUTSIDE app.asar. Binaries inside an asar
 *    archive cannot be executed, and the app shells out to both.
 * 2. ffprobe-static ships binaries for every platform. Only the one we're
 *    building for is worth carrying, which takes the download from roughly
 *    430 MB down to something sane.
 *
 * electron-builder is the nicer tool but needs symlink privileges on Windows
 * to unpack its code-signing bundle, which means Developer Mode or an admin
 * shell. This route has no such requirement.
 */

const path = require('path');
const { packager } = require('@electron/packager');

const ROOT = path.join(__dirname, '..');
const platform = process.platform;
const arch = process.arch;

// A build is ~450 MB. Dropping that inside a synced folder means OneDrive
// uploads the whole thing and locks files mid-build, so allow redirecting it:
//   CV_BUILD_OUT=D:/builds npm run package
const OUT = process.env.CV_BUILD_OUT || path.join(ROOT, 'dist');

if (/onedrive|dropbox|google drive/i.test(OUT)) {
  console.warn(
    `\nHeads up: the build output is inside a synced folder.\n  ${OUT}\n`
    + 'Your sync client may lock files and fail the build, and it will upload\n'
    + 'around 450 MB. Set CV_BUILD_OUT to somewhere outside it, for example:\n'
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

packager({
  dir: ROOT,
  out: OUT,
  name: 'Choicer Voicer Export',
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
    ProductName: 'Choicer Voicer Export',
  },
})
  .then(([out]) => {
    console.log(`\nBuilt for ${platform}/${arch}:\n  ${out}`);
    console.log('\nRun the app by double-clicking "Choicer Voicer Export.exe" inside that folder.');
    console.log('The whole folder is the app, so move or zip it as one piece.');
  })
  .catch((err) => {
    console.error('Packaging failed:', err);
    process.exit(1);
  });
