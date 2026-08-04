'use strict';

/**
 * Checks the rule that unlists dead packs.
 *
 *   node scripts/test-linkhealth.js
 *
 * Weighted heavily towards the false positive, because the two failure modes
 * here are not equal. Leaving a dead pack listed for another day is untidy.
 * Unlisting a living one takes somebody's work off the directory because a host
 * had a bad afternoon, and they may never find out why.
 */

const {
  applyCheck, applyRound, listedIds, archivedIds, summarise,
  freshHealth, verdictFor, STRIKES_TO_UNLIST, ARCHIVE_AFTER_MS,
} = require('../src/main/linkhealth');

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

const ok = { state: 'ok', status: 200 };
const gone = { state: 'gone', status: 404 };
const priv = { state: 'private', status: 403 };
const unsure = { state: 'unsure', error: 'timed out' };

/** Runs a sequence of results against one pack, a day apart. */
function run(sequence, start = null) {
  let health = start;
  const events = [];
  sequence.forEach((result, i) => {
    const step = applyCheck(health, result, T0 + i * DAY);
    health = step.health;
    events.push(...step.events);
  });
  return { health, events };
}

console.log('\nReading the answers');

check('200 is ok', verdictFor('ok') === 'ok');
check('404 is dead', verdictFor('gone') === 'dead');
check('403 is dead', verdictFor('private') === 'dead');
check('a timeout is unsure', verdictFor('unsure') === 'unsure');
check(
  'an answer nobody planned for is unsure, not dead',
  verdictFor('teapot') === 'unsure',
  'an unrecognised state must never be able to unlist a pack',
);
check('a missing state is unsure', verdictFor(undefined) === 'unsure');

console.log('\nThings that must never unlist a pack');

{
  const { health, events } = run([unsure, unsure, unsure, unsure, unsure, unsure]);
  check('six timeouts in a row change nothing', health.listed === true);
  check('  and score no strikes', health.strikes === 0, `strikes: ${health.strikes}`);
  check('  and raise no events', events.length === 0);
}

{
  const { health } = run([gone, gone, unsure, unsure, unsure]);
  check(
    'an unsure run cannot finish off a pack on two strikes',
    health.listed === true,
    'unsure must be inert, not a tiebreaker',
  );
  check('  strikes stay where they were', health.strikes === 2);
}

{
  const { health } = run([gone, gone, ok, gone, gone]);
  check(
    'strikes must be consecutive, not cumulative',
    health.listed === true,
    'four dead checks total, but never three in a row',
  );
  check('  a success resets the count to zero', health.strikes === 2);
}

{
  const { health } = run([{ state: 'unsure', status: 429 }, { state: 'unsure', status: 503 }, { state: 'unsure', status: 500 }]);
  check('rate limits and server errors are not evidence', health.listed === true);
}

console.log('\nUnlisting, when it is genuinely warranted');

{
  const { health, events } = run([gone, gone, gone]);
  check(`${STRIKES_TO_UNLIST} confirmed failures unlists`, health.listed === false);
  check('  the event says so', events.some((e) => e.kind === 'unlisted'));
  check('  and it is not archived yet', health.archived === false);
  check(
    '  the reason is specific enough to act on',
    /404|not there/.test(events.find((e) => e.kind === 'unlisted').reason),
  );
}

{
  const { health } = run([gone, gone]);
  check('two failures is not enough', health.listed === true, `strikes: ${health.strikes}`);
}

{
  const { health } = run([priv, priv, priv]);
  check('a pack made private also unlists', health.listed === false);
}

{
  const { events } = run([gone]);
  check('the author is warned at the first strike', events.some((e) => e.kind === 'warned'));
}

{
  const { events } = run([gone, gone, gone, gone, gone]);
  check(
    'the warning does not repeat every day',
    events.filter((e) => e.kind === 'warned').length === 1,
    'nagging daily is how people mute the notification',
  );
  check(
    'and it only unlists once',
    events.filter((e) => e.kind === 'unlisted').length === 1,
  );
}

console.log('\nComing back');

{
  const { health, events } = run([gone, gone, gone, ok]);
  check('a restored link relists itself', health.listed === true);
  check('  with no human involved', events.some((e) => e.kind === 'relisted'));
  check('  and a clean slate', health.strikes === 0);
  check('  and the archive clock is reset', health.firstFailedAt === null);
}

{
  const { events } = run([ok, ok, ok]);
  check(
    'a pack that never broke is not "relisted"',
    !events.some((e) => e.kind === 'relisted'),
    'relisting a listed pack would spam the log every single day',
  );
}

console.log('\nArchiving, eventually');

{
  // Failing every day for just over the archive window.
  const days = Math.ceil(ARCHIVE_AFTER_MS / DAY) + 1;
  const { health } = run(new Array(days).fill(gone));
  check('a long dead pack is archived', health.archived === true);
  check('  and stays unlisted', health.listed === false);
}

{
  const days = Math.ceil(ARCHIVE_AFTER_MS / DAY) + 1;
  const sequence = new Array(days).fill(gone);
  sequence[Math.floor(days / 2)] = ok;
  const { health } = run(sequence);
  check(
    'one success part way through resets the archive clock',
    health.archived === false,
    'the run has to be unbroken, or a pack that half works still dies',
  );
}

{
  const { health } = run(new Array(10).fill(gone));
  check('a pack dead for ten days is not archived yet', health.archived === false);
}

console.log('\nWhole rounds');

{
  const before = { a: freshHealth(T0), b: freshHealth(T0) };
  const { health, events, changed } = applyRound(
    before,
    [{ id: 'a', ...gone }, { id: 'b', ...ok }],
    T0 + DAY,
  );
  check('a round applies to each pack independently', health.a.strikes === 1 && health.b.strikes === 0);
  check('  events carry the id', events.every((e) => e.id));
  check('  and it counts what moved', changed === 1);
}

{
  const before = { a: { ...freshHealth(T0), strikes: 2 }, b: freshHealth(T0) };
  const { health } = applyRound(before, [{ id: 'a', ...gone }], T0 + DAY);
  check('a pack missing from a round is left alone', health.b.strikes === 0 && health.b.listed === true);
  check('  while the checked one still progresses', health.a.listed === false);
}

{
  const { health } = applyRound({}, [{ ...gone }, null, { id: 'c', ...ok }], T0);
  check('results with no id are skipped rather than crashing', Object.keys(health).length === 1);
}

console.log('\nWhat the index shows');

{
  const table = {
    live: { listed: true, archived: false },
    hidden: { listed: false, archived: false },
    old: { listed: false, archived: true },
  };
  const shown = listedIds(table, ['live', 'hidden', 'old', 'brandnew']);
  check('listed packs appear', shown.includes('live'));
  check('unlisted packs do not', !shown.includes('hidden'));
  check('archived packs do not', !shown.includes('old'));
  check(
    'a pack nobody has checked yet still appears',
    shown.includes('brandnew'),
    'never checked is not the same as failed, or every new pack is invisible until a job runs',
  );
  check('archivedIds finds the archived one', archivedIds(table).join() === 'old');
}

console.log('\nSummary counts');

{
  const events = [
    { kind: 'warned' }, { kind: 'warned' }, { kind: 'unlisted' }, { kind: 'relisted' },
  ];
  const s = summarise(events);
  check('summarise counts each kind', s.warned === 2 && s.unlisted === 1 && s.relisted === 1 && s.archived === 0);
}

console.log(`\n${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
