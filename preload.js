const { contextBridge, ipcRenderer } = require('electron');

const inv = channel => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  drives: inv('drives:list'),
  paths: inv('app:paths'),
  version: inv('app:version'),
  langs: inv('i18n:all'),
  getSettings: inv('settings:get'),
  setSettings: inv('settings:set'),
  pickFolder: inv('dialog:folder'),
  scan: inv('scan:start'),
  cancelScan: inv('scan:cancel'),
  list: inv('fs:list'),
  stat: inv('fs:stat'),
  size: inv('fs:size'),
  thumb: inv('fs:thumb'),
  open: inv('shell:open'),
  show: inv('shell:show'),
  external: inv('shell:external'),
  copy: inv('clipboard:write'),
  onProgress: cb => ipcRenderer.on('scan:progress', (_, d) => cb(d)),
  onDone: cb => ipcRenderer.on('scan:done', (_, d) => cb(d)),
});
