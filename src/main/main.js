'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeTheme } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { execFile } = require('child_process');
const { promisify } = require('util');

const gamedata = require('./gamedata');
const ffmpeg = require('./ffmpeg');
const { runExport } = require('./exporter');
const { ensureProxy } = require('./proxy');
const { scanContent } = require('./content');
const {
  createPack, installPack, deletePack, trashClip, restoreClip, writeClipMeta, saveImage, writeIni,
  clipRecordings, pruneTrash, packSessions, orphanSessions, deleteSessions, deleteSession,
  writeIniSections, identifyPack,
} = require('./create');
const convert = require('./convert');
const {
  validateRecord, validateIndex, checkArchiveShape, CONTENT_FLAGS, LICENCE_CHOICES,
  ALLOWED_HOSTS,
} = require('./directory');
const {
  installFromRecord, packForSharing, download, checksum, listEntries, extractInto,
} = require('./modinstall');
const github = require('./github');
const review = require('./review');
const { scanPack } = require('./packscan');

const execFileAsync = promisify(execFile);

const APP_NAME = 'Choicer Voicer Content Manager';

/**
 * The OAuth application publishing signs in against.
 *
 * Public on purpose, and safe in source: it appears in the address of every
 * device-flow sign-in. The flow deliberately has no client secret, because a
 * desktop app cannot keep one — anything shipped inside it can be read straight
 * out of the files by whoever installed it.
 */
const GITHUB_CLIENT_ID = 'Ov23lifiasIdhnLhqPR3';

/**
 * The repository holding the pack directory.
 *
 * Submissions are opened as issues here and the index is read from it. Kept as
 * two constants rather than one built from the other, because the index is
 * fetched from raw.githubusercontent.com while issues go to the API, and
 * guessing one address from the other is how a typo becomes hard to find.
 */
const DIRECTORY_REPO = 'jojozagjos/choicer-voicer-directory';
const DIRECTORY_INDEX_URL =
  `https://raw.githubusercontent.com/${DIRECTORY_REPO}/main/index.json`;

/** How big a directory index is allowed to be before it is refused. */
const MAX_INDEX_BYTES = 8 * 1024 * 1024;

// Windows works out what to call a program in the volume mixer, the taskbar
// and its notifications from these. Without them it falls back to the Electron
// runtime's own name, so playing anything put "Electron" in the volume mixer,
// which tells nobody anything and looks like a stray process.
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.jojozagjos.choicervoicercm');

const MEDIA_SCHEME = 'cvmedia';

// What counts as clip audio when probing a pack's lengths.
const AUDIO_EXTS_MAIN = ['.wav', '.mp3', '.ogg', '.opus'];

/**
 * Inspected packs, keyed by folder. Re-reading every config in a large library
 * on every scan is the whole cost of a scan, and the app rescans after each
 * edit, so unchanged packs are reused.
 */
const packCache = new Map();

/** Forgets a pack, so the next scan reads it fresh. */
function invalidatePack(dir) {
  if (!dir) return;
  packCache.delete(path.resolve(dir));
  packCache.delete(dir);
  // Anything already on screen from this pack may now be out of date. Only this
  // pack: see folderGenerations for why it is not everything.
  bumpMedia(dir);
}

/**
 * Registers an IPC handler that writes into a pack.
 *
 * The folder fingerprint catches files being added or removed, but not a
 * config being rewritten in place, which is most of what the editors do. Every
 * write therefore has to forget its pack. Routing them through here means that
 * happens by construction rather than by remembering, so a handler added later
 * cannot leave the library showing stale contents.
 *
 * `dirFrom` pulls the pack folder out of whatever shape the payload has.
 */
function handleWrite(channel, dirFrom, handler) {
  ipcMain.handle(channel, async (event, payload) => {
    const result = await handler(event, payload);
    try {
      const dirs = [].concat(dirFrom(payload, result) || []);
      for (const dir of dirs) {
        invalidatePack(dir);
        noteOwnWrite(dir);
      }
    } catch { /* nothing to forget */ }
    return result;
  });
}

// Folders this app has just written to. The watcher below sees its own writes
// otherwise, and would answer every saved caption with a reload of the thing
// being typed into.
const ownWrites = new Map();
const OWN_WRITE_QUIET_MS = 2500;

function noteOwnWrite(dir) {
  if (!dir) return;
  ownWrites.set(path.resolve(dir), Date.now());
  // The map only ever holds folders touched in the last few seconds.
  if (ownWrites.size > 64) {
    const cutoff = Date.now() - OWN_WRITE_QUIET_MS;
    for (const [key, at] of ownWrites) if (at < cutoff) ownWrites.delete(key);
  }
}

/**
 * Whether a reported change is one this app just made.
 *
 * Has to match in both directions. Windows does not always report the file that
 * changed: a write deep inside a watched tree often arrives as the folder above
 * it, so the reported path can be a parent of the folder written to as easily as
 * a child of it. Checking only upwards let every saved caption through as an
 * outside change.
 */
function isOwnWrite(target) {
  const now = Date.now();
  const fresh = (at) => at && now - at < OWN_WRITE_QUIET_MS;

  // The reported path, or something it sits inside, was written to.
  let dir = path.resolve(target);
  for (let depth = 0; depth < 4; depth++) {
    if (fresh(ownWrites.get(dir))) return true;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }

  // Or the reported path is a folder containing somewhere that was written to.
  const reported = path.resolve(target) + path.sep;
  for (const [written, at] of ownWrites) {
    if (fresh(at) && written.startsWith(reported)) return true;
  }
  return false;
}

/** The folder a file sits in, for writes that name a file rather than a pack. */
const dirOfFile = (file) => (file ? path.dirname(file) : null);

/**
 * Watches the game folder so packs changed outside the app show up on their own.
 *
 * Files arrive here by all sorts of routes the app never sees: the game writing
 * a recording, a pack unzipped into the folder, a picture replaced in an art
 * program. Rescan covers all of that, but only if somebody thinks to press it.
 *
 * Three things keep this from being a nuisance:
 *
 *  - Changes this app made are ignored. Without that, every saved caption would
 *    come straight back as a reload of the line being typed into.
 *  - Events are collected and acted on once things go quiet, because copying a
 *    pack in produces hundreds of them.
 *  - Only the folders that changed are forgotten, so the rescan stays cheap.
 *
 * The Rescan button stays. A watcher that misses something is worse than a
 * button, and this is the kind of thing that can miss something.
 */
let watcher = null;
let watchTimer = null;
const watchedDirs = new Set();

function stopWatching() {
  if (watcher) {
    try { watcher.close(); } catch { /* already gone */ }
    watcher = null;
  }
  clearTimeout(watchTimer);
  watchTimer = null;
  watchedDirs.clear();
}

function startWatching(gameDir) {
  stopWatching();
  if (!gameDir || !fs.existsSync(gameDir)) return;

  try {
    // Recursive watching is supported on Windows and macOS. Where it is not,
    // this throws and the app carries on with the button alone.
    watcher = fs.watch(gameDir, { recursive: true }, (_event, name) => {
      if (!name) return;
      const full = path.join(gameDir, name);

      // The app's own scratch files churn constantly mid-conversion.
      if (/\.part$/i.test(name) || name.includes(`.${process.pid}.`)) return;
      if (isOwnWrite(full)) return;

      // Both shapes, because Windows reports a change sometimes as the file and
      // sometimes as a folder above it. A pack edited in place keeps its file
      // count and its folder's modified time, so the cache will not notice on
      // its own and has to be told which folder to forget.
      watchedDirs.add(full);
      watchedDirs.add(path.dirname(full));
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        for (const dir of watchedDirs) invalidatePack(dir);
        watchedDirs.clear();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('content:changedOnDisk');
        }
      }, 900);
    });
  } catch (err) {
    console.warn(`Could not watch the game folder: ${err.message}`);
    watcher = null;
  }
}

/**
 * Long jobs the app can call off again, by the id it gave them.
 *
 * Trimming a video and building a backing track both take long enough that
 * somebody will wander off mid-way, and the editor closing has to actually stop
 * the work rather than just stop looking at it. An abandoned job still finishes
 * writing and still renames its output over the pack.
 */
const runningJobs = new Map();

function startJob(jobId) {
  const controller = new AbortController();
  // No id means the caller does not intend to cancel, which is fine; it just
  // gets a controller nothing will ever abort.
  if (jobId) runningJobs.set(jobId, controller);
  return controller;
}

function endJob(jobId) {
  if (jobId) runningJobs.delete(jobId);
}

function cancelJob(jobId) {
  const controller = jobId && runningJobs.get(jobId);
  if (!controller) return false;
  controller.abort();
  runningJobs.delete(jobId);
  return true;
}

const GITHUB_REPO = 'jojozagjos/Choicer-Voicer-Content-Manager';

// While this is null the app hides every donation prompt rather than showing
// a dead link.
const DONATE_URL = 'https://ko-fi.com/jojozagjos';

/** Compares "1.2.10" style versions. Returns >0 when `a` is newer than `b`. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

let mainWindow = null;
let settings = null;
let durationCache = new Map();

/** Roots the media protocol is allowed to serve from. */
const allowedRoots = new Set();

// Settings + caches

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const cacheFile = () => path.join(app.getPath('userData'), 'duration-cache.json');

const DEFAULT_SETTINGS = {
  gameDir: null,
  outputDir: null,
  ffmpegPath: null,
  ffprobePath: null,
  theme: 'system', // 'system' | 'dark' | 'light'
  showSplash: true,
  showPreviewCaptions: true,
  showEditorCaptions: true,
  // Set once the help has been shown after a successful first setup.
  seenHelp: false,
  captionStyle: {},
  characterColors: {},
  // How loud each character is, as a multiplier on every line they speak.
  characterVolumes: {},
  useCharacterVolumes: true,
  // The work done on each pack and session: which take every line uses, how
  // loud it is, how far its timing was nudged, and the music and dub balance.
  //
  // Replaced wholesale rather than merged, unlike the two above. Those are
  // keyed by character name and shared across packs, so a write from one pack
  // must not drop another's. This is keyed by pack and session and the renderer
  // sends the whole thing back, which is also what lets an entry be removed
  // when everything in it is reset to normal.
  mixes: {},
  // Donation prompt state. It only appears after the app has actually been
  // useful a few times, and never more than once a fortnight.
  exportsCompleted: 0,
  donatePromptedAt: null,
  donateDismissed: false,
  exportOptions: {
    format: 'mp4',
    preset: 'source',
    quality: 'balanced',
    burnCaptions: false,
    writeSrt: false,
    includeOriginalAudio: false,
    normalizeDub: false,
    backingVolume: 1,
    dubVolume: 1,
  },
};

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = {
      ...DEFAULT_SETTINGS,
      ...raw,
      exportOptions: { ...DEFAULT_SETTINGS.exportOptions, ...(raw.exportOptions || {}) },
    };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  if (!settings.outputDir) {
    settings.outputDir = path.join(app.getPath('videos') || app.getPath('documents'), 'Choicer Voicer Exports');
  }
  ffmpeg.setOverrides({ ffmpeg: settings.ffmpegPath, ffprobe: settings.ffprobePath });
  return settings;
}

function saveSettings(next) {
  // Character colours normally merge, so one pack's edits don't wipe another's.
  // `replaceCharacterColors` is how a reset removes an entry outright.
  const characterColors = next.replaceCharacterColors
    ? (next.characterColors || {})
    : { ...settings.characterColors, ...(next.characterColors || {}) };

  settings = {
    ...settings,
    ...next,
    exportOptions: { ...settings.exportOptions, ...(next.exportOptions || {}) },
    captionStyle: { ...settings.captionStyle, ...(next.captionStyle || {}) },
    characterColors,
    // Merged for the same reason as the colours: these are keyed by character
    // name across every pack, so a write from one pack must not drop the rest.
    characterVolumes: { ...settings.characterVolumes, ...(next.characterVolumes || {}) },
  };
  delete settings.replaceCharacterColors;
  ffmpeg.setOverrides({ ffmpeg: settings.ffmpegPath, ffprobe: settings.ffprobePath });
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Could not save settings:', err.message);
  }
  return settings;
}

function loadDurationCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
    durationCache = new Map(Object.entries(raw));
  } catch {
    durationCache = new Map();
  }
}

function saveDurationCache() {
  try {
    fs.writeFileSync(cacheFile(), JSON.stringify(Object.fromEntries(durationCache)), 'utf8');
  } catch { /* a cold cache is only a slow scan, not an error */ }
}

// Media protocol: streams game files to the renderer with Range support

protocol.registerSchemesAsPrivileged([{
  scheme: MEDIA_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
}]);

const MIME = {
  '.ogv': 'video/ogg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};

// Pack names contain spaces, apostrophes and '#', and Windows paths contain
// backslashes that Chromium rewrites when canonicalising a standard scheme.
// base64url sidesteps all of it.
/**
 * Bumped whenever anything is written into a pack, or on a manual rescan.
 *
 * It rides along on every media URL. Without something like it the URL for a
 * given path never changes, so replacing a pack icon or re-grabbing a clip's
 * picture left the old bytes on screen: same URL, so Chromium reused what it
 * already had.
 *
 * This used to be the file's own modified time, which was correct but cost a
 * stat per URL. On a library of a thousand packs per type that was well over a
 * hundred thousand stats per scan. A counter costs nothing, at the price of
 * invalidating every picture rather than the one that changed, which for local
 * files is not worth caring about.
 */
let mediaGeneration = Date.now();

// Counted per folder rather than for everything at once. A single counter meant
// a change to any one pack gave every picture in the app a new address, so the
// whole library reloaded its images and could be watched filling in from the top
// down. Only the folder that changed gets a new number now, so everything else
// stays in the browser's cache and does not flicker.
const folderGenerations = new Map();

function bumpMedia(dir) {
  if (!dir) return;
  folderGenerations.set(path.resolve(dir), Date.now());
}

function generationFor(filePath) {
  const dir = path.resolve(path.dirname(filePath));
  return folderGenerations.get(dir) || mediaGeneration;
}

/** A URL the renderer can load a pack file through. */
function mediaUrl(filePath) {
  const encoded = Buffer.from(filePath, 'utf8').toString('base64url');
  // The protocol handler strips the query before decoding the path, so this
  // only ever affects caching.
  return `${MEDIA_SCHEME}://file/${encoded}?v=${generationFor(filePath)}`;
}

function pathFromMediaUrl(url) {
  const raw = url.slice(`${MEDIA_SCHEME}://file/`.length).split(/[?#]/)[0];
  return path.normalize(Buffer.from(raw, 'base64url').toString('utf8'));
}

/**
 * Merges a patch into a config, all the way down.
 *
 * Host dialogue nests three deep: mode, then group, then the event holding the
 * lines. A merge that only went one level replaced a whole group with the one
 * event being edited, so saving a single line silently deleted its siblings.
 * Arrays are replaced outright, since a dialogue event is the list.
 */
function deepMerge(current, patch) {
  const out = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch)) {
    const isPlain = value && typeof value === 'object' && !Array.isArray(value);
    out[key] = isPlain ? deepMerge(out[key], value) : value;
  }
  return out;
}

const CLIP_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Finds a clip's picture.
 *
 * Real packs are inconsistent about this. Some declare `image="portrait.png"`,
 * some declare it without an extension, and some declare nothing at all and
 * simply name the picture after the clip. Following all three is what makes
 * portraits appear for every pack rather than about half of them.
 */
function findClipImage(dir, clip) {
  const candidates = [];
  if (clip.image) {
    candidates.push(clip.image);
    if (!path.extname(clip.image)) {
      for (const ext of CLIP_IMAGE_EXTS) candidates.push(`${clip.image}${ext}`);
    }
  }
  for (const ext of CLIP_IMAGE_EXTS) candidates.push(`${clip.base}${ext}`);

  for (const name of candidates) {
    const full = path.join(dir, name);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    } catch { /* unreadable, try the next */ }
  }
  return null;
}

function isAllowed(filePath) {
  const resolved = path.resolve(filePath);
  for (const root of allowedRoots) {
    const rel = path.relative(root, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  }
  return false;
}

/**
 * Whether a folder may be revealed in the file manager.
 *
 * Wider than `isAllowed`, and only for opening. Writes stay confined to the
 * game folder, but the app also puts things in the exports folder — shared
 * packs, rendered videos — and offering to open a folder that is then refused
 * is worse than not offering at all.
 *
 * Unlike `isAllowed`, an exact match on a root counts. "Shared packs" sits at
 * the top of the exports folder and the caller may well ask for the root
 * itself, which is not an escape attempt.
 */
function isOpenableFolder(target) {
  const resolved = path.resolve(target);
  const roots = [...allowedRoots];
  for (const extra of [settings && settings.outputDir, app.getPath('documents')]) {
    if (extra) roots.push(path.resolve(extra));
  }
  for (const root of roots) {
    const rel = path.relative(root, resolved);
    if (!rel) return true;
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return true;
  }
  return false;
}

/**
 * The folder holding the pack currently being reviewed, if any.
 *
 * Reviewing means looking at somebody's unvetted video and audio, which has to
 * happen somewhere the renderer can reach. That somewhere is a temporary folder
 * and never the game folder: a pack being judged must not be able to end up
 * installed, and one that is refused must leave nothing behind.
 */



/**
 * What lets the renderer `fetch()` from this scheme rather than only play from
 * it.
 *
 * The window is a `file://` page and this is a registered standard, secure
 * scheme, so they are separate origins and a fetch between them is cross-origin
 * — refused without these headers. Media elements never needed them, which is
 * why video kept playing while the editor's waveform quietly stopped loading:
 * the backing track is read with fetch, not by an `<audio>` tag.
 *
 * Opening it to `*` costs nothing here. The handler already refuses any path
 * outside the game folder and the review sandbox, so the answer to a request
 * from anywhere else is a 403 either way.
 */
const CORS = { 'Access-Control-Allow-Origin': '*' };

function registerMediaProtocol() {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    let filePath;
    try {
      filePath = pathFromMediaUrl(request.url);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    // The review sandbox is the one place outside the game folder the renderer
    // may play media from, and only while a pack is actually open for review.
    // It is a single exact folder, set when a review starts and cleared when it
    // ends, rather than a standing exception.
    if (!isAllowed(filePath)) {
      return new Response('Forbidden', { status: 403 });
    }

    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return new Response('Not found', { status: 404 });
    }

    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = request.headers.get('Range');

    // Seeking in a 140s video needs real 206 responses.
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          const stream = fs.createReadStream(filePath, { start, end });
          return new Response(Readable.toWeb(stream), {
            status: 206,
            headers: {
              'Content-Type': type,
              'Content-Length': String(end - start + 1),
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes',
              ...CORS,
            },
          });
        }
      }
    }

    return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
        ...CORS,
      },
    });
  });
}

// Duration probing

async function probeDurationAsync(file) {
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch {
    return null;
  }

  const key = `${file}|${stat.size}|${Math.round(stat.mtimeMs)}`;
  if (durationCache.has(key)) return durationCache.get(key);

  try {
    const { stdout } = await execFileAsync(ffmpeg.ffprobePath(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ], { windowsHide: true });

    const value = parseFloat(String(stdout).trim());
    const duration = Number.isFinite(value) ? value : null;
    durationCache.set(key, duration);
    return duration;
  } catch {
    return null;
  }
}

/** Probes many files with bounded concurrency so the UI stays responsive. */
async function probeMany(files, concurrency = 6) {
  const out = {};
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      out[file] = await probeDurationAsync(file);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  saveDurationCache();
  return out;
}

// Model decoration: attach playable URLs

function decorate(model) {
  allowedRoots.add(path.resolve(model.gameDir));

  for (const pack of model.packs) {
    // Deliberately no URL for the pack video: it is Theora, which Chromium
    // cannot decode, and handing one out only produces a black frame and a
    // console error. Everything that shows the video asks for a proxy.
    pack.backingUrl = pack.backingPath ? mediaUrl(pack.backingPath) : null;
    pack.iconUrl = pack.iconPath ? mediaUrl(pack.iconPath) : null;

    for (const line of pack.lines) {
      line.imageUrl = line.imagePath ? mediaUrl(line.imagePath) : null;
      line.sourceAudioUrl = line.sourceAudioPath ? mediaUrl(line.sourceAudioPath) : null;
    }

    for (const session of pack.sessions) {
      session.takeUrls = Object.fromEntries(
        Object.entries(session.takes).map(([base, p]) => [base, mediaUrl(p)])
      );
      session.freestyleUrl = session.freestylePath ? mediaUrl(session.freestylePath) : null;
    }
  }
  return model;
}

// Window

/** Matches the window chrome to the theme so launch doesn't flash. */
function startupBackground() {
  const dark = settings.theme === 'dark'
    || (settings.theme !== 'light' && nativeTheme.shouldUseDarkColors);
  // Kept in step with --bg in styles.css. They are two copies of one colour and
  // the only symptom of them drifting is a flash of the wrong shade at startup,
  // which is easy to miss and irritating once seen.
  return dark ? '#070d15' : '#d9edfb';
}

