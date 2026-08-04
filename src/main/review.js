'use strict';

/**
 * The moderator's side: the queue of things waiting to be looked at, and the
 * two decisions that can be made about them.
 *
 * Whether somebody is a moderator is not stored anywhere in this app. It is
 * asked of GitHub — do you have write access to the directory repository — and
 * that answer is the whole permission model. There is no admin flag to flip in
 * a settings file, no password, and nothing that can be granted by editing
 * something local.
 *
 * Deciding is deliberately thin: approving merges the pull request the
 * submission workflow already opened, rejecting closes the issue with a reason.
 * Both are ordinary GitHub actions taken as the person who pressed the button,
 * so every decision lands in the repository's history under their name.
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
 * Everything waiting to be looked at.
 *
 * Submissions and reports come back together, newest first, because they are
 * one queue in practice — the question is always "what needs me next".
 */
async function queue(token, repo) {
  const issues = await github.request(
    `/repos/${repo}/issues?state=open&labels=&per_page=50&sort=created&direction=desc`,
    { token },
  );

  const items = [];
  for (const issue of issues) {
    // Pull requests come back from the issues endpoint too, and they are the
    // other half of a submission rather than a thing to review on their own.
    if (issue.pull_request) continue;

    const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    const kind = labels.includes('submission') ? 'submission'
      : labels.includes('report') ? 'report'
        : 'other';
    if (kind === 'other') continue;

    items.push({
      kind,
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      author: issue.user && issue.user.login,
      openedAt: issue.created_at,
      url: issue.html_url,
      comments: issue.comments,
      record: kind === 'submission' ? recordIn(issue.body) : null,
    });
  }
  return items;
}

/**
 * The pull request the submission workflow opened for an issue.
 *
 * Asked for in any state, because "there is no open one" and "there never was
 * one" are different problems and only the second is worth alarming anyone
 * about. A merged one means the pack is already listed; none at all means the
 * workflow did not get as far as opening it.
 */
async function pullFor(token, repo, issueNumber, { state = 'open' } = {}) {
  const branch = `submission/${issueNumber}`;
  const owner = repo.split('/')[0];
  const found = await github.request(
    `/repos/${repo}/pulls?state=${state}&head=${encodeURIComponent(`${owner}:${branch}`)}`,
    { token },
  );
  return found.length ? found[0] : null;
}

/**
 * Explains why there is nothing to merge.
 *
 * The bare version of this said "it may already be merged", which is one of
 * three possibilities and not the likely one. Almost always the submission
 * workflow failed before it opened anything, and saying so is the difference
 * between a dead end and a thing to go and look at.
 */
async function whyNoChange(token, repo, issueNumber) {
  const any = await pullFor(token, repo, issueNumber, { state: 'all' });
  if (any && any.merged_at) {
    return 'This pack has already been listed. Its change was merged '
      + `on ${new Date(any.merged_at).toLocaleDateString()}.`;
  }
  if (any) {
    return 'The change for this submission was closed without being merged. '
      + 'Re-opening it on GitHub, or asking for the pack to be submitted again, will '
      + 'produce a new one.';
  }
  return 'No change was ever opened for this submission, which means the directory\'s '
    + 'submission workflow did not finish. Its most recent run on GitHub will say why. '
    + 'the usual cause is that it could not fetch the validator from the app repository.';
}

/**
 * Approves a submission: merge the change, then say so on the issue.
 *
 * The merge is what actually lists the pack. Closing the issue is left to
 * GitHub, which does it when the branch merges if the pull request says so, and
 * is not worth a second call if it does not.
 */
async function approve(token, repo, issueNumber, note) {
  const pull = await pullFor(token, repo, issueNumber);
  if (!pull) {
    throw new Error(await whyNoChange(token, repo, issueNumber));
  }

  await github.request(`/repos/${repo}/pulls/${pull.number}/merge`, {
    token,
    method: 'PUT',
    body: JSON.stringify({ merge_method: 'squash' }),
  });

  await comment(token, repo, issueNumber,
    note ? `Listed.\n\n${note}` : 'Listed. It will appear in the app shortly.');
  await close(token, repo, issueNumber);

  return { ok: true, merged: pull.number };
}

