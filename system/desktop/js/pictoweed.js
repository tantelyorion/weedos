'use strict';
/* Pictoweed - gestionnaire et éditeur de photos pour Weed OS (v1.0)
 *  - Bibliothèque : toutes les photos du dossier personnel, dossiers, albums, favoris, recherche, tri
 *  - Éditeur non destructif : rotation, miroir, recadrage, réglages, filtres, annuler / rétablir
 *  - Diaporama plein cadre, import depuis l'ordinateur (bouton ou glisser-déposer), suppression
 *  Les albums et favoris sont stockés dans /Pictoweed/library.json (dans le dossier personnel de l'utilisateur).
 *  Les textes sont en français (langue source) : js/i18n.js les traduit.
 */
(function () {
  const IMG = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
  const PIC_DIR = '/Pictures', DATA_DIR = '/Pictoweed', DATA_FILE = '/Pictoweed/library.json';
  const MAX_SCAN = 5000, MAX_DEPTH = 6, PREVIEW_MAX = 1400, SAVE_MAX = 8192;

  /* ---------------------------------------------------------------- Traitement d'image (pur, testable) */
  const DEFAULT_ADJ = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, shadows: 0, highlights: 0, sharpen: 0, vignette: 0 };
  const FILTERS = {
    none: null,
    mono: (r, g, b) => { const y = .299 * r + .587 * g + .114 * b; return [y, y, y]; },
    noir: (r, g, b) => { let y = .299 * r + .587 * g + .114 * b; y = (y - 128) * 1.35 + 124; return [y, y, y]; },
    sepia: (r, g, b) => [.393 * r + .769 * g + .189 * b, .349 * r + .686 * g + .168 * b, .272 * r + .534 * g + .131 * b],
    vintage: (r, g, b) => [r * .9 + g * .2 + 22, g * .85 + b * .1 + 12, b * .7 + 28],
    fade: (r, g, b) => [r * .85 + 30, g * .85 + 30, b * .85 + 36],
    vivid: (r, g, b) => { const y = .299 * r + .587 * g + .114 * b; return [y + (r - y) * 1.45, y + (g - y) * 1.45, y + (b - y) * 1.45]; },
    cool: (r, g, b) => [r * .92, g * 1.0, b * 1.12 + 6],
    warm: (r, g, b) => [r * 1.1 + 6, g * 1.02, b * .88]
  };
  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;

  /* Applique réglages + filtre à un ImageData (modifié en place). */
  function process(img, adj, filter) {
    const d = img.data, w = img.width, h = img.height;
    const br = adj.brightness * 1.28;
    const c = adj.contrast * 2.55, cf = (259 * (c + 255)) / (255 * (259 - c));
    const sat = 1 + adj.saturation / 100, warm = adj.warmth * .4;
    const sh = adj.shadows / 100 * .6, hl = adj.highlights / 100 * .6;
    const fn = FILTERS[filter] || null;
    const plain = !br && !adj.contrast && !adj.saturation && !adj.warmth && !adj.shadows && !adj.highlights && !fn;
    if (!plain) {
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        if (fn) { const o = fn(r, g, b); r = o[0]; g = o[1]; b = o[2]; }
        r += br; g += br; b += br;
        if (adj.contrast) { r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128; }
        if (adj.shadows || adj.highlights) {
          const l = .299 * r + .587 * g + .114 * b;
          const add = l < 128 ? sh * (1 - l / 128) * 128 : hl * ((l - 128) / 128) * 128;
          r += add; g += add; b += add;
        }
        if (adj.saturation) { const y = .299 * r + .587 * g + .114 * b; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat; }
        if (warm) { r += warm; b -= warm; }
        d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
      }
    }
    if (adj.sharpen > 0) sharpen(img, adj.sharpen / 100);
    if (adj.vignette > 0) {
      const v = adj.vignette / 100, cx = w / 2, cy = h / 2, maxd = Math.sqrt(cx * cx + cy * cy);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dd = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxd;
        const k = 1 - v * Math.pow(Math.max(0, dd - .25) / .75, 1.6);
        const o = (y * w + x) * 4; d[o] *= k; d[o + 1] *= k; d[o + 2] *= k;
      }
    }
    return img;
  }
  /* Netteté : masque de convolution 3x3 mélangé selon la force. */
  function sharpen(img, amount) {
    const w = img.width, h = img.height, s = img.data, src = new Uint8ClampedArray(s);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const o = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = 5 * src[o + ch] - src[o - 4 + ch] - src[o + 4 + ch] - src[o - w * 4 + ch] - src[o + w * 4 + ch];
        s[o + ch] = clamp(src[o + ch] + (v - src[o + ch]) * amount);
      }
    }
  }
  const emptyState = () => ({ rot: 0, flipH: false, flipV: false, crop: null, adj: { ...DEFAULT_ADJ }, filter: 'none' });
  window.PictoweedCore = { process, emptyState, FILTERS, DEFAULT_ADJ };

  /* ---------------------------------------------------------------- Aides fichiers */
  const jp = (d, n) => (d === '/' ? '' : d) + '/' + n;
  const dirOf = p => p.split('/').slice(0, -1).join('/') || '/';
  const nameOf = p => p.split('/').pop();
  const extOf = n => (n.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
  const stemOf = n => n.replace(/\.[^.]+$/, '');
  const url = p => '/fs-file?path=' + encodeURIComponent(p);
  const fmt = n => n < 1024 ? n + ' o' : n < 1048576 ? (n / 1024).toFixed(0) + ' Ko' : (n / 1048576).toFixed(1) + ' Mo';

  async function upload(dir, name, blob) {
    const fd = new FormData(); fd.append('dir', dir); fd.append('name', name); fd.append('file', blob, name);
    const r = await fetch('/api/fs-upload', { method: 'POST', headers: { 'X-Weed': '1' }, body: fd });
    const j = await r.json(); if (!j.ok) throw new Error(j.error || 'envoi échoué'); return j.result.path;
  }
  async function ensureDir(p) { try { await sys('fs.mkdir', { path: p }, true); } catch (e) { /* existe déjà */ } }

  async function scan(root, depth, out, state) {
    if (depth > MAX_DEPTH || out.length >= MAX_SCAN) return;
    let r; try { r = await sys('fs.list', { path: root }, true); } catch (e) { return; }
    const dirs = [];
    for (const it of r.items) {
      if (it.name.startsWith('.')) continue;
      const p = jp(root, it.name);
      if (it.dir) dirs.push(p);
      else if (IMG.test(it.name) && out.length < MAX_SCAN) out.push({ path: p, name: it.name, dir: root, size: it.size || 0, mtime: it.mtime || 0 });
    }
    for (const d of dirs) { if (d === DATA_DIR) continue; await scan(d, depth + 1, out, state); }
  }

  /* ---------------------------------------------------------------- Styles */
  const CSS = `
.pw{display:flex;height:100%;min-height:0;position:relative;font-size:13px}
.pw-side{width:190px;flex:none;border-right:1px solid rgba(255,255,255,.08);overflow:auto;padding:8px 6px;background:rgba(0,0,0,.16)}
.pw-side h4{margin:12px 8px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600}
.pw-nav{display:flex;align-items:center;gap:8px;width:100%;text-align:start;background:none;border:0;color:inherit;padding:6px 8px;border-radius:8px;cursor:pointer;font:inherit}
.pw-nav:hover{background:rgba(255,255,255,.07)}.pw-nav.sel{background:hsl(var(--h) 80% 30% / .55)}
.pw-nav i{width:16px;text-align:center;color:var(--accent)}.pw-nav span.n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pw-nav small{color:var(--muted)}
.pw-main{flex:1;min-width:0;display:flex;flex-direction:column}
.pw-bar{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.07);flex-wrap:wrap}
.pw-bar h3{margin:0;font-size:15px;flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pw-bar input[type=search],.pw-bar select{min-width:0}
.pw-grid{flex:1;min-height:0;overflow:auto;padding:10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--ts,150px),1fr));grid-auto-rows:var(--ts,150px);gap:8px;align-content:start}
.pw-th{position:relative;border-radius:8px;overflow:hidden;background:#0b120e;cursor:pointer;outline:2px solid transparent}
.pw-th img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.pw-th.sel{outline-color:var(--accent)}
.pw-th .st{position:absolute;top:4px;inset-inline-end:4px;color:#ffd75e;text-shadow:0 1px 3px #000;font-size:14px}
.pw-th .ck{position:absolute;top:4px;inset-inline-start:4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:#04210f;display:none;place-items:center;font-size:10px}
.pw-th.sel .ck{display:grid}
.pw-th .cap{position:absolute;inset-inline:0;bottom:0;padding:14px 6px 4px;font-size:11px;background:linear-gradient(transparent,rgba(0,0,0,.7));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .15s}
.pw-th:hover .cap{opacity:1}
.pw-empty{grid-column:1/-1;text-align:center;color:var(--muted);padding:50px 10px}
.pw-status{padding:5px 12px;color:var(--muted);border-top:1px solid rgba(255,255,255,.07);display:flex;gap:12px;align-items:center}
.pw-status .sp{flex:1}
.pw-drop{position:absolute;inset:0;background:rgba(0,0,0,.55);border:3px dashed var(--accent);display:grid;place-items:center;font-size:18px;z-index:20;pointer-events:none}
.pw-edit{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;background:#070d0a}
.pw-etop{display:flex;gap:6px;align-items:center;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap}
.pw-etop .ttl{flex:1;min-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pw-ebody{flex:1;min-height:0;display:flex}
.pw-panel{width:250px;flex:none;border-inline-end:1px solid rgba(255,255,255,.08);overflow:auto;padding:8px 10px}
.pw-tabs{display:flex;gap:4px;margin-bottom:8px}.pw-tabs button{flex:1}
.pw-tabs button.sel{background:hsl(var(--h) 80% 30% / .6)}
.pw-row{display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin:7px 0;align-items:center}
.pw-row input[type=range]{grid-column:1/-1;width:100%}.pw-row output{color:var(--muted);font-variant-numeric:tabular-nums}
.pw-stage{flex:1;min-width:0;position:relative;display:grid;place-items:center;overflow:hidden;background:repeating-conic-gradient(#0a110d 0 25%,#0d1611 0 50%) 0 0/20px 20px}
.pw-stage canvas{max-width:100%;max-height:100%;display:block}
.pw-wrap{position:relative;display:inline-block;line-height:0}
.pw-crop{position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move;touch-action:none}
.pw-flt{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.pw-flt button{padding:0;border:2px solid transparent;border-radius:8px;overflow:hidden;background:#000;cursor:pointer;color:inherit}
.pw-flt button.sel{border-color:var(--accent)}.pw-flt canvas{width:100%;display:block}.pw-flt span{display:block;padding:3px;font-size:11px}
.pw-navbtn{position:absolute;top:50%;transform:translateY(-50%);z-index:3;opacity:.75}
.pw-show{position:absolute;inset:0;z-index:30;background:#000;display:grid;place-items:center}
.pw-show img{max-width:100%;max-height:100%;object-fit:contain}
.pw-show .ctl{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;background:rgba(0,0,0,.6);padding:6px 10px;border-radius:12px;opacity:0;transition:opacity .25s}
.pw-show:hover .ctl{opacity:1}
@media(max-width:700px){.pw-side{width:130px}.pw-panel{width:200px}}
`;
  if (!document.getElementById('pw-css')) { const s = document.createElement('style'); s.id = 'pw-css'; s.textContent = CSS; document.head.append(s); }

  /* ---------------------------------------------------------------- Application */
  APPS.pictoweed = { title: 'Pictoweed', icon: 'fa-images', w: 1020, h: 660, async render(b, win, o = {}) {
    b.style.padding = '0'; b.style.minHeight = '0';
    const S = { photos: [], lib: { albums: {}, favs: [] }, view: 'all', sel: new Set(), last: null, q: '', sort: 'date', size: 150, loaded: false };
    b.innerHTML = `<div class="pw">
      <aside class="pw-side" id="pw-side"></aside>
      <section class="pw-main">
        <div class="pw-bar">
          <h3 id="pw-title">Toutes les photos</h3>
          <input class="t" type="search" id="pw-q" placeholder="Rechercher une photo…" style="width:150px">
          <select class="t" id="pw-sort" aria-label="Trier"><option value="date">Plus récentes</option><option value="name">Nom</option><option value="size">Taille</option></select>
          <input type="range" id="pw-size" min="90" max="280" value="150" title="Taille des miniatures" style="width:90px">
          <button class="b" id="pw-import"><i class="fa-solid fa-file-import"></i> Importer</button>
          <button class="b" id="pw-show"><i class="fa-solid fa-play"></i> Diaporama</button>
          <button class="b" id="pw-refresh" title="Actualiser"><i class="fa-solid fa-rotate"></i></button>
          <input type="file" id="pw-file" accept="image/*" multiple class="hidden">
        </div>
        <div class="pw-grid" id="pw-grid"></div>
        <div class="pw-status"><span id="pw-count" class="sp"></span><span id="pw-msg"></span>
          <button class="b" id="pw-fav" title="Favori"><i class="fa-regular fa-star"></i></button>
          <select class="t" id="pw-addalbum" aria-label="Ajouter à un album"></select>
          <button class="b hidden" id="pw-rmalbum"><i class="fa-solid fa-minus"></i> Retirer de l'album</button>
          <button class="b" id="pw-edit"><i class="fa-solid fa-wand-magic-sparkles"></i> Retoucher</button>
          <button class="b danger" id="pw-del"><i class="fa-solid fa-trash"></i> Supprimer</button></div>
      </section></div>`;
    const root = $('.pw', b), grid = $('#pw-grid', b), side = $('#pw-side', b);
    const msg = (t, err) => { const m = $('#pw-msg', b); m.textContent = t || ''; m.style.color = err ? '#ff8f8f' : ''; if (t) setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 4000); };

    /* ---- bibliothèque (albums / favoris) ---- */
    async function loadLib() {
      try { const j = JSON.parse(await sys('fs.read', { path: DATA_FILE }, true)); S.lib = { albums: j.albums || {}, favs: j.favs || [] }; } catch (e) { S.lib = { albums: {}, favs: [] }; }
    }
    async function saveLib() {
      try { await ensureDir(DATA_DIR); await sys('fs.write', { path: DATA_FILE, content: JSON.stringify(S.lib) }, true); } catch (e) { msg(e.message, true); }
    }
    const isFav = p => S.lib.favs.includes(p);

    /* ---- chargement ---- */
    async function load() {
      msg('Analyse de la bibliothèque…');
      const out = []; await scan('/', 0, out);
      S.photos = out; S.loaded = true;
      // nettoyage des références à des photos supprimées
      const known = new Set(out.map(p => p.path)); let dirty = false;
      S.lib.favs = S.lib.favs.filter(p => known.has(p) || !(dirty = true));
      for (const a of Object.keys(S.lib.albums)) { const k = S.lib.albums[a].filter(p => known.has(p)); if (k.length !== S.lib.albums[a].length) { S.lib.albums[a] = k; dirty = true; } }
      if (dirty) saveLib();
      msg(''); draw();
    }

    /* ---- panneau latéral ---- */
    function drawSide() {
      const folders = {}; S.photos.forEach(p => { folders[p.dir] = (folders[p.dir] || 0) + 1; });
      const nav = (id, icon, label, count) => `<button class="pw-nav ${S.view === id ? 'sel' : ''}" data-v="${esc(id)}"><i class="fa-solid ${icon}"></i><span class="n">${esc(label)}</span><small>${count ?? ''}</small></button>`;
      let h = '<h4>Bibliothèque</h4>' + nav('all', 'fa-images', 'Toutes les photos', S.photos.length) + nav('fav', 'fa-star', 'Favoris', S.lib.favs.length);
      h += '<h4>Dossiers</h4>' + Object.keys(folders).sort().map(d => nav('dir:' + d, 'fa-folder', d === '/' ? 'Dossier personnel' : nameOf(d), folders[d])).join('');
      h += '<h4>Albums</h4>' + Object.keys(S.lib.albums).sort().map(a => nav('album:' + a, 'fa-rectangle-list', a, S.lib.albums[a].length)).join('');
      h += `<div style="padding:4px 6px"><div id="pw-newbox" class="hidden"><input class="t" id="pw-newname" placeholder="Nom de l'album" style="width:100%"></div><button class="pw-nav" id="pw-newalbum"><i class="fa-solid fa-plus"></i><span class="n">Nouvel album</span></button></div>`;
      side.innerHTML = h;
      side.querySelectorAll('[data-v]').forEach(x => x.onclick = () => { S.view = x.dataset.v; S.sel.clear(); draw(); });
      $('#pw-newalbum', side).onclick = () => { $('#pw-newbox', side).classList.remove('hidden'); $('#pw-newname', side).focus(); };
      $('#pw-newname', side).onkeydown = async e => {
        if (e.key === 'Escape') { $('#pw-newbox', side).classList.add('hidden'); return; }
        if (e.key !== 'Enter') return;
        const n = e.target.value.trim().slice(0, 40); if (!n) return;
        if (S.lib.albums[n]) { msg('Cet album existe déjà.', true); return; }
        S.lib.albums[n] = []; await saveLib(); S.view = 'album:' + n; draw();
      };
    }

    /* ---- liste courante ---- */
    function current() {
      let l = S.photos;
      if (S.view === 'fav') l = l.filter(p => isFav(p.path));
      else if (S.view.startsWith('dir:')) l = l.filter(p => p.dir === S.view.slice(4));
      else if (S.view.startsWith('album:')) { const set = new Set(S.lib.albums[S.view.slice(6)] || []); l = l.filter(p => set.has(p.path)); }
      if (S.q) { const q = S.q.toLowerCase(); l = l.filter(p => p.name.toLowerCase().includes(q)); }
      l = [...l];
      if (S.sort === 'name') l.sort((a, c) => a.name.localeCompare(c.name, undefined, { numeric: true }));
      else if (S.sort === 'size') l.sort((a, c) => c.size - a.size);
      else l.sort((a, c) => c.mtime - a.mtime);
      return l;
    }
    function viewTitle() {
      if (S.view === 'all') return 'Toutes les photos'; if (S.view === 'fav') return 'Favoris';
      if (S.view.startsWith('dir:')) { const d = S.view.slice(4); return d === '/' ? 'Dossier personnel' : nameOf(d); }
      return S.view.slice(6);
    }
    function draw() {
      drawSide();
      const list = current(); S.list = list;
      $('#pw-title', b).textContent = viewTitle();
      grid.style.setProperty('--ts', S.size + 'px');
      if (!list.length) grid.innerHTML = `<div class="pw-empty"><i class="fa-regular fa-images" style="font-size:44px;display:block;margin-bottom:10px"></i>${S.loaded ? 'Aucune photo ici. Importez des images ou ouvrez un autre dossier.' : 'Chargement…'}</div>`;
      else grid.innerHTML = list.map((p, i) => `<div class="pw-th ${S.sel.has(p.path) ? 'sel' : ''}" data-i="${i}" title="${esc(p.name)}"><img loading="lazy" decoding="async" src="${esc(url(p.path))}" alt="${esc(p.name)}">${isFav(p.path) ? '<i class="fa-solid fa-star st"></i>' : ''}<span class="ck"><i class="fa-solid fa-check"></i></span><span class="cap">${esc(p.name)}</span></div>`).join('');
      statusUpdate();
    }
    function statusUpdate() {
      const n = S.sel.size, list = S.list || [];
      $('#pw-count', b).textContent = n ? `${n} sélectionnée(s) sur ${list.length}` : `${list.length} photo(s)`;
      const albumView = S.view.startsWith('album:');
      $('#pw-rmalbum', b).classList.toggle('hidden', !albumView || !n);
      ['#pw-fav', '#pw-addalbum', '#pw-edit', '#pw-del'].forEach(s => $(s, b).classList.toggle('hidden', !n));
      const sel = $('#pw-addalbum', b);
      sel.innerHTML = '<option value="">Ajouter à l\'album…</option>' + Object.keys(S.lib.albums).sort().map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
      const allFav = n && [...S.sel].every(isFav);
      $('#pw-fav i', b).className = allFav ? 'fa-solid fa-star' : 'fa-regular fa-star';
    }

    /* ---- sélection ---- */
    grid.onclick = e => {
      const th = e.target.closest('.pw-th'); if (!th) { if (e.target === grid) { S.sel.clear(); draw(); } return; }
      const i = +th.dataset.i, p = S.list[i].path;
      if (e.shiftKey && S.last != null) { const [a, c] = [Math.min(S.last, i), Math.max(S.last, i)]; for (let k = a; k <= c; k++) S.sel.add(S.list[k].path); }
      else if (e.ctrlKey || e.metaKey) S.sel.has(p) ? S.sel.delete(p) : S.sel.add(p);
      else { S.sel.clear(); S.sel.add(p); }
      S.last = i; grid.querySelectorAll('.pw-th').forEach(x => x.classList.toggle('sel', S.sel.has(S.list[+x.dataset.i].path))); statusUpdate();
    };
    grid.ondblclick = e => { const th = e.target.closest('.pw-th'); if (th) openEditor(S.list[+th.dataset.i].path); };

    /* ---- actions ---- */
    $('#pw-q', b).oninput = e => { S.q = e.target.value; draw(); };
    $('#pw-sort', b).onchange = e => { S.sort = e.target.value; draw(); };
    $('#pw-size', b).oninput = e => { S.size = +e.target.value; grid.style.setProperty('--ts', S.size + 'px'); };
    $('#pw-refresh', b).onclick = load;
    $('#pw-edit', b).onclick = () => { const p = [...S.sel][0]; if (p) openEditor(p); };
    $('#pw-fav', b).onclick = async () => {
      const all = [...S.sel].every(isFav);
      S.sel.forEach(p => { S.lib.favs = S.lib.favs.filter(x => x !== p); if (!all) S.lib.favs.push(p); });
      await saveLib(); draw();
    };
    $('#pw-addalbum', b).onchange = async e => {
      const a = e.target.value; if (!a) return;
      const set = new Set(S.lib.albums[a] || []); S.sel.forEach(p => set.add(p)); S.lib.albums[a] = [...set];
      await saveLib(); msg(`Ajouté à l'album « ${a} »`); draw();
    };
    $('#pw-rmalbum', b).onclick = async () => {
      const a = S.view.slice(6); S.lib.albums[a] = (S.lib.albums[a] || []).filter(p => !S.sel.has(p)); S.sel.clear(); await saveLib(); draw();
    };
    $('#pw-del', b).onclick = async () => {
      const paths = [...S.sel]; if (!paths.length) return;
      if (!confirm(paths.length === 1 ? `Supprimer « ${nameOf(paths[0])} » définitivement ? Cette action est irréversible.` : `Supprimer ${paths.length} photos définitivement ? Cette action est irréversible.`)) return;
      let fail = 0; for (const p of paths) { try { await sys('fs.rm', { path: p }, true); } catch (e) { fail++; } }
      S.sel.clear(); if (fail) msg(`${fail} photo(s) n'ont pas pu être supprimées.`, true); await load(); fsChanged();
    };
    async function importFiles(files) {
      files = [...files].filter(f => f.type.startsWith('image/') || IMG.test(f.name)); if (!files.length) return;
      await ensureDir(PIC_DIR); let ok = 0, fail = 0;
      for (const f of files) {
        msg(`Import… ${ok + fail + 1}/${files.length}`);
        try { await upload(PIC_DIR, f.name, f); ok++; } catch (e) {
          if (/existe déjà/.test(e.message)) { try { await upload(PIC_DIR, stemOf(f.name) + '-' + Date.now().toString(36) + '.' + extOf(f.name), f); ok++; continue; } catch (e2) {} }
          fail++;
        }
      }
      msg(fail ? `${ok} importée(s), ${fail} échec(s).` : `${ok} photo(s) importée(s).`, !!fail); await load(); fsChanged();
    }
    $('#pw-import', b).onclick = () => $('#pw-file', b).click();
    $('#pw-file', b).onchange = e => { importFiles(e.target.files); e.target.value = ''; };
    root.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); if (!$('.pw-drop', root)) root.append(el('div', 'pw-drop', 'Déposez vos photos pour les importer')); } });
    root.addEventListener('dragleave', e => { if (e.target === root || !root.contains(e.relatedTarget)) $('.pw-drop', root)?.remove(); });
    root.addEventListener('drop', e => { $('.pw-drop', root)?.remove(); if (e.dataTransfer?.files?.length) { e.preventDefault(); importFiles(e.dataTransfer.files); } });
    $('#pw-show', b).onclick = () => { const l = S.sel.size > 1 ? S.list.filter(p => S.sel.has(p.path)) : S.list; if (l.length) slideshow(l, S.sel.size === 1 ? Math.max(0, l.findIndex(p => S.sel.has(p.path))) : 0); };

    /* ---------------------------------------------------------------- Diaporama */
    function slideshow(list, start) {
      let i = start, playing = true, timer = null;
      const box = el('div', 'pw-show', `<img alt=""><div class="ctl"><button class="b" data-a="p" title="Précédente"><i class="fa-solid fa-backward-step"></i></button><button class="b" data-a="pp" title="Lecture / pause"><i class="fa-solid fa-pause"></i></button><button class="b" data-a="n" title="Suivante"><i class="fa-solid fa-forward-step"></i></button><span class="cnt" style="align-self:center;color:var(--muted)"></span><button class="b" data-a="x" title="Fermer"><i class="fa-solid fa-xmark"></i></button></div>`);
      root.append(box); box.tabIndex = 0; box.focus();
      const show = () => { $('img', box).src = url(list[i].path); $('.cnt', box).textContent = `${i + 1}/${list.length} · ${list[i].name}`; };
      const go = d => { i = (i + d + list.length) % list.length; show(); };
      const arm = () => { clearInterval(timer); if (playing) timer = setInterval(() => go(1), 3500); };
      const close = () => { clearInterval(timer); box.remove(); };
      box.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; if (a === 'x') close(); else if (a === 'n') { go(1); arm(); } else if (a === 'p') { go(-1); arm(); } else if (a === 'pp') { playing = !playing; $('[data-a=pp] i', box).className = 'fa-solid ' + (playing ? 'fa-pause' : 'fa-play'); arm(); } };
      box.onkeydown = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') { go(1); arm(); } else if (e.key === 'ArrowLeft') { go(-1); arm(); } else if (e.key === ' ') { e.preventDefault(); $('[data-a=pp]', box).click(); } };
      show(); arm();
      const obs = new MutationObserver(() => { if (!document.body.contains(box)) { clearInterval(timer); obs.disconnect(); } }); obs.observe(document.body, { childList: true, subtree: true });
    }

    /* ---------------------------------------------------------------- Éditeur */
    async function openEditor(path) {
      S.sel = new Set([path]);
      const ed = el('div', 'pw-edit', `
        <div class="pw-etop">
          <button class="b" id="e-back"><i class="fa-solid fa-arrow-left"></i> Bibliothèque</button>
          <button class="b" id="e-prev" title="Précédente"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="b" id="e-next" title="Suivante"><i class="fa-solid fa-chevron-right"></i></button>
          <span class="ttl" id="e-ttl"></span>
          <button class="b" id="e-undo" title="Annuler"><i class="fa-solid fa-rotate-left"></i></button>
          <button class="b" id="e-redo" title="Rétablir"><i class="fa-solid fa-rotate-right"></i></button>
          <button class="b" id="e-cmp" title="Maintenir pour voir l'original"><i class="fa-regular fa-eye"></i> Original</button>
          <button class="b" id="e-reset">Tout réinitialiser</button>
          <button class="b pri" id="e-save"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
          <button class="b" id="e-copy">Enregistrer une copie</button>
          <button class="b" id="e-dl" title="Télécharger"><i class="fa-solid fa-download"></i></button>
        </div>
        <div class="pw-ebody">
          <div class="pw-panel">
            <div class="pw-tabs"><button class="b sel" data-tab="geo">Géométrie</button><button class="b" data-tab="adj">Réglages</button><button class="b" data-tab="flt">Filtres</button></div>
            <div id="tab-geo">
              <div class="tool" style="padding:0;border:0"><button class="b" data-g="rl"><i class="fa-solid fa-rotate-left"></i> 90°</button><button class="b" data-g="rr"><i class="fa-solid fa-rotate-right"></i> 90°</button></div>
              <div class="tool" style="padding:6px 0 0;border:0"><button class="b" data-g="fh"><i class="fa-solid fa-left-right"></i> Miroir H</button><button class="b" data-g="fv"><i class="fa-solid fa-up-down"></i> Miroir V</button></div>
              <h4 style="margin:14px 0 6px">Recadrage</h4>
              <select class="t" id="e-ratio" style="width:100%"><option value="0">Libre</option><option value="1">1:1 carré</option><option value="1.3333">4:3</option><option value="1.5">3:2</option><option value="1.7778">16:9</option><option value="0.75">3:4 portrait</option><option value="0.6667">2:3 portrait</option></select>
              <div class="tool" style="padding:6px 0 0;border:0"><button class="b" id="e-cropstart"><i class="fa-solid fa-crop-simple"></i> Recadrer</button><button class="b pri hidden" id="e-cropok">Appliquer</button><button class="b hidden" id="e-cropno">Annuler</button></div>
              <small class="settings-hint" id="e-cropinfo">Faites glisser sur l'image pour choisir la zone.</small>
            </div>
            <div id="tab-adj" class="hidden"></div>
            <div id="tab-flt" class="hidden"><div class="pw-flt" id="e-flt"></div></div>
            <p class="settings-hint" id="e-info" style="margin-top:14px"></p>
          </div>
          <div class="pw-stage" id="e-stage"><div class="pw-wrap" id="e-wrap"><canvas id="e-cv"></canvas></div></div>
        </div></div>`);
      root.append(ed);
      const cv = $('#e-cv', ed), wrap = $('#e-wrap', ed), stage = $('#e-stage', ed);
      let cur = path, src = null, st = emptyState(), hist = [], hi = -1, previewBase = null, cropMode = false, cropRect = null, dirty = false, compare = false;

      const adjDefs = [['brightness', 'Luminosité'], ['contrast', 'Contraste'], ['saturation', 'Saturation'], ['warmth', 'Chaleur'], ['shadows', 'Ombres'], ['highlights', 'Hautes lumières'], ['sharpen', 'Netteté', 0, 100], ['vignette', 'Vignettage', 0, 100]];
      $('#tab-adj', ed).innerHTML = adjDefs.map(([k, l, mn = -100, mx = 100]) => `<div class="pw-row"><label for="a-${k}">${l}</label><output id="o-${k}">0</output><input type="range" id="a-${k}" data-k="${k}" min="${mn}" max="${mx}" value="0"></div>`).join('') + '<button class="b" id="e-adjreset">Réinitialiser les réglages</button>';
      const filterNames = { none: 'Original', mono: 'Noir et blanc', noir: 'Noir intense', sepia: 'Sépia', vintage: 'Vintage', fade: 'Délavé', vivid: 'Éclatant', cool: 'Froid', warm: 'Chaud' };
      $('#e-flt', ed).innerHTML = Object.keys(filterNames).map(k => `<button data-f="${k}"><canvas width="110" height="76"></canvas><span>${filterNames[k]}</span></button>`).join('');

      /* -- pipeline -- */
      function transformed(maxDim) {
        const sw = src.naturalWidth, sh = src.naturalHeight, odd = st.rot % 2 === 1;
        let w = odd ? sh : sw, h = odd ? sw : sh; const k = Math.min(1, maxDim / Math.max(w, h)); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
        x.translate(w / 2, h / 2); x.rotate(st.rot * Math.PI / 2); x.scale(st.flipH ? -1 : 1, st.flipV ? -1 : 1);
        const dw = odd ? h : w, dh = odd ? w : h; x.drawImage(src, -dw / 2, -dh / 2, dw, dh);
        return c;
      }
      function cropped(c, rect) {
        if (!rect) return c;
        const x = Math.round(rect.x * c.width), y = Math.round(rect.y * c.height), w = Math.max(1, Math.round(rect.w * c.width)), h = Math.max(1, Math.round(rect.h * c.height));
        const o = document.createElement('canvas'); o.width = w; o.height = h; o.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h); return o;
      }
      function finish(c, state) {
        const x = c.getContext('2d'); const id = x.getImageData(0, 0, c.width, c.height); process(id, state.adj, state.filter); x.putImageData(id, 0, 0); return c;
      }
      function renderTo(maxDim, state, withCrop) { const t = transformed(maxDim); return finish(cropped(t, withCrop ? state.crop : null), state); }
      function paint() {
        if (!src) return;
        const state = compare ? emptyState() : st;
        const t = transformed(PREVIEW_MAX);
        const c = cropMode ? t : cropped(t, state.crop);
        cv.width = c.width; cv.height = c.height;
        const x = cv.getContext('2d'); x.drawImage(c, 0, 0);
        { const id = x.getImageData(0, 0, cv.width, cv.height); process(id, state.adj, state.filter); x.putImageData(id, 0, 0); }
        fitCanvas(); updateInfo();
      }
      function fitCanvas() { const r = stage.getBoundingClientRect(), s = Math.min((r.width - 20) / cv.width, (r.height - 20) / cv.height, 1); cv.style.width = Math.max(10, Math.floor(cv.width * s)) + 'px'; cv.style.height = Math.max(10, Math.floor(cv.height * s)) + 'px'; if (cropMode) layoutCrop(); }
      function updateInfo() {
        const t = transformed(1e6), c = cropped(t, st.crop);
        $('#e-info', ed).textContent = `${c.width} × ${c.height} px · ${nameOf(cur)}${dirty ? ' · modifiée' : ''}`;
        $('#e-ttl', ed).textContent = nameOf(cur) + (dirty ? ' •' : '');
        $('#e-undo', ed).disabled = hi <= 0; $('#e-redo', ed).disabled = hi >= hist.length - 1;
      }
      const snapshot = () => JSON.stringify(st);
      function commit() { hist = hist.slice(0, hi + 1); hist.push(snapshot()); hi = hist.length - 1; dirty = hi > 0; paint(); refreshControls(); }
      function restore(i) { hi = i; st = JSON.parse(hist[i]); dirty = hi > 0; refreshControls(); paint(); }
      function refreshControls() {
        adjDefs.forEach(([k]) => { $('#a-' + k, ed).value = st.adj[k]; $('#o-' + k, ed).textContent = st.adj[k]; });
        ed.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('sel', x.dataset.f === st.filter));
      }

      /* -- chargement d'une image -- */
      async function loadImage(p) {
        cur = p; $('#e-ttl', ed).textContent = nameOf(p);
        src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Image illisible')); im.src = url(p) + '&t=' + Date.now(); }).catch(e => { msg(e.message, true); return null; });
        if (!src) return;
        st = emptyState(); hist = [snapshot()]; hi = 0; dirty = false; cropMode = false; cropRect = null; setCropUI(false);
        // miniatures des filtres
        const small = document.createElement('canvas'); const k = Math.min(1, 110 / Math.max(src.naturalWidth, src.naturalHeight)); small.width = Math.max(1, Math.round(src.naturalWidth * k)); small.height = Math.max(1, Math.round(src.naturalHeight * k));
        small.getContext('2d').drawImage(src, 0, 0, small.width, small.height); previewBase = small;
        ed.querySelectorAll('[data-f]').forEach(btn => {
          const c = $('canvas', btn); c.width = small.width; c.height = small.height; const x = c.getContext('2d'); x.drawImage(small, 0, 0);
          const id = x.getImageData(0, 0, c.width, c.height); process(id, DEFAULT_ADJ, btn.dataset.f); x.putImageData(id, 0, 0);
        });
        refreshControls(); paint();
      }
      async function guardDirty() { return !dirty || confirm('Abandonner les modifications non enregistrées ?'); }
      async function step(d) { const l = S.list; const i = l.findIndex(p => p.path === cur); if (i < 0 || l.length < 2) return; if (!(await guardDirty())) return; S.sel = new Set([l[(i + d + l.length) % l.length].path]); await loadImage([...S.sel][0]); }
      async function closeEd() { if (!(await guardDirty())) return; ed.remove(); draw(); }

      /* -- onglets -- */
      ed.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => {
        ed.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('sel', x === t));
        ['geo', 'adj', 'flt'].forEach(k => $('#tab-' + k, ed).classList.toggle('hidden', k !== t.dataset.tab));
      });
      /* -- géométrie -- */
      ed.querySelectorAll('[data-g]').forEach(btn => btn.onclick = () => {
        if (cropMode) setCropUI(false);
        const g = btn.dataset.g;
        if (g === 'rr') st.rot = (st.rot + 1) % 4; else if (g === 'rl') st.rot = (st.rot + 3) % 4;
        else if (g === 'fh') st.flipH = !st.flipH; else if (g === 'fv') st.flipV = !st.flipV;
        st.crop = null; commit();   // le recadrage est refait après une transformation
      });
      /* -- réglages -- */
      ed.querySelectorAll('#tab-adj input[type=range]').forEach(r => {
        r.oninput = () => { st.adj[r.dataset.k] = +r.value; $('#o-' + r.dataset.k, ed).textContent = r.value; paint(); };
        r.onchange = () => { st.adj[r.dataset.k] = +r.value; commit(); };
      });
      $('#e-adjreset', ed).onclick = () => { st.adj = { ...DEFAULT_ADJ }; commit(); };
      ed.querySelectorAll('[data-f]').forEach(btn => btn.onclick = () => { st.filter = btn.dataset.f; commit(); });
      /* -- historique -- */
      $('#e-undo', ed).onclick = () => { if (hi > 0) restore(hi - 1); };
      $('#e-redo', ed).onclick = () => { if (hi < hist.length - 1) restore(hi + 1); };
      $('#e-reset', ed).onclick = () => { st = emptyState(); setCropUI(false); commit(); };
      const cmp = $('#e-cmp', ed); const cmpOn = () => { compare = true; paint(); }, cmpOff = () => { compare = false; paint(); };
      cmp.onpointerdown = cmpOn; cmp.onpointerup = cmp.onpointerleave = cmpOff;

      /* -- recadrage -- */
      function setCropUI(on) {
        cropMode = on; $('#e-cropstart', ed).classList.toggle('hidden', on); $('#e-cropok', ed).classList.toggle('hidden', !on); $('#e-cropno', ed).classList.toggle('hidden', !on);
        wrap.querySelector('.pw-crop')?.remove(); cropRect = null;
        if (on) { st.crop = null; cropRect = { x: .1, y: .1, w: .8, h: .8 }; } paint(); if (on) layoutCrop();
      }
      function layoutCrop() {
        let box = wrap.querySelector('.pw-crop');
        if (!box) { box = el('div', 'pw-crop'); wrap.append(box); bindCrop(box); }
        const cw = cv.clientWidth, ch = cv.clientHeight;
        Object.assign(box.style, { left: cropRect.x * cw + 'px', top: cropRect.y * ch + 'px', width: cropRect.w * cw + 'px', height: cropRect.h * ch + 'px' });
        const t = transformed(1e6); $('#e-cropinfo', ed).textContent = `${Math.round(cropRect.w * t.width)} × ${Math.round(cropRect.h * t.height)} px`;
      }
      function bindCrop(box) {
        const ratio = () => +$('#e-ratio', ed).value;
        const rectOf = () => cv.getBoundingClientRect();
        const begin = (e, mode) => {
          e.preventDefault(); e.stopPropagation();
          const r = rectOf(), start = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }, orig = { ...cropRect };
          const mv = ev => {
            const px = (ev.clientX - r.left) / r.width, py = (ev.clientY - r.top) / r.height;
            if (mode === 'move') { cropRect.x = Math.min(1 - orig.w, Math.max(0, orig.x + px - start.x)); cropRect.y = Math.min(1 - orig.h, Math.max(0, orig.y + py - start.y)); }
            else {
              let x0 = Math.min(Math.max(start.x, 0), 1), y0 = Math.min(Math.max(start.y, 0), 1), x1 = Math.min(Math.max(px, 0), 1), y1 = Math.min(Math.max(py, 0), 1);
              const k = ratio(); if (k) { const aspect = k * (cv.height / cv.width); let w = Math.abs(x1 - x0), h = w / aspect; if (y0 + Math.sign(y1 - y0 || 1) * h > 1 || y0 + Math.sign(y1 - y0 || 1) * h < 0) { h = Math.abs(y1 - y0); w = h * aspect; } x1 = x0 + Math.sign(x1 - x0 || 1) * w; y1 = y0 + Math.sign(y1 - y0 || 1) * h; }
              cropRect = { x: Math.max(0, Math.min(x0, x1)), y: Math.max(0, Math.min(y0, y1)), w: Math.min(1, Math.abs(x1 - x0)), h: Math.min(1, Math.abs(y1 - y0)) };
            }
            layoutCrop();
          };
          const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (cropRect.w < .02 || cropRect.h < .02) { cropRect = { ...orig }; layoutCrop(); } };
          addEventListener('pointermove', mv); addEventListener('pointerup', up);
        };
        box.onpointerdown = e => begin(e, 'move');
        stage.onpointerdown = e => { if (cropMode && !e.target.closest('.pw-crop')) begin(e, 'new'); };
      }
      $('#e-cropstart', ed).onclick = () => setCropUI(true);
      $('#e-cropno', ed).onclick = () => { setCropUI(false); };
      $('#e-cropok', ed).onclick = () => { const r = cropRect; setCropUI(false); if (r && (r.w < .995 || r.h < .995)) { st.crop = r; commit(); } };
      $('#e-ratio', ed).onchange = () => { if (cropMode) { const k = +$('#e-ratio', ed).value; if (k) { const asp = k * (cv.height / cv.width); let w = cropRect.w, h = w / asp; if (h > 1) { h = 1; w = h * asp; } cropRect = { x: Math.min(cropRect.x, 1 - w), y: Math.min(cropRect.y, 1 - h), w, h }; layoutCrop(); } } };

      /* -- enregistrement -- */
      function outCanvas() { return renderTo(SAVE_MAX, st, true); }
      const toBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));
      async function encode(ext) {
        const c = outCanvas(); const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        const bl = await toBlob(c, type, .93); if (!bl) throw new Error('Encodage impossible'); return bl;
      }
      async function saveOver() {
        const ext = extOf(cur), dir = dirOf(cur);
        if (!['jpg', 'jpeg', 'png'].includes(ext)) return saveCopy();   // formats non réécrits : on crée un PNG
        msg('Enregistrement…'); const bl = await encode(ext), tmp = 'pwtmp-' + Date.now().toString(36) + '.' + ext, tmpPath = jp(dir, tmp);
        await upload(dir, tmp, bl); await sys('fs.rm', { path: cur }, true); await sys('fs.move', { src: tmpPath, dst: cur }, true);
        finishSave(cur);
      }
      async function saveCopy() {
        const ext = ['jpg', 'jpeg', 'png'].includes(extOf(cur)) ? extOf(cur) : 'png', dir = dirOf(cur), taken = new Set(S.photos.filter(p => p.dir === dir).map(p => p.name));
        let n = stemOf(nameOf(cur)) + '-edit.' + ext, k = 2; while (taken.has(n)) n = stemOf(nameOf(cur)) + '-edit-' + (k++) + '.' + ext;
        msg('Enregistrement…'); const bl = await encode(ext); const p = await upload(dir, n, bl); finishSave(p, true);
      }
      async function finishSave(p, isCopy) {
        msg('Enregistré ✓'); fsChanged(); await load();
        if (isCopy) S.sel = new Set([p]); await loadImage(p);
      }
      $('#e-save', ed).onclick = () => saveOver().catch(e => msg(e.message, true));
      $('#e-copy', ed).onclick = () => saveCopy().catch(e => msg(e.message, true));
      $('#e-dl', ed).onclick = async () => { try { const ext = ['jpg', 'jpeg', 'png'].includes(extOf(cur)) ? extOf(cur) : 'png'; const bl = await encode(ext); const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = stemOf(nameOf(cur)) + '-edit.' + ext; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch (e) { msg(e.message, true); } };
      $('#e-back', ed).onclick = closeEd; $('#e-prev', ed).onclick = () => step(-1); $('#e-next', ed).onclick = () => step(1);
      ed.tabIndex = 0;
      ed.onkeydown = e => {
        if (e.target.matches('input[type=text],input[type=search],select')) return;
        if (e.key === 'Escape') { cropMode ? setCropUI(false) : closeEd(); }
        else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? $('#e-redo', ed).click() : $('#e-undo', ed).click(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#e-save', ed).click(); }
      };
      const refit = () => { if (document.body.contains(ed)) fitCanvas(); };
      if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => { if (document.body.contains(ed)) fitCanvas(); else ro.disconnect(); }); ro.observe(stage); }
      else addEventListener('resize', refit);
      ed.focus(); await loadImage(path);
    }

    /* ---- démarrage ---- */
    await loadLib(); await load();
    if (o.path && IMG.test(o.path)) openEditor(o.path);
  } };

  /* Intégration : catégorie Multimédia, « Ouvrir avec », ouverture des images depuis le Cultivator */
  if (typeof APP_CATEGORIES !== 'undefined' && !APP_CATEGORIES.media.ids.includes('pictoweed')) APP_CATEGORIES.media.ids.splice(0, 0, 'pictoweed');
})();