// The fewest config controls each type's editor should render. A floor rather
// than an exact count, because a colour draws two controls and an exact number
// would break on any cosmetic change. It exists to catch a form quietly showing
// a handful of a config file's settings, which the menu did.
const SETTINGS_COUNT = { menu: 20, studio: 2 };

// CVE_SMOKE=1 boots the whole app windowless, reports whether the renderer
// came up clean, and exits. Used to verify changes without stealing focus.
const SMOKE = process.env.CVE_SMOKE === '1';

// Capturing the README's screenshots. Also runs hidden, for the same reason.
const SHOTS = process.env.CVE_SHOTS === '1';

function createWindow() {
  // The packager bakes the icon into the exe, so a packaged build already has
  // it. Running from source has no exe to carry one, hence this.
  const devIcon = path.join(__dirname, '..', '..', 'assets', 'app', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1060,
    minHeight: 680,
    backgroundColor: startupBackground(),
    ...(app.isPackaged || !fs.existsSync(devIcon) ? {} : { icon: devIcon }),
    show: false,
    autoHideMenuBar: true,
    title: 'Choicer Voicer Content Manager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // On, because the renderer decodes files that came from strangers.
      //
      // Every pack installed from the directory is somebody else's video and
      // audio going through Chromium's decoders, and those have had real
      // remote-code-execution holes. The sandbox is what keeps a decoder bug
      // inside the renderer instead of handing over the whole machine.
      //
      // Affordable here because the preload asks for nothing Node-specific —
      // only contextBridge, ipcRenderer and webUtils, all of which a sandboxed
      // preload can still use. Everything else already goes over IPC.
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => { if (!SMOKE && !SHOTS) mainWindow.show(); });

  if (SMOKE) runSmokeTest(mainWindow);
  if (SHOTS) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => runScreenshots(mainWindow), 4500);
    });
  }

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    // Surface renderer errors in the terminal too, which is much easier than
    // hunting through a detached DevTools window.
    // One event object rather than positional arguments. Electron deprecated
    // the old signature and warns about it on every single message, which is
    // noise printed on top of whatever was actually being reported.
    mainWindow.webContents.on('console-message', (event) => {
      const where = event.sourceId
        ? ` (${path.basename(event.sourceId)}:${event.lineNumber})`
        : '';
      console.log(`[renderer:${event.level || 'log'}] ${event.message}${where}`);
    });
  }

  // External links belong in the real browser, not in the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // The window shows this app and nothing else. Without this, a link or a
  // redirect could navigate the shell away from the interface, and a scheme the
  // app does not handle can be passed out to whatever program on the machine
  // claims it. Nothing here ever needs to navigate, so all of it is refused.
  const stayPut = (event, url) => {
    if (url === mainWindow.webContents.getURL()) return;
    event.preventDefault();
    console.warn(`Blocked navigation to ${url}`);
  };
  mainWindow.webContents.on('will-navigate', stayPut);
  mainWindow.webContents.on('will-frame-navigate', (event) => stayPut(event, event.url));
}

/**
 * Loads the renderer offscreen, waits for it to settle, then reports what it
 * managed to build. Exits non-zero if anything logged an error.
 */
// Anything the smoke test creates, edits or deletes happens inside a pack
// named this and nothing else. The checks used to run against whichever real
// pack sorted first, which meant a test failing at the wrong moment could
// leave someone's own pack short a clip. Real packs are read-only here now.
const SMOKE_PACK = '__smoke_scratch';

/**
 * Copies the smallest dub pack to a scratch name so the destructive checks
 * have something realistic to work on. Returns null if there is nothing to
 * copy, in which case those checks are skipped rather than aimed elsewhere.
 */
function makeSmokePack(gameDir) {
  const voiceDir = path.join(gameDir, 'packs_voice');
  if (!fs.existsSync(voiceDir)) return null;

  const candidates = fs.readdirSync(voiceDir)
    .filter((name) => name !== SMOKE_PACK)
    .map((name) => path.join(voiceDir, name))
    .filter((dir) => {
      try {
        return fs.statSync(dir).isDirectory()
          && fs.readdirSync(dir).some((f) => /^dub_video\./i.test(f));
      } catch { return false; }
    })
    .map((dir) => {
      const size = fs.readdirSync(dir).reduce((total, f) => {
        try { return total + fs.statSync(path.join(dir, f)).size; } catch { return total; }
      }, 0);
      return { dir, size };
    })
    .sort((a, b) => a.size - b.size);

  if (!candidates.length) return null;

  const target = path.join(voiceDir, SMOKE_PACK);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(candidates[0].dir, target, { recursive: true });

  // Retitled, because the grid lists packs by title and the copy would
  // otherwise be indistinguishable from the pack it came from.
  writeIni(path.join(target, '_pack_info.ini'), {
    title: SMOKE_PACK,
    subtitle: 'created and removed by the smoke test',
    authors: [],
    readme: '',
  });

  // All but the first clip goes. The cut-a-new-clip check needs empty timeline
  // to work in, and some packs are dubbed end to end with no gap anywhere.
  const clipBases = fs.readdirSync(target)
    .filter((f) => !f.startsWith('_') && /\.(ini|txt)$/i.test(f))
    .filter((f) => {
      try {
        return fs.readFileSync(path.join(target, f), 'utf8').includes('dub_timestamps');
      } catch { return false; }
    })
    .map((f) => path.basename(f, path.extname(f)))
    .sort();

  // Deduplicated, because a clip can carry both a .txt and an .ini. Without this
  // the kept clip appeared again further down the list, so the loop below deleted
  // it along with the ones meant to go, and the scratch pack came out with no
  // clips at all.
  const bases = [...new Set(clipBases)];

  const kept = bases[0] || null;
  let removed = 0;
  for (const base of bases.slice(1)) {
    for (const file of fs.readdirSync(target)) {
      if (path.basename(file, path.extname(file)) !== base) continue;
      try { fs.unlinkSync(path.join(target, file)); removed++; } catch { /* already gone */ }
    }
  }

  return { dir: target, copiedFrom: candidates[0].dir, keptClip: kept, removedClips: removed };
}

function removeSmokePack(gameDir) {
  const target = path.join(gameDir, 'packs_voice', SMOKE_PACK);
  try {
    fs.rmSync(target, { recursive: true, force: true });
    return !fs.existsSync(target);
  } catch {
    return false;
  }
}

// Named so they are obvious in the game folder and easy to sweep up.
const SPEC_PACK = '__smoke_spec';

/**
 * Makes one pack of a type, built the way the game documents it, so the type's
 * editor has something real to open. Returns the folder, or null for a type
 * with nothing to build.
 */
function makeSpecPack(gameDir, type) {
  const dirs = {
    host: 'packs_host', judges: 'packs_judges', studio: 'packs_studio',
    menu: 'packs_menu', chatter: 'packs_chatter',
  };
  if (!dirs[type]) return null;

  const dir = path.join(gameDir, dirs[type], SPEC_PACK);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const png = (n) => fs.writeFileSync(path.join(dir, `${n}.png`), PNG);
  const wav = (n) => fs.writeFileSync(path.join(dir, `${n}.wav`), Buffer.alloc(128));
  const json = (n, d) => fs.writeFileSync(path.join(dir, n), JSON.stringify(d, null, '\t'));

  if (type === 'host') {
    png('host');
    // The host's name becomes the pack's displayed title, so it has to carry
    // the scratch name or the tile cannot be found again.
    json('config_host.json', {
      name: SPEC_PACK,
      match_singleplayer: { intro: ['Hello <player>'] },
    });
  } else if (type === 'judges') {
    for (let n = 1; n <= 5; n++) { png(`judge${n}`); wav(`scoreblip${n}`); }
    png('success');
    json('config_judges.json', { judge1: { name: 'Ann' }, play_voices_with_blips: true });
  } else if (type === 'studio') {
    fs.writeFileSync(path.join(dir, 'model.glb'), Buffer.alloc(128));
    wav('music_studio');
  } else if (type === 'menu') {
    png('background');
    wav('music_menu');
    json('config_menu.json', {});
  } else if (type === 'chatter') {
    wav('clap');
    wav('yes1');
    writeIniSections(path.join(dir, 'config_chatter.ini'), {
      data: { title: SPEC_PACK, authors: [], volume: 1 },
      exact_keywords: {},
      broad_keywords: { 'clap.wav': ['clap'] },
    });
  }
  return dir;
}

/**
 * Opens every non-dub pack type's editor against a pack built to spec, and
 * checks the editor renders the slots that type actually has. Without this the
 * only types with any coverage were the two the user happens to own.
 */
async function runTypeEditorChecks(win, gameDir, errors) {
  const TYPES = ['host', 'judges', 'studio', 'menu', 'chatter'];
  const made = [];
  for (const type of TYPES) {
    try { made.push({ type, dir: makeSpecPack(gameDir, type) }); } catch (err) {
      errors.push(`could not build a ${type} pack: ${err.message}`);
    }
  }

  // One rescan picks all of them up.
  await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('[data-tab="content"]').click();
    await new Promise((r) => setTimeout(r, 300));
    document.getElementById('btn-refresh').click();
    await new Promise((r) => setTimeout(r, 2500));
  })()`).catch(() => {});

  const results = {};
  for (const { type } of made) {
    try {
      results[type] = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const root = document.getElementById('editor-view');
        if (!root.hidden) {
          const back = root.querySelector('.editor-head button');
          if (back) back.click();
          await wait(300);
        }

        document.querySelector('[data-tab="content"]').click();
        await wait(300);

        // Pick the type on the left, then its spec pack.
        const typeBtn = [...document.querySelectorAll('#content-types button')]
          .find((b) => b.dataset.type === ${JSON.stringify(type)});
        if (!typeBtn) return { skipped: 'no type button' };
        typeBtn.click();
        await wait(400);

        const tile = [...document.querySelectorAll('.pack-tile')]
          .find((t) => t.textContent.includes(${JSON.stringify(SPEC_PACK)}));
        if (!tile) return { skipped: 'pack not listed' };
        tile.click();
        await wait(300);

        const edit = document.querySelector('#btn-detail-edit');
        if (!edit) return { skipped: 'no edit button' };
        edit.click();
        await wait(900);

        return {
          opened: !root.hidden,
          slots: root.querySelectorAll('.slot-card').length,
          filledSlots: root.querySelectorAll('.slot-card.filled').length,
          chatterRows: root.querySelectorAll('.chatter-row').length,
          // The cardboard cutout belongs to packs that are a person on screen.
          // A menu showing one claimed it was missing a character picture that
          // a menu pack does not have in the first place.
          headerCutout: Boolean(root.querySelector('.pack-head-icon .placeholder-art')),
          sidePanel: Boolean(root.querySelector('.editor-side h3')),
          sideTitle: (root.querySelector('.editor-side h3') || {}).textContent || '',
          // Both shapes: the hand-written forms mark their controls with
          // data-cfg, the generated ones are plain inputs inside .config-form.
          configFields: root.querySelectorAll('.editor-side [data-cfg]').length
            + root.querySelectorAll('.editor-side .config-form input, '
              + '.editor-side .config-form select').length,
          fellBackToDropzone: Boolean(root.querySelector('.editor-empty')),
        };
      })()`);
    } catch (err) {
      results[type] = { error: err.message };
    }
  }

  // Assertions. A type reaching the generic drop zone means its editor did not
  // load, which is the exact thing this check exists to catch.
  for (const [type, r] of Object.entries(results)) {
    if (!r || r.skipped || r.error) continue;
    if (!r.opened) errors.push(`${type} editor did not open`);
    if (r.fellBackToDropzone) errors.push(`${type} fell back to the generic drop zone`);
    if (type === 'chatter') {
      if (!r.chatterRows) errors.push('chatter editor listed no sounds');
    } else if (!r.slots) {
      errors.push(`${type} editor rendered no slots`);
    }
    if (!r.sidePanel) errors.push(`${type} editor has no side panel`);
    if (r.headerCutout && !['player', 'host', 'judges'].includes(type)) {
      errors.push(`${type} editor shows the character cutout for its pack picture`);
    }

    // A type whose spec lists settings must actually render them. The menu form
    // used to offer two of the twenty-three settings its config file holds, and
    // nothing noticed because nothing counted them.
    const expected = SETTINGS_COUNT[type];
    if (expected && r.configFields < expected) {
      errors.push(`${type} config form shows ${r.configFields} controls, expected at least ${expected}`);
    }
  }

  // Delete one of them the way a person would, through the tile, the Delete
  // button and the app's own confirmation. That path used to end in an
  // operating system message box, so nothing exercised it.
  let deleteCheck = null;
  try {
    deleteCheck = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const root = document.getElementById('editor-view');
      if (!root.hidden) {
        const back = root.querySelector('.editor-head button');
        if (back) back.click();
        await wait(400);
      }

      document.querySelector('[data-tab="content"]').click();
      await wait(300);
      const typeBtn = [...document.querySelectorAll('#content-types button')]
        .find((b) => b.dataset.type === 'studio');
      if (!typeBtn) return { skipped: 'no studio type' };
      typeBtn.click();
      await wait(400);

      const tile = [...document.querySelectorAll('.pack-tile')]
        .find((t) => t.textContent.includes(${JSON.stringify(SPEC_PACK)}));
      if (!tile) return { skipped: 'no pack to delete' };
      tile.click();
      await wait(300);

      document.querySelector('#btn-detail-delete').click();
      await wait(400);

      const dialog = document.getElementById('confirm-dialog');
      const asked = dialog.open;
      const title = (document.getElementById('confirm-title') || {}).textContent || '';
      if (!asked) return { asked: false };

      // The first button is the one that goes ahead.
      document.querySelector('#confirm-buttons button').click();
      await wait(1500);

      return {
        asked,
        title,
        stillListed: [...document.querySelectorAll('.pack-tile')]
          .some((t) => t.textContent.includes(${JSON.stringify(SPEC_PACK)})),
        dialogClosed: !dialog.open,
      };
    })()`);

    if (deleteCheck && !deleteCheck.skipped) {
      if (!deleteCheck.asked) errors.push('deleting a pack did not ask first');
      if (deleteCheck.dialogClosed === false) errors.push('the confirm dialog stayed open');
      if (deleteCheck.stillListed) errors.push('the deleted pack is still listed');
    }
  } catch (err) {
    deleteCheck = { error: err.message };
    errors.push(`delete check threw: ${err.message}`);
  }

  // Close the editor before the packs go, or it repaints against nothing.
  await win.webContents.executeJavaScript(`(async () => {
    const root = document.getElementById('editor-view');
    if (!root.hidden) {
      const back = root.querySelector('.editor-head button');
      if (back) back.click();
    }
    await new Promise((r) => setTimeout(r, 400));
  })()`).catch(() => {});

  const removed = [];
  for (const { type, dir } of made) {
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(type);
      if (fs.existsSync(dir)) errors.push(`the ${type} spec pack was left behind`);
    } catch (err) {
      errors.push(`could not remove the ${type} spec pack: ${err.message}`);
    }
  }

  return { results, deleteCheck, built: made.map((m) => m.type), removed };
}

/**
 * Captures the screenshots the README shows, into docs/images.
 *
 * Driven through the real window, hidden, so the pictures are of the app as it
 * actually is rather than a mock up, and taking them never steals focus or
 * catches anything else on screen.
 */
async function runScreenshots(win) {
  const OUT = path.join(__dirname, '..', '..', 'docs', 'images');
  fs.mkdirSync(OUT, { recursive: true });

  const SHOTS = [
    {
      name: 'library',
      settle: 1200,
      js: `
        document.querySelector('[data-tab="content"]').click();
        await wait(700);
        const voice = document.querySelector('#content-types button');
        if (voice) voice.click();
        await wait(600);
        const tile = document.querySelector('.pack-tile');
        if (!tile) return 'no packs installed';
        tile.click();
        await wait(600);
      `,
    },
    {
      name: 'editor',
      settle: 2200,
      js: `
        document.querySelector('[data-tab="content"]').click();
        await wait(600);
        const voice = document.querySelector('#content-types button');
        if (voice) voice.click();
        await wait(500);

        // The pack with the most lines makes the best picture of a timeline.
        const tiles = [...document.querySelectorAll('.pack-tile')];
        const best = tiles
          .map((t) => ({ t, n: parseInt((t.textContent.match(/(\\d+)\\s+lines/) || [0, 0])[1], 10) }))
          .sort((a, b) => b.n - a.n)[0];
        if (!best || !best.n) return 'no dub pack with lines';
        best.t.click();
        await wait(600);

        const edit = document.querySelector('#btn-detail-edit');
        if (!edit) return 'nothing to edit';
        edit.click();
        for (let i = 0; i < 160; i++) {
          await wait(500);
          if (document.querySelector('canvas.timeline')) break;
        }

        // Sit inside a line so a caption is showing over the video.
        const stamp = document.querySelector('.clip-row .line-time');
        if (stamp) stamp.click();
        await wait(1000);
        const video = document.querySelector('.editor-video video');
        if (video) video.currentTime += 0.35;
        await wait(1000);
      `,
    },
    {
      name: 'export',
      settle: 2000,
      js: `
        document.querySelector('[data-tab="export"]').click();
        await wait(700);
        const cards = [...document.querySelectorAll('.pack-card')];
        if (!cards.length) return 'no packs';

        const withTakes = cards.find((c) => !/no dubs/i.test(c.textContent)) || cards[0];
        withTakes.click();

        const overlay = document.getElementById('loading-overlay');
        for (let i = 0; i < 240; i++) {
          await wait(500);
          if (overlay.hidden && document.querySelectorAll('.line-row').length) break;
        }
        await wait(900);
      `,
    },
    {
      name: 'mods',
      settle: 2000,
      js: `
        document.querySelector('[data-tab="mods"]').click();
        await wait(900);

        // The directory is fetched, so this waits for it rather than for a
        // fixed time. An empty directory is a real state and worth a picture,
        // but a picture taken mid-fetch is of nothing at all.
        for (let i = 0; i < 40; i++) {
          await wait(500);
          const grid = document.getElementById('mods-grid');
          if (grid && !/Looking/.test(grid.textContent)) break;
        }
        await wait(600);
      `,
    },
    {
      // The new pack page, which is where the interesting part of Mods is.
      // Skipped rather than faked when there is nothing listed to open.
      name: 'mods-pack',
      settle: 1800,
      js: `
        document.querySelector('[data-tab="mods"]').click();
        await wait(900);
        for (let i = 0; i < 40; i++) {
          await wait(500);
          const grid = document.getElementById('mods-grid');
          if (grid && !/Looking/.test(grid.textContent)) break;
        }

        const card = document.querySelector('.mod-card');
        if (!card) return 'nothing listed in the directory';
        card.click();
        await wait(1200);
      `,
    },
    {
      name: 'help',
      settle: 900,
      js: `
        for (const d of document.querySelectorAll('dialog[open]')) d.close();
        document.querySelector('[data-tab="home"]').click();
        await wait(500);
        document.getElementById('btn-about').click();
        await wait(800);
        const tab = [...document.querySelectorAll('[data-help]')]
          .find((b) => b.dataset.help === 'editor');
        if (tab) tab.click();
        await wait(500);
      `,
    },
  ];

  // Nothing to photograph behind the splash or the first run panel.
  //
  // The Admin tab goes too. It appears only for an account that can write to
  // the directory, so whoever takes these pictures sees a tab that nobody
  // reading them will have, and a screenshot advertising it is a screenshot of
  // a different app from the one being downloaded.
  await win.webContents.executeJavaScript(`
    const s = document.getElementById('splash');
    if (s) s.hidden = true;
    const setup = document.getElementById('setup-dialog');
    if (setup && setup.open) setup.close();
    const admin = document.getElementById('tab-admin');
    if (admin) admin.hidden = true;
    true;
  `).catch(() => {});

  for (const shot of SHOTS) {
    let skipped = null;
    try {
      skipped = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        ${shot.js}
        return null;
      })()`);
    } catch (err) {
      skipped = err.message;
    }

    if (skipped) {
      console.log(`  ${shot.name.padEnd(9)} skipped: ${skipped}`);
      continue;
    }

    await new Promise((r) => setTimeout(r, shot.settle));
    const image = await win.webContents.capturePage();
    const file = path.join(OUT, `${shot.name}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log(`  ${shot.name.padEnd(9)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }

  console.log(`\nWritten to ${OUT}`);
  app.exit(0);
}

