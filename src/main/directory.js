'use strict';

/**
 * The shape of a shared pack, and the rules for whether one is acceptable.
 *
 * This is stage one of docs/PLATFORM_PLAN.md and deliberately the first thing
 * written, because everything else is downstream of it: the submission form
 * fills one of these in, the review queue checks one, the app reads a list of
 * them, and the installer trusts nothing in one until it has been through here.
 *
 * Two rules shape the whole file:
 *
 *   Records are data from strangers. Every field is checked for type, length
 *   and shape before it is believed, and nothing is trusted because it came
 *   from the directory rather than from a person.
 *
 *   The platform never holds the pack. A record carries a link to wherever the
 *   author hosts it and a checksum of what should arrive, and that pairing is
 *   what makes hosting elsewhere safe.
 *
 * No dependencies, no filesystem, no network. It is pure so it can be tested
 * exhaustively and reused unchanged by a build script, the app, and eventually
 * a serverless check on submission.
 */

const RECORD_VERSION = 1;

// Pack types, matching the game's own folders. A record naming anything else
// describes something this app could not install.
const PACK_TYPES = ['voice', 'player', 'host', 'judges', 'studio', 'menu', 'chatter'];

// Licences an author may declare. Kept to a short list rather than free text so
// it can be displayed, filtered and reasoned about. "unstated" exists because a
// forced choice produces a wrong answer more often than an honest blank.
/**
 * What a pack may contain that somebody would want warning of.
 *
 * Declared by the author rather than guessed at. Nothing here can be detected
 * reliably from the files, and a wrong guess is worse than no guess: labelling
 * an innocent pack is unfair, and missing a real one gives false confidence.
 *
 * Deliberately short. A long list gets skipped, and every entry that nobody
 * ticks makes the ones that matter easier to miss.
 *
 * There is no option for sexual content or nudity, and that is not an oversight
 * — the directory does not list it at all. Offering the tick box would say the
 * opposite: that such a pack is welcome as long as it is labelled.
 */
const CONTENT_FLAGS = [
  { id: 'language', label: 'Strong language' },
  { id: 'violence', label: 'Graphic violence' },
  { id: 'drugs', label: 'Drug or alcohol reference' },
  { id: 'flashing', label: 'Flashing images' },
];

const CONTENT_FLAG_IDS = CONTENT_FLAGS.map((f) => f.id);

/**
 * What an author can say about reuse, and how each one is put to them.
 *
 * Written as plain sentences rather than licence names. Almost nobody knows
 * what "CC BY-NC-SA" permits, and a dropdown of initials gets answered by
 * picking the first one, which is how packs end up licensed by accident.
 *
 * The identifiers are kept underneath because they are what the record stores
 * and what the validator accepts. Both live here so a licence cannot be offered
 * that the directory then refuses.
 */
const LICENCE_CHOICES = [
  { id: 'unstated', label: 'Rather not say' },
  { id: 'cc0', label: 'Anyone may use it, no credit needed' },
  { id: 'cc-by', label: 'Anyone may use it, with credit' },
  { id: 'cc-by-sa', label: 'With credit, and shared the same way' },
  { id: 'cc-by-nc', label: 'With credit, nothing commercial' },
  { id: 'cc-by-nc-sa', label: 'With credit, nothing commercial, shared alike' },
  { id: 'all-rights-reserved', label: 'Ask me first' },
];

const LICENCES = LICENCE_CHOICES.map((l) => l.id);

/**
 * Where a download may point.
 *
 * Two separate reasons for a list rather than "any https link", and the second
 * one is easy to miss:
 *
 * Safety. An installer that follows arbitrary addresses is an installer that
 * can be aimed at a local file, at `localhost`, or at something inside the
 * user's own network.
 *
 * It has to actually work. The app downloads the file itself, with no browser
 * and no logged-in session, so the address has to return the bytes. Plenty of
 * popular file hosts return an HTML page with a button on it instead:
 *
 *   drive.google.com   shows a virus-scan interstitial for anything large
 *   mega.nz            decrypts in their own client, there is no plain link
 *   mediafire.com      serves a landing page that has to be scraped
 *   itch.io            downloads run through a session and their API
 *
 * Allowing those would mean records that pass every check and then fail at the
 * moment someone presses install, which is the worst place to find out. They
 * are refused at submission with an explanation instead.
 */
