/* DiskLens renderer: home, scan, results, Explorer, settings. All data comes from the main process. */
const $ = id => document.getElementById(id);
const S = {
  screen: 'home', prev: 'home', lang: 'en', langs: {}, drives: [], recent: [], paths: {}, version: '',
  root: null, rootInfo: null, scan: null, quick: [],
  cur: null, hist: [], hp: 0, entries: [], view: [], total: null, info: null, loading: false, err: null, truncated: false,
  sel: new Set(), anchor: null, xopen: new Set(), kids: new Map(), sortK: 'size', sortD: -1, mode: 'list', q: '', limit: 1500, viewer: null, props: null,
};

/* ---------- language ---------- */
const t = (k, v = {}) => {
  const d = S.langs[S.lang] || {}, f = S.langs.en || {};
  let s = d[k] ?? f[k] ?? k;
  if (String(v.n) === '1') s = d[k + '.one'] ?? (d[k] !== undefined ? s : f[k + '.one']) ?? s;
  for (const x in v) s = s.split('{' + x + '}').join(v[x]);
  return s;
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = () => new Intl.NumberFormat(S.lang, { maximumFractionDigits: 1 });
const F = b => {
  if (b == null) return '—';
  if (b >= 1073741824) return nf().format(b / 1073741824) + ' GB';
  if (b >= 1048576) return Math.round(b / 1048576) + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
};
const N = n => Math.round(n).toLocaleString(S.lang);
const fdate = ms => ms ? new Intl.DateTimeFormat(S.lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(ms) : '—';
const fdur = ms => ms < 60000 ? Math.max(1, Math.round(ms / 1000)) + ' s' : Math.floor(ms / 60000) + ' min ' + Math.round(ms % 60000 / 1000) + ' s';

/* ---------- icons ---------- */
const FOLDER = '<svg viewBox="0 0 24 24"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2.5h7.5A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>';
const FILE = '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm6 1.5V9h4.5z"/></svg>';
const ZIP = '<svg viewBox="0 0 24 24"><path d="M4 4h16v4H4zm1 5h14v11H5zm6 1v2h2v-2zm0 3v2h2v-2zm0 3v2h2v-2z"/></svg>';
const PHONE = '<svg viewBox="0 0 24 24"><path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 3v13h8V5zm4 14.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z"/></svg>';
const DISK = '<svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm3 9a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm3 0v2h7v-2z"/></svg>';
const GEAR = '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.5 4.5v-2l-2-.6-.5-1.2 1-1.800-1.400-1.400-1.800 1-1.200-.5-.6-2h-2l-.6 2-1.200.5-1.800-1L5.600 7.400l1 1.800-.5 1.200-2 .6v2l2 .6.5 1.200-1 1.800 1.400 1.400 1.800-1 1.200.5.6 2h2l.6-2 1.200-.5 1.800 1 1.400-1.400-1-1.800.5-1.200z"/></svg>';
const ICON_AN = '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5zm-1.2 13.6l6-6-1.400-1.400-4.600 4.600-2.200-2.200-1.400 1.400z"/></svg>';
const ICON_OLD = '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm1 5h-2v6l5 3 1-1.700-4-2.300z"/></svg>';
const ICON_TYPES = '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const LOGO = '<svg viewBox="0 0 40 40"><defs><linearGradient id="lgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cff"/><stop offset="1" stop-color="#ff80d8"/></linearGradient></defs><rect width="40" height="40" rx="12" fill="url(#lgg)"/><circle cx="17" cy="17" r="9" fill="none" stroke="#fff" stroke-width="3.4"/><path d="M17 17V10.2A6.8 6.8 0 0 1 23.8 17Z" fill="#fff" opacity=".9"/><path d="M23.5 23.5L30.5 30.5" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/></svg>';
const ILLU = '<svg viewBox="0 0 140 120"><defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd37a"/><stop offset="1" stop-color="#ff9f43"/></linearGradient></defs><path d="M20 40a10 10 0 0 1 10-10h28l10 12h42a10 10 0 0 1 10 10v44a10 10 0 0 1-10 10H30a10 10 0 0 1-10-10z" fill="url(#fg)"/><rect x="28" y="38" width="86" height="40" rx="6" fill="#fff" opacity=".85" transform="rotate(-4 70 58)"/><path d="M20 58h104v38a10 10 0 0 1-10 10H30a10 10 0 0 1-10-10z" fill="#ffb54f"/><circle cx="104" cy="30" r="14" fill="#fff" opacity=".9"/><circle cx="92" cy="26" r="9" fill="#fff" opacity=".9"/><circle cx="116" cy="36" r="6" fill="#ff80d8"/><circle cx="96" cy="46" r="5" fill="#5eead4"/><circle cx="62" cy="20" r="14" fill="none" stroke="#fff" stroke-width="5"/><path d="M72 30l12 12" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>';
const PAL = [['#ffc15e', '#ff9f2e'], ['#5eead4', '#38bdf8'], ['#ff80d8', '#c76cff'], ['#7dd3fc', '#6aa5ff'], ['#b79bff', '#7c4dff']];
const CATC = { video: ['#ff80d8', '#c76cff'], image: ['#5eead4', '#38bdf8'], audio: ['#b79bff', '#7c4dff'], doc: ['#fda4af', '#f43f5e'], archive: ['#ffc15e', '#ff9f2e'], app: ['#7dd3fc', '#6aa5ff'], other: ['#cbd5e1', '#94a3b8'] };

/* ---------- file kinds ---------- */
const KINDS = {};
const kind = (k, list) => list.split(' ').forEach(e => { KINDS[e] = k; });
kind('foto', 'jpg jpeg png gif webp bmp heic tif tiff'); kind('video', 'mp4 mkv avi mov wmv webm flv m4v mpg mpeg');
kind('audio', 'mp3 wav flac aac ogg m4a wma opus'); kind('doc', 'pdf doc docx xls xlsx ppt pptx txt md rtf csv odt');
kind('zip', 'zip rar 7z tar gz bz2 iso'); kind('exe', 'exe msi bat cmd dll');
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h; };
const extOf = n => { const m = /\.([a-z0-9]{1,6})$/i.exec(n); return m ? m[1].toLowerCase() : ''; };
const kindOf = e => e.dir ? 'folder' : (KINDS[extOf(e.name)] || 'file');
const gradOf = e => { const p = PAL[hash(e.name) % 5]; return `--a:${p[0]};--b:${p[1]}`; };
const glyph = e => kindOf(e) === 'folder' ? FOLDER : kindOf(e) === 'zip' ? ZIP : FILE;
const fileUrl = p => encodeURI('file:///' + p.replace(/\\/g, '/')).replace(/#/g, '%23');
const sep = () => (S.root && S.root.includes('/') && !S.root.includes('\\')) ? '/' : '\\';
const parentOf = p => { const s = sep(), i = p.replace(/[\\/]+$/, '').lastIndexOf(s); return i <= 2 && s === '\\' ? p.slice(0, 3) : p.slice(0, i); };
const same = (a, b) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();
const within = (p, root) => { const a = p.toLowerCase(), r = root.replace(/[\\/]+$/, '').toLowerCase(); return a === r || a.startsWith(r + '\\') || a.startsWith(r + '/'); };

/* ---------- toast ---------- */
let toastT;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); }

