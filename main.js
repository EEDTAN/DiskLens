const { app, BrowserWindow, ipcMain, shell, nativeImage, dialog, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const { execFile } = require('child_process');

let win = null, worker = null;
const scans = new Map(); // scan root -> { tree }
const norm = p => p.replace(/[\\/]+$/, '').toLowerCase();

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#f1eeff', title: 'DiskLens', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (worker) worker.terminate(); app.quit(); });

/* ---------- settings ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return { lang: null, recent: [] }; } };
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_, patch) => {
  const next = { ...readSettings(), ...patch };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
});

/* ---------- languages: every src/i18n/*.json is one language ---------- */
ipcMain.handle('i18n:all', () => {
  const dir = path.join(__dirname, 'src', 'i18n'), out = {};
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) { try { out[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { /* skip broken file */ } }
  return out;
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:paths', () => {
  const out = {};
  for (const k of ['desktop', 'downloads', 'documents', 'pictures', 'videos', 'music']) { try { out[k] = app.getPath(k); } catch { /* not available */ } }
  out.home = os.homedir();
  return out;
});

/* ---------- drives ---------- */
ipcMain.handle('drives:list', () => new Promise(resolve => {
  const fallback = async () => {
    const list = [];
    if (process.platform === 'win32') {
      for (let c = 67; c <= 90; c++) {
        const letter = String.fromCharCode(c) + ':';
        try { const s = await fs.promises.statfs(letter + '\\'); list.push({ letter, label: '', type: 3, total: s.blocks * s.bsize, free: s.bavail * s.bsize }); } catch { /* no such drive */ }
      }
    } else { try { const s = await fs.promises.statfs('/'); list.push({ letter: '/', label: '', type: 3, total: s.blocks * s.bsize, free: s.bavail * s.bsize }); } catch { /* ignore */ } }
    resolve(list);
  };
  if (process.platform !== 'win32') return fallback();
  execFile('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType,Size,FreeSpace | ConvertTo-Json -Compress'], { windowsHide: true, timeout: 10000 }, (err, out) => {
    try {
      let j = JSON.parse(out); if (!Array.isArray(j)) j = [j];
      resolve(j.filter(d => d.Size).map(d => ({ letter: d.DeviceID, label: d.VolumeName || '', type: d.DriveType, total: d.Size, free: d.FreeSpace })));
    } catch { fallback(); }
  });
}));

ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

/* ---------- scanning (read-only) ---------- */
ipcMain.handle('scan:start', (_, { root }) => {
  if (worker) worker.terminate();
  const t0 = Date.now();
  worker = new Worker(path.join(__dirname, 'scanner.js'), { workerData: { root } });
  worker.on('message', m => {
    if (!win || win.isDestroyed()) return;
    if (m.type === 'progress') win.webContents.send('scan:progress', m);
    if (m.type === 'done') {
      scans.set(norm(root), { tree: m.tree });
      win.webContents.send('scan:done', { root, bytes: m.bytes, files: m.files, dirs: m.dirs, cats: m.cats, unread: m.unread, linked: m.linked, ms: Date.now() - t0 });
      worker = null;
    }
  });
  worker.on('error', err => { if (win && !win.isDestroyed()) win.webContents.send('scan:done', { root, error: String(err) }); worker = null; });
  return true;
});
ipcMain.handle('scan:cancel', () => { if (worker) { worker.terminate(); worker = null; } return true; });

function findNode(p) {
  const np = norm(p);
  for (const [root, s] of scans) {
    if (np === root || np.startsWith(root + path.sep) || np.startsWith(root + '/')) {
      let node = s.tree;
      const rest = p.slice(root.length).split(/[\\/]+/).filter(Boolean);
      for (const part of rest) {
        node = node.c.find(k => k.n.toLowerCase() === part.toLowerCase());
        if (!node) return null;
      }
      return node;
    }
  }
  return null;
}

/* ---------- listing a folder, like Explorer ---------- */
ipcMain.handle('fs:list', async (_, dir) => {
  try {
    const ents = await fs.promises.readdir(dir, { withFileTypes: true });
    const node = findNode(dir), out = [];
    let i = 0;
    const worker = async () => {
      while (i < ents.length && i < 30000) {
        const e = ents[i++], full = path.join(dir, e.name);
        try {
          const st = await fs.promises.lstat(full);
          if (e.isDirectory()) {
            const ch = node && node.c.find(k => k.n.toLowerCase() === e.name.toLowerCase());
            out.push({ name: e.name, path: full, dir: true, size: ch ? ch.s : null, files: ch ? ch.f : null, dirs: ch ? ch.d : null, mtime: st.mtimeMs });
          } else out.push({ name: e.name, path: full, dir: false, size: st.size, mtime: st.mtimeMs, link: e.isSymbolicLink() });
        } catch { /* skip entries we cannot read */ }
      }
    };
    await Promise.all(Array.from({ length: 32 }, worker));
    return { entries: out, total: node ? node.s : null, info: node ? { s: node.s, f: node.f, d: node.d } : null, truncated: ents.length > 30000 };
  } catch (err) { return { error: err.code || String(err) }; }
});
ipcMain.handle('fs:size', (_, p) => { const n = findNode(p); return n ? n.s : null; });
ipcMain.handle('fs:stat', async (_, p) => {
  try { const st = await fs.promises.lstat(p); return { size: st.size, mtime: st.mtimeMs, birth: st.birthtimeMs, dir: st.isDirectory() }; } catch { return null; }
});

/* ---------- thumbnails from Windows, like Explorer ---------- */
const thumbCache = new Map();
let busy = 0; const queue = [];
const next = () => { while (busy < 3 && queue.length) { busy++; queue.shift()(); } };
ipcMain.handle('fs:thumb', (_, p) => new Promise(resolve => {
  if (thumbCache.has(p)) return resolve(thumbCache.get(p));
  queue.push(async () => {
    let url = null;
    try {
      let img = nativeImage.createThumbnailFromPath ? await nativeImage.createThumbnailFromPath(p, { width: 256, height: 176 }) : nativeImage.createFromPath(p).resize({ width: 256 });
      if (img && !img.isEmpty()) url = 'data:image/jpeg;base64,' + img.toJPEG(78).toString('base64');
    } catch { /* no thumbnail for this file */ }
    thumbCache.set(p, url);
    if (thumbCache.size > 800) thumbCache.delete(thumbCache.keys().next().value);
    busy--; resolve(url); next();
  });
  next();
}));

/* ---------- opening things (never deletes) ---------- */
ipcMain.handle('shell:open', (_, p) => shell.openPath(p));
ipcMain.handle('shell:show', (_, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle('shell:external', (_, url) => { if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url); return true; });
ipcMain.handle('clipboard:write', (_, text) => { clipboard.writeText(String(text)); return true; });