const ALLOWED_HOSTS = [
  // Release assets. Direct, unauthenticated, and stable.
  //
  // A download from github.com does not serve the bytes itself — it redirects
  // to whichever host GitHub currently uses for release assets, and the list
  // has to cover those too or the redirect is refused halfway through. GitHub
  // moved from objects.* to release-assets.* without notice, which is exactly
  // the kind of change this list has to survive, so both are here.
  // The whole user-content domain rather than the handful of subdomains in use
  // this month. GitHub owns all of it, and naming them individually means the
  // next rename breaks every download until someone notices.
  'github.com',
  'githubusercontent.com',
  'gitlab.com', 'codeberg.org',
  // Dropbox serves the file directly once the link ends in dl=1.
  'dropbox.com', 'dropboxusercontent.com',
];

const LIMITS = {
  id: 64,
  title: 80,
  summary: 140,
  description: 4000,
  handle: 20,
  tag: 24,
  tags: 8,
  url: 2048,
  // A pack is video and audio, so this is generous. It exists to catch a record
  // claiming something absurd, not to police size.
  bytes: 2 * 1024 * 1024 * 1024,
  // Listings one account may hold at once.
  //
  // Not a storage limit. The files sit on the publisher's own GitHub and cost
  // the directory nothing; what this protects is the directory itself, which is
  // a single JSON file everyone downloads. One account listing a thousand packs
  // makes that file slow for everybody and buries every other author.
  //
  // Set where a real person making real packs will never meet it, and an
  // automated flood meets it immediately. Updating a pack already listed does
  // not count, so the limit never blocks improving what is there.
  packsPerAuthor: 50,
};

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/**
 * A GitHub username, as GitHub actually defines one.
 *
 * One to thirty-nine characters, letters and numbers and single hyphens, never
 * starting or ending with a hyphen and never two hyphens in a row.
 *
 * This used to be a rule of its own making: three to twenty characters, and
 * underscores allowed. Every part of that was wrong in a way that turned people
 * away. `author` is always the account that hosts the file, which this app
 * reads straight from GitHub, so a username GitHub issued and this refuses is
 * simply a person who cannot publish and is told their own name is invalid.
 * Anyone with a name shorter than three characters or longer than twenty hit
 * it, which is a great many people, and no amount of retrying would have helped.
 *
 * It was then wrong a second time in the same spirit: lower case only. GitHub
 * keeps the capitals somebody signed up with and hands them back that way, so
 * `Reagan-Val` arrives exactly like that and was refused as not being a GitHub
 * username, which is both false and impossible to act on. Matched without
 * regard to case, and stored as it was given, because it is somebody's name.
 */
const HANDLE_PATTERN = /^[a-z0-9](?:-?[a-z0-9]){0,38}$/i;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/;
// Either case is accepted and normalised down on the way out, because plenty of
// tools print a checksum in capitals.
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;

/**
 * Handles nobody may take, because taking one is a way to be believed.
 *
 * Checked with the confusable characters folded together, so `adm1n` and
 * `ａdmin` are caught alongside `admin`.
 */
const RESERVED_HANDLES = [
  'admin', 'admins', 'administrator', 'mod', 'mods', 'moderator', 'staff',
  'official', 'support', 'help', 'system', 'root', 'owner', 'team',
  'choicervoicer', 'choicer', 'voicer', 'yeahmaybe', 'contentmanager',
  'null', 'undefined', 'anonymous', 'deleted', 'unknown', 'me', 'you',
];

/** Folds lookalike characters together so a handle cannot impersonate by shape. */
function foldConfusables(text) {
  return String(text)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    // Both members of each lookalike pair collapse to the same letter, so it
    // does not matter which side the impersonation came from. `1` folding to
    // `l` alone would leave `adm1n` and `admin` different, which was the bug
    // this comment exists to stop being reintroduced.
    .replace(/[1l]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/2/g, 'z')
    .replace(/6/g, 'g')
    .replace(/9/g, 'g');
}

function isReservedHandle(handle) {
  const folded = foldConfusables(handle);
  return RESERVED_HANDLES.some((reserved) => foldConfusables(reserved) === folded);
}

// ---------------------------------------------------------------------------
// Field checks
// ---------------------------------------------------------------------------

