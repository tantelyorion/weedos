'use strict';
/* Weed OS 0.8.7 - sons système, types de fichiers, presse-papiers, dialogues, menu contextuel,
   Cultivator (gestionnaire de fichiers), fichiers du Bureau et lecteurs (photos, audio, vidéo, PDF). */

/* ---------- Sons : startup.mp3 / shutdown.mp3 / error.mp3 dans assets/sounds/ ---------- */
const Sound = {
  files: { startup: 'assets/sounds/startup.mp3', shutdown: 'assets/sounds/shutdown.mp3', error: 'assets/sounds/error.mp3' },
  cache: {}, last: {}, pending: null,
  enabled() { return store.get('sound.on', '1') === '1'; },
  volume() { const v = Number(store.get('sound.vol', '80')); return Math.min(1, Math.max(0, (Number.isFinite(v) ? v : 80) / 100)); },
  play(name, force = false, vol = null) {
    if (!this.files[name] || (!force && !this.enabled())) return Promise.resolve(false);
    const now = Date.now();
    if (!force && name === 'error' && now - (this.last.error || 0) < 1500) return Promise.resolve(false);
    this.last[name] = now;
    let a = this.cache[name];
    if (!a) { a = this.cache[name] = new Audio(this.files[name]); a.preload = 'auto'; }
    a.volume = vol === null ? this.volume() : Math.min(1, Math.max(0, vol));
    try { a.currentTime = 0; } catch (e) {}
    let p; try { p = a.play(); } catch (e) { return Promise.resolve(false); }
    // Le navigateur bloque l'audio avant le premier clic : le son de démarrage est alors rejoué au premier geste.
    return Promise.resolve(p).then(() => true, err => { if (name === 'startup' && err && err.name === 'NotAllowedError') this.pending = name; return false; });
  },
  unlock() { if (this.pending) { const n = this.pending; this.pending = null; this.play(n); } },
};
['pointerdown', 'keydown', 'touchend', 'click'].forEach(ev => addEventListener(ev, () => Sound.unlock(), true));

