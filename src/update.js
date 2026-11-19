/* Update notice (bottom-right card) and the Updates card in Settings. Uses globals from app.js. */
Object.assign(S, { upd: { state: 'idle' }, updHidden: false, updManual: false, autoUpdate: true });

function updStatus(u) {
  switch (u.state) {
    case 'dev': return t('upd.devNote');
    case 'checking': return t('upd.checking');
    case 'latest': return t('upd.latest');
    case 'available': return t('upd.available', { v: u.version });
    case 'downloading': return t('upd.downloading', { p: u.percent || 0 });
    case 'ready': return t('upd.ready', { v: u.version });
    case 'error': return t('upd.error', { e: u.message || '' });
    default: return '';
  }
}
function updButton(u) {
  if (u.state === 'ready') return `<button class="go" data-upd="install">${esc(t('upd.restart'))}</button>`;
  if (u.state === 'available') return u.portable ? `<button class="go" data-upd="page">${esc(t('upd.page'))}</button>` : `<button class="go" data-upd="download">${esc(t('upd.now'))}</button>`;
  if (u.state === 'downloading') return `<button class="go" disabled>${esc(u.percent || 0)}%</button>`;
  return `<button class="ghostb" data-upd="check" ${u.state === 'dev' || u.state === 'checking' ? 'disabled' : ''}>${esc(t('upd.check'))}</button>`;
}
function updateCard() {
  const u = S.upd;
  return `<div class="card2"><h3>${esc(t('upd.title'))}</h3><div class="updrow"><div><b>${esc(t('upd.current', { v: S.version }))}</b><small>${esc(updStatus(u))}</small></div><span class="sp"></span>${updButton(u)}</div>
  ${u.state === 'downloading' ? `<div class="mb"><i style="width:${u.percent || 0}%"></i></div>` : ''}
  <label class="chk" style="margin-top:14px"><input type="checkbox" id="autoupd" ${S.autoUpdate ? 'checked' : ''}> <span>${esc(t('upd.auto'))}</span></label>${u.portable ? `<p class="hint" style="margin-top:10px">${esc(t('upd.portableNote'))}</p>` : ''}</div>`;
}
function updateBox() {
  let box = $('upd');
  if (!box) { box = document.createElement('div'); box.id = 'upd'; document.body.appendChild(box); }
  const u = S.upd, show = !S.updHidden && S.screen !== 'settings' && (['available', 'downloading', 'ready'].includes(u.state) || (S.updManual && u.state === 'error'));
  box.className = show ? 'show' : '';
  if (!show) return;
  const hint = u.state === 'available' ? t(u.portable ? 'upd.portableNote' : 'upd.availableHint') : u.state === 'ready' ? t('upd.readyHint') : '';
  box.innerHTML = `<span class="lgo">${LOGO}</span><div class="ut"><b>${esc(updStatus(u))}</b>${hint ? `<small>${esc(hint)}</small>` : ''}
    ${u.state === 'downloading' ? `<div class="mb"><i style="width:${u.percent || 0}%"></i></div>` : ''}
    <div class="ub">${u.state === 'downloading' ? '' : updButton(u)}<button class="cancel" data-upd="later">${esc(t(u.state === 'error' ? 'close' : 'upd.later'))}</button></div></div>`;
}

api.onUpdate(s => {
  const prev = S.upd.state; S.upd = s;
  if (s.state !== prev && ['available', 'ready'].includes(s.state)) S.updHidden = false;
  updateBox();
  if (S.screen === 'settings') render();
});
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-upd]'); if (!el) return;
  const a = el.dataset.upd;
  if (a === 'check') { S.updManual = true; S.updHidden = false; api.updCheck(); }
  if (a === 'download') api.updDownload();
  if (a === 'install') api.updInstall();
  if (a === 'page') api.updPage();
  if (a === 'later') { S.updHidden = true; updateBox(); }
});
document.addEventListener('change', ev => { if (ev.target.id === 'autoupd') { S.autoUpdate = ev.target.checked; api.setSettings({ autoUpdate: S.autoUpdate }); } });
// Keep the card in step with screen changes (it hides on the Settings screen).
new MutationObserver(() => updateBox()).observe($('app'), { childList: true });

(async () => {
  const [st, s] = await Promise.all([api.getSettings(), api.updState()]);
  S.upd = s; S.autoUpdate = st.autoUpdate !== false;
  if (S.autoUpdate && s.state !== 'dev') setTimeout(() => api.updCheck(), 4000);
})();