/* ---------- shared blocks ---------- */
const logoBtn = cls => `<button class="${cls}" data-act="home" title="${esc(t('nav.home'))}"><span class="lgo">${LOGO}</span>DiskLens</button>`;
const gearBtn = () => `<button class="gearb" data-act="settings" title="${esc(t('settings.title'))}">${GEAR}</button>`;
const shell = body => `<div class="shell"><div class="top2">${logoBtn('logo2')}<span class="sp"></span>${gearBtn()}</div>${body}</div>`;
const driveName = d => d.type === 'phone' ? d.label + (d.storage ? ' · ' + d.storage : '') : (d.label || t(d.type === 2 ? 'drive.removable' : d.type === 4 ? 'drive.network' : 'drive.local')) + ' (' + d.letter + ')';
const rootName = () => { const d = S.drives.find(x => same(x.letter + '\\', S.root || '')); return d ? d.letter + '\\' : (S.root || ''); };

/* ---------- home ---------- */
function homeHTML() {
  const first = S.drives.find(d => d.type === 3) || S.drives[0];
  return shell(`<div class="homegrid"><div class="hl"><div class="hero2"><div><h1>${esc(t('home.title'))}</h1><p>${esc(t('home.sub'))}</p>
    <button class="orange" ${first ? `data-scan="${esc(first.letter)}\\"` : 'disabled'}>${esc(t('home.scanDrive', { d: first ? first.letter : '' }))}</button><button class="lnk2" data-act="pick">${esc(t('home.pickFolder'))}</button></div>${ILLU}</div></div>
  <div class="hr"><h3>${esc(t('home.drives'))}</h3>${S.drives.map((d, i) => { const used = d.total - d.free; return `<div class="dr"><div class="ic" style="--a:${PAL[i % 5][0]};--b:${PAL[i % 5][1]}">${d.type === 'phone' ? PHONE : DISK}</div><div class="t"><b>${esc(driveName(d))}</b><small>${esc(d.locked ? t('phone.locked') : t('home.used', { used: F(used), total: F(d.total) }))}</small>${d.locked ? '' : `<div class="mb"><i style="width:${used / d.total * 100}%"></i></div>`}</div>${d.locked ? `<button class="scanb" data-act="redrives">⟳</button>` : `<button class="scanb" data-scan="${esc(d.letter)}\\">${esc(t('home.scan'))}</button>`}</div>`; }).join('') || `<p style="color:var(--mute)">${esc(t('home.noDrives'))}</p>`}
  <h3>${esc(t('home.recent'))}</h3>${S.recent.length ? S.recent.map(r => `<div class="ls"><div class="ic" style="--a:#b79bff;--b:#7c4dff;width:40px;height:40px;border-radius:13px">${DISK}</div><div class="t"><b>${esc(r.root)}</b><small>${esc(fdate(r.at))} · ${esc(N(r.files))} ${esc(t('scan.files'))}</small></div><span class="s">${esc(F(r.bytes))}</span><button class="rescan" data-scan="${esc(r.root)}">${esc(t('home.rescan'))}</button></div>`).join('') : `<p style="color:var(--mute);font-size:13px">${esc(t('home.noRecent'))}</p>`}</div></div>`);
}

/* ---------- scan ---------- */
function scanHTML() {
  const name = esc(S.scan.root);
  return shell(`<div class="scanbox"><div class="ringw"><svg viewBox="0 0 190 190"><circle cx="95" cy="95" r="80" fill="none" stroke="var(--ring, #eee9fb)" stroke-width="16"/><circle id="rg" class="${S.scan.used ? '' : 'spin'}" cx="95" cy="95" r="80" fill="none" stroke="url(#sg)" stroke-width="16" stroke-linecap="round" stroke-dasharray="${S.scan.used ? '0 503' : '150 503'}"/><defs><linearGradient id="sg"><stop offset="0" stop-color="#ff80d8"/><stop offset="1" stop-color="#7c4dff"/></linearGradient></defs></svg><div class="pct" id="pc">${S.scan.used ? '0%' : '…'}</div></div>
  <h2>${esc(t('scan.title', { name: S.scan.root }))}</h2><div class="path" id="sp">${esc(t('scan.preparing'))}</div>
  <div class="stats"><div><b id="sf">0</b><small>${esc(t('scan.files'))}</small></div><div><b id="sd">0</b><small>${esc(t('scan.folders'))}</small></div><div><b id="ss">0 B</b><small>${esc(t('scan.size'))}</small></div></div>
  <div class="live"><h4>${esc(t('scan.biggest'))}</h4><div id="lv"></div></div><p class="ro">${esc(t('scan.readonly'))}</p><button class="ghostb" data-act="cancel">${esc(t('scan.cancel'))}</button></div>`);
}
function updateScan() {
  const s = S.scan; if (!$('sf')) return;
  $('sf').textContent = N(s.files); $('sd').textContent = N(s.dirs); $('ss').textContent = F(s.bytes); $('sp').textContent = s.cur;
  if (s.used) { const p = Math.min(99, s.bytes / s.used * 100); $('rg').setAttribute('stroke-dasharray', `${503 * p / 100} 503`); $('pc').textContent = Math.round(p) + '%'; }
  const mx = (s.top[0] && s.top[0].size) || 1;
  $('lv').innerHTML = s.top.slice(0, 5).map((f, i) => `<div class="lr" style="--a:${PAL[i % 5][0]};--b:${PAL[i % 5][1]}"><span title="${esc(f.path)}">${esc(f.name)}</span><div class="bar"><i style="width:${f.size / mx * 100}%"></i></div><span class="v">${esc(F(f.size))}</span></div>`).join('');
}
async function startScan(root) {
  const d = S.drives.find(x => same(x.letter + '\\', root));
  S.scan = { root, files: 0, dirs: 0, bytes: 0, cur: root, top: [], used: d && d.type !== 'phone' ? d.total - d.free : 0 }; // a phone's used space includes Android itself, which cannot be read
  S.rootInfo = null; S.prev = 'home'; S.screen = 'scan'; render();
  await api.scan({ root });
}
api.onProgress(d => { if (S.screen === 'scan') { Object.assign(S.scan, d); updateScan(); } });
api.onDone(async d => {
  if (d.error) { S.screen = 'home'; render(); return toast(/PHONE/.test(d.error) ? t('phone.failed') : d.error); }
  S.rootInfo = d; S.root = d.root;
  const rec = [{ root: d.root, bytes: d.bytes, files: d.files, at: Date.now() }, ...S.recent.filter(r => !same(r.root, d.root))].slice(0, 5);
  S.recent = rec; api.setSettings({ recent: rec });
  S.tray = []; S.gone = new Set(); S.known = new Map(); S.xsel = null; S.tool = 'explorer';
  Object.assign(S.an, { items: null, tab: 'safe' }); Object.assign(S.dups, { state: 'idle', groups: [], keep: {} }); S.old.items = null; S.oldCount = null; Object.assign(S.types, { items: null, sum: null });
  S.screen = 'overview'; render(); loadQuick();
  S.an.items = remember(await api.analysis());
  const old = await api.oldFiles(12); S.oldCount = { n: old.length, size: old.reduce((a, x) => a + x.size, 0) };
  if (S.screen === 'overview') render();
});
async function loadQuick() {
  const names = ['desktop', 'downloads', 'documents', 'pictures', 'videos', 'music'];
  const list = names.filter(k => S.paths[k] && within(S.paths[k], S.root)).map(k => ({ key: k, path: S.paths[k] }));
  S.quick = await Promise.all(list.map(async q => ({ ...q, size: await api.size(q.path) })));
  if (S.screen === 'work') render();
}

