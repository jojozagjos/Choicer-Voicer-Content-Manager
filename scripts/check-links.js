'use strict';

/**
 * Checks that every pack in a directory index can still be downloaded, and
 * unlists the ones that cannot.
 *
 *   node scripts/check-links.js path/to/index.json
 *   node scripts/check-links.js https://example.com/index.json --json
 *   node scripts/check-links.js index.json --health health.json   (a real run)
 *
 * Meant to run daily against the directory repository, because the whole design
 * rests on authors hosting their own files and authors delete things. A
 * directory of links nobody has checked becomes a list of disappointments, and
 * the failure is silent: every record still validates perfectly while pointing
 * at nothing.
 *
 * Deliberately conservative about calling something dead. A request can fail for
 * reasons that have nothing to do with the file: rate limits, a blip, a host
 * being slow. Only an answer that actually means "not there" counts, and it has
 * to happen on several separate days before anything is hidden — see
 * src/main/linkhealth.js, which owns that rule and is tested on its own.
 *
 * With `--health`, the run is stateful: it reads the previous verdicts, applies
 * today's, and writes the file back. Without it the run is a dry report, which
 * is what you want when checking by hand.
 *
 * Exits non-zero if anything is unreachable, so a scheduled job can raise it.
 */

const fs = require('fs');
const path = require('path');

const { validateIndex } = require('../src/main/directory');
const { applyRound, listedIds, summarise, STRIKES_TO_UNLIST } = require('../src/main/linkhealth');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const healthAt = valueOf('--health');
const source = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--health');

/** Reads `--flag value`, since this is not worth a dependency. */
function valueOf(flag) {
  const at = args.indexOf(flag);
  return at === -1 ? null : args[at + 1];
}

if (!source) {
  console.error('Usage: node scripts/check-links.js <index.json|https://…> [--json] [--health file.json]');
  process.exit(2);
}

const TIMEOUT_MS = 20000;

/**
 * Asks whether a download is still there, without fetching it.
 *
 * HEAD first, since it costs nothing. Some hosts do not answer HEAD properly, so
 * a rejection falls back to a ranged GET asking for one byte, which every host
 * that serves files will answer.
 */
async function reachable(url) {
  const attempt = async (method, headers) => {
    const response = await fetch(url, {
      method,
      headers: { 'user-agent': 'ChoicerVoicerContentManager-linkcheck', ...headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: response.status, ok: response.ok, size: response.headers.get('content-length') };
  };

  try {
    const head = await attempt('HEAD');
    if (head.ok) return { state: 'ok', ...head };
    // 403 and 405 usually mean "not this way", not "not here".
    if (head.status !== 403 && head.status !== 405) {
      const ranged = await attempt('GET', { range: 'bytes=0-0' });
      if (ranged.ok || ranged.status === 206) return { state: 'ok', ...ranged };
      return { state: statusMeaning(ranged.status), status: ranged.status };
    }
    const ranged = await attempt('GET', { range: 'bytes=0-0' });
    if (ranged.ok || ranged.status === 206) return { state: 'ok', ...ranged };
    return { state: statusMeaning(ranged.status), status: ranged.status };
  } catch (err) {
    // A timeout or a DNS failure is not proof the file is gone.
    return { state: 'unsure', error: err.message };
  }
}

/** Only answers that genuinely mean the file is not there count as dead. */
function statusMeaning(status) {
  if (status === 404 || status === 410) return 'gone';
  if (status === 401 || status === 403) return 'private';
  if (status === 429 || status >= 500) return 'unsure';
  return 'unsure';
}

async function loadIndex() {
  if (/^https?:/.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`the index answered ${response.status}`);
    return JSON.parse(await response.text());
  }
  return JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'));
}

(async () => {
  const raw = await loadIndex();
  const parsed = validateIndex(raw);
  if (!parsed.ok) {
    console.error(`That is not a directory index: ${parsed.error}`);
    process.exit(2);
  }

  if (parsed.rejected.length) {
    console.log(`${parsed.rejected.length} record(s) did not validate and were skipped:`);
    for (const bad of parsed.rejected) {
      console.log(`  ${bad.id || '(no id)'}: ${bad.problems.map((p) => p.message).join('; ')}`);
    }
    console.log('');
  }

  const results = [];
  // One at a time on purpose. This runs on a schedule with nobody waiting, and
  // hammering a host is a good way to be rate limited into false positives.
  for (const pack of parsed.packs) {
    const check = await reachable(pack.downloadUrl);
    results.push({ id: pack.id, author: pack.author, url: pack.downloadUrl, ...check });
    if (!asJson) {
      const mark = check.state === 'ok' ? 'ok  ' : check.state === 'unsure' ? '??  ' : 'DEAD';
      console.log(`  ${mark}  ${pack.id}${check.status ? `  (${check.status})` : ''}`);
    }
  }

  const dead = results.filter((r) => r.state === 'gone' || r.state === 'private');
  const unsure = results.filter((r) => r.state === 'unsure');

  // Today's answers become strikes against yesterday's, and the rule in
  // linkhealth decides what that means. Without --health this is a dry run: the
  // verdicts are computed from nothing and thrown away, so checking by hand can
  // never unlist anybody.
  const before = healthAt && fs.existsSync(healthAt)
    ? JSON.parse(fs.readFileSync(healthAt, 'utf8'))
    : {};
  const round = applyRound(before, results, Date.now());
  const counts = summarise(round.events);
  const stillListed = listedIds(round.health, parsed.packs.map((p) => p.id));

  if (healthAt) {
    fs.writeFileSync(healthAt, `${JSON.stringify(round.health, null, 2)}\n`);
  }

  if (asJson) {
    console.log(JSON.stringify({
      checked: results.length, dead, unsure, results,
      events: round.events, counts, listed: stillListed, health: round.health,
    }, null, 2));
  } else {
    console.log(`\n${results.length - dead.length - unsure.length}/${results.length} reachable`);
    if (unsure.length) console.log(`${unsure.length} could not be checked, which counts for nothing`);

    for (const event of round.events) {
      const say = {
        warned: `first failure, ${STRIKES_TO_UNLIST - 1} more before it is hidden`,
        unlisted: 'HIDDEN from the directory',
        relisted: 'back in the directory, it works again',
        archived: 'dropped for good',
      }[event.kind];
      console.log(`  ${event.id}: ${say} — ${event.reason}`);
    }

    if (!healthAt && round.events.length) {
      console.log('\n(dry run — pass --health <file> to make any of that stick)');
    }
    console.log(`\n${stillListed.length}/${parsed.packs.length} packs listed`);
  }

  // Only a pack actually disappearing is worth waking anyone for. Individual
  // dead links are routine and already handled by the strike count.
  process.exit(counts.unlisted || counts.archived ? 1 : 0);
})().catch((err) => {
  console.error(`Link check failed: ${err.message}`);
  process.exit(2);
});
