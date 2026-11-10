/* Test de bout en bout du bureau (v0.8.7) : vrai serveur PHP + jsdom.
   Prérequis : php (posix, zip) et `npm install jsdom` (dans n'importe quel dossier parent). Lancer : node tests/desktop-e2e.js */
const { JSDOM, VirtualConsole } = require('jsdom');
const { spawn, execSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), PORT = 18080 + Math.floor(Math.random() * 500);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'weed-e2e-'));
fs.mkdirSync(DATA + '/etc', { recursive: true }); fs.mkdirSync(DATA + '/var/log', { recursive: true });
const base = `http://127.0.0.1:${PORT}`;
let cookie = '';
const results = []; let failed = 0;
const ok = (c, m) => { results.push((c ? '  ok  ' : ' FAIL ') + m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function nf(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers, cookie ? { Cookie: cookie } : {});
  const r = await fetch(url.startsWith('http') ? url : base + url, opts);
  const sc = r.headers.getSetCookie?.() || [];
  if (sc.length) cookie = sc.map(x => x.split(';')[0]).join('; ');
  return r;
}
const api = async (p, body) => (await (await nf(p, { method: 'POST', headers: { 'X-Weed': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json());
async function upload(dir, name, buf) {
  const fd = new FormData(); fd.append('dir', dir); fd.append('name', name); fd.append('file', new Blob([buf]), name);
  return (await nf('/api/fs-upload', { method: 'POST', headers: { 'X-Weed': '1' }, body: fd })).json();
}
(async () => {
  const php = spawn('php', ['-d', 'upload_max_filesize=512M', '-d', 'post_max_size=520M', '-S', `127.0.0.1:${PORT}`, '-t', ROOT + '/system/desktop', ROOT + '/system/router.php'],
    { env: { ...process.env, WEED_ROOT: ROOT, WEED_DATA: DATA, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(base + '/'); break; } catch (e) { await sleep(100); } }
    const su = await api('/api/auth/setup', { name: 'orioma', pass: 'secret123' });
    ok(su.ok, 'compte administrateur créé');
    // --- API : fichiers
    ok((await api('/api/syscall', { call: 'fs.mkdir', args: { path: '/Bureau/Projets' } })).ok, 'fs.mkdir Bureau/Projets');
    ok((await api('/api/syscall', { call: 'fs.write', args: { path: '/Bureau/notes.txt', content: 'bonjour' } })).ok, 'fs.write notes.txt');
    const vid = Buffer.alloc(100000, 7);
    ok((await upload('/Bureau', 'film.mp4', vid)).ok, 'import binaire film.mp4 (100 Ko)');
    ok((await upload('/Bureau', 'chanson.mp3', Buffer.alloc(5000, 1))).ok, 'import chanson.mp3');
    ok((await upload('/Bureau', 'photo.png', Buffer.from('89504e470d0a1a0a', 'hex'))).ok, 'import photo.png');
    ok((await upload('/Bureau', 'doc.pdf', Buffer.from('%PDF-1.4'))).ok, 'import doc.pdf');
    ok((await upload('/Bureau', 'data.xyz', Buffer.from('zzz'))).ok, 'import data.xyz');
    ok(!(await upload('/Bureau', 'film.mp4', vid)).ok, 'import refusé si le nom existe');
    ok(!(await upload('/Bureau', '../evil.txt', vid)).ok, 'import refusé : nom avec ..');
    // --- streaming
    let r = await nf('/fs-file?path=' + encodeURIComponent('/Bureau/film.mp4'));
    ok(r.status === 200 && r.headers.get('content-type') === 'video/mp4' && (await r.arrayBuffer()).byteLength === 100000, 'GET /fs-file complet, Content-Type video/mp4');
    r = await nf('/fs-file?path=' + encodeURIComponent('/Bureau/film.mp4'), { headers: { Range: 'bytes=1000-1999' } });
    const part = Buffer.from(await r.arrayBuffer());
    ok(r.status === 206 && r.headers.get('content-range') === 'bytes 1000-1999/100000' && part.length === 1000, 'Range 206 (seek vidéo)');
    r = await nf('/fs-file?path=' + encodeURIComponent('/Bureau/film.mp4'), { headers: { Range: 'bytes=-500' } });
    ok(r.status === 206 && (await r.arrayBuffer()).byteLength === 500, 'Range suffixe -500');
    r = await nf('/fs-file?path=' + encodeURIComponent('/Bureau/film.mp4'), { headers: { Range: 'bytes=999999-' } });
    ok(r.status === 416, 'Range hors limites : 416');
    r = await nf('/fs-file?path=' + encodeURIComponent('/Bureau/notes.txt'));
    ok(r.headers.get('content-disposition').startsWith('attachment') && r.headers.get('content-type') === 'application/octet-stream', 'texte/HTML jamais interprétés (attachment)');
    r = await nf('/fs-file?path=' + encodeURIComponent('/../../etc/passwd'));
    ok(r.status === 404, 'traversée de chemin refusée');
    const saved = cookie; cookie = '';
    r = await nf('/fs-file?path=' + encodeURIComponent('/Bureau/film.mp4'));
    ok(r.status === 401, 'lecture sans session refusée (401)'); cookie = saved;
    r = await nf('/fs-file?path=' + encodeURIComponent('/Bureau/film.mp4'), { method: 'POST' });

    // --- bureau (jsdom)
    const vc = new VirtualConsole(); const errs = [];
    vc.on('jsdomError', e => { if (!/Not implemented|fontawesome/.test(e.message)) errs.push(e.message); }); // FontAwesome est installé par `make assets`
    vc.on('error', m => errs.push(String(m)));
    const dom = await JSDOM.fromURL(base + '/', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(win) {
        win.fetch = (u, o = {}) => { const url = String(u).startsWith('http') ? u : base + u; if (o.body instanceof win.FormData) { const fd = new FormData(); for (const [k, v] of o.body.entries()) fd.append(k, v); o = { ...o, body: fd }; } return nf(url, o); };
        win.HTMLMediaElement.prototype.play = function () { this._played = true; return Promise.resolve(); };
        win.HTMLElement.prototype.focus = function () {};
        win.URL.createObjectURL = () => 'blob:x';
      } });
    const w = dom.window, d = w.document, $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
    await sleep(2800);
    ok($('#usr').textContent === 'orioma', 'session ouverte automatiquement (cookie)');
    ok($('#boot img').getAttribute('src') === 'assets/logo-white.png' && $('#shutdown-screen img').getAttribute('src') === 'assets/logo-white.png', 'écrans de démarrage/arrêt : logo transparent');
    // 1. App Center depuis le menu Weed
    $('#apple').click(); await sleep(50);
    ok(!$('#appmenu').classList.contains('hidden'), 'menu Weed ouvert');
    $('#appmenu [data-a="appcenter"]').click(); await sleep(100);
    ok(!$('#appcenter').classList.contains('hidden'), 'App Center s’ouvre depuis le menu Démarrer (bug corrigé)');
    $('#ac-grid .ac-app').click(); await sleep(100);
    ok($('#appcenter').classList.contains('hidden') && $$('.win').length >= 2, 'une application lancée depuis l’App Center ouvre sa fenêtre');
    // 2. icônes du Bureau
    const names = $$('#desk-icons .dicon span').map(x => x.textContent).sort();
    ok(JSON.stringify(names) === JSON.stringify(['Projets', 'chanson.mp3', 'data.xyz', 'doc.pdf', 'film.mp4', 'notes.txt', 'photo.png']), 'le Bureau affiche dossiers et fichiers du dossier /Bureau : ' + names.join(', '));
    const icon = n => $$('#desk-icons .dicon').find(x => x.dataset.path === '/Bureau/' + n);
    const dbl = n => n.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    const winTitle = () => $$('.win .title').map(x => x.textContent);
    dbl(icon('film.mp4')); await sleep(300);
    ok(winTitle().includes('Lecteur vidéo'), 'film.mp4 → Lecteur vidéo');
    ok($$('video').some(v => v.getAttribute('src').startsWith('/fs-file?path=%2FBureau%2Ffilm.mp4') && v._played), 'la vidéo est chargée en flux et lancée');
    dbl(icon('chanson.mp3')); await sleep(300); ok(winTitle().includes('Lecteur audio'), 'chanson.mp3 → Lecteur audio');
    dbl(icon('photo.png')); await sleep(300); ok(winTitle().includes('Visionneuse de photos'), 'photo.png → Visionneuse de photos');
    dbl(icon('doc.pdf')); await sleep(300); ok(winTitle().includes('Lecteur PDF'), 'doc.pdf → Lecteur PDF');
    dbl(icon('notes.txt')); await sleep(300); ok(winTitle().includes('TextEdit'), 'notes.txt → TextEdit');
    dbl(icon('Projets')); await sleep(300); ok($$('.win .pth').some(x => x.textContent === '/Bureau/Projets'), 'dossier → Cultivator ouvert dans ce dossier');
    dbl(icon('data.xyz')); await sleep(300);
    ok(!!$('.modal') && /Ouvrir avec/.test($('.modal').textContent), 'type inconnu → choix « Ouvrir avec… » (plus d’éditeur de texte forcé)');
    $('.modal [data-r="0"]').click(); await sleep(50);
    // 3. clic droit sur un fichier
    const ctxEv = (n, x = 120, y = 100) => n.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    ctxEv(icon('notes.txt')); await sleep(50);
    let labels = $$('.ctx .ctx-item span').map(x => x.textContent);
    ok(['Ouvrir', 'Ouvrir avec…', 'Couper', 'Copier', 'Renommer', 'Compresser en ZIP', 'Télécharger', 'Supprimer'].every(l => labels.includes(l)), 'menu clic droit fichier : ' + labels.join(' | '));
    const clickItem = l => $$('.ctx .ctx-item').find(x => x.textContent.startsWith(l)).click();
    clickItem('Copier'); await sleep(50);
    ctxEv($('#desk-icons'), 600, 300); await sleep(50);
    labels = $$('.ctx .ctx-item span').map(x => x.textContent);
    ok(['Nouveau dossier', 'Nouveau fichier texte', 'Coller', 'Actualiser', 'Changer le fond d’écran…'].every(l => labels.includes(l)), 'menu clic droit bureau : ' + labels.join(' | '));
    ok(!$$('.ctx .ctx-item').find(x => x.textContent.startsWith('Coller')).disabled, 'Coller actif après Copier');
    clickItem('Coller'); await sleep(500);
    ok(!!icon('notes (copie).txt'), 'copier → coller crée « notes (copie).txt »');
    // 4. couper / coller dans un dossier
    ctxEv(icon('data.xyz')); await sleep(30); clickItem('Couper'); await sleep(30);
    ctxEv(icon('Projets')); await sleep(30); clickItem('Coller dans ce dossier'); await sleep(500);
    ok(!icon('data.xyz'), 'couper → coller dans dossier : retiré du Bureau');
    let l = await api('/api/syscall', { call: 'fs.list', args: { path: '/Bureau/Projets' } });
    ok(l.result.items.some(i => i.name === 'data.xyz'), 'déplacé dans Bureau/Projets');
    // 5. renommer
    ctxEv(icon('notes (copie).txt')); await sleep(30); clickItem('Renommer'); await sleep(50);
    ok(!!$('#dlg-in') && $('#dlg-in').value === 'notes (copie).txt', 'dialogue Renommer pré-rempli');
    $('#dlg-in').value = 'idees.txt'; $('#dlg-in').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(500);
    ok(!!icon('idees.txt') && !icon('notes (copie).txt'), 'renommer fonctionne');
    // 6. supprimer avec confirmation
    ctxEv(icon('idees.txt')); await sleep(30); clickItem('Supprimer'); await sleep(50);
    ok(/définitivement/.test($('.modal').textContent), 'confirmation avant suppression');
    $('.modal [data-r="1"]').click(); await sleep(500);
    ok(!icon('idees.txt'), 'supprimer fonctionne');
    // 7. nouveau dossier depuis le clic droit
    ctxEv($('#desk-icons'), 500, 400); await sleep(30); clickItem('Nouveau dossier'); await sleep(50);
    $('#dlg-in').value = 'Photos'; $('#dlg-in').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(500);
    ok(!!icon('Photos'), 'nouveau dossier créé sur le Bureau');
    // 8. raccourcis clavier
    icon('notes.txt').click(); await sleep(20);
    $('#desk-icons').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true })); await sleep(20);
    $('#desk-icons').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true })); await sleep(500);
    ok(!!icon('notes (copie).txt'), 'Ctrl+C / Ctrl+V');
    icon('notes (copie).txt').click(); await sleep(20);
    $('#desk-icons').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); await sleep(50);
    $('.modal [data-r="1"]').click(); await sleep(500);
    ok(!icon('notes (copie).txt'), 'touche Suppr');
    // 9. Cultivator : clic droit + ouverture par type
    const fw = $$('.win').find(x => x.querySelector('.title').textContent === 'Cultivator');
    const rows = () => [...fw.querySelectorAll('.fitem')];
    ok(rows().length >= 1, 'Cultivator liste les éléments');
    ctxEv(rows()[0], 200, 200); await sleep(30);
    ok($$('.ctx .ctx-item').length > 5, 'clic droit dans Cultivator');
    d.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(30);
    // 10. son d'erreur + réglages
    const ev = c => w.eval(c);
    ok(ev("Sound.files.startup+'|'+Sound.files.shutdown+'|'+Sound.files.error") === 'assets/sounds/startup.mp3|assets/sounds/shutdown.mp3|assets/sounds/error.mp3', 'chemins des sons : startup.mp3 / shutdown.mp3 / error.mp3');
    ok(ev("!!(Sound.cache.startup && Sound.cache.startup._played)"), 'son de démarrage joué au boot');
    ev("sys('appel.inexistant').catch(()=>{})"); await sleep(300);
    ok(ev("!!(Sound.cache.error && Sound.cache.error._played)"), 'son d’erreur joué sur une erreur système');
    ev("runShutdownAnimation('poweroff')"); await sleep(50);
    ok(ev("!!(Sound.cache.shutdown && Sound.cache.shutdown._played)"), 'son d’arrêt joué à l’extinction');
    // Mentions légales : invisibles dans l'App Center et Spotlight, ouvertes depuis « À propos ».
    ev("AppCenter.open = true; AppCenter.render()"); await sleep(100);
    ok(!$$('#appcenter *').some(n => /Mentions légales/.test(n.textContent) && n.children.length === 0), 'mentions légales absentes de l’App Center');
    ev("AppCenter.open = false; AppCenter.render()");
    ev("WM.open('about')"); await sleep(300);
    ok(!!$('#legal-open'), 'À propos : lien vers les mentions légales');
    $('#legal-open').click(); await sleep(150);
    ok(/Weed OS 1\.0\.0/.test($('.legal')?.textContent || '') && $$('.legal-wp li').length === 20 && /Apasaric/.test($('.legal')?.textContent || '') && /Brigitte Rasoafaniry/.test($('.legal').textContent) && /Universfield/.test($('.legal').textContent), 'mentions légales : version 1.0.0 et 20 crédits de fonds d’écran');
    ev("WM.open('settings')"); await sleep(100);
    ok(!!$('#snd-on') && !!$('#snd-boot') && !!$('#snd-boot-test') && $$('[data-snd]').length === 2, 'Réglages : section Sons du système (démarrage système + sons d’interface)');
    // 11. Gestionnaire de fenêtres : redimensionnement par 8 poignées, agrandir / plein écran, Dock masqué automatiquement
    const P = w.HTMLElement.prototype, num = (n, k) => parseFloat(n.style[k]) || 0;
    Object.defineProperties(P, { offsetWidth: { configurable: true, get() { return num(this, 'width'); } }, offsetHeight: { configurable: true, get() { return num(this, 'height'); } },
      offsetLeft: { configurable: true, get() { return num(this, 'left'); } }, offsetTop: { configurable: true, get() { return num(this, 'top'); } } });
    const desk = $('#desktop'); Object.defineProperty(desk, 'clientWidth', { configurable: true, value: 1000 }); Object.defineProperty(desk, 'clientHeight', { configurable: true, value: 600 });
    desk.getBoundingClientRect = () => ({ left: 0, top: 28, width: 1000, height: 600 });
    const fire = (n, type, x, y, extra = {}) => n.dispatchEvent(new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, ...extra }));
    ev("WM.open('notes', { fresh: true })"); await sleep(100);
    const nw = $$('.win').pop(), g = k => num(nw, k), body = d.body.classList;
    ok(nw.querySelectorAll('.rz').length === 8, 'fenêtre : 8 poignées de redimensionnement (4 bords + 4 coins)');
    Object.assign(nw.style, { left: '100px', top: '50px', width: '400px', height: '300px' });
    const se = nw.querySelector('.rz-se'); fire(se, 'pointerdown', 500, 350); fire(se, 'pointermove', 600, 450);
    ok(g('width') === 500 && g('height') === 400, 'coin bas-droit : la fenêtre s’agrandit (500×400)');
    fire(se, 'pointermove', 0, 0); ok(g('width') === 280 && g('height') === 160, 'taille minimale respectée (280×160)');
    fire(se, 'pointerup', 0, 0);
    Object.assign(nw.style, { left: '100px', top: '50px', width: '400px', height: '300px' });
    const we = nw.querySelector('.rz-w'); fire(we, 'pointerdown', 100, 200); fire(we, 'pointermove', 50, 200);
    ok(g('left') === 50 && g('width') === 450, 'bord gauche : la fenêtre s’étend vers la gauche, bord droit fixe'); fire(we, 'pointerup', 50, 200);
    const no = nw.querySelector('.rz-n'); fire(no, 'pointerdown', 200, 50); fire(no, 'pointermove', 200, -500);
    ok(g('top') === 0 && g('height') === 350, 'bord haut : bloqué au sommet du bureau'); fire(no, 'pointerup', 200, 0);
    ok(!body.contains('dock-auto'), 'fenêtre normale : Dock visible');
    nw.querySelector('.l.max').click();
    ok(nw.classList.contains('max') && body.contains('dock-auto') && !body.contains('chrome-full'), 'Agrandir : Dock masqué automatiquement');
    fire($('#edge-bottom'), 'pointerenter', 500, 599); ok(body.contains('dock-peek'), 'survol du bord bas : le Dock réapparaît');
    nw.querySelector('.l.max').click(); ok(!nw.classList.contains('max') && !body.contains('dock-auto') && !body.contains('dock-peek'), 'Restaurer : Dock de nouveau visible');
    nw.querySelector('.l.max').dispatchEvent(new w.MouseEvent('click', { bubbles: true, altKey: true }));
    ok(nw.classList.contains('full') && body.contains('chrome-full') && body.contains('dock-auto'), 'Alt+clic : plein écran (barre de menu et Dock masqués)');
    fire($('#edge-top'), 'pointerenter', 500, 1); ok(body.contains('bar-peek'), 'survol du bord haut : la barre de menu réapparaît');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, altKey: true, bubbles: true }));
    ok(!nw.classList.contains('full') && !body.contains('chrome-full') && !body.contains('dock-auto'), 'Ctrl+Alt+F quitte le plein écran');
    nw.querySelector('.l.max').click(); nw.querySelector('.l.min').click();
    ok(!body.contains('dock-auto'), 'réduire une fenêtre agrandie ramène le Dock');
    ev("WM.focus([...WM.wins].pop())"); nw.querySelector('.l.max').click(); nw.querySelector('.l.close').click();
    ok(!body.contains('dock-auto') && !nw.isConnected, 'fermer une fenêtre agrandie ramène le Dock');
    ev("WM.open('notes', { fresh: true })"); await sleep(50);
    const dw = $$('.win').pop(), tb = dw.querySelector('.titlebar');
    Object.assign(dw.style, { left: '200px', top: '100px', width: '400px', height: '300px' });
    fire(tb, 'pointerdown', 300, 130); fire(tb, 'pointermove', 340, 160);
    ok(num(dw, 'left') === 240 && num(dw, 'top') === 130, 'déplacement par la barre de titre sans saut de 28 px');
    fire(tb, 'pointermove', 340, 2); ok($('#snap-preview').style.display === 'block', 'aimantation en haut : aperçu affiché');
    fire(tb, 'pointerup', 340, 2); ok(dw.classList.contains('max') && body.contains('dock-auto'), 'relâcher en haut : fenêtre agrandie');
    fire(tb, 'pointerdown', 500, 40); fire(tb, 'pointermove', 520, 80); fire(tb, 'pointerup', 520, 80);
    ok(!dw.classList.contains('max') && num(dw, 'width') === 400, 'glisser une fenêtre agrandie la restaure à sa taille d’origine');
    fire(tb, 'pointerdown', 500, 100); fire(tb, 'pointermove', 1020, 300); ok($('#snap-preview').style.display === 'block', 'aimantation à droite : aperçu moitié d’écran');
    fire(tb, 'pointerup', 1020, 300); ok(num(dw, 'left') === 500 && num(dw, 'width') === 500 && num(dw, 'height') === 600, 'aimantation à droite : moitié droite du bureau');
    ok(!/resize\s*:\s*both/.test(fs.readFileSync(ROOT + '/system/desktop/css/weed.css', 'utf8')), 'plus de poignée de redimensionnement native minuscule (resize:both)');
    ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.slice(0, 3).join(' / ') : ''));
    dom.window.close();
  } catch (e) { ok(false, 'exception : ' + (e.stack || e)); }
  finally { php.kill(); execSync('rm -rf ' + DATA); console.log(results.join('\n') + `\n\n${failed ? failed + ' ÉCHEC(S)' : 'TOUS LES TESTS PASSENT'}`); process.exit(failed ? 1 : 0); }
})();
