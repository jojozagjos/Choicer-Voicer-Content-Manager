'use strict';

/**
 * Publishing a pack to the author's own GitHub account, in one button.
 *
 * The directory stores links, not files, which keeps it free and keeps the
 * maintainer out of the takedown business. The cost of that choice used to land
 * entirely on the author: package the pack, go to GitHub, make a repository,
 * cut a release, drag the zip in, wait, copy the address, come back, paste it.
 * Four of those steps are a browser and none of them are interesting.
 *
 * This module does all of it. The author sees a code to type once, and then a
 * progress bar.
 *
 * ## Why the device flow
 *
 * A desktop app cannot keep a secret. Anything shipped inside it — a client
 * secret, an API key — is extractable by anyone who cares to look, so the usual
 * OAuth web flow is not available. The device flow exists precisely for this: it
 * uses no client secret at all. The app shows a code, the person approves it on
 * github.com, and the token comes back over a channel the app never had to prove
 * itself on.
 *
 * ## What it is allowed to touch
 *
 * `public_repo`, and nothing else. That is the narrowest scope that can create a
 * repository and attach a release asset. It cannot read private repositories,
 * cannot touch the author's other work beyond creating one repo, and cannot act
 * on their behalf anywhere else on GitHub.
 *
 * Everything this module writes goes into a single repository it created itself,
 * named by `PACK_REPO`. It never enumerates the author's repositories and never
 * writes to one it did not make.
 */

const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');

/**
 * The OAuth application's public identifier.
 *
 * Not a secret — it appears in the URL of every device flow and is meant to be
 * public. It is null until an OAuth app is registered, and `configure()` is how
 * the app supplies it, so this module carries no deployment detail of its own.
 */
let CLIENT_ID = null;

/**
 * The repository holding the directory index.
 *
 * Submissions are opened as issues here, and an Action turns a valid one into a
 * change to index.json. Null until configured, which is what makes publishing
 * report itself as unavailable rather than failing halfway through.
 */
let DIRECTORY_REPO = null;

/** The one repository the app creates and the only one it will write to. */
const PACK_REPO = 'choicer-voicer-packs';

/** Narrowest scope that can create a repo and upload a release asset. */
const SCOPE = 'public_repo';

const API = 'https://api.github.com';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** GitHub refuses release assets past this, so it is worth saying so early. */
const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024;

const TIMEOUT_MS = 30000;

/** Slowest upload speed worth waiting for, in bytes per second. */
const SLOWEST_UPLOAD = 20 * 1024;

/** Never give up on an upload sooner than this, however small the file. */
const MIN_UPLOAD_MS = 10 * 60 * 1000;

/**
 * How long to allow for an upload of a given size.
 *
 * Generous on purpose. Being cut off at the end of a long upload wastes the
 * whole transfer and there is no resuming it, so the cost of waiting too long
 * is a slow failure while the cost of waiting too little is a guaranteed one on
 * any connection slower than the author's.
 */
function uploadTimeoutFor(bytes) {
  return Math.max(MIN_UPLOAD_MS, Math.ceil((bytes / SLOWEST_UPLOAD) * 1000));
}

/** Supplies the OAuth client id and directory repo. Called once at startup. */
function configure({ clientId, directoryRepo } = {}) {
  if (clientId) CLIENT_ID = clientId;
  if (directoryRepo) DIRECTORY_REPO = directoryRepo;
}

/** Whether signing in is possible on this build. */
function isConfigured() {
  return Boolean(CLIENT_ID);
}

/** Whether a finished pack has anywhere to be submitted to. */
function canSubmit() {
  return Boolean(DIRECTORY_REPO);
}

/**
 * Turns a transport failure into something that names the actual problem.
 *
 * Node reports every network failure as the single word "fetch failed" and
 * hides the reason one or more levels down in `cause`. That message is useless
 * to whoever sees it and useless to whoever has to fix it, so the chain is
 * unwrapped and the code translated.
 */
