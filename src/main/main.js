'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeTheme } = require('electron');
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
  writeIniSections,
} = require('./create');
const convert = require('./convert');

const execFileAsync = promisify(execFile);

const APP_NAME = 'Choicer Voicer Content Manager';

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
  // Anything already on screen from this pack may now be out of date.
  mediaGeneration = Date.now();
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
      for (const dir of dirs) invalidatePack(dir);
    } catch { /* nothing to forget */ }
    return result;
  });
}

/** The folder a file sits in, for writes that name a file rather than a pack. */
const dirOfFile = (file) => (file ? path.dirname(file) : null);

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
const DISCORD_URL = 'https://discord.com/users/jojozagjos';

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

/** A URL the renderer can load a pack file through. */
function mediaUrl(filePath) {
  const encoded = Buffer.from(filePath, 'utf8').toString('base64url');
  // The protocol handler strips the query before decoding the path, so this
  // only ever affects caching.
  return `${MEDIA_SCHEME}://file/${encoded}?v=${mediaGeneration}`;
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

function registerMediaProtocol() {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    let filePath;
    try {
      filePath = pathFromMediaUrl(request.url);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    if (!isAllowed(filePath)) return new Response('Forbidden', { status: 403 });

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
  return dark ? '#0c1520' : '#d9edfb';
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
  const devIcon = path.join(__dirname, '..', '..', 'assets', 'icon.png');

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
      sandbox: false,
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
    const levels = ['debug', 'info', 'warn', 'error'];
    mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
      const tag = levels[level] || 'log';
      console.log(`[renderer:${tag}] ${message}${source ? ` (${path.basename(source)}:${line})` : ''}`);
    });
  }

  // External links belong in the real browser, not in the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
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
  await win.webContents.executeJavaScript(`
    const s = document.getElementById('splash');
    if (s) s.hidden = true;
    const setup = document.getElementById('setup-dialog');
    if (setup && setup.open) setup.close();
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
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message);
    else if (level === 2) warnings.push(message);
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
        footIsSunken: getComputedStyle(document.querySelector('#export-dialog .dialog-foot')).backgroundColor,
        discordButtonGone: !document.getElementById('btn-discord'),
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

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    ffmpeg: ffmpeg.status(),
    defaultGameDir: gamedata.defaultGameDir(),
    links: {
      discord: DISCORD_URL,
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
    mediaGeneration = Date.now();
    return { ok: true };
  });

  ipcMain.handle('content:scan', async (_e, dir) => {
    const target = gamedata.resolveGameDir(dir || settings.gameDir || gamedata.defaultGameDir());
    if (!target) return { ok: false, error: 'No game folder found' };

    allowedRoots.add(path.resolve(target));
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
        installed.push(installPack(gameDir, dir));
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
  handleWrite('content:trashClip', (p) => p.packDir, (_e, { packDir, base }) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };
    try {
      const trashRoot = path.join(app.getPath('userData'), 'deleted-clips');
      return { ok: true, ...trashClip(packDir, base, trashRoot) };
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
  handleWrite('content:buildBacking', (p) => p.packDir, async (event, { packDir, videoPath, ranges, level, mode, jobId }) => {
    if (!isAllowed(packDir)) return { ok: false, error: 'That folder is outside the game folder' };

    // Which of muffle or silence was chosen is decided in the app, where the
    // difference can be explained properly.
    const job = startJob(jobId);
    try {
      const result = await convert.buildBackingTrack(videoPath, ranges || [], packDir, {
        mode: mode === 'silence' ? 'silence' : 'muffle',
        level: Number.isFinite(level) ? level : null,
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
    // Asked in the app first; this only carries it out.
    await shell.openExternal(url);
    return { ok: true };
  });

  /** Stores a frame grabbed from the video as a clip's picture. */
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
    if (!isAllowed(target)) return 'that folder is outside the game folder';
    try {
      if (!fs.statSync(target).isDirectory()) return 'not a folder';
    } catch {
      return 'not found';
    }
    return shell.openPath(target);
  });

  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
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
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    for (const controller of exportJobs.values()) controller.abort();
    saveDurationCache();
    if (process.platform !== 'darwin') app.quit();
  });
}
