'use strict';

/**
 * Checks that one dialog leading straight into another actually works.
 *
 *   node scripts/test-dialogs.js
 *
 * There is one `<dialog>` in this app and every prompt borrows it. That makes
 * the handover between two of them the only interesting part, and it broke in a
 * way that was invisible from the code: `close()` queues its `close` event as a
 * task while the promise it settles continues on a microtask, so the next
 * dialog opens *before* the previous one's event fires, and then receives it.
 * The second dialog dismissed itself the instant it appeared.
 *
 * Pressing Publish on a pack with no picture hit this exactly. The warning
 * opened and vanished inside one frame, so the button looked dead.
 *
 * The guard is that a `close` event arriving while the dialog is open cannot be
 * about the dialog that is on screen. This models the same event ordering the
 * browser uses and checks the guard holds.
 */

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

/**
 * Enough of a `<dialog>` to reproduce the ordering.
 *
 * `close()` sets `open` to false immediately and queues the event, which is
 * what the real one does and is the whole reason the bug existed.
 */
function makeDialog() {
  const listeners = new Set();
  return {
    open: false,
    showModal() { this.open = true; },
    close() {
      if (!this.open) return;
      this.open = false;
      // Queued as a task, so every pending microtask runs first.
      setTimeout(() => { for (const fn of [...listeners]) fn(); }, 0);
    },
    addEventListener(_name, fn) { listeners.add(fn); },
    removeEventListener(_name, fn) { listeners.delete(fn); },
  };
}

/** The guard as it is written in app.js. */
const staleClose = (dialog) => dialog.open;

/**
 * One prompt, resolving with what the caller answered.
 *
 * `guard` switches the fix off, so the test can show the bug is real rather
 * than only that the fixed version passes.
 */
function ask(dialog, { press, guard = true }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener('close', onClose);
      dialog.close();
      resolve(value);
    };
    function onClose() {
      if (guard && staleClose(dialog)) return;
      finish(null);
    }

    dialog.addEventListener('close', onClose);
    dialog.showModal();

    // Whatever the caller said to do, once the dialog is up.
    if (press !== undefined) setTimeout(() => finish(press), 5);
  });
}

async function main() {
  console.log('\nOne dialog straight into another');

  await (async () => {
    const dialog = makeDialog();
    const first = await ask(dialog, { press: 0 });
    // No await in between: this is the publish path, where refusing a pack with
    // no picture opens its warning in the same microtask drain.
    const second = await ask(dialog, { press: 'done' });

    check('the first answers with what was pressed', first === 0, String(first));
    check('the second is not dismissed by the first dialog\'s close event',
      second === 'done',
      `answered ${JSON.stringify(second)}, which means it closed itself`);
  })();

  await (async () => {
    // The same run with the guard off, to show the ordering really does bite.
    const dialog = makeDialog();
    await ask(dialog, { press: 0, guard: false });
    const second = await ask(dialog, { press: 'done', guard: false });

    check('without the guard it does dismiss itself', second === null,
      'the bug did not reproduce, so this test is no longer proving anything');
  })();

  console.log('\nA dialog closed by Esc still counts as declining');

  await (async () => {
    const dialog = makeDialog();
    // Nothing pressed. Something else closes it, which is what Esc does.
    const answer = await new Promise((resolve) => {
      ask(dialog, {}).then(resolve);
      setTimeout(() => dialog.close(), 5);
    });
    check('it declines', answer === null, String(answer));
  })();

  console.log(`\n${checks - failures}/${checks} passed`);
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
