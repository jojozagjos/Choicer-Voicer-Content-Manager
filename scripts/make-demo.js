'use strict';

/**
 * Records docs/images/demo.mp4, a short tour of the app.
 *
 *   npm run demo
 *
 * A launcher only. The recording happens inside the app, beside the smoke
 * harness and the screenshot pass, because it needs the real window with the
 * real IPC behind it.
 *
 * The window is shown off screen and never focused, so this does not take over
 * your desktop while it runs. It does need the app closed first: only one
 * instance can hold the game folder at a time.
 */

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));

const child = spawn(electron, ['.'], {
  cwd: ROOT,
  env: { ...process.env, CVE_DEMO: '1' },
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code === null ? 1 : code));