/* ---------- Types de fichiers -> application ---------- */
const FILE_KINDS = {
  video: { app: 'video', icon: 'fa-file-video', label: 'Vidéo', ext: ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi'] },
  audio: { app: 'music', icon: 'fa-file-audio', label: 'Audio', ext: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'] },
  image: { app: 'photos', icon: 'fa-file-image', label: 'Image', ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'] },
  pdf: { app: 'pdf', icon: 'fa-file-pdf', label: 'PDF', ext: ['pdf'] },
  archive: { app: 'archive', icon: 'fa-file-zipper', label: 'Archive', ext: ['zip', 'tar', 'tgz'] },
  text: { app: 'textedit', icon: 'fa-file-lines', label: 'Texte', ext: ['txt', 'md', 'json', 'js', 'css', 'html', 'htm', 'php', 'csv', 'log', 'ini', 'xml', 'yml', 'yaml', 'py', 'sh', 'sql', 'conf', 'env', 'toml', 'ts', 'tsx', 'jsx', 'vue', 'rs', 'c', 'h', 'cpp', 'java', 'tex', 'rtf'] },
};
function fileKind(name) {
  if (/\.tar\.gz$/i.test(String(name))) return 'archive';
  const m = /\.([^.\/]+)$/.exec(String(name));
  const ext = m ? m[1].toLowerCase() : '';
  for (const [k, v] of Object.entries(FILE_KINDS)) if (v.ext.includes(ext)) return k;
  return ext === '' ? 'text' : 'unknown';
}
const fileIcon = (name, dir) => dir ? 'fa-folder' : (FILE_KINDS[fileKind(name)]?.icon || 'fa-file');
const joinPath = (d, n) => (d === '/' ? '' : d) + '/' + n;
const parentOf = p => p.split('/').slice(0, -1).join('/') || '/';
const baseName = p => p.split('/').pop();
const fileUrl = (p, dl) => '/fs-file?path=' + encodeURIComponent(p) + (dl ? '&dl=1' : '');
const validName = n => !!n && n !== '.' && n !== '..' && !/[\/\\\x00-\x1f]/.test(n) && n.length <= 200;
const fsChanged = () => document.dispatchEvent(new CustomEvent('weed:fs'));

function openWith(appId, path) {
  if (!APPS[appId]) { notify('Application introuvable', appId); return; }
  if (appId === 'archive') WM.open('archive', { fresh: true, dir: parentOf(path), zip: /\.(zip|tar|tgz)$/i.test(path) || /\.tar\.gz$/i.test(path) ? path : null });
  else WM.open(appId, { path, fresh: true });
}
/* Double-clic : l'application correspondant au type du fichier ; type inconnu -> choix « Ouvrir avec ». */
async function openFile(path, forceApp) {
  if (forceApp) return openWith(forceApp, path);
  const kind = fileKind(baseName(path));
  if (kind === 'unknown') { const app = await Dialog.openWith(path); if (app) openWith(app, path); return; }
  openWith(FILE_KINDS[kind].app, path);
}

/* ---------- Dialogues (confirmation, saisie, « Ouvrir avec ») ---------- */
const Dialog = {
  show(build) {
    return new Promise(resolve => {
      const ov = el('div', 'modal-ov'), box = el('div', 'modal glass');
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      ov.append(box); document.body.append(ov);
      const prev = document.activeElement;
      const done = v => { document.removeEventListener('keydown', onKey, true); ov.remove(); try { prev?.focus?.(); } catch (e) {} resolve(v); };
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
      document.addEventListener('keydown', onKey, true);
      ov.addEventListener('mousedown', e => { if (e.target === ov) done(null); });
      build(box, done);
    });
  },
  confirm(title, message, ok = 'Confirmer', danger = false) {
    return this.show((box, done) => {
      box.innerHTML = `<h3>${esc(title)}</h3><p>${esc(message)}</p><div class="modal-actions"><button type="button" class="b" data-r="0">Annuler</button><button type="button" class="b ${danger ? 'danger' : 'pri'}" data-r="1">${esc(ok)}</button></div>`;
      box.onclick = e => { const r = e.target.closest('[data-r]')?.dataset.r; if (r != null) done(r === '1'); };
      $('[data-r="1"]', box).focus();
    }).then(v => v === true);
  },
  prompt(title, label, value = '') {
    return this.show((box, done) => {
      box.innerHTML = `<h3>${esc(title)}</h3><p>${esc(label)}</p><input class="t" id="dlg-in" maxlength="200" autocomplete="off" spellcheck="false"><div class="modal-actions"><button type="button" class="b" data-r="0">Annuler</button><button type="button" class="b pri" data-r="1">OK</button></div>`;
      const input = $('#dlg-in', box); input.value = value;
      const submit = () => done(input.value.trim());
      box.onclick = e => { const r = e.target.closest('[data-r]')?.dataset.r; if (r === '0') done(null); else if (r === '1') submit(); };
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      input.focus();
      const dot = value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : value.length);
    });
  },
  openWith(path) {
    const choices = ['textedit', 'photos', 'pictoweed', 'music', 'video', 'pdf', 'archive'].filter(id => APPS[id]);
    return this.show((box, done) => {
      box.innerHTML = `<h3>Ouvrir avec…</h3><p>Type de fichier inconnu : « ${esc(baseName(path))} ». Choisissez une application.</p><div class="owlist">${choices.map(id => `<button type="button" class="b" data-app="${id}">${appIconHTML(APPS[id], id)} <span>${esc(APPS[id].title)}</span></button>`).join('')}</div><div class="modal-actions"><button type="button" class="b" data-r="0">Annuler</button></div>`;
      box.onclick = e => { const app = e.target.closest('[data-app]')?.dataset.app; if (app) done(app); else if (e.target.closest('[data-r]')) done(null); };
      $('[data-app]', box)?.focus();
    });
  },
};

/* ---------- Menu contextuel (clic droit) ---------- */
const CtxMenu = {
  node: null,
  hide() { if (this.node) { this.node.remove(); this.node = null; } },
  show(x, y, items) {
    this.hide();
    const m = el('div', 'ctx glass'); m.setAttribute('role', 'menu');
    items.forEach(it => {
      if (it.sep) { m.append(el('hr')); return; }
      const b = el('button', 'ctx-item' + (it.danger ? ' danger' : ''), `<i class="fa-solid ${it.icon || ''}"></i><span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}`);
      b.type = 'button'; b.disabled = !!it.disabled; b.setAttribute('role', 'menuitem');
      b.onclick = e => { e.stopPropagation(); this.hide(); if (it.action) it.action(); };
      m.append(b);
    });
    m.onkeydown = e => {
      const bs = [...m.querySelectorAll('button:not(:disabled)')], i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length]?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length]?.focus(); }
    };
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
    m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
    this.node = m;
    m.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  },
};
document.addEventListener('pointerdown', e => { if (CtxMenu.node && !e.target.closest('.ctx')) CtxMenu.hide(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') CtxMenu.hide(); });
addEventListener('blur', () => CtxMenu.hide());
addEventListener('resize', () => CtxMenu.hide());
// Pas de menu du navigateur sur le bureau ; les champs de saisie gardent leur menu natif (copier/coller du texte).
document.addEventListener('contextmenu', e => { if (!e.target.closest('input,textarea,[contenteditable="true"]')) e.preventDefault(); });

/* ---------- Opérations sur les fichiers : copier, couper, coller, renommer, supprimer… ---------- */
const FileClip = { mode: null, paths: [] };
async function listNames(dir) {
  try { return new Set((await sys('fs.list', { path: dir }, true)).items.map(i => i.name)); } catch (e) { return new Set(); }
}
function uniqueName(name, taken, suffix) {
  if (!taken.has(name)) return name;
  let base = name, ext = '';
  const m = /^(.+?)(\.[^.]+)$/.exec(name);
  if (m) { base = m[1]; ext = m[2]; }
  for (let i = 1; i < 1000; i++) { const n = base + suffix + (i > 1 ? ' ' + i : '') + ext; if (!taken.has(n)) return n; }
  return name + '-' + Date.now();
}
const FileOps = {
  async transfer(paths, destDir, mode) {
    const taken = await listNames(destDir); let ok = 0;
    for (const p of paths) {
      if (mode === 'cut' && parentOf(p) === destDir) continue;
      const target = uniqueName(baseName(p), taken, mode === 'copy' ? ' (copie)' : ' (2)');
      try { await sys(mode === 'copy' ? 'fs.copy' : 'fs.move', { src: p, dst: joinPath(destDir, target) }); taken.add(target); ok++; }
      catch (e) { notify('Opération impossible', baseName(p) + ' : ' + e.message); }
    }
    if (ok) fsChanged();
    return ok;
  },
  copy(paths) { FileClip.mode = 'copy'; FileClip.paths = [...paths]; notify('Copié', paths.length + ' élément' + (paths.length > 1 ? 's' : '') + ' dans le presse-papiers'); },
  cut(paths) { FileClip.mode = 'cut'; FileClip.paths = [...paths]; notify('Coupé', paths.length + ' élément' + (paths.length > 1 ? 's' : '') + ' : choisissez « Coller » dans le dossier de destination'); },
  async paste(destDir) {
    if (!FileClip.paths.length) return 0;
    const { mode, paths } = FileClip;
    const n = await this.transfer(paths, destDir, mode);
    if (mode === 'cut' && n) { FileClip.mode = null; FileClip.paths = []; }
    return n;
  },
  async remove(paths) {
    const label = paths.length === 1 ? '« ' + baseName(paths[0]) + ' »' : paths.length + ' éléments';
    if (!await Dialog.confirm('Supprimer', 'Supprimer ' + label + ' définitivement ? Cette action est irréversible.', 'Supprimer', true)) return false;
    for (const p of paths) {
      try { await sys('fs.rm', { path: p }); } catch (e) { notify('Suppression impossible', baseName(p) + ' : ' + e.message); }
    }
    FileClip.paths = FileClip.paths.filter(p => !paths.includes(p));
    fsChanged(); return true;
  },
  async rename(path) {
    const name = baseName(path);
    const v = await Dialog.prompt('Renommer', 'Nouveau nom', name);
    if (v == null || v === name) return;
    if (!validName(v)) { notify('Nom invalide', 'Le nom ne peut pas contenir « / » ni « \\ ».'); Sound.play('error'); return; }
    try { await sys('fs.move', { src: path, dst: joinPath(parentOf(path), v) }); fsChanged(); }
    catch (e) { notify('Renommage impossible', e.message); }
  },
  async create(dir, kind) {
    const isDir = kind === 'dir';
    const v = await Dialog.prompt(isDir ? 'Nouveau dossier' : 'Nouveau fichier', 'Nom', isDir ? 'Nouveau dossier' : 'nouveau.txt');
    if (!v) return null;
    if (!validName(v)) { notify('Nom invalide', 'Le nom ne peut pas contenir « / » ni « \\ ».'); Sound.play('error'); return null; }
    if ((await listNames(dir)).has(v)) { notify('Impossible', 'Un élément nommé « ' + v + ' » existe déjà.'); Sound.play('error'); return null; }
    try { await sys(isDir ? 'fs.mkdir' : 'fs.write', isDir ? { path: joinPath(dir, v) } : { path: joinPath(dir, v), content: '' }); fsChanged(); return joinPath(dir, v); }
    catch (e) { notify('Création impossible', e.message); return null; }
  },
  async zip(paths, dir) {
    const taken = await listNames(dir);
    const target = uniqueName(paths.length === 1 ? baseName(paths[0]) + '.zip' : 'archive.zip', taken, ' (2)');
    try { await sys('fs.zip.create', { target: joinPath(dir, target), sources: paths }); fsChanged(); notify('Archive créée', target); }
    catch (e) { notify('Compression impossible', e.message); }
  },
  async upload(files, dir) {
    const taken = await listNames(dir); let ok = 0;
    for (const f of files) {
      const name = uniqueName(f.name, taken, ' (copie)');
      const fd = new FormData(); fd.append('dir', dir); fd.append('name', name); fd.append('file', f);
      try {
        const r = await fetch('/api/fs-upload', { method: 'POST', headers: { 'X-Weed': '1' }, body: fd });
        const j = await r.json();
        if (!j.ok) { if (j.auth) Session.show(); throw new Error(j.error || 'erreur'); }
        taken.add(name); ok++;
      } catch (e) { notify('Import impossible', f.name + ' : ' + e.message); Sound.play('error'); }
    }
    if (ok) { fsChanged(); notify('Import terminé', ok + ' fichier' + (ok > 1 ? 's' : '')); }
  },
  download(path) { const a = el('a'); a.href = fileUrl(path, true); a.download = baseName(path); document.body.append(a); a.click(); a.remove(); },
};
function pickFiles(cb) {
  const i = el('input'); i.type = 'file'; i.multiple = true;
  i.onchange = () => { if (i.files.length) cb([...i.files]); };
  i.click();
}

/* ---------- Menus : sur un élément / sur le fond ---------- */
function itemMenu(ctx, paths) {
  const one = paths.length === 1, isDir = one && ctx.isDir(paths[0]), items = [];
  if (one) {
    items.push({ label: 'Ouvrir', icon: isDir ? 'fa-folder-open' : 'fa-up-right-from-square', hint: 'Entrée', action: () => ctx.open(paths[0]) });
    if (!isDir) items.push({ label: 'Ouvrir avec…', icon: 'fa-window-restore', action: async () => { const app = await Dialog.openWith(paths[0]); if (app) openFile(paths[0], app); } });
    items.push({ sep: true });
  }
  items.push({ label: 'Couper', icon: 'fa-scissors', hint: 'Ctrl+X', action: () => FileOps.cut(paths) });
  items.push({ label: 'Copier', icon: 'fa-copy', hint: 'Ctrl+C', action: () => FileOps.copy(paths) });
  if (isDir) items.push({ label: 'Coller dans ce dossier', icon: 'fa-paste', disabled: !FileClip.paths.length, action: () => FileOps.paste(paths[0]) });
  items.push({ sep: true });
  if (one) items.push({ label: 'Renommer', icon: 'fa-pen', hint: 'F2', action: () => FileOps.rename(paths[0]) });
  items.push({ label: 'Compresser en ZIP', icon: 'fa-file-zipper', action: () => FileOps.zip(paths, ctx.dir()) });
  if (one && !isDir) items.push({ label: 'Télécharger', icon: 'fa-download', action: () => FileOps.download(paths[0]) });
  items.push({ sep: true });
  items.push({ label: 'Supprimer', icon: 'fa-trash', hint: 'Suppr', danger: true, action: () => FileOps.remove(paths) });
  return items;
}
function bgMenu(ctx) {
  const items = [
    { label: 'Nouveau dossier', icon: 'fa-folder-plus', action: () => FileOps.create(ctx.dir(), 'dir') },
    { label: 'Nouveau fichier texte', icon: 'fa-file-circle-plus', action: () => FileOps.create(ctx.dir(), 'file') },
    { label: 'Importer depuis l’ordinateur…', icon: 'fa-upload', action: () => pickFiles(files => FileOps.upload(files, ctx.dir())) },
    { sep: true },
    { label: 'Coller', icon: 'fa-paste', hint: 'Ctrl+V', disabled: !FileClip.paths.length, action: () => FileOps.paste(ctx.dir()) },
    { sep: true },
    { label: 'Actualiser', icon: 'fa-rotate', action: () => ctx.reload() },
  ];
  if (ctx.desktop) items.push({ sep: true },
    { label: 'Ouvrir le dossier Bureau', icon: 'fa-folder-open', action: () => WM.open('finder', { path: ctx.dir(), fresh: true }) },
    { label: 'Changer le fond d’écran…', icon: 'fa-image', action: () => WM.open('settings') });
  return items;
}

/* ---------- Vue de fichiers partagée (Cultivator + Bureau) : sélection, clavier, menus, glisser-déposer ---------- */
function attachFileView(root, ctx) {
  const sel = new Set(); let anchor = null;
  const nodes = () => [...root.querySelectorAll('.fitem')];
  const paint = () => nodes().forEach(n => n.classList.toggle('sel', sel.has(n.dataset.path)));
  const select = paths => { sel.clear(); paths.forEach(p => sel.add(p)); paint(); };
  const itemAt = e => e.target.closest?.('.fitem');
  const state = { select, paint, clear: () => select([]), paths: () => [...sel],
    keep() { const live = new Set(nodes().map(n => n.dataset.path)); [...sel].forEach(p => { if (!live.has(p)) sel.delete(p); }); paint(); } };

  root.addEventListener('click', e => {
    const n = itemAt(e);
    if (!n) { if (e.target === root || e.target.classList.contains('fbg')) state.clear(); return; }
    const p = n.dataset.path;
    if (e.ctrlKey || e.metaKey) { sel.has(p) ? sel.delete(p) : sel.add(p); anchor = p; }
    else if (e.shiftKey && anchor) {
      const list = nodes().map(x => x.dataset.path), a = list.indexOf(anchor), b = list.indexOf(p);
      if (a >= 0 && b >= 0) { sel.clear(); list.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => sel.add(x)); }
    } else { sel.clear(); sel.add(p); anchor = p; }
    paint(); root.focus({ preventScroll: true });
  });
  root.addEventListener('dblclick', e => { const n = itemAt(e); if (n) ctx.open(n.dataset.path); });
  root.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    const n = itemAt(e);
    if (n) {
      if (!sel.has(n.dataset.path)) { sel.clear(); sel.add(n.dataset.path); anchor = n.dataset.path; paint(); }
      CtxMenu.show(e.clientX, e.clientY, itemMenu(ctx, [...sel]));
    } else { state.clear(); CtxMenu.show(e.clientX, e.clientY, bgMenu(ctx)); }
  });
  root.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey, paths = [...sel];
    if (mod && k === 'a') { e.preventDefault(); select(nodes().map(n => n.dataset.path)); }
    else if (mod && k === 'c' && paths.length) { e.preventDefault(); FileOps.copy(paths); }
    else if (mod && k === 'x' && paths.length) { e.preventDefault(); FileOps.cut(paths); }
    else if (mod && k === 'v') { e.preventDefault(); FileOps.paste(ctx.dir()); }
    else if (e.key === 'Delete' && paths.length) { e.preventDefault(); FileOps.remove(paths); }
    else if (e.key === 'F2' && paths.length === 1) { e.preventDefault(); FileOps.rename(paths[0]); }
    else if (e.key === 'Enter' && paths.length === 1) { e.preventDefault(); ctx.open(paths[0]); }
    else if (e.key === 'Escape') state.clear();
  });

  // Glisser-déposer : déplacer (Ctrl = copier) entre dossiers/fenêtres/Bureau ; déposer des fichiers de l'ordinateur = importer.
  root.addEventListener('dragstart', e => {
    const n = itemAt(e); if (!n) return;
    if (!sel.has(n.dataset.path)) { sel.clear(); sel.add(n.dataset.path); paint(); }
    e.dataTransfer.setData('application/x-weed-paths', JSON.stringify([...sel]));
    e.dataTransfer.effectAllowed = 'copyMove';
  });
  const hasData = e => { const t = [...(e.dataTransfer?.types || [])]; return t.includes('application/x-weed-paths') || t.includes('Files'); };
  let over = null;
  const clearOver = () => { if (over) over.classList.remove('drop'); over = null; };
  const dropTarget = e => { const n = itemAt(e); return n && n.dataset.dir === '1' ? n : null; };
  root.addEventListener('dragover', e => {
    if (!hasData(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
    const t = dropTarget(e);
    if (over !== t) { clearOver(); over = t; if (t) t.classList.add('drop'); }
  });
  root.addEventListener('dragleave', e => { if (!root.contains(e.relatedTarget)) clearOver(); });
  root.addEventListener('drop', async e => {
    if (!hasData(e)) return;
    e.preventDefault(); e.stopPropagation();
    const t = dropTarget(e), dest = t ? t.dataset.path : ctx.dir();
    clearOver();
    const raw = e.dataTransfer.getData('application/x-weed-paths');
    if (raw) {
      let paths = []; try { paths = JSON.parse(raw).filter(p => typeof p === 'string' && p !== dest); } catch (x) {}
      if (paths.length) await FileOps.transfer(paths, dest, e.ctrlKey ? 'copy' : 'cut');
    } else if (e.dataTransfer.files.length) await FileOps.upload([...e.dataTransfer.files], dest);
  });
  return state;
}

/* ---------- Cultivator : gestionnaire de fichiers ---------- */
APPS.finder = { title: 'Cultivator', icon: 'fa-folder-open', w: 720, h: 480, render(b, w, o) {
  let path = o.path || '/', items = [];
  b.style.display = 'flex'; b.style.flexDirection = 'column'; b.style.minHeight = '0';
  const tool = el('div', 'tool', `<button data-a="up" title="Dossier parent"><i class="fa-solid fa-arrow-up"></i></button>
    <span class="fq"><button data-go="/" title="Dossier personnel"><i class="fa-solid fa-house"></i></button><button data-go="/Bureau">Bureau</button><button data-go="/Documents">Documents</button><button data-go="/Notes">Notes</button></span>
    <b class="pth sp" style="flex:1;min-width:80px"></b>
    <button data-a="mkdir"><i class="fa-solid fa-folder-plus"></i> Dossier</button><button data-a="mkfile"><i class="fa-solid fa-file-circle-plus"></i> Fichier</button><button data-a="import"><i class="fa-solid fa-upload"></i> Importer</button>`);
  const msg = el('div', 'err pad hidden'), list = el('div', 'flist fbg'); list.tabIndex = 0;
  b.append(tool, msg, list);
  const go = p => { path = p; load(); };
  const ctx = {
    dir: () => path, reload: () => load(), desktop: false,
    isDir: p => !!items.find(i => joinPath(path, i.name) === p)?.dir,
    open: p => ctx.isDir(p) ? go(p) : openFile(p),
  };
  const view = attachFileView(list, ctx);
  async function load() {
    try {
      const r = await sys('fs.list', { path }); path = r.path; items = r.items;
      $('.pth', tool).textContent = path; msg.classList.add('hidden'); list.innerHTML = '';
      if (!items.length) list.append(el('div', 'pad', '<small>Dossier vide — clic droit pour créer, ou glissez des fichiers ici.</small>'));
      items.forEach(i => {
        const kind = i.dir ? 'dir' : fileKind(i.name);
        const row = el('div', 'row fitem fk-' + kind, `<i class="fa-solid ${fileIcon(i.name, i.dir)}"></i><span class="sp">${esc(i.name)}</span><small class="fdate">${i.mtime ? new Date(i.mtime * 1000).toLocaleDateString('fr-FR') : ''}</small><small class="fsize">${i.dir ? '' : fmtSize(i.size)}</small>`);
        row.draggable = true; row.dataset.path = joinPath(path, i.name); row.dataset.dir = i.dir ? '1' : '0';
        list.append(row);
      });
      view.keep();
    } catch (e) { msg.textContent = e.message; msg.classList.remove('hidden'); }
  }
  tool.onclick = e => {
    const go2 = e.target.closest('[data-go]')?.dataset.go; if (go2) return go(go2);
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'up') go(parentOf(path));
    if (a === 'mkdir') FileOps.create(path, 'dir');
    if (a === 'mkfile') FileOps.create(path, 'file');
    if (a === 'import') pickFiles(files => FileOps.upload(files, path));
  };
  const onFs = () => { if (!b.isConnected) { document.removeEventListener('weed:fs', onFs); return; } load(); };
  document.addEventListener('weed:fs', onFs);
  load();
} };