/* ---------- results ---------- */
function overviewHTML() {
  const r = S.rootInfo, drive = S.drives.find(d => S.root.toUpperCase().startsWith(d.letter.toUpperCase())), isDrive = drive && same(drive.letter + '\\', S.root);
  const order = ['video', 'image', 'audio', 'doc', 'archive', 'app', 'other'], tot = r.bytes || 1;
  const card = (tool, ic, a, b, ti, de, st) => `<button class="ac" data-tool="${tool}" style="--a:${a};--b:${b}"><div class="ic">${ic}</div><span class="go2">›</span><b>${esc(ti)}</b><small>${esc(de)}</small><span class="st">${esc(st)}</span></button>`;
  const safeSum = S.an.items ? S.an.items.filter(x => x.risk === 'safe' && !gone(x.path)).reduce((a, x) => a + x.size, 0) : null;
  return shell(`<div class="ovh"><div><small>${esc(t('ov.done', { time: fdur(r.ms) }))}</small><h1>${esc(t('ov.title', { name: S.root }))}</h1></div><span class="pill">${esc(F(r.bytes))}</span><span class="pill">${esc(N(r.files))} ${esc(t('scan.files'))}</span><span class="pill">${esc(N(r.dirs))} ${esc(t('scan.folders'))}</span><span class="sp"></span><button class="ghostb" data-scan="${esc(S.root)}">⟳ ${esc(t('ov.rescan'))}</button><button class="ghostb" data-act="home">${esc(t('ov.change'))}</button></div>
  <div class="ovgrid"><div class="card2"><h3>${esc(t('ov.byType'))}</h3><div class="stk">${order.map(k => `<i style="--a:${CATC[k][0]};--b:${CATC[k][1]};flex:${Math.max(r.cats[k], tot * 0.004)}" title="${esc(t('cat.' + k))}"></i>`).join('')}</div><div class="cl">${order.map(k => `<div style="--a:${CATC[k][0]};--b:${CATC[k][1]}" ${TYPE_TABS.includes(k) ? `data-tool="types" data-tcat="${k}" class="clk"` : ''}><i></i><span>${esc(t('cat.' + k))}</span><b>${esc(F(r.cats[k]))}</b></div>`).join('')}</div></div>
  <div class="side2"><div class="safe"><small>${esc(isDrive || !drive ? t('ov.free') : t('ov.freeOn', { d: drive.letter }))}</small><div class="n">${drive ? esc(F(drive.free)) : '—'}</div><p>${drive ? esc(t('home.used', { used: F(drive.total - drive.free), total: F(drive.total) })) : ''}</p><button data-act="explore">${esc(t('ov.openExplorer'))} ›</button></div>${drive && drive.type === 'phone' ? `<div class="free"><span>${esc(t('phone.note'))}</span></div>` : ''}${r.unread ? `<div class="free"><span>${esc(t('ov.unread', { n: N(r.unread) }))}</span></div>` : ''}${r.linked ? `<div class="free"><span>${esc(t('ov.linked', { n: N(r.linked) }))}</span></div>` : ''}</div></div>
  <h3 class="ovh2">${esc(t('ov.choose'))}</h3><div class="acts"><button class="ac" data-tool="explorer" style="--a:#8b5cff;--b:#6c3ef2"><div class="ic">${FOLDER}</div><span class="go2">›</span><b>${esc(t('nav.explorer'))}</b><small>${esc(t('ov.explorerDesc'))}</small><span class="st">${esc(t('ov.explorerBadge'))}</span></button>
  ${card('analysis', ICON_AN, '#ffc15e', '#ff9f2e', t('nav.analysis'), t('ov.analysisDesc'), safeSum == null ? t('ex.loading') : t('ov.safeBadge', { size: F(safeSum) }))}${card('dups', ZIP, '#5eead4', '#38bdf8', t('nav.dups'), t('ov.dupsDesc'), t('ov.dupsBadge'))}${card('old', ICON_OLD, '#b79bff', '#7c4dff', t('ov.old'), t('ov.oldDesc'), S.oldCount ? t('ov.oldBadge', { n: N(S.oldCount.n), size: F(S.oldCount.size) }) : t('ex.loading'))}${card('types', ICON_TYPES, '#ff80d8', '#c76cff', t('nav.types'), t('ov.typesDesc'), t('ov.typesBadge'))}</div>`);
}

