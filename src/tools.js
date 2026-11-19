/* Tools: Analysis, Duplicates, Old files, the collector (basket) and clean-up actions.
   Uses the globals from app.js (S, t, esc, F, N, render, ...). */
Object.assign(S, {
  tool: 'explorer', tray: [], known: new Map(), gone: new Set(), risk: new Map(), xsel: null,
  an: { items: null, tab: 'safe' }, dups: { state: 'idle', min: 10, prog: null, groups: [], keep: {} }, old: { months: 12, items: null },
  modal: null, op: { action: 'bin', secure: false, verify: true, origAfter: 'perm', dest: null, destFree: null, word: '', confirmed: new Set(), prog: null, result: null },
  armed: null, history: [],
});
const RC = { safe: '#34d399', caution: '#fbbf24', danger: '#f87171', unknown: '#a5a1c2' };
const ASK = new Set(['appdata', 'storeapp', 'programdata', 'pkgcache', 'wsl', 'steamgame', 'steamdl', 'nuget', 'git', 'onedrive']);
const hasKey = k => !!((S.langs[S.lang] || {})[k] || (S.langs.en || {})[k]);
const ruleText = (rule, part) => rule && hasKey('r.' + rule + '.' + part) ? t('r.' + rule + '.' + part) : (part === 'tip' ? '' : t('r.unknown.' + part));
const riskChip = r => `<span class="chip" style="--c:${RC[r] || RC.unknown}">● ${esc(t('risk.' + (r || 'unknown')))}</span>`;
const gone = p => [...S.gone].some(g => within(p, g));
const inTray = p => S.tray.some(x => same(x.path, p));
const remember = list => { list.forEach(x => S.known.set(x.path, x)); return list; };
const itemByPath = p => S.known.get(p) || S.entries.find(e => e.path === p);
function addBtnX(it) {
  if (it.risk === 'danger' || it.rest) return `<span class="lock" title="${esc(t(it.rest ? 'tray.restLocked' : 'tray.locked'))}">🔒</span>`;
  return `<button class="add ${inTray(it.path) ? 'in' : ''}" data-tadd="${esc(it.path)}" title="${esc(t('tray.add'))}">${inTray(it.path) ? '✓' : '+'}</button>`;
}

/* ---------- the collector ---------- */
async function addTray(list) {
  const fresh = list.filter(x => x && !inTray(x.path));
  if (!fresh.length) return;
  const [guards, risks] = await Promise.all([api.guard(fresh.map(x => x.path)), api.classifyMany(fresh.map(x => [x.path, !!x.dir]))]);
  let blocked = 0;
  fresh.forEach((x, i) => {
    if (guards[i] || risks[i].risk === 'danger' || x.rest || S.tray.some(y => within(x.path, y.path))) { blocked++; return; }
    S.tray = S.tray.filter(y => !within(y.path, x.path));
    S.tray.push({ path: x.path, name: x.name, size: x.size || 0, dir: !!x.dir, rule: risks[i].rule, risk: risks[i].risk });
  });
  if (blocked) toast(t('tray.blocked', { n: blocked }));
  render();
}
async function deleteNow(list) { const before = S.tray.length; await addTray(list); if (S.tray.length && (S.tray.length > before || list.every(x => inTray(x.path)))) openConfirm(); }
function trayHTML() {
  const tot = S.tray.reduce((a, x) => a + x.size, 0);
  return `<div class="tray" id="tray"><div class="tt"><b>${esc(t('tray.title'))}</b><div class="n">${esc(F(tot))}</div><small>${esc(t('tray.count', { n: S.tray.length }))}</small></div>
  <div class="items">${S.tray.length ? S.tray.map(x => `<div class="tc" style="--c:${RC[x.risk] || RC.unknown};${gradOf(x)}">${visual(x)}<div><b title="${esc(x.path)}">${esc(x.name)}</b><small>${esc(F(x.size))}</small></div><button class="x" data-trm="${esc(x.path)}" title="${esc(t('tray.remove'))}">✕</button></div>`).join('') : `<div class="empty"><i>⤓</i><span>${esc(t('tray.empty'))}</span></div>`}</div>
  ${S.tray.length ? `<button class="clr" data-act2="trayclear">${esc(t('tray.clear'))}</button>` : ''}<button class="go" id="go" ${S.tray.length ? '' : 'disabled'} style="width:auto;height:auto">${esc(t('tray.next'))} ›</button></div>`;
}
function wireTray() {
  const tr = $('tray'); if (!tr) return;
  tr.ondragover = e => { e.preventDefault(); tr.classList.add('over'); };
  tr.ondragleave = () => tr.classList.remove('over');
  tr.ondrop = e => { e.preventDefault(); tr.classList.remove('over'); try { addTray(JSON.parse(e.dataTransfer.getData('text/plain'))); } catch { /* not ours */ } };
}
document.addEventListener('dragstart', e => {
  const el = e.target.closest && e.target.closest('[data-i],[data-p]'); if (!el || !e.dataTransfer) return;
  let list;
  if (el.dataset.i !== undefined && S.tool === 'explorer') { const it = S.view[+el.dataset.i]; list = S.sel.has(it.path) && S.sel.size > 1 ? selList() : [it]; }
  else list = [itemByPath(el.dataset.p)];
  e.dataTransfer.setData('text/plain', JSON.stringify(list.filter(Boolean).map(x => ({ path: x.path, name: x.name, size: x.size, dir: x.dir, rest: x.rest })))); e.dataTransfer.effectAllowed = 'copy';
});