/**
 * Collects problems rather than throwing on the first.
 *
 * Someone filling in a submission form wants every mistake at once, not one per
 * attempt, and the review queue wants the whole picture in one place.
 */
class Problems {
  constructor() {
    this.list = [];
  }

  add(field, message) {
    this.list.push({ field, message });
    return false;
  }

  get ok() {
    return this.list.length === 0;
  }
}

function checkText(problems, value, field, { max, required = true, min = 1 }) {
  if (value === undefined || value === null || value === '') {
    return required ? problems.add(field, `${field} is required`) : true;
  }
  if (typeof value !== 'string') return problems.add(field, `${field} must be text`);

  // Control characters and direction overrides, which can make displayed text
  // read as something other than what it is.
  // Written as escapes, not as the characters themselves. Typed literally they
  // are invisible in every editor, one of them is a NUL that makes git treat this
  // whole file as binary (no diffs, no grep), and any tool that tidies a file can
  // silently delete them and quietly disarm the check.
  if (/[\u0000-\u0008\u000B-\u001F\u202A-\u202E\u2066-\u2069]/.test(value)) {
    return problems.add(field, `${field} contains characters that are not allowed`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) return problems.add(field, `${field} is too short`);
  if (trimmed.length > max) return problems.add(field, `${field} is longer than ${max} characters`);
  return true;
}

/**
 * Checks a download link.
 *
 * Refuses anything that is not https on a host known to serve files. That is a
 * blunt rule and it will occasionally block somewhere legitimate, which is the
 * right way round: the alternative is an installer that can be aimed at
 * `file://`, at `localhost`, or at an address inside somebody's own network.
 */
function checkDownloadUrl(problems, raw, field = 'downloadUrl') {
  if (!checkText(problems, raw, field, { max: LIMITS.url })) return false;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return problems.add(field, 'that is not a web address');
  }

  if (url.protocol !== 'https:') {
    return problems.add(field, 'the link has to start with https://');
  }
  if (url.username || url.password) {
    return problems.add(field, 'the link cannot carry a username or password');
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const allowed = ALLOWED_HOSTS.some((ok) => host === ok || host.endsWith(`.${ok}`));
  if (!allowed) {
    return problems.add(field,
      `${host} is not somewhere packs can be downloaded from. Put the zip on a GitHub, GitLab or `
      + 'Codeberg release, or Dropbox. Drive, MEGA, MediaFire and itch cannot be used, because '
      + 'they answer with a page rather than the file.');
  }
  return true;
}

/**
 * The account a download address belongs to, or null if it does not name one.
 *
 * Every forge in ALLOWED_HOSTS puts the owner first in the path, so this is one
 * rule rather than four. Release asset addresses on GitHub are also served from
 * objects.githubusercontent.com, which carries no owner in the path — those are
 * unattributable and handled by the caller.
 */
function ownerOfDownload(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const forge = ['github.com', 'gitlab.com', 'codeberg.org']
    .some((ok) => host === ok || host.endsWith(`.${ok}`));
  if (!forge) return null;

  const first = url.pathname.split('/').filter(Boolean)[0];
  return first ? first.toLowerCase() : null;
}

/**
 * Refuses a record whose author is not the account hosting the file.
 *
 * This is the whole identity model, and it is deliberately not "check they are
 * signed in". A pack claiming to be by someone must be hosted on that person's
 * own account, and only that person can put a file there — so the claim is
 * checked against something the forge already enforces rather than something
 * this code has to be trusted to have done.
 *
 * It keeps working when sign-in does not: for a record submitted by hand, for
 * one edited after review, and for a stolen token, because none of those give
 * anyone the ability to publish a release under a different account.
 *
 * Addresses that name no owner are left alone. They are refused as
 * unattributable at the point of submission instead, which is where there is
 * enough context to say so usefully.
 */
function checkAuthorOwnsDownload(problems, author, downloadUrl, field = 'author') {
  const owner = ownerOfDownload(downloadUrl);
  if (!owner) return true;
  if (String(author).toLowerCase() === owner) return true;

  return problems.add(field,
    `this says it is by ${author}, but it downloads from ${owner}'s account. `
    + 'A pack has to be hosted by the person it is credited to.');
}

/**
 * Checks the content warnings.
 *
 * Absent is allowed and means "none declared", which is different from a pack
 * that has been looked at and found to contain nothing. The record cannot tell
 * those apart and should not pretend to.
 */
function checkContent(problems, content) {
  if (content === undefined || content === null) return true;
  if (!Array.isArray(content)) return problems.add('content', 'content must be a list');
  if (content.length > CONTENT_FLAG_IDS.length) {
    return problems.add('content', 'content has more entries than there are kinds');
  }

  const seen = new Set();
  for (const flag of content) {
    if (!CONTENT_FLAG_IDS.includes(flag)) {
      return problems.add('content',
        `"${flag}" is not something a pack can be marked as. Use one of: ${CONTENT_FLAG_IDS.join(', ')}`);
    }
    if (seen.has(flag)) return problems.add('content', `"${flag}" is listed twice`);
    seen.add(flag);
  }
  return true;
}

function checkTags(problems, tags) {
  if (tags === undefined) return true;
  if (!Array.isArray(tags)) return problems.add('tags', 'tags must be a list');
  if (tags.length > LIMITS.tags) {
    return problems.add('tags', `at most ${LIMITS.tags} tags`);
  }
  const seen = new Set();
  for (const tag of tags) {
    if (typeof tag !== 'string' || !TAG_PATTERN.test(tag)) {
      return problems.add('tags', 'tags may use lower case letters, numbers and dashes');
    }
    if (seen.has(tag)) return problems.add('tags', `"${tag}" is listed twice`);
    seen.add(tag);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * Checks a pack record.
 *
 * Returns `{ ok, problems, record }`. The returned record is a rebuilt copy
 * holding only known fields, so anything extra a submission carried is dropped
 * rather than stored and later trusted.
 *
 * `fromIndex` says the record is already in the directory rather than being
 * offered to it. The only difference is the download count: a listed pack has
 * earned one and must keep it, and a submission claiming one is claiming
 * something nobody counted. Both go through the same function so there is one
 * definition of a valid record, not two that drift.
 */
function validateRecord(input, { fromIndex = false } = {}) {
  const problems = new Problems();

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    problems.add('record', 'a record must be an object');
    return { ok: false, problems: problems.list, record: null };
  }

  if (input.version !== undefined && input.version !== RECORD_VERSION) {
    problems.add('version', `this app understands version ${RECORD_VERSION} records`);
  }

  if (typeof input.id !== 'string' || !ID_PATTERN.test(input.id)) {
    problems.add('id', 'id may use lower case letters, numbers and dashes');
  }
  if (typeof input.author !== 'string' || !HANDLE_PATTERN.test(input.author)) {
    // Named, because "a handle" is not enough to work out what is wrong with
    // yours. This is always the GitHub account the pack is hosted on, so the
    // only way to reach this now is a name GitHub itself would not issue.
    problems.add('author',
      `"${input.author}" is not a GitHub username. A username is 1 to 39 letters, numbers `
      + 'and single hyphens, and cannot start or end with a hyphen.');
  } else if (isReservedHandle(input.author)) {
    problems.add('author', 'that handle is reserved');
  }

  if (!PACK_TYPES.includes(input.type)) {
    problems.add('type', `type must be one of: ${PACK_TYPES.join(', ')}`);
  }
  if (!LICENCES.includes(input.licence)) {
    problems.add('licence', `licence must be one of: ${LICENCES.join(', ')}`);
  }

  checkText(problems, input.title, 'title', { max: LIMITS.title, min: 2 });
  checkText(problems, input.summary, 'summary', { max: LIMITS.summary });
  checkText(problems, input.description, 'description',
    { max: LIMITS.description, required: false });
  checkTags(problems, input.tags);
  checkContent(problems, input.content);
  if (checkDownloadUrl(problems, input.downloadUrl)) {
    // Only worth asking once the address is known to be a real one.
    checkAuthorOwnsDownload(problems, input.author, input.downloadUrl);
  }

  if (typeof input.sha256 !== 'string' || !SHA256_PATTERN.test(input.sha256)) {
    problems.add('sha256', 'a record needs the SHA-256 of the zip it points at');
  }

  // The icon, if there is one.
  //
  // Optional in the schema and required by the app before it will let anything
  // be shared, which are two different jobs. A record written before icons
  // existed is not invalid, it just has nothing to show.
  //
  // The two fields stand or fall together. An address with no hash is an image
  // that can be replaced with anything at any time after a pack has been
  // accepted, which is exactly the swap this is here to prevent, so it is
  // refused rather than accepted and shown unverified.
  if (input.iconUrl !== undefined && input.iconUrl !== null) {
    if (checkDownloadUrl(problems, input.iconUrl, 'iconUrl')) {
      checkAuthorOwnsDownload(problems, input.author, input.iconUrl, 'iconUrl');
    }
    if (typeof input.iconSha256 !== 'string' || !SHA256_PATTERN.test(input.iconSha256)) {
      problems.add('iconSha256',
        'an icon needs its SHA-256, so it cannot be swapped for something else later');
    }
  }
  if (!Number.isInteger(input.bytes) || input.bytes <= 0 || input.bytes > LIMITS.bytes) {
    problems.add('bytes', 'bytes must be the size of the zip');
  }

  for (const field of ['published', 'updated']) {
    const value = input[field];
    if (value === undefined && field === 'updated') continue;
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      problems.add(field, `${field} must be a date`);
    }
  }

  if (!problems.ok) return { ok: false, problems: problems.list, record: null };

  // Rebuilt from known fields only. A submission carrying anything else has it
  // dropped here rather than stored and trusted by something later.
  return {
    ok: true,
    problems: [],
    record: {
      version: RECORD_VERSION,
      id: input.id,
      type: input.type,
      title: input.title.trim(),
      summary: input.summary.trim(),
      description: (input.description || '').trim(),
      author: input.author,
      licence: input.licence,
      tags: (input.tags || []).slice().sort(),
      // Sorted so two records with the same warnings compare equal.
      content: (input.content || []).slice().sort(),
      downloadUrl: input.downloadUrl,
      sha256: input.sha256.toLowerCase(),
      // Null rather than absent when there is none, so every record has the
      // same shape and nothing downstream has to test for two kinds of missing.
      iconUrl: input.iconUrl || null,
      iconSha256: input.iconUrl ? input.iconSha256.toLowerCase() : null,
      bytes: input.bytes,
      gameVersion: typeof input.gameVersion === 'string' ? input.gameVersion : null,
      // Counted elsewhere, never submitted. A record arriving from outside the
      // index starts at zero whatever number it carries, so a pack cannot be
      // published claiming thousands of downloads it never had.
      downloads: fromIndex && Number.isInteger(input.downloads) && input.downloads >= 0
        ? input.downloads : 0,
      // The counting job's own workings, which have to survive being rewritten
      // by everything else that touches the index.
      //
      // Publishing an update uploads a new file, and GitHub starts that file's
      // counter at zero. Without somewhere to bank what the previous one
      // reached, a popular pack would drop back to nothing on the day its
      // author fixed a caption. `countedUrl` is how the job notices that the
      // file it is counting is not the file it counted last time.
      //
      // Both are dropped from anything arriving as a submission, exactly like
      // the count itself, so neither can be used to claim a history.
      downloadsBase: fromIndex && Number.isInteger(input.downloadsBase)
        && input.downloadsBase >= 0 ? input.downloadsBase : 0,
      countedUrl: fromIndex && typeof input.countedUrl === 'string' ? input.countedUrl : null,
      // Whether the directory still shows this pack.
      //
      // Kept only for records already in the index, and true unless something
      // said otherwise. A submission cannot arrive claiming to be unlisted, and
      // more to the point it cannot arrive claiming to be listed either, which
      // is what a hidden pack would try if it were resubmitted.
      //
      // This has to survive validation. It did not, and that was the whole of
      // the unlisting bug: `/hide` wrote the flag into index.json, the record
      // was then rebuilt from known fields with this one not among them, and
      // the pack carried on showing as though nothing had happened.
      listed: fromIndex ? input.listed !== false : true,
      published: new Date(input.published).toISOString(),
      updated: new Date(input.updated || input.published).toISOString(),
    },
  };
}

/**
 * Whether an account is banned, and until when.
 *
 * A ban is either a plain handle, which means forever, or `{ who, until }`
 * where `until` is an ISO date. Both shapes live in the same list so that the
 * bans written before timed ones existed keep working without being migrated.
 *
 * Expiry is decided here, when the question is asked, rather than by something
 * that runs and clears the list. A ban that only lifts when a scheduled job
 * fires is a ban that outlives its own deadline whenever that job is late,
 * broken or disabled, and this project has already been bitten twice by relying
 * on a workflow firing. Reading the date is exact and needs nothing to happen.
 *
 * Returns `{ banned, until }`, where `until` is null for a permanent ban.
 */
function banStatus(moderation, handle, now = Date.now()) {
  const list = (moderation && Array.isArray(moderation.banned)) ? moderation.banned : [];
  const wanted = String(handle || '').toLowerCase();

  for (const entry of list) {
    const who = typeof entry === 'string' ? entry : (entry && entry.who);
    if (String(who || '').toLowerCase() !== wanted) continue;

    const until = typeof entry === 'string' ? null : (entry && entry.until) || null;
    if (!until) return { banned: true, until: null };

    const ends = Date.parse(until);
    // An unreadable date is treated as permanent rather than as no ban at all.
    // Getting this wrong in the lenient direction lets somebody publish who was
    // told they could not, which is worse than the reverse and harder to spot.
    if (!Number.isFinite(ends)) return { banned: true, until: null };
    if (ends > now) return { banned: true, until };
  }

  return { banned: false, until: null };
}

/**
 * Whether an author may add one more listing.
 *
 * Replacing a pack they already have listed is always allowed: that is an
 * update, and a limit that blocked improving an existing pack would push people
 * into publishing "MyPack v2" beside the old one, which is worse for everybody
 * and uses more of the limit rather than less.
 *
 * Returns `{ ok, held, limit }` so the caller can say the actual numbers rather
 * than "no".
 */
function roomForAnother(packs, author, id) {
  const mine = (Array.isArray(packs) ? packs : [])
    // Taken down packs do not count. The limit protects the size of the list
    // people actually browse, and a hidden pack is not in it. Counting them
    // would also mean a moderator's decision quietly costing the author a slot
    // they cannot see and cannot free.
    .filter((p) => p && p.listed !== false
      && String(p.author || '').toLowerCase() === String(author).toLowerCase());

  const held = mine.length;
  if (mine.some((p) => p.id === id)) return { ok: true, held, limit: LIMITS.packsPerAuthor };
  return { ok: held < LIMITS.packsPerAuthor, held, limit: LIMITS.packsPerAuthor };
}

/**
 * Checks a whole index before the app believes any of it.
 *
 * A bad entry is dropped rather than failing the file, because one malformed
 * record should not take the directory down for everyone. What was dropped is
 * reported so it can be noticed rather than silently lost.
 */
function validateIndex(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.packs)) {
    return { ok: false, packs: [], rejected: [], error: 'that is not a directory index' };
  }

  const packs = [];
  const rejected = [];
  const seen = new Set();

  for (const entry of input.packs) {
    const result = validateRecord(entry, { fromIndex: true });
    if (!result.ok) {
      rejected.push({ id: entry && entry.id, problems: result.problems });
      continue;
    }
    // Two records claiming one id would make "which pack is this" ambiguous
    // everywhere downstream.
    if (seen.has(result.record.id)) {
      rejected.push({ id: result.record.id, problems: [{ field: 'id', message: 'duplicate id' }] });
      continue;
    }
    seen.add(result.record.id);
    packs.push(result.record);
  }

  return { ok: true, packs, rejected, error: null };
}