/* ---------- explorer ---------- */
const itemOf = i => S.view[i];
function buildView() {
  const k = S.sortK, d = S.sortD, val = e => k === 'name' ? e.name.toLowerCase() : k === 'date' ? e.mtime : (e.size == null ? -1 : e.size);
  const sort = L => L.sort((a, b) => { if (k === 'name' && a.dir !== b.dir) return a.dir ? -1 : 1; const x = val(a), y = val(b); return d * (x < y ? -1 : x > y ? 1 : 0); });
  let L = S.entries.slice();
  if (S.q) L = L.filter(e => e.name.toLowerCase().includes(S.q.toLowerCase()));
  const tree = S.mode === 'list' && !S.q, out = [];
  const add = (list, depth) => sort(list).forEach(e => {
    e.depth = depth; out.push(e);
    if (tree && e.dir && S.xopen.has(e.path) && S.kids.get(e.path)) add(S.kids.get(e.path).slice(), depth + 1);
  });
  add(L, 0);
  S.view = out;
}
async function toggleOpen(p) {
  if (S.xopen.has(p)) { S.xopen.delete(p); return render(); }
  S.xopen.add(p);
  if (!S.kids.get(p)) { const r = await api.list(p); S.kids.set(p, r.error ? [] : r.entries); }
  render();
}
const folderTotal = () => S.total != null ? S.total : S.entries.reduce((a, e) => a + (e.size || 0), 0);
function sideHTML() {
  const nv = (act, ic, label, extra = '') => `<button class="nv ${extra}" ${act}>${ic}<span>${esc(label)}</span></button>`;
  const drive = S.drives.find(d => same(d.letter + '\\', S.root));
  return `<aside class="side"><button class="brand" data-act="home" title="${esc(t('nav.home'))}"><span class="lgo">${LOGO}</span>DiskLens</button>
  <button class="nv" data-act="overview" style="color:var(--accent)"><span>‹ ${esc(t('nav.results'))}</span></button>
  <div class="dv"><b>${esc(drive ? driveName(drive) : S.root)}</b><small>${drive ? esc(t('home.used', { used: F(drive.total - drive.free), total: F(drive.total) })) : esc(F(S.rootInfo.bytes))}</small><div class="mb"><i style="width:${drive ? (drive.total - drive.free) / drive.total * 100 : 100}%"></i></div></div>
  <h5>${esc(t('nav.tools'))}</h5>${[['explorer', FOLDER, 'nav.explorer'], ['analysis', ICON_AN, 'nav.analysis'], ['dups', ZIP, 'nav.dups'], ['old', ICON_OLD, 'ov.old'], ['types', ICON_TYPES, 'nav.types']].map(([k, ic, l]) => `<button class="nv ${S.tool === k ? 'on' : ''}" data-tool="${k}">${ic}<span>${esc(t(l))}</span></button>`).join('')}
  <h5>${esc(t('nav.quick'))}</h5><button class="nv q" data-go="${esc(S.root)}"><span>${esc(rootName())} ${esc(t('nav.root'))}</span><em>${esc(F(S.rootInfo.bytes))}</em></button>${S.quick.map(q => `<button class="nv q" data-go="${esc(q.path)}"><span>${esc(t('quick.' + q.key))}</span><em>${esc(F(q.size))}</em></button>`).join('')}
  <div class="grow"></div><button class="nv" data-act="settings">${GEAR}<span>${esc(t('settings.title'))}</span></button></aside>`;
}
function crumbs() {
  const rel = S.cur.slice(S.root.replace(/[\\/]+$/, '').length).split(/[\\/]+/).filter(Boolean), out = [{ n: rootName().replace(/\\$/, ''), p: S.root }];
  let acc = S.root.replace(/[\\/]+$/, '');
  for (const r of rel) { acc += sep() + r; out.push({ n: r, p: acc }); }
  return out.map(c => `<button data-go="${esc(c.p)}">${esc(c.n)}</button>`).join('<span>›</span>');
}
function statText() {
  const n = S.sel.size, sum = [...S.sel].reduce((a, p) => { const e = S.view.find(x => x.path === p); return a + (e && e.size || 0); }, 0);
  return (n ? t('ex.selected', { n }) + ' · ' + F(sum) + ' · ' : '') + t('ex.items', { n: N(S.view.filter(e => !e.depth).length) }) + ' · ' + F(folderTotal()) + (n ? '' : ' · ' + t('ex.hint'));
}
function workHTML() {
  if (S.tool !== 'explorer') return `<div class="work">${sideHTML()}<div class="tbar">${toolTop()}</div><main>${toolMain()}</main>${trayHTML()}<div class="panel" id="panel">${toolPanel()}</div></div>${modalHTML()}${viewerHTML()}${propsHTML()}`;
  buildView();
  const can = { back: S.hp > 0, fwd: S.hp < S.hist.length - 1, up: !same(S.cur, S.root) };
  return `<div class="work">${sideHTML()}<div class="tbar"><div class="tb1"><button class="nb" data-act="back" ${can.back ? '' : 'disabled'} title="${esc(t('ex.back'))}">‹</button><button class="nb" data-act="fwd" ${can.fwd ? '' : 'disabled'} title="${esc(t('ex.fwd'))}">›</button><button class="nb" data-act="up" ${can.up ? '' : 'disabled'} title="${esc(t('ex.up'))}">↑</button>
  <div class="addr">${crumbs()}</div><div class="sch"><span>🔍</span><input id="q" placeholder="${esc(t('ex.search'))}" value="${esc(S.q)}" autocomplete="off"></div></div>
  <div class="tb2"><button class="selall" id="selall" data-act="selall">${esc(selAllLabel())}</button><span class="info" id="stat">${esc(statText())}</span><span class="sp"></span><div class="seg">${[['list', 'ex.list'], ['grid', 'ex.grid'], ['map', 'ex.map']].map(([k, l]) => `<button class="${S.mode === k ? 'on' : ''}" data-mode="${k}">${esc(t(l))}</button>`).join('')}</div></div></div>
  <main>${expMain()}</main>${trayHTML()}<div class="panel" id="panel">${panelHTML()}</div></div>${modalHTML()}${viewerHTML()}${propsHTML()}`;
}
function visual(e, i, grad) {
  const k = kindOf(e);
  if (k === 'foto' || k === 'video') return `<div class="th" data-thp="${esc(e.path)}">${k === 'video' ? `<div class="play"><i></i></div>` : ''}</div>`;
  return `<div class="ic" style="${grad || gradOf(e)}">${glyph(e)}</div>`;
}
function expMain() {
  if (S.loading) return `<div class="exp"><div class="empty2"><div class="spinner"></div>${esc(t('ex.loading'))}</div></div>`;
  if (S.err) return `<div class="exp"><div class="empty2">${esc(S.err === 'EPERM' || S.err === 'EACCES' ? t('ex.denied') : t('ex.error') + ' (' + S.err + ')')}</div></div>`;
  if (!S.view.length) return `<div class="exp"><div class="empty2">${esc(S.q ? t('ex.nomatch') : t('ex.empty'))}</div></div>`;
  if (S.mode === 'map') return `<div class="exp"><div class="tmw" id="tmw"></div></div>`;
  const tot = folderTotal() || 1, shown = S.view.slice(0, S.limit), more = S.view.length - shown.length;
  const moreBtn = more > 0 ? `<button class="morebtn" data-act="more">${esc(t('ex.more', { n: N(more) }))}</button>` : '';
  if (S.mode === 'grid') return `<div class="exp"><div class="grid">${shown.map((e, i) => `<div class="gf ${S.sel.has(e.path) ? 'sel' : ''}" data-i="${i}" draggable="true" style="${gradOf(e)}">${kindOf(e) === 'foto' || kindOf(e) === 'video' ? visual(e, i) : `<div class="fi">${glyph(e)}</div>`}<b>${esc(e.name)}</b><small><span>${esc(F(e.size))}</span><span>${esc(t('kind.' + kindOf(e)))}</span></small><button class="add ${inTray(e.path) ? 'in' : ''}" data-tadd="${esc(e.path)}" title="${esc(t('tray.add'))}">${inTray(e.path) ? '✓' : '+'}</button></div>`).join('')}</div>${moreBtn}</div>`;
  const hb = (k, l) => `<button class="${S.sortK === k ? 'on' : ''}" data-sort="${k}">${esc(t(l))}${S.sortK === k ? (S.sortD < 0 ? ' ↓' : ' ↑') : ''}</button>`;
  let depth = 0;
  return `<div class="exp"><div class="rw hd"><span></span>${hb('name', 'ex.name')}${hb('size', 'ex.share')}${hb('size', 'ex.size')}<span>%</span>${hb('date', 'ex.modified')}</div>${shown.map((e, i) => {
    let wrap = '';
    while (depth < (e.depth || 0)) { wrap += `<div class="tg" style="--lc:${DEPTH[depth % DEPTH.length][1]}">`; depth++; }
    while (depth > (e.depth || 0)) { wrap += '</div>'; depth--; }
    const pc = e.size == null ? 0 : e.size / tot * 100, k = kindOf(e), [ga, gb] = DEPTH[(e.depth || 0) % DEPTH.length], grad = S.q ? gradOf(e) : `--a:${ga};--b:${gb}`;
    const xt = e.dir && !S.q ? `<span class="xt ${S.xopen.has(e.path) ? 'on' : ''}" data-xt="${esc(e.path)}">▸</span>` : '';
    return wrap + `<div class="rw ${e.dir ? 'folder' : ''} ${S.sel.has(e.path) ? 'sel' : ''}" data-i="${i}" draggable="true" style="${grad}">${visual(e, i, grad)}<div class="nm"><b>${xt}${esc(e.name)}</b><small>${esc(e.dir ? (e.files != null ? t('ex.itemsIn', { n: N(e.files) }) : t('kind.folder')) : t('kind.' + k))}</small></div><div class="bar"><i style="width:${Math.max(e.size ? 1.5 : 0, pc)}%"></i></div><div class="s">${esc(F(e.size))}</div><div class="p">${e.size == null ? '' : (pc < 1 ? '<1' : Math.round(pc)) + '%'}</div><div class="dt">${esc(fdate(e.mtime))}</div><button class="add ${inTray(e.path) ? 'in' : ''}" data-tadd="${esc(e.path)}" title="${esc(t('tray.add'))}">${inTray(e.path) ? '✓' : '+'}</button></div>`;
  }).join('') + '</div>'.repeat(depth)}${moreBtn}</div>`;
}
function drawMap() {
  const box = $('tmw'); if (!box) return;
  const L = S.view.filter(e => e.size > 0).slice(0, 300), W = box.clientWidth, H = box.clientHeight, tot = L.reduce((a, e) => a + e.size, 0) || 1, area = W * H / tot;
  squarify(L.map(e => ({ e, a: e.size * area })), 0, 0, W, H).forEach(r => {
    const el = document.createElement('div'), i = S.view.indexOf(r.e); el.className = 'tl' + (S.sel.has(r.e.path) ? ' sel' : ''); el.dataset.i = i;
    Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    el.style.setProperty('--bg2', `color-mix(in srgb, ${PAL[hash(r.e.name) % 5][1]} 35%, #fff)`);
    el.innerHTML = `<div>${r.w > 64 && r.h > 34 ? `<b>${esc(r.e.name)}</b><small>${esc(F(r.e.size))}</small>` : ''}</div>`; box.appendChild(el);
  });
}
function squarify(items, x, y, w, h) {
  const out = []; let rest = items.slice();
  while (rest.length) {
    const sh = Math.min(w, h), worst = (row, s) => { const mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max(sh * sh * mx / (s * s), s * s / (sh * sh * mn)); };
    let row = [rest[0]], s = rest[0].a, i = 1;
    while (i < rest.length) { const ns = s + rest[i].a, nr = [...row, rest[i]]; if (worst(nr, ns) <= worst(row, s)) { row = nr; s = ns; i++; } else break; }
    if (w >= h) { const rw = s / h; let yy = y; row.forEach(r => { const rh = r.a / rw; out.push({ e: r.e, x, y: yy, w: rw, h: rh }); yy += rh; }); x += rw; w -= rw; }
    else { const rh = s / w; let xx = x; row.forEach(r => { const rw = r.a / rh; out.push({ e: r.e, x: xx, y, w: rw, h: rh }); xx += rw; }); y += rh; h -= rh; }
    rest = rest.slice(row.length);
  }
  return out;
}
const thumbs = new Map();
const io = new IntersectionObserver(es => es.forEach(en => {
  if (!en.isIntersecting) return; const el = en.target; io.unobserve(el);
  const e = { path: el.dataset.thp };
  const apply = u => { if (u && el.isConnected) { el.style.backgroundImage = `url("${u}")`; el.classList.add('loaded'); } };
  if (thumbs.has(e.path)) return apply(thumbs.get(e.path));
  api.thumb(e.path).then(u => { thumbs.set(e.path, u); apply(u); });
}), { rootMargin: '200px' });
function observeThumbs() { document.querySelectorAll('[data-thp]').forEach(el => io.observe(el)); }

