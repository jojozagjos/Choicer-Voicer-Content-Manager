'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** Fans an export event out to subscribers, keyed by channel. */
function makeEmitter(channels) {
  const listeners = new Map(channels.map((c) => [c, new Set()]));

  for (const channel of channels) {
    ipcRenderer.on(channel, (_e, payload) => {
      for (const fn of listeners.get(channel)) {
        try { fn(payload); } catch (err) { console.error(err); }
      }
    });
  }

  return (channel, fn) => {
    const set = listeners.get(channel);
    if (!set) throw new Error(`Unknown channel: ${channel}`);
    set.add(fn);
    return () => set.delete(fn);
  };
}

const on = makeEmitter([
  'export:started',
  'export:progress',
  'export:done',
  'export:failed',
  'proxy:progress',
  'import:progress',
  'content:changedOnDisk',
  'mods:progress',
  'mods:deviceCode',
  'mods:publishProgress',
  'review:progress',
]);

contextBridge.exposeInMainWorld('api', {
  appInfo: () => ipcRenderer.invoke('app:info'),

  // Electron removed File.path, so a dropped file's real location has to come
  // from webUtils in the preload.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return null; }
  },

  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  changelog: () => ipcRenderer.invoke('app:changelog'),

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (next) => ipcRenderer.invoke('settings:set', next),
  },

  game: {
    scan: (dir) => ipcRenderer.invoke('game:scan', dir),
    pickFolder: () => ipcRenderer.invoke('game:pickFolder'),
    check: (dir) => ipcRenderer.invoke('game:check', dir),
  },

  content: {
    scan: (dir) => ipcRenderer.invoke('content:scan', dir),
    create: (type, options) => ipcRenderer.invoke('content:create', { type, options }),
    remove: (packDir) => ipcRenderer.invoke('content:delete', packDir),
    install: (dirs) => ipcRenderer.invoke('content:install', dirs),
    extractClip: (payload) => ipcRenderer.invoke('content:extractClip', payload),
    writeClipMeta: (payload) => ipcRenderer.invoke('content:writeClipMeta', payload),
    trashClip: (payload) => ipcRenderer.invoke('content:trashClip', payload),
    clipRecordings: (payload) => ipcRenderer.invoke('content:clipRecordings', payload),
    packSessions: (packDir) => ipcRenderer.invoke('content:packSessions', packDir),
    orphanSessions: () => ipcRenderer.invoke('content:orphanSessions'),
    deleteSessions: (packName) => ipcRenderer.invoke('content:deleteSessions', packName),
    deleteSession: (payload) => ipcRenderer.invoke('content:deleteSession', payload),
    restoreClip: (payload) => ipcRenderer.invoke('content:restoreClip', payload),
    saveImage: (payload) => ipcRenderer.invoke('content:saveImage', payload),
    // Frames are cut by ffmpeg, not by a canvas: the video is a different
    // origin from the page and a canvas holding it cannot be read back.
    grabFrame: (payload) => ipcRenderer.invoke('content:grabFrame', payload),
    writePackInfo: (payload) => ipcRenderer.invoke('content:writePackInfo', payload),
    writeIniSections: (payload) => ipcRenderer.invoke('content:writeIniSections', payload),
    // Both are per pack and only fetched when one is opened, because doing
    // them for the whole library does not scale.
    forget: () => ipcRenderer.invoke('content:forget'),
    clipDurations: (packDir) => ipcRenderer.invoke('content:clipDurations', packDir),
    packFiles: (packDir) => ipcRenderer.invoke('content:packFiles', packDir),
    buildBacking: (payload) => ipcRenderer.invoke('content:buildBacking', payload),
    trimVideo: (payload) => ipcRenderer.invoke('content:trimVideo', payload),
    // Stops a trim or a backing track build that nothing is waiting for.
    cancelJob: (jobId) => ipcRenderer.invoke('content:cancelJob', jobId),
    saveRecording: (payload) => ipcRenderer.invoke('content:saveRecording', payload),
    writeConfig: (payload) => ipcRenderer.invoke('content:writeConfig', payload),
    describe: (files) => ipcRenderer.invoke('content:describe', files),
    import: (destDir, files, options) =>
      ipcRenderer.invoke('content:import', { destDir, files, options }),
    onImportProgress: (fn) => on('import:progress', fn),
    // Something changed in the game folder that this app did not do.
    onChangedOnDisk: (fn) => on('content:changedOnDisk', fn),
  },

  mods: {
    index: (options) => ipcRenderer.invoke('mods:index', options || {}),
    icon: (url, sha256) => ipcRenderer.invoke('mods:icon', { url, sha256 }),
    install: (record) => ipcRenderer.invoke('mods:install', { record }),
    share: (packDir, details) => ipcRenderer.invoke('mods:share', { packDir, details }),
    onProgress: (fn) => on('mods:progress', fn),

    // Publishing. Only these ask for an account; everything above is anonymous.
    whoAmI: () => ipcRenderer.invoke('mods:whoAmI'),
    // Your own submissions, and whether you are trusted or blocked.
    inbox: () => ipcRenderer.invoke('mods:inbox'),
    signIn: () => ipcRenderer.invoke('mods:signIn'),
    signOut: () => ipcRenderer.invoke('mods:signOut'),
    publish: (zipPath, details) => ipcRenderer.invoke('mods:publish', { zipPath, details }),
    // The device code arrives while signIn is still waiting, so it can be shown.
    onDeviceCode: (fn) => on('mods:deviceCode', fn),
    onPublishProgress: (fn) => on('mods:publishProgress', fn),
  },

  // Moderation. Whether any of this works is GitHub's decision, not a setting.
  review: {
    status: () => ipcRenderer.invoke('review:status'),
    queue: () => ipcRenderer.invoke('review:queue'),
    open: (record) => ipcRenderer.invoke('review:open', { record }),
    close: () => ipcRenderer.invoke('review:close'),
    setListed: (packId, listed) => ipcRenderer.invoke('review:setListed', { packId, listed }),
    decide: (number, decision, reason, { packId, author } = {}) =>
      ipcRenderer.invoke('review:decide', { number, decision, reason, packId, author }),
    onProgress: (fn) => on('review:progress', fn),
  },

  media: {
    probe: (files) => ipcRenderer.invoke('media:probe', files),
    proxy: (videoPath, options) => ipcRenderer.invoke('media:proxy', videoPath, options),
    cancelProxy: (videoPath) => ipcRenderer.invoke('media:cancelProxy', videoPath),
    onProxyProgress: (fn) => on('proxy:progress', fn),
    // Bytes over IPC, because fetch on the custom scheme is cross-origin.
    bytes: (filePath) => ipcRenderer.invoke('media:bytes', filePath),
  },

  dialog: {
    pickOutput: (opts) => ipcRenderer.invoke('dialog:pickOutput', opts),
    pickDirectory: (defaultPath) => ipcRenderer.invoke('dialog:pickDirectory', defaultPath),
    pickBinary: (which) => ipcRenderer.invoke('dialog:pickBinary', which),
    pickFiles: (opts) => ipcRenderer.invoke('dialog:pickFiles', opts || {}),
  },

  exporter: {
    run: (job) => ipcRenderer.invoke('export:run', job),
    resolvePath: (target, reserved) => ipcRenderer.invoke('export:resolvePath', target, reserved),
    cancel: (id) => ipcRenderer.invoke('export:cancel', id),
    cancelAll: () => ipcRenderer.invoke('export:cancelAll'),
    on,
  },

  shell: {
    reveal: (target) => ipcRenderer.invoke('shell:reveal', target),
    openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    // Asks first, so a click never silently throws you out to a browser.
    openExternalConfirmed: (url, what) =>
      ipcRenderer.invoke('shell:openExternalConfirmed', { url, what }),
  },
});