function describeFailure(err) {
  const codes = [];
  for (let at = err; at; at = at.cause) {
    if (at.code) codes.push(at.code);
  }
  const code = codes[codes.length - 1] || codes[0];

  const known = {
    ENOTFOUND: 'GitHub could not be found. That usually means no internet connection.',
    EAI_AGAIN: 'GitHub could not be looked up. That usually means no internet connection.',
    ECONNREFUSED: 'GitHub refused the connection.',
    ECONNRESET: 'The connection to GitHub dropped part way through. Trying again usually works.',
    EPIPE: 'The connection to GitHub closed early. Trying again usually works.',
    ETIMEDOUT: 'GitHub stopped responding.',
    UND_ERR_CONNECT_TIMEOUT: 'GitHub took too long to answer.',
    UND_ERR_HEADERS_TIMEOUT: 'GitHub accepted the upload but never answered.',
    UND_ERR_BODY_TIMEOUT: 'The upload stalled.',
    UND_ERR_SOCKET: 'The connection to GitHub dropped part way through. Trying again usually works.',
    UND_ERR_REQ_CONTENT_LENGTH_MISMATCH:
      'The pack changed size while it was being uploaded. Packaging it again should fix it.',
    CERT_HAS_EXPIRED: 'The secure connection to GitHub could not be trusted.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:
      'The secure connection to GitHub could not be verified. Antivirus or a company network '
      + 'that inspects traffic is the usual cause.',
    SELF_SIGNED_CERT_IN_CHAIN:
      'The secure connection to GitHub was intercepted. Antivirus or a company network is the '
      + 'usual cause.',
  };

  if (known[code]) return `${known[code]} (${code})`;

  // Nothing recognised: say everything known rather than swallowing it, because
  // an unhelpful code is still better than no code.
  const detail = [...new Set(codes)].join(' / ');
  const deepest = deepestMessage(err);
  return detail
    ? `The connection to GitHub failed: ${deepest} (${detail})`
    : `The connection to GitHub failed: ${deepest}`;
}

/** The most specific message in a cause chain. */
function deepestMessage(err) {
  let message = err.message;
  for (let at = err.cause; at; at = at.cause) {
    if (at.message) message = at.message;
  }
  return message;
}

/** Whether a thrown thing is a transport failure rather than a refusal. */
function isTransportFailure(err) {
  return err instanceof TypeError || Boolean(err.cause) || /fetch failed/i.test(err.message || '');
}

/** Every request carries the same headers, and every failure explains itself. */
async function api(pathOrUrl, {
  token, method = 'GET', body, headers = {}, raw, duplex, timeoutMs = TIMEOUT_MS,
} = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'ChoicerVoicerContentManager',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body,
      // Required by fetch whenever the body is a stream rather than a buffer,
      // and it has to be forwarded from the caller: leaving it out is not a
      // warning, it is a refusal to send the request at all.
      ...(duplex ? { duplex } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`GitHub did not answer within ${Math.round(timeoutMs / 60000)} minutes.`);
    }
    if (isTransportFailure(err)) throw new Error(describeFailure(err));
    throw err;
  }

  if (!response.ok) {
    throw await explain(response);
  }
  return raw ? response : response.json();
}

/**
 * Turns a GitHub error into something an author can act on.
 *
 * The raw responses are unhelpful at exactly the moments people need help —
 * a 403 for rate limiting and a 403 for a missing scope read identically.
 */
async function explain(response) {
  let detail = '';
  let codes = [];
  try {
    const body = await response.json();
    detail = body.message || '';
    if (Array.isArray(body.errors) && body.errors.length) {
      codes = body.errors.map((e) => e.code).filter(Boolean);
      detail += `: ${body.errors.map((e) => e.message || e.code).join(', ')}`;
    }
  } catch { /* a body that is not JSON tells us nothing extra */ }

  // The status and GitHub's own error codes travel with the message, so a
  // caller can recognise a refusal it knows how to recover from. Flattening
  // everything to a sentence is what made "already exists" unrecoverable.
  const fail = (text) => Object.assign(new Error(text), {
    status: response.status,
    githubCodes: codes,
  });

  if (response.status === 401) {
    return fail('GitHub did not accept the sign-in. Signing in again should fix it.');
  }
  if (response.status === 403 && /rate limit/i.test(detail)) {
    return fail('GitHub is rate limiting this account. Waiting a few minutes should clear it.');
  }
  if (response.status === 403) {
    return fail(`GitHub refused that: ${detail || 'permission denied'}`);
  }
  if (response.status === 404) {
    return fail('GitHub could not find that. It may have been deleted or renamed.');
  }
  if (response.status === 422) {
    return fail(`GitHub rejected that as invalid: ${detail}`);
  }
  return fail(`GitHub answered ${response.status}${detail ? `: ${detail}` : ''}`);
}

