'use strict';

/**
 * Captures the screenshots the README shows.
 *
 *   npm run shots
 *
 * A launcher only. The capture itself happens inside the app, next to the
 * smoke harness, because it needs the real window with the real IPC behind it.
 * Running the app a second way would mean a second copy of all of that.
 *
 * The window is never shown and never takes focus, so this does not interrupt
 * whatever you are doing and nothing outside the app lands in the picture.
 */

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const electron = require(path.join(ROOT, 'node_modules', 'electron'));

const child = spawn(electron, ['.'], {
  cwd: ROOT,
  env: { ...process.env, CVE_SHOTS: '1' },
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code === null ? 1 : code));
