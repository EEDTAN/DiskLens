// Rules that explain what a file or folder is and what happens if it is deleted.
// Texts live in src/i18n/*.json under r.<id>.what / r.<id>.del / r.<id>.tip.
// risk: safe = fine to delete, caution = check first, danger = keep (DiskLens will not delete it).
// unit: list the whole folder as one item in Analysis. area: list what is left after the inner rules.
const RULES = [
  // drive-level system files and folders
  { id: 'sysvol', risk: 'danger', dir: true, unit: true, re: /^[a-z]:\\system volume information$/ },
  { id: 'recovery', risk: 'danger', dir: true, unit: true, re: /^[a-z]:\\recovery$/ },
  { id: 'recycle', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\\$recycle\.bin$/ },
  { id: 'pagefile', risk: 'danger', dir: false, re: /^[a-z]:\\(pagefile|swapfile)\.sys$/ },
  { id: 'hiberfil', risk: 'caution', dir: false, re: /^[a-z]:\\hiberfil\.sys$/ },
  { id: 'winold', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\windows\.old$/ },
  { id: 'winbt', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\\$(windows\.~bt|windows\.~ws|sysreset|getcurrent)$/ },
  // phones (path "<phone>\<storage>\...", no drive letter)
  { id: 'phonetrash', risk: 'safe', dir: true, unit: true, re: /^[^:\\]+\\[^\\]+\\(?:.*\\)?\.(trashbin|trash|recycle)$/ },
  { id: 'phonethumbs', risk: 'safe', dir: true, unit: true, re: /^[^:\\]+\\[^\\]+\\(?:.*\\)?\.thumbnails$/ },
  { id: 'phoneappdata', risk: 'caution', dir: true, unit: true, re: /^[^:\\]+\\[^\\]+\\android\\(data|obb)\\[^\\]+$/ },
  { id: 'phonewa', risk: 'caution', dir: true, area: true, re: /^[^:\\]+\\[^\\]+\\(android\\media\\com\.whatsapp\\)?whatsapp$/ },
  { id: 'phonedl', risk: 'caution', dir: true, area: true, re: /^[^:\\]+\\[^\\]+\\download$/ },
  // inside Windows
  { id: 'winsxs', risk: 'danger', dir: true, unit: true, re: /^[a-z]:\\windows\\winsxs$/ },
  { id: 'wininstaller', risk: 'danger', dir: true, unit: true, re: /^[a-z]:\\windows\\installer$/ },
  { id: 'wintemp', risk: 'safe', dir: true, unit: true, contents: true, re: /^[a-z]:\\windows\\temp$/ },
  { id: 'winupdate', risk: 'caution', dir: true, unit: true, contents: true, re: /^[a-z]:\\windows\\softwaredistribution\\download$/ },
  { id: 'winlogs', risk: 'safe', dir: true, unit: true, contents: true, re: /^[a-z]:\\windows\\logs$/ },
  { id: 'dumps', risk: 'safe', dir: true, unit: true, contents: true, re: /^[a-z]:\\windows\\(minidump|livekernelreports)$/ },
  { id: 'prefetch', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\windows\\prefetch$/ },
  { id: 'windows', risk: 'danger', dir: true, area: true, re: /^[a-z]:\\windows$/ },
  // games and programs
  { id: 'steamgame', risk: 'caution', dir: true, unit: true, re: /\\steamapps\\common\\[^\\]+$/ },
  { id: 'steamcache', risk: 'safe', dir: true, unit: true, contents: true, re: /\\steamapps\\(shadercache|temp)$/ },
  { id: 'steamdl', risk: 'caution', dir: true, unit: true, re: /\\steamapps\\downloading$/ },
  { id: 'program', risk: 'danger', dir: true, unit: true, re: /^[a-z]:\\program files( \(x86\))?\\[^\\]+$/ },
  { id: 'pkgcache', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\programdata\\package cache$/ },
  { id: 'wer', risk: 'safe', dir: true, unit: true, contents: true, re: /^[a-z]:\\programdata\\microsoft\\windows\\wer$/ },
  { id: 'programdata', risk: 'caution', dir: true, area: true, re: /^[a-z]:\\programdata\\[^\\]+$/ },
  // user profile: caches first
  { id: 'usertemp', risk: 'safe', dir: true, unit: true, contents: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\temp$/ },
  { id: 'inetcache', risk: 'safe', dir: true, unit: true, contents: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\microsoft\\windows\\(inetcache|explorer|webcache)$/ },
  { id: 'crashdumps', risk: 'safe', dir: true, unit: true, contents: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\crashdumps$/ },
  { id: 'wsl', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\(packages\\[^\\]*(ubuntu|debian|kali|suse|wsl|linux)[^\\]*|docker)$/ },
  { id: 'devcache', risk: 'safe', dir: true, unit: true, contents: true, re: /\\(npm-cache|yarn\\cache|pip\\cache|pnpm-cache|\.gradle\\caches|go-build|composer\\cache)$/ },
  { id: 'nuget', risk: 'caution', dir: true, unit: true, re: /\\\.nuget\\packages$/ },
  { id: 'appcache', risk: 'safe', dir: true, unit: true, contents: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\.*\\(cache|code cache|gpucache|cache2|cache_data|shadercache|grshadercache|dawncache|cachestorage)$/ },
  { id: 'storeapp', risk: 'caution', dir: true, area: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\packages\\[^\\]+$/ },
  { id: 'appdata', risk: 'caution', dir: true, area: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\(local|roaming|locallow)\\[^\\]+$/ },
  { id: 'onedrive', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\onedrive[^\\]*$/ },
  { id: 'nodemodules', risk: 'caution', dir: true, unit: true, re: /\\node_modules$/ },
  { id: 'git', risk: 'caution', dir: true, unit: true, re: /\\\.git$/ },
  { id: 'personal', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\users\\[^\\]+\\(documents|pictures|videos|music|desktop|downloads|saved games|3d objects|contacts|favorites|links|searches)\\[^\\]+$/ },
  { id: 'profile', risk: 'caution', dir: true, area: true, re: /^[a-z]:\\users\\[^\\]+$/ },
  // single files, by type
  { id: 'dump', risk: 'safe', dir: false, re: /\.(dmp|mdmp|hdmp)$/ },
  { id: 'tempfile', risk: 'safe', dir: false, re: /\.(tmp|temp)$/ },
  { id: 'logfile', risk: 'safe', dir: false, re: /\.(log|etl)$/ },
  { id: 'installer', risk: 'safe', dir: false, re: /\\downloads\\[^\\]+\.(exe|msi|msix|appx)$/ },
  { id: 'diskimage', risk: 'caution', dir: false, re: /\.(iso|img)$/ },
  { id: 'vdisk', risk: 'caution', dir: false, re: /\.(vhd|vhdx|vmdk|vdi|qcow2)$/ },
  { id: 'archive', risk: 'caution', dir: false, re: /\.(zip|rar|7z|tar|gz|bz2|xz)$/ },
  { id: 'video', risk: 'caution', dir: false, re: /\.(mp4|mkv|avi|mov|wmv|webm|flv|m4v|mpg|mpeg|ts)$/ },
  { id: 'photo', risk: 'caution', dir: false, re: /\.(jpg|jpeg|png|gif|webp|bmp|heic|tif|tiff|raw|cr2|nef|psd)$/ },
  { id: 'backupfile', risk: 'caution', dir: false, re: /\.(bak|old|backup)$/ },
  { id: 'gamedata', risk: 'caution', dir: false, re: /\.(pak|bundle|vpk|bsa|ba2|forge)$/ },
];

