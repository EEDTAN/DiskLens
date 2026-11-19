// Scan worker: walks a folder and reports sizes. Read-only, never changes anything on disk.
const { parentPort, workerData } = require('worker_threads');
const fsp = require('fs').promises;
const path = require('path');

const root = workerData.root;
let files = 0, dirs = 0, bytes = 0, unread = 0, linked = 0, cur = root;
const seen = new Set(); // hard-linked files already counted
const top = [];
const cats = { video: 0, image: 0, audio: 0, doc: 0, archive: 0, app: 0, other: 0 };
const CAT = {};
const put = (c, list) => list.split(' ').forEach(e => { CAT[e] = c; });
put('video', 'mp4 mkv avi mov wmv webm flv m4v mpg mpeg 3gp');
put('image', 'jpg jpeg png gif webp bmp heic tif tiff raw cr2 nef svg ico psd');
put('audio', 'mp3 wav flac aac ogg m4a wma opus');
put('doc', 'pdf doc docx xls xlsx ppt pptx txt md rtf csv odt ods');
put('archive', 'zip rar 7z tar gz bz2 iso img vhd vhdx');
put('app', 'exe dll sys msi bat cmd com ocx drv cab msu');

// Limit how many file-system calls run at once.
let slots = 64;
const waiters = [];
const acquire = () => (slots > 0 ? (slots--, Promise.resolve()) : new Promise(r => waiters.push(r)));
const release = () => { const w = waiters.shift(); if (w) w(); else slots++; };
async function limited(fn) { await acquire(); try { return await fn(); } finally { release(); } }

function pushTop(name, p, size) {
  if (top.length >= 8 && size <= top[top.length - 1].size) return;
  top.push({ name, path: p, size });
  top.sort((a, b) => b.size - a.size);
  if (top.length > 8) top.pop();
}

async function walk(dir, node) {
  let ents;
  try { ents = await limited(() => fsp.readdir(dir, { withFileTypes: true })); } catch { unread++; return; }
  cur = dir;
  const subs = [], fl = [];
  for (const e of ents) {
    if (e.isSymbolicLink()) continue; // skip links and junctions: avoids loops and double counting
    if (e.isDirectory()) subs.push(e); else if (e.isFile()) fl.push(e);
  }
  await Promise.all(fl.map(e => limited(async () => {
    try {
      const p = path.join(dir, e.name), st = await fsp.lstat(p, { bigint: true });
      node.f++; files++;
      // A file with several hard links (common in Windows\WinSxS) is stored once, so count its size once.
      if (st.nlink > 1n) { const id = st.dev + ':' + st.ino; if (seen.has(id)) { linked++; return; } seen.add(id); }
      const size = Number(st.size);
      node.s += size; bytes += size;
      cats[CAT[path.extname(e.name).slice(1).toLowerCase()] || 'other'] += size;
      pushTop(e.name, p, size);
    } catch { /* file vanished or unreadable */ }
  })));
  const kids = await Promise.all(subs.map(async e => {
    const child = { n: e.name, s: 0, f: 0, d: 0, c: [] };
    await walk(path.join(dir, e.name), child);
    dirs++;
    return child;
  }));
  for (const k of kids) { node.s += k.s; node.f += k.f; node.d += k.d + 1; node.c.push(k); }
}

(async () => {
  const tree = { n: root, s: 0, f: 0, d: 0, c: [] };
  const tick = setInterval(() => parentPort.postMessage({ type: 'progress', files, dirs, bytes, cur, top }), 120);
  await walk(root, tree);
  clearInterval(tick);
  parentPort.postMessage({ type: 'done', tree, files, dirs, bytes, unread, linked, cats });
})();
