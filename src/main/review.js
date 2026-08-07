'use strict';

/**
 * The moderator's side: reports, and what can be done about them.
 *
 * Whether somebody is a moderator is not stored anywhere in this app. It is
 * asked of GitHub — do you have write access to the directory repository — and
 * that answer is the whole permission model. There is no admin flag to flip in
 * a settings file, no password, and nothing that can be granted by editing
 * something local.
 *
 * ## Nothing here approves uploads
 *
 * There used to be a queue of packs waiting to be read and passed. It is gone,
 * along with every function that served it. Uploads are checked by rules rather
 * than by judgement: the record has to validate, the author has to be the
 * account hosting the file, the file has to pass a malware check, and the
 * account must not be banned. Anything that clears all of that is listed by the
 * directory itself, immediately, with nobody in the way.
 *
 * Reading and passing judgement on what other people upload is a different
 * undertaking from running a list of links, and it is not one this project is
 * set up to take on. What is left is after the fact and much smaller: somebody
 * reports a pack, and it can be hidden or its author blocked.
 */

const github = require('./github');

/**
 * Whether this account may moderate, and what it is allowed to do.
 *
 * `push` is the level that can merge, so it is the level that can approve.
 * Anything less is treated as not a moderator at all rather than as a
 * read-only moderator, because a queue you cannot act on is not useful.
 */