/**
 * Whether a refusal means the thing being created is already there.
 *
 * GitHub answers 422 with an `already_exists` code, which is not really a
 * failure — it is the answer "someone got there first". Publishing the same
 * pack twice, or after deleting the release but not the tag, both land here,
 * and both should carry on with whatever already exists rather than stop.
 */
function alreadyExists(err) {
  return Boolean(err) && err.status === 422 && (err.githubCodes || []).includes('already_exists');
}

/** Whether a refusal means the thing simply is not there. */
function notFound(err) {
  return Boolean(err) && (err.status === 404 || /could not find/i.test(err.message || ''));
}

/**
 * Starts the device flow. Returns the code to show and where to type it.
 *
 * The caller is expected to put `userCode` on screen and open `verificationUri`.
 * Nothing is stored yet — this is only the request.
 */
async function startSignIn() {
  if (!CLIENT_ID) {
    throw new Error('This build has no GitHub application configured, so publishing is unavailable.');
  }

  const response = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw await explain(response);

  const body = await response.json();
  if (!body.device_code) {
    throw new Error(`GitHub did not start the sign-in: ${body.error_description || body.error || 'no reason given'}`);
  }

  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    // How often GitHub is willing to be asked, and for how long the code lives.
    intervalMs: (body.interval || 5) * 1000,
    expiresInMs: (body.expires_in || 900) * 1000,
  };
}

/**
 * Waits for the person to approve the code, then returns the token.
 *
 * Polls at the interval GitHub asked for. `slow_down` is not an error — it is
 * GitHub saying the interval was too tight, and the only correct response is to
 * back off rather than retry harder.
 */
async function waitForToken(start, { signal, onTick } = {}) {
  const deadline = Date.now() + start.expiresInMs;
  let interval = start.intervalMs;

  while (Date.now() < deadline) {
    if (signal && signal.aborted) throw new Error('Cancelled');

    await sleep(interval, signal);

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: start.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json().catch(() => ({}));

    if (body.access_token) return body.access_token;

    if (body.error === 'authorization_pending') {
      if (onTick) onTick({ waiting: true, secondsLeft: Math.round((deadline - Date.now()) / 1000) });
      continue;
    }
    if (body.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (body.error === 'expired_token') {
      throw new Error('That code expired. Starting again will get a fresh one.');
    }
    if (body.error === 'access_denied') {
      throw new Error('The sign-in was declined on GitHub.');
    }
    throw new Error(`GitHub stopped the sign-in: ${body.error_description || body.error || 'no reason given'}`);
  }

  throw new Error('That code expired. Starting again will get a fresh one.');
}

/** A cancellable wait. */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Cancelled'));
      }, { once: true });
    }
  });
}

/** Who the token belongs to. Also the cheapest way to check it still works. */
async function whoAmI(token) {
  const me = await api('/user', { token });
  return { login: me.login, id: me.id, avatarUrl: me.avatar_url };
}

/**
 * Finds the app's repository on the account, or makes it.
 *
 * Reusing it is the normal path — an author publishing their fifth pack should
 * not accumulate five repositories. The 404 is expected on the first publish and
 * is not worth surfacing as a problem.
 */
async function ensureRepo(token, login) {
  try {
    const existing = await api(`/repos/${login}/${PACK_REPO}`, { token });
    return { fullName: existing.full_name, htmlUrl: existing.html_url, created: false };
  } catch (err) {
    if (!notFound(err)) throw err;
  }

  try {
    const made = await api('/user/repos', {
      token,
      method: 'POST',
      body: JSON.stringify({
        name: PACK_REPO,
        description: 'Packs I have shared for The Choicer Voicer.',
        homepage: '',
        private: false,
        has_issues: false,
        has_wiki: false,
        has_projects: false,
        auto_init: true,
      }),
    });
    return { fullName: made.full_name, htmlUrl: made.html_url, created: true };
  } catch (err) {
    // "It is already there" is not a failure. The lookup above can miss a repo
    // that exists but was not visible for a moment — a rename, a cached 404 —
    // and the answer is to use the one that exists, not to stop.
    if (!alreadyExists(err)) throw err;
    const existing = await api(`/repos/${login}/${PACK_REPO}`, { token });
    return { fullName: existing.full_name, htmlUrl: existing.html_url, created: false };
  }
}

/**
 * Creates the release a pack's zip will hang from, reusing one if the tag
 * already exists — which is what happens when somebody re-publishes a pack
 * after fixing something.
 */