/* ---------- side panel ---------- */
const kv = (a, b) => `<div class="kv"><span>${esc(a)}</span><b>${b}</b></div>`;
function panelHTML() {
  const sel = [...S.sel].map(p => S.entries.find(e => e.path === p)).filter(Boolean);
  if (sel.length > 1) {
    const tot = sel.reduce((a, e) => a + (e.size || 0), 0);
    return `<div class="hero"><span class="chip" style="--c:var(--accent)">${esc(t('ex.selected', { n: sel.length }))}</span><h2>${esc(t('panel.multi'))}</h2><div class="sz">${esc(F(tot))}</div><small>${esc(t('panel.multiHint'))}</small></div><div class="det"><div class="card"><h4>${esc(t('panel.chosen'))}</h4>${sel.slice(0, 6).map(e => `<div class="mini" style="${gradOf(e)}"><span>${esc(e.name)}</span><span class="b"><i style="width:${(e.size || 0) / (tot || 1) * 100}%"></i></span><span class="v">${esc(F(e.size))}</span></div>`).join('')}${sel.length > 6 ? `<small style="color:var(--mute)">+${sel.length - 6}</small>` : ''}</div><div><button class="big" data-act="traysel">${esc(t('tray.addAll'))}</button><button class="big ghost" data-act="copysel">${esc(t('ctx.copyPath'))}</button><button class="big ghost" data-act="propsel">${esc(t('ctx.props'))}</button></div></div>`;
  }
  const e = sel[0], k = e ? kindOf(e) : 'folder', name = e ? e.name : (same(S.cur, S.root) ? rootName() : S.cur.split(/[\\/]/).pop());
  const size = e ? e.size : folderTotal(), path = e ? e.path : S.cur;
  const files = e ? e.files : (S.info && S.info.f), dirs = e ? e.dirs : (S.info && S.info.d);
  const top3 = !e ? S.entries.slice().sort((a, b) => (b.size || 0) - (a.size || 0)).slice(0, 3).filter(x => x.size) : [];
  const preview = e && (k === 'foto' || k === 'video') ? `<div class="card pv"><div class="th pvimg" ${k === 'foto' && !onPhone(e.path) ? `style="background-image:url('${fileUrl(e.path)}')"` : `data-pv="${esc(e.path)}"`}>${k === 'video' ? '<div class="play"><i></i></div>' : ''}</div></div>` : '';
  return `<div class="hero"><span class="chip" style="--c:var(--accent)">${esc(t('kind.' + k))}</span><h2>${esc(name)}</h2><div class="sz">${esc(F(size))}</div><small>${esc(e ? parentOf(e.path) + ' · ' + fdate(e.mtime) : path)}</small></div>
  <div class="det">${preview}${top3.length ? `<div class="card"><h4>${esc(t('panel.biggest'))}</h4>${top3.map(x => `<div class="mini" style="${gradOf(x)}"><span>${esc(x.name)}</span><span class="b"><i style="width:${x.size / (size || 1) * 100}%"></i></span><span class="v">${esc(F(x.size))}</span></div>`).join('')}</div>` : ''}
  <div class="card"><h4>${esc(t('ctx.props'))}</h4>${kv(t('panel.type'), esc(t('kind.' + k)))}${kv(t('panel.location'), esc(e ? parentOf(e.path) : path))}${kv(t('panel.size'), esc(F(size)))}${files != null ? kv(t('panel.contains'), esc(t('panel.containsVal', { f: t('unit.files', { n: N(files) }), d: t('unit.folders', { n: N(dirs || 0) }) }))) : ''}${e ? kv(t('panel.modified'), esc(fdate(e.mtime))) : ''}</div>
  <div>${e && !e.dir ? `<button class="big" data-act="openitem">${esc(t('ctx.open'))}</button>` : ''}${e && e.dir ? `<button class="big" data-act="openitem">${esc(t('panel.openFolder'))} ›</button>` : ''}${e ? `<button class="big ghost" data-analyze="${esc(e.path)}">${esc(t('panel.analyze'))} ›</button>` : ''}<button class="big ghost" data-act="showitem">${esc(t('ctx.show'))}</button></div></div>`;
}
const allSelected = () => S.view.length > 0 && S.view.every(e => S.sel.has(e.path));
const selAllLabel = () => (allSelected() ? '☐ ' + t('ex.selectNone') : '☑ ' + t('ex.selectAll'));
function refreshSel() {
  document.querySelectorAll('.rw[data-i],.gf[data-i],.tl[data-i]').forEach(x => { const e = S.view[+x.dataset.i]; x.classList.toggle('sel', !!e && S.sel.has(e.path)); });
  $('panel').innerHTML = panelHTML(); $('stat').textContent = statText(); const sa = $('selall'); if (sa) sa.textContent = selAllLabel(); applyPreviewThumbs();
}
function applyPreviewThumbs() { document.querySelectorAll('[data-pv]').forEach(el => api.thumb(el.dataset.pv).then(u => { if (u && el.isConnected) el.style.backgroundImage = `url("${u}")`; })); }

