'use strict';

/**
 * Decides which packs are still reachable, and unlists the ones that are not.
 *
 * The directory links to files it does not host, so records outlive the things
 * they point at. Nothing about that failure is loud: the record still validates
 * perfectly, the pack still appears in the list, and the only person who finds
 * out is the user whose install fails. Left alone a link directory becomes a
 * list of disappointments.
 *
 * Nobody is reliably available to prune it, so pruning cannot need a person.
 * This module is the rule that does it, kept pure — no network, no disk, no
 * clock — so that every branch can be tested directly instead of by waiting
 * three days to see what happens.
 *
 * The whole design turns on one distinction: **a check that failed is not the
 * same as a file that is gone.** Rate limits, timeouts and 500s say nothing
 * about whether the pack exists, and treating them as evidence would let a bad
 * afternoon at a host delete a hundred people's work. Only an answer that
 * genuinely means "not there" is allowed to count.
 */

/** Consecutive confirmed failures before a pack stops being listed. */
const STRIKES_TO_UNLIST = 3;

/** How long a pack keeps failing before the record is dropped for good. */
const ARCHIVE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

/** Strike count at which the author is told, well before anything happens. */
const WARN_AT_STRIKE = 1;

/**
 * The three answers a check can give.
 *
 * `unsure` is not a soft version of `dead`. It means the question was not
 * answered, and it must leave the pack exactly as it found it.
 */
const VERDICTS = ['ok', 'dead', 'unsure'];

/** What each reachability state means for a pack. Anything unknown is unsure. */
const VERDICT_FOR_STATE = {
  ok: 'ok',
  gone: 'dead',     // 404 / 410 — the host says it is not there
  private: 'dead',  // 401 / 403 — it may exist, but nobody can have it
  unsure: 'unsure', // timeout, 429, 5xx — we simply do not know
};

/** Reads a check result into one of the three verdicts, defaulting to unsure. */
function verdictFor(state) {
  return VERDICT_FOR_STATE[state] || 'unsure';
}

/** The health of a pack nobody has checked yet. Listed, unblemished. */
function freshHealth(now) {
  return {
    strikes: 0,
    listed: true,
    archived: false,
    firstFailedAt: null,
    lastOkAt: now,
    lastCheckedAt: null,
    lastState: null,
  };
}

/**
 * Applies one check result to one pack's health, returning the next state and
 * what changed.
 *
 * Pure and total: same inputs, same outputs, no clock of its own. `now` is
 * passed in so tests can move time without sleeping.
 *
 * The returned `events` are the things worth telling somebody about. They are
 * derived here rather than by the caller comparing before and after, because
 * "did this pack just get unlisted" is exactly the kind of question that gets
 * answered subtly wrong at the call site.
 */
function applyCheck(previous, result, now) {
  const prev = previous ? { ...freshHealth(now), ...previous } : freshHealth(now);
  const verdict = verdictFor(result && result.state);
  const next = { ...prev, lastCheckedAt: now, lastState: (result && result.state) || null };
  const events = [];

  if (verdict === 'unsure') {
    // Deliberately inert. The pack is left precisely as it was: no strike, no
    // forgiveness, not even a nudge to the archive clock. We learned nothing.
    return { health: next, events, changed: false };
  }

  if (verdict === 'ok') {
    next.strikes = 0;
    next.firstFailedAt = null;
    next.lastOkAt = now;

    // Coming back from the dead is automatic and needs nobody's approval. An
    // author who moved their hosting and fixed it a week later should not have
    // to ask, or even know that anything happened.
    if (!prev.listed && !prev.archived) {
      next.listed = true;
      events.push({ kind: 'relisted', reason: 'the download works again' });
    }
    return { health: next, events, changed: hasChanged(prev, next) };
  }

  // Confirmed dead.
  next.strikes = prev.strikes + 1;
  if (!prev.firstFailedAt) next.firstFailedAt = now;

  if (next.strikes === WARN_AT_STRIKE && prev.listed) {
    // Told at the first strike, not the third, so the usual ending is that the
    // author fixes it and nothing else in here ever fires.
    events.push({ kind: 'warned', reason: describe(result), strikes: next.strikes });
  }

  if (next.listed && next.strikes >= STRIKES_TO_UNLIST) {
    next.listed = false;
    events.push({
      kind: 'unlisted',
      reason: `${next.strikes} checks in a row found nothing: ${describe(result)}`,
      strikes: next.strikes,
    });
  }

  // Unlisted is not deleted. Only an unbroken run of failures this long ends a
  // record, and the run resets the moment the link works again.
  if (!next.archived && next.firstFailedAt && now - next.firstFailedAt >= ARCHIVE_AFTER_MS) {
    next.archived = true;
    next.listed = false;
    events.push({ kind: 'archived', reason: `unreachable for ${Math.round(ARCHIVE_AFTER_MS / 86400000)} days` });
  }

  return { health: next, events, changed: hasChanged(prev, next) };
}

/** Whether anything worth writing back actually moved. */
function hasChanged(a, b) {
  return a.strikes !== b.strikes
    || a.listed !== b.listed
    || a.archived !== b.archived
    || a.firstFailedAt !== b.firstFailedAt;
}

/** A short human reason, for a message an author will actually read. */
function describe(result) {
  if (!result) return 'no answer';
  if (result.state === 'gone') return `the host says it is not there (${result.status})`;
  if (result.state === 'private') return `the host will not serve it (${result.status})`;
  return result.error || result.state || 'no answer';
}

/**
 * Applies a whole round of checks to a whole health table.
 *
 * Packs that were not checked this round are carried across untouched, so a run
 * that covered half the directory cannot quietly unlist the other half.
 */
function applyRound(previousTable, results, now) {
  const table = { ...(previousTable || {}) };
  const events = [];
  let changed = 0;

  for (const result of results) {
    if (!result || !result.id) continue;
    const step = applyCheck(table[result.id], result, now);
    table[result.id] = step.health;
    if (step.changed) changed++;
    for (const event of step.events) events.push({ id: result.id, ...event });
  }

  return { health: table, events, changed };
}

/**
 * The ids that should appear in the public index, given a health table.
 *
 * A pack with no health record at all is listed. Never checked is not the same
 * as failed, and a brand new record must not be invisible until a job has run.
 */
function listedIds(table, allIds) {
  return allIds.filter((id) => {
    const health = table && table[id];
    if (!health) return true;
    return health.listed !== false && !health.archived;
  });
}

/** Ids whose records should be dropped from the index entirely. */
function archivedIds(table) {
  return Object.keys(table || {}).filter((id) => table[id] && table[id].archived);
}

/** A one-line summary of a round, for the job log and nothing else. */
function summarise(events) {
  const count = (kind) => events.filter((e) => e.kind === kind).length;
  return {
    warned: count('warned'),
    unlisted: count('unlisted'),
    relisted: count('relisted'),
    archived: count('archived'),
  };
}

module.exports = {
  STRIKES_TO_UNLIST,
  ARCHIVE_AFTER_MS,
  verdictFor,
  freshHealth,
  applyCheck,
  applyRound,
  listedIds,
  archivedIds,
  summarise,
};
