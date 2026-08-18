'use strict';

/**
 * The countdown that holds a dialog's way forward shut.
 *
 *   node scripts/test-hold.js
 *
 * Used by the question about creating a repository on somebody's GitHub
 * account, which is the one thing this app does that changes something outside
 * itself. The point of it is to be read, so the things worth pinning are that
 * the button really is unpressable while it counts, that it says how long is
 * left, and that it comes back exactly once with its proper label.
 *
 * The real function is read out of app.js rather than copied here. A copy is
 * the version that stays correct while the shipped one drifts.
 */

const fs = require('fs');
const path = require('path');

// Line endings normalised on the way in. This file is stored with LF in the
// repository and checked out with CRLF on Windows, and cutting a function out
// by looking for a newline, a closing brace and a newline finds nothing in the
// second case. The test then fails for a reason that has nothing to do with
// the code it is meant to be checking.
const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8'
).split('\r\n').join('\n');

const start = source.indexOf('function holdButton(');
if (start < 0) throw new Error('holdButton is not in app.js any more');
const end = source.indexOf('\n}\n', start);
if (end < 0) throw new Error('could not find the end of holdButton in app.js');
const holdButton = new Function(
  'setInterval', 'clearInterval',
  `${source.slice(start, end + 3)}\n  return holdButton;`
);

let passed = 0;
let failed = 0;
function check(what, ok, note) {
  if (ok) { passed++; return; }
  failed++;
  console.log(`  FAIL  ${what}${note ? `\n        ${note}` : ''}`);
}

// A clock that only moves when told to, so five real seconds are not spent
// proving that five seconds pass.
function fakeClock() {
  let handler = null;
  let period = 0;
  let cleared = 0;
  return {
    setInterval: (fn, ms) => { handler = fn; period = ms; return 1; },
    clearInterval: () => { cleared++; handler = null; },
    tick(times = 1) { for (let i = 0; i < times; i++) if (handler) handler(); },
    get period() { return period; },
    get cleared() { return cleared; },
    get running() { return handler !== null; },
  };
}

function fakeButton() {
  return { disabled: false, textContent: '' };
}

console.log('\nWhile it counts');

const clock = fakeClock();
const hold = holdButton(clock.setInterval, clock.clearInterval);
const button = fakeButton();
hold(button, 'Create it and publish', 5);

check('the button is shut immediately', button.disabled === true);
check('it says five before any time passes',
  button.textContent === 'Create it and publish (5)', `was "${button.textContent}"`);
check('it ticks once a second', clock.period === 1000, `was ${clock.period}`);

clock.tick();
check('four after one second', button.textContent === 'Create it and publish (4)',
  `was "${button.textContent}"`);
check('still shut at four', button.disabled === true);

clock.tick(3);
check('one after four seconds', button.textContent === 'Create it and publish (1)',
  `was "${button.textContent}"`);
check('still shut at one', button.disabled === true,
  'the last second is the one most likely to be clicked through');

console.log('\nWhen it finishes');

clock.tick();
check('the button opens', button.disabled === false);
check('the label loses the counter', button.textContent === 'Create it and publish',
  `was "${button.textContent}"`);
check('the timer stops', clock.cleared === 1 && !clock.running,
  'a countdown left running would keep rewriting a label that is finished with');

clock.tick(3);
check('further ticks change nothing', button.textContent === 'Create it and publish'
  && button.disabled === false);

console.log('\nOdd values');

for (const [seconds, expect] of [[0.5, 1], [1, 1], [5.2, 6]]) {
  const c = fakeClock();
  const b = fakeButton();
  holdButton(c.setInterval, c.clearInterval)(b, 'Go', seconds);
  check(`${seconds} seconds starts at ${expect}`, b.textContent === `Go (${expect})`,
    `was "${b.textContent}"`);
}

// Nothing should ever leave a button permanently unpressable.
const c2 = fakeClock();
const b2 = fakeButton();
holdButton(c2.setInterval, c2.clearInterval)(b2, 'Go', 1);
c2.tick();
check('a one second hold still opens', b2.disabled === false);

console.log(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed ? 1 : 0);
