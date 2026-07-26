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

const execFileAsync = promisify(execFile);

const MEDIA_SCHEME = 'cvmedia';

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
  settings = {
    ...settings,
    ...next,
    exportOptions: { ...settings.exportOptions, ...(next.exportOptions || {}) },
  };
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
    title: 'Choicer Voicer Export',
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
        ffmpeg: document.getElementById('ffmpeg-pill').textContent,
        gameDir: document.getElementById('game-dir').textContent,
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

    console.log('SMOKE ' + JSON.stringify({ report, videoCheck, errors }, null, 2));
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
  }));

  ipcMain.handle('settings:get', () => settings);
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

  // Chromium can't decode the packs' Theora video, so previews play a cached
  // MP4 transcode instead. Exports still read the original .ogv.
  ipcMain.handle('media:proxy', async (event, videoPath) => {
    const cacheDir = path.join(app.getPath('userData'), 'preview-cache');
    allowedRoots.add(path.resolve(cacheDir));

    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send('proxy:progress', payload);
    };

    try {
      const result = await ensureProxy(videoPath, cacheDir, {
        onProgress: ({ percent }) => send({ videoPath, percent }),
      });
      return { ok: true, url: mediaUrl(result.path), cached: result.cached };
    } catch (err) {
      return { ok: false, error: err.message };
    }
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