/* ---------- Fichiers du Bureau : le dossier /Bureau est affiché comme bureau ---------- */
const DesktopIcons = {
  dir: '/Bureau', root: null, view: null, items: [], sig: '', timer: null, hooked: false,
  ensure() {
    if (this.root) return;
    const r = el('div', 'fbg'); r.id = 'desk-icons'; r.tabIndex = 0; r.setAttribute('aria-label', 'Bureau');
    $('#desktop').prepend(r); this.root = r;
    const self = this;
    this.view = attachFileView(r, {
      desktop: true, dir: () => self.dir, reload: () => self.load(true),
      isDir: p => !!self.items.find(i => i.path === p)?.dir, open: p => self.open(p),
    });
    if (!this.hooked) { this.hooked = true; document.addEventListener('weed:fs', () => { if (this.timer) this.load(true); }); }
  },
  start() {
    this.ensure(); this.load(true);
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (!document.hidden) this.load(false); }, 6000);
  },
  stop() { clearInterval(this.timer); this.timer = null; if (this.root) this.root.innerHTML = ''; this.items = []; this.sig = ''; },
  open(p) { const it = this.items.find(i => i.path === p); if (it?.dir) WM.open('finder', { path: p, fresh: true }); else openFile(p); },
  async load(force) {
    try {
      const r = await sys('fs.list', { path: this.dir }, true);
      const sig = JSON.stringify(r.items.map(i => [i.name, i.size, i.mtime, i.dir]));
      if (!force && sig === this.sig) return;
      this.sig = sig; this.items = r.items.map(i => ({ ...i, path: joinPath(this.dir, i.name) })); this.paint();
    } catch (e) { /* session expirée ou noyau indisponible : le bureau garde son dernier état */ }
  },
  paint() {
    this.root.innerHTML = '';
    this.items.forEach(i => {
      const kind = i.dir ? 'dir' : fileKind(i.name);
      const thumb = kind === 'image' && i.size < 3145728 && !/\.svg$/i.test(i.name);
      const n = el('div', 'fitem dicon fk-' + kind, `${thumb ? `<img class="dthumb" loading="lazy" alt="" src="${esc(fileUrl(i.path))}" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-file-image'}))">` : `<i class="fa-solid ${fileIcon(i.name, i.dir)}"></i>`}<span>${esc(i.name)}</span>`);
      n.draggable = false; n.dataset.path = i.path; n.dataset.dir = i.dir ? '1' : '0'; n.title = i.name;
      const saved = (() => { try { return JSON.parse(store.get('desktop.positions', '{}'))[i.path]; } catch(e) { return null; } })();
      const columns = Math.max(1, Math.floor((this.root.clientHeight - 120) / 102));
      const idx = this.items.indexOf(i);
      n.style.position = 'absolute';
      n.style.left = (saved && Number.isFinite(saved.x) ? saved.x : 14 + Math.floor(idx / columns) * 100) + 'px';
      n.style.top = (saved && Number.isFinite(saved.y) ? saved.y : 14 + (idx % columns) * 102) + 'px';
      n.onpointerdown = e => {
        if (e.button !== 0) return;
        const startX=e.clientX,startY=e.clientY,left=parseFloat(n.style.left)||0,top=parseFloat(n.style.top)||0; let moved=false;
        n.setPointerCapture(e.pointerId);
        n.onpointermove = m => { if (Math.hypot(m.clientX-startX,m.clientY-startY)>4) moved=true; if (!moved) return;
          n.style.left=Math.max(0,Math.min(this.root.clientWidth-96,left+m.clientX-startX))+'px';
          n.style.top=Math.max(0,Math.min(this.root.clientHeight-100,top+m.clientY-startY))+'px'; };
        n.onpointerup = () => { n.onpointermove=n.onpointerup=null; if (moved) { let map={}; try { map=JSON.parse(store.get('desktop.positions','{}')); } catch(e) {} map[i.path]={x:parseFloat(n.style.left)||0,y:parseFloat(n.style.top)||0}; store.set('desktop.positions',JSON.stringify(map)); } };
      };
      this.root.append(n);
    });
    this.view.keep();
  },
};