function runSmokeTest(win) {
  const errors = [];

  // A throw anywhere in here used to end the run with no output and exit 0,
  // which reads as a pass. Anything unexpected is reported and fails instead.
  process.on('unhandledRejection', (err) => {
    console.log(`SMOKE_CRASH ${err && err.stack ? err.stack : err}`);
    app.exit(1);
  });
  process.on('uncaughtException', (err) => {
    console.log(`SMOKE_CRASH ${err && err.stack ? err.stack : err}`);
    app.exit(1);
  });

  // Made before the renderer loads, so the app's own first scan picks it up
  // without needing to be told to look again.
  let gameDir = null;
  let scratch = null;
  try {
    gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    scratch = makeSmokePack(gameDir);
  } catch (err) {
    errors.push(`could not make the scratch pack: ${err.message}`);
  }
  // Level 3 is an error; 2 is a warning. Warnings were counted as failures,
  // which meant a pack with one dangling file, something the app reports
  // properly and carries on from, failed the whole run.
  const warnings = [];
  // Both shapes of this event are read on purpose.
  //
  // Electron moved from positional arguments to an event object, and the old
  // form numbered its levels while the new one names them. Reading only one
  // would leave this catching nothing on the other, and a smoke test that has
  // quietly stopped detecting anything reports success forever, which is worse
  // than not having one.
  win.webContents.on('console-message', (event, level, message) => {
    const named = event && typeof event.level === 'string' ? event.level : null;
    const text = event && event.message !== undefined ? event.message : message;

    if (named === 'error' || level >= 3) errors.push(text);
    else if (named === 'warning' || level === 2) warnings.push(text);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    errors.push(`renderer gone: ${details.reason}`);
  });

  win.webContents.once('did-finish-load', async () => {
    // Long enough for boot() to finish its scan and first render.
    await new Promise((resolve) => setTimeout(resolve, 4000));
    let report = {};

    // Chromium can't decode Theora (removed in M123), so a pack video must be
    // playable via its proxy. videoWidth > 0 is the assertion that matters:
    // the raw .ogv still fires loadeddata with a 0x0 frame.
    const probeVideoEl = (url) => win.webContents.executeJavaScript(`new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'auto';
      v.src = ${JSON.stringify(url)};
      v.addEventListener('loadeddata', () => resolve({
        ok: v.videoWidth > 0, w: v.videoWidth, h: v.videoHeight, duration: v.duration,
      }));
      v.addEventListener('error', () => resolve({
        ok: false, code: v.error && v.error.code, message: v.error && v.error.message,
      }));
      setTimeout(() => resolve({ ok: false, message: 'timeout' }), 10000);
    })`);

    let videoCheck = null;
    try {
      const model = gamedata.scanGame(settings.gameDir || gamedata.defaultGameDir());
      const first = model.packs[0];
      if (first) {
        allowedRoots.add(path.resolve(model.gameDir));
        const cacheDir = path.join(app.getPath('userData'), 'preview-cache');
        allowedRoots.add(path.resolve(cacheDir));

        const raw = await probeVideoEl(mediaUrl(first.videoPath));
        const proxy = await ensureProxy(first.videoPath, cacheDir);
        const viaProxy = await probeVideoEl(mediaUrl(proxy.path));
        videoCheck = { pack: first.title, rawOgv: raw, proxy: viaProxy, proxyWasCached: proxy.cached };
        if (!viaProxy.ok) errors.push('proxy video did not decode');
      }
    } catch (err) {
      videoCheck = { ok: false, message: err.message };
      errors.push(`proxy build failed: ${err.message}`);
    }

    // Trimming, measured against a copy of a real pack video rather than
    // through the UI, because the two things worth asserting are how long it
    // takes and whether it can be stopped.
    let trimSpeedCheck = null;
    try {
      const model = gamedata.scanGame(settings.gameDir || gamedata.defaultGameDir());
      const source = (model.packs.find((p) => p.videoPath) || {}).videoPath;
      if (!source) trimSpeedCheck = { skipped: 'no pack video to work from' };
      else {
        const scratchDir = path.join(app.getPath('userData'), 'smoke-trim');
        fs.rmSync(scratchDir, { recursive: true, force: true });
        fs.mkdirSync(scratchDir, { recursive: true });
        const copy = path.join(scratchDir, 'subject.ogv');
        fs.copyFileSync(source, copy);

        const wholeLength = ffmpeg.probeDuration(copy);
        const keepTo = Math.max(2, wholeLength - 3);

        const began = Date.now();
        const done = await convert.trimVideo(copy, 1.5, keepTo,
          path.join(scratchDir, 'backup', 'subject.ogv'));
        const seconds = (Date.now() - began) / 1000;

        // Cancelling: a second copy, aborted almost immediately. What matters is
        // that it stops, and that it leaves the video it was working on alone.
        const other = path.join(scratchDir, 'cancel-me.ogv');
        fs.copyFileSync(source, other);
        const beforeBytes = fs.statSync(other).size;
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 150);
        let cancelled = null;
        try {
          await convert.trimVideo(other, 1.5, keepTo,
            path.join(scratchDir, 'backup', 'cancel-me.ogv'), { signal: controller.signal });
          cancelled = false;
        } catch (err) {
          cancelled = Boolean(err.cancelled);
        }

        trimSpeedCheck = {
          sourceLength: Number(wholeLength.toFixed(2)),
          method: done.method,
          seconds: Number(seconds.toFixed(2)),
          askedFrom: 1.5,
          landedFrom: done.from,
          nowSeconds: Number(done.nowSeconds.toFixed(2)),
          cancelStopped: cancelled,
          cancelLeftSourceAlone: fs.existsSync(other) && fs.statSync(other).size === beforeBytes,
          strays: fs.readdirSync(scratchDir).filter((f) => /\.\d+\.(trim|part)\./.test(f)),
        };
        fs.rmSync(scratchDir, { recursive: true, force: true });

        if (done.method !== 'copy') {
          warnings.push(`trim re-encoded rather than copied (${seconds.toFixed(1)}s)`);
        }
        // Copying a cut is I/O bound. Anything near a minute means it fell back
        // to re-encoding without saying so, which is the whole regression.
        if (done.method === 'copy' && seconds > 60) {
          errors.push(`a copied trim took ${seconds.toFixed(1)}s, which is far too slow`);
        }
        // Never later than asked, or the trim removes something wanted.
        if (done.from > 1.5 + 0.001) errors.push('the trim landed later than it was asked to');
        if (1.5 - done.from > 0.5) errors.push('the trim landed too far before where it was asked to');
        if (!cancelled) errors.push('a trim could not be cancelled');
        if (!trimSpeedCheck.cancelLeftSourceAlone) {
          errors.push('a cancelled trim damaged the video it was working on');
        }
        if (trimSpeedCheck.strays.length) {
          errors.push(`a trim left scratch files behind: ${trimSpeedCheck.strays.join(', ')}`);
        }
      }
    } catch (err) {
      trimSpeedCheck = { error: err.message };
      errors.push(`trim check failed: ${err.message}`);
    }
    try {
      report = await win.webContents.executeJavaScript(`(() => ({
        theme: document.documentElement.dataset.theme,
        splashVisible: !document.getElementById('splash').hidden,
        packs: document.querySelectorAll('.pack-card').length,
        themeButtons: document.querySelectorAll('[data-theme-set]').length,
        activeThemeBtn: document.querySelector('[data-theme-set].on')?.dataset.themeSet ?? null,
        workspaceHidden: document.getElementById('workspace').hidden,
        progressHidden: document.getElementById('progress-bar').hidden,
        emptyVisible: !document.getElementById('empty-state').hidden,
        gameDir: document.getElementById('set-gamedir').value,
        alertVisible: !document.getElementById('alert-bar').hidden,
        tabs: document.querySelectorAll('.tab').length,
        captionTab: document.querySelectorAll('[data-export-tab]').length,
        settingsGroups: document.querySelectorAll('.settings-group').length,
        previewCaptionToggle: Boolean(document.getElementById('set-preview-captions')),
        // The export dialog has to offer the per character volumes and say what
        // they are, since they are set on a different screen entirely.
        characterVolumeToggle: Boolean(document.getElementById('opt-character-volumes')),
        // The balance is set under the player, so the export window has to at
        // least say what it is currently at.
        mixReadout: [
          (document.getElementById('exp-vol-backing-read') || {}).textContent || '',
          (document.getElementById('exp-vol-dub-read') || {}).textContent || '',
        ].join(' / '),
        characterVolumeNote:
          (document.getElementById('character-volume-note') || {}).textContent || '',
        footIsSunken: getComputedStyle(document.querySelector('#export-dialog .dialog-foot')).backgroundColor,
        // Checked by what it is rather than by one id. The old check named an id
        // that had never existed, so it reported success whatever was on screen.
        discordLinkGone: !document.querySelector('[id*="discord" i]'),
        donateVisible: !document.getElementById('btn-about-donate').hidden,
        creditStrip: document.querySelector('.app-credit') ? document.querySelector('.app-credit').textContent.replace(/\s+/g, ' ').trim() : null,
        // Being a fan tool has to be visible without opening anything, so it
        // is checked on the splash, the home page and the strip on every tab.
        unofficialOnStrip: /unofficial/i.test((document.querySelector('.app-credit') || {}).textContent || ''),
        unofficialOnSplash: /unofficial/i.test((document.querySelector('.splash') || {}).textContent || ''),
        unofficialOnHome: /unofficial/i.test((document.querySelector('.home-hero') || {}).textContent || ''),
        unofficialInHelp: /unofficial/i.test((document.querySelector('[data-help-panel="credits"]') || {}).textContent || ''),
        tabOrder: [...document.querySelectorAll('[data-tab]')].map((b) => b.textContent.trim()).join(' > '),
        donateBlurbVisible: !document.getElementById('donate-blurb').hidden,
        palettes: (() => {
          const root = document.documentElement;
          const was = root.dataset.theme;
          const read = (t) => {
            root.dataset.theme = t;
            return getComputedStyle(document.body).backgroundColor;
          };
          const out = { dark: read('dark'), light: read('light') };
          root.dataset.theme = was;
          return out;
        })(),
      }))()`);

      // Somewhere obvious, on more than one screen, without opening anything.
      for (const [where, seen] of [
        ['the credit strip', report.unofficialOnStrip],
        ['the splash', report.unofficialOnSplash],
        ['the home page', report.unofficialOnHome],
        ['the credits in Help', report.unofficialInHelp],
      ]) {
        if (!seen) errors.push(`no unofficial notice on ${where}`);
      }

      if (!report.characterVolumeToggle) {
        errors.push('the export dialog does not offer the per character volumes');
      }
      // A switch for "use the volumes I set" is no use without saying what they
      // are, since they are set on another screen.
      if (!report.characterVolumeNote.trim()) {
        errors.push('the per character volume setting says nothing about the values');
      }
      if (!/%/.test(report.mixReadout)) {
        errors.push('the export window does not show the music and dub balance');
      }
    } catch (err) {
      errors.push(`probe failed: ${err.message}`);
    }

    // The Content tab has to list every pack type and surface what is wrong.
    let contentCheck = null;
    try {
      contentCheck = await win.webContents.executeJavaScript(`(async () => {
        const $ = (s) => document.querySelector(s);
        $('[data-tab="content"]').click();

        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (document.querySelectorAll('.type-btn').length) break;
        }

        const types = [...document.querySelectorAll('.type-btn')].map((b) => b.textContent.trim());

        // Walk every type, counting the tiles each one renders.
        const perType = {};
        for (const button of document.querySelectorAll('.type-btn')) {
          button.click();
          await new Promise((r) => setTimeout(r, 120));
          perType[$('#content-title').textContent] = document.querySelectorAll('.pack-tile').length;
        }

        // Open a pack that has tiles and check the detail panel fills in.
        let detail = null;
        for (const button of document.querySelectorAll('.type-btn')) {
          button.click();
          await new Promise((r) => setTimeout(r, 120));
          const tile = document.querySelector('.pack-tile');
          if (!tile) continue;
          tile.click();
          await new Promise((r) => setTimeout(r, 120));
          detail = {
            open: !$('#content-detail').hidden,
            heading: $('#content-detail h3') ? $('#content-detail h3').textContent : null,
            rows: document.querySelectorAll('#content-detail .detail-row').length,
          };
          break;
        }

        const sidebarHidden = document.querySelector('.sidebar').hidden;
        $('[data-tab="export"]').click();
        await new Promise((r) => setTimeout(r, 150));

        return {
          types,
          perType,
          detail,
          sidebarHiddenOnContent: sidebarHidden,
          backToDubs: !document.querySelector('.stage').hidden,
        };
      })()`);

      if (contentCheck && contentCheck.types && contentCheck.types.length !== 7) {
        errors.push(`content tab listed ${contentCheck.types.length} pack types, expected 7`);
      }
      if (contentCheck && contentCheck.detail && !contentCheck.detail.open) {
        errors.push('content detail panel did not open');
      }
    } catch (err) {
      contentCheck = { error: err.message };
    }

    // The What's New tab reads CHANGELOG.md at runtime, so it can break in ways
    // the file itself looks fine from: not shipped, not parsed, tab not wired.
    let changelogCheck = null;
    try {
      changelogCheck = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const tab = document.querySelector('.help-tabs [data-help="whatsnew"]');
        if (!tab) return { skipped: 'no What is New tab' };

        const dialog = document.getElementById('about-dialog');
        const box = document.getElementById('changelog-body');
        const out = {};

        // Clicking the version is how anyone asks what is in the version they
        // have, so it must land on the changelog rather than the front of help.
        document.getElementById('version-badge').click();
        for (let i = 0; i < 40 && box.dataset.loaded !== 'yes'; i++) await wait(100);
        out.badgeOpensWhatsNew = !document.querySelector('[data-help-panel="whatsnew"]').hidden;
        out.badgeOpenedDialog = dialog.open;

        out.loaded = box.dataset.loaded === 'yes';
        out.versionsShown = box.querySelectorAll('.changelog-pill').length;
        out.entries = box.querySelectorAll('.changelog-entry').length;
        out.bullets = box.querySelectorAll('.changelog-entry:not([hidden]) .changelog-list li').length;
        out.newestShown = (box.querySelector('.changelog-entry:not([hidden]) h3') || {}).textContent || null;
        // Exactly one release visible at a time, or the bar is decoration.
        out.visibleEntries = [...box.querySelectorAll('.changelog-entry')].filter((e) => !e.hidden).length;
        out.runningMarked = box.querySelectorAll('.changelog-dot').length;
        out.mentionsThisVersion = box.textContent.includes(${JSON.stringify(app.getVersion())});
        // Nothing in the file should be able to introduce markup of its own.
        out.scriptTags = box.querySelectorAll('script').length;

        // Switching versions with the bar.
        const pills = [...box.querySelectorAll('.changelog-pill')];
        if (pills.length > 1) {
          pills[1].click();
          await wait(150);
          out.switchedTo = (box.querySelector('.changelog-entry:not([hidden]) h3') || {}).textContent || null;
          out.stillOneVisible =
            [...box.querySelectorAll('.changelog-entry')].filter((e) => !e.hidden).length === 1;
        }

        // The tabs across the top have to sit on one row. Comparing each tab's
        // top against the first catches a wrap, which no width check would.
        const tabs = [...document.querySelectorAll('.help-tabs .seg-tab')];
        const firstTop = tabs[0].getBoundingClientRect().top;
        out.tabCount = tabs.length;
        out.tabRows = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top))).size;
        out.tabsOnOneRow = tabs.every((t) => Math.abs(t.getBoundingClientRect().top - firstTop) < 2);

        // Help itself must open at the beginning, whatever was last read.
        dialog.close();
        await wait(120);
        document.getElementById('btn-about').click();
        await wait(200);
        out.helpOpensAtStart = !document.querySelector('[data-help-panel="start"]').hidden;

        // The editor help describes controls, and controls get replaced. These
        // pin the text to what is actually on screen: the backing track lane was
        // rebuilt as a two-way switch while the help still described a mute
        // button and a volume slider that had both been removed.
        const editorHelp = document.querySelector('[data-help-panel="editor"]').textContent;
        out.editorHelp = {
          describesListenSwitch: /listening to/i.test(editorHelp),
          // Anything claiming the two play together, or naming the old controls.
          claimsBothAtOnce: /plays along with the video/i.test(editorHelp),
          namesRemovedMuteButton: /drops the backing track out/i.test(editorHelp),
          mentionsUndoAndRedo: /redo/i.test(editorHelp),
          mentionsPan: /right or middle/i.test(editorHelp),
        };

        dialog.close();
        await wait(150);
        return out;
      })()`);
    } catch (err) {
      changelogCheck = { error: err.message };
      errors.push(`What's New tab failed: ${err.message}`);
    }
    if (changelogCheck && !changelogCheck.skipped && !changelogCheck.error) {
      if (!changelogCheck.loaded) errors.push("the What's New tab did not load the changelog");
      if (!changelogCheck.versionsShown) errors.push('the changelog shows no version bar');
      if (!changelogCheck.bullets) errors.push("the What's New tab lists no changes");
      if (changelogCheck.visibleEntries !== 1) {
        errors.push(`${changelogCheck.visibleEntries} releases visible at once, expected 1`);
      }
      if (!changelogCheck.mentionsThisVersion) {
        errors.push(`the changelog has no entry for ${app.getVersion()}`);
      }
      if (!changelogCheck.runningMarked) {
        errors.push('the changelog does not mark which version is running');
      }
      if (changelogCheck.scriptTags) errors.push('the changelog rendered a script tag');
      if (!changelogCheck.badgeOpensWhatsNew) {
        errors.push("clicking the version does not open What's New");
      }
      if (!changelogCheck.helpOpensAtStart) {
        errors.push('Help does not open on Getting Started');
      }
      if (!changelogCheck.tabsOnOneRow) {
        errors.push(`the help tabs wrap onto ${changelogCheck.tabRows} rows`);
      }
      if (changelogCheck.switchedTo && changelogCheck.stillOneVisible === false) {
        errors.push('picking a version in the changelog bar left more than one showing');
      }

      const eh = changelogCheck.editorHelp || {};
      if (!eh.describesListenSwitch) {
        errors.push('the editor help does not describe the backing track listen switch');
      }
      if (eh.claimsBothAtOnce) {
        errors.push('the editor help still says the backing track plays along with the video');
      }
      if (eh.namesRemovedMuteButton) {
        errors.push('the editor help still describes the removed backing track mute button');
      }
      if (!eh.mentionsUndoAndRedo) errors.push('the editor help does not mention redo');
      if (!eh.mentionsPan) errors.push('the editor help does not say which drag pans');
    }

    // Captions have to appear for every clip, and playback must stop when the
    // export view is hidden rather than carrying on unseen.
    let captionCheck = null;
    try {
      captionCheck = await win.webContents.executeJavaScript(`(async () => {
        const $ = (s) => document.querySelector(s);
        $('[data-tab="export"]').click();
        await new Promise((r) => setTimeout(r, 300));

        const card = [...document.querySelectorAll('.pack-card')]
          .find((c) => c.textContent.includes('Backrooms'));
        if (!card) return { skipped: 'no Backrooms pack' };
        card.click();

        for (let i = 0; i < 400; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (!$('#btn-export').disabled && document.querySelectorAll('.line-row').length) break;
        }

        const video = $('#video');
        const rows = [...document.querySelectorAll('.line-row')];
        const times = rows.map((r) => r.querySelector('.line-time').textContent);

        // The bug only showed during playback, where a long take swallowed the
        // caption after it. Seeking clip to clip could not reproduce it, so
        // this plays the whole video and records every caption that appears.
        const wanted = rows.map((r) => r.querySelector('.line-caption').textContent.trim());
        const seen = new Set();

        video.playbackRate = 1.5;
        video.currentTime = 0;
        await video.play().catch(() => {});

        const watcher = setInterval(() => {
          const cap = $('#caption');
          if (!cap.hidden && cap.textContent.trim()) seen.add(cap.textContent.trim());
        }, 20);

        for (let i = 0; i < 600; i++) {
          await new Promise((r) => setTimeout(r, 100));
          if (video.ended || video.currentTime >= (video.duration || 0) - 0.2) break;
        }
        clearInterval(watcher);
        video.pause();
        video.playbackRate = 1;

        const shown = [...seen];
        const missing = wanted
          .filter((w) => w && !shown.some((s) => s.includes(w.slice(0, 18))))
          .map((w) => ({ want: w.slice(0, 34) }));
        const checked = wanted.length;

        // Now confirm leaving the tab actually stops playback.
        await video.play().catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        const playingOnExport = !video.paused;
        $('[data-tab="home"]').click();
        await new Promise((r) => setTimeout(r, 350));
        const playingOffTab = !video.paused;
        $('[data-tab="export"]').click();
        await new Promise((r) => setTimeout(r, 200));

        return { checked, missingCount: missing.length, missing: missing.slice(0, 6),
          playingOnExport, playingOffTab };
      })()`);

      if (captionCheck && captionCheck.playingOffTab) {
        errors.push('video kept playing after leaving the export tab');
      }
    } catch (err) {
      captionCheck = { error: err.message };
    }

    // The dub editor has to cut a real clip out of a real video, write its
    // metadata, and grab a frame for its picture.
    let editorCheck = null;
    try {
      editorCheck = await win.webContents.executeJavaScript(`(async () => {
        const $ = (s) => document.querySelector(s);
        $('[data-tab="content"]').click();
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (document.querySelectorAll('.pack-tile').length) break;
        }

        // Always the scratch copy. This check creates and deletes a clip, and
        // aiming it at a real pack once cost someone a clip of their own.
        const tile = [...document.querySelectorAll('.pack-tile')]
          .find((t) => t.textContent.includes(${JSON.stringify(SMOKE_PACK)}));
        if (!tile) return { skipped: 'no scratch pack' };
        tile.click();
        await new Promise((r) => setTimeout(r, 300));
        const before = document.querySelectorAll('#content-detail .issue').length;

        const editBtn = $('#btn-detail-edit');
        if (!editBtn) return { skipped: 'no edit button', detailOpen: !$('#content-detail').hidden };
        editBtn.click();

        // Building the video proxy can take a while on a cold cache.
        for (let i = 0; i < 200; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (document.querySelector('.editor-video video')) break;
        }

        const video = document.querySelector('.editor-video video');
        if (!video) {
          return {
            skipped: 'no video element',
            editorVisible: !$('#editor-view').hidden,
            editorHtml: $('#editor-view').textContent.slice(0, 200),
          };
        }
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (video.readyState >= 2) break;
        }

        const clipsBefore = document.querySelectorAll('.clip-row').length;
        const canvas = document.querySelector('canvas.timeline');
        if (!canvas) return { skipped: 'no timeline canvas' };

        // Captions were being blanked by quotes ending the value attribute.
        const captionInputs = [...document.querySelectorAll('.clip-row [data-field="caption"]')];
        const filled = captionInputs.filter((i) => i.value.trim()).length;
        const withQuotes = captionInputs.filter((i) => i.value.includes('"')).length;

        const shortcuts = (() => {
          const btn = [...document.querySelectorAll('.editor-head button')]
            .find((b) => b.textContent.includes('Shortcuts'));
          if (!btn) return 0;
          btn.click();
          const n = document.querySelectorAll('.shortcut-sheet dt').length;
          btn.click();
          return n;
        })();

        // Wait for the timeline to know the duration before working in pixels.
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (video.duration) break;
        }

        const box = canvas.getBoundingClientRect();
        const drag = (fromX, toX, y) => {
          const opts = (x) => ({
            bubbles: true, clientX: box.left + x, clientY: box.top + y, pointerId: 1,
          });
          canvas.dispatchEvent(new PointerEvent('pointerdown', opts(fromX)));
          canvas.dispatchEvent(new PointerEvent('pointermove', opts(toX)));
          canvas.dispatchEvent(new PointerEvent('pointerup', opts(toX)));
        };

        const y = box.height - 20;
        const at = (x) => ({
          bubbles: true, clientX: box.left + x, clientY: box.top + y, pointerId: 1, button: 0,
        });

        // A quick drag pans and must not create anything.
        const beforePan = document.querySelectorAll('.clip-row').length;
        drag(box.width * 0.5, box.width * 0.4, y);
        await new Promise((r) => setTimeout(r, 600));
        const createdByPan = document.querySelectorAll('.clip-row').length - beforePan;

        // Holding still first arms a new clip, then the drag marks it out.
        canvas.dispatchEvent(new PointerEvent('pointerdown', at(box.width * 0.60)));
        await new Promise((r) => setTimeout(r, 450));
        canvas.dispatchEvent(new PointerEvent('pointermove', at(box.width * 0.66)));
        canvas.dispatchEvent(new PointerEvent('pointerup', at(box.width * 0.66)));

        for (let i = 0; i < 80; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (document.querySelectorAll('.clip-row').length > clipsBefore) break;
        }

        return {
          videoReady: video.readyState >= 2,
          videoW: video.videoWidth,
          timelineWidth: Math.round(box.width),
          captionsFilled: filled,
          captionsTotal: captionInputs.length,
          captionsWithQuotes: withQuotes,
          shortcutsListed: shortcuts,
          createdByPan,
          clipsBefore,
          clipsAfter: document.querySelectorAll('.clip-row').length,
          detailIssues: before,
        };
      })()`);
      // Nothing is cleaned up here on purpose.
      //
      // This used to sweep every voice pack deleting anything matching
      // `_clip_<digits>`, from back when the check cut its clip into whichever
      // real pack sorted first. That is exactly how the editor names a clip it
      // cuts, so the sweep destroyed real work: it quietly deleted a clip a
      // person had made, on every single run, and the only symptom was the
      // pack looking untouched afterwards.
      //
      // The check works on the scratch copy now, and that whole folder is
      // removed at the end of the run, so there is nothing left to tidy and no
      // reason to go looking through anyone else's packs.
    } catch (err) {
      editorCheck = { error: err.message };
    }

    // Home is the landing view, and the setup panel should be gone on a
    // machine that already has content and recordings.
    let homeCheck = null;
    try {
      homeCheck = await win.webContents.executeJavaScript(`(async () => {
        const $ = (s) => document.querySelector(s);
        $('[data-tab="home"]').click();
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (document.querySelectorAll('.stat').length) break;
        }
        return {
          visible: !$('#home-view').hidden,
          statTiles: document.querySelectorAll('.stat').length,
          // Finding the game folder is an overlay now, not a checklist, so on
          // a working install it should not be up at all.
          setupOverlayOpen: $('#setup-dialog').open,
          recentRows: document.querySelectorAll('.recent-row').length,
          exportNote: $('#home-export-note').textContent.trim(),
          tabs: [...document.querySelectorAll('[data-tab]')].map((b) => b.textContent.trim()),
        };
      })()`);
      if (homeCheck && homeCheck.statTiles !== 7) {
        errors.push(`home showed ${homeCheck.statTiles} stat tiles, expected 7`);
      }
    } catch (err) {
      homeCheck = { error: err.message };
    }

    // The create flow must produce a pack the scanner then accepts.
    let createCheck = null;
    try {
      createCheck = await win.webContents.executeJavaScript(`(async () => {
        const $ = (s) => document.querySelector(s);
        $('[data-tab="content"]').click();
        await new Promise((r) => setTimeout(r, 400));

        $('#btn-content-new').click();
        await new Promise((r) => setTimeout(r, 200));
        const typeCount = document.querySelectorAll('.create-type').length;

        // Pick "Player", which has extra fields worth exercising.
        const buttons = [...document.querySelectorAll('.create-type')];
        const contestant = buttons.find((b) => b.textContent.includes('Player'));
        contestant.click();
        await new Promise((r) => setTimeout(r, 150));

        const fields = document.querySelectorAll('#create-extra [data-field]').length;
        $('#create-name').value = 'Smoke Test Player';
        $('#btn-create-go').click();

        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 250));
          if (!$('#create-dialog').open) break;
        }
        await new Promise((r) => setTimeout(r, 800));

        const tiles = [...document.querySelectorAll('.pack-tile')].map((t) => t.textContent);
        return {
          typeCount,
          extraFields: fields,
          dialogClosed: !$('#create-dialog').open,
          landedOn: $('#content-title').textContent,
          madeIt: tiles.some((t) => t.includes('Smoke Test Player')),
        };
      })()`);
      if (createCheck && createCheck.typeCount !== 7) {
        errors.push(`create offered ${createCheck.typeCount} types, expected 7`);
      }
      if (createCheck && !createCheck.madeIt) errors.push('created pack did not appear in the list');

      // The test writes into the real game folder, so it has to tidy up or it
      // would leave a new pack behind on every run.
      const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
      if (gameDir) {
        const players = path.join(gameDir, 'packs_player');
        for (const name of fs.readdirSync(players)) {
          if (name.startsWith('Smoke Test Player')) {
            fs.rmSync(path.join(players, name), { recursive: true, force: true });
            createCheck.cleanedUp = true;
          }
        }
      }
    } catch (err) {
      createCheck = { error: err.message };
    }

    // Switching between a pack's recording sessions, including a freestyle
    // one, has to swap the takes over cleanly.
    let sessionCheck = null;
    try {
      sessionCheck = await win.webContents.executeJavaScript(`(async () => {
        const $ = (s) => document.querySelector(s);
        $('[data-tab="export"]').click();
        await new Promise((r) => setTimeout(r, 200));
        const settle = async () => {
          for (let i = 0; i < 800; i++) {
            await new Promise((r) => setTimeout(r, 250));
            if (!$('#btn-export').disabled) return true;
          }
          return false;
        };

        // Find a pack with more than one session.
        const cards = [...document.querySelectorAll('.pack-card')];
        let chosen = null;
        for (const card of cards) {
          card.click();
          await settle();
          if ($('#session-select').options.length > 1) { chosen = card; break; }
        }
        if (!chosen) return { skipped: 'no pack has two sessions' };

        const select = $('#session-select');
        const results = [];
        for (let i = 0; i < select.options.length; i++) {
          select.selectedIndex = i;
          select.dispatchEvent(new Event('change'));
          const ok = await settle();
          results.push({
            label: select.options[i].textContent,
            settled: ok,
            rows: document.querySelectorAll('.line-row').length,
            takesShown: document.querySelectorAll('.segmented button[data-src="take"]:not([disabled])').length,
            freestyleNote: Boolean(document.querySelector('.freestyle-note')),
          });
        }
        return { pack: $('#pack-title').textContent, sessions: results };
      })()`);

      if (sessionCheck && sessionCheck.sessions) {
        for (const s of sessionCheck.sessions) {
          if (!s.settled) errors.push(`session "${s.label}" never finished loading`);
          if (!s.rows) errors.push(`session "${s.label}" rendered no lines`);
        }
      }
    } catch (err) {
      sessionCheck = { error: err.message };
    }

    // Switching packs must not leave the outgoing pack's lines readable while
    // the new one loads. Exporting in that window produced a video with the
    // backing track and no dubbing.
    let staleCheck = null;
    try {
      staleCheck = await win.webContents.executeJavaScript(`(async () => {
        const $ = (s) => document.querySelector(s);
        $('[data-tab="export"]').click();
        await new Promise((r) => setTimeout(r, 200));
        const cards = [...document.querySelectorAll('.pack-card')];
        if (cards.length < 2) return { skipped: 'need two packs' };

        const settle = async () => {
          for (let i = 0; i < 800; i++) {
            await new Promise((r) => setTimeout(r, 250));
            if (!$('#btn-export').disabled && document.querySelectorAll('.line-row').length) return true;
          }
          return false;
        };

        cards[0].click();
        const firstSettled = await settle();
        const firstRows = document.querySelectorAll('.line-row').length;

        // Switch packs and look in the same tick. Anything decoded earlier in
        // the run is cached, so a reload can finish inside a few frames and a
        // delay here would miss the window entirely.
        cards[1].click();
        const during = {
          exportDisabled: $('#btn-export').disabled,
          rows: document.querySelectorAll('.line-row').length,
        };

        const secondSettled = await settle();
        return {
          firstRows,
          firstSettled,
          during,
          secondSettled,
          afterRows: document.querySelectorAll('.line-row').length,
          afterExpected: parseInt(cards[1].querySelector('.small').textContent, 10),
          afterExportEnabled: !$('#btn-export').disabled,
        };
      })()`);

      if (staleCheck && !staleCheck.skipped) {
        if (!staleCheck.during.exportDisabled) errors.push('export was allowed while a pack was still loading');
        if (staleCheck.during.rows !== 0) errors.push('stale line rows survived a pack switch');
        if (staleCheck.afterRows !== staleCheck.afterExpected) errors.push('line rows wrong after switching packs');
      }
    } catch (err) {
      staleCheck = { error: err.message };
    }

    // Spam-click every pack, then settle on the last one. A superseded load
    // must not write its results over the pack that actually won.
    let packCheck = null;
    try {
      packCheck = await win.webContents.executeJavaScript(`(async () => {
        document.querySelector('[data-tab="export"]').click();
        await new Promise((r) => setTimeout(r, 200));
        const cards = [...document.querySelectorAll('.pack-card')];
        if (!cards.length) return { skipped: 'no packs' };

        for (const card of cards) {
          card.click();
          await new Promise((r) => setTimeout(r, 120));
        }

        const target = cards[cards.length - 1];
        const wantTitle = target.querySelector('strong').textContent;
        const wantRows = parseInt(target.querySelector('.small').textContent, 10);
        target.click();

        const overlay = document.getElementById('loading-overlay');
        for (let i = 0; i < 600; i++) {
          await new Promise((r) => setTimeout(r, 500));
          if (overlay.hidden && document.querySelectorAll('.line-row').length) break;
        }

        const row = document.querySelector('.line-row');
        const rows = document.querySelectorAll('.line-row').length;
        return {
          clickedThrough: cards.length,
          settledOn: document.getElementById('pack-title').textContent,
          titleMatches: document.getElementById('pack-title').textContent === wantTitle,
          rows,
          expectedRows: wantRows,
          rowsMatch: rows === wantRows,
          markersMatch: document.querySelectorAll('.marker').length === wantRows,
          videoW: document.getElementById('video').videoWidth,
          // Each speaker should get their own colour in the list, matching the
          // captions, rather than every name sharing the accent colour.
          characterColours: (() => {
            const byName = {};
            for (const r of document.querySelectorAll('.line-row')) {
              const el = r.querySelector('.line-char');
              if (el) byName[el.textContent] = el.style.color || getComputedStyle(el).color;
            }
            return byName;
          })(),
          lineVolNumber: Boolean(row && row.querySelector('.line-vol-num')),
          lineOffsetNumber: Boolean(row && row.querySelector('input.nudge-val')),
          mixNumbers: document.querySelectorAll('.mix .num').length,
          loadingHidden: overlay.hidden,
        };
      })()`);
      if (packCheck && packCheck.rowsMatch === false) errors.push('line rows do not match the selected pack');
      if (packCheck && packCheck.titleMatches === false) errors.push('settled on the wrong pack');
    } catch (err) {
      packCheck = { error: err.message };
    }

    // Queue three exports at once. They must run one after another, and the
    // progress bar must survive the first one finishing.
    let queueCheck = null;
    if (process.env.CVE_SMOKE_EXPORT === '1') {
      try {
        queueCheck = await win.webContents.executeJavaScript(`(async () => {
          const $ = (s) => document.querySelector(s);
          const bar = $('#progress-bar');
          const seen = [];

          const watcher = setInterval(() => {
            const label = bar.hidden ? 'hidden' : $('#progress-title').textContent;
            if (seen[seen.length - 1] !== label) seen.push(label);
          }, 150);

          // Whole-video exports, so they last long enough to actually pile up.
          const outputs = [];
          for (let i = 0; i < 3; i++) {
            $('#btn-export').click();
            const scope = $('#opt-scope');
            scope.value = 'full';
            scope.dispatchEvent(new Event('change'));
            const q = $('#opt-quality');
            q.value = 'small';
            q.dispatchEvent(new Event('change'));
            outputs.push($('#opt-output').value);
            $('#btn-export-start').click();
            await new Promise((r) => setTimeout(r, 350));
          }

          let hiddenStreak = 0;
          for (let i = 0; i < 600; i++) {
            await new Promise((r) => setTimeout(r, 500));
            if (bar.hidden) { if (++hiddenStreak >= 3) break; } else hiddenStreak = 0;
          }
          clearInterval(watcher);
          return { timeline: seen, barHiddenAtEnd: bar.hidden, requested: outputs[0] };
        })()`);
      } catch (err) {
        queueCheck = { error: err.message };
      }
    }

    // The dub editor's newer parts: captions over the video, the volume
    // slider, clip thumbnails, pack details and the crop overlay. Superman is
    // the pack kept for testing, so anything written lands there.
    let toolsCheck = null;
    try {
      toolsCheck = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));

        // Earlier checks leave the editor open and the grid on another type,
        // so get back to voice packs deliberately rather than assuming.
        const editorView = document.getElementById('editor-view');
        if (!editorView.hidden) {
          const back = editorView.querySelector('.editor-head button');
          if (back) back.click();
          await wait(300);
        }
        document.querySelector('[data-tab="content"]').click();
        await wait(400);
        const voiceType = document.querySelector('#content-types button');
        if (voiceType) voiceType.click();

        let tile = null;
        for (let i = 0; i < 40; i++) {
          await wait(250);
          tile = [...document.querySelectorAll('.pack-tile')]
            .find((t) => t.textContent.includes(${JSON.stringify(SMOKE_PACK)}));
          if (tile) break;
        }
        if (!tile) return { skipped: 'no scratch pack' };
        tile.click();
        await wait(250);

        const edit = document.querySelector('#btn-detail-edit');
        if (!edit) return { skipped: 'no Edit button' };
        edit.click();

        const root = document.getElementById('editor-view');
        for (let i = 0; i < 120; i++) {
          await wait(500);
          if (!root.hidden && root.querySelector('canvas.timeline')) break;
        }

        const video = root.querySelector('video');
        for (let i = 0; i < 60; i++) {
          if (video && video.videoWidth) break;
          await wait(500);
        }

        const q = (s) => root.querySelector(s);
        const out = {
          opened: !root.hidden,
          videoW: video ? video.videoWidth : 0,
          hasVolume: Boolean(q('[data-role="volume"]')),
          hasCaptionToggle: Boolean(q('[data-act="captions"]')),
          hasTrimButton: Boolean(q('[data-act="trim"]')),
          hasCaptionHere: Boolean(q('[data-act="caption-here"]')),
          hasBackingButton: Boolean(q('[data-act="backing"]')),
          clipRows: root.querySelectorAll('.clip-row').length,
          thumbs: root.querySelectorAll('.clip-thumb').length,
          // Character names are offered rather than retyped. The list is opened
          // from the arrow beside the field and built when it opens, so this
          // opens it and reads what came out.
          characterOptions: (() => {
            const arrow = root.querySelector('.character-field [data-act="characters"]');
            if (!arrow || arrow.hidden) return [];
            arrow.click();
            const names = [...document.querySelectorAll('.character-list button')]
              .map((b) => b.dataset.name);
            arrow.click(); // closed again, so it cannot sit over a later check
            return names;
          })(),
          // Exactly one arrow: the native datalist used to draw a second.
          characterArrows: root.querySelectorAll('.clip-row .character-field button').length
            / Math.max(1, root.querySelectorAll('.clip-row').length),
        };

        const characterRow = root.querySelector('.clip-row');
        const characterInput = characterRow
          && characterRow.querySelector('[data-field="character"]');
        const originalCharacter = characterInput && characterInput.value;
        if (characterInput && originalCharacter) {
          const base = characterRow.dataset.base;
          characterInput.focus();
          characterInput.value = '__smoke_temporary_speaker';
          characterInput.dispatchEvent(new Event('input', { bubbles: true }));
          characterInput.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(150);
          characterInput.blur();
          const option = [...document.querySelectorAll('.character-list button')]
            .find((item) => item.dataset.name === originalCharacter);
          if (option) {
            option.click();
            await wait(150);
            characterRow.querySelector('.line-time').click();
            const refreshed = [...root.querySelectorAll('.clip-row')]
              .find((item) => item.dataset.base === base);
            out.characterPickPersisted = Boolean(refreshed
              && refreshed.querySelector('[data-field="character"]').value === originalCharacter);
          } else {
            out.characterPickPersisted = false;
          }
        }

        // Volume actually reaches the element.
        const vol = q('[data-role="volume"]');
        vol.value = '0.35';
        vol.dispatchEvent(new Event('input'));
        out.volumeApplied = Math.abs(video.volume - 0.35) < 0.01;
        out.volumeReadout = q('[data-role="vol-read"]').textContent;
        vol.value = '1';
        vol.dispatchEvent(new Event('input'));

        // A caption should appear while a line is speaking, and go once it is
        // over. Seek rather than play, so this does not depend on timing.
        const rows = [...root.querySelectorAll('.clip-row')];
        const stamp = rows.length ? rows[0].querySelector('.line-time') : null;
        if (stamp) {
          stamp.click();
          await wait(400);
          const box = q('.editor-caption');
          out.captionShown = box ? !box.hidden : null;
          out.captionText = box && !box.hidden ? box.textContent.trim().slice(0, 60) : '';

          // Waiting a fixed time here was flaky: a seek across a long proxy
          // can take longer than the wait, so the check ran while the playhead
          // was still inside the line it was meant to have left.
          const target = Math.max(0, video.duration - 0.5);
          await new Promise((resolve) => {
            const done = () => resolve();
            video.addEventListener('seeked', done, { once: true });
            video.currentTime = target;
            setTimeout(done, 5000);
          });
          await wait(250);
          out.seekedTo = video.currentTime;
          out.captionHiddenAfter = box ? box.hidden : null;
        }

        // Pack details tab, and that its fields carry the pack's real values.
        const packTab = q('[data-side-tab="pack"]');
        if (packTab) {
          packTab.click();
          await wait(150);
          out.packFields = [...root.querySelectorAll('[data-info]')].map((i) => i.dataset.info);
          out.titleField = (q('[data-info="title"]') || {}).value;
        }

        // Grabbing a pack icon, then leaving the editor and coming back. The
        // picture used to vanish on reopening, because the URL for a given
        // path never changed and the stale response was reused.
        const grab = q('[data-act="grab-icon"]');
        if (grab) {
          const packTab = q('[data-side-tab="pack"]');
          if (packTab) packTab.click();
          await wait(150);
          grab.click();
          await wait(2500);

          const back = root.querySelector('.editor-head button');
          if (back) back.click();
          await wait(600);

          let again = null;
          for (let i = 0; i < 40; i++) {
            await wait(250);
            again = [...document.querySelectorAll('.pack-tile')]
              .find((t) => t.textContent.includes(${JSON.stringify(SMOKE_PACK)}));
            if (again) break;
          }
          if (again) {
            again.click();
            await wait(300);
            document.querySelector('#btn-detail-edit').click();
            for (let i = 0; i < 120; i++) {
              await wait(500);
              if (!root.hidden && root.querySelector('canvas.timeline')) break;
            }
            const tab2 = root.querySelector('[data-side-tab="pack"]');
            if (tab2) tab2.click();
            await wait(250);

            const img = root.querySelector('.pack-detail-icon img');
            out.iconShownAfterReopen = Boolean(img);
            if (img) {
              // Being in the DOM is not the same as having actually decoded.
              out.iconLoaded = await new Promise((resolve) => {
                if (img.complete) { resolve(img.naturalWidth > 0); return; }
                img.addEventListener('load', () => resolve(img.naturalWidth > 0), { once: true });
                img.addEventListener('error', () => resolve(false), { once: true });
                setTimeout(() => resolve(img.naturalWidth > 0), 3000);
              });
            }
          }
        }

        // The trim overlay opens and closes again.
        q('[data-act="trim"]').click();
        await wait(250);
        const layer = q('.crop-layer');
        const rect = q('.trim-panel');
        out.trimOpened = Boolean(layer && !layer.hidden && rect);
        out.trimLength = q('.trim-length') ? q('.trim-length').textContent : null;

        // The video must not run while the trim panel is up. The panel is for
        // picking a still frame, and the file is about to be rewritten under it.
        const transportPlay = q('.editor-transport [data-act="play"]');
        const editorVideo = q('.editor-video video');
        if (transportPlay && editorVideo) {
          transportPlay.click();
          await wait(300);
          out.playedWhileTrimming = !editorVideo.paused;
          out.playLabelWhileTrimming = transportPlay.textContent.trim();
        }

        if (q('[data-role="cancel"]')) q('[data-role="cancel"]').click();
        await wait(150);
        out.trimClosed = layer.hidden;

        // ...and it plays again once the panel is gone, so the guard is not
        // just leaving playback permanently broken.
        if (transportPlay && editorVideo) {
          transportPlay.click();
          await wait(400);
          out.playedAfterTrim = !editorVideo.paused;
          out.playLabelAfterTrim = transportPlay.textContent.trim();
          editorVideo.pause();
        }

        // A trim actually carried out, then undone, then redone. The scratch
        // pack is a throwaway copy, so this is safe to really do, and really
        // doing it is the only way to reach the reopen that used to leave the
        // history in place but both buttons looking dead.
        //
        // Everything here is re-fetched through q() after each step: applying a
        // trim reopens the editor, so any element held from before is stale.
        const undoBtn = () => q('.editor-head [data-act="undo"]');
        const redoBtn = () => q('.editor-head [data-act="redo"]');
        const seconds = () => {
          const v = q('.editor-video video');
          return v && v.duration ? v.duration : null;
        };

        // A trim reopens the editor, and reopening rebuilds the preview from a
        // fresh transcode behind its own overlay. So waiting on the job's overlay
        // alone samples the editor as it was on the way in; this waits for the
        // whole round trip, which is what the person sitting there waits for too.
        const settled = async (wasSeconds) => {
          const prep = document.getElementById('prep-overlay');
          for (let i = 0; i < 400; i++) {
            await wait(250);
            const bar = q('.editor-busy');
            if (!bar || !bar.hidden) continue;
            if (prep && !prep.hidden) continue;
            const now = seconds();
            if (!now) continue;
            // Either the length changed, or there was no length to change from.
            if (wasSeconds == null || Math.abs(now - wasSeconds) > 0.25) {
              await wait(400);
              return true;
            }
          }
          return false;
        };

        const startLength = seconds();
        if (startLength && startLength > 8) {
          q('[data-act="trim"]').click();
          await wait(300);

          const from = q('[data-role="from"]');
          const to = q('[data-role="to"]');
          if (from && to) {
            from.value = '2';
            from.dispatchEvent(new Event('change', { bubbles: true }));
            to.value = String(Math.floor(startLength - 2));
            to.dispatchEvent(new Event('change', { bubbles: true }));

            out.lengthBeforeTrim = Number(startLength.toFixed(2));
            q('[data-role="apply"]').click();
            out.trimSettled = await settled(startLength);
            const trimmed = seconds();
            out.lengthAfterTrim = trimmed ? Number(trimmed.toFixed(2)) : null;
            out.undoEnabledAfterTrim = Boolean(undoBtn() && !undoBtn().disabled);

            if (out.undoEnabledAfterTrim) {
              undoBtn().click();
              out.undoSettled = await settled(trimmed);
              const restored = seconds();
              out.lengthAfterUndo = restored ? Number(restored.toFixed(2)) : null;
              // The reported bug: undo worked, and then there was no way back.
              out.redoEnabledAfterUndo = Boolean(redoBtn() && !redoBtn().disabled);

              if (out.redoEnabledAfterUndo) {
                redoBtn().click();
                out.redoSettled = await settled(restored);
                const again = seconds();
                out.lengthAfterRedo = again ? Number(again.toFixed(2)) : null;
              }
            }
          }
        }

        return out;
      })()`);

      if (toolsCheck && toolsCheck.skipped) { /* nothing to assert against */ }
      else if (toolsCheck) {
        if (!toolsCheck.hasVolume) errors.push('editor has no volume slider');
        if (!toolsCheck.volumeApplied) errors.push('volume slider does not reach the video');
        if (!toolsCheck.hasCaptionToggle) errors.push('editor has no caption toggle');
        if (!toolsCheck.hasBackingButton) errors.push('editor has no backing track button');
        if (!toolsCheck.trimOpened) errors.push('trim overlay did not open');
        if (!toolsCheck.trimClosed) errors.push('trim overlay did not close');
        if (toolsCheck.playedWhileTrimming) errors.push('video played under the trim overlay');
        if (toolsCheck.playLabelWhileTrimming && toolsCheck.playLabelWhileTrimming !== '▶') {
          errors.push('play button showed as playing while trimming');
        }
        if (toolsCheck.playedAfterTrim === false) {
          errors.push('video would not play again after the trim closed');
        }

        // Trim, undo, redo. Skipped rather than failed when the scratch pack's
        // video is too short to cut, since that is about the pack, not the code.
        if (toolsCheck.lengthBeforeTrim) {
          const before = toolsCheck.lengthBeforeTrim;
          if (!toolsCheck.trimSettled) errors.push('the trim never finished');
          else if (!(toolsCheck.lengthAfterTrim < before - 1)) {
            errors.push('the trim finished but the video is not shorter');
          }
          if (!toolsCheck.undoEnabledAfterTrim) {
            errors.push('Undo is not offered after a trim');
          }
          if (toolsCheck.undoEnabledAfterTrim) {
            if (!toolsCheck.undoSettled) errors.push('undoing the trim never finished');
            else if (!(toolsCheck.lengthAfterUndo > before - 1)) {
              errors.push('undoing the trim did not put the whole video back');
            }
            if (!toolsCheck.redoEnabledAfterUndo) {
              errors.push('Redo is not offered after undoing a trim');
            } else {
              if (!toolsCheck.redoSettled) errors.push('redoing the trim never finished');
              else if (!(toolsCheck.lengthAfterRedo < before - 1)) {
                errors.push('redoing the trim did not cut the video again');
              }
            }
          }
        }
        if (toolsCheck.clipRows && toolsCheck.thumbs !== toolsCheck.clipRows) {
          errors.push('not every clip row has a thumbnail');
        }
        if (toolsCheck.captionShown === false) errors.push('no caption shown on a line with one');
        if (toolsCheck.captionHiddenAfter === false) errors.push('caption stayed up past its line');
        if (toolsCheck.iconShownAfterReopen === false) errors.push('pack icon vanished on reopening');
        if (toolsCheck.iconLoaded === false) errors.push('pack icon is present but does not load');

        // A list that opens to nothing looks exactly like it working until it
        // is used.
        if (toolsCheck.clipRows) {
          if (!toolsCheck.characterOptions.length) {
            errors.push('the character list is empty despite the pack having clips');
          }
          if (toolsCheck.characterArrows > 1) {
            errors.push('the character field draws more than one dropdown arrow');
          }
          if (toolsCheck.characterPickPersisted === false) {
            errors.push('choosing a character from the list did not save it');
          }
        }
      }
    } catch (err) {
      toolsCheck = { error: err.message };
      errors.push(`editor tools check threw: ${err.message}`);
    }

    // The other pack types. The user has no judges, studio or chatter packs,
    // so these are made to spec, opened, edited, and removed.
    let typesCheck = null;
    try {
      typesCheck = await runTypeEditorChecks(win, gameDir, errors);
    } catch (err) {
      typesCheck = { error: err.message };
      errors.push(`pack type editors threw: ${err.message}`);
    }

    // The scratch pack goes whatever happened above, and its absence is
    // asserted rather than assumed.
    const scratchRemoved = scratch && gameDir ? removeSmokePack(gameDir) : null;
    if (scratch && !scratchRemoved) errors.push('the scratch pack was left behind');

    console.log('SMOKE ' + JSON.stringify(
      { report, scratch, scratchRemoved, videoCheck, trimSpeedCheck, changelogCheck, captionCheck, editorCheck, homeCheck,
        contentCheck, createCheck, sessionCheck, staleCheck, packCheck, toolsCheck, typesCheck,
        queueCheck, warnings, errors },
      null, 2));
    app.exit(errors.length ? 1 : 0);
  });
}

// IPC

const exportJobs = new Map();
let nextJobId = 1;

/**
 * Fetches the directory index.
 *
 * Size-capped twice: the declared length is refused early so a huge file is
 * never pulled down, and the text is checked again afterwards because a server
 * is free to lie about, or simply omit, content-length.
 */
async function fetchDirectory(url, { fresh = false } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('the directory address has to be https');

  // Asking past the cache, when it matters.
  //
  // raw.githubusercontent.com serves the index through a CDN that holds it for
  // around five minutes. That is fine for browsing and wrong immediately after
  // listing something: the pack was in the file, and the app kept being handed
  // the copy from before it, so it looked like listing had not worked until
  // enough time passed. A changing query string is the only thing a CDN cannot
  // answer from what it already has.
  if (fresh) parsed.searchParams.set('fresh', String(Date.now()));

  const response = await fetch(parsed.toString(), {
    signal: AbortSignal.timeout(15000),
    cache: fresh ? 'no-store' : 'default',
    headers: {
      accept: 'application/json',
      ...(fresh ? { 'cache-control': 'no-cache' } : {}),
    },
  });
  if (!response.ok) throw new Error(`the directory answered ${response.status}`);

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_INDEX_BYTES) {
    throw new Error('the directory is far larger than it should be');
  }

  const text = await response.text();
  if (text.length > MAX_INDEX_BYTES) {
    throw new Error('the directory is far larger than it should be');
  }
  return text;
}

/**
 * Registers everything the Mods tab needs.
 *
 * Kept together rather than scattered through registerIpc, because these are
 * the only handlers that talk to the outside world and it is worth being able
 * to see all of them at once.
 */
/**
 * Where the GitHub token is kept between runs.
 *
 * Encrypted with `safeStorage`, which hands the actual key to the OS keychain —
 * Credential Manager on Windows, Keychain on macOS. The file that lands on disk
 * is therefore useless to anyone who copies it off the machine, which a plain
 * JSON file in userData would not be.
 */
function tokenFile() {
  return path.join(app.getPath('userData'), 'github-token');
}

function saveToken(token) {
  const { safeStorage } = require('electron');
  if (!safeStorage.isEncryptionAvailable()) {
    // Refused rather than written in the clear. Someone whose OS cannot encrypt
    // it can still publish; they just sign in each time, which is a smaller
    // cost than a readable token sitting in their profile forever.
    return false;
  }
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(token));
  return true;
}

function loadToken() {
  const { safeStorage } = require('electron');
  try {
    if (!fs.existsSync(tokenFile()) || !safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(tokenFile()));
  } catch {
    // A token encrypted by a different machine or a reinstalled OS cannot be
    // read back. Signing in again is the fix, so this is not worth reporting.
    return null;
  }
}

function forgetToken() {
  try { fs.rmSync(tokenFile(), { force: true }); } catch { /* already gone */ }
}

/**
 * Who made each pack that was installed from somewhere else.
 *
 * Kept here rather than as a file inside the pack, because the game folder is
 * the player's and nothing belongs in it that the game did not ask for.
 *
 * The point is credit, not enforcement against a determined person — anyone
 * could rebuild a pack by hand. It stops the easy mistake: installing
 * somebody's work and publishing it as your own without ever meaning to.
 */
function originsFile() {
  return path.join(app.getPath('userData'), 'installed-origins.json');
}

function readOrigins() {
  try {
    return JSON.parse(fs.readFileSync(originsFile(), 'utf8'));
  } catch {
    return {};
  }
}

/** Remembers that a pack folder came from someone else. */
function noteOrigin(packDir, record) {
  if (!packDir || !record) return;
  // A dropped folder has no author to record, and that absence is the point:
  // it is known not to have been made here, which is enough to refuse
  // publishing it.
  if (!record.author && !record.dropped) return;

  const all = readOrigins();
  all[path.resolve(packDir).toLowerCase()] = {
    author: record.author || '',
    id: record.id || '',
    title: record.title || '',
    dropped: Boolean(record.dropped),
    at: new Date().toISOString(),
    // What was installed, so a later listing can be compared against it. The
    // checksum is the honest test: an author who fixes one caption and
    // republishes changes the file without necessarily changing anything else
    // about the listing, and a date can be written by hand.
    sha256: record.sha256 || '',
    type: record.type || '',
    updated: record.updated || record.published || '',
  };
  try {
    fs.writeFileSync(originsFile(), `${JSON.stringify(all, null, 2)}\n`);
  } catch { /* losing this costs credit, not correctness */ }
}

/** What is known about where a pack came from, if anything. */
function originOf(packDir) {
  if (!packDir) return null;
  return readOrigins()[path.resolve(packDir).toLowerCase()] || null;
}

/**
 * One copy of every pack file this app has fetched, kept by its checksum.
 *
 * The directory has no server, so how many times a pack has been downloaded is
 * read from the number GitHub keeps for the file itself. That number counts
 * requests, which means every avoidable second fetch of the same bytes shows
 * up as somebody else installing the pack, and an author reading their own
 * listing is told something untrue.
 *
 * None of it can be fixed at the counting end. It can be fixed here: a pack is
 * fetched once, and previewing it, installing it after previewing it, and
 * previewing it again a week later all read the copy already on disk. Keyed by
 * the checksum rather than by the pack, because that is what says two files are
 * the same file — the address changes with every republish and the id never
 * changes at all.
 *
 * What is left after this is a genuinely new fetch: a pack whose author has
 * published a new version, or one evicted for being older than the cap below.
 * Neither is the app counting the same download twice.
 */
function packCacheDir() {
  return path.join(app.getPath('userData'), 'pack-cache');
}

/** Where a pack of this checksum lives, whether or not it is there yet. */
function cachedPackPath(sha256) {
  return path.join(packCacheDir(), `${String(sha256).toLowerCase()}.zip`);
}

/**
 * The pack's zip, from the cache when it is already there and correct.
 *
 * The checksum is verified either way. A cached file that no longer matches is
 * treated exactly like one that was never there, so a corrupted or tampered
 * cache cannot turn into an install.
 */
async function fetchPack(pack, { onStage, onProgress, signal } = {}) {
  const stage = (name, percent) => { if (onStage) onStage(name, percent); };
  const target = cachedPackPath(pack.sha256);

  if (fs.existsSync(target) && (await checksum(target).catch(() => null)) === pack.sha256) {
    // Touched so the eviction below treats it as recently wanted.
    const now = new Date();
    try { fs.utimesSync(target, now, now); } catch { /* not important */ }
    return { path: target, cached: true };
  }

  fs.mkdirSync(packCacheDir(), { recursive: true });
  const partial = `${target}.${process.pid}.part`;

  try {
    stage('downloading', 0);
    await download(pack.downloadUrl, partial, {
      expectedBytes: pack.bytes,
      onProgress: (percent) => stage('downloading', percent),
      signal,
    });

    stage('checking');
    if (await checksum(partial) !== pack.sha256) {
      throw new Error('This download does not match what the listing says it should be, '
        + 'so it has not been used.');
    }

    // Renamed only once it is proven, so a cancelled or corrupted download can
    // never be picked up as a cache hit by the next attempt.
    fs.renameSync(partial, target);
    prunePackCache(pack.sha256);
    return { path: target, cached: false };
  } catch (err) {
    try { fs.unlinkSync(partial); } catch { /* never created */ }
    throw err;
  }
}

// Packs are tens of megabytes each, so this is a cache rather than a hoard.
// Large enough that a normal session of browsing never evicts something it is
// about to want, small enough not to quietly fill a disk.
const PACK_CACHE_BYTES = 600 * 1024 * 1024;

/** Drops the least recently wanted packs until the cache is under its cap. */
function prunePackCache(keepSha) {
  const keep = `${String(keepSha || '').toLowerCase()}.zip`;
  try {
    const files = fs.readdirSync(packCacheDir())
      .filter((name) => name.endsWith('.zip'))
      .map((name) => {
        const full = path.join(packCacheDir(), name);
        const stat = fs.statSync(full);
        return { name, full, bytes: stat.size, when: stat.mtimeMs };
      })
      .sort((a, b) => b.when - a.when);

    let total = 0;
    for (const file of files) {
      total += file.bytes;
      if (total <= PACK_CACHE_BYTES || file.name === keep) continue;
      fs.rmSync(file.full, { force: true });
    }
  } catch {
    // No cache folder yet, or a file held open by something else. Neither is
    // worth failing a download that has already succeeded.
  }
}

// The parts of a listing somebody typed, as against the parts this app filled
// in from GitHub. Everything not in here — the author, the address, the
// checksum, the size, the dates — came from the account that just signed in
// and the release that was just made, so it is not something a person chose or
// can change.
const TYPED_FIELDS = new Set(['title', 'summary', 'description', 'tags', 'licence', 'content']);

/**
 * Why a finished listing would not validate, said to the right person.
 *
 * This runs after the upload has succeeded, on a record this app assembled. A
 * publisher was shown the raw complaint and left holding it: told that their
 * own GitHub username is not a GitHub username, with no way to change their
 * username and no suggestion that anything but they was at fault. Which of the
 * two situations it is turns entirely on which field failed.
 */
function explainBadRecord(problem) {
  const detail = problem && problem.message ? problem.message : 'no reason given';

  if (problem && TYPED_FIELDS.has(problem.field)) {
    return 'The pack uploaded, but the listing details need a change before it can be '
      + `offered: ${detail}\n\nPublish it again and adjust that when asked. The upload is `
      + 'finished and will not be done twice.';
  }

  return 'The pack uploaded, but this app could not build a valid listing for it, which is a '
    + `fault here rather than anything you did: ${detail}\n\nNothing was sent to the directory. `
    + 'The release is on your account and the zip is still in your exports folder, so nothing '
    + 'has been lost. Reporting this with the message above is the most useful thing you can do '
    + 'with it.';
}

/**
 * An address this app is willing to hand to the operating system, or nothing.
 *
 * `shell.openExternal` does whatever the machine has been told that scheme
 * means. On Windows that includes `file:` handing an executable to the shell,
 * and a long tail of registered handlers that have been used to start programs
 * from a link. The two callers here open GitHub pages and a donation page, so
 * https is the whole of what is needed and everything else is refused rather
 * than reasoned about.
 *
 * A credential in the address is refused too. Nothing here builds one, so its
 * presence means the address came from somewhere it should not have, and
 * `https://github.com@evil.example/` reads as GitHub to almost everybody.
 */
function safeExternalUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

/**
 * Keeps the unpacked previews from piling up.
 *
 * These are the extracted folders, not the downloads: the zips live in the
 * pack cache and are managed by their own cap, so throwing an unpacked copy
 * away costs an unzip rather than a download. A few recent ones survive
 * because reopening the pack you just looked at is the common case.
 */
function prunePreviews(keepId, keep = 3) {
  const root = path.join(app.getPath('userData'), 'previews');
  try {
    const folders = fs.readdirSync(root)
      .filter((name) => name !== keepId)
      .map((name) => {
        const dir = path.join(root, name);
        return { dir, when: fs.statSync(dir).mtimeMs };
      })
      .sort((a, b) => b.when - a.when);

    for (const old of folders.slice(keep - 1)) {
      fs.rmSync(old.dir, { recursive: true, force: true });
      allowedRoots.delete(path.resolve(old.dir));
    }
  } catch {
    // Nothing to tidy, or something is holding a file open. Neither is worth
    // failing a preview that has already succeeded.
  }
}

/**
 * What is inside an unpacked pack, well enough to judge it before installing.
 *
 * Handed back as cvmedia:// addresses so the page can play and show it without
 * ever being given a filesystem path, the same as everything else it displays.
 *
 * Keyed off the audio rather than off the config files. A line is a sound
 * somebody recorded; what describes it varies between packs, and building this
 * from `.ini` files alone once showed one line out of thirty.
 */
