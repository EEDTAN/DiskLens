const { app, BrowserWindow, ipcMain, shell, nativeImage, dialog, clipboard, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const { execFile } = require('child_process');

let win = null, worker = null, lastRoot = null, dupWorker = null;
const rules = require('./rules');
const ops = require('./ops');
const scans = new Map(); // scan root -> { tree }
const norm = p => p.replace(/[\\/]+$/, '').toLowerCase();

function createWindow() {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = readSettings().theme || 'light';
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141226' : '#f1eeff', title: 'DiskLens', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  require('./updater').init(d => { if (win && !win.isDestroyed()) win.webContents.send('update:state', d); });
});
app.on('window-all-closed', () => { if (worker) worker.terminate(); app.quit(); });

/* ---------- settings ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
// A byte-order mark (added by Notepad or PowerShell) must not make the settings look empty, or saving would wipe them.
const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8').replace(/^\uFEFF/, '')); } catch { return { lang: null, recent: [] }; } };
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_, patch) => {
  const next = { ...readSettings(), ...patch };
  if (patch.theme) nativeTheme.themeSource = patch.theme; // title bar follows the app theme
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
// The fast scanner (native/fastscan.cs) is used when it is there; scanner.js is the fallback.
const fastExe = app.isPackaged ? path.join(process.resourcesPath, 'fastscan.exe') : path.join(__dirname, 'native', 'fastscan.exe');
ops.trashExe = fastExe; // the same helper moves many items to the Recycle Bin at once
function fastScan(root) {
  const child = require('child_process').spawn(fastExe, [root], { windowsHide: true });
  const ev = new (require('events'))();
  const out = []; let errBuf = '';
  child.stdout.on('data', d => out.push(d));
  child.stderr.on('data', d => {
    errBuf += d; const lines = errBuf.split('\n'); errBuf = lines.pop();
    const last = lines.filter(Boolean).pop();
    if (last) try { ev.emit('message', { type: 'progress', ...JSON.parse(last) }); } catch { /* partial line */ }
  });
  // If the fast scanner cannot run (blocked, missing), scan again with scanner.js instead of failing.
  let failed = false;
  const fallback = () => {
    if (failed) return; failed = true;
    const w = new Worker(path.join(__dirname, 'scanner.js'), { workerData: { root } });
    w.on('message', m => ev.emit('message', m)); w.on('error', e => ev.emit('error', e));
    ev.terminate = () => w.terminate();
  };
  child.on('error', fallback);
  child.on('close', code => {
    if (child.killed || failed) return;
    if (code !== 0) return fallback();
    let m; try { m = JSON.parse(Buffer.concat(out).toString('utf8')); } catch { return fallback(); }
    ev.emit('message', { type: 'done', ...m });
  });
  ev.terminate = () => child.kill();
  return ev;
}
ipcMain.handle('scan:start', (_, { root }) => {
  if (worker) worker.terminate();
  const t0 = Date.now();
  worker = process.platform === 'win32' && fs.existsSync(fastExe) ? fastScan(root) : new Worker(path.join(__dirname, 'scanner.js'), { workerData: { root } });
  worker.on('message', m => {
    if (!win || win.isDestroyed()) return;
    if (m.type === 'progress') win.webContents.send('scan:progress', m);
    if (m.type === 'done') {
      scans.set(norm(root), { tree: m.tree, root }); lastRoot = root;
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

/* ---------- analysis: what is this, what happens if deleted ---------- */
const send = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); };
const scanOf = p => { const np = norm(p || lastRoot || ''); for (const [r, s] of scans) if (np === r || np.startsWith(r + '\\') || np.startsWith(r + '/')) return s; return null; };
const join = (a, b) => a.replace(/[\\/]+$/, '') + '\\' + b;
const appPaths = () => [app.getAppPath(), path.dirname(process.execPath), app.getPath('userData')];
ipcMain.handle('analysis:run', () => {
  const s = scanOf(lastRoot); if (!s) return [];
  // DiskLens's own folders are left out; each item says whether it can be cleaned and how.
  const own = appPaths().map(x => x.toLowerCase().replace(/[\\/]+$/, ''));
  return rules.analyze(s.tree, s.root)
    .filter(it => !own.some(o => it.path.toLowerCase() === o || it.path.toLowerCase().startsWith(o + path.sep)))
    .slice(0, 1500)
    .map(it => { const r = rules.RULES.find(x => x.id === it.rule), contents = !!(r && r.contents) && it.dir;
      return { ...it, contents, lock: it.rule === 'recycle' ? 'recycle' : rules.protectedReason(it.path, appPaths(), { contents }) }; });
});
ipcMain.handle('analysis:classify', (_, p, isDir) => { const r = rules.classify(p, !!isDir); return r ? { rule: r.id, risk: r.risk } : { rule: null, risk: 'unknown' }; });
ipcMain.handle('analysis:classifyMany', (_, list) => list.map(([p, d]) => { const r = rules.classify(p, !!d); return r ? { rule: r.id, risk: r.risk, contents: !!r.contents } : { rule: null, risk: 'unknown', contents: false }; }));
ipcMain.handle('ops:guard', (_, list) => list.map(x => typeof x === 'string' ? rules.protectedReason(x, appPaths()) : rules.protectedReason(x.path, appPaths(), { contents: !!x.contents })));

/* ---------- old files: big files not changed for a long time ---------- */
const SYSTEM_AREA = /^[a-z]:\\(windows|program files|program files \(x86\)|programdata|\$recycle\.bin|system volume information|recovery)$/i;
ipcMain.handle('old:list', (_, months) => {
  const s = scanOf(lastRoot); if (!s) return [];
  const limit = Date.now() - months * 30.44 * 86400000, out = [];
  (function walk(node, p) {
    if (SYSTEM_AREA.test(p)) return;
    for (const [name, size, mtime] of node.b || []) if (mtime && mtime < limit) out.push({ path: join(p, name), name, size, mtime, dir: false });
    for (const c of node.c) walk(c, join(p, c.n));
  })(s.tree, s.root);
  return out.sort((a, b) => b.size - a.size).slice(0, 1000);
});

/* ---------- duplicates (worker) ---------- */
ipcMain.handle('dups:start', (_, { root, minSize }) => {
  if (dupWorker) dupWorker.terminate();
  dupWorker = new Worker(path.join(__dirname, 'dups.js'), { workerData: { root, minSize } });
  dupWorker.on('message', m => { if (m.type === 'progress') send('dups:progress', m); else { send('dups:done', m); dupWorker = null; } });
  dupWorker.on('error', e => { send('dups:done', { error: String(e), groups: [] }); dupWorker = null; });
  return true;
});
ipcMain.handle('dups:cancel', () => { if (dupWorker) { dupWorker.terminate(); dupWorker = null; } return true; });

/* ---------- clean-up actions ---------- */
// Keep the scan tree in step with what was removed, so sizes stay right without a rescan.
function forget(p, freed, gone) {
  const s = scanOf(p); if (!s || !freed) return;
  const parts = p.slice(s.root.replace(/[\\/]+$/, '').length).split(/[\\/]+/).filter(Boolean), chain = [s.tree];
  for (const part of parts.slice(0, -1)) { const n = chain[chain.length - 1].c.find(k => k.n.toLowerCase() === part.toLowerCase()); if (!n) return; chain.push(n); }
  const parent = chain[chain.length - 1], name = (parts[parts.length - 1] || '').toLowerCase();
  for (const n of chain) n.s = Math.max(0, n.s - freed);
  const kid = parent.c.find(k => k.n.toLowerCase() === name);
  // Gone for good: the file and folder counts above it shrink too (a file is not a node, so it counts as one file).
  if (gone) { const f = kid ? kid.f : 1, d = kid ? kid.d + 1 : 0; for (const n of chain) { n.f = Math.max(0, n.f - f); n.d = Math.max(0, n.d - d); } }
  if (gone) { parent.c = parent.c.filter(k => k.n.toLowerCase() !== name); if (parent.b) parent.b = parent.b.filter(b => b[0].toLowerCase() !== name); }
  else if (kid) kid.s = Math.max(0, kid.s - freed);
}
let opBusy = false;
ipcMain.handle('ops:run', async (_, opts) => {
  if (opBusy) return { error: 'BUSY' };
  opBusy = true;
  try {
    const results = await ops.run(opts, d => send('ops:progress', d), appPaths());
    for (const r of results) forget(r.path, r.freed, r.gone);
    const s = scanOf(lastRoot);
    return { results, rootBytes: s ? s.tree.s : null };
  } finally { opBusy = false; }
});
ipcMain.handle('ops:cancel', () => { ops.cancel(); return true; });
ipcMain.handle('dialog:dest', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
ipcMain.handle('fs:free', async (_, p) => { try { return await ops.freeBytes(p); } catch { return null; } });
ipcMain.handle('recycle:empty', (_, letter) => new Promise(resolve => {
  if (!/^[A-Za-z]$/.test(letter)) return resolve(false);
  execFile('powershell.exe', ['-NoProfile', '-Command', `Clear-RecycleBin -DriveLetter ${letter} -Force -ErrorAction SilentlyContinue`], { windowsHide: true, timeout: 120000 }, err => resolve(!err));
}));
ipcMain.handle('scan:info', () => { const s = scanOf(lastRoot); return s ? { bytes: s.tree.s, files: s.tree.f, dirs: s.tree.d } : null; });