/* ---------- Lecteurs : photos, audio, vidéo, PDF (fichiers du Cultivator ou de l'ordinateur) ---------- */
async function siblingsOfKind(path, kind) {
  const dir = parentOf(path);
  try {
    const r = await sys('fs.list', { path: dir }, true);
    const list = r.items.filter(i => !i.dir && fileKind(i.name) === kind).map(i => ({ name: i.name, src: fileUrl(joinPath(dir, i.name)) }));
    if (list.some(x => x.name === baseName(path))) return list;
  } catch (e) {}
  return [{ name: baseName(path), src: fileUrl(path) }];
}

APPS.photos = { title: 'Visionneuse de photos', icon: 'fa-image', w: 780, h: 560, async render(b, w, o) {
  b.style.display = 'flex'; b.style.flexDirection = 'column'; b.style.minHeight = '0';
  b.innerHTML = `<div class="tool"><input type="file" id="pf" accept="image/*" multiple><button class="b" id="pp" title="Précédente"><i class="fa-solid fa-chevron-left"></i></button><button class="b" id="pn" title="Suivante"><i class="fa-solid fa-chevron-right"></i></button><span id="pname" class="sp"></span></div><div class="viewer"><img id="pi" alt=""></div>`;
  let list = [], i = 0, blob = '';
  const img = $('#pi', b), label = $('#pname', b);
  const show = () => {
    if (!list.length) return;
    img.onerror = () => { label.textContent = list[i].name + ' — image illisible'; Sound.play('error'); };
    img.src = list[i].src; label.textContent = list[i].name + ' (' + (i + 1) + '/' + list.length + ')';
  };
  $('#pf', b).onchange = e => { if (blob) URL.revokeObjectURL(blob); list = [...e.target.files].map(f => ({ name: f.name, src: URL.createObjectURL(f) })); blob = list[0]?.src || ''; i = 0; show(); };
  $('#pp', b).onclick = () => { if (list.length) { i = (i + list.length - 1) % list.length; show(); } };
  $('#pn', b).onclick = () => { if (list.length) { i = (i + 1) % list.length; show(); } };
  if (o.path) { list = await siblingsOfKind(o.path, 'image'); i = Math.max(0, list.findIndex(x => x.name === baseName(o.path))); show(); }
} };