/* ---------- confirm, progress, done ---------- */
function openConfirm() { Object.assign(S.op, { confirmed: new Set(), word: '', result: null, prog: null }); S.modal = 'confirm'; render(); }
const trayTot = () => S.tray.reduce((a, x) => a + x.size, 0);
const askItems = () => S.tray.filter(x => ASK.has(x.rule));
function canRun() {
  if (!S.tray.length || !askItems().every(x => S.op.confirmed.has(x.path))) return false;
  if (S.op.action === 'move') return !!S.op.dest && S.op.destFree != null && S.op.destFree >= trayTot() && !S.tray.some(x => x.path.slice(0, 2).toLowerCase() === S.op.dest.slice(0, 2).toLowerCase());
  if (S.op.action === 'perm') return S.op.word.trim().toUpperCase() === t('confirm.word').toUpperCase();
  return true;
}
function modalHTML() {
  if (!S.modal) return '';
  const o = S.op;
  if (S.modal === 'prog') return `<div class="ov"><div class="md"><div class="prog"><h2>${esc(t('op.working'))}</h2>${o.action === 'move' ? `<div class="stg"><span id="s-copy">① ${esc(t('op.phase.copy'))}</span>${o.verify ? `<span id="s-verify">② ${esc(t('op.phase.verify'))}</span>` : ''}<span id="s-delete">${o.verify ? '③' : '②'} ${esc(t('op.phase.delete'))}</span></div>` : ''}<div class="pb"><i id="pbi"></i></div><small id="pbt" style="color:var(--mute)">${esc(t('scan.preparing'))}</small><div style="margin-top:22px"><button class="cancel" data-act2="opcancel">${esc(t('scan.cancel'))}</button></div></div></div></div>`;
  if (S.modal === 'done') {
    const r = o.result, ok = r.results.filter(x => x.ok), bad = r.results.filter(x => !x.ok), freed = r.results.reduce((a, x) => a + (x.freed || 0), 0);
    const head = !ok.length ? t('done.none') : o.action === 'bin' ? t('done.bin') : o.action === 'move' ? t('done.move') : t('done.perm');
    const note = !ok.length ? '' : o.action === 'bin' || (o.action === 'move' && o.origAfter === 'bin') ? t('done.binNote') : (o.action === 'move' ? t('done.moveNote', { d: o.dest }) : '');
    return `<div class="ov"><div class="md"><div class="prog"><div class="big2">${esc(F(freed))}</div><h2>${esc(head)}</h2><p style="color:var(--mute);margin:10px 0 6px;line-height:1.6">${esc(t('done.summary', { ok: ok.length, n: r.results.length }))}${note ? ' ' + esc(note) : ''}</p>
    ${bad.length ? `<div class="fails"><h4>${esc(t('done.failed', { n: bad.length }))}</h4>${bad.slice(0, 8).map(x => `<div><b>${esc(x.path)}</b><small>${esc(hasKey('err.' + x.error) ? t('err.' + x.error) : t('err.other', { e: x.error }))}</small></div>`).join('')}</div>` : ''}
    <button class="go" data-act2="donex" style="width:auto;height:auto;margin-top:18px">${esc(t('done.close'))}</button></div></div></div>`;
  }
  const asks = askItems(), tot = trayTot(), sameDrive = o.dest && S.tray.some(x => x.path.slice(0, 2).toLowerCase() === o.dest.slice(0, 2).toLowerCase());
  const move = `<div class="mvp"><div class="mrow"><label>${esc(t('confirm.dest'))}</label><div class="pth">${o.dest ? esc(o.dest) : `<span style="color:var(--mute)">${esc(t('confirm.noDest'))}</span>`}<button class="lnk" data-act2="pickdest">${esc(t(o.dest ? 'confirm.change' : 'confirm.choose'))}</button></div></div>
    ${o.dest ? `<div class="space ${!sameDrive && o.destFree >= tot ? 'ok' : 'bad'}">${esc(sameDrive ? t('confirm.sameDrive') : o.destFree >= tot ? t('confirm.spaceOk', { need: F(tot), free: F(o.destFree) }) : t('confirm.spaceBad', { need: F(tot), free: F(o.destFree) }))}</div>` : ''}
    <label class="chk"><input type="checkbox" id="ver" ${o.verify ? 'checked' : ''}> <span>${t('confirm.verify')}</span></label>
    <div class="after"><b>${esc(t(o.verify ? 'confirm.afterVerified' : 'confirm.after'))}</b>
      <label class="rad"><input type="radio" name="oa" value="perm" ${o.origAfter === 'perm' ? 'checked' : ''}> <span>${t('confirm.origPerm')}</span></label>
      <label class="rad"><input type="radio" name="oa" value="bin" ${o.origAfter === 'bin' ? 'checked' : ''}> <span>${t('confirm.origBin')}</span></label></div></div>`;
  const perm = `<div class="permp"><div class="warn">⚠ <span>${t('confirm.permWarn')}</span></div>
    <label class="chk"><input type="checkbox" id="sec" ${o.secure ? 'checked' : ''}> <span>${t('confirm.secure')}</span></label>
    <div class="typed">${esc(t('confirm.type'))} <b>${esc(t('confirm.word'))}</b> <input id="hp" value="${esc(o.word)}" placeholder="${esc(t('confirm.word'))}" autocomplete="off"></div></div>`;
  const label = o.action === 'perm' ? t('confirm.runPerm') : o.action === 'move' ? t('confirm.runMove') : t('confirm.runBin');
  return `<div class="ov"><div class="md"><div class="mh"><h2>${esc(t('confirm.title'))}</h2><p>${esc(t('confirm.sub', { n: S.tray.length, size: F(tot) }))}</p></div>
  <div class="mb">${S.tray.map(x => `<div class="ci ${asks.includes(x) ? 'ask' : ''}" style="--c:${RC[x.risk] || RC.unknown};${gradOf(x)}">${visual(x)}<div class="t"><b>${esc(x.name)}</b><small>${esc(parentOf(x.path))} · ${esc(t('risk.' + x.risk))}</small><p><b>${esc(t('an.ifDeleted'))}:</b> ${esc(ruleText(x.rule, 'del'))}</p>${asks.includes(x) ? `<label><input type="checkbox" data-conf="${esc(x.path)}" ${o.confirmed.has(x.path) ? 'checked' : ''}> ${esc(t('confirm.appAsk'))}</label>` : ''}</div><span class="s">${esc(F(x.size))}</span></div>`).join('')}
  <div class="opts"><button class="op ${o.action === 'bin' ? 'on' : ''}" data-opact="bin"><b>🗑 ${esc(t('confirm.bin'))}</b><small>${esc(t('confirm.binDesc'))}</small></button><button class="op ${o.action === 'move' ? 'on' : ''}" data-opact="move"><b>📦 ${esc(t('confirm.move'))}</b><small>${esc(t('confirm.moveDesc'))}</small></button><button class="op ${o.action === 'perm' ? 'on' : ''}" data-opact="perm"><b>⚠ ${esc(t('confirm.perm'))}</b><small>${esc(t('confirm.permDesc'))}</small></button></div>
  ${o.action === 'move' ? move : o.action === 'perm' ? perm : ''}</div>
  <div class="mf"><div class="tot">${esc(t('confirm.total'))}<b>${esc(F(tot))}</b></div><span class="sp"></span><button class="cancel" data-act2="opclose">${esc(t('scan.cancel'))}</button><button class="go" id="run" ${canRun() ? '' : 'disabled'} style="width:auto;height:auto">${esc(label)}</button></div></div></div>`;
}
api.onOpProgress(d => {
  if (S.modal !== 'prog') return; S.op.prog = d;
  const pb = $('pbi'), pt = $('pbt'); if (!pb) return;
  pb.style.width = Math.min(100, d.done / (d.total || 1) * 100) + '%';
  pt.textContent = (hasKey('op.phase.' + d.phase) ? t('op.phase.' + d.phase) : '') + (d.current ? ' · ' + d.current : '');
  ['copy', 'verify', 'delete'].forEach((ph, k) => { const el = $('s-' + ph); if (!el) return; const order = ['copy', 'verify', 'delete'], cur = order.indexOf(d.phase); el.className = cur > k ? 'done' : cur === k ? 'on' : ''; });
});
async function runOp() {
  if (!canRun()) return;
  const o = S.op; S.modal = 'prog'; render();
  const res = await api.runOp({ action: o.action, paths: S.tray.map(x => x.path), secure: o.secure, verify: o.verify, origAfter: o.origAfter, dest: o.dest });
  if (res.error) { S.modal = 'confirm'; render(); return toast(t('err.' + res.error)); }
  o.result = res;
  const okList = res.results.filter(x => x.ok);
  okList.forEach(x => S.gone.add(x.path));
  S.tray = S.tray.filter(x => !okList.some(r => same(r.path, x.path)));
  if (res.rootBytes != null && S.rootInfo) S.rootInfo.bytes = res.rootBytes;
  S.an.items = null; S.old.items = null;
  if (okList.length) S.history = [{ at: Date.now(), action: o.action, n: okList.length, bytes: res.results.reduce((a, x) => a + (x.freed || 0), 0), dest: o.action === 'move' ? o.dest : undefined }, ...S.history].slice(0, 50);
  api.setSettings({ history: S.history });
  S.drives = await api.drives();
  S.modal = 'done'; render();
  if (S.tool === 'explorer' && S.cur) go(S.cur, false); else loadTool();
}