/* ---------- viewer & properties ---------- */
// Phone files have no disk path: the main process copies them to a temp folder first (e.local).
async function withLocal(e) {
  if (e.local || !onPhone(e.path)) return e;
  toast(t('viewer.fromPhone'));
  e.local = await api.phoneLocal(e.path);
  if (!e.local) toast(t('viewer.phoneFail'));
  return e;
}
async function openViewer(e, from = S.view) {
  const list = from.filter(x => ['foto', 'video'].includes(kindOf(x))); if (!list.length) return;
  const i = Math.max(0, list.findIndex(x => x.path === e.path));
  await withLocal(list[i]);
  S.viewer = { list, i }; render();
}
// One photo or video in the viewer. Both sit in the same grid cell, so the old one can slide out while the new one slides in.
const vmedia = e => kindOf(e) === 'foto' ? `<img class="vimg2" src="${fileUrl(e.local || e.path)}" alt="">`
  : `<div class="vm"><video class="vimg2" id="vid" src="${fileUrl(e.local || e.path)}" controls autoplay></video><div class="vfail" id="vfail" hidden>${esc(t('viewer.noPlay'))}</div></div>`;
const vtitle = e => `<b>${esc(e.name)}</b><small>${esc(t('kind.' + kindOf(e)))} · ${esc(F(e.size))} · ${esc(fdate(e.mtime))}</small>`;
// Next or previous: only the picture changes, with a short slide. The viewer itself stays open.
async function viewerGo(d) {
  const v = S.viewer, n = v.list.length; if (n < 2) return;
  const i = (v.i + d + n) % n; await withLocal(v.list[i]);
  if (S.viewer !== v) return; v.i = i;
  const stage = document.querySelector('.vstage'); if (!stage) return render();
  const e = v.list[v.i], dir = d > 0 ? 'r' : 'l';
  stage.querySelectorAll(':scope > *').forEach(old => {
    if (old.classList.contains('vout')) return old.remove();
    old.querySelectorAll('video').forEach(x => x.pause()); old.removeAttribute('id'); old.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
    old.classList.add('vout', 'to-' + dir); old.addEventListener('animationend', () => old.remove(), { once: true });
  });
  stage.insertAdjacentHTML('beforeend', vmedia(e));
  const fresh = stage.lastElementChild; fresh.classList.add('vin', 'from-' + dir);
  document.querySelector('.vtop > div').innerHTML = vtitle(e);
  document.querySelector('.vcount').textContent = `${v.i + 1} / ${n} · ${t('viewer.hint')}`;
  const vid = $('vid'); if (vid) vid.onerror = () => { const f = $('vfail'); if (f) f.hidden = false; };
}
function viewerHTML() {
  if (!S.viewer) return ''; const v = S.viewer, e = v.list[v.i], k = kindOf(e), n = v.list.length;
  return `<div class="vw"><div class="vtop"><div>${vtitle(e)}</div><span class="sp"></span><button class="vb" data-act="vopen">↗ ${esc(t('viewer.openDefault'))}</button><button class="vb x" data-act="vclose" title="Esc">✕</button></div>
  <button class="vnav l" data-vnav="-1" ${n > 1 ? '' : 'disabled'}>‹</button><div class="vstage">${vmedia(e)}</div><button class="vnav r" data-vnav="1" ${n > 1 ? '' : 'disabled'}>›</button><div class="vcount">${v.i + 1} / ${n} · ${esc(t('viewer.hint'))}</div></div>`;
}
async function openProps(list) { S.props = { list, stats: await Promise.all(list.map(e => api.stat(e.path))) }; render(); }
function propsHTML() {
  if (!S.props) return ''; const { list, stats } = S.props, one = list.length === 1 ? list[0] : null, st = stats[0];
  const tot = list.reduce((a, e) => a + (e.size || 0), 0);
  const rows = one ? kv(t('panel.type'), esc(t('kind.' + kindOf(one)))) + kv(t('panel.location'), esc(parentOf(one.path))) + kv(t('panel.size'), esc(F(one.size)) + (one.size != null ? ` (${esc(N(one.size))} ${esc(t('props.bytes'))})` : '')) + (one.dir && one.files != null ? kv(t('panel.contains'), esc(t('panel.containsVal', { f: t('unit.files', { n: N(one.files) }), d: t('unit.folders', { n: N(one.dirs || 0) }) }))) : '') + kv(t('panel.modified'), esc(fdate(one.mtime))) + (st ? kv(t('panel.created'), esc(fdate(st.birth))) : '')
    : kv(t('panel.type'), esc(t('panel.multi'))) + kv(t('props.count'), N(list.length)) + kv(t('panel.size'), esc(F(tot)));
  return `<div class="ov"><div class="md pm"><div class="mh"><h2>${esc(one ? one.name : t('ex.selected', { n: list.length }))}</h2><p>${esc(t('ctx.props'))}</p></div><div class="mb"><div class="card" style="background:#f6f3ff">${rows}</div></div><div class="mf"><span class="sp"></span><button class="go" data-act="pclose" style="width:auto;height:auto">${esc(t('close'))}</button></div></div></div>`;
}

/* ---------- settings ---------- */
function settingsHTML() {
  const codes = Object.keys(S.langs).sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
  return shell(`<div class="setg"><div class="ovh"><button class="backb" data-act="back2" title="${esc(t('close'))}">‹</button><div><h1>${esc(t('settings.title'))}</h1></div></div>
  <div class="card2"><h3>${esc(t('settings.language'))}</h3><p class="hint">${esc(t('settings.languageHint'))}</p><div class="lang-grid">${codes.map(c => `<button class="lbtn ${c === S.lang ? 'on' : ''}" data-lang="${esc(c)}"><b>${esc(S.langs[c]._name || c)}</b><small>${esc(c)}</small></button>`).join('')}</div></div>
  <div class="card2"><h3>${esc(t('settings.theme'))}</h3><div class="seg themes">${['light', 'dark', 'system'].map(k => `<button class="${S.theme === k ? 'on' : ''}" data-theme="${k}">${esc(t('theme.' + k))}</button>`).join('')}</div></div>
  <div class="card2"><h3>${esc(t('settings.history'))}</h3>${S.history.length ? S.history.slice(0, 12).map(h => `<div class="hist"><span>${esc(fdate(h.at))}</span><b>${esc(t('hist.' + h.action, { n: h.n }))}</b><em>${esc(F(h.bytes))}</em></div>`).join('') : `<p class="hint">${esc(t('settings.noHistory'))}</p>`}</div>
  ${updateCard()}
  <div class="card2"><h3>${esc(t('settings.about'))}</h3><div class="aboutrow"><span class="lgo xl">${LOGO}</span><div><b>DiskLens</b><small>${esc(t('settings.version'))} ${esc(S.version)} · ${esc(t('settings.license'))}</small></div></div>
  <p class="hint">${esc(t('settings.privacy'))}</p><p class="hint">${esc(t('settings.inspired'))} <button class="lnk" data-ext="https://github.com/adileo/squirreldisk">SquirrelDisk</button></p></div></div>`);
}

/* ---------- render ---------- */
function render() {
  const st = document.querySelector('.exp'), sc = st ? st.scrollTop : 0;
  $('app').innerHTML = { home: homeHTML, scan: scanHTML, overview: overviewHTML, work: workHTML, settings: settingsHTML }[S.screen]();
  document.documentElement.lang = S.lang;
  if (S.screen === 'scan') updateScan();
  if (S.screen === 'work') { wireTray(); const ex = document.querySelector('.exp'); if (ex) ex.scrollTop = sc; if (S.tool === 'explorer' && S.mode === 'map' && !S.loading) drawMap(); observeThumbs(); applyPreviewThumbs(); const v = $('vid'); if (v) v.onerror = () => { v.hidden = true; $('vfail').hidden = false; }; }
}

