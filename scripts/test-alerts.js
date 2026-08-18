'use strict';

/**
 * Who is allowed to take a message off the alert strip.
 *
 *   node scripts/test-alerts.js
 *
 * There is one strip and several things want it: the missing-ffmpeg warning,
 * the go-and-record-a-dub nudge, the update notice, and the donation note.
 * Rescanning used to clear the strip whenever the library looked healthy,
 * which is true the instant an export finishes. So the donation note appeared
 * and was gone again within moments, which is what it was reported as.
 *
 * The real functions are read out of app.js rather than copied, because a copy
 * is the version that stays correct while the shipped one drifts.
 */

const fs = require('fs');
const path = require('path');

// Line endings normalised first: this file is stored with CRLF, and slicing
// a function out by looking for a newline-brace-newline finds nothing without
// it.
const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8'
).split('\r\n').join('\n');

function lift(name) {
  const at = source.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`${name} is not in app.js any more`);
  const end = source.indexOf('\n}\n', at);
  return source.slice(at, end + 3);
}

// Enough of the page for the two functions to run against.
const build = new Function(`
  const bar = { hidden: true, buttons: [] };
  const state = { alertOwner: null };
  const el = {
    alertBar: {
      get hidden() { return bar.hidden; },
      set hidden(v) { bar.hidden = v; },
      querySelectorAll: () => [...bar.buttons],
    },
    alertText: { textContent: '' },
    alertAction: { hidden: true, textContent: '', onclick: null },
  };
  function clearExtraAlertButtons() { bar.buttons = []; }
  ${lift('showAlert')}
  ${lift('hideAlert')}
  return { showAlert, hideAlert, state, el, bar };
`);

let passed = 0;
let failed = 0;
function check(what, ok, note) {
  if (ok) { passed++; return; }
  failed++;
  console.log(`  FAIL  ${what}${note ? `\n        ${note}` : ''}`);
}

console.log('\nThe reported bug');
{
  const a = build();
  a.showAlert('Glad this is useful.', 'Donate', () => {}, 'donate');
  check('the donation note goes up', a.bar.hidden === false);
  check('and the strip knows whose it is', a.state.alertOwner === 'donate');

  // An export has just finished, so a rescan runs and finds nothing wrong.
  a.hideAlert('scan');
  check('a rescan finding nothing wrong leaves it alone', a.bar.hidden === false,
    'this is the bug: the note vanished moments after appearing');
  check('and does not steal ownership', a.state.alertOwner === 'donate');
}

console.log('\nEach owner still clears its own');
{
  const a = build();
  a.showAlert('No voice packs found in that folder.', 'Choose folder', () => {}, 'scan');
  a.hideAlert('scan');
  check('a scan clears a scan message', a.bar.hidden === true);
  check('and lets go of ownership', a.state.alertOwner === null);
}

console.log('\nThe strip\'s own buttons');
{
  const a = build();
  a.showAlert('Glad this is useful.', 'Donate', () => {}, 'donate');
  // Donate and No thanks both call it with no argument.
  a.hideAlert();
  check('clearing with no owner always works', a.bar.hidden === true,
    'the buttons on the note itself have to be able to dismiss it');
}

console.log('\nOther owners are kept apart too');
{
  for (const [held, clearer] of [
    ['update', 'scan'],
    ['ffmpeg', 'scan'],
    ['donate', 'update'],
  ]) {
    const a = build();
    a.showAlert('something', 'do it', () => {}, held);
    a.hideAlert(clearer);
    check(`${clearer} cannot clear ${held}`, a.bar.hidden === false);
  }
}

console.log('\nA later message replaces an earlier one');
{
  const a = build();
  a.showAlert('Glad this is useful.', 'Donate', () => {}, 'donate');
  a.showAlert('Video tools are missing.', 'Fix in Settings', () => {}, 'ffmpeg');
  check('the newer message owns the strip', a.state.alertOwner === 'ffmpeg');
  a.hideAlert('donate');
  check('and the old owner can no longer clear it', a.bar.hidden === false,
    'otherwise a stale owner could take down a warning that replaced it');
}

console.log(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed ? 1 : 0);