/* ---------- analysis ---------- */
async function loadTool() {
  if (S.tool === 'analysis' && !S.an.items) { S.an.items = remember(await api.analysis()); render(); }
  if (S.tool === 'old' && !S.old.items) { const l = remember(await api.oldFiles(S.old.months)); const rk = await api.classifyMany(l.map(x => [x.path, false])); l.forEach((x, i) => Object.assign(x, rk[i])); S.old.items = l; render(); }
}
function rowX(it, total, extra = '') {
  return `<div class="rw an xr ${S.xsel === it.path ? 'sel' : ''}" data-p="${esc(it.path)}" draggable="true" style="${gradOf(it)}">${visual(it)}<div class="nm"><b>${esc(it.name)}${it.rest ? ' · ' + esc(t('an.rest')) : ''}</b><small>${esc(parentOf(it.path))}${extra}</small></div><div class="bar"><i style="width:${Math.max(2, it.size / (total || 1) * 100)}%"></i></div><div class="s">${esc(F(it.size))}</div>${addBtnX(it)}</div>`;
}
function analysisHTML() {
  if (!S.an.items) return `<div class="exp"><div class="empty2"><div class="spinner"></div>${esc(t('ex.loading'))}</div></div>`;
  const all = S.an.items.filter(x => !gone(x.path)), by = k => all.filter(x => x.risk === k), list = by(S.an.tab), tot = list.reduce((a, x) => a + x.size, 0);
  const tabs = ['safe', 'caution', 'danger'].map(k => { const l = by(k); return `<button class="at ${S.an.tab === k ? 'on' : ''}" data-antab="${k}" style="--c:${RC[k]}"><i></i><b>${esc(t('risk.' + k))}</b><span>${esc(F(l.reduce((a, x) => a + x.size, 0)))}</span><small>${esc(t('ex.items', { n: N(l.length) }))}</small></button>`; }).join('');
  const shown = list.slice(0, 400);
  return `<div class="ats">${tabs}</div>${collectAllBar(shown) ? `<div class="tb2 inl"><span class="info">${esc(t('ex.items', { n: N(list.length) }))} · ${esc(F(tot))}</span><span class="sp"></span>${collectAllBar(shown)}</div>` : ''}<div class="exp">${shown.length ? shown.map(x => rowX(x, tot)).join('') : `<div class="empty2">${esc(t('an.none'))}</div>`}</div>`;
}
function riskPanel(it) {
  if (!it) {
    const k = S.tool;
    return `<div class="hero"><span class="chip" style="--c:var(--accent)">${esc(t('nav.' + (k === 'analysis' ? 'analysis' : k === 'dups' ? 'dups' : 'old')))}</span><h2>${esc(t('panel.pick'))}</h2><small>${esc(t('panel.pickHint.' + k))}</small></div><div class="det"><div class="card"><h4>${esc(t('an.legend'))}</h4>${['safe', 'caution', 'danger'].map(r => `<p class="lg"><i style="background:${RC[r]}"></i><span><b>${esc(t('risk.' + r))}</b> · ${esc(t('risk.' + r + '.desc'))}</span></p>`).join('')}</div></div>`;
  }
  const tip = ruleText(it.rule, 'tip'), k = kindOf(it);
  const letter = it.rule === 'recycle' ? it.path[0].toUpperCase() : null;
  const preview = (k === 'foto' || k === 'video') ? `<div class="card pv"><div class="th pvimg" ${k === 'foto' ? `style="background-image:url('${fileUrl(it.path)}')"` : `data-pv="${esc(it.path)}"`}>${k === 'video' ? '<div class="play"><i></i></div>' : ''}</div></div>` : '';
  return `<div class="hero">${riskChip(it.risk)}<h2>${esc(it.name)}${it.rest ? ' · ' + esc(t('an.rest')) : ''}</h2><div class="sz">${esc(F(it.size))}</div><small>${esc(parentOf(it.path))}${it.mtime ? ' · ' + esc(fdate(it.mtime)) : ''}</small></div>
  <div class="det">${preview}<div class="card"><h4>${esc(t('an.what'))}</h4><p>${esc(ruleText(it.rule, 'what'))}</p></div><div class="card w" style="--c:${RC[it.risk] || RC.unknown}"><h4>${esc(t('an.ifDeleted'))}</h4><p>${esc(ruleText(it.rule, 'del'))}</p></div>${tip ? `<div class="card tip"><h4>${esc(t('an.tip'))}</h4><p>${esc(tip)}</p></div>` : ''}
  <div>${letter ? `<button class="big" data-empty="${letter}">${esc(S.armed === letter ? t('an.emptyConfirm') : t('an.emptyBin'))}</button>` : (it.risk === 'danger' || it.rest ? `<button class="big off">🔒 ${esc(t(it.rest ? 'tray.restLocked' : 'tray.locked'))}</button>` : `<button class="big" data-tadd="${esc(it.path)}">${esc(inTray(it.path) ? t('tray.inTray') : t('tray.add'))}</button>`)}
  <button class="big ghost" data-reveal="${esc(it.path)}">${esc(t('an.openLocation'))}</button><button class="big ghost" data-show="${esc(it.path)}">${esc(t('ctx.show'))}</button></div></div>`;
}
async function reveal(p) {
  S.tool = 'explorer'; S.xsel = null;
  const parent = parentOf(p); await go(within(parent, S.root) ? parent : S.root);
  const i = S.view.findIndex(e => same(e.path, p));
  if (i >= 0) { if (i >= S.limit) { S.limit = i + 200; render(); } S.sel = new Set([S.view[i].path]); S.anchor = S.view[i].path; refreshSel(); const el = document.querySelector(`[data-i="${i}"]`); if (el) el.scrollIntoView({ block: 'center' }); }
}