// ---------------------------------------------------------------------------
// Unpacking safely
// ---------------------------------------------------------------------------

/**
 * What a downloaded pack may contain. Exactly what the game reads, and nothing
 * that any operating system will treat as a program.
 */
const INSTALLABLE_EXTS = [
  '.ogv', '.wav', '.mp3', '.ogg', '.opus',
  '.png', '.jpg', '.jpeg',
  '.glb', '.gltf',
  '.ini', '.cfg', '.json', '.txt', '.md',
];

const ARCHIVE_LIMITS = {
  entries: 500,
  // Uncompressed total. A pack is a video and some audio; anything past this is
  // either a mistake or an attempt to fill the disk.
  totalBytes: 2 * 1024 * 1024 * 1024,
  // Compressed to uncompressed. A zip bomb is a few kilobytes claiming to be
  // gigabytes, so the ratio catches it before the size does.
  ratio: 200,
  depth: 6,
};

/**
 * Decides where one entry of an archive is allowed to land.
 *
 * This is the check that matters most in the whole directory feature, because
 * it is the only one whose failure damages the machine rather than the app. A
 * zip is a list of names and contents, and a name may contain `../`, so an
 * entry can ask to be written anywhere the process can write. The defence is to
 * work out where the name actually resolves to and refuse anything that is not
 * inside the folder being written into, **before opening a file to write**.
 *
 * Written as a pure function on purpose: it takes strings and returns a
 * decision, so it can be tested against every hostile name anyone can think of
 * without unpacking anything.
 *
 * Returns `{ ok, path, reason }`.
 */
