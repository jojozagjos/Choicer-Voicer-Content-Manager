'use strict';

const { contextBridge, ipcRenderer } = require('electron');

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
]);

contextBridge.exposeInMainWorld('api', {
  appInfo: () => ipcRenderer.invoke('app:info'),

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (next) => ipcRenderer.invoke('settings:set', next),
  },

  game: {
    scan: (dir) => ipcRenderer.invoke('game:scan', dir),
    pickFolder: () => ipcRenderer.invoke('game:pickFolder'),
  },

  media: {
    probe: (files) => ipcRenderer.invoke('media:probe', files),
    proxy: (videoPath) => ipcRenderer.invoke('media:proxy', videoPath),
    onProxyProgress: (fn) => on('proxy:progress', fn),
  },

  dialog: {
    pickOutput: (opts) => ipcRenderer.invoke('dialog:pickOutput', opts),
    pickDirectory: (defaultPath) => ipcRenderer.invoke('dialog:pickDirectory', defaultPath),
    pickBinary: (which) => ipcRenderer.invoke('dialog:pickBinary', which),
  },

  exporter: {
    run: (job) => ipcRenderer.invoke('export:run', job),
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