/* ---------- duplicates ---------- */
api.onDupsProgress(d => { if (S.dups.state === 'running') { S.dups.prog = d; if (S.screen === 'work' && S.tool === 'dups') render(); } });
api.onDupsDone(async d => {
  if (S.dups.state !== 'running') return;
  const groups = (d.groups || []).map(g => g.map(f => ({ ...f, name: f.path.split(/[\\/]/).pop(), dir: false })));
  const flat = groups.flat(); remember(flat);
  const rk = flat.length ? await api.classifyMany(flat.map(f => [f.path, false])) : [];
  flat.forEach((f, i) => Object.assign(f, rk[i]));
  Object.assign(S.dups, { state: 'done', groups, keep: {} }); render();
});
function dupsHTML() {
  const d = S.dups;
  if (d.state === 'idle') return `<div class="exp"><div class="dstart"><div class="ic" style="--a:#5eead4;--b:#38bdf8">${ZIP}</div><h2>${esc(t('dups.title'))}</h2><p>${esc(t('dups.intro'))}</p><div class="seg">${[1, 10, 100].map(m => `<button class="${d.min === m ? 'on' : ''}" data-dmin="${m}">≥ ${m} MB</button>`).join('')}</div><button class="orange" data-act2="dstart">${esc(t('dups.start'))}</button><small>${esc(t('dups.skip'))}</small></div></div>`;
  if (d.state === 'running') { const p = d.prog || {}; return `<div class="exp"><div class="dstart"><div class="spinner"></div><h2>${esc(t('dups.phase.' + (p.phase || 'list')))}</h2><p>${esc(t('dups.counts', { files: N(p.files || 0), cand: N(p.candidates || 0), hashed: F(p.hashed || 0) }))}</p><button class="cancel" data-act2="dcancel">${esc(t('scan.cancel'))}</button></div></div>`; }
  const groups = d.groups.map((g, gi) => ({ gi, items: g.filter(f => !gone(f.path)) })).filter(x => x.items.length > 1);
  const keepOf = x => { const k = d.keep[x.gi]; return x.items.find(f => f.path === k) || x.items[0]; };
  const extra = x => x.items.filter(f => f !== keepOf(x)), total = groups.reduce((a, x) => a + extra(x).reduce((s, f) => s + f.size, 0), 0);
  if (!groups.length) return `<div class="exp"><div class="dstart"><h2>${esc(t('dups.none'))}</h2><button class="ghostb" data-act2="dreset">${esc(t('dups.again'))}</button></div></div>`;
  return `<div class="dsum"><div><div class="n">${esc(F(total))}</div><small>${esc(t('dups.save', { n: N(groups.length) }))}</small></div><span class="sp"></span><small style="max-width:240px">${esc(t('dups.how'))}</small><button class="pbtn" data-act2="dall">${esc(t('dups.collectAll'))}</button><button class="ghostb" data-act2="dreset" style="padding:9px 14px;color:var(--accent)" title="${esc(t('dups.again'))}">⟳</button></div>
  <div class="dl">${groups.slice(0, 200).map(x => { const k = keepOf(x), f0 = x.items[0]; return `<div class="dg" style="${gradOf(f0)}"><div class="gh">${['foto', 'video'].includes(kindOf(f0)) ? visual(f0) : `<div class="fi">${glyph(f0)}</div>`}<div class="t"><b>${esc(f0.name)}</b><small>${esc(t('dups.copies', { n: x.items.length, size: F(f0.size) }))}</small></div><div class="sv">${esc(F(extra(x).reduce((s, f) => s + f.size, 0)))}<small> ${esc(t('dups.saveable'))}</small></div><button class="pbtn" data-dcol="${x.gi}" style="padding:9px 14px">${esc(t('dups.collect', { n: extra(x).length }))}</button></div>
    ${x.items.map(f => `<div class="dc xr ${f === k ? 'keep' : ''} ${S.xsel === f.path ? 'sel' : ''}" data-p="${esc(f.path)}" draggable="true"><div class="t"><b>${esc(parentOf(f.path))}</b><small>${esc(t('dups.changed', { d: fdate(f.mtime) }))}</small></div><button class="kp" data-dkeep="${x.gi}" data-path="${esc(f.path)}">${esc(f === k ? '✓ ' + t('dups.kept') : t('dups.keep'))}</button>${f === k ? '' : addBtnX(f)}</div>`).join('')}</div>`; }).join('')}</div>`;
}
const dupGroups = () => S.dups.groups.map((g, gi) => ({ gi, items: g.filter(f => !gone(f.path)) })).filter(x => x.items.length > 1);
const dupExtras = x => { const k = S.dups.keep[x.gi], keep = x.items.find(f => f.path === k) || x.items[0]; return x.items.filter(f => f !== keep); };