const norm = p => p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
function classify(p, isDir) {
  const l = norm(p);
  for (const r of RULES) if ((r.dir === undefined || r.dir === isDir) && r.re.test(l)) return r;
  return null;
}

// Hard stops: DiskLens never deletes or moves these, whatever the renderer asks.
function protectedReason(p, extra = [], opts = {}) {
  const l = norm(p);
  if (!/^[a-z]:\\./.test(l)) return 'root';
  const inExtra = () => extra.some(x => { const e = norm(x); return l === e || e.startsWith(l + '\\') || l.startsWith(e + '\\'); });
  // Cleaning the contents of a known temp or cache folder is allowed, even inside Windows; the folder itself stays.
  if (opts.contents) { const c = classify(p, true); if (c && c.contents) return inExtra() ? 'app' : null; }
  const r = classify(p, true) || classify(p, false);
  if (r && r.risk === 'danger') return 'system';
  const cx = context(p); if (cx && cx.rule.risk === 'danger' && !cx.userProgram) return 'system';
  const ia = !(r && !r.area) && appAt(l); if (ia && !/\\users\\/.test(ia.loc)) return 'system';
  const fixed = [
    /^[a-z]:\\windows(\\|$)/, /^[a-z]:\\program files( \(x86\))?$/, /^[a-z]:\\programdata$/, /^[a-z]:\\users$/,
    /^[a-z]:\\users\\[^\\]+$/, /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata(\\(local|roaming|locallow))?$/,
    /^[a-z]:\\users\\[^\\]+\\(documents|pictures|videos|music|desktop|downloads|onedrive)$/,
    /^[a-z]:\\\$recycle\.bin(\\|$)/, /^[a-z]:\\(boot|efi|bootmgr|bootnxt|config\.msi|perflogs)(\\|$)/,
    /^[a-z]:\\(hiberfil|pagefile|swapfile)\.sys$/, // in use by Windows; removed through Windows settings, never deleted directly
  ];
  if (fixed.some(re => re.test(l))) return 'system';
  if (inExtra()) return 'app';
  return null;
}

