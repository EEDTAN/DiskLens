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
  // Windows' list of installed programs, so files of programs installed anywhere (D:\Games...) are recognised.
  if (fs.existsSync(fastExe)) execFile(fastExe, ['--apps'], { windowsHide: true, timeout: 20000, maxBuffer: 1 << 24 }, (err, out) => { try { if (!err) rules.setApps(JSON.parse(out)); } catch { /* keep going without it */ } });
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
// Phones plugged in by USB have no drive letter: fastscan.exe --phones finds them (Windows Portable Devices).
const phones = new Map(); // scan root -> { dev, id }
const listPhones = () => new Promise(resolve => {
  if (process.platform !== 'win32' || !fs.existsSync(fastExe)) return resolve([]);
  execFile(fastExe, ['--phones'], { windowsHide: true, timeout: 20000 }, (err, out) => {
    let list = []; try { list = JSON.parse(out); } catch { /* no phones */ }
    const drives = [];
    for (const d of list) {
      const name = d.name.replace(/[\\/]/g, ' ');
      if (!d.storages.length) { drives.push({ letter: name, label: name, type: 'phone', locked: true, total: 0, free: 0 }); continue; }
      for (const st of d.storages) {
        const letter = name + '\\' + st.name.replace(/[\\/]/g, ' ');
        phones.set(norm(letter), { dev: d.dev, id: st.id });
        drives.push({ letter, label: name, storage: st.name, type: 'phone', total: st.total, free: st.free });
      }
    }
    resolve(drives);
  });
});
ipcMain.handle('drives:list', async () => [...await diskList(), ...await listPhones()]);
const diskList = () => new Promise(resolve => {
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
});

ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

/* ---------- scanning (read-only) ---------- */
// The fast scanner (native/fastscan.cs) is used when it is there; scanner.js is the fallback.
const fastExe = app.isPackaged ? path.join(process.resourcesPath, 'fastscan.exe') : path.join(__dirname, 'native', 'fastscan.exe');
ops.trashExe = fastExe; // the same helper moves many items to the Recycle Bin at once
function fastScan(root, phone) {
  const child = require('child_process').spawn(fastExe, phone ? ['--mtp', phone.dev, phone.id, root] : [root], { windowsHide: true });
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
    if (phone) return ev.emit('error', new Error('PHONE')); // scanner.js cannot read a phone
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
  const phone = phones.get(norm(root));
  worker = phone || (process.platform === 'win32' && fs.existsSync(fastExe)) ? fastScan(root, phone) : new Worker(path.join(__dirname, 'scanner.js'), { workerData: { root } });
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
// A phone cannot be listed like a disk, so its folders are shown from the scan (every file is in it).
const phoneScan = p => { const s = scanOf(p); return s && phones.has(norm(s.root)) ? s : null; };
function phoneList(dir) {
  const node = findNode(dir); if (!node) return { error: 'ENOENT' };
  const entries = node.c.map(c => ({ name: c.n, path: join(dir, c.n), dir: true, size: c.s, files: c.f, dirs: c.d, mtime: null }))
    .concat((node.b || []).map(([name, size, mtime]) => ({ name, path: join(dir, name), dir: false, size, mtime: mtime || null })));
  return { entries, total: node.s, info: { s: node.s, f: node.f, d: node.d }, truncated: false, phone: true };
}
ipcMain.handle('fs:list', async (_, dir) => {
  if (phoneScan(dir)) return phoneList(dir);
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
      let img = nativeImage.createThumbnailFromPath ? await nativeImage.createThumbnailFromPath(p, { width: 480, height: 330 }) : nativeImage.createFromPath(p).resize({ width: 480 });
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
      return { ...it, contents, lock: it.rule === 'recycle' ? 'recycle' : guard(it.path, contents) }; });
});
ipcMain.handle('analysis:classify', (_, p, isDir) => { const r = rules.classify(p, !!isDir); return r ? { rule: r.id, risk: r.risk } : { rule: null, risk: 'unknown' }; });
// Folders that hold .exe files (portable programs), remembered for the session. Read-only.
const exeDirs = new Map();
const hasExe = d => { if (!exeDirs.has(d)) { let v = false; try { v = fs.readdirSync(d, { withFileTypes: true }).some(e => e.isFile() && /\.exe$/i.test(e.name)); } catch { /* unreadable */ } exeDirs.set(d, v); } return exeDirs.get(d); };
// What Windows calls a file type and which app opens it, asked once per extension.
const winTypes = {};
async function typesFor(exts) {
  const need = exts.filter(e => !(e in winTypes));
  if (need.length && fs.existsSync(fastExe)) {
    const r = await new Promise(res => execFile(fastExe, ['--types', ...need], { windowsHide: true, timeout: 8000 }, (err, out) => { try { res(err ? {} : JSON.parse(out)); } catch { res({}); } }));
    for (const e of need) winTypes[e] = r[e] || null;
  }
  return winTypes;
}
ipcMain.handle('analysis:classifyMany', async (_, list) => {
  const extOf = p => ((/\.([a-z0-9]{1,8})$/i.exec(p) || [])[1] || '').toLowerCase();
  const types = await typesFor([...new Set(list.filter(([p, d]) => !d && extOf(p) && !rules.TYPE_OF[extOf(p)] && !rules.classify(p, false)).map(([p]) => extOf(p)))].slice(0, 200));
  return list.map(([p, d]) => {
  const r = rules.classify(p, !!d), ex = rules.explain(p, !!d, { hasExe, types });
  return { rule: r ? r.id : null, risk: r ? r.risk : ex ? ex.risk : 'unknown', contents: !!(r && r.contents), ex };
  });
});
// Name and maker written inside a program file (.exe, .dll, .sys), read by the helper. Read-only.
ipcMain.handle('fs:verinfo', (_, p) => new Promise(resolve => {
  if (!fs.existsSync(fastExe)) return resolve(null);
  execFile(fastExe, ['--info', p], { windowsHide: true, timeout: 8000 }, (err, out) => { try { resolve(err ? null : JSON.parse(out)); } catch { resolve(null); } });
}));
ipcMain.handle('ops:guard', (_, list) => list.map(x => typeof x === 'string' ? guard(x) : guard(x.path, !!x.contents)));

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