APPS.music = { title: 'Lecteur audio', icon: 'fa-music', w: 540, h: 380, async render(b, w, o) {
  b.innerHTML = `<div class="pad"><h3 id="mt">Lecteur audio</h3><input type="file" id="af" accept="audio/*" multiple><div id="al" class="mlist"></div><audio id="ap" controls style="width:100%"></audio><small id="mst" class="err"></small></div>`;
  const l = $('#al', b), a = $('#ap', b), st = $('#mst', b), title = $('#mt', b);
  let tracks = [], cur = -1;
  const draw = () => { l.innerHTML = ''; tracks.forEach((t, k) => { const x = el('button', 'b' + (k === cur ? ' on' : ''), esc(t.name)); x.type = 'button'; x.onclick = () => play(k); l.append(x); }); };
  const play = k => { cur = k; st.textContent = ''; title.textContent = tracks[k].name; a.src = tracks[k].src; a.play().catch(() => {}); draw(); };
  a.onended = () => { if (cur + 1 < tracks.length) play(cur + 1); };
  a.onerror = () => { st.textContent = 'Ce fichier audio ne peut pas être lu par le navigateur.'; Sound.play('error'); };
  $('#af', b).onchange = e => { tracks = [...e.target.files].map(f => ({ name: f.name, src: URL.createObjectURL(f) })); cur = -1; draw(); if (tracks.length) play(0); };
  if (o.path) { tracks = await siblingsOfKind(o.path, 'audio'); draw(); play(Math.max(0, tracks.findIndex(x => x.name === baseName(o.path)))); }
} };

