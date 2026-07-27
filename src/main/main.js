'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeTheme } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { execFile } = require('child_process');
const { promisify } = require('util');

const gamedata = require('./gamedata');
const ffmpeg = require('./ffmpeg');
const { runExport } = require('./exporter');
const { ensureProxy } = require('./proxy');
const { scanContent } = require('./content');
const { createPack } = require('./create');
const convert = require('./convert');

const execFileAsync = promisify(execFile);

const MEDIA_SCHEME = 'cvmedia';

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
function mediaUrl(filePath) {
  return `${MEDIA_SCHEME}://file/${Buffer.from(filePath, 'utf8').toString('base64url')}`;
}

function pathFromMediaUrl(url) {
  const raw = url.slice(`${MEDIA_SCHEME}://file/`.length).split(/[?#]/)[0];
  return path.normalize(Buffer.from(raw, 'base64url').toString('utf8'));
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
    pack.videoUrl = mediaUrl(pack.videoPath);
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

// CVE_SMOKE=1 boots the whole app windowless, reports whether the renderer
// came up clean, and exits. Used to verify changes without stealing focus.
const SMOKE = process.env.CVE_SMOKE === '1';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1060,
    minHeight: 680,
    backgroundColor: startupBackground(),
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
  mainWindow.once('ready-to-show', () => { if (!SMOKE) mainWindow.show(); });

  if (SMOKE) runSmokeTest(mainWindow);

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
function runSmokeTest(win) {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
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
    try {
      report = await win.webContents.executeJavaScript(`(() => ({
        theme: document.documentElement.dataset.theme,
        splashVisible: !document.getElementById('splash').hidden,
        packs: document.querySelectorAll('.pack-card').length,
        credit: document.querySelector('.credit span')?.textContent ?? null,
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
          setupShown: !$('#home-setup').hidden,
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

        // Pick "Contestant", which has extra fields worth exercising.
        const buttons = [...document.querySelectorAll('.create-type')];
        const contestant = buttons.find((b) => b.textContent.includes('Contestant'));
        contestant.click();
        await new Promise((r) => setTimeout(r, 150));

        const fields = document.querySelectorAll('#create-extra [data-field]').length;
        $('#create-name').value = 'Smoke Test Contestant';
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
          madeIt: tiles.some((t) => t.includes('Smoke Test Contestant')),
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
          if (name.startsWith('Smoke Test Contestant')) {
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

        // Switch packs, then look straight away.
        cards[1].click();
        await new Promise((r) => setTimeout(r, 60));
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

    console.log('SMOKE ' + JSON.stringify(
      { report, videoCheck, homeCheck, contentCheck, createCheck, sessionCheck, staleCheck,
        packCheck, queueCheck, errors },
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

    const resolved = gamedata.resolveGameDir(res.filePaths[0]);
    if (!resolved) {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        message: 'That folder does not look like Choicer Voicer game data.',
        detail: 'Pick the folder that contains "packs_voice", usually '
          + `${gamedata.defaultGameDir()}`,
      });
      return null;
    }
    return resolved;
  });

  ipcMain.handle('media:probe', (_e, files) => probeMany(files || []));

  /** Every pack of every type, with whatever is wrong with each one. */
  ipcMain.handle('content:scan', (_e, dir) => {
    const target = gamedata.resolveGameDir(dir || settings.gameDir || gamedata.defaultGameDir());
    if (!target) return { ok: false, error: 'No game folder found' };

    allowedRoots.add(path.resolve(target));
    const model = scanContent(target, {
      parseIni: gamedata.parseIni,
      parseIniSections: gamedata.parseIniSections,
      findAudioSibling: gamedata.findAudioSibling,
    });

    // Icons are served through the media protocol like everything else.
    for (const type of model.types) {
      for (const pack of type.packs) {
        pack.iconUrl = pack.iconPath ? mediaUrl(pack.iconPath) : null;
      }
    }
    return { ok: true, ...model };
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
  ipcMain.handle('content:import', async (event, { destDir, files, options }) => {
    if (!isAllowed(destDir)) return { ok: false, error: 'That folder is outside the game folder' };

    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send('import:progress', payload);
    };

    try {
      const results = await convert.convertMany(files || [], destDir, {
        ...(options || {}),
        onFile: (result, done, total) => send({ done, total, name: path.basename(result.source) }),
      });
      return { ok: true, results };
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

  ipcMain.handle('shell:openPath', async (_e, target) => {
    if (target && fs.existsSync(target)) return shell.openPath(target);
    return 'not found';
  });

  ipcMain.handle('shell:openExternal', (_e, url) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
}

// Lifecycle

if (!app.requestSingleInstanceLock()) {
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
