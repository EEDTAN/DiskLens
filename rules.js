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
  // inside Windows
  { id: 'winsxs', risk: 'danger', dir: true, unit: true, re: /^[a-z]:\\windows\\winsxs$/ },
  { id: 'wininstaller', risk: 'danger', dir: true, unit: true, re: /^[a-z]:\\windows\\installer$/ },
  { id: 'wintemp', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\windows\\temp$/ },
  { id: 'winupdate', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\windows\\softwaredistribution\\download$/ },
  { id: 'winlogs', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\windows\\logs$/ },
  { id: 'dumps', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\windows\\(minidump|livekernelreports)$/ },
  { id: 'prefetch', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\windows\\prefetch$/ },
  { id: 'windows', risk: 'danger', dir: true, area: true, re: /^[a-z]:\\windows$/ },
  // games and programs
  { id: 'steamgame', risk: 'caution', dir: true, unit: true, re: /\\steamapps\\common\\[^\\]+$/ },
  { id: 'steamcache', risk: 'safe', dir: true, unit: true, re: /\\steamapps\\(shadercache|temp)$/ },
  { id: 'steamdl', risk: 'caution', dir: true, unit: true, re: /\\steamapps\\downloading$/ },
  { id: 'program', risk: 'danger', dir: true, unit: true, re: /^[a-z]:\\program files( \(x86\))?\\[^\\]+$/ },
  { id: 'pkgcache', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\programdata\\package cache$/ },
  { id: 'wer', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\programdata\\microsoft\\windows\\wer$/ },
  { id: 'programdata', risk: 'caution', dir: true, area: true, re: /^[a-z]:\\programdata\\[^\\]+$/ },
  // user profile: caches first
  { id: 'usertemp', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\temp$/ },
  { id: 'inetcache', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\microsoft\\windows\\(inetcache|explorer|webcache)$/ },
  { id: 'crashdumps', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\crashdumps$/ },
  { id: 'wsl', risk: 'caution', dir: true, unit: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\local\\(packages\\[^\\]*(ubuntu|debian|kali|suse|wsl|linux)[^\\]*|docker)$/ },
  { id: 'devcache', risk: 'safe', dir: true, unit: true, re: /\\(npm-cache|yarn\\cache|pip\\cache|pnpm-cache|\.gradle\\caches|go-build|composer\\cache)$/ },
  { id: 'nuget', risk: 'caution', dir: true, unit: true, re: /\\\.nuget\\packages$/ },
  { id: 'appcache', risk: 'safe', dir: true, unit: true, re: /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata\\.*\\(cache|code cache|gpucache|cache2|cache_data|shadercache|grshadercache|dawncache|cachestorage)$/ },
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
function protectedReason(p, extra = []) {
  const l = norm(p);
  if (!/^[a-z]:\\./.test(l)) return 'root';
  const r = classify(p, true) || classify(p, false);
  if (r && r.risk === 'danger') return 'system';
  const fixed = [
    /^[a-z]:\\windows(\\|$)/, /^[a-z]:\\program files( \(x86\))?$/, /^[a-z]:\\programdata$/, /^[a-z]:\\users$/,
    /^[a-z]:\\users\\[^\\]+$/, /^[a-z]:\\(?:[^\\]+\\)*?users\\[^\\]+\\appdata(\\(local|roaming|locallow))?$/,
    /^[a-z]:\\users\\[^\\]+\\(documents|pictures|videos|music|desktop|downloads|onedrive)$/,
    /^[a-z]:\\\$recycle\.bin(\\|$)/, /^[a-z]:\\(boot|efi|bootmgr|bootnxt|config\.msi|perflogs)(\\|$)/,
  ];
  if (fixed.some(re => re.test(l))) return 'system';
  if (extra.some(x => { const e = norm(x); return l === e || e.startsWith(l + '\\') || l.startsWith(e + '\\'); })) return 'app';
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

module.exports = { RULES, classify, protectedReason, analyze };