async function permissionOf(token, repo, login) {
  try {
    const answer = await github.request(
      `/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
      { token },
    );
    const level = answer.permission;
    return {
      moderator: level === 'admin' || level === 'write' || level === 'maintain',
      level,
    };
  } catch (err) {
    // A 404 here means "not a collaborator", which GitHub reports rather than
    // answering the question. It is the normal answer for almost everybody and
    // is not worth surfacing as a failure.
    if (/could not find/i.test(err.message)) return { moderator: false, level: 'none' };
    throw err;
  }
}

/** The record inside a submission issue, or null if there is not one. */
function recordIn(body) {
  const fenced = String(body || '').match(/```json\s*([\s\S]*?)```/);
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[1]);
  } catch {
    return null;
  }
}

/**
 * Reports waiting to be looked at, newest first.
 *
 * Only reports. Submissions used to appear here too, waiting to be passed, and
 * they no longer wait for anything: a pack that satisfies the rules is listed
 * without a person, so there is nothing to show. A queue containing things
 * nobody has to act on is a queue that stops being read.
 */
async function queue(token, repo) {
  const issues = await github.request(
    `/repos/${repo}/issues?state=open&labels=report&per_page=50&sort=created&direction=desc`,
    { token },
  );

  const items = [];
  for (const issue of issues) {
    // Pull requests come back from the issues endpoint too. Nothing here opens
    // one, but somebody can, and one appearing among reports would be nothing
    // but confusing.
    if (issue.pull_request) continue;

    items.push({
      kind: 'report',
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      author: issue.user && issue.user.login,
      openedAt: issue.created_at,
      url: issue.html_url,
      comments: issue.comments,
      record: null,
    });
  }
  return items;
}

/**
 * Blocks an account from publishing.
 *
 * The only thing a report can do to a person rather than to a pack. Applied the
 * way a moderator would type it, so it goes through the same permission check
 * and leaves the same trail rather than being a second private route to the
 * same state.
 */
async function banAuthor(token, repo, author, reason) {
  if (!author) throw new Error('There is nobody named to ban.');

  const issue = await github.request(`/repos/${repo}/issues`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      title: `Ban: ${author}`,
      body: reason ? `/ban ${author}\n\n${reason}` : `/ban ${author}`,
      labels: ['moderation'],
    }),
  });
  // A new issue's body does not fire issue_comment, so the command is repeated
  // as a comment, which does.
  await comment(token, repo, issue.number, `/ban ${author}`);

  return { ok: true, banned: author, issue: issue.number };
}


/**
 * What has happened to this person's own submissions.
 *
 * Built from their issues rather than from anything the app remembers, so it is
 * right after a reinstall, on another machine, and for a submission made months
 * ago. The app is showing GitHub's answer, not its own bookkeeping.
 *
 * The moderator's reason matters as much as the outcome. Somebody refused with
 * no explanation has been told nothing useful, and the explanation is sitting on
 * the issue where they will probably never look.
 */
async function mySubmissions(token, repo, login) {
  const issues = await github.request(
    `/repos/${repo}/issues?state=all&creator=${encodeURIComponent(login)}&per_page=50`
    + '&sort=created&direction=desc',
    { token },
  );

  const mine = [];
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    if (!labels.includes('submission')) continue;

    const record = recordIn(issue.body);

    // The last thing anyone said, which is where a refusal explains itself.
    let reason = '';
    if (issue.comments) {
      try {
        const said = await github.request(
          `/repos/${repo}/issues/${issue.number}/comments?per_page=100`, { token },
        );
        const last = said[said.length - 1];
        if (last) reason = last.body || '';
      } catch { /* the outcome is still worth showing without it */ }
    }

    mine.push({
      number: issue.number,
      title: record ? record.title : issue.title,
      id: record ? record.id : null,
      state: issue.state,
      // Closed says nothing on its own: a listed pack and a refused one both
      // end closed. What was said is what tells them apart.
      //
      // Order matters. "Not listed yet" is the one that asks for a change and
      // holds nothing against the author, and it has to be read before the
      // plain refusal, which its wording otherwise matches.
      outcome: issue.state === 'open' ? 'waiting'
        : /not listed yet/i.test(reason) ? 'changes'
          : /not listed/i.test(reason) ? 'refused'
            : /listed|updated/i.test(reason) ? 'listed'
              : 'closed',
      reason,
      openedAt: issue.created_at,
      closedAt: issue.closed_at,
      url: issue.html_url,
    });
  }

  // One row per pack, not per submission.
  //
  // Publishing the same pack again opens a fresh issue every time, so a pack
  // that has been updated twice had three rows in somebody's list, each with
  // its own outcome. The counts above the list then said things like "one
  // waiting, one listed" about a single pack, which is not wrong about the
  // issues and is nonsense about the pack.
  //
  // The newest wins, and the request already asked for them newest first, so
  // the first of each id is the one to keep. Submissions with no record in them
  // have nothing to group by and are left alone.
  const newest = [];
  const seenIds = new Set();
  for (const item of mine) {
    if (item.id) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
    }
    newest.push(item);
  }
  return newest;
}

/**
 * Whether this account is trusted, banned, or neither.
 *
 * Read from the directory's own moderation file, which is public — the same
 * answer a moderator sees, so nobody has to ask why their pack is being held.
 */
async function standingOf(repo, login) {
  const url = `https://raw.githubusercontent.com/${repo}/main/moderation.json`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { known: false };
    const state = await response.json();
    const has = (key) => (Array.isArray(state[key]) ? state[key] : [])
      .some((v) => String(v).toLowerCase() === String(login).toLowerCase());
    return { known: true, banned: has('banned'), trusted: has('trusted') };
  } catch {
    return { known: false };
  }
}

/**
 * Hides or restores a listed pack, from the app.
 *
 * Writes the change itself, rather than asking a workflow to.
 *
 * The first version opened an issue saying `/hide <pack>` and left a workflow to
 * carry it out, so that hiding went through the same path as typing the command
 * on GitHub. That reasoning was sound and the result did not work: the runs
 * either evaluated their filter to false and skipped, or did not start at all,
 * and either way the pack stayed listed with the app cheerfully reporting
 * "Unlisted." Four issues were opened and nothing was ever hidden.
 *
 * The same lesson as pull requests. A moderator already has write access, which
 * is the entire permission model, so the app can make the change with their own
 * token and be certain it happened. Nothing has to fire, and the answer this
 * returns is the state of the file rather than a hope about one.
 *
 * Both places are written: the flag on the record, which is what the app reads,
 * and the hidden list in moderation.json, which is what survives the record
 * being replaced by a later submission. Either alone leaves a pack that comes
 * back the next time its author publishes.
 */
async function setListed(token, repo, packId, listed) {
  const file = await github.request(`/repos/${repo}/contents/index.json`, { token });
  if (!file.content) {
    throw new Error('The directory index is too large to edit this way.');
  }

  const index = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  const pack = (index.packs || []).find((p) => p.id === packId);
  if (!pack) throw new Error(`There is no pack called ${packId} in the directory.`);

  if ((pack.listed !== false) === listed) {
    return { ok: true, packId, listed, unchanged: true };
  }
  pack.listed = listed;
  index.updated = new Date().toISOString();

  await github.request(`/repos/${repo}/contents/index.json`, {
    token,
    method: 'PUT',
    body: JSON.stringify({
      message: `${listed ? 'Restore' : 'Hide'} ${packId}`,
      content: Buffer.from(`${JSON.stringify(index, null, 2)}\n`, 'utf8').toString('base64'),
      sha: file.sha,
    }),
  });

  await rememberHidden(token, repo, packId, !listed);
  return { ok: true, packId, listed };
}

/**
 * Keeps the hidden list in step with the flag on the record.
 *
 * Best effort on purpose. The pack is already hidden by the time this runs, and
 * failing to also write the list is worth reporting rather than worth undoing a
 * decision that has taken effect.
 */
async function rememberHidden(token, repo, packId, hidden) {
  try {
    const file = await github.request(`/repos/${repo}/contents/moderation.json`, { token });
    const state = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    if (!Array.isArray(state.hidden)) state.hidden = [];

    const id = String(packId).toLowerCase();
    const at = state.hidden.findIndex((v) => String(v).toLowerCase() === id);
    if (hidden && at !== -1) return;
    if (!hidden && at === -1) return;

    if (hidden) state.hidden.push(id);
    else state.hidden.splice(at, 1);
    state.hidden.sort();

    await github.request(`/repos/${repo}/contents/moderation.json`, {
      token,
      method: 'PUT',
      body: JSON.stringify({
        message: `${hidden ? 'Hide' : 'Restore'} ${packId} in the moderation list`,
        content: Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8').toString('base64'),
        sha: file.sha,
      }),
    });
  } catch {
    // Left alone. The listing itself is already changed, which is what was
    // asked for, and the list is a backstop rather than the decision.
  }
}

/** Replies on an issue without deciding anything. */
async function comment(token, repo, issueNumber, body) {
  return github.request(`/repos/${repo}/issues/${issueNumber}/comments`, {
    token,
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

async function close(token, repo, issueNumber) {
  return github.request(`/repos/${repo}/issues/${issueNumber}`, {
    token,
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
}

module.exports = {
  permissionOf,
  mySubmissions,
  standingOf,
  setListed,
  banAuthor,
  queue,
  comment,
  close,
};
