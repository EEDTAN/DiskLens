// Duplicate finder worker. Read-only.
// Same size -> same first/last 64 KB -> same full SHA-256. Hard links of one file are not duplicates.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const root = workerData.root, minSize = workerData.minSize || 1024 * 1024;
const SKIP = /^[a-z]:\\(windows|program files|program files \(x86\)|programdata|\$recycle\.bin|system volume information|recovery)$|\\(appdata|node_modules|\.git)$/i;
let phase = 'list', files = 0, hashed = 0, candidates = 0;
const tick = setInterval(() => parentPort.postMessage({ type: 'progress', phase, files, hashed, candidates }), 150);

const bySize = new Map(), inodes = new Set();
let slots = 32; const waiters = [];
const acquire = () => (slots > 0 ? (slots--, Promise.resolve()) : new Promise(r => waiters.push(r)));
const release = () => { const w = waiters.shift(); if (w) w(); else slots++; };

async function walk(dir) {
  if (SKIP.test(dir)) return;
  let ents; await acquire();
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; } finally { release(); }
  await Promise.all(ents.map(async e => {
    if (e.isSymbolicLink()) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    if (!e.isFile()) return;
    await acquire();
    try {
      const st = await fsp.lstat(p, { bigint: true });
      const size = Number(st.size); if (size < minSize) return;
      const id = st.dev + ':' + st.ino; if (inodes.has(id)) return; inodes.add(id);
      files++;
      const list = bySize.get(size) || []; list.push({ path: p, size, mtime: Number(st.mtimeMs) }); bySize.set(size, list);
    } catch { /* unreadable */ } finally { release(); }
  }));
}
async function edgeHash(f) {
  const fh = await fsp.open(f.path, 'r'), n = 65536, buf = Buffer.alloc(n * 2);
  try {
    const a = await fh.read(buf, 0, Math.min(n, f.size), 0);
    const b = f.size > n ? await fh.read(buf, n, Math.min(n, f.size - n), Math.max(n, f.size - n)) : { bytesRead: 0 };
    return crypto.createHash('sha1').update(buf.subarray(0, a.bytesRead)).update(buf.subarray(n, n + b.bytesRead)).digest('hex');
  } finally { await fh.close(); }
}
function fullHash(f) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(f.path).on('data', c => { h.update(c); hashed += c.length; }).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}
async function regroup(groups, fn) {
  const out = [];
  for (const g of groups) {
    const m = new Map();
    for (const f of g) { try { const k = await fn(f); (m.get(k) || m.set(k, []).get(k)).push(f); } catch { /* unreadable */ } }
    for (const v of m.values()) if (v.length > 1) out.push(v);
  }
  return out;
}

(async () => {
  await walk(root);
  let groups = [...bySize.values()].filter(g => g.length > 1);
  candidates = groups.reduce((a, g) => a + g.length, 0);
  phase = 'quick'; groups = await regroup(groups, edgeHash);
  phase = 'full'; groups = await regroup(groups, fullHash);
  clearInterval(tick);
  groups = groups.map(g => g.sort((a, b) => a.mtime - b.mtime)).sort((a, b) => b[0].size * (b.length - 1) - a[0].size * (a.length - 1)).slice(0, 500);
  parentPort.postMessage({ type: 'done', groups, files });
})();
