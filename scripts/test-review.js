'use strict';

/**
 * Checks the moderator's side: taking a pack off the list, and blocking an
 * account.
 *
 *   node scripts/test-review.js
 *
 * There is no approval step to test. Packs are listed by the directory once
 * they pass their checks, so nothing in this app decides whether an upload is
 * allowed. What is left is what happens after a report, and the interesting
 * part of that is unlisting, which has to actually change the file: it spent a
 * while opening issues and reporting success while the pack stayed exactly
 * where it was.
 *
 * GitHub is replaced by a fake that records what it was asked to do. Plain
 * Node, no framework, same as the other suites here.
 */

const Module = require('module');
const path = require('path');

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks++;
  if (condition) return;
  failures++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
}

// The real github.js talks to the network in its own module scope, so it is
// swapped out at require time rather than monkey-patched afterwards.
const githubPath = require.resolve('../src/main/github');
const realLoad = Module._load;

/** A record shaped the way the directory stores one. */
function record(overrides = {}) {
  return {
    id: 'meat-grinder',
    type: 'voice',
    title: 'Meat Grinder',
    summary: 'Three lines from the bit about the meat grinder.',
    author: 'jojozagjos',
    licence: 'cc-by',
    tags: [],
    content: [],
    downloadUrl: 'https://github.com/jojozagjos/packs/releases/download/v1/pack.zip',
    sha256: 'a'.repeat(64),
    bytes: 4_200_000,
    published: '2026-07-01T12:00:00.000Z',
    updated: '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

/** A stand-in for GitHub that answers from fixed state and logs every write. */
function fakeGithub({ index, moderation = { banned: [], trusted: [], hidden: [] }, issues = [] }) {
  const calls = [];
  let storedIndex = index;
  let storedModeration = moderation;

  const asFile = (value, sha) => ({
    sha,
    content: Buffer.from(JSON.stringify(value), 'utf8').toString('base64'),
  });

  return {
    calls,
    get index() { return storedIndex; },
    get moderation() { return storedModeration; },
    request: async (route, options = {}) => {
      const method = options.method || 'GET';
      calls.push({ route, method });

      if (route.endsWith('/contents/index.json')) {
        if (method !== 'PUT') return asFile(storedIndex, 'sha-index');
        storedIndex = JSON.parse(
          Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8'));
        return {};
      }
      if (route.endsWith('/contents/moderation.json')) {
        if (method !== 'PUT') return asFile(storedModeration, 'sha-moderation');
        storedModeration = JSON.parse(
          Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8'));
        return {};
      }
      if (route.endsWith('/issues') && method === 'POST') {
        const sent = JSON.parse(options.body);
        calls.push({ route, method: 'POST', body: sent.body, labels: sent.labels });
        return { number: 99, html_url: 'https://example/99' };
      }
      if (/\/issues\?/.test(route)) return issues;
      if (/\/issues\/\d+\/comments$/.test(route)) {
        calls.push({ route, method, body: JSON.parse(options.body).body });
        return {};
      }
      if (/\/issues\/\d+$/.test(route)) return {};

      throw new Error(`the fake was asked for something it does not answer: ${route}`);
    },
  };
}

/** Loads review.js against a given fake, fresh each time. */
function reviewWith(fake) {
  delete require.cache[require.resolve('../src/main/review')];
  Module._load = function load(request, parent, isMain) {
    if (parent && path.dirname(parent.filename) === path.dirname(githubPath)
      && request === './github') {
      return fake;
    }
    return realLoad.call(this, request, parent, isMain);
  };
  try {
    return require('../src/main/review');
  } finally {
    Module._load = realLoad;
  }
}

const run = async (name, fn) => {
  try {
    await fn();
  } catch (err) {
    failures++;
    checks++;
    console.log(`  FAIL  ${name}\n        threw: ${err.message}`);
  }
};

async function main() {
  console.log('\nTaking a pack off the list');

  await run('hiding writes the flag itself', async () => {
    const fake = fakeGithub({ index: { version: 1, packs: [record()] } });
    const result = await reviewWith(fake).setListed('t', 'owner/dir', 'meat-grinder', false);

    check('it says it did it', result.ok && result.listed === false, JSON.stringify(result));
    check('the pack is marked hidden', fake.index.packs[0].listed === false,
      'the whole bug was this never actually changing');
    check('it did not open an issue and hope',
      !fake.calls.some((c) => c.route.endsWith('/issues') && c.method === 'POST'),
      'leaving it to a workflow is what failed: the runs skipped and nothing was hidden');
    check('the hidden list was written too',
      fake.moderation.hidden.includes('meat-grinder'));
  });

  await run('restoring puts it back', async () => {
    const fake = fakeGithub({
      index: { version: 1, packs: [record({ listed: false })] },
      moderation: { banned: [], trusted: [], hidden: ['meat-grinder'] },
    });
    const result = await reviewWith(fake).setListed('t', 'owner/dir', 'meat-grinder', true);

    check('it says so', result.ok && result.listed === true);
    check('the pack is listed again', fake.index.packs[0].listed === true);
    check('and it comes off the hidden list', !fake.moderation.hidden.includes('meat-grinder'));
  });

  await run('hiding something already hidden changes nothing', async () => {
    const fake = fakeGithub({ index: { version: 1, packs: [record({ listed: false })] } });
    const result = await reviewWith(fake).setListed('t', 'owner/dir', 'meat-grinder', false);

    check('it says there was nothing to do', result.unchanged === true, JSON.stringify(result));
    check('and wrote nothing', !fake.calls.some((c) => c.method === 'PUT'));
  });

  await run('a pack that is not there is said so plainly', async () => {
    const fake = fakeGithub({ index: { version: 1, packs: [] } });
    let threw = '';
    try {
      await reviewWith(fake).setListed('t', 'owner/dir', 'nope', false);
    } catch (err) { threw = err.message; }
    check('it names the pack', /no pack called nope/i.test(threw), threw);
  });

  console.log('\nBlocking an account');

  await run('a ban is typed the same way a moderator would type it', async () => {
    const fake = fakeGithub({ index: { version: 1, packs: [record()] } });
    const result = await reviewWith(fake).banAuthor('t', 'owner/dir', 'someoneelse', 'spam');

    check('it says who', result.ok && result.banned === 'someoneelse', JSON.stringify(result));
    check('the command is repeated as a comment, which is what fires the workflow',
      fake.calls.some((c) => c.body === '/ban someoneelse' && /comments$/.test(c.route)));
    check('the issue is labelled for moderation',
      fake.calls.some((c) => (c.labels || []).includes('moderation')));
  });

  await run('a ban with nobody named is refused', async () => {
    const fake = fakeGithub({ index: { version: 1, packs: [] } });
    let threw = '';
    try {
      await reviewWith(fake).banAuthor('t', 'owner/dir', '', 'why');
    } catch (err) { threw = err.message; }
    check('it says so', /nobody named/i.test(threw), threw);
  });

  console.log('\nThe queue');

  await run('only reports are in it', async () => {
    const fake = fakeGithub({
      index: { version: 1, packs: [] },
      issues: [
        { number: 3, title: 'Report: something', body: 'bad pack', user: { login: 'someone' },
          created_at: '2026-08-01T00:00:00Z', html_url: 'u', comments: 0, labels: ['report'] },
      ],
    });
    const items = await reviewWith(fake).queue('t', 'owner/dir');

    check('it asked GitHub for reports only',
      fake.calls.some((c) => c.route.includes('labels=report')),
      'filtering after fetching would still pull every submission back');
    check('and what came back is a report', items.length === 1 && items[0].kind === 'report');
  });

  await run('a pull request is never mistaken for a report', async () => {
    const fake = fakeGithub({
      index: { version: 1, packs: [] },
      issues: [
        { number: 4, title: 'A change', pull_request: {}, user: { login: 'x' },
          created_at: '2026-08-01T00:00:00Z', html_url: 'u', comments: 0, labels: ['report'] },
      ],
    });
    const items = await reviewWith(fake).queue('t', 'owner/dir');
    check('it is left out', items.length === 0);
  });

  console.log(`\n${checks - failures}/${checks} passed`);
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
