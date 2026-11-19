// Clean-up actions: Recycle Bin, move to another drive, delete permanently (optionally overwrite first).
// Every path is checked against protectedReason() here, in the main process, before anything happens.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { shell } = require('electron');
const { protectedReason } = require('./rules');

let cancelled = false;
const cancel = () => { cancelled = true; };

// Size of a file or folder. Walks sub-folders in parallel, a limited number at a time.
let mSlots = 48; const mWait = [];
const mAcquire = () => (mSlots > 0 ? (mSlots--, Promise.resolve()) : new Promise(r => mWait.push(r)));
const mRelease = () => { const w = mWait.shift(); if (w) w(); else mSlots++; };
async function measure(p) {
  await mAcquire();
  let st, ents;
  try { st = await fsp.lstat(p); if (st.isDirectory()) ents = await fsp.readdir(p, { withFileTypes: true }); } finally { mRelease(); }
  if (!st.isDirectory()) return { bytes: st.size, files: 1, links: 0 };
  let bytes = 0, files = 0, links = 0;
  await Promise.all(ents.map(async e => {
    if (e.isSymbolicLink()) { links++; return; }
    try { const r = await measure(path.join(p, e.name)); bytes += r.bytes; files += r.files; links += r.links; } catch { /* vanished */ }
  }));
  return { bytes, files, links };
}
const exists = p => fsp.lstat(p).then(() => true, () => false);

async function copyTree(src, dst, onBytes) {
  const st = await fsp.lstat(src);
  if (st.isSymbolicLink()) throw Object.assign(new Error('link'), { code: 'HASLINK' });
  if (st.isDirectory()) {
    await fsp.mkdir(dst, { recursive: false });
    for (const e of await fsp.readdir(src)) { if (cancelled) throw Object.assign(new Error('cancel'), { code: 'CANCELLED' }); await copyTree(path.join(src, e), path.join(dst, e), onBytes); }
  } else {
    const count = new Transform({ transform(chunk, _, cb) { onBytes(chunk.length); cb(null, chunk); } });
    await pipeline(fs.createReadStream(src), count, fs.createWriteStream(dst, { flags: 'wx' }));
  }
  await fsp.utimes(dst, st.atime, st.mtime).catch(() => {});
}
async function hashFile(p, onBytes) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(p), new Transform({ transform(c, _, cb) { h.update(c); onBytes(c.length); cb(); } }));
  return h.digest('hex');
}
async function sameTree(a, b, onBytes) {
  const sa = await fsp.lstat(a), sb = await fsp.lstat(b);
  if (sa.isDirectory() !== sb.isDirectory()) return false;
  if (sa.isDirectory()) {
    const la = (await fsp.readdir(a)).sort(), lb = (await fsp.readdir(b)).sort();
    if (la.join('\n') !== lb.join('\n')) return false;
    for (const e of la) if (!(await sameTree(path.join(a, e), path.join(b, e), onBytes))) return false;
    return true;
  }
  if (sa.size !== sb.size) return false;
  return (await hashFile(a, onBytes)) === (await hashFile(b, onBytes));
}
async function overwrite(p, onBytes) {
  const st = await fsp.lstat(p);
  if (st.isSymbolicLink()) return;
  if (st.isDirectory()) { for (const e of await fsp.readdir(p)) await overwrite(path.join(p, e), onBytes); return; }
  const fh = await fsp.open(p, 'r+'), size = st.size, buf = Buffer.alloc(1024 * 1024);
  try {
    for (const pass of [0x00, 0xff, -1]) {
      for (let pos = 0; pos < size; pos += buf.length) {
        if (cancelled) throw Object.assign(new Error('cancel'), { code: 'CANCELLED' });
        const n = Math.min(buf.length, size - pos);
        if (pass < 0) crypto.randomFillSync(buf, 0, n); else buf.fill(pass, 0, n);
        await fh.write(buf, 0, n, pos); onBytes(n / 3);
      }
      await fh.sync();
    }
  } finally { await fh.close(); }
}
async function freeBytes(p) { const s = await fsp.statfs(path.parse(p).root); return s.bavail * s.bsize; }
const driveOf = p => path.parse(path.resolve(p)).root.toLowerCase();

// Run a few jobs at once.
async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
}
// Clean what is inside a temp or cache folder; the folder itself stays. Files in use are skipped.
async function clearContents(dir) {
  let names = [];
  try { names = await fsp.readdir(dir); } catch { return { skipped: 0 }; }
  let skipped = 0;
  await pool(names, 8, async n => {
    if (cancelled) { skipped++; return; }
    try { await fsp.rm(path.join(dir, n), { recursive: true, force: false, maxRetries: 1 }); } catch { skipped++; }
  });
  return { skipped };
}