/* ---------- old files ---------- */
function oldHTML() {
  const seg = `<div class="tb2 inl"><span class="info">${esc(t('old.intro'))}</span><span class="sp"></span>${S.old.items ? collectAllBar(S.old.items.filter(v => !gone(v.path)).slice(0, 400)) : ''}<div class="seg">${[6, 12, 24, 36].map(m => `<button class="${S.old.months === m ? 'on' : ''}" data-omonths="${m}">${esc(t('old.months', { n: m }))}</button>`).join('')}</div></div>`;
  if (!S.old.items) return seg + `<div class="exp"><div class="empty2"><div class="spinner"></div>${esc(t('ex.loading'))}</div></div>`;
  const list = S.old.items.filter(x => !gone(x.path)), tot = list.reduce((a, x) => a + x.size, 0);
  return seg + `<div class="exp">${list.length ? `<p class="osum">${esc(t('old.sum', { n: N(list.length), size: F(tot) }))}</p>` + list.slice(0, 400).map(x => rowX(x, tot, ' · ' + esc(t('old.changed', { d: fdate(x.mtime) })))).join('') : `<div class="empty2">${esc(t('old.none'))}</div>`}</div>`;
}

/* ---------- tool frame ---------- */
function toolTop() {
  const ti = { analysis: 'nav.analysis', dups: 'nav.dups', old: 'ov.old' }[S.tool], sub = { analysis: 'an.sub', dups: 'dups.sub', old: 'old.sub' }[S.tool];
  return `<div class="tb1"><div style="flex:1"><small style="color:var(--mute);font-size:13px">${esc(t(sub))}</small><h1 style="font-size:26px;letter-spacing:-.7px">${esc(t(ti))}</h1></div></div>`;
}
const addable = list => list.filter(it => it.risk !== 'danger' && !it.rest && !inTray(it.path));
function collectAllBar(list) {
  const l = addable(list), size = l.reduce((a, v) => a + v.size, 0);
  return l.length ? `<button class="pbtn sm" data-act2="collectall">🧺 ${esc(t('tray.collectAll', { n: N(l.length), size: F(size) }))}</button>` : '';
}
const currentList = () => S.tool === 'analysis' ? (S.an.items || []).filter(v => v.risk === S.an.tab && !gone(v.path)).slice(0, 400) : S.tool === 'old' ? (S.old.items || []).filter(v => !gone(v.path)).slice(0, 400) : [];
const toolMain = () => S.tool === 'analysis' ? analysisHTML() : S.tool === 'dups' ? dupsHTML() : oldHTML();
const toolPanel = () => riskPanel(S.xsel ? itemByPath(S.xsel) : null);
function toolCtx(ev) {
  const row = ev.target.closest('[data-p]'); if (!row) return;
  const it = itemByPath(row.dataset.p); if (!it) return;
  S.xsel = it.path; document.querySelectorAll('.xr').forEach(x => x.classList.toggle('sel', x.dataset.p === it.path)); $('panel').innerHTML = toolPanel(); applyPreviewThumbs();
  const L = [];
  if (it.risk !== 'danger' && !it.rest) L.push({ t: t('tray.add'), ic: '🧺', f: () => addTray([it]) }, { t: t('ctx.delete'), ic: '🗑', k: 'Del', f: () => deleteNow([it]) }, { sep: true });
  L.push({ t: t('an.openLocation'), ic: '📂', f: () => reveal(it.path) }, { t: t('ctx.show'), ic: '🗂', f: () => api.show(it.path) }, { t: t('ctx.copyPath'), ic: '📋', f: () => copyPaths([it]) });
  if (!it.dir) L.push({ t: t('ctx.openWith'), ic: '▶', f: () => api.open(it.path) });
  showCtx(ev.clientX, ev.clientY, L);
}