// Walk a scan tree and pick the items worth showing in Analysis.
function analyze(tree, rootPath, minBytes = 1048576) {
  const out = [];
  const join = (a, b) => a.replace(/[\\]+$/, '') + '\\' + b;
  function walk(node, p) {
    const r = classify(p, true);
    if (r && r.unit && p !== rootPath) { if (node.s >= minBytes) out.push({ path: p, name: node.n, size: node.s, dir: true, rule: r.id, risk: r.risk }); return node.s; }
    let inner = 0;
    for (const c of node.c) inner += walk(c, join(p, c.n));
    for (const [name, size, mtime] of node.b || []) {
      const fp = join(p, name), fr = classify(fp, false);
      if (fr && size >= minBytes) { out.push({ path: fp, name, size, dir: false, rule: fr.id, risk: fr.risk, mtime }); inner += size; }
    }
    if (r && r.area && node.s - inner >= minBytes) out.push({ path: p, name: node.n, size: node.s - inner, dir: true, rule: r.id, risk: r.risk, rest: inner > 0 });
    return r && r.area ? node.s : inner;
  }
  walk(tree, rootPath.replace(/[\\]+$/, '') || rootPath);
  return out.sort((a, b) => b.size - a.size);
}

// ---------- explanations for items no rule covers ----------
// Built from where the item lives (the nearest folder a rule knows) and what kind of file it is.
// Returns { risk, what: [[key, params]...], del: [key, params], tip } with i18n keys; params may hold { t: key } to translate.
const TYPES = {
  doc: 'doc docx odt rtf wpd pages', sheet: 'xls xlsx xlsm ods csv numbers', slides: 'ppt pptx odp key', pdf: 'pdf', text: 'txt md',
  code: 'js ts jsx tsx py java c cpp h hpp cs go rs php rb html css vue kt swift lua', config: 'ini cfg conf json xml yaml yml toml reg plist',
  data: 'db sqlite sqlite3 mdb accdb dat ldb edb', exe: 'exe com', lib: 'dll ocx so pyd', driver: 'sys drv inf cat', script: 'bat cmd ps1 vbs sh',
  font: 'ttf otf woff woff2 fon', shortcut: 'lnk url', update: 'cab msu msp', pkg: 'msi msix appx appxbundle', audio: 'mp3 wav flac aac ogg m4a wma opus',
  ebook: 'epub mobi azw3', torrent: 'torrent', web: 'htm mhtml',
};
const TYPE_OF = {};
for (const [k, list] of Object.entries(TYPES)) for (const e of list.split(' ')) TYPE_OF[e] = k;
const MINE = new Set(['doc', 'sheet', 'slides', 'pdf', 'text', 'code', 'audio', 'ebook']);
const PROGRAM_PART = new Set(['exe', 'lib', 'driver', 'script', 'data', 'config']);
const VENDORS = new Set(['google', 'microsoft', 'mozilla', 'adobe', 'apple', 'jetbrains', 'nvidia', 'nvidia corporation', 'intel', 'amd', 'logitech', 'razer', 'corsair']);