// Every video / photo / music / document / archive file of the scan (64 KB and up), biggest first, plus totals per type.
ipcMain.handle('type:list', (_, cat) => {
  const s = scanOf(lastRoot), sum = {}, out = []; if (!s) return { sum, items: out };
  (function walk(node, p) {
    if (SYSTEM_AREA.test(p)) return;
    for (const l of [node.b, node.t]) for (const [name, size, mtime] of l || []) {
      const c = rules.catOf(name); if (c === 'app' || c === 'other') continue;
      const x = sum[c] || (sum[c] = { n: 0, size: 0 }); x.n++; x.size += size;
      if (c === cat) out.push({ path: join(p, name), name, size, mtime: mtime || null, dir: false });
    }
    for (const c of node.c) walk(c, join(p, c.n));
  })(s.tree, s.root);
  return { sum, items: out.sort((a, b) => b.size - a.size).slice(0, 2000) }; // ponytail: list capped at 2000, page it if people need more
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
  if (gone) { parent.c = parent.c.filter(k => k.n.toLowerCase() !== name); for (const k of ['b', 't']) if (parent[k]) parent[k] = parent[k].filter(b => b[0].toLowerCase() !== name); }
  else if (kid) kid.s = Math.max(0, kid.s - freed);
}
/* ---------- phone clean-up ---------- */
// A phone has no Recycle Bin: items are copied to the PC first ('move', sizes checked) or deleted for good ('perm').
// The phone's own top folders stay; what is inside them can go.
const PHONE_TOP = new Set(['dcim', 'download', 'pictures', 'movies', 'music', 'documents', 'android', 'alarms', 'notifications', 'ringtones', 'podcasts', 'audiobooks', 'recordings']);
function phoneGuard(p) {
  const s = phoneScan(p); if (!s) return null;
  const parts = p.slice(s.root.replace(/[\\]+$/, '').length).split('\\').filter(Boolean).map(x => x.toLowerCase());
  if (!parts.length) return 'root';
  if (parts.length === 1 && PHONE_TOP.has(parts[0])) return 'system';
  if (parts.length === 2 && parts[0] === 'android' && ['data', 'obb', 'media'].includes(parts[1])) return 'system';
  return null;
}
const guard = (p, contents) => phoneScan(p) ? phoneGuard(p) : rules.protectedReason(p, appPaths(), { contents });
function phoneSize(p) {
  const n = findNode(p); if (n) return n.s;
  const i = p.lastIndexOf('\\'), parent = findNode(p.slice(0, i)), name = p.slice(i + 1).toLowerCase();
  const b = parent && (parent.b || []).find(x => x[0].toLowerCase() === name);
  return b ? b[1] : 0;
}
function phoneOps(items, opts, progress) {
  const s = phoneScan(items[0].path), ph = phones.get(norm(s.root)), results = [];
  const total = items.reduce((a, x) => a + x.size, 0) * (opts.action === 'move' ? 2 : 1);
  let base = 0;
  const run = (mode, list) => new Promise(resolve => {
    const args = ['--mtp-ops', ph.dev, ph.id, s.root, mode].concat(mode === 'get' ? [opts.dest] : []);
    const child = require('child_process').spawn(fastExe, args, { windowsHide: true }), out = [];
    let buf = '', ebuf = '';
    child.stdout.on('data', d => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) if (l.trim()) out.push(JSON.parse(l)); });
    child.stderr.on('data', d => { ebuf += d; const lines = ebuf.split('\n'); ebuf = lines.pop(); const last = lines.filter(Boolean).pop();
      if (last) try { progress({ phase: 'copy', current: list[out.length] ? list[out.length].path : '', done: base + JSON.parse(last).done, total, index: out.length, count: list.length }); } catch { /* partial */ } });
    child.on('error', () => resolve(list.map(() => ({ ok: false, error: 'HELPER' }))));
    child.on('close', () => { if (buf.trim()) try { out.push(JSON.parse(buf)); } catch { /* cut off */ } resolve(list.map((_, i) => out[i] || { ok: false, error: 'HELPER' })); });
    child.stdin.end(list.map(x => x.path).join('\n') + '\n');
  });
  return (async () => {
    let todo = items;
    if (opts.action === 'move') {
      const got = await run('get', items); todo = [];
      items.forEach((x, i) => got[i].ok ? (x.target = got[i].target, todo.push(x)) : results.push({ path: x.path, ok: false, error: got[i].error, freed: 0 }));
      base = total / 2;
    }
    progress({ phase: 'delete', current: '', done: base, total, index: 0, count: todo.length });
    const del = todo.length ? await run('del', todo) : [];
    todo.forEach((x, i) => results.push(del[i].ok ? { path: x.path, ok: true, freed: x.size, gone: true, target: x.target } : { path: x.path, ok: false, error: del[i].error, freed: 0, target: x.target }));
    return results;
  })();
}
let opBusy = false;
ipcMain.handle('ops:run', async (_, opts) => {
  if (opBusy) return { error: 'BUSY' };
  opBusy = true;
  try {
    // Phone items never reach ops.run: their paths have no drive letter and would be read as relative paths.
    const onPhone = opts.items.filter(x => phoneScan(x.path)), results = [];
    if (onPhone.length) {
      const ok = [];
      for (const x of onPhone) {
        const why = opts.action === 'bin' ? 'NOBIN' : x.contents ? 'CACHEMOVE' : phoneGuard(x.path) ? 'PROTECTED' : opts.action === 'move' && !opts.dest ? 'NODEST' : null;
        if (why) results.push({ path: x.path, ok: false, error: why, freed: 0 }); else ok.push({ path: x.path, size: phoneSize(x.path) });
      }
      if (ok.length) results.push(...await phoneOps(ok, opts, d => send('ops:progress', d)));
    }
    const rest = opts.items.filter(x => !phoneScan(x.path));
    if (rest.length) results.push(...await ops.run({ ...opts, items: rest }, d => send('ops:progress', d), appPaths()));
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