// opts: { action: 'bin' | 'perm' | 'move', items: [{ path, contents, size }], secure, verify, origAfter: 'perm' | 'bin', dest }
async function run(opts, send, extraProtected = []) {
  cancelled = false;
  const items = opts.items || (opts.paths || []).map(p => ({ path: p }));
  const results = [], plan = [];
  for (const it of items) {
    const why = protectedReason(it.path, extraProtected, { contents: !!it.contents });
    if (why) { results.push({ path: it.path, ok: false, error: 'PROTECTED', freed: 0 }); continue; }
    if (it.contents && opts.action === 'move') { results.push({ path: it.path, ok: false, error: 'CACHEMOVE', freed: 0 }); continue; }
    try {
      await fsp.lstat(it.path);
      // The scan already knows the size; only measure when it does not (or when moving, to find links).
      const m = opts.action === 'move' || !(it.size > 0) ? await measure(it.path) : { bytes: it.size, links: 0 };
      plan.push({ path: it.path, bytes: m.bytes, links: m.links, contents: !!it.contents });
    } catch (e) { results.push({ path: it.path, ok: false, error: e.code || String(e), freed: 0 }); }
  }
  const total = plan.reduce((a, x) => a + x.bytes, 0) || 1;
  let done = 0, phase = 'start', current = '';
  const tick = () => send({ phase, current, done: Math.min(done, total), total, index: results.length, count: items.length });
  const timer = setInterval(tick, 150);
  const leftOf = async p => { try { return (await measure(p)).bytes; } catch { return 0; } };
  try {
    if (opts.action === 'move') {
      if (!opts.dest || !(await exists(opts.dest))) throw Object.assign(new Error('dest'), { code: 'NODEST' });
      if (protectedReason(path.join(opts.dest, 'x'), extraProtected) === 'system') throw Object.assign(new Error('dest'), { code: 'DESTPROTECTED' });
      for (const x of plan) {
        if (driveOf(x.path) === driveOf(opts.dest)) throw Object.assign(new Error('same'), { code: 'SAMEDRIVE' });
        const rel = path.relative(x.path, opts.dest);
        if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw Object.assign(new Error('inside'), { code: 'DESTINSIDE' });
      }
      if ((await freeBytes(opts.dest)) < total + 64 * 1024 * 1024) throw Object.assign(new Error('space'), { code: 'NOSPACE' });
    }
    const one = async x => {
      if (cancelled) { results.push({ path: x.path, ok: false, error: 'CANCELLED', freed: 0 }); return; }
      current = x.path; const before = x.bytes;
      try {
        if (x.contents) {
          // Temp and cache folders: cleaned directly, like Disk Cleanup does. The Recycle Bin would only slow it down.
          phase = 'delete';
          const { skipped } = await clearContents(x.path);
          const freed = skipped ? Math.max(0, before - await leftOf(x.path)) : before;
          done += before; results.push({ path: x.path, ok: true, freed, gone: false, skipped });
          return;
        }
        if (opts.action === 'bin') { phase = 'bin'; await shell.trashItem(x.path); }
        else if (opts.action === 'perm') {
          if (opts.secure) { phase = 'overwrite'; const start = done; await overwrite(x.path, n => { done += n; }); done = start; }
          phase = 'delete'; await fsp.rm(x.path, { recursive: true, force: false, maxRetries: 2 });
        } else if (opts.action === 'move') {
          if (x.links) throw Object.assign(new Error('links'), { code: 'HASLINK' });
          let target = path.join(opts.dest, path.basename(x.path)), k = 2;
          while (await exists(target)) target = path.join(opts.dest, path.parse(x.path).name + ` (${k++})` + path.parse(x.path).ext);
          const start = done, share = opts.verify ? 0.5 : 0.9;
          phase = 'copy'; await copyTree(x.path, target, n => { done += n * share; });
          if (opts.verify) {
            phase = 'verify'; let seen = 0;
            const ok = await sameTree(x.path, target, n => { seen += n; done = start + before * 0.5 + Math.min(before * 0.4, seen / 2 * 0.4); });
            if (!ok) throw Object.assign(new Error('verify'), { code: 'VERIFY', target });
          }
          phase = 'delete';
          if (opts.origAfter === 'bin') await shell.trashItem(x.path); else await fsp.rm(x.path, { recursive: true, force: false, maxRetries: 2 });
          done = start; x.target = target;
        }
        done += before;
        results.push({ path: x.path, ok: true, freed: before, gone: true, target: x.target });
      } catch (e) {
        // Partly deleted folders: report how much is really gone.
        const still = await exists(x.path), gone = still ? Math.max(0, before - await leftOf(x.path)) : before;
        results.push({ path: x.path, ok: false, error: e.code || String(e), freed: opts.action === 'move' ? 0 : gone, gone: !still, target: e.target });
        done += before;
      }
    };
    // Moving copies one item at a time; deleting runs a few at once.
    await pool(plan, opts.action === 'move' ? 1 : 3, one);
  } catch (e) {
    for (const x of plan) if (!results.find(r => r.path === x.path)) results.push({ path: x.path, ok: false, error: e.code || String(e), freed: 0 });
  } finally { clearInterval(timer); }
  phase = 'done'; tick();
  return results;
}

module.exports = { run, cancel, measure, freeBytes };
