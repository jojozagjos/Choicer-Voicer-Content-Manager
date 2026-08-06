'use strict';

/**
 * Checks the moderator's side: what listing a pack actually writes.
 *
 *   node scripts/test-review.js
 *
 * The interesting part is `approve`, because it is the only thing in the app
 * that writes to the directory. It used to merge a pull request, which meant
 * GitHub decided what the result was and there was nothing here to test. Now it
 * reads the index, changes it and writes it back, so what it produces is worth
 * pinning down: an update must not lose a download count, a rename must not
 * quietly create a second listing, and a record edited after submission must not
 * get through on the strength of having passed once.
 *
 * GitHub is replaced by a fake that records what it was asked to do. Plain Node,
 * no framework, same as the other suites here.
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

/** A record shaped the way the validator wants one. */
function record(overrides = {}) {
  return {
    id: 'meat-grinder',
    type: 'voice',
    title: 'Meat Grinder',
    summary: 'Three lines from the bit about the meat grinder.',
    description: '',
    author: 'jojozagjos',
    licence: 'cc-by',
    tags: ['funny'],
    content: [],
    downloadUrl: 'https://github.com/jojozagjos/packs/releases/download/v1/pack.zip',
    sha256: 'a'.repeat(64),
    bytes: 4_200_000,
    published: '2026-07-01T12:00:00.000Z',
    updated: '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

/**
 * A stand-in for GitHub that answers from a fixed state and logs every write.
 *
 * `conflicts` makes the first N writes fail the way a concurrent write does, so
 * the retry can be tested without needing two of anything.
 */
function fakeGithub({ issue, index, conflicts = 0 }) {
  const calls = [];
  let left = conflicts;
  let stored = index;

  return {
    calls,
    get index() { return stored; },
    request: async (route, options = {}) => {
      calls.push({ route, method: options.method || 'GET' });

      if (/\/issues\/\d+$/.test(route) && options.method !== 'PATCH') return issue;
      if (/\/issues\/\d+$/.test(route)) return {};
      if (/\/issues\/\d+\/comments$/.test(route)) return {};

      if (route.endsWith('/contents/index.json') && options.method !== 'PUT') {
        return {
          sha: 'sha-of-the-file',
          content: Buffer.from(JSON.stringify(stored), 'utf8').toString('base64'),
        };
      }
      if (route.endsWith('/contents/index.json')) {
        if (left > 0) {
          left -= 1;
          throw Object.assign(new Error('conflict'), { status: 409 });
        }
        const sent = JSON.parse(options.body);
        stored = JSON.parse(Buffer.from(sent.content, 'base64').toString('utf8'));
        calls.push({ route, method: 'PUT', message: sent.message });
        return {};
      }
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

/** An issue body the way the app writes one. */
const issueWith = (rec, login = 'jojozagjos') => ({
  number: 12,
  user: { login },
  body: `Here is a pack.\n\n\`\`\`json\n${JSON.stringify(rec, null, 2)}\n\`\`\`\n`,
});

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
  console.log('\nListing a pack that is not listed yet');

  await run('a new pack is added', async () => {
    const fake = fakeGithub({
      issue: issueWith(record()),
      index: { version: 1, updated: '2026-01-01T00:00:00.000Z', packs: [] },
    });
    const result = await reviewWith(fake).approve('token', 'owner/dir', 12, '');

    check('says what it listed', result.ok && result.listed === 'meat-grinder',
      JSON.stringify(result));
    check('the pack is in the index', fake.index.packs.length === 1);
    check('nothing was merged',
      !fake.calls.some((c) => /\/pulls/.test(c.route)),
      'listing must not depend on a pull request existing');
    check('the index says when it changed',
      fake.index.updated !== '2026-01-01T00:00:00.000Z');
    check('the commit names the issue',
      fake.calls.some((c) => c.message && c.message.includes('#12')));
  });

  console.log('\nListing a pack that is already there');

  await run('an update keeps the download count and the first published date', async () => {
    const fake = fakeGithub({
      issue: issueWith(record({ title: 'Meat Grinder II', updated: '2026-08-01T00:00:00.000Z' })),
      index: {
        version: 1,
        packs: [record({ downloads: 4321, published: '2026-02-02T00:00:00.000Z' })],
      },
    });
    await reviewWith(fake).approve('token', 'owner/dir', 12, '');

    const listed = fake.index.packs[0];
    check('there is still one listing', fake.index.packs.length === 1);
    check('the new title took', listed.title === 'Meat Grinder II', listed.title);
    check('the download count survived', listed.downloads === 4321, String(listed.downloads));
    check('the original publish date survived',
      listed.published === '2026-02-02T00:00:00.000Z', listed.published);
  });

  await run('somebody else\'s pack of the same name is refused', async () => {
    const fake = fakeGithub({
      issue: issueWith(record()),
      index: { version: 1, packs: [record({ author: 'someoneelse' })] },
    });
    let threw = '';
    try {
      await reviewWith(fake).approve('token', 'owner/dir', 12, '');
    } catch (err) { threw = err.message; }

    check('it is refused', /by somebody else/i.test(threw), threw);
    check('nothing was written',
      fake.index.packs[0].author === 'someoneelse');
  });

  console.log('\nWhat must not get through');

  await run('a record edited after submission is checked again', async () => {
    // A download address on somebody else's account, which is the check that
    // keeps credit honest. It passed once at submission; it has to pass again.
    const fake = fakeGithub({
      issue: issueWith(record({
        downloadUrl: 'https://github.com/someoneelse/packs/releases/download/v1/pack.zip',
      })),
      index: { version: 1, packs: [] },
    });
    let threw = '';
    try {
      await reviewWith(fake).approve('token', 'owner/dir', 12, '');
    } catch (err) { threw = err.message; }

    check('it is refused', /cannot be listed/i.test(threw), threw);
    check('nothing was listed', fake.index.packs.length === 0);
  });

  await run('a pack credited to somebody other than the submitter is refused', async () => {
    const fake = fakeGithub({
      issue: issueWith(record(), 'someoneelse'),
      index: { version: 1, packs: [] },
    });
    let threw = '';
    try {
      await reviewWith(fake).approve('token', 'owner/dir', 12, '');
    } catch (err) { threw = err.message; }

    check('it is refused', /credited/i.test(threw), threw);
    check('nothing was listed', fake.index.packs.length === 0);
  });

  await run('an issue with no record in it is refused', async () => {
    const fake = fakeGithub({
      issue: { number: 12, user: { login: 'jojozagjos' }, body: 'please list my pack' },
      index: { version: 1, packs: [] },
    });
    let threw = '';
    try {
      await reviewWith(fake).approve('token', 'owner/dir', 12, '');
    } catch (err) { threw = err.message; }

    check('it says so plainly', /no record/i.test(threw), threw);
  });

  await run('extra fields in a record are dropped, not stored', async () => {
    const fake = fakeGithub({
      issue: issueWith(record({ downloads: 999_999, admin: true })),
      index: { version: 1, packs: [] },
    });
    await reviewWith(fake).approve('token', 'owner/dir', 12, '');

    const listed = fake.index.packs[0];
    check('the invented field is gone', listed.admin === undefined);
    check('a claimed download count does not carry over',
      listed.downloads === 0, String(listed.downloads));
  });

  await run('an index that already holds a broken record is not written over', async () => {
    // The point is not the broken record, it is that listing one pack must not
    // be the thing that quietly drops another. Refusing leaves the directory as
    // it was and puts the problem in front of somebody.
    const fake = fakeGithub({
      issue: issueWith(record()),
      index: { version: 1, packs: [{ id: 'half-a-record' }] },
    });
    let threw = '';
    try {
      await reviewWith(fake).approve('token', 'owner/dir', 12, '');
    } catch (err) { threw = err.message; }

    check('it refuses rather than dropping it', /drop 1/i.test(threw), threw);
    check('nothing was written', fake.index.packs.length === 1);
  });

  await run('one account cannot fill the directory on its own', async () => {
    const many = [];
    for (let n = 0; n < 50; n++) many.push(record({ id: `pack-${n}` }));

    const fake = fakeGithub({
      issue: issueWith(record({ id: 'one-too-many' })),
      index: { version: 1, packs: many },
    });
    let threw = '';
    try {
      await reviewWith(fake).approve('token', 'owner/dir', 12, '');
    } catch (err) { threw = err.message; }

    check('it says how many and what the limit is',
      /50 packs listed/.test(threw) && /50\)/.test(threw), threw);
    check('nothing was added', fake.index.packs.length === 50);
  });

  await run('a full account can still update what it has listed', async () => {
    const many = [];
    for (let n = 0; n < 50; n++) many.push(record({ id: `pack-${n}`, downloads: n }));

    const fake = fakeGithub({
      issue: issueWith(record({ id: 'pack-7', title: 'Now Better' })),
      index: { version: 1, packs: many },
    });
    const result = await reviewWith(fake).approve('token', 'owner/dir', 12, '');

    check('the update went through', result.ok && result.updated === true, JSON.stringify(result));
    check('it did not become a fifty first listing', fake.index.packs.length === 50);
    check('and it kept its downloads',
      fake.index.packs.find((p) => p.id === 'pack-7').downloads === 7);
  });

  await run('publishing over a pack that was taken down does not put it back', async () => {
    const fake = fakeGithub({
      issue: issueWith(record({ title: 'Trying Again' })),
      index: { version: 1, packs: [record({ listed: false, downloads: 12 })] },
    });
    await reviewWith(fake).approve('token', 'owner/dir', 12, '');

    const listed = fake.index.packs[0];
    check('the update went in', listed.title === 'Trying Again', listed.title);
    check('and it is still hidden', listed.listed === false,
      'republishing would otherwise be the easy way to undo a moderator');
    check('its downloads survived', listed.downloads === 12);
  });

  console.log('\nWhen two decisions land at once');

  await run('a conflicting write is read again and reapplied', async () => {
    const fake = fakeGithub({
      issue: issueWith(record()),
      index: { version: 1, packs: [] },
      conflicts: 1,
    });
    const result = await reviewWith(fake).approve('token', 'owner/dir', 12, '');

    check('it still lists the pack', result.ok && fake.index.packs.length === 1);
    check('it read the index twice',
      fake.calls.filter((c) => c.route.endsWith('/contents/index.json') && c.method === 'GET')
        .length === 2);
  });

  await run('a conflict that will not clear is explained rather than thrown raw', async () => {
    const fake = fakeGithub({
      issue: issueWith(record()),
      index: { version: 1, packs: [] },
      conflicts: 99,
    });
    let threw = '';
    try {
      await reviewWith(fake).approve('token', 'owner/dir', 12, '');
    } catch (err) { threw = err.message; }

    check('it says what happened and what to do',
      /nothing was listed/i.test(threw) && /again/i.test(threw), threw);
  });

  console.log(`\n${checks - failures}/${checks} passed`);
  if (failures) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