function safeEntryPath(targetDir, entryName) {
  const path = require('path');

  if (typeof entryName !== 'string' || !entryName) {
    return { ok: false, path: null, reason: 'an entry with no name' };
  }
  // Backslashes are separators on Windows, so a name using them has to be
  // considered in the same terms rather than treated as an odd filename.
  const name = entryName.replace(/\\/g, '/');

  if (name.includes('\0')) {
    return { ok: false, path: null, reason: 'an entry name containing a null byte' };
  }
  if (path.isAbsolute(name) || /^[a-zA-Z]:/.test(name)) {
    return { ok: false, path: null, reason: `absolute path: ${entryName}` };
  }
  // Windows device names are files that are not files. Writing one can hang or
  // talk to hardware.
  if (/(^|\/)(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) {
    return { ok: false, path: null, reason: `reserved device name: ${entryName}` };
  }
  if (name.split('/').filter(Boolean).length > ARCHIVE_LIMITS.depth) {
    return { ok: false, path: null, reason: `nested too deeply: ${entryName}` };
  }

  const root = path.resolve(targetDir);
  const dest = path.resolve(root, name);

  // The check itself. Comparing resolved paths, and requiring the separator, so
  // that a sibling folder whose name merely starts the same ("packs-evil"
  // beside "packs") cannot pass.
  if (dest !== root && !dest.startsWith(root + path.sep)) {
    return { ok: false, path: null, reason: `escapes the folder: ${entryName}` };
  }

  const ext = path.extname(dest).toLowerCase();
  if (!INSTALLABLE_EXTS.includes(ext)) {
    return { ok: false, path: null, reason: `not a file the game reads: ${entryName}` };
  }

  return { ok: true, path: dest, reason: null };
}

/**
 * Whether an archive's shape is plausible before any of it is written.
 *
 * Takes the entry list an archive reader hands back, so it stays testable and
 * works with whichever reader ends up being used.
 */
function checkArchiveShape(entries) {
  const problems = [];
  if (!Array.isArray(entries)) return { ok: false, problems: ['not an archive'] };

  if (entries.length > ARCHIVE_LIMITS.entries) {
    problems.push(`${entries.length} files, more than the ${ARCHIVE_LIMITS.entries} allowed`);
  }

  let total = 0;
  let compressed = 0;
  for (const entry of entries) {
    total += Number(entry.uncompressedSize) || 0;
    compressed += Number(entry.compressedSize) || 0;
    // A symbolic link can point anywhere, which puts the whole path check back
    // in play after it has already passed.
    if (entry.isSymlink) problems.push(`${entry.name} is a link, which is not allowed`);
  }

  if (total > ARCHIVE_LIMITS.totalBytes) {
    problems.push(`unpacks to ${Math.round(total / 1e6)} MB, which is too large`);
  }
  if (compressed > 0 && total / compressed > ARCHIVE_LIMITS.ratio) {
    problems.push('compressed far beyond what real media does, which is how a zip bomb looks');
  }

  return { ok: problems.length === 0, problems };
}

module.exports = {
  ARCHIVE_LIMITS,
  ownerOfDownload,
  safeEntryPath,
  checkArchiveShape,
  PACK_TYPES,
  CONTENT_FLAGS,
  LICENCE_CHOICES,
  ALLOWED_HOSTS,
  LIMITS,
  isReservedHandle,
  // Nothing in this app calls this, and it is not dead. The directory's own
  // workflow fetches this file from here and uses it when a submission arrives,
  // which is the only place the limit can be enforced now that listing happens
  // without anybody in the app pressing anything.
  banStatus,
  roomForAnother,
  validateRecord,
  validateIndex,
};
