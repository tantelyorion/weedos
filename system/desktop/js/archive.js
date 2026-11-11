'use strict';
/* Weed OS - Gestionnaire d'archives (style WinRAR) v2.0
 *  - Vue d'archive pleine fenêtre : navigation dans les dossiers de l'archive, colonnes triables, recherche, sélection multiple
 *  - Ajouter, Extraire vers… (écraser / ignorer / renommer, dossier dédié), Supprimer, Tester, Aperçu, Informations
 *  - ZIP, TAR et TAR.GZ (lecture, extraction, ajout, suppression, création) ; plus aucune liste de fichiers du Cultivator
 *  Textes en français (langue source) : js/i18n.js les traduit.
 */
(function () {
  const ARC = /\.(zip|tar|tgz|tar\.gz)$/i;
  const jp = (d, n) => (d === '/' ? '' : d) + '/' + n;
  const nameOf = p => p.split('/').pop();
  const dirOf = p => p.split('/').slice(0, -1).join('/') || '/';
  const kindOf = p => /\.zip$/i.test(p) ? 'ZIP' : /\.(tgz|tar\.gz)$/i.test(p) ? 'TAR.GZ' : 'TAR';
  const stemOf = n => n.replace(/\.(tar\.gz|tgz|tar|zip)$/i, '');
  const sizeTxt = n => fmtSize(n || 0);
  const dateTxt = t => { if (!t) return ''; try { return new Date(t * 1000).toLocaleString(I18N.locale(), { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } };
  const extOf = n => (n.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
  const ICONS = { img: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'], txt: ['txt', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'php', 'csv', 'log', 'ini', 'conf', 'sh', 'py', 'c', 'h', 'yml', 'yaml', 'sql'], zip: ['zip', 'tar', 'tgz', 'gz'], aud: ['mp3', 'wav', 'ogg', 'flac'], vid: ['mp4', 'webm', 'mkv', 'avi'] };
  function iconFor(name, dir) {
    if (dir) return 'fa-folder';
    const e = extOf(name);
    if (ICONS.img.includes(e)) return 'fa-file-image'; if (ICONS.txt.includes(e)) return 'fa-file-lines'; if (ICONS.zip.includes(e)) return 'fa-file-zipper';
    if (ICONS.aud.includes(e)) return 'fa-file-audio'; if (ICONS.vid.includes(e)) return 'fa-file-video'; if (e === 'pdf') return 'fa-file-pdf';
    return 'fa-file';
  }
  const typeTxt = (name, dir) => dir ? 'Dossier' : (extOf(name) ? extOf(name).toUpperCase() + ' · Fichier' : 'Fichier');

  const CSS = `
.ar{display:flex;flex-direction:column;height:100%;min-height:0;position:relative;font-size:13px;outline:none}
.ar-tools{display:flex;gap:2px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap;align-items:flex-end;background:rgba(0,0,0,.14)}
.ar-tb{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:62px;padding:6px 8px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;font-size:11.5px;cursor:pointer}
.ar-tb i{font-size:19px;color:var(--accent)}.ar-tb:hover:not(:disabled){background:rgba(255,255,255,.08)}.ar-tb:disabled{opacity:.38;cursor:default}
.ar-tb.danger i{color:#ff8b8b}
.ar-sep{width:1px;align-self:stretch;background:rgba(255,255,255,.1);margin:4px 4px}
.ar-addr{display:flex;gap:6px;align-items:center;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.07)}
.ar-crumbs{flex:1;min-width:0;display:flex;align-items:center;gap:2px;overflow:hidden;white-space:nowrap}
.ar-crumbs button{background:none;border:0;color:inherit;font:inherit;padding:3px 6px;border-radius:6px;cursor:pointer;max-width:200px;overflow:hidden;text-overflow:ellipsis}
.ar-crumbs button:hover{background:rgba(255,255,255,.08)}.ar-crumbs span{opacity:.45}
.ar-kind{padding:2px 8px;border-radius:99px;background:hsl(var(--h) 80% 30% / .6);font-size:11px;font-weight:600}
.ar-list{flex:1;min-height:0;overflow:auto}
.ar-table{width:100%;border-collapse:collapse}
.ar-table th{position:sticky;top:0;background:#0d1511;text-align:start;font-weight:600;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.1);cursor:pointer;user-select:none;white-space:nowrap;z-index:1}
.ar-table th:hover{background:#142019}.ar-table th .ar-arrow{opacity:.7;margin-inline-start:4px}
.ar-table td{padding:5px 10px;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0}
.ar-table td.n{max-width:none;width:46%}.ar-table td.r,.ar-table th.r{text-align:end}
.ar-table tr.sel td{background:hsl(var(--h) 80% 30% / .5)}.ar-table tbody tr{cursor:default}.ar-table tbody tr:hover td{background:rgba(255,255,255,.05)}.ar-table tr.sel:hover td{background:hsl(var(--h) 80% 34% / .55)}
.ar-table td i{width:18px;text-align:center;margin-inline-end:8px;color:var(--accent)}
.ar-table td.m{color:var(--muted)}
.ar-empty{padding:48px 16px;text-align:center;color:var(--muted)}
.ar-status{display:flex;gap:14px;padding:5px 12px;border-top:1px solid rgba(255,255,255,.08);color:var(--muted);font-size:12px;flex-wrap:wrap}.ar-status .sp{flex:1}
.ar-status.bad{color:#ff9b9b}
.ar-home{flex:1;display:grid;place-content:center;gap:18px;text-align:center;padding:24px}
.ar-home h2{margin:0 0 4px}.ar-cards{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.ar-card{width:210px;padding:20px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:inherit;font:inherit;cursor:pointer}
.ar-card:hover{background:rgba(255,255,255,.09);border-color:var(--accent)}.ar-card i{font-size:34px;color:var(--accent);display:block;margin-bottom:8px}.ar-card small{display:block;color:var(--muted);margin-top:4px}
.ar-modal{position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:14px}
.ar-dlg{width:min(560px,100%);max-height:100%;display:flex;flex-direction:column;background:#111a15;border:1px solid rgba(255,255,255,.14);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.5);overflow:hidden}
.ar-dlg.wide{width:min(760px,100%)}
.ar-dlg h3{margin:0;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08);font-size:15px}
.ar-dbody{padding:12px 16px;overflow:auto;min-height:0}
.ar-dfoot{display:flex;gap:8px;justify-content:flex-end;padding:10px 16px;border-top:1px solid rgba(255,255,255,.08);align-items:center}
.ar-dfoot .sp{flex:1;color:var(--muted);font-size:12px}
.ar-f{display:grid;grid-template-columns:auto 1fr auto;gap:8px 10px;align-items:center;margin-bottom:10px}
.ar-f label.l{color:var(--muted)}.ar-opts{display:grid;gap:6px;margin:6px 0 12px}.ar-opts label{display:flex;gap:8px;align-items:center}
.ar-opts fieldset{border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 12px;display:grid;gap:6px;margin:0 0 10px}.ar-opts legend{padding:0 6px;color:var(--muted);font-size:12px}
.ar-pk{display:flex;flex-direction:column;height:340px}
.ar-pkpath{display:flex;gap:6px;align-items:center;margin-bottom:8px}.ar-pkpath b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-pklist{flex:1;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:10px}
.ar-pkrow{display:flex;gap:8px;align-items:center;padding:6px 10px;cursor:default;border-bottom:1px solid rgba(255,255,255,.04)}
.ar-pkrow:hover{background:rgba(255,255,255,.06)}.ar-pkrow.sel{background:hsl(var(--h) 80% 30% / .5)}.ar-pkrow i{width:18px;text-align:center;color:var(--accent)}.ar-pkrow span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ar-pkrow small{color:var(--muted)}
.ar-prev{max-height:62vh;overflow:auto;text-align:center}.ar-prev img{max-width:100%;max-height:56vh;object-fit:contain;background:repeating-conic-gradient(#0a110d 0 25%,#0d1611 0 50%) 0 0/16px 16px;border-radius:8px}
.ar-prev pre{text-align:start;white-space:pre-wrap;word-break:break-word;margin:0;font:12px/1.5 monospace;max-height:56vh;overflow:auto;padding:10px;background:#0a110d;border-radius:8px}
.ar-info{display:grid;grid-template-columns:auto 1fr;gap:6px 16px}.ar-info dt{color:var(--muted)}.ar-info dd{margin:0;word-break:break-all}
.ar-errs{margin:8px 0 0;padding-inline-start:18px;color:#ff9b9b;max-height:160px;overflow:auto}
.ar-ok{color:#7be39b}
`;
  if (!document.getElementById('ar-css')) { const s = document.createElement('style'); s.id = 'ar-css'; s.textContent = CSS; document.head.append(s); }

  APPS.archive = { title: tr('archive'), icon: 'fa-file-zipper', w: 860, h: 580, render(b, win, o = {}) {
    APPS.archive.title = tr('archive');
    b.style.padding = '0'; b.style.minHeight = '0';
    const S = { path: null, entries: [], cwd: '', sel: new Set(), last: null, sort: { col: 'name', dir: 1 }, q: '', view: [] };
    b.innerHTML = '<div class="ar" tabindex="0"></div>';
    const root = $('.ar', b);
    const status = (t, bad) => { const s = $('.ar-status .st', root); if (s) { s.textContent = t || ''; s.parentElement.classList.toggle('bad', !!bad); } };
    const done = () => { try { fsChanged(); } catch (e) { /* le Cultivator n'est pas ouvert */ } };

    /* ------------------------------------------------------------ boîtes de dialogue */
    function dialog(title, body, buttons, wide) {
      const m = el('div', 'ar-modal', `<div class="ar-dlg${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><h3></h3><div class="ar-dbody"></div><div class="ar-dfoot"></div></div>`);
      $('h3', m).textContent = title;
      const bd = $('.ar-dbody', m), ft = $('.ar-dfoot', m);
      if (typeof body === 'string') bd.innerHTML = body; else bd.append(body);
      const close = () => m.remove();
      const btns = {};
      (buttons || []).forEach(x => {
        if (x.note) { ft.append(el('span', 'sp', x.note)); return; }
        const bt = el('button', 'b' + (x.pri ? ' pri' : '') + (x.danger ? ' danger' : ''), x.label);
        bt.onclick = async () => { if (x.keep) { await x.fn?.(m, bt); } else { close(); await x.fn?.(m); } };
        ft.append(bt); btns[x.id || x.label] = bt;
      });
      if (!ft.children.length) ft.append(Object.assign(el('button', 'b', 'Fermer'), { onclick: close }));
      m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      m.tabIndex = -1; root.append(m); m.focus();
      return { m, close, bd, btns };
    }
    const alertDlg = (title, text) => dialog(title, `<p style="margin:0">${esc(text)}</p>`, [{ label: 'Fermer' }]);

    /* sélecteur de fichiers/dossiers (boîte de dialogue, pas une fenêtre de gestion de fichiers) */
    function picker({ title, multi = false, folders = false, archives = false, start = '/', confirm: okLabel = 'OK', extra = null }) {
      return new Promise(resolve => {
        let cwd = start, sel = new Set(), finished = false;
        const body = el('div', 'ar-pk', `<div class="ar-pkpath"><button class="b" data-a="up" title="Dossier parent"><i class="fa-solid fa-arrow-up"></i></button><b></b></div><div class="ar-pklist"></div>`);
        const list = $('.ar-pklist', body), pathEl = $('b', body);
        let dlg;
        const finish = v => { if (finished) return; finished = true; dlg?.close(); resolve(v); };
        async function load() {
          pathEl.textContent = cwd; list.innerHTML = '<div class="ar-empty">Chargement…</div>';
          let r; try { r = await sys('fs.list', { path: cwd }); } catch (e) { list.innerHTML = ''; list.append(el('div', 'ar-empty', esc(e.message))); return; }
          let items = r.items.filter(it => !it.name.startsWith('.'));
          if (folders) items = items.filter(it => it.dir);
          else if (archives) items = items.filter(it => it.dir || ARC.test(it.name));
          items.sort((a, c) => (c.dir - a.dir) || a.name.localeCompare(c.name, undefined, { numeric: true }));
          list.innerHTML = '';
          if (!items.length) list.append(el('div', 'ar-empty', folders ? 'Aucun sous-dossier.' : 'Dossier vide.'));
          items.forEach(it => {
            const p = jp(cwd, it.name);
            const row = el('div', 'ar-pkrow' + (sel.has(p) ? ' sel' : ''), `<i class="fa-solid ${iconFor(it.name, it.dir)}"></i><span></span><small>${it.dir ? '' : sizeTxt(it.size)}</small>`);
            $('span', row).textContent = it.name;
            row.onclick = e => {
              if (multi) { sel.has(p) ? sel.delete(p) : sel.add(p); row.classList.toggle('sel', sel.has(p)); }
              else { sel = new Set([p]); list.querySelectorAll('.ar-pkrow').forEach(x => x.classList.remove('sel')); row.classList.add('sel'); }
              upd();
            };
            row.ondblclick = () => { if (it.dir) { cwd = p; if (!multi) sel.clear(); load(); upd(); } else if (!multi) finish([p]); };
            list.append(row);
          });
        }
        const upd = () => { if (dlg) dlg.btns.ok.disabled = !(folders ? true : sel.size); };
        $('[data-a=up]', body).onclick = () => { cwd = dirOf(cwd); sel.clear(); load(); upd(); };
        if (extra) body.append(extra);
        dlg = dialog(title, body, [
          { label: 'Annuler', fn: () => { finished = true; resolve(null); } },
          { id: 'ok', label: okLabel, pri: true, keep: true, fn: () => { const v = folders ? (sel.size ? [...sel][0] : cwd) : [...sel]; finish(folders ? [v] : v); } },
        ], true);
        dlg.btns.ok.disabled = !folders;
        dlg.m.addEventListener('keydown', e => { if (e.key === 'Escape') { finished = true; resolve(null); } });
        load();
      });
    }

    /* ------------------------------------------------------------ écran d'accueil */
    function home() {
      S.path = null; S.entries = []; S.sel.clear();
      root.innerHTML = `<div class="ar-home"><div><i class="fa-solid fa-file-zipper" style="font-size:54px;color:var(--accent)"></i><h2>Gestionnaire d’archives</h2><div class="settings-hint">ZIP · TAR · TAR.GZ</div></div>
        <div class="ar-cards"><button class="ar-card" data-a="open"><i class="fa-solid fa-folder-open"></i><b>Ouvrir une archive</b><small>Parcourir, extraire, modifier</small></button>
        <button class="ar-card" data-a="new"><i class="fa-solid fa-box-archive"></i><b>Nouvelle archive</b><small>Compresser des fichiers et dossiers</small></button></div></div>
        <div class="ar-status"><span class="st sp"></span></div>`;
      $('[data-a=open]', root).onclick = chooseArchive; $('[data-a=new]', root).onclick = createArchive;
    }
    async function chooseArchive() {
      const r = await picker({ title: 'Ouvrir une archive', archives: true, start: S.path ? dirOf(S.path) : (o.dir || '/'), confirm: 'Ouvrir' });
      if (r && r[0]) openArchive(r[0]);
    }

    /* ------------------------------------------------------------ création */
    async function createArchive() {
      const start = S.path ? dirOf(S.path) : (o.dir || '/');
      const srcs = await picker({ title: 'Choisir les fichiers et dossiers à compresser', multi: true, start, confirm: 'Continuer' });
      if (!srcs || !srcs.length) return;
      const form = el('div', '', `<div class="ar-f"><label class="l">Nom</label><input class="t" id="c-name"><select class="t" id="c-fmt"><option value="zip">ZIP</option><option value="tar.gz">TAR.GZ</option><option value="tar">TAR</option></select>
        <label class="l">Dossier</label><input class="t" id="c-dir" readonly><button class="b" id="c-browse">Parcourir…</button></div><div class="settings-hint" id="c-src"></div>`);
      const nm = $('#c-name', form), fmt = $('#c-fmt', form), dr = $('#c-dir', form);
      let dest = dirOf(srcs[0]);
      nm.value = srcs.length === 1 ? nameOf(srcs[0]) : 'archive';
      dr.value = dest; $('#c-src', form).textContent = srcs.length + ' élément(s) sélectionné(s)';
      $('#c-browse', form).onclick = async () => { const r = await picker({ title: 'Dossier de destination', folders: true, start: dest, confirm: 'Choisir ce dossier' }); if (r) { dest = r[0]; dr.value = dest; } };
      dialog('Créer l’archive', form, [
        { label: 'Annuler' },
        { label: 'Créer', pri: true, keep: true, fn: async (m, bt) => {
          let name = (nm.value.trim() || 'archive').replace(/[\/\\]/g, '_').replace(/\.(zip|tar|tgz|tar\.gz)$/i, '') + '.' + fmt.value;
          bt.disabled = true; bt.textContent = 'Création…';
          try { await sys('fs.zip.create', { target: jp(dest, name), sources: srcs }); m.remove(); done(); openArchive(jp(dest, name)); }
          catch (e) { bt.disabled = false; bt.textContent = 'Créer'; alertDlg('Création impossible', e.message); }
        } }]);
    }

    /* ------------------------------------------------------------ ouverture */
    async function openArchive(path) {
      if (!ARC.test(path)) { alertDlg('Format non pris en charge', 'Formats pris en charge : ZIP, TAR, TAR.GZ.'); return; }
      let entries;
      try { status('Ouverture…'); entries = await sys('fs.zip.list', { path }); }
      catch (e) { if (!S.path) home(); status(e.message, true); alertDlg('Archive illisible', e.message); return; }
      let st = null; try { const l = await sys('fs.list', { path: dirOf(path) }); st = l.items.find(i => i.name === nameOf(path)); } catch (e) { /* taille inconnue */ }
      S.path = path; S.entries = entries; S.cwd = ''; S.sel.clear(); S.q = ''; S.last = null; S.fileSize = st ? st.size : 0;
      buildUI(); draw();
    }
    const reload = async () => { const keep = S.cwd; try { S.entries = await sys('fs.zip.list', { path: S.path }); } catch (e) { alertDlg('Archive illisible', e.message); return; } S.cwd = keep; S.sel.clear(); draw(); };

    function buildUI() {
      root.innerHTML = `
        <div class="ar-tools">
          <button class="ar-tb" data-a="open"><i class="fa-solid fa-folder-open"></i>Ouvrir</button>
          <button class="ar-tb" data-a="new"><i class="fa-solid fa-box-archive"></i>Nouvelle</button>
          <span class="ar-sep"></span>
          <button class="ar-tb" data-a="add"><i class="fa-solid fa-file-circle-plus"></i>Ajouter</button>
          <button class="ar-tb" data-a="extract"><i class="fa-solid fa-box-open"></i>Extraire vers…</button>
          <button class="ar-tb" data-a="quick"><i class="fa-solid fa-bolt"></i>Extraire ici</button>
          <button class="ar-tb" data-a="test"><i class="fa-solid fa-shield-halved"></i>Tester</button>
          <button class="ar-tb" data-a="view"><i class="fa-solid fa-eye"></i>Afficher</button>
          <button class="ar-tb danger" data-a="delete"><i class="fa-solid fa-trash"></i>Supprimer</button>
          <button class="ar-tb" data-a="info"><i class="fa-solid fa-circle-info"></i>Informations</button>
          <span style="flex:1"></span>
          <input class="t" type="search" id="ar-q" placeholder="Rechercher dans l'archive…" style="width:170px;align-self:center">
        </div>
        <div class="ar-addr"><button class="b" data-a="up" title="Dossier parent"><i class="fa-solid fa-arrow-up"></i></button><div class="ar-crumbs"></div><span class="ar-kind"></span></div>
        <div class="ar-list"></div>
        <div class="ar-status"><span class="st sp"></span><span class="tot"></span></div>`;
      root.querySelectorAll('[data-a]').forEach(x => x.onclick = () => act(x.dataset.a));
      $('#ar-q', root).oninput = e => { S.q = e.target.value.trim().toLowerCase(); S.sel.clear(); draw(); };
      $('.ar-kind', root).textContent = kindOf(S.path);
    }

    /* ------------------------------------------------------------ affichage */
    function children() {
      const pre = S.cwd, map = new Map();
      for (const e of S.entries) {
        if (!e.name.startsWith(pre) || e.name === pre) continue;
        const rest = e.name.slice(pre.length), i = rest.indexOf('/');
        const seg = i === -1 ? rest : rest.slice(0, i), isDir = i !== -1;
        let c = map.get(seg);
        if (!c) { c = { seg, name: pre + seg + (isDir ? '/' : ''), dir: isDir, size: 0, comp: 0, mtime: 0, count: 0 }; map.set(seg, c); }
        if (isDir) { c.dir = true; c.name = pre + seg + '/'; if (rest !== seg + '/') { c.size += e.size; c.comp += e.compressed || 0; c.count++; } }
        else { c.size = e.size; c.comp = e.compressed || 0; }
        c.mtime = Math.max(c.mtime, e.mtime || 0);
      }
      return [...map.values()];
    }
    function searchResults() {
      return S.entries.filter(e => e.name.toLowerCase().includes(S.q)).slice(0, 1000).map(e => ({ seg: e.name, name: e.name, dir: e.dir, size: e.size, comp: e.compressed || 0, mtime: e.mtime || 0, count: 0 }));
    }
    function draw() {
      let rows = S.q ? searchResults() : children();
      const { col, dir } = S.sort;
      const key = { name: r => r.seg.toLowerCase(), size: r => r.size, comp: r => r.comp, mtime: r => r.mtime, type: r => (r.dir ? '' : extOf(r.seg)) };
      rows.sort((a, c) => (c.dir - a.dir) || ((key[col](a) > key[col](c) ? 1 : key[col](a) < key[col](c) ? -1 : 0) * dir) || a.seg.localeCompare(c.seg));
      S.view = rows;
      // fil d'Ariane
      const cr = $('.ar-crumbs', root); cr.innerHTML = '';
      const addCrumb = (label, target) => { const bt = el('button', '', ''); bt.textContent = label; bt.onclick = () => { S.cwd = target; S.q = ''; $('#ar-q', root).value = ''; S.sel.clear(); draw(); }; cr.append(bt); };
      addCrumb(nameOf(S.path), '');
      let acc = ''; S.cwd.split('/').filter(Boolean).forEach(seg => { acc += seg + '/'; cr.append(el('span', '', '›')); addCrumb(seg, acc); });
      $('[data-a=up]', root).disabled = !S.cwd && !S.q;
      const arrow = c => S.sort.col === c ? `<span class="ar-arrow">${S.sort.dir > 0 ? '▲' : '▼'}</span>` : '';
      const zip = kindOf(S.path) === 'ZIP';
      const list = $('.ar-list', root);
      list.innerHTML = `<table class="ar-table"><thead><tr><th data-c="name">Nom${arrow('name')}</th><th class="r" data-c="size">Taille${arrow('size')}</th>${zip ? `<th class="r" data-c="comp">Compressé${arrow('comp')}</th>` : ''}<th data-c="type">Type${arrow('type')}</th><th data-c="mtime">Modifié${arrow('mtime')}</th></tr></thead><tbody></tbody></table>`;
      const tb = $('tbody', list);
      if (!rows.length) tb.append(Object.assign(el('tr', '', `<td colspan="5" class="ar-empty">${S.q ? 'Aucun résultat.' : 'Dossier vide.'}</td>`)));
      rows.forEach((r, i) => {
        const tr_ = el('tr', S.sel.has(r.name) ? 'sel' : '', `<td class="n"><i class="fa-solid ${iconFor(r.seg, r.dir)}"></i><span></span></td><td class="r m">${r.dir && r.count === 0 && !r.size ? '' : sizeTxt(r.size)}</td>${zip ? `<td class="r m">${r.dir ? '' : sizeTxt(r.comp)}</td>` : ''}<td class="m">${esc(typeTxt(r.seg, r.dir))}</td><td class="m">${dateTxt(r.mtime)}</td>`);
        $('span', tr_).textContent = S.q ? r.name : r.seg;
        tr_.dataset.i = i; tb.append(tr_);
      });
      list.querySelectorAll('th').forEach(th => th.onclick = () => { const c = th.dataset.c; S.sort = { col: c, dir: S.sort.col === c ? -S.sort.dir : 1 }; draw(); });
      tb.onclick = e => {
        const tr_ = e.target.closest('tr'); if (!tr_ || tr_.dataset.i === undefined) return;
        const i = +tr_.dataset.i, n = S.view[i].name;
        if (e.shiftKey && S.last != null) { S.sel.clear(); for (let k = Math.min(S.last, i); k <= Math.max(S.last, i); k++) S.sel.add(S.view[k].name); }
        else if (e.ctrlKey || e.metaKey) { S.sel.has(n) ? S.sel.delete(n) : S.sel.add(n); S.last = i; }
        else { S.sel = new Set([n]); S.last = i; }
        tb.querySelectorAll('tr').forEach(x => x.classList.toggle('sel', x.dataset.i !== undefined && S.sel.has(S.view[+x.dataset.i].name))); stat();
      };
      tb.ondblclick = e => { const tr_ = e.target.closest('tr'); if (!tr_ || tr_.dataset.i === undefined) return; openRow(S.view[+tr_.dataset.i]); };
      stat();
    }
    function stat() {
      const files = S.entries.filter(e => !e.dir), total = files.reduce((a, e) => a + e.size, 0);
      $('.tot', root).textContent = `${files.length} fichier(s) · ${sizeTxt(total)} · ${kindOf(S.path)}${S.fileSize ? ' · ' + sizeTxt(S.fileSize) : ''}`;
      const n = S.sel.size, tools = ['add', 'extract', 'quick', 'test', 'view', 'delete', 'info'];
      const selFiles = S.view.filter(r => S.sel.has(r.name));
      status(n ? `${n} sélectionné(s) · ${sizeTxt(selFiles.reduce((a, r) => a + r.size, 0))}` : `${S.view.length} élément(s) affiché(s)`);
      $('[data-a=view]', root).disabled = !(n === 1 && selFiles[0] && !selFiles[0].dir);
      $('[data-a=delete]', root).disabled = !n;
    }
    function openRow(r) {
      if (r.dir) { S.cwd = r.name; S.q = ''; $('#ar-q', root).value = ''; S.sel.clear(); draw(); }
      else preview(r.name);
    }

    /* ------------------------------------------------------------ actions */
    function act(a) {
      if (a === 'open') return chooseArchive();
      if (a === 'new') return createArchive();
      if (a === 'up') { if (S.q) { S.q = ''; $('#ar-q', root).value = ''; } else S.cwd = S.cwd.replace(/[^/]+\/$/, ''); S.sel.clear(); return draw(); }
      if (a === 'add') return addFiles();
      if (a === 'extract') return extractDialog();
      if (a === 'quick') return quickExtract();
      if (a === 'test') return testArchive();
      if (a === 'view') { const r = S.view.find(x => S.sel.has(x.name)); return r && !r.dir && preview(r.name); }
      if (a === 'delete') return deleteSel();
      if (a === 'info') return infoDlg();
    }

    async function addFiles() {
      const srcs = await picker({ title: 'Ajouter à l’archive', multi: true, start: dirOf(S.path), confirm: 'Ajouter' });
      if (!srcs || !srcs.length) return;
      status('Ajout en cours…');
      try {
        const r = await sys('fs.zip.add', { archive: S.path, sources: srcs.filter(p => p !== S.path), dir: S.cwd.replace(/\/$/, '') });
        S.fileSize = await sizeNow(); await reload(); status(`${r.added} fichier(s) ajouté(s).`); done();
      } catch (e) { status(e.message, true); alertDlg('Ajout impossible', e.message); }
    }
    async function sizeNow() { try { const l = await sys('fs.list', { path: dirOf(S.path) }); const f = l.items.find(i => i.name === nameOf(S.path)); return f ? f.size : S.fileSize; } catch (e) { return S.fileSize; } }

    async function runExtract({ dest, scope, mode, folder }) {
      status('Extraction en cours…');
      let target = dest;
      if (folder) {
        let taken = new Set(); try { taken = new Set((await sys('fs.list', { path: dest })).items.map(i => i.name)); } catch (e) { /* ignore */ }
        let name = stemOf(nameOf(S.path)) || 'archive', k = 2; const base = name; while (taken.has(name)) name = base + ' (' + (k++) + ')';
        target = jp(dest, name); await sys('fs.mkdir', { path: target });
      }
      const entries = scope === 'sel' ? [...S.sel] : scope === 'cwd' && S.cwd ? [S.cwd] : [];
      return sys('fs.zip.extract', { archive: S.path, destination: target, entries, mode });
    }
    function resultDlg(out, dest) {
      const parts = [`${out.files} fichier(s) extrait(s)`]; if (out.skipped) parts.push(`${out.skipped} ignoré(s)`); if (out.renamed) parts.push(`${out.renamed} renommé(s)`);
      const body = el('div', '', `<p class="ar-ok" style="margin-top:0"><i class="fa-solid fa-circle-check"></i> ${esc(parts.join(' · '))}</p><div class="settings-hint">${esc(out.destination)}</div>`);
      dialog('Extraction terminée', body, [{ label: 'Fermer' }, { label: 'Ouvrir le dossier', pri: true, fn: () => { try { WM.open('finder', { fresh: true, path: out.destination }); } catch (e) { /* ignore */ } } }]);
    }
    async function quickExtract() {
      const dest = dirOf(S.path), scope = S.sel.size ? 'sel' : 'all';
      try { const out = await runExtract({ dest, scope, mode: 'rename', folder: scope === 'all' }); status(`${out.files} fichier(s) extrait(s) dans ${out.destination}`); done(); resultDlg(out); }
      catch (e) { status(e.message, true); alertDlg('Extraction impossible', e.message); }
    }
    function extractDialog() {
      let dest = S.dest || dirOf(S.path);
      const n = S.sel.size;
      const form = el('div', '', `<div class="ar-f"><label class="l">Destination</label><input class="t" id="x-dest" readonly><button class="b" id="x-browse">Parcourir…</button></div>
        <div class="ar-opts"><fieldset><legend>Éléments à extraire</legend>
          <label><input type="radio" name="x-scope" value="all" ${n || S.cwd ? '' : 'checked'}> Toute l’archive</label>
          ${S.cwd ? `<label><input type="radio" name="x-scope" value="cwd" ${n ? '' : 'checked'}> Le dossier affiché</label>` : ''}
          <label><input type="radio" name="x-scope" value="sel" ${n ? 'checked' : 'disabled'}> La sélection (${n})</label></fieldset>
        <fieldset><legend>Si un fichier existe déjà</legend>
          <label><input type="radio" name="x-mode" value="overwrite"> Remplacer</label>
          <label><input type="radio" name="x-mode" value="skip"> Ignorer</label>
          <label><input type="radio" name="x-mode" value="rename" checked> Garder les deux (renommer)</label></fieldset>
        <label><input type="checkbox" id="x-folder"> Créer un dossier au nom de l’archive</label></div>`);
      $('#x-dest', form).value = dest;
      $('#x-browse', form).onclick = async () => { const r = await picker({ title: 'Dossier de destination', folders: true, start: dest, confirm: 'Choisir ce dossier' }); if (r) { dest = r[0]; S.dest = dest; $('#x-dest', form).value = dest; } };
      dialog('Extraire vers…', form, [{ label: 'Annuler' }, { label: 'Extraire', pri: true, keep: true, fn: async (m, bt) => {
        const val = n => (form.querySelector(`input[name=${n}]:checked`) || {}).value;
        bt.disabled = true; bt.textContent = 'Extraction…';
        try { const out = await runExtract({ dest, scope: val('x-scope') || 'all', mode: val('x-mode') || 'rename', folder: $('#x-folder', form).checked }); m.remove(); status(`${out.files} fichier(s) extrait(s)`); done(); resultDlg(out, dest); }
        catch (e) { bt.disabled = false; bt.textContent = 'Extraire'; alertDlg('Extraction impossible', e.message); }
      } }]);
    }
    async function deleteSel() {
      const names = [...S.sel]; if (!names.length) return;
      if (!confirm(`Supprimer ${names.length} élément(s) de l’archive ? Cette action est irréversible.`)) return;
      status('Suppression en cours…');
      try { const r = await sys('fs.zip.delete', { archive: S.path, entries: names }); S.fileSize = await sizeNow(); await reload(); status(`${r.deleted} entrée(s) supprimée(s).`); done(); }
      catch (e) { status(e.message, true); alertDlg('Suppression impossible', e.message); }
    }
    async function testArchive() {
      status('Test en cours…');
      try {
        const r = await sys('fs.zip.test', { archive: S.path });
        const html = r.ok ? `<p class="ar-ok" style="margin:0"><i class="fa-solid fa-circle-check"></i> Aucune erreur : ${r.tested} entrée(s) vérifiée(s).</p>` : `<p style="margin:0;color:#ff9b9b"><i class="fa-solid fa-triangle-exclamation"></i> L’archive contient des erreurs.</p><ul class="ar-errs">${r.errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
        status(r.ok ? 'Archive saine.' : 'Archive endommagée.', !r.ok); dialog('Test de l’archive', html, [{ label: 'Fermer' }]);
      } catch (e) { status(e.message, true); alertDlg('Test impossible', e.message); }
    }
    async function preview(name) {
      status('Lecture…');
      try {
        const r = await sys('fs.zip.read', { archive: S.path, entry: name });
        let body;
        if (r.mime.startsWith('image/')) { body = el('div', 'ar-prev'); const im = new Image(); im.alt = name; im.src = `data:${r.mime};base64,${r.data}`; body.append(im); }
        else if (r.mime === 'text/plain') { body = el('div', 'ar-prev'); const pre = el('pre'); try { pre.textContent = new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(atob(r.data), c => c.charCodeAt(0))); } catch (e) { pre.textContent = atob(r.data); } body.append(pre); }
        else body = el('p', '', 'Aperçu indisponible pour ce type de fichier. Extrayez-le pour l’ouvrir.');
        status(''); dialog(nameOf(name) + ' · ' + sizeTxt(r.size), body, [{ label: 'Fermer' }, { label: 'Extraire ce fichier…', fn: () => { S.sel = new Set([name]); extractDialog(); } }], true);
      } catch (e) { status(e.message, true); alertDlg('Aperçu impossible', e.message); }
    }
    function infoDlg() {
      const files = S.entries.filter(e => !e.dir), dirs = S.entries.length - files.length, total = files.reduce((a, e) => a + e.size, 0);
      const ratio = total && S.fileSize ? Math.max(0, 100 - Math.round(S.fileSize / total * 100)) + ' %' : '—';
      const rows = [['Nom', nameOf(S.path)], ['Emplacement', dirOf(S.path)], ['Format', kindOf(S.path)], ['Taille de l’archive', sizeTxt(S.fileSize)], ['Taille décompressée', sizeTxt(total)], ['Gain de place', ratio], ['Fichiers', String(files.length)], ['Dossiers', String(dirs)]];
      const dl = el('dl', 'ar-info'); rows.forEach(([k, v]) => { const dt = el('dt', '', ''); dt.textContent = k; const dd = el('dd', '', ''); dd.textContent = v; dl.append(dt, dd); });
      dialog('Informations', dl, [{ label: 'Fermer' }]);
    }

    /* clavier */
    root.addEventListener('keydown', e => {
      if (!S.path || e.target.matches('input,select,textarea') || root.querySelector('.ar-modal')) return;
      if (e.key === 'Delete') { e.preventDefault(); deleteSel(); }
      else if (e.key === 'Enter') { const r = S.view.find(x => S.sel.has(x.name)); if (r) openRow(r); }
      else if (e.key === 'Backspace') { e.preventDefault(); if (S.cwd || S.q) act('up'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); S.sel = new Set(S.view.map(r => r.name)); draw(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); extractDialog(); }
      else if (e.key === 'F5') { e.preventDefault(); reload(); }
    });

    if (o.zip && ARC.test(o.zip)) openArchive(o.zip); else home();
    root.focus();
  } };
})();