/**
 * Rejects a submission, with a reason.
 *
 * The reason is required by the caller rather than optional, because "closed
 * with no explanation" is the single most demoralising thing that can happen to
 * somebody who made something and offered it.
 */
async function reject(token, repo, issueNumber, reason) {
  if (!reason || !reason.trim()) {
    throw new Error('A reason is needed, so the author knows what to change.');
  }

  const pull = await pullFor(token, repo, issueNumber);
  if (pull) {
    await github.request(`/repos/${repo}/pulls/${pull.number}`, {
      token,
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
  }

  await comment(token, repo, issueNumber, `Not listed.\n\n${reason.trim()}`);
  await close(token, repo, issueNumber);

  return { ok: true, closedPull: pull ? pull.number : null };
}

/**
 * Closes a submission without listing it and without holding it against
 * anybody, so the author can change something and publish again.
 *
 * Between yes and no on purpose. Refusing says the pack was unacceptable; a
 * pack that is nearly right needs a different message, and using the harsher
 * one for both teaches people that a refusal means nothing in particular.
 */
async function sendBack(token, repo, issueNumber, reason) {
  if (!reason || !reason.trim()) {
    throw new Error('A reason is needed, so the author knows what to change.');
  }

  const pull = await pullFor(token, repo, issueNumber);
  if (pull) {
    await github.request(`/repos/${repo}/pulls/${pull.number}`, {
      token, method: 'PATCH', body: JSON.stringify({ state: 'closed' }),
    });
  }

  await comment(token, repo, issueNumber,
    `Not listed yet.\n\n${reason.trim()}\n\nChange that and publish it again. `
    + 'nothing is held against this account.');
  await close(token, repo, issueNumber);
  return { ok: true };
}

/**
 * Refuses a pack and blocks the account that sent it.
 *
 * The ban is applied the same way a moderator would type it, so it goes through
 * the same permission check and leaves the same trail rather than being a
 * second private route to the same state.
 */
async function refuseAndBan(token, repo, issueNumber, reason, author) {
  if (!author) throw new Error('There is nobody named to ban on this submission.');

  await reject(token, repo, issueNumber, reason);

  const issue = await github.request(`/repos/${repo}/issues`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      title: `Ban: ${author}`,
      body: `/ban ${author}`,
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
      outcome: issue.state === 'open' ? 'waiting'
        : /not listed/i.test(reason) ? 'refused'
          : /listed|updated/i.test(reason) ? 'listed'
            : 'closed',
      reason,
      openedAt: issue.created_at,
      closedAt: issue.closed_at,
      url: issue.html_url,
    });
  }
  return mine;
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
 * Done as a moderation comment rather than by editing the index directly, so it
 * runs through exactly the same permission check and leaves exactly the same
 * trail as typing it on GitHub. There is one way to hide a pack, not two that
 * have to be kept in step.
 *
 * It needs somewhere to say it, and an issue is the only place comments live —
 * so it opens one, says it, and lets the workflow close the loop.
 */
async function setListed(token, repo, packId, listed) {
  const verb = listed ? 'restore' : 'hide';
  const issue = await github.request(`/repos/${repo}/issues`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      title: `${listed ? 'Restore' : 'Hide'}: ${packId}`,
      body: `/${verb} ${packId}`,
      labels: ['moderation'],
    }),
  });

  // The body of a new issue does not fire issue_comment, so the command is
  // repeated as a comment, which does.
  await comment(token, repo, issue.number, `/${verb} ${packId}`);
  return { ok: true, issue: issue.number, url: issue.html_url };
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
  sendBack,
  refuseAndBan,
  recordIn,
  queue,
  pullFor,
  approve,
  reject,
  comment,
  close,
};