/* ---------- navigation ---------- */
async function go(p, push = true) {
  S.cur = p; S.loading = true; S.err = null; S.sel = new Set(); S.anchor = null; S.q = ''; S.limit = 1500;
  if (push) { S.hist = S.hist.slice(0, S.hp + 1); S.hist.push(p); S.hp = S.hist.length - 1; }
  render();
  const r = await api.list(p); if (S.cur !== p) return;
  S.loading = false;
  if (r.error) { S.err = r.error; S.entries = []; } else { S.entries = r.entries; S.total = r.total; S.info = r.info; S.truncated = r.truncated; }
  S.kids = new Map(await Promise.all([...S.xopen].map(async x => { const k = await api.list(x); return [x, k.error ? [] : k.entries]; })));
  if (S.cur !== p) return;
  render();
}
function explore() { S.screen = 'work'; S.tool = 'explorer'; S.hist = []; S.hp = 0; go(S.root); }
const goHist = d => { const p = S.hp + d; if (p < 0 || p >= S.hist.length) return; S.hp = p; go(S.hist[p], false); };
const openEntry = e => { if (e.dir) go(e.path); else if (['foto', 'video'].includes(kindOf(e))) openViewer(e); else api.open(e.path).then(err => err && toast(t('toast.openFail', { e: err }))); };
const copyPaths = list => { api.copy(list.map(e => e.path).join('\n')); toast(list.length > 1 ? t('toast.copiedMany', { n: list.length }) : t('toast.copied')); };
const selList = () => [...S.sel].map(p => S.view.find(e => e.path === p)).filter(Boolean);

/* ---------- selection ---------- */
function clickRow(ev, el) {
  const e = itemOf(+el.dataset.i); if (!e) return; const rows = S.view.map(x => x.path);
  if (ev.shiftKey && S.anchor && rows.includes(S.anchor)) { const a = rows.indexOf(S.anchor), b = rows.indexOf(e.path); S.sel = new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1)); }
  else if (ev.ctrlKey || ev.metaKey) { S.sel.has(e.path) ? S.sel.delete(e.path) : S.sel.add(e.path); S.anchor = e.path; }
  else { S.sel = new Set([e.path]); S.anchor = e.path; }
  refreshSel();
}
function moveSel(d, extend) {
  const rows = S.view.map(x => x.path); if (!rows.length) return; const cur = [...S.sel].pop(), base = cur ? rows.indexOf(cur) : -1;
  const ni = Math.max(0, Math.min(rows.length - 1, base < 0 ? (d > 0 ? 0 : rows.length - 1) : base + d));
  if (extend && S.anchor && rows.includes(S.anchor)) { const a = rows.indexOf(S.anchor); S.sel = new Set(rows.slice(Math.min(a, ni), Math.max(a, ni) + 1)); } else { S.sel = new Set([rows[ni]]); S.anchor = rows[ni]; }
  refreshSel(); const el = document.querySelector(`[data-i="${ni}"]`); if (el) el.scrollIntoView({ block: 'nearest' });
}