// Programs from Windows' list of installed apps (set by main.js at start). Folders that are too broad are left out.
let APPS = [];
const BROAD = /^[a-z]:\\(program files( \(x86\))?|programdata|windows|users(\\[^\\]+(\\appdata(\\(local|roaming|locallow))?)?)?)?$/;
function setApps(list) {
  const seen = new Set();
  APPS = (list || []).map(a => ({ name: a.name, pub: (a.pub || '').replace(/\.+$/, ''), loc: norm(a.loc || '') }))
    .filter(a => /^[a-z]:\\./.test(a.loc) && !BROAD.test(a.loc) && !/\\(windows|programdata\\package cache|programdata\\microsoft\\windows)(\\|$)/.test(a.loc)
      && !seen.has(a.loc) && seen.add(a.loc));
}
const appAt = l => APPS.find(a => a.loc === l);

// The nearest folder above p that a rule or an installed program explains, with the app name taken from the path.
function context(p) {
  const parts = p.replace(/[\\/]+$/, '').replace(/\//g, '\\').split('\\');
  for (let i = parts.length - 1; i >= 2; i--) {
    const anc = parts.slice(0, i).join('\\'), r = classify(anc, true), ia = r && !r.area ? null : appAt(norm(anc));
    if (ia) return { rule: { id: 'installed', risk: /\\users\\/.test(ia.loc) ? 'caution' : 'danger' }, app: ia.name, pub: ia.pub, path: anc, installed: true };
    if (!r) continue;
    let app = parts[i - 1], child = parts[i];
    if (r.id === 'storeapp') app = app.replace(/_[a-z0-9]{10,}$/i, '').replace(/^[^.]+\./, '');
    if ((r.id === 'appdata' || r.id === 'programdata' || r.id === 'program') && child && i < parts.length - 1) {
      if (app.toLowerCase() === 'programs') app = child;                     // AppData\Local\Programs\<app>: installed for one user
      else if (VENDORS.has(app.toLowerCase())) app = app + ' ' + child;        // Google\Chrome -> Google Chrome
    }
    const userProgram = r.id === 'appdata' && parts[i - 1].toLowerCase() === 'programs';
    return { rule: r, app, userProgram, path: anc };
  }
  return null;
}

// opts.hasExe(dir): does this folder hold .exe files (portable programs and games). opts.types: { ext: { type, app } } from Windows.
function explain(p, isDir, opts = {}) {
  const own = classify(p, isDir), ia = isDir && !(own && !own.area) ? appAt(norm(p)) : null;
  if (ia) {                                                          // the folder of an installed program itself
    const v = { app: ia.name, pub: ia.pub };
    return { risk: /\\users\\/.test(ia.loc) ? 'caution' : 'danger', what: [[ia.pub ? 'ex.app.folder' : 'ex.app.folderNoPub', v]], del: ['ex.del.program', v], tip: null };
  }
  if (own && own.dir !== false && !own.area) return null;          // a folder rule already says it all
  let cx = context(p);
  // Not inside anything Windows or a rule knows (or only inside your own folders): a folder with .exe files is probably a program or game.
  if (opts.hasExe && (!cx || ['personal', 'profile', 'onedrive'].includes(cx.rule.id))) {
    const parts = p.replace(/[\\/]+$/, '').replace(/\//g, '\\').split('\\'), stop = cx ? cx.path.split('\\').length : 1;
    if (isDir && opts.hasExe(p)) return { risk: 'caution', what: [['ex.app.portable', {}]], del: ['ex.del.portable', {}], tip: null };
    for (let i = parts.length - 1; i > stop; i--) {
      const anc = parts.slice(0, i).join('\\');
      if (opts.hasExe(anc)) { cx = { rule: { id: 'portable', risk: 'caution' }, app: parts[i - 1], path: anc }; break; }
    }
  }
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(p) || [])[1], type = !isDir && ext ? TYPE_OF[ext.toLowerCase()] : null;
  const what = [], v = cx ? { app: cx.app, pub: cx.pub || '' } : {};
  if (own) what.push(['r.' + own.id + '.what', {}]);
  else if (isDir) what.push(['ex.folder', {}]);
  else if (type) what.push(['ex.type.' + type, { ext: ext.toLowerCase() }]);
  else if (ext && opts.types && opts.types[ext.toLowerCase()]) {
    // Windows' own name for the type; a bare "XYZ File" without an app means Windows does not know it either.
    const w = opts.types[ext.toLowerCase()], e = ext.toLowerCase(), generic = !w.type || /\//.test(w.type) || w.type.toLowerCase() === e + ' file';
    if (!generic) what.push([w.app ? 'ex.type.win' : 'ex.type.winNoApp', { type: w.type, app: w.app, ext: e }]);
    else if (w.app) what.push(['ex.type.winApp', { app: w.app, ext: e }]);
  }
  let del = null, risk = own ? own.risk : 'unknown';
  if (cx) {
    const id = cx.rule.id;
    const where = id === 'installed' ? (cx.pub ? 'installed' : 'program') : id === 'portable' ? 'portable' : cx.userProgram || id === 'program' ? 'program' : id === 'steamgame' ? 'game' : id === 'appdata' ? 'appdata' : id === 'storeapp' ? 'storeapp'
      : id === 'programdata' ? 'programdata' : id === 'windows' || id === 'winsxs' || id === 'wininstaller' ? 'windows' : id === 'personal' ? 'personal' : null;
    if (where) { what.push(['ex.in.' + where, v]); del = ['ex.del.' + (where === 'installed' ? 'program' : where), v]; }
    else { what.push(['ex.in.rule', { x: { t: 'r.' + id + '.what' } }]); del = ['r.' + id + '.del', {}]; }
    if (!own) risk = where === 'program' && cx.userProgram ? 'caution' : cx.rule.risk;
    else if (cx.rule.risk === 'danger') risk = 'danger';
  } else if (!own && what.length && what[0][0].startsWith('ex.type.win')) {
    risk = 'caution';
  }
  if (own && (!cx || !['danger'].includes(cx.rule.risk))) del = ['r.' + own.id + '.del', {}];
  if (!del) del = (type && MINE.has(type)) || (what[0] && what[0][0].startsWith('ex.type.win')) ? ['ex.del.mine', {}] : type && PROGRAM_PART.has(type) ? ['ex.del.progfile', {}] : ['r.unknown.del', {}];
  if (!what.length) what.push(['r.unknown.what', {}]);
  return { risk, what, del, tip: own && !own.area ? ['r.' + own.id + '.tip', {}] : null };
}

module.exports = { RULES, classify, protectedReason, analyze, explain, context, setApps, TYPE_OF };