function describePreview(dir) {
  const files = [];
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push({ rel: path.relative(dir, full), full });
    }
  };
  walk(dir);

  const ext = (f) => path.extname(f.rel).toLowerCase();
  const noExt = (rel) => rel.slice(0, rel.length - path.extname(rel).length);

  const video = files.find((f) => ['.ogv', '.mp4', '.webm'].includes(ext(f)));
  const images = files.filter((f) => ICON_EXTS.includes(ext(f)));
  const audio = files.filter((f) => ['.wav', '.ogg', '.mp3', '.opus'].includes(ext(f)));

  // The words each line says, where the pack carries them. Read from a plain
  // `.txt` beside the clip first, which is what most packs use, then from an
  // `.ini` of the same name.
  const captionOf = (base) => {
    const plain = files.find((f) => f.rel === `${base}.txt`);
    if (plain) {
      try { return fs.readFileSync(plain.full, 'utf8').trim().slice(0, 300); } catch { /* skip */ }
    }
    const ini = files.find((f) => f.rel === `${base}.ini` || f.rel === `${base}.cfg`);
    if (ini) {
      try {
        const said = fs.readFileSync(ini.full, 'utf8').match(/^\s*caption\s*=\s*(.+)$/im);
        if (said) return said[1].trim().replace(/^["']|["']$/g, '').slice(0, 300);
      } catch { /* skip */ }
    }
    return '';
  };

  return {
    // The path, not an address. The caller converts it and hands back a URL
    // for the copy Chromium can actually decode.
    videoPath: video ? video.full : null,
    videoUrl: null,
    images: images.slice(0, 12).map((f) => ({ name: f.rel, url: mediaUrl(f.full) })),
    lines: audio.slice(0, 60).map((f) => ({
      name: path.basename(noExt(f.rel)),
      url: mediaUrl(f.full),
      caption: captionOf(noExt(f.rel)),
    })),
    // How many there really are. A long pack shows the first sixty, and saying
    // so is the difference between a sample and a pack that appears to be
    // missing most of itself.
    lineCount: audio.length,
    fileCount: files.length,
    bytes: files.reduce((n, f) => {
      try { return n + fs.statSync(f.full).size; } catch { return n; }
    }, 0),
  };
}

const ICON_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

// Matches the ceiling github.js refuses to upload past, so an icon that was
// accepted at publish time can always be fetched back.
const MAX_ICON_BYTES = 4 * 1024 * 1024;

/**
 * The pack's icon, but only if it really is inside the pack.
 *
 * The renderer says which file it thinks the icon is, and the renderer is not
 * where that should be decided. Resolved against the pack's own folder so a
 * doctored message cannot have some unrelated file off the disk uploaded to a
 * public release.
 */
function iconInside(packDir, iconPath) {
  if (!packDir || !iconPath) return null;

  const root = path.resolve(packDir);
  const full = path.resolve(iconPath);
  const within = full === root || full.startsWith(root + path.sep);
  if (!within) return null;
  if (!ICON_EXTS.includes(path.extname(full).toLowerCase())) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

/**
 * Fetches a listing's icon, checks it is the image that was published, and
 * keeps it.
 *
 * Three separate reasons this does not happen in the renderer:
 *
 * The page is not allowed to. Its content security policy permits images from
 * `cvmedia:` and nothing remote, which is deliberate: a directory record is
 * somebody else's text, and an `<img>` pointed at an address of their choosing
 * reports every viewer's IP to whoever wrote it.
 *
 * The hash has to be checked before the image is shown, and checking it after
 * the browser has already fetched and decoded the bytes is checking nothing.
 *
 * And an address is not a promise. A release asset can be replaced at any time
 * without the address changing, so a pack accepted with an innocent icon could
 * be given a different one afterwards. The hash recorded at publish time is
 * what makes that swap fail rather than succeed silently.
 */
/**
 * Somebody's GitHub picture, fetched and kept.
 *
 * Same reasoning as the pack icons: the page may not load anything remote, both
 * because its content security policy says so and because an `<img>` pointed at
 * an address from a directory record reports every viewer's IP to whoever wrote
 * it. Avatars are different from pack icons in one way that matters, though:
 * there is no hash to check them against, because GitHub serves whatever the
 * account currently has.
 *
 * That is acceptable here and would not be for a pack icon. This only ever
 * loads `avatars.githubusercontent.com`, which is GitHub's own host and not an
 * address anybody in the directory chooses, so the worst a publisher can do is
 * change their own profile picture.
 */
function registerAvatarIpc() {
  const cacheDir = path.join(app.getPath('userData'), 'avatars');
  fs.mkdirSync(cacheDir, { recursive: true });
  allowedRoots.add(path.resolve(cacheDir));

  // Kept for a day. A profile picture changing is not urgent, and asking GitHub
  // for every face on every visit to the tab is rude to them and slow here.
  const KEEP_MS = 24 * 60 * 60 * 1000;

  ipcMain.handle('mods:avatar', async (_event, { login }) => {
    const name = String(login || '').toLowerCase();
    if (!/^[a-z0-9](?:-?[a-z0-9]){0,38}$/.test(name)) {
      return { ok: false, error: 'that is not a username' };
    }

    const cached = path.join(cacheDir, `${name}.img`);
    try {
      const age = Date.now() - fs.statSync(cached).mtimeMs;
      if (age < KEEP_MS) return { ok: true, url: mediaUrl(cached) };
    } catch { /* not fetched yet */ }

    try {
      // The size is asked for, so a 460px face is not downloaded to be drawn
      // at 40. Addressed by username rather than by a URL from a record, so
      // nothing in the directory can point this anywhere.
      const response = await fetch(
        `https://avatars.githubusercontent.com/${encodeURIComponent(name)}?s=160`,
        { signal: AbortSignal.timeout(15000), headers: { accept: 'image/*' } },
      );
      if (!response.ok) return { ok: false, error: `GitHub answered ${response.status}` };

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_ICON_BYTES) return { ok: false, error: 'that picture is too large' };

      fs.writeFileSync(cached, bytes);
      bumpMedia(cacheDir);
      return { ok: true, url: mediaUrl(cached) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

function registerIconIpc() {
  const cacheDir = path.join(app.getPath('userData'), 'mod-icons');
  // Served through the media protocol like everything else the renderer shows,
  // so the page still never sees a filesystem path.
  fs.mkdirSync(cacheDir, { recursive: true });
  allowedRoots.add(path.resolve(cacheDir));

  ipcMain.handle('mods:icon', async (_event, { url, sha256 }) => {
    if (!url || !sha256 || !/^[a-f0-9]{64}$/i.test(String(sha256))) {
      return { ok: false, error: 'that listing has no verifiable icon' };
    }

    // Named after the hash, so a changed icon is a different file rather than
    // something that has to be noticed and evicted.
    const want = String(sha256).toLowerCase();
    const cached = path.join(cacheDir, `${want}.img`);
    if (fs.existsSync(cached)) return { ok: true, url: mediaUrl(cached) };

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: 'that is not a web address' };
    }
    if (parsed.protocol !== 'https:') return { ok: false, error: 'icons have to come over https' };

    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (!ALLOWED_HOSTS.some((ok) => host === ok || host.endsWith(`.${ok}`))) {
      return { ok: false, error: `icons cannot be loaded from ${host}` };
    }

    try {
      const response = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(20000),
        headers: { accept: 'image/*' },
      });
      if (!response.ok) return { ok: false, error: `the icon answered ${response.status}` };

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_ICON_BYTES) {
        return { ok: false, error: 'that icon is far larger than an icon should be' };
      }

      const got = crypto.createHash('sha256').update(bytes).digest('hex');
      if (got !== want) {
        // Not shown, and not cached. The file behind the address is not the one
        // that was published and looked at, so nothing here is willing to put
        // it on screen.
        return {
          ok: false,
          error: 'this icon is not the image that was published, so it was not shown',
          swapped: true,
        };
      }

      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cached, bytes);
      bumpMedia(cacheDir);
      return { ok: true, url: mediaUrl(cached) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

/** Publishing: sign in, upload, submit. */
function registerPublishIpc() {
  /** The files this app has put on the signed-in account. */
  ipcMain.handle('mods:releases', async () => {
    const token = loadToken();
    if (!token) return { ok: false, error: 'Not signed in to GitHub.' };
    try {
      return { ok: true, ...(await github.myReleases(token)) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Deletes one of them.
   *
   * The only irreversible thing this app can do to somebody's GitHub account,
   * so it does exactly what it was asked and nothing around it. In particular
   * it does not touch the directory: a listing pointing at a file that has gone
   * is a decision the person should make knowingly, and the interface says so
   * before this is ever called.
   */
  ipcMain.handle('mods:deleteRelease', async (_event, { id, tag }) => {
    const token = loadToken();
    if (!token) return { ok: false, error: 'Not signed in to GitHub.' };
    if (!id) return { ok: false, error: 'No release was named.' };
    try {
      await github.deleteRelease(token, id, tag);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Reports a listed pack, or the account behind one.
   *
   * Needs a sign-in, and that is the point rather than a side effect. The issue
   * is opened under the reporter's own account, so a publisher taken off the
   * list can see who asked and why, and a report cannot be filed by nobody.
   */
  ipcMain.handle('mods:report', async (_event, what) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, error: 'Sign in to GitHub first. Reports are not anonymous.' };
    }
    if (!github.canSubmit()) {
      return { ok: false, error: 'There is no directory set up to report to.' };
    }
    try {
      return await review.report(token, DIRECTORY_REPO, what || {});
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /** Who is signed in, if anyone, and whether publishing is possible at all. */
  ipcMain.handle('mods:whoAmI', async () => {
    if (!github.isConfigured()) return { ok: true, configured: false };
    const token = loadToken();
    if (!token) return { ok: true, configured: true, signedIn: false, canSubmit: github.canSubmit() };
    try {
      const me = await github.whoAmI(token);
      return { ok: true, configured: true, signedIn: true, canSubmit: github.canSubmit(), ...me };
    } catch {
      // The stored token no longer works — revoked, expired, or from another
      // account. Dropping it means the next press offers a fresh sign-in
      // instead of failing the same way again.
      forgetToken();
      return { ok: true, configured: true, signedIn: false, canSubmit: github.canSubmit() };
    }
  });

  /**
   * Starts the device flow and waits for approval.
   *
   * The code is sent to the renderer as soon as GitHub gives it, so it can be
   * shown while this call is still waiting.
   */
  ipcMain.handle('mods:signIn', async (event) => {
    if (!github.isConfigured()) {
      return { ok: false, error: 'This build cannot sign in to GitHub.' };
    }
    try {
      const start = await github.startSignIn();
      if (!event.sender.isDestroyed()) {
        event.sender.send('mods:deviceCode', {
          userCode: start.userCode,
          verificationUri: start.verificationUri,
          expiresInMs: start.expiresInMs,
        });
      }
      const token = await github.waitForToken(start);
      const stored = saveToken(token);
      const me = await github.whoAmI(token);
      return { ok: true, ...me, remembered: stored };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('mods:signOut', () => {
    forgetToken();
    return { ok: true };
  });

  /**
   * What has happened to this person's own submissions, and where they stand.
   *
   * The reason a pack was refused lives on a GitHub issue, which is somewhere
   * almost nobody will look. Bringing it into the app is the difference between
   * being told why and being ignored.
   */
  ipcMain.handle('mods:inbox', async () => {
    if (!github.isConfigured() || !DIRECTORY_REPO) return { ok: true, configured: false };
    const token = loadToken();
    if (!token) return { ok: true, configured: true, signedIn: false };

    try {
      const me = await github.whoAmI(token);
      const [items, standing] = await Promise.all([
        review.mySubmissions(token, DIRECTORY_REPO, me.login),
        review.standingOf(DIRECTORY_REPO, me.login),
      ]);
      return { ok: true, configured: true, signedIn: true, login: me.login, items, standing };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Uploads a packaged zip to the author's own account and offers it to the
   * directory.
   *
   * The record is rebuilt here from what GitHub actually returned rather than
   * from anything the renderer supplied, so the address in it is the address
   * the file really has.
   */
  // Everything inside one try, including the checks that come before any
  // uploading. A handler that throws rather than answering leaves the renderer
  // with a rejected promise and no result to read, and publishing then failed
  // with nothing said at all. There is one way out of here: an answer.
  ipcMain.handle('mods:publish', async (event, { zipPath, details }) => {
    try {
      const token = loadToken();
      if (!token) return { ok: false, error: 'Not signed in to GitHub.' };
      if (!zipPath || !fs.existsSync(zipPath)) {
        return { ok: false, error: 'That zip is no longer there. Package the pack again.' };
      }
      if (!details || !details.id) {
        return { ok: false, error: 'This pack has no name to be listed under.' };
      }

      // Refused here rather than only in the interface, because this is the rule
      // that keeps credit honest and the renderer is not where it should live.
      const origin = originOf(details.packDir);
      if (origin && origin.dropped) {
        return {
          ok: false,
          error: `"${origin.title || details.title}" was added by dragging it in, so this app `
            + 'has no way to know who made it. Only packs made or installed here can be '
            + 'published. You can still package it as a zip and pass it on.',
        };
      }
      if (origin && origin.author) {
        const me = await github.whoAmI(token).catch(() => null);
        if (!me || me.login.toLowerCase() !== String(origin.author).toLowerCase()) {
          return {
            ok: false,
            error: `"${origin.title || details.title}" was made by ${origin.author} and installed `
              + 'from the directory, so it cannot be published under another name. You can still '
              + 'package it as a zip and pass it on.',
          };
        }
      }

      const uploaded = await github.publish(token, {
        zipPath,
        packId: details.id,
        title: details.title,
        // Checked here rather than trusted from the renderer, and checked
        // against the pack's own folder so this cannot be pointed at some
        // other file on the machine.
        iconPath: iconInside(details.packDir, details.iconPath),
      }, {
        onProgress: ({ stage, percent, sent, bytes }) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send('mods:publishProgress', { stage, percent, sent, bytes });
        },
      });

      const now = new Date().toISOString();
      const record = {
        version: 1,
        id: details.id,
        type: details.type,
        title: details.title,
        summary: details.summary,
        description: details.description || '',
        // The account that actually holds the file, so the record can never
        // claim someone it is not hosted by.
        author: uploaded.author,
        licence: details.licence || 'unstated',
        content: Array.isArray(details.content) ? details.content : [],
        tags: details.tags || [],
        downloadUrl: uploaded.downloadUrl,
        sha256: details.sha256,
        iconUrl: uploaded.iconUrl,
        iconSha256: uploaded.iconSha256,
        bytes: uploaded.bytes,
        gameVersion: details.gameVersion || null,
        published: now,
        updated: now,
      };

      const checked = validateRecord(record);
      if (!checked.ok) {
        return {
          ok: false,
          error: explainBadRecord(checked.problems[0]),
          releaseUrl: uploaded.releaseUrl,
        };
      }

      const say = (stage) => {
        if (!event.sender.isDestroyed()) event.sender.send('mods:publishProgress', { stage });
      };

      if (!github.canSubmit()) {
        // Uploaded and valid, with nowhere to list it yet. Said plainly, and
        // the address is handed back so the work is not lost.
        return {
          ok: true,
          submitted: false,
          downloadUrl: uploaded.downloadUrl,
          releaseUrl: uploaded.releaseUrl,
          record: checked.record,
        };
      }

      say('submitting');

      // Offering it to the directory is a separate failure from uploading it.
      // Rolled together, a submission that could not be opened was reported as
      // the whole publish having failed, which is not true and sends somebody
      // to re-upload a file that is already sitting on their account.
      try {
        const issue = await github.submitRecord(token, checked.record);
        say('done');
        return {
          ok: true,
          submitted: true,
          downloadUrl: uploaded.downloadUrl,
          releaseUrl: uploaded.releaseUrl,
          issueUrl: issue.url,
          record: checked.record,
        };
      } catch (err) {
        say('done');
        return {
          ok: true,
          submitted: false,
          submitError: err.message,
          downloadUrl: uploaded.downloadUrl,
          releaseUrl: uploaded.releaseUrl,
          record: checked.record,
        };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}


/** Moderation: the queue, the sandbox, and the two decisions. */
function registerReviewIpc() {
  const tokenOrNull = () => loadToken();

  /** Whether this account may moderate. Drives whether the tab exists at all. */
  ipcMain.handle('review:status', async () => {
    if (!github.isConfigured() || !DIRECTORY_REPO) return { ok: true, moderator: false };
    const token = tokenOrNull();
    if (!token) return { ok: true, moderator: false, signedIn: false };
    try {
      const me = await github.whoAmI(token);
      const said = await review.permissionOf(token, DIRECTORY_REPO, me.login);
      return { ok: true, signedIn: true, login: me.login, ...said, repo: DIRECTORY_REPO };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('review:queue', async () => {
    const token = tokenOrNull();
    if (!token) return { ok: false, error: 'Not signed in to GitHub.' };
    try {
      return { ok: true, items: await review.queue(token, DIRECTORY_REPO) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });


  /** Ends a review, taking the sandbox with it. */
  /** Hides or restores a listed pack. */
  ipcMain.handle('review:setListed', async (_e, { packId, listed }) => {
    const token = tokenOrNull();
    if (!token) return { ok: false, error: 'Not signed in to GitHub.' };
    try {
      const done = await review.setListed(token, DIRECTORY_REPO, packId, listed);
      // The index will change once the workflow runs, so what is held here is
      // already out of date.
      return done;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Blocks an account, with no report in front of it.
   *
   * Reports are the usual way this happens and not the only one. Something can
   * be noticed directly, and requiring a report to exist first would mean
   * inventing one to act on what you already know.
   */
  ipcMain.handle('review:ban', async (_e, { author, reason, forDuration }) => {
    const token = tokenOrNull();
    if (!token) return { ok: false, error: 'Not signed in to GitHub.' };
    if (!author) return { ok: false, error: 'No account was named.' };
    try {
      await review.banAuthor(token, DIRECTORY_REPO, author, reason, { forDuration });
      return { ok: true, banned: author };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Lifts a ban.
   *
   * Its own handler rather than another branch of deciding a report, because
   * unbanning is not a report outcome: it usually happens long afterwards, on
   * an account whose report was settled and closed months ago.
   */
  ipcMain.handle('review:unban', async (_e, { author, reason }) => {
    const token = tokenOrNull();
    if (!token) return { ok: false, error: 'Not signed in to GitHub.' };
    if (!author) return { ok: false, error: 'No account was named.' };
    try {
      await review.banAuthor(token, DIRECTORY_REPO, author, reason, { lift: true });
      return { ok: true, lifted: author };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Settles a report.
   *
   * Three outcomes, and none of them is about approving anything: hide the pack
   * that was reported, block the account behind it, or close the report because
   * there was nothing in it. Each says why on the issue before closing it, so
   * whoever reported it can see it was read.
   */
  ipcMain.handle('review:decide', async (_e, { number, decision, reason, packId, author, forDuration }) => {
    const token = tokenOrNull();
    if (!token) return { ok: false, error: 'Not signed in to GitHub.' };

    try {
      if (decision === 'hide') {
        if (!packId) return { ok: false, error: 'That report does not name a pack.' };
        await review.setListed(token, DIRECTORY_REPO, packId, false);
        await review.comment(token, DIRECTORY_REPO, number,
          `Taken down.\n\n${reason}`);
      } else if (decision === 'ban') {
        if (!author) return { ok: false, error: 'That report does not name an account.' };
        if (packId) await review.setListed(token, DIRECTORY_REPO, packId, false).catch(() => {});
        await review.banAuthor(token, DIRECTORY_REPO, author, reason, { forDuration });
        const how = forDuration
          ? `blocked from publishing for ${forDuration}`
          : 'blocked from publishing';
        await review.comment(token, DIRECTORY_REPO, number,
          `Taken down, and the account ${how}.\n\n${reason}`);
      } else {
        await review.comment(token, DIRECTORY_REPO, number,
          `Closed with no action taken.\n\n${reason}`);
      }

      await review.close(token, DIRECTORY_REPO, number);
      return { ok: true, decision };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

/**
 * Hands a media file to the renderer as bytes.
 *
 * The editor needs the whole backing track in memory to draw its waveform, and
 * it used to read it with `fetch` on the cvmedia:// scheme. That is a
 * cross-origin request from a file:// page to a registered standard scheme, and
 * it stopped working — so the waveform silently vanished while video, which is
 * loaded by a media element and never needed CORS, carried on fine.
 *
 * Reading it over IPC has no origin to be wrong about. The path is checked the
 * same way the protocol handler checks it, so this opens nothing new.
 */
function registerMediaBytesIpc() {
  ipcMain.handle('media:bytes', async (_e, target) => {
    if (!target) return { ok: false, error: 'no file given' };

    // Takes either a path or one of our own cvmedia:// addresses, so callers
    // that only ever held a URL do not have to learn about paths.
    let filePath = target;
    if (String(target).startsWith(`${MEDIA_SCHEME}://`)) {
      try {
        filePath = pathFromMediaUrl(target);
      } catch {
        return { ok: false, error: 'that is not a media address' };
      }
    }

    if (!isAllowed(filePath)) {
      return { ok: false, error: 'that file is outside the game folder' };
    }
    try {
      const bytes = await fsp.readFile(filePath);
      // Sent as a plain array buffer; the renderer decodes it itself.
      return { ok: true, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

function registerModsIpc() {
  registerMediaBytesIpc();
  registerIconIpc();
  registerAvatarIpc();
  registerPublishIpc();
  registerReviewIpc();

  /** Reads the directory, dropping any record that does not validate. */
  ipcMain.handle('mods:index', async (_event, options = {}) => {
    // A setting is only for pointing somewhere else — a fork, or a test index.
    // Left alone it uses the real directory.
    const url = settings.modsIndexUrl || DIRECTORY_INDEX_URL;
    if (!url) return { ok: true, configured: false, packs: [], rejected: 0 };

    try {
      const text = await fetchDirectory(url, { fresh: Boolean(options && options.fresh) });
      const result = validateIndex(JSON.parse(text));
      if (!result.ok) return { ok: false, error: result.error };
      if (result.rejected.length) {
        console.warn(`Directory: dropped ${result.rejected.length} record(s) that did not validate`);
      }
      return {
        ok: true,
        configured: true,
        packs: result.packs,
        rejected: result.rejected.length,
        updated: new Date().toISOString(),
      };
    } catch (err) {
      // A 404 means the directory has not been published yet, which is a
      // different thing from it being broken and should not be shown as a
      // failure the reader is expected to do something about.
      if (/answered 404/.test(err.message)) {
        return { ok: true, configured: false, packs: [], rejected: 0 };
      }
      return { ok: false, error: err.message };
    }
  });

  /**
   * Fetches a listed pack so it can be heard before it is installed.
   *
   * The whole point of a directory is that you are taking somebody's word for
   * what a pack is. A name, a line of description and a picture do not tell you
   * whether the recording is any good, and finding that out by installing it
   * means putting files into the game folder to answer a question.
   *
   * The file comes from the shared pack cache, so previewing a pack, then
   * installing it, then looking at it again a month later is one download
   * rather than three. Every check that guards installing runs here too: this
   * is somebody else's zip and being for a preview does not make it more
   * trustworthy.
   */
  ipcMain.handle('mods:preview', async (event, { record }) => {
    const checked = validateRecord(record, { fromIndex: true });
    if (!checked.ok) {
      return { ok: false, error: `That listing is not valid: ${checked.problems[0].message}` };
    }
    const pack = checked.record;

    // Keyed by checksum, like the cache, so an updated pack unpacks beside the
    // version it replaced rather than being shown the old one under its id.
    const root = path.join(app.getPath('userData'), 'previews', pack.sha256.slice(0, 16));
    const unpacked = path.join(root, 'unpacked');
    allowedRoots.add(path.resolve(root));

    const say = (stage, percent) => {
      if (!event.sender.isDestroyed()) event.sender.send('mods:progress', { stage, percent });
    };

    try {
      const zipPath = (await fetchPack(pack, { onStage: say })).path;

      if (!fs.existsSync(unpacked)) {
        fs.mkdirSync(root, { recursive: true });

        const shape = checkArchiveShape(await listEntries(zipPath));
        if (!shape.ok) throw new Error(`This pack is not safe to open: ${shape.problems[0]}`);

        say('unpacking');
        await extractInto(zipPath, unpacked);
      }

      const found = describePreview(unpacked);

      // The pack video is Theora, which Chromium cannot decode: handing its
      // address straight to the page produced a black rectangle and nothing
      // else. Everywhere in the app that shows a video builds a proxy first,
      // and this is no different for being somebody else's pack.
      if (found.videoPath) {
        say('converting the video');
        try {
          const proxy = await ensureProxy(found.videoPath, path.join(root, 'proxy'), {
            onProgress: (percent) => say('converting the video', percent),
          });
          found.videoUrl = mediaUrl(proxy.path);
        } catch {
          // A pack whose video will not convert is still worth listening to,
          // so the lines stay and the player goes rather than the whole
          // preview failing over one file.
          found.videoUrl = null;
        }
      }
      delete found.videoPath;

      say('done');
      prunePreviews(path.basename(root));
      return { ok: true, ...found };
    } catch (err) {
      // Only the unpacked copy goes. The zip stays in the cache, where it is
      // either correct or will be re-fetched on its own terms; deleting it
      // because unpacking failed would mean paying for the download again.
      fs.rmSync(root, { recursive: true, force: true });
      return { ok: false, error: err.message };
    }
  });

  /**
   * Every pack on this machine that came from the directory, and whether the
   * listing has moved on since.
   *
   * An author who fixes a caption and republishes leaves everyone who already
   * installed it holding the old copy with nothing to tell them so. Comparing
   * the checksum recorded at install time against the one the listing carries
   * now answers that exactly, and it is the only field that cannot be wrong
   * about it: a pack can be rebuilt without its version or dates changing, but
   * not without its bytes changing.
   *
   * Nothing here installs anything. It reports, and the app asks.
   */
  ipcMain.handle('mods:installed', async (event, { packs } = {}) => {
    const listed = new Map();
    for (const pack of Array.isArray(packs) ? packs : []) {
      const checked = validateRecord(pack, { fromIndex: true });
      if (checked.ok) listed.set(checked.record.id, checked.record);
    }

    const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    const origins = readOrigins();
    const mine = [];

    for (const [dir, origin] of Object.entries(origins)) {
      if (!origin.id || origin.dropped) continue;
      // A pack deleted from the game folder is not installed, whatever this
      // file still remembers about it.
      if (!fs.existsSync(dir)) continue;
      // And one sitting outside the folder the app is pointed at is somebody
      // else's install, or a leftover from a folder that has since moved.
      if (gameDir && !path.resolve(dir).toLowerCase()
        .startsWith(path.resolve(gameDir).toLowerCase())) continue;

      const now = listed.get(origin.id) || null;
      mine.push({
        dir,
        id: origin.id,
        title: origin.title || path.basename(dir),
        author: origin.author,
        type: origin.type || (now && now.type) || '',
        installedAt: origin.at,
        installedSha: origin.sha256 || '',
        // Unlisted or removed since. Said plainly rather than guessed at: it
        // is not out of date, there is simply nothing to compare it to.
        stillListed: Boolean(now && now.listed !== false),
        // An install from before checksums were recorded cannot be compared,
        // and claiming an update exists on that basis would be a lie.
        canCompare: Boolean(origin.sha256 && now && now.sha256),
        hasUpdate: Boolean(origin.sha256 && now && now.sha256 && now.sha256 !== origin.sha256),
        record: now,
      });
    }

    mine.sort((a, b) => a.title.localeCompare(b.title));
    return { ok: true, packs: mine };
  });

  /** Downloads, checks and installs one pack from the directory. */
  handleWrite('mods:install', () => null, async (event, { record }) => {
    const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    if (!gameDir) return { ok: false, error: 'No game folder found' };

    // Checked again here rather than trusted from the renderer, which is where
    // a record has been sitting in memory being drawn. Read as a record that
    // came from the index, because it did, so its download count is the counted
    // one rather than being reset on the way past.
    const checked = validateRecord(record, { fromIndex: true });
    if (!checked.ok) {
      return { ok: false, error: `That listing is not valid: ${checked.problems[0].message}` };
    }

    const jobId = `mod-${Date.now()}`;
    const job = startJob(jobId);
    try {
      const result = await installFromRecord(checked.record, gameDir, {
        signal: job.signal,
        // The shared cache, so a pack that was previewed, or installed once
        // before and since removed, is not fetched again. Offered rather than
        // assumed: installFromRecord checks it against the record's checksum
        // and downloads afresh if it does not match.
        cachedZip: cachedPackPath(checked.record.sha256),
        onStage: (name) => {
          if (!event.sender.isDestroyed()) event.sender.send('mods:progress', { stage: name });
        },
        onProgress: ({ percent }) => {
          if (!event.sender.isDestroyed()) event.sender.send('mods:progress', { percent });
        },
      });
      invalidatePack(result.dir);
      // Remembered so this pack cannot later be published under someone else's
      // name by mistake.
      noteOrigin(result.dir, checked.record);
      return result;
    } catch (err) {
      return { ok: false, error: err.message, cancelled: job.signal.aborted };
    } finally {
      endJob(jobId);
    }
  });

  /** Packages a pack into a single shareable zip. */
  ipcMain.handle('mods:share', async (event, { packDir, details }) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      const outDir = path.join(settings.outputDir || app.getPath('documents'), 'Shared packs');
      return await packForSharing(packDir, outDir, {
        ...(details || {}),
        // Shrinking a large pack is minutes of ffmpeg, and without this the
        // window sits silent long enough to look hung.
        onProgress: ({ file, stage, done, total }) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send('mods:progress', {
            stage: stage === 'video' ? 'Shrinking video'
              : stage === 'audio' ? 'Converting audio' : 'Packaging',
            file,
            percent: total ? Math.round((done / total) * 100) : null,
          });
        },
      });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

function registerIpc() {
  registerModsIpc();

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    ffmpeg: ffmpeg.status(),
    defaultGameDir: gamedata.defaultGameDir(),
    // Sent rather than repeated in the renderer, so the lists somebody picks
    // from are the lists the validator accepts. Two copies would disagree the
    // first time one is edited, and the disagreement would only show as a
    // submission being refused for an answer that was offered.
    contentFlags: CONTENT_FLAGS,
    licences: LICENCE_CHOICES,
    links: {
      releases: `https://github.com/${GITHUB_REPO}/releases`,
      game: 'https://yeahmaybe.itch.io/the-choicer-voicer',
      donate: DONATE_URL,
    },
  }));

  /**
   * The changelog, for the What's New tab.
   *
   * Read from the shipped CHANGELOG.md rather than kept as a second copy in the
   * interface, so there is one list to keep up to date and it cannot drift from
   * what the repository says. Packaged builds carry the file inside app.asar,
   * which reads like any other path.
   */
  ipcMain.handle('app:changelog', () => {
    const file = path.join(__dirname, '..', '..', 'CHANGELOG.md');
    try {
      return { ok: true, text: fs.readFileSync(file, 'utf8') };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * What the app knows about itself, for the bottom of a bug report.
   *
   * Deliberately narrow. Which version, which Windows, whether ffmpeg was
   * found: those are the three things that explain most reports and none of
   * them say anything about the person sending it. No folder paths, because a
   * Windows path carries an account name, and somebody reporting that export
   * is broken has not agreed to publish their own name on a public issue.
   */
  ipcMain.handle('app:diagnostics', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: `${process.platform} ${os.release()}`,
    arch: process.arch,
    ffmpeg: ffmpeg.status().ok ? 'found' : 'missing',
    gameFolder: settings.gameDir ? 'set' : 'not set',
  }));

  /**
   * Files a bug report on the app's own repository.
   *
   * Reporting used to mean leaving for a browser, finding the right repository
   * and writing the report a second time, which is enough steps that most of
   * what goes wrong never gets reported at all.
   *
   * GitHub has no way to open an issue without an account, so this asks for
   * the sign-in the app already knows how to do. Whoever will not sign in is
   * offered the browser instead, which is where they were going anyway.
   */
  ipcMain.handle('app:reportIssue', async (_e, { title, body, kind }) => {
    const token = loadToken();
    if (!token) return { ok: false, needsSignIn: true };

    const clean = String(title || '').trim().slice(0, 120);
    if (clean.length < 5) {
      return { ok: false, error: 'Give it a short title, so it can be told apart from others.' };
    }

    try {
      const issue = await github.request(`/repos/${GITHUB_REPO}/issues`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          title: clean,
          body: String(body || '').slice(0, 20000),
          // GitHub drops labels from anyone without push access to the
          // repository, which is everybody sending one of these, so the label
          // is an attempt rather than a guarantee. The body says which it is
          // as well, because that part always arrives. Both names are labels
          // the repository already has; inventing one would mean it applied
          // for the owner and vanished for everyone else.
          labels: [kind === 'idea' ? 'enhancement' : 'bug'],
        }),
      });
      return { ok: true, url: issue.html_url, number: issue.number };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('settings:get', () => settings);

  /**
   * Asks GitHub for the newest release so the app can tell you an update
   * exists. Nothing is downloaded or installed automatically; it just points
   * you at the releases page.
   */
  ipcMain.handle('app:checkUpdate', async () => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'choicer-voicer-content-manager' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, error: `GitHub returned ${res.status}` };

      const data = await res.json();
      const latest = String(data.tag_name || '').replace(/^v/, '');
      if (!latest) return { ok: false, error: 'No release found' };

      return {
        ok: true,
        latest,
        current: app.getVersion(),
        newer: compareVersions(latest, app.getVersion()) > 0,
        url: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
        notes: typeof data.body === 'string' ? data.body.slice(0, 2000) : '',
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('settings:set', (_e, next) => saveSettings(next || {}));

  ipcMain.handle('game:scan', async (_e, dir) => {
    const target = dir || settings.gameDir || gamedata.defaultGameDir();
    const model = gamedata.scanGame(target);
    if (model.gameDir !== settings.gameDir) saveSettings({ gameDir: model.gameDir });
    return decorate(model);
  });

  ipcMain.handle('game:pickFolder', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select your Choicer Voicer game folder',
      defaultPath: settings.gameDir || gamedata.defaultGameDir(),
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return null;

    // What was chosen and whether it worked. The app explains a bad choice in
    // its own setup panel rather than through an operating system box, which
    // arrives with the Windows alert chime attached.
    const resolved = gamedata.resolveGameDir(res.filePaths[0]);
    return { picked: res.filePaths[0], resolved: resolved || null };
  });

  /** Whether a folder looks like game data, without committing to it. */
  ipcMain.handle('game:check', (_e, dir) => {
    const resolved = dir ? gamedata.resolveGameDir(dir) : null;
    return { ok: Boolean(resolved), resolved: resolved || null };
  });

  ipcMain.handle('media:probe', (_e, files) => probeMany(files || []));

  /** Every pack of every type, with whatever is wrong with each one. */
  /**
   * Drops every cached pack and re-reads the library from scratch. This is
   * what the Rescan button is for: catching changes made outside the app,
   * which nothing else can know about.
   */
  ipcMain.handle('content:forget', () => {
    packCache.clear();
    // Rescan is the deliberate "read everything again", so this is the one place
    // every picture is expected to be fetched afresh.
    folderGenerations.clear();
    mediaGeneration = Date.now();
    return { ok: true };
  });

  ipcMain.handle('content:scan', async (_e, dir) => {
    const target = gamedata.resolveGameDir(dir || settings.gameDir || gamedata.defaultGameDir());
    if (!target) return { ok: false, error: 'No game folder found' };

    allowedRoots.add(path.resolve(target));
    // Follows whichever folder is actually being read, so pointing the app
    // somewhere else moves the watch with it.
    startWatching(target);

    const model = scanContent(target, {
      parseIni: gamedata.parseIni,
      parseIniSections: gamedata.parseIniSections,
      findAudioSibling: gamedata.findAudioSibling,
    }, packCache);

    // Icons and clip audio are served through the media protocol, so the
    // editor can show a picture and play a clip back.
    for (const type of model.types) {
      for (const pack of type.packs) {
        pack.iconUrl = pack.iconPath ? mediaUrl(pack.iconPath) : null;
        // So the editor can play the backing track back and hear what the
        // ducking actually did.
        pack.backingUrl = pack.backingPath ? mediaUrl(pack.backingPath) : null;
        // The game's own fallback picture for clips that have none.
        pack.fillerPath = pack.fillerImage ? path.join(pack.dir, pack.fillerImage) : null;
        pack.fillerUrl = pack.fillerPath ? mediaUrl(pack.fillerPath) : null;
        // findAudioSibling already hands back an absolute path.
        for (const clip of pack.clips || []) {
          clip.audioUrl = clip.audio ? mediaUrl(clip.audio) : null;
          // Some packs declare image=, others just name the picture after the
          // clip and let the game find it. Both have to work, or half the real
          // packs show no portrait. A clip in a child folder is looked up in
          // its own folder, which is also where its filler image lives.
          const clipDir = clip.folder ? path.join(pack.dir, clip.folder) : pack.dir;
          clip.imagePath = findClipImage(clipDir, clip) || clip.fillerImage || null;
          clip.imageUrl = clip.imagePath ? mediaUrl(clip.imagePath) : null;
        }
        // Deliberately not building a URL for every file here. Only the pack
        // being edited needs them, and doing it for all of them cost a stat per
        // file: 117,000 of them on a library of a thousand packs per type.
        // content:packFiles builds them for one pack, when it is opened.
        delete pack.fileNames;

        if (pack.slotFiles) {
          pack.slotUrls = Object.fromEntries(
            Object.entries(pack.slotFiles).map(([name, file]) => [name, mediaUrl(file)])
          );
        }
      }
    }
    // Clip lengths are NOT probed here. They are only needed to size blocks on
    // the timeline, which is one pack at a time, and probing every clip in the
    // library meant one ffprobe per clip: twenty thousand of them on a large
    // library, which took minutes. content:clipDurations does the pack being
    // opened instead.
    return { ok: true, ...model };
  });

  /**
   * Clip lengths for one pack, so its timeline can size the blocks.
   *
   * Split out from the scan because it is the expensive part and only ever
   * wanted for the pack on screen.
   */
  ipcMain.handle('content:clipDurations', async (_e, packDir) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      const files = fs.readdirSync(packDir)
        .filter((f) => AUDIO_EXTS_MAIN.includes(path.extname(f).toLowerCase()))
        .map((f) => path.join(packDir, f));
      if (!files.length) return { ok: true, durations: {} };
      return { ok: true, durations: await probeMany(files) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Every file in one pack, with a URL for each. Only the editor needs these,
   * and only for the pack it has open.
   */
  ipcMain.handle('content:packFiles', (_e, packDir) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      const fileNames = fs.readdirSync(packDir, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name);
      const fileUrls = Object.fromEntries(
        fileNames.map((name) => [name, mediaUrl(path.join(packDir, name))])
      );
      return { ok: true, fileNames, fileUrls };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Chromium can't decode the packs' Theora video, so previews play a cached
  // MP4 transcode instead. Exports still read the original .ogv.
  //
  // Clicking through packs quickly can ask for the same proxy more than once
  // before the first transcode finishes, so in-flight builds are shared rather
  // than starting a second ffmpeg over the same file.
  const proxiesInFlight = new Map();

  ipcMain.handle('media:proxy', async (event, videoPath, options = {}) => {
    const cacheDir = path.join(app.getPath('userData'), 'preview-cache');
    allowedRoots.add(path.resolve(cacheDir));

    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send('proxy:progress', payload);
    };

    try {
      // A rebuild must not join an in-flight build of the copy being replaced.
      const key = options.rebuild ? `${videoPath}::rebuild` : videoPath;
      let entry = proxiesInFlight.get(key);
      if (!entry) {
        entry = { controller: new AbortController(), promise: null };
        proxiesInFlight.set(key, entry);
        entry.promise = ensureProxy(videoPath, cacheDir, {
          rebuild: Boolean(options.rebuild),
          signal: entry.controller.signal,
          onProgress: ({ percent }) => send({ videoPath, percent }),
        }).finally(() => {
          // Only clear our own entry; a cancel may already have replaced it.
          if (proxiesInFlight.get(key) === entry) proxiesInFlight.delete(key);
        });
      }

      const result = await entry.promise;
      return { ok: true, url: mediaUrl(result.path), cached: result.cached };
    } catch (err) {
      return { ok: false, error: err.message, cancelled: Boolean(err.cancelled) };
    }
  });

  // Clicking away from a pack stops its transcode, so rattling through the
  // list doesn't leave several ffmpeg processes fighting for the CPU.
  ipcMain.handle('media:cancelProxy', (_e, videoPath) => {
    let cancelled = 0;
    for (const key of [videoPath, `${videoPath}::rebuild`]) {
      const entry = proxiesInFlight.get(key);
      if (!entry) continue;
      // Drop it now rather than waiting for ffmpeg to die, so a request that
      // arrives moments later starts a fresh build instead of awaiting this
      // doomed one and being told its preview was cancelled.
      proxiesInFlight.delete(key);
      entry.controller.abort();
      cancelled++;
    }
    return cancelled > 0;
  });

  ipcMain.handle('content:create', (_e, { type, options }) => {
    try {
      const target = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
      if (!target) return { ok: false, error: 'No game folder found' };
      return { ok: true, ...createPack(target, type, options || {}) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /** Copies or converts dropped files into a pack folder. */
  handleWrite('content:import', (p) => p.destDir, async (event, { destDir, files, options }) => {
    if (!isAllowed(destDir)) return { ok: false, error: 'That folder is outside the game folder' };

    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send('import:progress', payload);
    };

    try {
      const results = await convert.convertMany(files || [], destDir, {
        ...(options || {}),
        // Percent comes from ffmpeg; a long video needs more than "1 of 1".
        onProgress: ({ percent }) => send({ destDir, percent }),
        onFile: (result, done, total) =>
          send({ destDir, done, total, name: path.basename(result.source) }),
      });
      return { ok: true, results };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /** Installs a pack folder someone dropped in, working out its type. */
  ipcMain.handle('content:install', (_e, dirs) => {
    const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    if (!gameDir) return { ok: false, error: 'No game folder found' };

    const installed = [];
    const rejected = [];
    for (const dir of dirs || []) {
      try {
        const done = installPack(gameDir, dir);
        installed.push(done);
        // A folder dragged in came from somewhere else by definition — the
        // person doing it did not make it here. Marked so it cannot later be
        // published as their own work; packaging it as a zip still works.
        noteOrigin(done.dir, { author: '', id: '', title: path.basename(dir), dropped: true });
      } catch (err) {
        rejected.push({ dir, error: err.message });
      }
    }
    return { ok: true, installed, rejected };
  });

  ipcMain.handle('content:delete', async (_e, packDir) => {
    const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    if (!gameDir) return { ok: false, error: 'No game folder found' };

    // Confirmed in the app before this is reached. deletePack still refuses
    // anything outside the game folder, so a mistaken call cannot do damage.
    try {
      return { ok: true, ...deletePack(gameDir, packDir) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /** Cuts a clip out of a pack's video and writes its metadata alongside. */
  handleWrite('content:extractClip', (p) => p.destDir, async (_e, { source, destDir, baseName, start, duration, meta, overwrite }) => {
    if (!isAllowed(destDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      // Retiming an existing clip replaces it; a new clip gets its own name.
      const clip = await convert.extractAudioRange(source, destDir, baseName, start, duration, {
        overwrite: Boolean(overwrite),
      });
      const base = path.basename(clip.path, path.extname(clip.path));
      const metaFile = writeClipMeta(destDir, base, { ...(meta || {}), timestamp: start });
      return { ok: true, path: clip.path, base, metaFile };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Deleting a clip is undoable: its files are moved aside rather than removed.
  /** The recorded sessions of a pack, so deleting it can offer to take them too. */
  ipcMain.handle('content:packSessions', (_e, packDir) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };
    const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    if (!gameDir) return { ok: true, sessions: [] };
    return { ok: true, sessions: packSessions(gameDir, path.basename(packDir)) };
  });

  /** Sessions whose pack is gone, which nothing else would ever show. */
  ipcMain.handle('content:orphanSessions', () => {
    const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    if (!gameDir) return { ok: true, orphans: [] };
    return { ok: true, orphans: orphanSessions(gameDir) };
  });

  ipcMain.handle('content:deleteSession', (_e, { packName, sessionName }) => {
    const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    if (!gameDir) return { ok: false, error: 'No game folder found' };
    return deleteSession(gameDir, packName, sessionName);
  });

  ipcMain.handle('content:deleteSessions', (_e, packName) => {
    const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
    if (!gameDir) return { ok: false, error: 'No game folder found' };
    // Only ever a folder directly under the recordings root, never a path.
    if (!packName || /[\\/]/.test(packName)) return { ok: false, error: 'Not a pack name' };
    return { ok: true, ...deleteSessions(gameDir, packName) };
  });

  /** The takes recorded against a clip, so deleting it can offer to take them too. */
  ipcMain.handle('content:clipRecordings', (_e, { packDir, base }) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      const gameDir = gamedata.resolveGameDir(settings.gameDir || gamedata.defaultGameDir());
      if (!gameDir) return { ok: true, takes: [] };
      return { ok: true, takes: clipRecordings(gameDir, path.basename(packDir), base) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  handleWrite('content:trashClip', (p) => p.packDir, (_e, { packDir, base, takes }) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      const trashRoot = path.join(app.getPath('userData'), 'deleted-clips');
      // Recordings live outside the pack, so they are checked against the game
      // folder in their own right rather than riding in on the pack's check.
      const safe = (takes || []).filter((t) => t && t.path && isAllowed(t.path));
      return { ok: true, ...trashClip(packDir, base, trashRoot, safe) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  handleWrite('content:restoreClip', (p) => (p.moved || []).map((m) => dirOfFile(m.from)), (_e, { moved }) => {
    try {
      for (const entry of moved || []) {
        if (!isAllowed(entry.from)) return { ok: false, error: 'That folder is outside the game folder' };
      }
      return { ok: true, ...restoreClip(moved || []) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  handleWrite('content:writeClipMeta', (p) => p.destDir, (_e, { destDir, base, meta }) => {
    if (!isAllowed(destDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      return { ok: true, file: writeClipMeta(destDir, base, meta || {}) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Saves audio recorded in the app. MediaRecorder gives us WebM/Opus, which
   * the game cannot read, so it is converted on the way in.
   */
  handleWrite('content:saveRecording', (p) => p.destDir, async (_e, { destDir, base, bytes, audioFormat, maxSeconds }) => {
    if (!isAllowed(destDir)) return { ok: false, error: 'That folder is outside the game folder' };

    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cvrec-'));
    const raw = path.join(scratch, 'take.webm');
    try {
      fs.writeFileSync(raw, Buffer.from(bytes));
      const result = await convert.convertInto(raw, destDir, base, {
        kind: 'audio',
        audioFormat: audioFormat || 'wav',
        maxSeconds: maxSeconds || null,
        // Recording over a slot replaces its sound, which is what the app asks
        // about before it starts. Without this the take was written alongside as
        // <slot>_2, the config was pointed at the new name, and the sound that
        // was supposedly replaced stayed in the pack.
        overwrite: true,
      });
      return { ok: true, path: result.path, base: path.basename(result.path, path.extname(result.path)) };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  /**
   * Merges a patch into a pack's JSON config. Read-modify-write rather than
   * overwrite, so editing one contestant slot cannot wipe the other eight.
   */
  handleWrite('content:writeConfig', (p) => p.dir, (_e, { dir, file, patch }) => {
    if (!isAllowed(dir)) return { ok: false, error: 'That folder is outside the game folder' };

    const target = path.join(dir, file);
    let current = {};
    try {
      if (fs.existsSync(target)) current = JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (err) {
      return { ok: false, error: `Existing ${file} is not valid JSON: ${err.message}` };
    }

    try {
      const merged = deepMerge(current, patch || {});
      fs.writeFileSync(target, JSON.stringify(merged, null, '\t'), 'utf8');
      return { ok: true, config: merged };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Merges fields into a pack's _pack_info.ini. Godot ini, not JSON, so it goes
   * through the same writer that creates packs in the first place.
   */
  handleWrite('content:writePackInfo', (p) => p.dir, (_e, { dir, patch }) => {
    if (!isAllowed(dir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      const existing = fs.readdirSync(dir)
        .find((f) => /^_pack_info\.(ini|txt)$/i.test(f)) || '_pack_info.ini';
      const target = path.join(dir, existing);

      const current = fs.existsSync(target) ? gamedata.parseIni(target) : {};
      const merged = { ...current, ...(patch || {}) };
      writeIni(target, merged);
      return { ok: true, info: merged, file: target };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /** Writes a multi-section ini, which is what a chatter config is. */
  handleWrite('content:writeIniSections', (p) => p.dir, (_e, { dir, file, sections }) => {
    if (!isAllowed(dir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      const existing = fs.readdirSync(dir)
        .find((f) => f.toLowerCase() === file.toLowerCase()
          || f.toLowerCase() === file.replace(/\.ini$/i, '.cfg').toLowerCase());
      writeIniSections(path.join(dir, existing || file), sections || {});
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /**
   * Builds a backing track by ducking the video's own audio under every line.
   * See convert.buildBackingTrack for why this is done from the clip times
   * rather than by trying to separate the voice out.
   */
  /**
   * A few seconds of what the backing track would sound like.
   *
   * Building the real thing is minutes of ffmpeg over the whole video, which
   * is far too long to spend finding out that a setting was wrong. This cuts
   * the same treatment over one line and hands back something playable in a
   * second or two, so the setting can be chosen by ear rather than by
   * building, listening, and building again.
   *
   * Written outside the pack, because a half-judged sample is not something
   * the game folder should ever contain.
   */
  ipcMain.handle('content:previewBacking', async (_e, { videoPath, ranges, mode, strength, at }) => {
    if (!videoPath || !fs.existsSync(videoPath)) {
      return { ok: false, error: 'This pack has no video to work from.' };
    }

    const root = path.join(app.getPath('userData'), 'backing-preview');
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    allowedRoots.add(path.resolve(root));

    // Long enough to hear the line and a moment of the scene on either side of
    // it, which is the comparison being made.
    const lead = 1.2;
    const from = Math.max(0, (Number(at) || 0) - lead);
    const seconds = 6;

    try {
      const built = await convert.buildBackingTrack(videoPath, ranges || [], root, {
        mode: mode === 'silence' ? 'silence' : 'muffle',
        strength: Number.isFinite(strength) ? strength : 0.5,
        baseName: `sample-${Date.now()}`,
        audioFormat: 'wav',
        sampleFrom: from,
        sampleFor: seconds,
      });
      return {
        ok: true,
        url: mediaUrl(built.path),
        technique: built.technique,
        spread: built.spread,
        from,
        seconds,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  handleWrite('content:buildBacking', (p) => p.packDir, async (event, { packDir, videoPath, ranges, level, mode, strength, jobId }) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };

    // Which of muffle or silence was chosen is decided in the app, where the
    // difference can be explained properly.
    const job = startJob(jobId);
    try {
      const result = await convert.buildBackingTrack(videoPath, ranges || [], packDir, {
        mode: mode === 'silence' ? 'silence' : 'muffle',
        level: Number.isFinite(level) ? level : null,
        strength: Number.isFinite(strength) ? strength : 0.5,
        signal: job.signal,
        onProgress: ({ percent }) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('import:progress', { dir: packDir, phase: 'backing', percent, jobId });
          }
        },
      });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message, cancelled: Boolean(err.cancelled) };
    } finally {
      endJob(jobId);
    }
  });

  /** Trims a pack's video, keeping the original so the trim can be undone. */
  handleWrite('content:trimVideo', (p) => p.packDir, async (event, { packDir, videoPath, start, end, jobId }) => {
    if (!isAllowed(packDir) || !isAllowed(videoPath)) {
      return { ok: false, error: 'That folder is outside the game folder' };
    }
    const job = startJob(jobId);
    try {
      const bin = path.join(app.getPath('userData'), 'deleted-clips', `${Date.now()}_trim`);
      const backup = path.join(bin, path.basename(videoPath));

      const result = await convert.trimVideo(videoPath, start, end, backup, {
        signal: job.signal,
        onProgress: ({ percent }) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('import:progress', { dir: packDir, phase: 'trim', percent, jobId });
          }
        },
      });

      // Shaped like trashClip's result so restoreClip can undo it unchanged.
      return { ok: true, ...result, moved: [{ from: videoPath, to: backup }] };
    } catch (err) {
      return { ok: false, error: err.message, cancelled: Boolean(err.cancelled) };
    } finally {
      endJob(jobId);
    }
  });

  /**
   * Calls off a job the editor started.
   *
   * Needed because leaving the editor used to abandon its ffmpeg rather than
   * stop it. The orphan carried on reporting progress at an overlay that had
   * been torn down, and still renamed its output over the pack's video at the
   * end, so a trim nobody was waiting for any more could land on top of a later
   * one.
   */
  ipcMain.handle('content:cancelJob', (_e, jobId) => ({ ok: cancelJob(jobId) }));

  /**
   * Opens a link in the real browser, after asking. The app is offline apart
   * from its update check, so leaving it should never be a surprise.
   */
  ipcMain.handle('shell:openExternalConfirmed', async (_e, { url }) => {
    // Asked in the app first, but asking is not checking. The dialog in front
    // of this one shows a host and gets a yes; it does not decide whether the
    // address is one this app should be handing to the operating system.
    const safe = safeExternalUrl(url);
    if (!safe) return { ok: false, error: 'that address cannot be opened' };
    await shell.openExternal(safe);
    return { ok: true };
  });

  /** Stores a frame grabbed from the video as a clip's picture. */
  /**
   * Cuts one frame out of a video and saves it as a clip's picture.
   *
   * Done here rather than by drawing the video onto a canvas in the renderer.
   * The video is served over cvmedia://, which is a different origin from the
   * page, so the canvas is tainted and its pixels cannot be read back. The
   * obvious fix, asking the video for cross-origin access, is worse than the
   * problem: Chromium refuses cross-origin requests to custom schemes outright
   * and the video stops loading at all.
   *
   * ffmpeg has the file on disk and no such rules, and it is already sizing
   * character pictures elsewhere, so the result matches what the rest of the
   * app produces.
   */
  handleWrite('content:grabFrame', (p) => p.destDir, async (_e, { videoPath, time, destDir, base }) => {
    if (!isAllowed(videoPath) || !isAllowed(destDir)) {
      return { ok: false, error: 'That file is outside the game folder' };
    }
    const target = path.join(destDir, `${base}.png`);
    try {
      await ffmpeg.runFfmpeg([
        // Seeking before the input is the fast form, and frame-accurate enough
        // for a still somebody is choosing by eye.
        '-ss', String(Math.max(0, Number(time) || 0)),
        '-i', videoPath,
        '-frames:v', '1',
        '-vf', 'scale=500:1000:force_original_aspect_ratio=decrease',
        '-f', 'image2', '-c:v', 'png',
        '-y', target,
      ]);
      if (!fs.existsSync(target)) throw new Error('ffmpeg produced nothing');
      bumpMedia(destDir);
      return { ok: true, file: target, url: mediaUrl(target) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  handleWrite('content:saveImage', (p) => p.destDir, (_e, { destDir, base, dataUrl }) => {
    if (!isAllowed(destDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      return { ok: true, file: saveImage(destDir, base, dataUrl) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  /** What a file is and whether it needs converting, before committing to it. */
  ipcMain.handle('content:describe', (_e, files) =>
    (files || []).map((f) => ({ path: f, ...convert.describe(f) })));

  ipcMain.handle('dialog:pickFiles', async (_e, { title, kind }) => {
    const filters = kind === 'video'
      ? [{ name: 'Video', extensions: ['ogv', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'] }]
      : kind === 'audio'
        ? [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac', 'opus'] }]
        : kind === 'image'
          ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }]
          : [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'wav', 'mp3', 'ogg', 'm4a', 'ogv', 'mp4', 'mov', 'webm'] }];

    const res = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Choose files',
      properties: ['openFile', 'multiSelections'],
      filters,
    });
    return res.canceled ? [] : res.filePaths;
  });

  ipcMain.handle('dialog:pickOutput', async (_e, { defaultPath, format }) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export dub as…',
      defaultPath,
      filters: [
        { name: 'MP4 video', extensions: ['mp4'] },
        { name: 'Matroska video', extensions: ['mkv'] },
        { name: 'WebM video', extensions: ['webm'] },
        { name: 'QuickTime video', extensions: ['mov'] },
      ].sort((a) => (a.extensions[0] === format ? -1 : 1)),
    });
    return res.canceled ? null : res.filePath;
  });

  ipcMain.handle('dialog:pickDirectory', async (_e, defaultPath) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose export folder',
      defaultPath: defaultPath || settings.outputDir,
      properties: ['openDirectory', 'createDirectory'],
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
  });

  ipcMain.handle('dialog:pickBinary', async (_e, which) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: `Locate ${which}`,
      properties: ['openFile'],
      filters: process.platform === 'win32'
        ? [{ name: 'Executables', extensions: ['exe'] }]
        : [{ name: 'All files', extensions: ['*'] }],
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
  });

  ipcMain.handle('export:run', async (event, job) => {
    const id = nextJobId++;
    const controller = new AbortController();
    exportJobs.set(id, controller);

    const send = (channel, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, { id, ...payload });
    };

    send('export:started', { outputPath: job.outputPath });

    try {
      const result = await runExport(job, {
        signal: controller.signal,
        onProgress: (p) => send('export:progress', p),
      });
      send('export:done', result);
      return { ok: true, ...result };
    } catch (err) {
      send('export:failed', { message: err.message, cancelled: Boolean(err.cancelled) });
      return { ok: false, error: err.message, cancelled: Boolean(err.cancelled) };
    } finally {
      exportJobs.delete(id);
    }
  });

  // Finds a filename that collides with neither what's on disk nor what the
  // renderer already has queued.
  ipcMain.handle('export:resolvePath', (_e, target, reserved = []) => {
    const taken = new Set(reserved.map((p) => String(p).toLowerCase()));
    const clashes = (p) => taken.has(p.toLowerCase()) || fs.existsSync(p);
    if (!clashes(target)) return target;

    const dot = path.basename(target).lastIndexOf('.');
    const ext = dot > 0 ? target.slice(target.length - (path.basename(target).length - dot)) : '';
    const stem = ext ? target.slice(0, target.length - ext.length) : target;

    for (let n = 2; n < 1000; n++) {
      const candidate = `${stem}_${n}${ext}`;
      if (!clashes(candidate)) return candidate;
    }
    return target;
  });

  ipcMain.handle('export:cancel', (_e, id) => {
    const controller = exportJobs.get(id);
    if (controller) controller.abort();
    return Boolean(controller);
  });

  ipcMain.handle('export:cancelAll', () => {
    for (const controller of exportJobs.values()) controller.abort();
    return true;
  });

  ipcMain.handle('shell:reveal', (_e, target) => {
    if (target && fs.existsSync(target)) shell.showItemInFolder(target);
  });

  /**
   * Opens a pack folder in the file manager.
   *
   * Only ever a folder, and only one inside the game folder. This used to open
   * whatever path it was handed, which on Windows means handing a file to
   * whichever program claims its extension, and handing an executable to the
   * executable. Every caller passes a directory, so nothing is lost by refusing
   * anything else, and a mistake here can no longer start a program.
   */
  ipcMain.handle('shell:openPath', async (_e, target) => {
    if (!target || !fs.existsSync(target)) return 'not found';
    if (!isOpenableFolder(target)) return 'that folder is outside the game and exports folders';
    try {
      if (!fs.statSync(target).isDirectory()) return 'not a folder';
    } catch {
      return 'not found';
    }
    return shell.openPath(target);
  });

  ipcMain.handle('shell:openExternal', (_e, url) => {
    const safe = safeExternalUrl(url);
    if (safe) shell.openExternal(safe);
  });
}

// Lifecycle

if (!app.requestSingleInstanceLock()) {
  // A silent exit 0 is right for a real second launch, but in a smoke run it
  // is indistinguishable from a clean pass. A leftover instance from an
  // interrupted run would quietly turn every later run green.
  if (SMOKE) {
    console.log('SMOKE_CRASH another instance is already running, so this run did nothing');
    app.exit(1);
  }
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    loadSettings();
    loadDurationCache();
    registerMediaProtocol();
    github.configure({ clientId: GITHUB_CLIENT_ID, directoryRepo: DIRECTORY_REPO });
    registerIpc();

    // The undo bin holds whole videos, so a few trims of a long one is all it
    // takes to reach hundreds of megabytes. Nothing was ever removing them.
    try {
      const trash = pruneTrash(path.join(app.getPath('userData'), 'deleted-clips'));
      if (trash.removed) {
        console.log(`Cleared ${trash.removed} old item(s) from the undo bin, `
          + `${(trash.freed / 1e6).toFixed(0)} MB.`);
      }
    } catch { /* nothing there yet */ }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    for (const controller of exportJobs.values()) controller.abort();
    stopWatching();
    saveDurationCache();
    // A pack left open for review must not outlive the app. Closing the window
    // is the one exit path that always happens, whether a review was finished,
    // abandoned, or interrupted.
    if (process.platform !== 'darwin') app.quit();
  });
}