async function ensureRelease(token, fullName, tag, title) {
  try {
    const existing = await api(`/repos/${fullName}/releases/tags/${encodeURIComponent(tag)}`, { token });
    return existing;
  } catch (err) {
    if (!notFound(err)) throw err;
  }

  try {
    return await api(`/repos/${fullName}/releases`, {
      token,
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        name: title,
        body: 'Shared from the Choicer Voicer Content Manager.',
        draft: false,
        prerelease: false,
      }),
    });
  } catch (err) {
    if (!alreadyExists(err)) throw err;

    // This is what publishing an update to a pack runs into, and what happens
    // after a release is deleted on github.com without its tag: the lookup by
    // tag finds nothing, but creating one is refused because the tag is taken.
    // Fetching by tag again resolves it; if even that fails, the release is a
    // draft or otherwise not reachable that way, so it is listed instead.
    try {
      return await api(`/repos/${fullName}/releases/tags/${encodeURIComponent(tag)}`, { token });
    } catch { /* fall through to the wider search */ }

    const all = await api(`/repos/${fullName}/releases?per_page=100`, { token });
    const match = all.find((r) => r.tag_name === tag);
    if (match) return match;

    throw new Error('GitHub says a release for this pack already exists, but it cannot be found. '
      + 'Deleting the leftover tag on GitHub will let it be published again.');
  }
}

/**
 * Uploads the zip as a release asset and returns its public address.
 *
 * An asset of the same name is deleted first. GitHub does not overwrite them —
 * it appends a suffix and quietly leaves the old one in place, which would mean
 * the record's checksum and the file at the URL disagreeing.
 */
/**
 * Deletes a release asset by name, if it is there.
 *
 * GitHub will not overwrite an asset — it refuses the upload as already
 * existing — so publishing the same pack a second time means clearing the old
 * one first. Quiet when there is nothing to clear, which is the normal case.
 */
async function removeAsset(token, repoFullName, releaseId, name) {
  let assets = [];
  try {
    assets = await api(`/repos/${repoFullName}/releases/${releaseId}/assets?per_page=100`, { token });
  } catch (err) {
    if (!notFound(err)) throw err;
    return;
  }

  for (const asset of assets.filter((a) => a.name === name)) {
    try {
      await api(`/repos/${repoFullName}/releases/assets/${asset.id}`, {
        token, method: 'DELETE', raw: true,
      });
    } catch (err) {
      // Already gone is the outcome we wanted.
      if (!notFound(err)) throw err;
    }
  }
}

async function uploadAsset(token, release, zipPath, { onProgress } = {}) {
  const name = path.basename(zipPath);
  const bytes = fs.statSync(zipPath).size;

  if (bytes > MAX_ASSET_BYTES) {
    throw new Error('GitHub will not take a file that large. The pack needs to be under 2 GB.');
  }

  // Asked of GitHub rather than read off the release object we happen to hold.
  // That object may have been fetched before an earlier attempt uploaded
  // something, and a stale assets list is why "already exists" kept coming back
  // even though the clash was supposedly being cleared.
  await removeAsset(token, release.repoFullName, release.id, name);

  if (onProgress) onProgress({ stage: 'uploading', bytes, sent: 0, percent: 0 });

  // Counted as it goes out. This is the only part of publishing that takes real
  // time — tens of megabytes on a home connection — and without byte progress a
  // bar would sit still for minutes on the one step where somebody is actually
  // waiting.
  //
  // Counted by a Transform, which sees each chunk and hands it straight on.
  //
  // Two earlier attempts at this got it wrong in the same way, and the reason is
  // worth writing down: attaching a `data` listener to a stream — any stream —
  // switches it to flowing mode and delivers the bytes to that listener. If the
  // thing meant to send them has not started reading yet, they are gone. It
  // truncates the upload, and GitHub rejects it as not matching the length that
  // was declared.
  //
  // A Transform cannot make that mistake: counting happens inside the pipeline
  // and every chunk is explicitly passed onward.
  let sent = 0;
  const counter = new Transform({
    transform(chunk, _encoding, done) {
      sent += chunk.length;
      if (onProgress) {
        onProgress({
          stage: 'uploading',
          bytes,
          sent,
          // Bytes handed to the socket are not bytes acknowledged by GitHub, so
          // this runs slightly ahead of the truth. Capped at 99 so it cannot
          // claim to be finished while the request is still open.
          percent: Math.min(99, Math.round((sent / bytes) * 100)),
        });
      }
      done(null, chunk);
    },
  });

  const file = fs.createReadStream(zipPath);
  file.on('error', (err) => counter.destroy(err));
  file.pipe(counter);
  const stream = counter;

  // The upload URL is a template ending in {?name,label}, which is not a real
  // query string and has to come off before anything is appended.
  const base = release.upload_url.replace(/\{.*\}$/, '');

  let uploaded;
  try {
    uploaded = await api(`${base}?name=${encodeURIComponent(name)}`, {
      token,
      method: 'POST',
      headers: { 'content-type': 'application/zip', 'content-length': String(bytes) },
      body: stream,
      // Node needs telling that a stream body is not a simple buffer.
      duplex: 'half',
      // The shared 30 second timeout is for API calls that answer immediately.
      // This one has to carry the whole file, and the timeout covers the entire
      // transfer rather than resetting on activity — so on a slow connection a
      // short one aborts an upload that was going perfectly well.
      timeoutMs: uploadTimeoutFor(bytes),
    });
  } finally {
    // Closed whatever happened. A failed upload leaves this stream open
    // otherwise, and on Windows an open handle means the zip cannot be deleted
    // or replaced — so the next attempt to package that pack fails with EPERM,
    // for as long as the app stays running.
    stream.destroy();
  }

  return { url: uploaded.browser_download_url, bytes, name };
}