APPS.video = { title: 'Lecteur vidéo', icon: 'fa-film', w: 780, h: 520, render(b, w, o) {
  b.style.display = 'flex'; b.style.flexDirection = 'column'; b.style.minHeight = '0';
  b.innerHTML = `<div class="tool"><input type="file" id="vf" accept="video/*"><span class="sp" id="vname">Ouvrir une vidéo</span></div><video id="vp" controls style="width:100%;flex:1;min-height:0;background:#000"></video>`;
  const v = $('#vp', b), name = $('#vname', b);
  v.onerror = () => { name.textContent = (name.dataset.n || 'Vidéo') + ' — format non pris en charge par le navigateur (essayez MP4/H.264 ou WebM)'; Sound.play('error'); };
  const start = (src, n) => { name.dataset.n = n; name.textContent = n; v.src = src; v.play().catch(() => {}); };
  $('#vf', b).onchange = e => { const f = e.target.files[0]; if (f) start(URL.createObjectURL(f), f.name); };
  if (o.path) start(fileUrl(o.path), baseName(o.path));
} };

APPS.pdf = { title: 'Lecteur PDF', icon: 'fa-file-pdf', w: 820, h: 620, render(b, w, o) {
  b.style.display = 'flex'; b.style.flexDirection = 'column'; b.style.minHeight = '0';
  b.innerHTML = `<div class="tool"><input type="file" id="df" accept="application/pdf"><span class="sp" id="dname">Ouvrir un document PDF</span></div><iframe id="dp" title="PDF" style="width:100%;flex:1;min-height:0;border:0;background:#555"></iframe>`;
  $('#df', b).onchange = e => { const f = e.target.files[0]; if (f) { $('#dp', b).src = URL.createObjectURL(f); $('#dname', b).textContent = f.name; } };
  if (o.path) { $('#dp', b).src = fileUrl(o.path); $('#dname', b).textContent = baseName(o.path); }
} };