/* ---------- clicks for the tools ---------- */
document.addEventListener('click', async ev => {
  const c = s => ev.target.closest(s); let el;
  if (el = c('[data-tool]')) { if (el.classList.contains('dis')) return; S.tool = el.dataset.tool; S.xsel = null; S.screen = 'work'; if (S.tool === 'explorer' && !S.cur) return explore(); render(); return loadTool(); }
  if (el = c('[data-tadd]')) { ev.stopPropagation(); return addTray([itemByPath(el.dataset.tadd)]); }
  if (el = c('[data-trm]')) { S.tray = S.tray.filter(x => !same(x.path, el.dataset.trm)); return render(); }
  if (el = c('[data-antab]')) { S.an.tab = el.dataset.antab; S.xsel = null; return render(); }
  if (el = c('[data-reveal]')) return reveal(el.dataset.reveal);
  if (el = c('[data-show]')) return api.show(el.dataset.show);
  if (el = c('[data-analyze]')) { const e = itemByPath(el.dataset.analyze) || { path: el.dataset.analyze, name: el.dataset.analyze.split(/[\\/]/).pop(), size: 0 }; const r = await api.classifyMany([[e.path, !!e.dir]]); const it = { ...e, ...r[0] }; S.known.set(it.path, it); S.tool = 'analysis'; S.xsel = it.path; render(); return loadTool(); }
  if (el = c('[data-empty]')) { const l = el.dataset.empty; if (S.armed !== l) { S.armed = l; $('panel').innerHTML = toolPanel(); setTimeout(() => { if (S.armed === l) { S.armed = null; if ($('panel') && S.tool !== 'explorer') $('panel').innerHTML = toolPanel(); } }, 4000); return; } S.armed = null; toast(t('an.emptying')); const ok = await api.emptyBin(l); toast(ok ? t('an.emptied') : t('err.other', { e: 'Recycle Bin' })); S.drives = await api.drives(); S.gone.add(l + ':\\$Recycle.Bin'); return render(); }
  if (el = c('[data-dmin]')) { S.dups.min = +el.dataset.dmin; return render(); }
  if (el = c('[data-dkeep]')) { S.dups.keep[el.dataset.dkeep] = el.dataset.path; S.tray = S.tray.filter(x => !same(x.path, el.dataset.path)); return render(); }
  if (el = c('[data-dcol]')) { const x = dupGroups().find(g => g.gi === +el.dataset.dcol); return x && addTray(dupExtras(x)); }
  if (el = c('[data-omonths]')) { S.old.months = +el.dataset.omonths; S.old.items = null; render(); return loadTool(); }
  if (el = c('[data-opact]')) { S.op.action = el.dataset.opact; render(); const mb = document.querySelector('.md .mb'); if (mb && S.op.action !== 'bin') mb.scrollTop = mb.scrollHeight; return; }
  if (el = c('#go')) return openConfirm();
  if (el = c('#run')) return runOp();
  if (el = c('[data-act2]')) {
    const a = el.dataset.act2;
    if (a === 'trayclear') { S.tray = []; return render(); }
    if (a === 'opclose') { S.modal = null; return render(); }
    if (a === 'opcancel') return api.cancelOp();
    if (a === 'donex') { S.modal = null; return render(); }
    if (a === 'pickdest') { const p = await api.pickDest(); if (p) { S.op.dest = p; S.op.destFree = await api.free(p); } return render(); }
    if (a === 'dstart') { Object.assign(S.dups, { state: 'running', prog: null, groups: [], keep: {} }); render(); return api.dupsStart({ root: S.root, minSize: S.dups.min * 1048576 }); }
    if (a === 'dcancel') { api.dupsCancel(); S.dups.state = 'idle'; return render(); }
    if (a === 'dreset') { S.dups.state = 'idle'; return render(); }
    if (a === 'dall') return addTray(dupGroups().flatMap(dupExtras));
    if (a === 'collectall') return addTray(addable(currentList()));
  }
  if (el = c('.xr[data-p]')) { S.xsel = el.dataset.p; document.querySelectorAll('.xr').forEach(x => x.classList.toggle('sel', x.dataset.p === S.xsel)); $('panel').innerHTML = toolPanel(); applyPreviewThumbs(); }
});
document.addEventListener('change', e => {
  const tg = e.target;
  if (tg.dataset.conf) { tg.checked ? S.op.confirmed.add(tg.dataset.conf) : S.op.confirmed.delete(tg.dataset.conf); return render(); }
  if (tg.id === 'sec') S.op.secure = tg.checked;
  if (tg.id === 'ver') { S.op.verify = tg.checked; render(); }
  if (tg.name === 'oa') { S.op.origAfter = tg.value; render(); }
});
document.addEventListener('input', e => { if (e.target.id === 'hp') { S.op.word = e.target.value; const r = $('run'); if (r) r.disabled = !canRun(); } });
document.addEventListener('dblclick', e => { const el = e.target.closest('.xr[data-p]'); if (el && S.tool !== 'explorer') { const it = itemByPath(el.dataset.p); if (it && it.dir) reveal(it.path); else if (it) api.open(it.path); } });
document.addEventListener('keydown', e => {
  if (S.screen !== 'work' || S.modal || S.viewer || S.props || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { if (e.key === 'Escape' && S.modal === 'confirm') { S.modal = null; render(); } return; }
  if (e.key === 'Delete') { if (S.tool === 'explorer') { const l = selList(); if (l.length) deleteNow(l); } else if (S.xsel) deleteNow([itemByPath(S.xsel)]); }
});
