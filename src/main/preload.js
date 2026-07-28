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
]);

contextBridge.exposeInMainWorld('api', {
  appInfo: () => ipcRenderer.invoke('app:info'),

  // Electron removed File.path, so a dropped file's real location has to come
  // from webUtils in the preload.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return null; }
  },

  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (next) => ipcRenderer.invoke('settings:set', next),
  },

  game: {
    scan: (dir) => ipcRenderer.invoke('game:scan', dir),
    pickFolder: () => ipcRenderer.invoke('game:pickFolder'),
  },

  content: {
    scan: (dir) => ipcRenderer.invoke('content:scan', dir),
    create: (type, options) => ipcRenderer.invoke('content:create', { type, options }),
    remove: (packDir) => ipcRenderer.invoke('content:delete', packDir),
    install: (dirs) => ipcRenderer.invoke('content:install', dirs),
    extractClip: (payload) => ipcRenderer.invoke('content:extractClip', payload),
    writeClipMeta: (payload) => ipcRenderer.invoke('content:writeClipMeta', payload),
    trashClip: (payload) => ipcRenderer.invoke('content:trashClip', payload),
    restoreClip: (payload) => ipcRenderer.invoke('content:restoreClip', payload),
    saveImage: (payload) => ipcRenderer.invoke('content:saveImage', payload),
    writePackInfo: (payload) => ipcRenderer.invoke('content:writePackInfo', payload),
    buildBacking: (payload) => ipcRenderer.invoke('content:buildBacking', payload),
    cropVideo: (payload) => ipcRenderer.invoke('content:cropVideo', payload),
    saveRecording: (payload) => ipcRenderer.invoke('content:saveRecording', payload),
    writeConfig: (payload) => ipcRenderer.invoke('content:writeConfig', payload),
    describe: (files) => ipcRenderer.invoke('content:describe', files),
    import: (destDir, files, options) =>
      ipcRenderer.invoke('content:import', { destDir, files, options }),
    onImportProgress: (fn) => on('import:progress', fn),
  },

  media: {
    probe: (files) => ipcRenderer.invoke('media:probe', files),
    proxy: (videoPath, options) => ipcRenderer.invoke('media:proxy', videoPath, options),
    cancelProxy: (videoPath) => ipcRenderer.invoke('media:cancelProxy', videoPath),
    onProxyProgress: (fn) => on('proxy:progress', fn),
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
  },
});