/* ---------- context menu ---------- */
function menuEl(list) {
  const ul = document.createElement('div'); ul.className = 'cm';
  list.forEach(m => {
    if (m.sep) { const s = document.createElement('div'); s.className = 'cs'; ul.appendChild(s); return; }
    const b = document.createElement('button'); b.className = 'ci2';
    b.innerHTML = `<span class="ico">${m.ic || ''}</span><span class="lb">${esc(m.t)}</span>${m.k ? `<em>${esc(m.k)}</em>` : ''}${m.sub ? '<span class="ar">›</span>' : ''}`;
    if (m.sub) { const sm = menuEl(m.sub); sm.classList.add('subm'); b.appendChild(sm); } else b.onclick = ev => { ev.stopPropagation(); closeCtx(); m.f(); };
    ul.appendChild(b);
  });
  return ul;
}
const closeCtx = () => { const m = $('ctx'); if (m) m.remove(); };
function showCtx(x, y, list) {
  closeCtx(); const m = menuEl(list); m.id = 'ctx'; if (x > innerWidth - 520) m.classList.add('flip'); document.body.appendChild(m);
  const r = m.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
function itemMenu(list) {
  const one = list.length === 1 ? list[0] : null, k = one ? kindOf(one) : '', L = [];
  if (one) {
    L.push({ t: t('ctx.open'), ic: one.dir ? '📂' : '↗', k: 'Enter', f: () => openEntry(one) });
    if (!one.dir) L.push({ t: t('ctx.openWith'), ic: '▶', f: () => api.open(one.path) });
    if (k === 'foto' || k === 'video') L.push({ t: t('ctx.preview'), ic: '👁', k: t('key.space'), f: () => openViewer(one) });
    L.push({ sep: true });
  }
  L.push({ t: list.length > 1 ? t('ctx.copyPaths') : t('ctx.copyPath'), ic: '📋', k: 'Ctrl+Shift+C', f: () => copyPaths(list) });
  if (one) L.push({ t: t('ctx.copyName'), ic: '🔤', f: () => { api.copy(one.name); toast(t('toast.nameCopied')); } });
  L.push({ sep: true }, { t: list.length > 1 ? t('tray.addN', { n: list.length }) : t('tray.add'), ic: '🧺', f: () => addTray(list) }, { t: t('ctx.analyze'), ic: '🔎', f: () => { const b = document.createElement('button'); b.dataset.analyze = list[0].path; document.body.appendChild(b); b.click(); b.remove(); } }, { t: t('ctx.delete'), ic: '🗑', k: 'Del', f: () => deleteNow(list) }, { sep: true });
  L.push({ t: t('ctx.show'), ic: '🗂', f: () => api.show(list[0].path) }, { sep: true }, { t: t('ctx.props'), ic: 'ⓘ', k: 'Alt+Enter', f: () => openProps(list) });
  return L;
}
function bgMenu() {
  const ck = c => c ? '✓' : '';
  return [
    { t: t('ctx.sortBy'), ic: '⇅', sub: [{ t: t('ex.name'), ic: ck(S.sortK === 'name'), f: () => { S.sortK = 'name'; S.sortD = 1; render(); } }, { t: t('ex.size'), ic: ck(S.sortK === 'size'), f: () => { S.sortK = 'size'; S.sortD = -1; render(); } }, { t: t('ex.modified'), ic: ck(S.sortK === 'date'), f: () => { S.sortK = 'date'; S.sortD = -1; render(); } }, { sep: true }, { t: t('ctx.asc'), ic: ck(S.sortD > 0), f: () => { S.sortD = 1; render(); } }, { t: t('ctx.desc'), ic: ck(S.sortD < 0), f: () => { S.sortD = -1; render(); } }] },
    { t: t('ctx.view'), ic: '▦', sub: [['list', 'ex.list'], ['grid', 'ex.grid'], ['map', 'ex.map']].map(([k, l]) => ({ t: t(l), ic: ck(S.mode === k), f: () => { S.mode = k; render(); } })) },
    { t: t('ctx.refresh'), ic: '⟳', k: 'F5', f: () => go(S.cur, false) }, { sep: true },
    { t: t('ctx.selectAll'), ic: '☑', k: 'Ctrl+A', f: () => { S.sel = new Set(S.view.map(e => e.path)); refreshSel(); } }, { sep: true },
    { t: t('ctx.copyFolderPath'), ic: '📋', f: () => { api.copy(S.cur); toast(t('toast.copied')); } },
    { t: t('ctx.openFolderIn'), ic: '🗂', f: () => api.open(S.cur) },
  ];
}

/* ---------- events ---------- */
document.addEventListener('contextmenu', ev => {
  if (ev.target.closest('input')) return; ev.preventDefault(); closeCtx(); if (S.screen !== 'work' || S.viewer || S.props || S.modal) return;
  if (S.tool !== 'explorer') return toolCtx(ev);
  const row = ev.target.closest('[data-i]');
  if (row) { const e = itemOf(+row.dataset.i); if (!e) return; if (!S.sel.has(e.path)) { S.sel = new Set([e.path]); S.anchor = e.path; refreshSel(); } return showCtx(ev.clientX, ev.clientY, itemMenu(selList())); }
  if (ev.target.closest('.exp')) showCtx(ev.clientX, ev.clientY, bgMenu());
});
document.addEventListener('click', ev => {
  if (!ev.target.closest('#ctx')) closeCtx();
  const c = s => ev.target.closest(s); let el;
  if (el = c('[data-scan]')) return startScan(el.dataset.scan);
  if (el = c('[data-theme]')) { S.theme = el.dataset.theme; api.setSettings({ theme: S.theme }); applyTheme(); return render(); }
  if (el = c('[data-lang]')) { S.lang = el.dataset.lang; api.setSettings({ lang: S.lang }); return render(); }
  if (el = c('[data-ext]')) return api.external(el.dataset.ext);
  if (el = c('[data-go]')) return go(el.dataset.go);
  if (el = c('[data-mode]')) { S.mode = el.dataset.mode; return render(); }
  if (el = c('[data-xt]')) return toggleOpen(el.dataset.xt);
  if (el = c('[data-sort]')) { const k = el.dataset.sort; if (S.sortK === k) S.sortD *= -1; else { S.sortK = k; S.sortD = k === 'name' ? 1 : -1; } return render(); }
  if (el = c('[data-vnav]')) return viewerGo(+el.dataset.vnav);
  if (el = c('[data-act]')) {
    const a = el.dataset.act, sel = selList();
    if (a === 'home') { api.cancelScan(); S.screen = 'home'; render(); return refreshDrives(); }
    if (a === 'redrives') return refreshDrives();
    if (a === 'settings') { S.prev = S.screen; S.screen = 'settings'; return render(); }
    if (a === 'back2') { S.screen = S.prev === 'settings' ? 'home' : S.prev; return render(); }
    if (a === 'pick') return api.pickFolder().then(p => p && startScan(p));
    if (a === 'cancel') { api.cancelScan(); S.screen = 'home'; return render(); }
    if (a === 'overview') { S.screen = 'overview'; return render(); }
    if (a === 'explore') return explore();
    if (a === 'back') return goHist(-1); if (a === 'fwd') return goHist(1);
    if (a === 'up') return go(parentOf(S.cur));
    if (a === 'more') { S.limit += 3000; return render(); }
    if (a === 'selall') { S.sel = allSelected() ? new Set() : new Set(S.view.map(e => e.path)); S.anchor = null; return refreshSel(); }
    if (a === 'traysel') return addTray(sel);
    if (a === 'copysel') return copyPaths(sel); if (a === 'propsel') return openProps(sel);
    if (a === 'openitem' && sel[0]) return openEntry(sel[0]);
    if (a === 'showitem') return api.show(sel[0] ? sel[0].path : S.cur);
    if (a === 'vclose') { S.viewer = null; return render(); }
    if (a === 'vopen') { const v = S.viewer.list[S.viewer.i]; return api.open(v.local || v.path); }
    if (a === 'pclose') { S.props = null; return render(); }
  }
  if (el = c('.rw[data-i],.gf[data-i],.tl[data-i]')) return clickRow(ev, el);
  if (S.tool === 'explorer' && c('.exp') && S.sel.size) { S.sel = new Set(); refreshSel(); }
});
// Double-click a folder in the list opens or closes its level in place (Enter or right-click → Open still goes into it).
document.addEventListener('dblclick', ev => {
  if (ev.target.closest('[data-xt],.chevb')) return;
  const el = ev.target.closest('.rw[data-i],.gf[data-i],.tl[data-i]'); if (!el) return; const e = itemOf(+el.dataset.i); if (!e) return;
  if (e.dir && el.classList.contains('rw') && S.mode === 'list' && !S.q) return toggleOpen(e.path);
  openEntry(e);
});
document.addEventListener('input', ev => { if (ev.target.id !== 'q') return; S.q = ev.target.value; S.limit = 1500; render(); const i = $('q'); i.focus(); i.setSelectionRange(S.q.length, S.q.length); });
document.addEventListener('scroll', closeCtx, true);
addEventListener('blur', closeCtx);
document.addEventListener('keydown', ev => {
  const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
  if (k === 'Escape') { if ($('ctx')) return closeCtx(); if (S.props) { S.props = null; return render(); } if (S.viewer) { S.viewer = null; return render(); } if (S.screen === 'work' && S.sel.size) { S.sel = new Set(); return refreshSel(); } return; }
  if (S.viewer) { if (k === 'ArrowRight') viewerGo(1); if (k === 'ArrowLeft') viewerGo(-1); return; }
  if (S.screen !== 'work' || S.props || S.modal || S.tool !== 'explorer' || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
  const sel = selList();
  if (ctrl && k.toLowerCase() === 'a') { ev.preventDefault(); S.sel = new Set(S.view.map(e => e.path)); return refreshSel(); }
  if (ctrl && ev.shiftKey && k.toLowerCase() === 'c') { ev.preventDefault(); return sel.length && copyPaths(sel); }
  if (ev.altKey && k === 'Enter') return sel.length && openProps(sel);
  if (ev.altKey && k === 'ArrowLeft') { ev.preventDefault(); return goHist(-1); }
  if (ev.altKey && k === 'ArrowRight') { ev.preventDefault(); return goHist(1); }
  if (ev.altKey && k === 'ArrowUp') { ev.preventDefault(); return !same(S.cur, S.root) && go(parentOf(S.cur)); }
  if (k === 'F5') { ev.preventDefault(); return go(S.cur, false); }
  if (k === 'Enter' && sel.length === 1) return openEntry(sel[0]);
  if (k === ' ' && sel.length === 1 && ['foto', 'video'].includes(kindOf(sel[0]))) { ev.preventDefault(); return openViewer(sel[0]); }
  if (k === 'Backspace' && !same(S.cur, S.root)) { ev.preventDefault(); return go(parentOf(S.cur)); }
  if (k === 'ArrowDown' || k === 'ArrowUp') { ev.preventDefault(); moveSel(k === 'ArrowDown' ? 1 : -1, ev.shiftKey); }
});

/* ---------- theme ---------- */
const darkQ = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() { document.documentElement.classList.toggle('dark', S.theme === 'dark' || (S.theme === 'system' && darkQ.matches)); }
darkQ.addEventListener('change', applyTheme);

// Drives and phones come and go (USB): look again while the home screen is open.
async function refreshDrives() {
  const d = await api.drives();
  if (JSON.stringify(d) !== JSON.stringify(S.drives)) { S.drives = d; if (S.screen === 'home') render(); }
}
setInterval(() => { if (S.screen === 'home' && !document.hidden) refreshDrives(); }, 5000);

/* ---------- start ---------- */
(async () => {
  const [langs, settings, paths, drives, version] = await Promise.all([api.langs(), api.getSettings(), api.paths(), api.drives(), api.version()]);
  S.langs = langs; S.paths = paths; S.drives = drives; S.version = version; S.recent = settings.recent || []; S.history = settings.history || []; if (settings.tview) Object.assign(S.types, settings.tview);
  const sys = (navigator.language || 'en').slice(0, 2).toLowerCase();
  S.lang = settings.lang && langs[settings.lang] ? settings.lang : (langs[sys] ? sys : 'en');
  S.theme = settings.theme || 'light'; applyTheme();
  render();
})();