/**
 * The whole thing: sign-in state in, a finished download URL out.
 *
 * Takes a token rather than fetching one, so that signing in and publishing stay
 * separable — the caller decides when to interrupt somebody with a code.
 */
/**
 * Offers a finished record to the directory, as an issue.
 *
 * An issue rather than a pull request because the app would otherwise have to
 * fork the directory, keep that fork in step, and branch inside it — three
 * things to go wrong before anyone has read the submission. An issue is one
 * call, and an Action on the other side does the rest.
 *
 * The record goes in a fenced block so the Action can lift it out exactly as
 * written, rather than trying to read prose.
 */
async function submitRecord(token, record) {
  if (!DIRECTORY_REPO) {
    throw new Error('This build has no pack directory configured, so there is nowhere to submit to.');
  }

  const body = [
    `**${record.title}** — a ${record.type} pack by ${record.author}.`,
    '',
    record.summary || '',
    '',
    '```json',
    JSON.stringify(record, null, 2),
    '```',
    '',
    '<sub>Submitted from the Choicer Voicer Content Manager.</sub>',
  ].join('\n');

  const issue = await api(`/repos/${DIRECTORY_REPO}/issues`, {
    token,
    method: 'POST',
    body: JSON.stringify({
      title: `Submit: ${record.title}`,
      body,
      labels: ['submission'],
    }),
  });

  return { url: issue.html_url, number: issue.number };
}

async function publish(token, { zipPath, packId, title }, { onProgress } = {}) {
  const say = (stage, extra) => { if (onProgress) onProgress({ stage, ...extra }); };

  /**
   * Names the step a failure came from.
   *
   * Publishing is five calls to GitHub and any of them can be refused for the
   * same reason. Without this the message is the same wherever it came from,
   * and working out which one failed means guessing — which has now cost two
   * rounds of guessing that could have been one look.
   */
  const during = async (what, run) => {
    try {
      return await run();
    } catch (err) {
      err.message = `${err.message} (while ${what})`;
      throw err;
    }
  };

  say('checking');
  const me = await during('checking your account', () => whoAmI(token));

  say('preparing');
  const repo = await during('finding your pack repository', () => ensureRepo(token, me.login));

  say('release');
  const tag = `pack-${packId}`;
  const release = await during('making the release',
    () => ensureRelease(token, repo.fullName, tag, title || packId));

  const asset = await during('uploading the pack', () => uploadAsset(
    token,
    { ...release, repoFullName: repo.fullName },
    zipPath,
    { onProgress },
  ));

  say('done');
  return {
    downloadUrl: asset.url,
    bytes: asset.bytes,
    author: me.login,
    repoUrl: repo.htmlUrl,
    releaseUrl: release.html_url,
    repoCreated: repo.created,
  };
}

module.exports = {
  PACK_REPO,
  SCOPE,
  MAX_ASSET_BYTES,
  configure,
  isConfigured,
  canSubmit,
  submitRecord,
  alreadyExists,
  notFound,
  // Shared so the moderation side can talk to GitHub through the same headers,
  // error translation and timeouts rather than growing a second client.
  request: api,
  startSignIn,
  waitForToken,
  whoAmI,
  ensureRepo,
  ensureRelease,
  uploadAsset,
  publish,
};
