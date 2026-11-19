// Updates. The installed version downloads and installs new releases from GitHub.
// The portable version cannot replace itself, so it only says that a new version exists.
const { app, ipcMain, shell } = require('electron');

const REPO = 'EEDTAN/DiskLens';
const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const testFeed = process.env.DISKLENS_UPDATE_URL; // only for testing against a local folder
let updater = null, push = () => {};
let state = { state: 'idle', current: app.getVersion(), portable };
const set = s => { state = { ...state, message: undefined, ...s }; push(state); };
const clean = e => String((e && e.message) || e).split('\n')[0].slice(0, 200);
const newer = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

function init(send) {
  push = send;
  if (!app.isPackaged && !testFeed) set({ state: 'dev' });
  else if (!portable) {
    const { autoUpdater } = require('electron-updater');
    updater = autoUpdater;
    updater.autoDownload = false;          // ask first
    updater.autoInstallOnAppQuit = true;   // a finished download installs when DiskLens closes
    if (testFeed) updater.setFeedURL({ provider: 'generic', url: testFeed });
    updater.on('checking-for-update', () => set({ state: 'checking' }));
    updater.on('update-available', i => set({ state: 'available', version: i.version }));
    updater.on('update-not-available', () => set({ state: 'latest', checkedAt: Date.now() }));
    updater.on('download-progress', p => set({ state: 'downloading', percent: Math.round(p.percent) }));
    updater.on('update-downloaded', i => set({ state: 'ready', version: i.version }));
    updater.on('error', e => set({ state: 'error', message: clean(e) }));
  }
  ipcMain.handle('update:state', () => state);
  ipcMain.handle('update:check', () => check());
  ipcMain.handle('update:download', () => { if (updater && state.state === 'available') updater.downloadUpdate().catch(e => set({ state: 'error', message: clean(e) })); return true; });
  ipcMain.handle('update:install', () => { if (updater && state.state === 'ready') setImmediate(() => updater.quitAndInstall(true, true)); return true; });
  ipcMain.handle('update:page', () => shell.openExternal(`https://github.com/${REPO}/releases/latest`));
}

async function check() {
  if (state.state === 'dev' || ['checking', 'downloading', 'ready'].includes(state.state)) return state;
  if (updater) {
    try { await updater.checkForUpdates(); } catch (e) { set({ state: 'error', message: clean(e) }); }
    return state;
  }
  try {
    set({ state: 'checking' });
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'DiskLens', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const v = String((await r.json()).tag_name || '').replace(/^v/, '');
    set(v && newer(v, app.getVersion()) ? { state: 'available', version: v } : { state: 'latest', checkedAt: Date.now() });
  } catch (e) { set({ state: 'error', message: clean(e) }); }
  return state;
}

module.exports = { init };
