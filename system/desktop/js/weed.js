'use strict';
/* Weed OS - bureau (gestionnaire de fenêtres, dock, Spotlight, apps système) */
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

async function sys(call, args = {}, quiet = false) {
  const r = await fetch('/api/syscall', { method: 'POST', headers: { 'X-Weed': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ call, args }) });
  const j = await r.json();
  if (!j.ok) { if (j.auth) Session.show(); else if (!quiet) Sound.play('error'); throw new Error(j.error || 'erreur'); }
  return j.result;
}
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'X-Weed': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json(); if (!j.ok) throw new Error(j.error || 'erreur'); return j.result;
}
function notify(title, message) {
  const item = { id: (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)), title: String(title || 'Weed OS').slice(0, 120), message: String(message || '').slice(0, 500), at: Date.now() };
  try {
    const history = JSON.parse(localStorage.getItem('weed.notifications') || '[]');
    history.unshift(item);
    localStorage.setItem('weed.notifications', JSON.stringify(history.slice(0, 100)));
  } catch (e) {}
  const t = el('div', 'toast', `<b>${esc(item.title)}</b><span>${esc(item.message)}</span>`);
  $('#toasts')?.append(t); setTimeout(() => t.remove(), 5000); t.onclick = () => t.remove();
}
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set: (k, v) => {
    try { localStorage.setItem(k, v); } catch (e) {}
    if (typeof Session !== 'undefined' && Session.user) api('/api/preferences/save', { key: k, value: String(v) }).catch(() => {});
  }
};
const UI_LANG = {
  fr:{locale:'fr-FR',search:'Rechercher une application…',all:'Tout',favorites:'★ Favoris',files:'Fichiers',tools:'Outils',media:'Multimédia',planning:'Organisation',system:'Système',recent:'Utilisées récemment',allApps:'Toutes les applications',login:'Connectez-vous pour continuer',setup:'Bienvenue ! Créez le compte administrateur.',signIn:'Se connecter',create:'Créer le compte',username:'Nom d’utilisateur',password:'Mot de passe',categories:{system:'Système',files:'Fichiers',tools:'Outils',media:'Multimédia',planning:'Organisation',creative:'Création et jeux'},wallpaper:'Fond d’écran',settings:'Réglages',installer:'Installer Weed OS'},
  en:{locale:'en-US',search:'Search applications…',all:'All',favorites:'★ Favorites',files:'Files',tools:'Tools',media:'Media',planning:'Productivity',system:'System',recent:'Recently used',allApps:'All applications',login:'Sign in to continue',setup:'Welcome! Create the administrator account.',signIn:'Sign in',create:'Create account',username:'Username',password:'Password',categories:{system:'System',files:'Files',tools:'Tools',media:'Media',planning:'Productivity',creative:'Creative & games'},wallpaper:'Wallpaper',settings:'Settings',installer:'Install Weed OS'},
  es:{locale:'es-ES',search:'Buscar aplicaciones…',all:'Todo',favorites:'★ Favoritos',files:'Archivos',tools:'Herramientas',media:'Multimedia',planning:'Organización',system:'Sistema',recent:'Usadas recientemente',allApps:'Todas las aplicaciones',login:'Inicia sesión para continuar',setup:'¡Bienvenido! Crea la cuenta de administrador.',signIn:'Iniciar sesión',create:'Crear cuenta',username:'Usuario',password:'Contraseña',categories:{system:'Sistema',files:'Archivos',tools:'Herramientas',media:'Multimedia',planning:'Organización',creative:'Creación y juegos'},wallpaper:'Fondo de pantalla',settings:'Ajustes',installer:'Instalar Weed OS'},
  zh:{locale:'zh-CN',search:'搜索应用…',all:'全部',favorites:'★ 收藏',files:'文件',tools:'工具',media:'多媒体',planning:'效率',system:'系统',recent:'最近使用',allApps:'所有应用',login:'登录以继续',setup:'欢迎！创建管理员账户。',signIn:'登录',create:'创建账户',username:'用户名',password:'密码',categories:{system:'系统',files:'文件',tools:'工具',media:'媒体',planning:'效率',creative:'创作与游戏'},wallpaper:'壁纸',settings:'设置',installer:'安装 Weed OS'},
  hi:{locale:'hi-IN',search:'ऐप खोजें…',all:'सभी',favorites:'★ पसंदीदा',files:'फ़ाइलें',tools:'उपकरण',media:'मीडिया',planning:'कार्य',system:'सिस्टम',recent:'हाल ही में उपयोग किए गए',allApps:'सभी ऐप',login:'जारी रखने के लिए साइन इन करें',setup:'स्वागत है! व्यवस्थापक खाता बनाएँ।',signIn:'साइन इन',create:'खाता बनाएँ',username:'उपयोगकर्ता नाम',password:'पासवर्ड',categories:{system:'सिस्टम',files:'फ़ाइलें',tools:'उपकरण',media:'मीडिया',planning:'उत्पादकता',creative:'रचनात्मक और खेल'},wallpaper:'वॉलपेपर',settings:'सेटिंग्स',installer:'Weed OS स्थापित करें'},
  ar:{locale:'ar',search:'ابحث عن التطبيقات…',all:'الكل',favorites:'★ المفضلة',files:'الملفات',tools:'الأدوات',media:'الوسائط',planning:'الإنتاجية',system:'النظام',recent:'المستخدمة مؤخراً',allApps:'كل التطبيقات',login:'سجّل الدخول للمتابعة',setup:'مرحباً! أنشئ حساب المسؤول.',signIn:'تسجيل الدخول',create:'إنشاء حساب',username:'اسم المستخدم',password:'كلمة المرور',categories:{system:'النظام',files:'الملفات',tools:'الأدوات',media:'الوسائط',planning:'الإنتاجية',creative:'الإبداع والألعاب'},wallpaper:'الخلفية',settings:'الإعدادات',installer:'تثبيت Weed OS'},
  de:{locale:'de-DE',search:'Anwendungen suchen…',all:'Alle',favorites:'★ Favoriten',files:'Dateien',tools:'Werkzeuge',media:'Medien',planning:'Organisation',system:'System',recent:'Zuletzt verwendet',allApps:'Alle Anwendungen',login:'Zum Fortfahren anmelden',setup:'Willkommen! Administratorkonto erstellen.',signIn:'Anmelden',create:'Konto erstellen',username:'Benutzername',password:'Passwort',categories:{system:'System',files:'Dateien',tools:'Werkzeuge',media:'Medien',planning:'Organisation',creative:'Kreativität & Spiele'},wallpaper:'Hintergrundbild',settings:'Einstellungen',installer:'Weed OS installieren'},
  pt:{locale:'pt-PT',search:'Pesquisar aplicações…',all:'Tudo',favorites:'★ Favoritos',files:'Ficheiros',tools:'Ferramentas',media:'Multimédia',planning:'Organização',system:'Sistema',recent:'Usadas recentemente',allApps:'Todas as aplicações',login:'Inicie sessão para continuar',setup:'Bem-vindo! Crie a conta de administrador.',signIn:'Iniciar sessão',create:'Criar conta',username:'Nome de utilizador',password:'Palavra-passe',categories:{system:'Sistema',files:'Ficheiros',tools:'Ferramentas',media:'Multimédia',planning:'Organização',creative:'Criação e jogos'},wallpaper:'Papel de parede',settings:'Definições',installer:'Instalar Weed OS'},
  mg:{locale:'mg-MG',search:'Hitady rindranasa…',all:'Rehetra',favorites:'★ Tiana',files:'Rakitra',tools:'Fitaovana',media:'Haino aman-jery',planning:'Fandaminana',system:'Rafitra',recent:'Nampiasaina farany',allApps:'Rindranasa rehetra',login:'Midira hanohizana',setup:'Tongasoa! Mamoròna kaonty mpitantana.',signIn:'Hiditra',create:'Mamoròna kaonty',username:'Anaran’ny mpampiasa',password:'Tenimiafina',categories:{system:'Rafitra',files:'Rakitra',tools:'Fitaovana',media:'Haino aman-jery',planning:'Fandaminana',creative:'Famoronana sy lalao'},wallpaper:'Sary ambadika',settings:'Fikirana',installer:'Mametraka Weed OS'}
};
const UI_TEXT = {
 fr:{archive:'Gestionnaire d’archives',open:'Ouvrir',extractAll:'Tout extraire',extractSelected:'Extraire la sélection',deleteSelected:'Supprimer la sélection',createZip:'Créer ZIP',parent:'Dossier parent',selectHint:'Sélectionnez des fichiers ou dossiers. Ouvrez un ZIP pour consulter, extraire ou modifier son contenu.',selectOne:'Sélectionnez au moins une entrée.',empty:'Ce dossier est vide.',selectFiles:'Sélectionnez au moins un fichier ou dossier.',settingsHint:'Les traductions des applications sont progressivement complétées.'},
 en:{archive:'Archive Manager',open:'Open',extractAll:'Extract all',extractSelected:'Extract selected',deleteSelected:'Delete selected',createZip:'Create ZIP',parent:'Parent folder',selectHint:'Select files or folders. Open a ZIP to browse, extract or edit its contents.',selectOne:'Select at least one entry.',empty:'This folder is empty.',selectFiles:'Select at least one file or folder.',settingsHint:'Application translations are being completed progressively.'},
 es:{archive:'Gestor de archivos',open:'Abrir',extractAll:'Extraer todo',extractSelected:'Extraer selección',deleteSelected:'Eliminar selección',createZip:'Crear ZIP',parent:'Carpeta superior',selectHint:'Selecciona archivos o carpetas. Abre un ZIP para ver, extraer o modificar su contenido.',selectOne:'Selecciona al menos una entrada.',empty:'Esta carpeta está vacía.',selectFiles:'Selecciona al menos un archivo o carpeta.',settingsHint:'Las traducciones de las aplicaciones se completan progresivamente.'},
 zh:{archive:'压缩包管理器',open:'打开',extractAll:'全部解压',extractSelected:'解压所选',deleteSelected:'删除所选',createZip:'创建 ZIP',parent:'上级文件夹',selectHint:'选择文件或文件夹。打开 ZIP 可浏览、解压或修改内容。',selectOne:'请至少选择一个条目。',empty:'此文件夹为空。',selectFiles:'请至少选择一个文件或文件夹。',settingsHint:'应用程序翻译正在逐步完善。'},
 hi:{archive:'अभिलेख प्रबंधक',open:'खोलें',extractAll:'सभी निकालें',extractSelected:'चयनित निकालें',deleteSelected:'चयनित हटाएँ',createZip:'ZIP बनाएँ',parent:'ऊपरी फ़ोल्डर',selectHint:'फ़ाइलें या फ़ोल्डर चुनें। ZIP खोलकर सामग्री देखें, निकालें या बदलें।',selectOne:'कम से कम एक प्रविष्टि चुनें।',empty:'यह फ़ोल्डर खाली है।',selectFiles:'कम से कम एक फ़ाइल या फ़ोल्डर चुनें।',settingsHint:'ऐप अनुवाद धीरे-धीरे पूरे किए जा रहे हैं।'},
 ar:{archive:'مدير الأرشيف',open:'فتح',extractAll:'استخراج الكل',extractSelected:'استخراج المحدد',deleteSelected:'حذف المحدد',createZip:'إنشاء ZIP',parent:'المجلد الأعلى',selectHint:'حدد ملفات أو مجلدات. افتح ZIP لتصفح محتوياته أو استخراجها أو تعديلها.',selectOne:'حدد عنصراً واحداً على الأقل.',empty:'هذا المجلد فارغ.',selectFiles:'حدد ملفاً أو مجلداً واحداً على الأقل.',settingsHint:'تتم استكمال ترجمات التطبيقات تدريجياً.'},
 de:{archive:'Archivverwaltung',open:'Öffnen',extractAll:'Alle entpacken',extractSelected:'Auswahl entpacken',deleteSelected:'Auswahl löschen',createZip:'ZIP erstellen',parent:'Übergeordneter Ordner',selectHint:'Dateien oder Ordner auswählen. ZIP öffnen, um Inhalte anzuzeigen, zu entpacken oder zu bearbeiten.',selectOne:'Mindestens einen Eintrag auswählen.',empty:'Dieser Ordner ist leer.',selectFiles:'Mindestens eine Datei oder einen Ordner auswählen.',settingsHint:'Anwendungsübersetzungen werden schrittweise ergänzt.'},
 pt:{archive:'Gestor de arquivos',open:'Abrir',extractAll:'Extrair tudo',extractSelected:'Extrair seleção',deleteSelected:'Eliminar seleção',createZip:'Criar ZIP',parent:'Pasta superior',selectHint:'Selecione ficheiros ou pastas. Abra um ZIP para consultar, extrair ou editar o conteúdo.',selectOne:'Selecione pelo menos uma entrada.',empty:'Esta pasta está vazia.',selectFiles:'Selecione pelo menos um ficheiro ou pasta.',settingsHint:'As traduções das aplicações estão a ser completadas gradualmente.'},
 mg:{archive:'Mpitantana arisiva',open:'Sokafy',extractAll:'Esory daholo',extractSelected:'Esory ny voafidy',deleteSelected:'Fafao ny voafidy',createZip:'Mamoròna ZIP',parent:'Lahatahiry ambony',selectHint:'Safidio ny rakitra na lahatahiry. Sokafy ny ZIP hijerena, hanalana na hanovana ny ao anatiny.',selectOne:'Misafidiana singa iray farafahakeliny.',empty:'Foana ity lahatahiry ity.',selectFiles:'Misafidiana rakitra na lahatahiry iray farafahakeliny.',settingsHint:'Hatsaraina tsikelikely ny fandikana ny rindranasa.'}
};
const SHELL_TEXT = {
 fr:{restarting:'Redémarrage',menu:'Menu Weed',spot:'Recherche Spotlight',profile:'Profil utilisateur',power:'Session et alimentation',close:'Fermer',logout:'Se déconnecter',logoutHint:'Fermer votre session utilisateur',reboot:'Redémarrer',rebootHint:'Relancer Weed OS et le système hôte',poweroff:'Éteindre',poweroffHint:'Arrêter Weed OS et demander l’arrêt de l’hôte',appCenter:'Centre d’applications',searchApp:'Rechercher une application…',allApps:'Toutes les applications',recent:'Utilisées récemment',shutdown:'Arrêt',shutdownStatus:'Fermeture des services…'},
 en:{restarting:'Restarting',menu:'Weed menu',spot:'Spotlight search',profile:'User profile',power:'Session and power',close:'Close',logout:'Log out',logoutHint:'End your user session',reboot:'Restart',rebootHint:'Restart Weed OS and the host system',poweroff:'Shut down',poweroffHint:'Stop Weed OS and request host shutdown',appCenter:'App Center',searchApp:'Search applications…',allApps:'All applications',recent:'Recently used',shutdown:'Shutting down',shutdownStatus:'Stopping services…'},
 es:{restarting:'Reiniciando',menu:'Menú Weed',spot:'Búsqueda Spotlight',profile:'Perfil de usuario',power:'Sesión y energía',close:'Cerrar',logout:'Cerrar sesión',logoutHint:'Finalizar la sesión de usuario',reboot:'Reiniciar',rebootHint:'Reiniciar Weed OS y el sistema anfitrión',poweroff:'Apagar',poweroffHint:'Detener Weed OS y solicitar el apagado del anfitrión',appCenter:'Centro de aplicaciones',searchApp:'Buscar aplicaciones…',allApps:'Todas las aplicaciones',recent:'Usadas recientemente',shutdown:'Apagando',shutdownStatus:'Cerrando servicios…'},
 zh:{restarting:'正在重启',menu:'Weed 菜单',spot:'Spotlight 搜索',profile:'用户资料',power:'会话与电源',close:'关闭',logout:'退出登录',logoutHint:'结束当前用户会话',reboot:'重新启动',rebootHint:'重新启动 Weed OS 和主机系统',poweroff:'关机',poweroffHint:'停止 Weed OS 并请求关闭主机',appCenter:'应用中心',searchApp:'搜索应用…',allApps:'所有应用',recent:'最近使用',shutdown:'正在关机',shutdownStatus:'正在停止服务…'},
 hi:{restarting:'पुनः प्रारंभ हो रहा है',menu:'Weed मेनू',spot:'Spotlight खोज',profile:'उपयोगकर्ता प्रोफ़ाइल',power:'सत्र और पावर',close:'बंद करें',logout:'साइन आउट',logoutHint:'उपयोगकर्ता सत्र समाप्त करें',reboot:'पुनः प्रारंभ',rebootHint:'Weed OS और होस्ट सिस्टम पुनः प्रारंभ करें',poweroff:'बंद करें',poweroffHint:'Weed OS रोकें और होस्ट बंद करने का अनुरोध करें',appCenter:'ऐप केंद्र',searchApp:'ऐप खोजें…',allApps:'सभी ऐप',recent:'हाल ही में उपयोग किए गए',shutdown:'बंद हो रहा है',shutdownStatus:'सेवाएँ बंद हो रही हैं…'},
 ar:{restarting:'جارٍ إعادة التشغيل',menu:'قائمة Weed',spot:'بحث Spotlight',profile:'ملف المستخدم',power:'الجلسة والطاقة',close:'إغلاق',logout:'تسجيل الخروج',logoutHint:'إنهاء جلسة المستخدم',reboot:'إعادة التشغيل',rebootHint:'إعادة تشغيل Weed OS والنظام المضيف',poweroff:'إيقاف التشغيل',poweroffHint:'إيقاف Weed OS وطلب إيقاف المضيف',appCenter:'مركز التطبيقات',searchApp:'ابحث عن التطبيقات…',allApps:'كل التطبيقات',recent:'المستخدمة مؤخراً',shutdown:'جارٍ الإيقاف',shutdownStatus:'جارٍ إيقاف الخدمات…'},
 de:{restarting:'Wird neu gestartet',menu:'Weed-Menü',spot:'Spotlight-Suche',profile:'Benutzerprofil',power:'Sitzung und Energie',close:'Schließen',logout:'Abmelden',logoutHint:'Benutzersitzung beenden',reboot:'Neu starten',rebootHint:'Weed OS und Hostsystem neu starten',poweroff:'Ausschalten',poweroffHint:'Weed OS stoppen und Herunterfahren des Hosts anfordern',appCenter:'App-Center',searchApp:'Anwendungen suchen…',allApps:'Alle Anwendungen',recent:'Zuletzt verwendet',shutdown:'Wird heruntergefahren',shutdownStatus:'Dienste werden beendet…'},
 pt:{restarting:'A reiniciar',menu:'Menu Weed',spot:'Pesquisa Spotlight',profile:'Perfil do utilizador',power:'Sessão e energia',close:'Fechar',logout:'Terminar sessão',logoutHint:'Terminar a sessão do utilizador',reboot:'Reiniciar',rebootHint:'Reiniciar o Weed OS e o sistema anfitrião',poweroff:'Desligar',poweroffHint:'Parar o Weed OS e solicitar o encerramento do anfitrião',appCenter:'Centro de aplicações',searchApp:'Pesquisar aplicações…',allApps:'Todas as aplicações',recent:'Usadas recentemente',shutdown:'A desligar',shutdownStatus:'A parar os serviços…'},
 mg:{restarting:'Eo am-pandefasana indray',menu:'Sakafo Weed',spot:'Fikarohana Spotlight',profile:'Mombamomba ny mpampiasa',power:'Fivoriana sy herinaratra',close:'Hidio',logout:'Hivoaka',logoutHint:'Farano ny fivorian’ny mpampiasa',reboot:'Avereno alefa',rebootHint:'Avereno alefa ny Weed OS sy ny rafitra fototra',poweroff:'Vonoy',poweroffHint:'Ajanony ny Weed OS ary angataho ny famonoana ny solosaina',appCenter:'Foiben’ny rindranasa',searchApp:'Hitady rindranasa…',allApps:'Rindranasa rehetra',recent:'Nampiasaina farany',shutdown:'Eo am-pamonoana',shutdownStatus:'Ajanona ny tolotra…'}
};
function tr(key){const lang=store.get('ui.lang','fr');return (UI_TEXT[lang]||UI_TEXT.fr)[key]||UI_TEXT.fr[key]||key;}
function translateShell() {
  const language = store.get('ui.lang','fr');
  const d = UI_LANG[language] || UI_LANG.fr;
  const x = SHELL_TEXT[language] || SHELL_TEXT.fr;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  const set = (selector, value) => { const n=$(selector); if(n)n.textContent=value; };
  const setPlaceholder=(selector,value)=>{const n=$(selector);if(n)n.placeholder=value;};
  const setAttr=(selector,attr,value)=>{const n=$(selector);if(n)n.setAttribute(attr,value);};
  setAttr('#apple','title',x.menu); setAttr('#spot-btn','title',x.spot); setAttr('#profile-button','title',x.profile);
  setAttr('#power-dialog','aria-label',x.power); setAttr('#power-dismiss','aria-label',x.close);
  set('#power-dialog .power-title b',x.power);
  set('#power-dialog [data-power="logout"] b',x.logout); set('#power-dialog [data-power="logout"] small',x.logoutHint);
  set('#power-dialog [data-power="reboot"] b',x.reboot); set('#power-dialog [data-power="reboot"] small',x.rebootHint);
  set('#power-dialog [data-power="poweroff"] b',x.poweroff); set('#power-dialog [data-power="poweroff"] small',x.poweroffHint);
  setAttr('#appcenter','aria-label',x.appCenter); setPlaceholder('#ac-search',x.searchApp);
  set('#shutdown-label',x.shutdown); set('#shutdown-status',x.shutdownStatus);
  Object.entries(d.categories||{}).forEach(([id,label])=>{const n=$(`#ac-categories [data-category=\"${id}\"]`);if(n)n.textContent=label;});
  setPlaceholder('#ac-search',d.search); setPlaceholder('#spot-in',d.search);
  set('#ac-categories [data-category="all"]',d.all);
  set('#ac-categories [data-category="favorites"]',d.favorites);
  set('#ac-categories [data-category="files"]',d.files);
  set('#ac-categories [data-category="tools"]',d.tools);
  set('#ac-categories [data-category="media"]',d.media);
  set('#ac-categories [data-category="planning"]',d.planning);
  set('#ac-categories [data-category="system"]',d.system);
  const sections=$$('.ac-section'); if(sections[0])sections[0].textContent=d.recent;if(sections[1])sections[1].textContent=d.allApps;
  setPlaceholder('#lu',d.username);setPlaceholder('#lp',d.password);
  if($('#ls'))$('#ls').textContent=$('#lb')?.dataset.setup==='1'?d.setup:d.login;
  if($('#lb'))$('#lb').textContent=$('#lb').dataset.setup==='1'?d.create:d.signIn;
}
const fmtSize = n => n < 1024 ? n + ' o' : n < 1048576 ? (n / 1024).toFixed(1) + ' Ko' : (n / 1048576).toFixed(1) + ' Mo';
const fmtDur = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ' h ' : '') + m + ' min ' + (s % 60) + ' s'; };

/* ---------- Apps ---------- */
const APPS = {};
const DEFAULT_FREQUENT = ['finder', 'calculator', 'notes', 'mail', 'connectivity', 'settings', 'terminal'];
const FREQUENT_KEY = 'weed.frequent.apps';
const FAVORITES_KEY = 'weed.favorite.apps';
const APP_CATEGORIES = {
  system: { label: 'Système', ids: ['settings', 'monitor', 'processes', 'services', 'security', 'startup', 'sessions', 'eventlog', 'apppermissions', 'storage', 'users', 'notifications', 'about', 'connectivity', 'installer'] },
  files: { label: 'Fichiers', ids: ['finder', 'textedit', 'pdf', 'archive'] },
  tools: { label: 'Outils', ids: ['calculator', 'terminal', 'programs', 'archive'] },
  media: { label: 'Multimédia', ids: ['photos', 'music', 'video', 'gnanja'] },
  planning: { label: 'Organisation', ids: ['calendar', 'notes', 'mail'] },
  creative: { label: 'Création et jeux', ids: ['paint', 'snake'] }
};
function getFavorites() {
  try { return JSON.parse(store.get(FAVORITES_KEY, '[]')).filter(id => APPS[id]); }
  catch (e) { return []; }
}
function toggleFavorite(id) {
  if (!APPS[id]) return;
  const ids = getFavorites();
  const next = ids.includes(id) ? ids.filter(x => x !== id) : [id, ...ids].slice(0, 8);
  store.set(FAVORITES_KEY, JSON.stringify(next));
  Dock.build();
  AppCenter.render();
}
function appIconHTML(a, id = '') {
  const icon = String(a?.icon || 'fa-cube');
  if (/^fa-[a-z0-9-]+$/.test(icon)) return `<i class="fa-solid ${esc(icon)}"></i>`;
  const src = id.startsWith('app.') ? `/app/${encodeURIComponent(id.slice(4))}/${icon.split('/').map(encodeURIComponent).join('/')}` : icon;
  return `<img class="app-icon-image" src="${esc(src)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-cube'}))">`;
}
function categoryOf(id) {
  return Object.entries(APP_CATEGORIES).find(([, c]) => c.ids.includes(id))?.[0] || 'other';
}
function getFrequent() { try { return JSON.parse(store.get(FREQUENT_KEY, '[]')).filter(id => APPS[id]); } catch(e) { return []; } }
function recordFrequent(id) {
  if (!APPS[id]) return;
  const ids = getFrequent().filter(x => x !== id);
  ids.unshift(id);
  store.set(FREQUENT_KEY, JSON.stringify(ids.slice(0, 8)));
}

/* Cultivator (finder), visionneuse, lecteurs audio/vidéo/PDF : voir js/files.js (v0.8.7) */

APPS.connectivity = { title: 'Réseau et Bluetooth', icon: 'fa-wifi', w: 720, h: 610, async render(b) {
  b.innerHTML = `<div class="settings-scroll pad"><div class="row"><h2 class="sp">Réseau et connectivité</h2><button class="b" id="net-refresh"><i class="fa-solid fa-rotate"></i> Actualiser</button></div>
    <section class="settings-section"><h3><i class="fa-solid fa-globe"></i> Internet</h3><div id="internet-state" class="settings-hint">Vérification…</div><div id="net-error" class="settings-hint"></div></section>
    <section class="settings-section"><h3><i class="fa-solid fa-wifi"></i> Wi-Fi</h3><div id="wifi-state" class="settings-hint">Détection…</div>
      <div class="tool"><button class="b" id="wifi-scan">Rechercher les réseaux</button><button class="b" id="wifi-power">Activer / désactiver</button></div>
      <div id="wifi-networks"></div><div class="tool"><input class="t" id="wifi-ssid" placeholder="Nom du réseau (SSID)"><input class="t" id="wifi-pass" type="password" autocomplete="new-password" placeholder="Mot de passe Wi-Fi"><button class="b pri" id="wifi-connect">Se connecter</button></div><div id="wifi-interfaces"></div></section>
    <section class="settings-section"><h3><i class="fa-solid fa-ethernet"></i> Ethernet</h3><div id="eth-state" class="settings-hint">Détection…</div><div id="eth-interfaces"></div></section>
    <section class="settings-section"><h3><i class="fa-brands fa-bluetooth-b"></i> Bluetooth</h3><div id="bt-state" class="settings-hint">Détection…</div>
      <div class="tool"><button class="b" id="bt-power">Activer / désactiver</button><button class="b" id="bt-scan">Rechercher des appareils</button><button class="b" id="bt-stop">Arrêter la recherche</button></div><div id="bt-devices"></div></section>
    <small class="settings-hint">Le contrôle matériel requiert NetworkManager, BlueZ, les services associés et des pilotes compatibles. Les états affichés proviennent du système ; les actions peuvent nécessiter des droits administrateur.</small></div>`;
  const status = async () => {
    try {
      const x = await api('/api/connectivity/status');
      const internet=$('#internet-state',b); internet.textContent=x.internet?.detail || 'Diagnostic Internet indisponible.';
      internet.dataset.state=x.internet?.state || 'unknown';
      $('#net-error',b).textContent=x.network_error || '';
      $('#wifi-state',b).dataset.enabled=x.wifi.enabled?'1':'0';
      $('#wifi-state',b).textContent=!x.wifi.supported?'NetworkManager (nmcli) indisponible.':(!x.wifi.enabled?'Wi-Fi désactivé.':(x.wifi.connected?'Connecté : '+(x.wifi.ssid||'réseau Wi-Fi'):'Wi-Fi activé, non connecté.'));
      $('#eth-state',b).textContent=!x.ethernet.supported?'NetworkManager indisponible.':(x.ethernet.connected?'Connexion Ethernet active.':'Aucune connexion Ethernet active.');
      $('#bt-state',b).dataset.enabled=x.bluetooth.enabled?'1':'0';
      $('#bt-state',b).textContent=!x.bluetooth.supported?'BlueZ (bluetoothctl) indisponible.':(x.bluetooth.enabled?'Bluetooth activé'+(x.bluetooth.discovering?' · recherche en cours':'')+'.':'Bluetooth désactivé.')+(x.bluetooth.error?' · '+x.bluetooth.error:'');
      $('#wifi-power',b).disabled=!x.wifi.supported; $('#wifi-scan',b).disabled=!x.wifi.supported||!x.wifi.enabled; $('#wifi-connect',b).disabled=!x.wifi.supported;
      $('#bt-power',b).disabled=!x.bluetooth.supported; $('#bt-scan',b).disabled=!x.bluetooth.supported||!x.bluetooth.enabled; $('#bt-stop',b).disabled=!x.bluetooth.supported||!x.bluetooth.discovering;
      $('#wifi-interfaces',b).innerHTML=(x.wifi.devices||[]).map(d=>`<div class="row"><span class="sp">${esc(d.name)} · ${esc(d.state)} ${d.connection?'· '+esc(d.connection):''}</span>${d.state==='connected'?`<button class="b" data-wifi-disconnect="${esc(d.name)}">Déconnecter</button>`:''}</div>`).join('');
      $('#eth-interfaces',b).innerHTML=(x.ethernet.devices||[]).map(d=>`<div class="row"><span class="sp">${esc(d.name)} · ${esc(d.state)} ${d.connection?'· '+esc(d.connection):''}</span><button class="b" data-eth-toggle="${esc(d.name)}" data-enabled="${d.state==='connected'?'0':'1'}">${d.state==='connected'?'Déconnecter':'Activer'}</button></div>`).join('')||'<small>Aucune interface Ethernet détectée.</small>';
      b.querySelectorAll('[data-wifi-disconnect]').forEach(el=>el.onclick=async()=>{try{await api('/api/connectivity/wifi/disconnect',{device:el.dataset.wifiDisconnect});await status();}catch(e){notify('Wi-Fi',e.message);}});
      b.querySelectorAll('[data-eth-toggle]').forEach(el=>el.onclick=async()=>{try{await api('/api/connectivity/ethernet/set',{device:el.dataset.ethToggle,enabled:el.dataset.enabled==='1'});await status();}catch(e){notify('Ethernet',e.message);}});
      $('#bt-devices',b).innerHTML=(x.bluetooth.devices||[]).map(d=>`<div class="row"><span class="sp">${esc(d.name)} <small>${esc(d.address)} · ${d.connected?'Connecté':d.paired?'Associé':'Détecté'}</small></span>${d.connected?`<button class="b" data-bt-disconnect="${esc(d.address)}">Déconnecter</button>`:`<button class="b" data-bt-connect="${esc(d.address)}">Connecter</button>`}${d.paired?'':`<button class="b" data-bt-pair="${esc(d.address)}">Associer</button>`}<button class="b" data-bt-trust="${esc(d.address)}" data-trusted="${d.trusted?'0':'1'}">${d.trusted?'Ne plus faire confiance':'Faire confiance'}</button></div>`).join('')||'<small>Aucun appareil détecté. Lancez une recherche.</small>';
      b.querySelectorAll('[data-bt-connect]').forEach(el=>el.onclick=async()=>{try{await api('/api/connectivity/bluetooth/connect',{address:el.dataset.btConnect});await status();}catch(e){notify('Bluetooth',e.message);}});
      b.querySelectorAll('[data-bt-disconnect]').forEach(el=>el.onclick=async()=>{try{await api('/api/connectivity/bluetooth/disconnect',{address:el.dataset.btDisconnect});await status();}catch(e){notify('Bluetooth',e.message);}});
      b.querySelectorAll('[data-bt-pair]').forEach(el=>el.onclick=async()=>{try{await api('/api/connectivity/bluetooth/pair',{address:el.dataset.btPair});await status();}catch(e){notify('Bluetooth',e.message);}});
      b.querySelectorAll('[data-bt-trust]').forEach(el=>el.onclick=async()=>{try{await api('/api/connectivity/bluetooth/trust',{address:el.dataset.btTrust,trusted:el.dataset.trusted==='1'});await status();}catch(e){notify('Bluetooth',e.message);}});
    } catch(e) { $('#internet-state',b).textContent=e.message; }
  };
  $('#net-refresh',b).onclick=status;
  $('#wifi-scan',b).onclick=async()=>{const box=$('#wifi-networks',b);box.textContent='Recherche des réseaux…';try{const rows=await api('/api/connectivity/wifi/scan');box.innerHTML=rows.map(x=>`<button class="b wifi-network" data-ssid="${esc(x.ssid)}">${x.active?'● ':''}${esc(x.ssid||'(réseau masqué)')} · ${x.signal}% · ${esc(x.security||'ouvert')}</button>`).join('')||'Aucun réseau trouvé.';box.querySelectorAll('[data-ssid]').forEach(el=>el.onclick=()=>$('#wifi-ssid',b).value=el.dataset.ssid);}catch(e){box.textContent=e.message;}};
  $('#wifi-connect',b).onclick=async()=>{try{await api('/api/connectivity/wifi/connect',{ssid:$('#wifi-ssid',b).value,password:$('#wifi-pass',b).value});$('#wifi-pass',b).value='';await status();notify('Wi-Fi','Connexion demandée.');}catch(e){notify('Wi-Fi',e.message);}};
  $('#wifi-power',b).onclick=async()=>{try{await api('/api/connectivity/wifi/power',{enabled:$('#wifi-state',b).dataset.enabled!=='1'});await status();}catch(e){notify('Wi-Fi',e.message);}};
  $('#bt-power',b).onclick=async()=>{try{await api('/api/connectivity/bluetooth/power',{enabled:$('#bt-state',b).dataset.enabled!=='1'});await status();}catch(e){notify('Bluetooth',e.message);}};
  $('#bt-scan',b).onclick=async()=>{try{await api('/api/connectivity/bluetooth/scan',{enabled:true});notify('Bluetooth','Recherche lancée. Actualisez dans quelques secondes.');}catch(e){notify('Bluetooth',e.message);}};
  $('#bt-stop',b).onclick=async()=>{try{await api('/api/connectivity/bluetooth/scan',{enabled:false});await status();}catch(e){notify('Bluetooth',e.message);}};
  status();
} };
APPS.mail = { title: 'Courrier', icon: 'fa-envelope', w: 850, h: 620, async render(b) {
  b.innerHTML = `<div class="mail-app"><div class="mail-toolbar"><select class="t" id="mail-account"></select><select class="t" id="mail-folder" aria-label="Dossier e-mail"><option value="INBOX">Boîte de réception</option></select><button class="b" id="mail-refresh"><i class="fa-solid fa-rotate"></i> Recevoir</button><button class="b" id="mail-drafts"><i class="fa-regular fa-file-lines"></i> Brouillons</button><button class="b pri" id="mail-compose"><i class="fa-solid fa-pen"></i> Nouveau</button><button class="b" id="mail-settings"><i class="fa-solid fa-gear"></i> Comptes</button></div>
    <div class="mail-layout"><aside id="mail-list" class="mail-list">Chargement…</aside><article id="mail-reader" class="mail-reader"><div class="settings-hint">Sélectionnez un message pour le lire.</div></article></div>
    <div id="mail-account-panel" class="mail-overlay hidden"><div class="mail-panel"><h3>Configurer un compte e-mail</h3><div class="mail-form">
      <label>Nom affiché<input class="t" id="ma-name" placeholder="Personnel"></label><label>Adresse e-mail<input class="t" id="ma-email" type="email" placeholder="vous@exemple.com"></label><label>Nom d'utilisateur<input class="t" id="ma-user" placeholder="souvent votre adresse e-mail"></label><label>Mot de passe<input class="t" id="ma-pass" type="password" autocomplete="new-password"></label>
      <div class="mail-form-grid"><label>Serveur IMAP<input class="t" id="ma-imap" placeholder="imap.exemple.com"></label><label>Port IMAP<input class="t" id="ma-ip" type="number" value="993"></label><label>Sécurité IMAP<select class="t" id="ma-is"><option value="ssl">SSL/TLS</option><option value="starttls">STARTTLS</option><option value="none">Aucune</option></select></label><label>Serveur SMTP<input class="t" id="ma-smtp" placeholder="smtp.exemple.com"></label><label>Port SMTP<input class="t" id="ma-sp" type="number" value="465"></label><label>Sécurité SMTP<select class="t" id="ma-ss"><option value="ssl">SSL/TLS</option><option value="starttls">STARTTLS</option><option value="none">Aucune</option></select></label></div>
      <div class="settings-inline"><button class="b pri" id="ma-save">Enregistrer le compte</button><button class="b" id="ma-close">Fermer</button></div><div id="ma-status" class="settings-hint"></div></div><div id="mail-accounts"></div></div></div>
    <div id="mail-compose-panel" class="mail-overlay hidden"><div class="mail-panel"><h3 id="mc-title">Nouveau message</h3><label>Destinataire<input class="t" id="mc-to" type="email"></label><label>Objet<input class="t" id="mc-subject"></label><label>Message<textarea class="t" id="mc-body" rows="9"></textarea></label><label>Pièces jointes (5 fichiers max., 5 Mo chacun)<input class="t" id="mc-files" type="file" multiple></label><small id="mc-files-info" class="settings-hint">10 Mo maximum au total. Les fichiers joints ne sont pas inclus dans les brouillons enregistrés.</small><div class="settings-inline"><button class="b" id="mc-save-draft">Enregistrer le brouillon</button><button class="b pri" id="mc-send">Envoyer</button><button class="b" id="mc-close">Fermer</button></div><div id="mc-status" class="settings-hint"></div></div></div></div>`;
  const accountSelect=$('#mail-account',b),list=$('#mail-list',b),reader=$('#mail-reader',b),folderSelect=$('#mail-folder',b);
  let accounts=[],messages=[],currentMessage=null,currentMeta=null,draftId='';
  const selected=()=>accountSelect.value, currentFolder=()=>folderSelect.value||'INBOX';
  const loadAccounts=async()=>{
    const previous=selected();accounts=await api('/api/mail/accounts');accountSelect.innerHTML=accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} — ${esc(a.email)}</option>`).join('');if(accounts.some(a=>a.id===previous))accountSelect.value=previous;
    $('#mail-accounts',b).innerHTML=accounts.map(a=>`<div class="row"><span class="sp">${esc(a.email)}</span><button class="b" data-remove-account="${esc(a.id)}">Supprimer</button></div>`).join('');
    b.querySelectorAll('[data-remove-account]').forEach(el=>el.onclick=async()=>{if(confirm('Supprimer ce compte de Weed OS ?')){await api('/api/mail/account/remove',{id:el.dataset.removeAccount});await loadAccounts();}});
    if(!accounts.length){list.innerHTML='<div class="pad">Ajoutez un compte pour commencer.</div>';reader.innerHTML='';return;}
    try{const folders=await api('/api/mail/folders',{id:selected()});folderSelect.innerHTML=folders.map(f=>`<option value="${esc(f)}">${esc(f==='INBOX'?'Boîte de réception':f)}</option>`).join('');}catch(e){folderSelect.innerHTML='<option value="INBOX">Boîte de réception</option>';$('#mail-reader',b).textContent=e.message;}
  };
  const openCompose=(draft={})=>{draftId=draft.id||'';$('#mc-title',b).textContent=draftId?'Modifier le brouillon':'Nouveau message';$('#mc-to',b).value=draft.to||'';$('#mc-subject',b).value=draft.subject||'';$('#mc-body',b).value=draft.body||'';$('#mc-files',b).value='';$('#mc-files-info',b).textContent='10 Mo maximum au total. Les fichiers joints ne sont pas inclus dans les brouillons enregistrés.';$('#mc-status',b).textContent='';$('#mail-compose-panel',b).classList.remove('hidden');};
  const saveDraft=async()=>{if(!selected())throw Error('Ajoutez et sélectionnez un compte.');const result=await api('/api/mail/draft/save',{draft:{id:draftId,to:$('#mc-to',b).value,subject:$('#mc-subject',b).value,body:$('#mc-body',b).value}});draftId=result.id;$('#mc-title',b).textContent='Modifier le brouillon';$('#mc-status',b).textContent='Brouillon enregistré de façon chiffrée sur cet appareil.';return result;};
  const showDrafts=async()=>{try{const drafts=await api('/api/mail/drafts');list.innerHTML=drafts.map((d,i)=>`<button class="mail-message" data-draft="${i}"><b>${esc(d.subject||'(Sans objet)')}</b><span>${esc(d.to||'Sans destinataire')}</span><small>${new Date(d.updated*1000).toLocaleString()}</small></button>`).join('')||'<div class="pad">Aucun brouillon enregistré.</div>';reader.innerHTML='<div class="settings-hint">Sélectionnez un brouillon pour le modifier.</div>';list.querySelectorAll('[data-draft]').forEach(el=>el.onclick=()=>openCompose(drafts[Number(el.dataset.draft)]));}catch(e){list.textContent=e.message;}};
  const inbox=async()=>{if(!selected())return;list.textContent='Réception des messages…';reader.innerHTML='<div class="settings-hint">Chargement…</div>';try{messages=await api('/api/mail/inbox',{id:selected(),folder:currentFolder()});list.innerHTML=messages.map((m,i)=>`<button class="mail-message" data-message="${i}"><b>${esc(m.subject)}</b><span>${esc(m.from)}</span><small>${esc(m.date)}</small></button>`).join('')||'<div class="pad">Aucun message dans ce dossier.</div>';list.querySelectorAll('[data-message]').forEach(el=>el.onclick=async()=>{const meta=messages[Number(el.dataset.message)];currentMeta=meta;reader.innerHTML='<div class="settings-hint">Ouverture du message…</div>';try{currentMessage=await api('/api/mail/message',{id:selected(),folder:currentFolder(),uid:meta.uid});const full=currentMessage;const files=(full.attachments||[]).map(f=>`<a class="mail-attachment" download="${esc(f.name)}" href="data:${esc(f.mime)};base64,${f.data}"><i class="fa-solid fa-paperclip"></i> ${esc(f.name)} <small>(${fmtSize(f.size)})</small></a>`).join('');reader.innerHTML=`<h3>${esc(full.subject)}</h3><div class="settings-hint">${esc(full.from)} · ${esc(full.date)}</div><div class="settings-inline"><button class="b" id="mail-reply">Répondre</button><button class="b" id="mail-forward">Transférer</button><button class="b" id="mail-delete">Supprimer</button><select class="t" id="mail-move-to">${[...folderSelect.options].map(o=>`<option value="${esc(o.value)}">${esc(o.textContent)}</option>`).join('')}</select><button class="b" id="mail-move">Déplacer</button></div>${files?`<div class="mail-attachments"><b>Pièces jointes</b>${files}</div>`:''}<pre class="mail-body">${esc(full.body)}</pre>`;
        $('#mail-reply',reader).onclick=()=>{const address=(full.from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||'';openCompose({to:address,subject:/^re:/i.test(full.subject)?full.subject:'Re: '+full.subject,body:'\n\nLe '+full.date+', '+full.from+' a écrit :\n'+full.body.split('\n').map(x=>'> '+x).join('\n')});};
        $('#mail-forward',reader).onclick=()=>openCompose({subject:/^fwd?:/i.test(full.subject)?full.subject:'Fwd: '+full.subject,body:'\n\n-------- Message transféré --------\nDe : '+full.from+'\nDate : '+full.date+'\nObjet : '+full.subject+'\n\n'+full.body});
        $('#mail-delete',reader).onclick=async()=>{if(!confirm('Supprimer définitivement ce message ?'))return;try{await api('/api/mail/message/delete',{id:selected(),folder:currentFolder(),uid:meta.uid});currentMessage=null;await inbox();}catch(e){notify('Courrier',e.message);}};
        $('#mail-move',reader).onclick=async()=>{const destination=$('#mail-move-to',reader).value;if(destination===currentFolder()){notify('Courrier','Choisissez un autre dossier.');return;}try{await api('/api/mail/message/move',{id:selected(),folder:currentFolder(),uid:meta.uid,destination});currentMessage=null;await inbox();}catch(e){notify('Courrier',e.message);}};
      }catch(e){reader.textContent=e.message;}});if(messages.length)list.querySelector('[data-message]')?.click();}catch(e){list.textContent=e.message;reader.innerHTML='';}};
  $('#mail-refresh',b).onclick=inbox;accountSelect.onchange=async()=>{await loadAccounts();await inbox();};folderSelect.onchange=inbox;$('#mail-drafts',b).onclick=showDrafts;$('#mail-compose',b).onclick=()=>openCompose();
  $('#mc-close',b).onclick=async()=>{try{if($('#mc-to',b).value||$('#mc-subject',b).value||$('#mc-body',b).value)await saveDraft();$('#mail-compose-panel',b).classList.add('hidden');}catch(e){$('#mc-status',b).textContent='Brouillon non enregistré : '+e.message;}};$('#mc-save-draft',b).onclick=async()=>{try{await saveDraft();}catch(e){$('#mc-status',b).textContent=e.message;}};
  $('#mail-settings',b).onclick=()=>$('#mail-account-panel',b).classList.remove('hidden');$('#ma-close',b).onclick=()=>$('#mail-account-panel',b).classList.add('hidden');
  $('#ma-save',b).onclick=async()=>{const account={name:$('#ma-name',b).value,email:$('#ma-email',b).value,username:$('#ma-user',b).value||$('#ma-email',b).value,password:$('#ma-pass',b).value,imap_host:$('#ma-imap',b).value,imap_port:$('#ma-ip',b).value,imap_security:$('#ma-is',b).value,smtp_host:$('#ma-smtp',b).value,smtp_port:$('#ma-sp',b).value,smtp_security:$('#ma-ss',b).value};try{await api('/api/mail/account/save',{account});$('#ma-pass',b).value='';$('#ma-status',b).textContent='Compte enregistré. Mot de passe chiffré localement.';await loadAccounts();}catch(e){$('#ma-status',b).textContent=e.message;}};
  const attachmentInput=$('#mc-files',b),attachmentInfo=$('#mc-files-info',b);attachmentInput.onchange=()=>{const files=[...attachmentInput.files],total=files.reduce((n,f)=>n+f.size,0);if(files.length>5||files.some(f=>f.size>5*1024*1024)||total>10*1024*1024){attachmentInput.value='';attachmentInfo.textContent='Limite dépassée : 5 fichiers, 5 Mo chacun, 10 Mo au total.';return;}attachmentInfo.textContent=files.length?files.map(f=>f.name+' ('+fmtSize(f.size)+')').join(' · '):'Aucune pièce jointe sélectionnée.';};
  const fileToBase64=async file=>{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);};
  $('#mc-send',b).onclick=async()=>{if(!selected()){$('#mc-status',b).textContent='Ajoutez et sélectionnez un compte.';return;}$('#mc-send',b).disabled=true;$('#mc-status',b).textContent='Préparation des pièces jointes…';try{const attachments=await Promise.all([...attachmentInput.files].map(async f=>({name:f.name,data:await fileToBase64(f)})));await api('/api/mail/send',{id:selected(),message:{to:$('#mc-to',b).value,subject:$('#mc-subject',b).value,body:$('#mc-body',b).value,attachments}});let draftWarning='';if(draftId){try{await api('/api/mail/draft/delete',{id:draftId});}catch(e){draftWarning=' Le brouillon enregistré n’a pas pu être supprimé.';}}draftId='';$('#mc-status',b).textContent='Message envoyé.'+draftWarning;$('#mc-to',b).value='';$('#mc-subject',b).value='';$('#mc-body',b).value='';attachmentInput.value='';attachmentInfo.textContent='Aucune pièce jointe sélectionnée.';}catch(e){$('#mc-status',b).textContent=e.message;}finally{$('#mc-send',b).disabled=false;}};
  await loadAccounts().catch(e=>{list.textContent=e.message;});if(accounts.length)await inbox();
} };
APPS.textedit = { title: 'TextEdit', icon: 'fa-pen-to-square', w: 560, h: 400, render(b, w, o) {
  const tool = el('div', 'tool', `<input class="t sp" id="p" style="flex:1" placeholder="/chemin/fichier.txt" value="${esc(o.path || '')}"><button class="pri b" id="sv"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button><small id="st"></small>`);
  const ta = el('textarea', 't edit'); ta.spellcheck = false;
  b.append(tool, ta);
  const st = $('#st', tool);
  if (o.path) sys('fs.read', { path: o.path }).then(t => ta.value = t).catch(e => st.textContent = e.message);
  $('#sv', tool).onclick = () => sys('fs.write', { path: $('#p', tool).value, content: ta.value }).then(() => st.textContent = 'Enregistré ✓').catch(e => st.textContent = e.message);
} };

APPS.terminal = { title: 'Terminal', icon: 'fa-terminal', w: 620, h: 400, render(b) {
  const t = el('div', 'term'); b.append(t);
  let cwd = '/', hist = [], hi = 0;
  const out = el('span'); t.append(out);
  out.textContent = 'Weed Shell (wsh) - tapez "help"\n';
  const prompt = () => {
    const l = el('div', '', `<span class="p">weed:${esc(cwd)}$</span> <input autocomplete="off" spellcheck="false">`); t.append(l);
    const i = $('input', l); i.focus();
    i.onkeydown = async e => {
      if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); i.value = hist[hi] || ''; e.preventDefault(); }
      if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); i.value = hist[hi] || ''; }
      if (e.key !== 'Enter') return;
      const line = i.value; i.disabled = true; i.replaceWith(document.createTextNode(line));
      if (line.trim()) { hist.push(line); hi = hist.length; }
      try {
        const r = await sys('shell.exec', { line, cwd }); cwd = r.cwd;
        if (r.out === '\f') t.innerHTML = ''; else if (r.out) t.append(el('div', '', esc(r.out)));
      } catch (x) { t.append(el('div', 'err', esc(x.message))); }
      prompt(); t.scrollTop = t.scrollHeight;
    };
  };
  t.onclick = () => $('input:not(:disabled)', t)?.focus();
  prompt();
} };

APPS.monitor = { title: 'Moniteur système', icon: 'fa-gauge-high', w: 620, h: 540, render(b, w) {
  const box = el('div', 'pad'); b.append(box);
  let busy = false;
  async function tick() {
    if (!document.body.contains(b)) return clearInterval(iv);
    if (busy) return;
    busy = true;
    try {
      const [i, p, m] = await Promise.all([sys('sys.info'), sys('proc.list'), sys('system.metrics')]);
      const mem = m.memory || {};
      const memoryPct = mem.total ? Math.min(100, Math.round((mem.used / mem.total) * 100)) : 0;
      const swapPct = mem.swap_total ? Math.min(100, Math.round(((mem.swap_total - mem.swap_free) / mem.swap_total) * 100)) : 0;
      const load = Array.isArray(m.load_average) ? m.load_average.map(x => Number(x).toFixed(2)).join(' / ') : 'n/d';
      const diskRows = Object.entries(m.disks || {}).map(([name, d]) => {
        const pct = d.total ? Math.min(100, Math.round(d.used / d.total * 100)) : 0;
        return `<div class="pad" style="padding:8px 0"><div class="row"><b class="sp">${esc(name === 'data' ? 'Données Weed' : 'Système')}</b><small>${fmtSize(d.free)} libres / ${fmtSize(d.total)}</small></div><div style="height:7px;background:var(--line);border-radius:8px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent)"></div></div></div>`;
      }).join('');
      box.innerHTML = `<div class="kv"><b>Système</b><span>${esc(i.os)} ${esc(i.version)}</span><b>Hôte</b><span>${esc(i.host)}</span><b>Architecture</b><span>${esc(i.uname)}</span><b>PHP</b><span>${esc(i.php)}</span><b>Processeurs logiques</b><span>${Number(m.cpu_count || 1)}</span><b>Charge moyenne (1/5/15 min)</b><span>${esc(load)}</span><b>Temps actif</b><span>${fmtDur(m.uptime_seconds || i.uptime)}</span></div>
      <h3 style="margin:16px 0 6px">Mémoire vive</h3><div class="row"><b class="sp">${fmtSize(mem.used || 0)} utilisés</b><small>${memoryPct}% · ${fmtSize(mem.total || 0)}</small></div><div style="height:9px;background:var(--line);border-radius:8px;overflow:hidden"><div style="height:100%;width:${memoryPct}%;background:var(--accent)"></div></div>
      <div class="row" style="margin-top:8px"><b class="sp">Swap</b><small>${swapPct}% · ${fmtSize(mem.swap_total || 0)}</small></div><div style="height:7px;background:var(--line);border-radius:8px;overflow:hidden"><div style="height:100%;width:${swapPct}%;background:var(--accent)"></div></div>
      <h3 style="margin:16px 0 6px">Stockage</h3>${diskRows || '<small>Informations de stockage indisponibles.</small>'}
      <h3 style="margin:16px 0 6px">Services Weed OS</h3><div class="row"><b class="sp">Service</b><b>PID</b><b style="width:90px;text-align:right">État</b></div>` +
        (p.procs || []).map(x => `<div class="row"><span class="sp">${esc(x.name)}</span><small>${Number(x.pid) || '—'}</small><span class="badge ${x.state === 'running' ? 'on' : ''}" style="width:78px;text-align:center">${esc(x.state)}</span></div>`).join('') +
        `<small style="display:block;margin-top:12px;opacity:.7">Actualisé : ${new Date(m.sampled_at * 1000).toLocaleTimeString()}</small>`;
    } catch (e) { box.innerHTML = `<div class="pad err">${esc(e.message)}</div>`; }
    finally { busy = false; }
  }
  tick(); const iv = setInterval(tick, 3000);
} };

APPS.processes = { title: 'Processus', icon: 'fa-list-check', w: 680, h: 520, async render(b) {
  const root = el('div', 'pad'); b.append(root);
  let busy = false;
  async function refresh() {
    if (!document.body.contains(b) || busy) return;
    busy = true;
    try {
      const data = await sys('proc.inventory');
      const rows = data.processes || [];
      root.innerHTML = `<div class="row"><div class="sp"><h2 style="margin:0">Processus système</h2><small>${Number(data.count || 0)} processus détectés · lecture seule</small></div><button class="b" id="proc-refresh"><i class="fa-solid fa-rotate"></i> Actualiser</button></div><p class="settings-hint">Cette vue consulte /proc en PHP. Elle n'envoie aucun signal et ne permet pas d'arrêter un processus.</p><div style="max-height:350px;overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">PID</th><th style="text-align:left">Nom</th><th style="text-align:left">État</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${Number(p.pid)||'—'}</td><td>${esc(p.name)}</td><td>${esc(p.state)}</td></tr>`).join('')}</tbody></table></div><small>Dernière lecture : ${new Date((data.sampled_at||0)*1000).toLocaleTimeString()}</small>`;
      $('#proc-refresh', root).onclick = refresh;
      if (!data.available) root.insertAdjacentHTML('beforeend','<p class="err">/proc indisponible sur cet environnement.</p>');
    } catch (e) { root.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    finally { busy = false; }
  }
  await refresh();
} };

APPS.services = { title: 'Services système', icon: 'fa-gears', w: 650, h: 500, async render(b) {
  const root = el('div', 'pad'); b.append(root);
  const words = {fr:['Services système','Inventaire des scripts init.d disponibles. Consultation uniquement : aucune commande de démarrage ou d’arrêt n’est exécutée.','Actualiser','Aucun service détecté','Exécutable','Non exécutable'],en:['System services','Inventory of available init.d scripts. Read-only: no start or stop command is executed.','Refresh','No services detected','Executable','Not executable'],es:['Servicios del sistema','Inventario de scripts init.d disponibles. Solo lectura: no se ejecutan comandos de inicio o parada.','Actualizar','No se detectaron servicios','Ejecutable','No ejecutable'],de:['Systemdienste','Übersicht verfügbarer init.d-Skripte. Nur lesend: es werden keine Start- oder Stoppbefehle ausgeführt.','Aktualisieren','Keine Dienste gefunden','Ausführbar','Nicht ausführbar'],pt:['Serviços do sistema','Inventário dos scripts init.d disponíveis. Apenas leitura: nenhum comando de início ou paragem é executado.','Atualizar','Nenhum serviço encontrado','Executável','Não executável'],mg:['Serivisy rafitra','Lisitr’ireo script init.d misy. Fijerena ihany: tsy misy baiko fanombohana na fampitsaharana alefa.','Havaozy','Tsy nahita serivisy','Azo alefa','Tsy azo alefa'],ar:['خدمات النظام','قائمة نصوص init.d المتاحة. للقراءة فقط: لا يتم تنفيذ أوامر بدء أو إيقاف.','تحديث','لم يتم العثور على خدمات','قابل للتنفيذ','غير قابل للتنفيذ'],zh:['系统服务','可用 init.d 脚本列表。只读模式：不会执行启动或停止命令。','刷新','未检测到服务','可执行','不可执行'],hi:['सिस्टम सेवाएँ','उपलब्ध init.d स्क्रिप्ट की सूची। केवल पढ़ने के लिए: कोई प्रारंभ या बंद आदेश नहीं चलता।','रीफ़्रेश','कोई सेवा नहीं मिली','चलाने योग्य','चलाने योग्य नहीं']}[store.get('ui.lang','fr')] || ['Services système','Inventaire en lecture seule.','Actualiser','Aucun service détecté','Exécutable','Non exécutable'];
  async function refresh() { root.innerHTML = `<div class="row"><h2 class="sp" style="margin:0">${words[0]}</h2><button class="b" id="svc-refresh">${words[2]}</button></div><p class="settings-hint">${words[1]}</p><div id="svc-list">Chargement…</div>`; $('#svc-refresh',root).onclick=refresh; try { const d=await sys('service.inventory'); const rows=d.services||[]; $('#svc-list',root).innerHTML=rows.length?`<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Service</th><th style="text-align:left">État du script</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.executable?words[4]:words[5]}</td></tr>`).join('')}</tbody></table>`:`<p>${words[3]}</p>`; } catch(e) { $('#svc-list',root).textContent=e.message; } }
  await refresh();
} };

APPS.startup = { title: 'Applications au démarrage', icon: 'fa-rocket', w: 650, h: 500, async render(b) {
  const root = el('div','pad'); b.append(root);
  const lang=store.get('ui.lang','fr');
  const L={fr:['Applications au démarrage','Inventaire des entrées XDG Autostart. Consultation uniquement : aucune application n’est lancée ou modifiée.','Actualiser','Aucune entrée détectée','Application','Source','État','Activée','Désactivée','Commande présente','Commande absente','Système','Utilisateur'],en:['Startup applications','Inventory of XDG Autostart entries. Read-only: no application is launched or changed.','Refresh','No entries detected','Application','Source','State','Enabled','Disabled','Command present','Command missing','System','User'],es:['Aplicaciones de inicio','Inventario XDG Autostart. Solo lectura: no se inicia ni modifica ninguna aplicación.','Actualizar','No se detectaron entradas','Aplicación','Origen','Estado','Activada','Desactivada','Comando presente','Comando ausente','Sistema','Usuario'],de:['Autostart-Anwendungen','Übersicht der XDG-Autostart-Einträge. Nur lesend: keine Anwendung wird gestartet oder geändert.','Aktualisieren','Keine Einträge gefunden','Anwendung','Quelle','Status','Aktiviert','Deaktiviert','Befehl vorhanden','Befehl fehlt','System','Benutzer'],pt:['Aplicações de arranque','Inventário XDG Autostart. Apenas leitura: nenhuma aplicação é iniciada ou alterada.','Atualizar','Nenhuma entrada encontrada','Aplicação','Origem','Estado','Ativada','Desativada','Comando presente','Comando ausente','Sistema','Utilizador'],mg:['Fampiharana amin’ny fanombohana','Lisitra XDG Autostart. Fijerena ihany: tsy misy fampiharana alefa na ovaina.','Havaozy','Tsy nahita singa','Fampiharana','Loharano','Toe-javatra','Mavitrika','Tsy mavitrika','Misy baiko','Tsy misy baiko','Rafitra','Mpampiasa'],ar:['تطبيقات بدء التشغيل','قائمة XDG Autostart للقراءة فقط. لا يتم تشغيل التطبيقات أو تعديلها.','تحديث','لا توجد عناصر','التطبيق','المصدر','الحالة','مفعّل','معطّل','الأمر موجود','الأمر غير موجود','النظام','المستخدم'],zh:['启动应用','XDG Autostart 条目列表。只读：不会启动或修改任何应用。','刷新','未检测到条目','应用','来源','状态','已启用','已禁用','命令存在','缺少命令','系统','用户'],hi:['स्टार्टअप ऐप्स','XDG Autostart प्रविष्टियों की सूची। केवल पढ़ने के लिए: कोई ऐप शुरू या बदला नहीं जाता।','रीफ़्रेश','कोई प्रविष्टि नहीं मिली','ऐप','स्रोत','स्थिति','सक्षम','अक्षम','कमांड मौजूद','कमांड अनुपस्थित','सिस्टम','उपयोगकर्ता']}[lang]||['Startup applications','Read-only inventory.','Refresh','No entries','Application','Source','State','Enabled','Disabled','Command present','Command missing','System','User'];
  async function refresh(){root.innerHTML=`<div class="row"><h2 class="sp" style="margin:0">${L[0]}</h2><button class="b" id="startup-refresh">${L[2]}</button></div><p class="settings-hint">${L[1]}</p><div id="startup-list">Loading…</div>`;$('#startup-refresh',root).onclick=refresh;try{const d=await sys('startup.inventory');const rows=d.items||[];$('#startup-list',root).innerHTML=rows.length?`<div style="max-height:350px;overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">${L[4]}</th><th>${L[5]}</th><th>${L[6]}</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.name)}<br><small>${x.command_present?L[9]:L[10]}</small></td><td>${x.source==='system'?L[11]:L[12]}</td><td>${x.enabled?L[7]:L[8]}</td></tr>`).join('')}</tbody></table></div><small>${Number(d.count)||0} entrées · ${new Date((d.sampled_at||0)*1000).toLocaleTimeString()}</small>`:`<p>${L[3]}</p>`;}catch(e){$('#startup-list',root).textContent=e.message;}}
  await refresh();
} };

APPS.sessions = { title: 'Sessions utilisateur', icon: 'fa-user-clock', w: 620, h: 480, async render(b) {
  const root=el('div','pad'); b.append(root);
  const lang=store.get('ui.lang','fr');
  const W={fr:['Sessions utilisateur','Inventaire des sessions locales. Les jetons et identifiants techniques ne sont jamais affichés.','Actualiser','Utilisateur','Expiration','État','Active','Expirée','Aucune session'],en:['User sessions','Local session inventory. Tokens and technical identifiers are never displayed.','Refresh','User','Expires','Status','Active','Expired','No sessions'],es:['Sesiones de usuario','Inventario local. Nunca se muestran tokens ni identificadores técnicos.','Actualizar','Usuario','Caduca','Estado','Activa','Caducada','Sin sesiones'],de:['Benutzersitzungen','Lokale Übersicht. Tokens und technische Kennungen werden nie angezeigt.','Aktualisieren','Benutzer','Läuft ab','Status','Aktiv','Abgelaufen','Keine Sitzungen'],pt:['Sessões de utilizador','Inventário local. Os tokens e identificadores técnicos nunca são exibidos.','Atualizar','Utilizador','Expira','Estado','Ativa','Expirada','Sem sessões'],mg:['Fotoam-pidiran’ny mpampiasa','Lisitra eo an-toerana. Tsy aseho mihitsy ny token na famantarana teknika.','Havaozy','Mpampiasa','Lany daty','Toe-javatra','Mavitrika','Lany daty','Tsy misy session'],ar:['جلسات المستخدم','قائمة محلية. لا يتم عرض الرموز أو المعرفات التقنية.','تحديث','المستخدم','تنتهي','الحالة','نشطة','منتهية','لا توجد جلسات'],zh:['用户会话','本地会话清单。不会显示令牌或技术标识。','刷新','用户','到期时间','状态','活动','已过期','没有会话'],hi:['उपयोगकर्ता सत्र','स्थानीय सूची। टोकन और तकनीकी पहचान कभी नहीं दिखाई जाती।','रीफ़्रेश','उपयोगकर्ता','समाप्ति','स्थिति','सक्रिय','समाप्त','कोई सत्र नहीं']}[lang]||['User sessions','Read-only inventory.','Refresh','User','Expires','Status','Active','Expired','No sessions'];
  async function refresh(){root.innerHTML=`<div class="row"><h2 class="sp" style="margin:0">${W[0]}</h2><button class="b" id="sess-refresh">${W[2]}</button></div><p class="settings-hint">${W[1]}</p><div id="sess-list">…</div>`;$('#sess-refresh',root).onclick=refresh;try{const d=await sys('session.inventory');$('#sess-list',root).innerHTML=d.sessions?.length?`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th>${W[3]}</th><th>${W[4]}</th><th>${W[5]}</th></tr></thead><tbody>${d.sessions.map(x=>`<tr><td>${esc(x.user)}</td><td>${new Date(x.expires_at*1000).toLocaleString()}</td><td>${x.status==='active'?W[6]:W[7]}</td></tr>`).join('')}</tbody></table></div><small>${d.active||0} / ${d.count||0} · lecture seule</small>`:W[8];}catch(e){$('#sess-list',root).textContent=e.message;}}
  await refresh();
} };

APPS.eventlog = { title: 'Historique système', icon: 'fa-clock-rotate-left', w: 650, h: 520, async render(b) {
  const root=el('div','pad'); b.append(root);
  const lang=store.get('ui.lang','fr');
  const W={fr:['Historique de sécurité','Événements récents liés aux comptes. Les mots de passe, jetons, adresses et contextes sensibles sont exclus.','Actualiser','Événement','Utilisateur','Date','Aucun événement'],en:['Security history','Recent account events. Passwords, tokens, addresses and sensitive context are excluded.','Refresh','Event','User','Date','No events'],es:['Historial de seguridad','Eventos recientes de cuentas. Se excluyen contraseñas, tokens, direcciones y datos sensibles.','Actualizar','Evento','Usuario','Fecha','Sin eventos'],de:['Sicherheitsverlauf','Letzte Kontoereignisse. Passwörter, Tokens, Adressen und sensible Daten werden ausgeschlossen.','Aktualisieren','Ereignis','Benutzer','Datum','Keine Ereignisse'],pt:['Histórico de segurança','Eventos recentes das contas. Palavras-passe, tokens, endereços e dados sensíveis são excluídos.','Atualizar','Evento','Utilizador','Data','Sem eventos'],mg:['Tantaran’ny fiarovana','Hetsika farany amin’ny kaonty. Tsy aseho ny tenimiafina, token, adiresy na angona saro-pady.','Havaozy','Hetsika','Mpampiasa','Daty','Tsy misy hetsika'],ar:['سجل الأمان','أحداث الحساب الأخيرة. يتم استبعاد كلمات المرور والرموز والعناوين والبيانات الحساسة.','تحديث','الحدث','المستخدم','التاريخ','لا توجد أحداث'],zh:['安全历史','近期账户事件。不包含密码、令牌、地址或敏感上下文。','刷新','事件','用户','日期','没有事件'],hi:['सुरक्षा इतिहास','हाल की खाता गतिविधियाँ। पासवर्ड, टोकन, पते और संवेदनशील संदर्भ शामिल नहीं हैं।','रीफ़्रेश','घटना','उपयोगकर्ता','तिथि','कोई घटना नहीं']}[lang]||['Security history','Read-only.','Refresh','Event','User','Date','No events'];
  async function refresh(){root.innerHTML=`<div class="row"><h2 class="sp" style="margin:0">${W[0]}</h2><button class="b" id="log-refresh">${W[2]}</button></div><p class="settings-hint">${W[1]}</p><div id="log-list">…</div>`;$('#log-refresh',root).onclick=refresh;try{const d=await sys('eventlog.list');const labels={USER_CREATED:'Création de compte',USER_REMOVED:'Suppression de compte',PASSWORD_CHANGED:'Mot de passe modifié',LOGIN_FAILURE:'Échec de connexion',LOGIN_SUCCESS:'Connexion réussie'};$('#log-list',root).innerHTML=d.events?.length?d.events.map(x=>`<article class="settings-card" style="margin-top:8px"><div class="row"><b class="sp">${esc(labels[x.event]||x.event)}</b><small>${esc(new Date(x.time).toLocaleString())}</small></div><small>${W[4]} : ${esc(x.user||'—')}</small></article>`).join(''):W[6];}catch(e){$('#log-list',root).textContent=e.message;}}
  await refresh();
} };



APPS.apppermissions = { title: 'Permissions des applications', icon: 'fa-shield-halved', w: 680, h: 520, async render(b) {
  const root=el('div','pad'); b.append(root); const lang=store.get('ui.lang','fr');
  const T={fr:['Permissions des applications','Inventaire des permissions déclarées dans les manifestes. Une déclaration ne constitue pas une autorisation supplémentaire.','Actualiser','Application','État','Permissions déclarées','Activée','Désactivée','Aucune application installée','Aucune permission déclarée'],en:['Application permissions','Inventory of permissions declared in manifests. A declaration does not grant additional access.','Refresh','Application','State','Declared permissions','Enabled','Disabled','No installed applications','No permissions declared'],es:['Permisos de aplicaciones','Inventario de permisos declarados. Una declaración no concede acceso adicional.','Actualizar','Aplicación','Estado','Permisos declarados','Activada','Desactivada','No hay aplicaciones instaladas','No hay permisos declarados'],de:['App-Berechtigungen','Übersicht der deklarierten Berechtigungen. Eine Deklaration gewährt keinen zusätzlichen Zugriff.','Aktualisieren','Anwendung','Status','Deklarierte Berechtigungen','Aktiviert','Deaktiviert','Keine Apps installiert','Keine Berechtigungen deklariert'],pt:['Permissões das aplicações','Inventário das permissões declaradas. Uma declaração não concede acesso adicional.','Atualizar','Aplicação','Estado','Permissões declaradas','Ativada','Desativada','Nenhuma aplicação instalada','Nenhuma permissão declarada'],mg:['Fahazoan-dalan’ny rindranasa','Lisitr’ireo fahazoan-dalana voasoratra. Tsy manome fidirana fanampiny ny fanambarana.','Havaozy','Rindranasa','Toe-javatra','Fahazoan-dalana voasoratra','Mavitrika','Tsy mavitrika','Tsy misy rindranasa napetraka','Tsy misy fahazoan-dalana'],ar:['أذونات التطبيقات','قائمة الأذونات المعلنة. الإعلان لا يمنح وصولاً إضافياً.','تحديث','التطبيق','الحالة','الأذونات المعلنة','مفعّل','معطّل','لا توجد تطبيقات مثبتة','لا توجد أذونات معلنة'],zh:['应用权限','清单中声明的权限。声明本身不会授予额外访问权限。','刷新','应用','状态','已声明权限','已启用','已禁用','没有已安装的应用','没有声明权限'],hi:['ऐप अनुमतियाँ','मैनिफ़ेस्ट में घोषित अनुमतियों की सूची। घोषणा से अतिरिक्त पहुँच नहीं मिलती।','रीफ़्रेश','ऐप','स्थिति','घोषित अनुमतियाँ','सक्षम','अक्षम','कोई ऐप इंस्टॉल नहीं','कोई अनुमति घोषित नहीं']}[lang]||['Application permissions','Read-only declared permissions.','Refresh','Application','State','Declared permissions','Enabled','Disabled','No installed applications','No permissions declared'];
  async function refresh(){root.innerHTML=`<div class="row"><h2 class="sp" style="margin:0">${T[0]}</h2><button class="b" id="appperm-refresh">${T[2]}</button></div><p class="settings-hint">${T[1]}</p><div id="appperm-list">…</div>`;$('#appperm-refresh',root).onclick=refresh;try{const d=await sys('app.permissions');const rows=d.items||[];$('#appperm-list',root).innerHTML=rows.length?rows.map(x=>`<article class="settings-card" style="margin-top:9px"><div class="row"><b class="sp">${esc(x.name)}</b><small>${x.enabled?T[6]:T[7]}</small></div><small>${esc(x.id)} · ${Number(x.permission_count)||0} ${T[5].toLowerCase()}</small>${x.permissions?.length?`<ul>${x.permissions.map(p=>`<li><code>${esc(p)}</code></li>`).join('')}</ul>`:`<p class="settings-hint">${T[9]}</p>`}</article>`).join(''):T[8];}catch(e){$('#appperm-list',root).textContent=e.message;}}
  await refresh();
} };

APPS.users = { title: 'Utilisateurs et comptes', icon: 'fa-users-gear', w: 700, h: 560, async render(b) {
  const root=el('div','pad'); b.append(root); const lang=store.get('ui.lang','fr');
  const T={
    fr:['Utilisateurs et comptes','Gestion des comptes Weed OS. Réservé aux administrateurs. Les mots de passe ne sont jamais affichés.','Nom du compte','Mot de passe','Rôle','Utilisateur','Administrateur','Créer le compte','Actualiser','Compte','Créé le','Action','Supprimer','Aucun compte','Compte créé.','Compte supprimé.','Confirmer la suppression de ce compte ?','Le nom doit contenir 3 à 20 caractères : a-z, 0-9, _ ; commencer par une lettre.','Mot de passe : 6 caractères minimum.'],
    en:['Users and accounts','Manage Weed OS accounts. Administrators only. Passwords are never displayed.','Account name','Password','Role','User','Administrator','Create account','Refresh','Account','Created','Action','Remove','No accounts','Account created.','Account removed.','Remove this account?','Use 3–20 characters: a-z, 0-9, _ ; start with a letter.','Password must contain at least 6 characters.'],
    es:['Usuarios y cuentas','Gestiona las cuentas de Weed OS. Solo administradores. Las contraseñas nunca se muestran.','Nombre de cuenta','Contraseña','Rol','Usuario','Administrador','Crear cuenta','Actualizar','Cuenta','Creada','Acción','Eliminar','No hay cuentas','Cuenta creada.','Cuenta eliminada.','¿Eliminar esta cuenta?','Usa 3–20 caracteres: a-z, 0-9, _ ; empieza con una letra.','La contraseña debe tener al menos 6 caracteres.'],
    de:['Benutzer und Konten','Weed-OS-Konten verwalten. Nur Administratoren. Passwörter werden nie angezeigt.','Kontoname','Passwort','Rolle','Benutzer','Administrator','Konto erstellen','Aktualisieren','Konto','Erstellt','Aktion','Entfernen','Keine Konten','Konto erstellt.','Konto entfernt.','Dieses Konto entfernen?','3–20 Zeichen: a-z, 0-9, _ ; beginnt mit einem Buchstaben.','Passwort mindestens 6 Zeichen.'],
    pt:['Utilizadores e contas','Gerir contas Weed OS. Apenas administradores. As palavras-passe nunca são exibidas.','Nome da conta','Palavra-passe','Função','Utilizador','Administrador','Criar conta','Atualizar','Conta','Criada','Ação','Remover','Sem contas','Conta criada.','Conta removida.','Remover esta conta?','Use 3–20 caracteres: a-z, 0-9, _ ; comece com uma letra.','A palavra-passe deve ter pelo menos 6 caracteres.'],
    mg:['Mpampiasa sy kaonty','Fitantanana kaonty Weed OS. Ho an’ny administratera ihany. Tsy aseho mihitsy ny tenimiafina.','Anaran-kaonty','Tenimiafina','Andraikitra','Mpampiasa','Administratera','Mamorona kaonty','Havaozy','Kaonty','Noforonina','Asa','Fafao','Tsy misy kaonty','Voaforona ny kaonty.','Voafafa ny kaonty.','Fafana ve ity kaonty ity?','Litera a-z, isa 0-9 ary _; 3–20 tarehintsoratra, manomboka amin’ny litera.','Tsy maintsy manana tarehintsoratra 6 farafahakeliny ny tenimiafina.'],
    ar:['المستخدمون والحسابات','إدارة حسابات Weed OS. للمسؤولين فقط. لا يتم عرض كلمات المرور مطلقاً.','اسم الحساب','كلمة المرور','الدور','مستخدم','مسؤول','إنشاء حساب','تحديث','الحساب','تاريخ الإنشاء','إجراء','حذف','لا توجد حسابات','تم إنشاء الحساب.','تم حذف الحساب.','هل تريد حذف هذا الحساب؟','استخدم 3–20 حرفاً: a-z و0-9 و _ ، ويبدأ بحرف.','يجب ألا تقل كلمة المرور عن 6 أحرف.'],
    zh:['用户与账户','管理 Weed OS 账户。仅限管理员。绝不显示密码。','账户名称','密码','角色','用户','管理员','创建账户','刷新','账户','创建时间','操作','删除','没有账户','账户已创建。','账户已删除。','确定删除此账户？','使用 3–20 个字符：a-z、0-9、_，并以字母开头。','密码至少需要 6 个字符。'],
    hi:['उपयोगकर्ता और खाते','Weed OS खातों का प्रबंधन। केवल व्यवस्थापक। पासवर्ड कभी प्रदर्शित नहीं होते।','खाता नाम','पासवर्ड','भूमिका','उपयोगकर्ता','व्यवस्थापक','खाता बनाएँ','रीफ़्रेश','खाता','बनाया गया','कार्रवाई','हटाएँ','कोई खाता नहीं','खाता बनाया गया।','खाता हटाया गया।','क्या यह खाता हटाएँ?','3–20 अक्षर: a-z, 0-9, _ और शुरुआत अक्षर से।','पासवर्ड कम से कम 6 अक्षरों का होना चाहिए.']
  }[lang]||['Users and accounts','Administrator-only account management.','Account name','Password','Role','User','Administrator','Create account','Refresh','Account','Created','Action','Remove','No accounts','Created.','Removed.','Remove this account?','Invalid name.','Password too short.'];
  const notice=(msg,bad=false)=>{const n=$('#users-notice',root);if(n){n.textContent=msg;n.className=bad?'err':'settings-hint';}};
  async function refresh(){
    root.innerHTML=`<h2 style="margin-top:0">${T[0]}</h2><p class="settings-hint">${T[1]}</p><form id="users-form" class="settings-card" style="display:grid;gap:9px"><label>${T[2]}<input class="t" name="name" required minlength="3" maxlength="20" pattern="[a-zA-Z][a-zA-Z0-9_]{2,19}" autocomplete="off"></label><label>${T[3]}<input class="t" name="pass" type="password" required minlength="6" autocomplete="new-password"></label><label>${T[4]}<select class="t" name="role"><option value="user">${T[5]}</option><option value="admin">${T[6]}</option></select></label><button class="b" type="submit">${T[7]}</button></form><div class="row" style="margin-top:14px"><h3 class="sp">${T[9]}</h3><button class="b" id="users-refresh">${T[8]}</button></div><p id="users-notice" class="settings-hint" role="status"></p><div id="users-list">…</div>`;
    $('#users-refresh',root).onclick=refresh;
    $('#users-form',root).onsubmit=async ev=>{ev.preventDefault();const f=ev.currentTarget;const data=new FormData(f);try{await sys('user.add',{name:String(data.get('name')).toLowerCase(),pass:String(data.get('pass')),role:String(data.get('role'))});f.reset();notice(T[14]);await loadUsers();}catch(e){notice(e.message,true);}};
    await loadUsers();
  }
  async function loadUsers(){try{const [d,info]=await Promise.all([sys('user.list'),sys('sys.info')]);const current=info?.user?.name||'';const rows=Array.isArray(d)?d:[];$('#users-list',root).innerHTML=rows.length?`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">${T[9]}</th><th>${T[4]}</th><th>${T[10]}</th><th>${T[11]}</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td>${x.role==='admin'?T[6]:T[5]}</td><td>${esc(new Date(Number(x.created)*1000).toLocaleDateString())}</td><td>${x.name===current?'—':`<button class="b danger" data-remove="${esc(x.name)}">${T[12]}</button>`}</td></tr>`).join('')}</tbody></table></div>`:T[13];$$('[data-remove]',root).forEach(btn=>btn.onclick=async()=>{const name=btn.dataset.remove;if(!confirm(T[16]))return;try{await sys('user.remove',{name});notice(T[15]);await loadUsers();}catch(e){notice(e.message,true);}});}catch(e){$('#users-list',root).textContent=e.message;}}
  await refresh();
} };

APPS.storage = { title: 'Stockage et volumes', icon: 'fa-hard-drive', w: 700, h: 540, async render(b) {
  const root=el('div','pad'); b.append(root); const lang=store.get('ui.lang','fr');
  const L={
    fr:['Stockage et volumes','Inventaire des systèmes de fichiers montés. Consultation uniquement : aucune partition n’est créée, montée, démontée ou formatée.','Actualiser','Point de montage','Système de fichiers','Utilisé','Libre','Total','Lecture seule','Pseudo-volume','Espace indisponible','Aucun volume détecté'],
    en:['Storage and volumes','Inventory of mounted filesystems. Read-only: no partition is created, mounted, unmounted or formatted.','Refresh','Mount point','Filesystem','Used','Free','Total','Read-only','Pseudo volume','Space unavailable','No volumes detected'],
    es:['Almacenamiento y volúmenes','Inventario de sistemas de archivos montados. Solo lectura: no se crean, montan, desmontan ni formatean particiones.','Actualizar','Punto de montaje','Sistema de archivos','Usado','Libre','Total','Solo lectura','Volumen virtual','Espacio no disponible','No se detectaron volúmenes'],
    de:['Speicher und Datenträger','Übersicht eingehängter Dateisysteme. Nur lesend: keine Partition wird erstellt, ein- oder ausgehängt oder formatiert.','Aktualisieren','Einhängepunkt','Dateisystem','Belegt','Frei','Gesamt','Schreibgeschützt','Pseudo-Volume','Speicher nicht verfügbar','Keine Datenträger gefunden'],
    pt:['Armazenamento e volumes','Inventário dos sistemas de ficheiros montados. Apenas leitura: nenhuma partição é criada, montada, desmontada ou formatada.','Atualizar','Ponto de montagem','Sistema de ficheiros','Usado','Livre','Total','Só de leitura','Volume virtual','Espaço indisponível','Nenhum volume encontrado'],
    mg:['Tahiry sy volume','Lisitr’ireo rafitra rakitra efa napetraka. Fijerena ihany: tsy misy partition foronina, apetraka, esorina na formaté.','Havaozy','Toerana fametrahana','Rafitra rakitra','Ampiasaina','Malalaka','Fitambarany','Vakiana ihany','Volume virtoaly','Tsy misy toerana','Tsy nahita volume'],
    ar:['التخزين ووحدات التخزين','قائمة أنظمة الملفات المركّبة. للقراءة فقط: لا يتم إنشاء الأقسام أو تركيبها أو إلغاء تركيبها أو تهيئتها.','تحديث','نقطة التركيب','نظام الملفات','المستخدم','المتاح','الإجمالي','للقراءة فقط','وحدة افتراضية','المساحة غير متاحة','لم يتم العثور على وحدات'],
    zh:['存储与卷','已挂载文件系统清单。只读：不会创建、挂载、卸载或格式化分区。','刷新','挂载点','文件系统','已用','可用','总计','只读','伪卷','空间不可用','未检测到卷'],
    hi:['स्टोरेज और वॉल्यूम','माउंट किए गए फ़ाइल सिस्टम की सूची। केवल पढ़ने के लिए: कोई पार्टीशन बनाया, माउंट, अनमाउंट या फ़ॉर्मेट नहीं किया जाता।','रीफ़्रेश','माउंट पॉइंट','फ़ाइल सिस्टम','उपयोग किया','खाली','कुल','केवल पढ़ने के लिए','वर्चुअल वॉल्यूम','स्थान उपलब्ध नहीं','कोई वॉल्यूम नहीं मिला']
  }[lang]||['Storage and volumes','Read-only mounted filesystem inventory.','Refresh','Mount point','Filesystem','Used','Free','Total','Read-only','Pseudo volume','Space unavailable','No volumes detected'];
  const size=n=>{n=Number(n)||0;const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++;}return n.toFixed(i?1:0)+' '+u[i];};
  async function refresh(){root.innerHTML=`<div class="row"><h2 class="sp" style="margin:0">${L[0]}</h2><button class="b" id="storage-refresh">${L[2]}</button></div><p class="settings-hint">${L[1]}</p><div id="storage-list">…</div>`;$('#storage-refresh',root).onclick=refresh;try{const d=await sys('storage.inventory');const rows=d.mounts||[];$('#storage-list',root).innerHTML=rows.length?`<div style="max-height:390px;overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">${L[3]}</th><th>${L[4]}</th><th>${L[5]}</th><th>${L[6]}</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.mountpoint)}</b><br><small>${x.read_only?L[8]:''} ${x.pseudo?'· '+L[9]:''}</small></td><td>${esc(x.filesystem)}</td><td>${x.space_available?size(x.used):L[10]}</td><td>${x.space_available?size(x.free)+' / '+size(x.total):'—'}</td></tr>`).join('')}</tbody></table></div><p class="settings-hint">${d.count} · ${L[1]}</p>`:L[11];}catch(e){$('#storage-list',root).textContent=e.message;}}
  await refresh();
} };

APPS.security = { title: 'Sécurité et permissions', icon: 'fa-shield-halved', w: 650, h: 520, async render(b) {
  const root = el('div','pad'); b.append(root);
  const words = {fr:['Audit de sécurité','Contrôles non intrusifs des permissions et de la configuration. Cet audit ne modifie aucun fichier.','Actualiser','Conforme','À vérifier','Information','Absent'],en:['Security audit','Non-invasive checks of permissions and configuration. This audit does not modify files.','Refresh','OK','Review','Info','Missing'],es:['Auditoría de seguridad','Comprobaciones no invasivas de permisos y configuración. No se modifican archivos.','Actualizar','Correcto','Revisar','Información','Ausente'],de:['Sicherheitsaudit','Nicht-invasive Prüfung von Berechtigungen und Konfiguration. Es werden keine Dateien geändert.','Aktualisieren','OK','Prüfen','Info','Fehlt'],pt:['Auditoria de segurança','Verificações não invasivas de permissões e configuração. Nenhum ficheiro é alterado.','Atualizar','OK','Verificar','Informação','Ausente'],mg:['Fanamarinana fiarovana','Fanamarinana tsy manova rakitra momba ny fahazoan-dalana sy ny fikirana.','Havaozy','Tsara','Jereo','Vaovao','Tsy hita'],ar:['تدقيق الأمان','فحوصات غير تدخلية للأذونات والإعدادات. لا يتم تعديل أي ملف.','تحديث','سليم','يحتاج مراجعة','معلومات','مفقود'],zh:['安全审计','对权限和配置进行非侵入式检查。本审计不会修改文件。','刷新','正常','需检查','信息','缺失'],hi:['सुरक्षा ऑडिट','अनुमतियों और कॉन्फ़िगरेशन की गैर-हस्तक्षेपी जाँच। कोई फ़ाइल नहीं बदली जाती।','रीफ़्रेश','ठीक','जाँचें','जानकारी','अनुपस्थित']}[store.get('ui.lang','fr')] || ['Security audit','Read-only checks.','Refresh','OK','Review','Info','Missing'];
  async function refresh(){root.innerHTML=`<div class="row"><h2 class="sp" style="margin:0">${words[0]}</h2><button class="b" id="sec-refresh">${words[2]}</button></div><p class="settings-hint">${words[1]}</p><div id="sec-list">Chargement…</div>`;$('#sec-refresh',root).onclick=refresh;try{const d=await sys('security.audit');const status={ok:words[3],warning:words[4],info:words[5],missing:words[6]};$('#sec-list',root).innerHTML=(d.checks||[]).map(c=>`<article class="settings-card" style="margin-top:9px"><div class="row"><b class="sp">${esc(c.name)}</b><span class="badge">${esc(status[c.status]||c.status)}</span></div><small>${esc(c.detail)}</small></article>`).join('');}catch(e){$('#sec-list',root).textContent=e.message;}}
  await refresh();
} };

APPS.notifications = { title: 'Centre de notifications', icon: 'fa-bell', w: 560, h: 500, render(b) {
  const root = el('div', 'pad'); b.append(root);
  const lang = store.get('ui.lang', 'fr');
  const labels = {fr:['Centre de notifications','Effacer tout','Aucune notification','Supprimer'],en:['Notification Center','Clear all','No notifications','Delete'],es:['Centro de notificaciones','Borrar todo','Sin notificaciones','Eliminar'],de:['Benachrichtigungszentrale','Alle löschen','Keine Benachrichtigungen','Löschen'],pt:['Centro de notificações','Limpar tudo','Sem notificações','Apagar'],mg:['Foiben’ny fampandrenesana','Fafao rehetra','Tsy misy fampandrenesana','Fafao'],ar:['مركز الإشعارات','مسح الكل','لا توجد إشعارات','حذف'],zh:['通知中心','全部清除','没有通知','删除'],hi:['सूचना केंद्र','सभी साफ़ करें','कोई सूचना नहीं','हटाएँ'] }[lang] || ['Centre de notifications','Effacer tout','Aucune notification','Supprimer'];
  const read = () => { try { const a=JSON.parse(localStorage.getItem('weed.notifications')||'[]'); return Array.isArray(a)?a.slice(0,100):[]; } catch(e) { return []; } };
  const draw = () => {
    const items=read();
    root.innerHTML=`<div class="row"><h2 class="sp" style="margin:0">${labels[0]}</h2><button class="b" id="notif-clear">${labels[1]}</button></div>` + (items.length ? items.map(n=>`<article class="settings-card" style="margin-top:10px"><div class="row"><b class="sp">${esc(n.title)}</b><small>${new Date(Number(n.at)||0).toLocaleString()}</small></div><p>${esc(n.message)}</p><button class="b" data-del="${esc(n.id)}">${labels[3]}</button></article>`).join('') : `<p class="settings-hint">${labels[2]}</p>`);
    $('#notif-clear',root).onclick=()=>{localStorage.removeItem('weed.notifications');draw();};
    root.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=()=>{const next=read().filter(n=>n.id!==btn.dataset.del);localStorage.setItem('weed.notifications',JSON.stringify(next));draw();});
  };
  draw();
} };

APPS.calculator={title:'Calculatrice',icon:'fa-calculator',w:320,h:420,render(b){b.innerHTML=`<div class="pad"><input class="t" id="cd" value="0" readonly style="width:100%;font-size:26px;box-sizing:border-box"><div id="ck" style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px"></div></div>`;const d=$('#cd',b),k=$('#ck',b);['C','7','8','9','÷','4','5','6','×','1','2','3','−','0','.','=','+'].forEach(v=>{const x=el('button','b',v);x.style.minHeight='48px';k.append(x);x.onclick=()=>{if(v==='C')d.value='0';else if(v==='='){try{let q=d.value.replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');if(!/^[0-9+*/(). -]+$/.test(q))throw Error();d.value=String(Function('"use strict";return ('+q+')')());}catch(e){d.value=I18N.t('Erreur');}}else d.value=d.value==='0'&&/[0-9.]/.test(v)?v:d.value+v;};});}};
APPS.calendar={title:'Calendrier',icon:'fa-calendar-days',w:360,h:340,render(b){const n=new Date();b.innerHTML=`<div class="pad"><h2>${n.toLocaleDateString(I18N.locale(),{month:'long',year:'numeric'})}</h2><div id="cal" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;text-align:center"></div></div>`;const c=$('#cal',b);I18N.weekdayInitials().forEach(x=>c.append(el('b','',x)));const f=(new Date(n.getFullYear(),n.getMonth(),1).getDay()+6)%7,days=new Date(n.getFullYear(),n.getMonth()+1,0).getDate();for(let j=0;j<f;j++)c.append(el('span'));for(let d=1;d<=days;d++){const x=el('span','',String(d));x.style.padding='8px';if(d===n.getDate())x.style.background='var(--accent)';c.append(x);}}};



APPS.archive = { title: tr('archive'), icon: 'fa-file-zipper', w: 760, h: 560, render(b, w, o = {}) {
  APPS.archive.title = tr('archive');
  let path = o.dir || '/';
  let openedArchive = null;
  const toolbar = el('div','tool',`
    <button class="b" data-a="up" title="Dossier parent"><i class="fa-solid fa-arrow-up"></i></button>
    <b class="sp" id="arc-path">/</b>
    <input class="t" id="arc-name" value="archive.zip" aria-label="Nom de l'archive" style="width:145px">
    <button class="pri b" data-a="create"><i class="fa-solid fa-file-zipper"></i> Créer ZIP</button>`);
  const info = el('div','pad',tr('selectHint'));
  const listing = el('div','pad');
  listing.style.cssText='overflow:auto;flex:1;min-height:120px';
  const preview = el('div','pad hidden');
  b.style.display='flex'; b.style.flexDirection='column'; b.style.minHeight='0';
  b.append(toolbar,info,listing,preview);
  const join = n => (path==='/'?'':path)+'/'+n;
  const message = (txt, bad=false) => { info.textContent=txt; info.style.color=bad?'#ff9b9b':''; };
  async function openZip(filePath, fileName) {
    try {
      const entries=await sys('fs.zip.list',{path:filePath});
      openedArchive=filePath;
      info.innerHTML='';
      const head=el('div','row',`<b class="sp">${esc(fileName)}</b><small>${entries.length} entrées</small>`);
      const extract=el('button','pri b','<i class="fa-solid fa-box-open"></i> Tout extraire');
      extract.onclick=async()=>{
        extract.disabled=true;
        try {
          const out=await sys('fs.zip.extract',{archive:filePath,destination:path});
          message(`Extraction terminée : ${out.files} fichier(s) dans ${out.destination}.`);
          openedArchive=null; load();
        } catch(e) { message(e.message,true); }
        finally { extract.disabled=false; }
      };
      const deleteBtn=el('button','b','<i class="fa-solid fa-trash"></i> Supprimer sélection');
      deleteBtn.onclick=async()=>{
        const selected=[...preview.querySelectorAll('input[data-entry]:checked')].map(x=>x.dataset.entry);
        if(!selected.length){message(tr('selectOne'),true);return;}
        if(!confirm(`Supprimer ${selected.length} entrée(s) de cette archive ?`))return;
        try{const out=await sys('fs.zip.delete',{archive:filePath,entries:selected});message(`${out.deleted} entrée(s) supprimée(s).`);openZip(filePath,fileName);}
        catch(e){message(e.message,true);}
      };
      const selectedExtract=el('button','b','<i class="fa-solid fa-file-export"></i> Extraire sélection');
      selectedExtract.onclick=async()=>{
        const selected=[...preview.querySelectorAll('input[data-entry]:checked')].map(x=>x.dataset.entry);
        if(!selected.length){message(tr('selectOne'),true);return;}
        try{const out=await sys('fs.zip.extract',{archive:filePath,destination:path,entries:selected});message(`${out.files} fichier(s) extrait(s) dans ${out.destination}.`);load();}
        catch(e){message(e.message,true);}
      };
      head.append(extract,selectedExtract); if (/\.zip$/i.test(filePath)) head.append(deleteBtn); info.append(head);
      preview.innerHTML='';
      const title=el('div','row',`<b>Contenu de l’archive</b><small>${entries.length} éléments</small>`);
      preview.append(title);
      entries.slice(0,500).forEach(x=>{
        const row=el('div','row');
        const check=el('input');check.type='checkbox';check.dataset.entry=x.name;check.setAttribute('aria-label','Sélectionner '+x.name);
        row.append(check,el('i','fa-solid '+(x.dir?'fa-folder':'fa-file-lines')),el('span','sp',esc(x.name)),el('small','',x.dir?'Dossier':fmtSize(x.size)));
        preview.append(row);
      });
      if(entries.length>500) preview.append(el('div','pad',`Aperçu limité aux 500 premières entrées (total : ${entries.length}).`));
      preview.classList.remove('hidden');
      message(`Archive ouverte : ${entries.length} entrée(s).`);
    } catch(e) { openedArchive=null; preview.classList.add('hidden'); message(e.message,true); }
  }
  async function load(){
    $('#arc-path',toolbar).textContent=path;
    preview.classList.add('hidden'); openedArchive=null;
    try {
      const r=await sys('fs.list',{path}); listing.innerHTML='';
      if(path!=='/'){
        const up=el('button','row','<i class="fa-solid fa-level-up-alt"></i><span>.. Dossier parent</span>');
        up.onclick=()=>{path=path.split('/').slice(0,-1).join('/')||'/';load();}; listing.append(up);
      }
      r.items.forEach(it=>{
        const itemPath=join(it.name);
        const row=el('div','row');
        row.style.cursor='default';
        const check=el('input'); check.type='checkbox'; check.dataset.path=itemPath; check.setAttribute('aria-label','Sélectionner '+it.name);
        const ico=el('i','fa-solid '+(it.dir?'fa-folder':'fa-file-lines'));
        const name=el('span','sp',esc(it.name));
        const meta=el('small','',it.dir?'Dossier':fmtSize(it.size));
        row.append(check,ico,name,meta);
        if(it.dir){
          row.ondblclick=()=>{path=itemPath;load();};
          name.style.cursor='pointer'; name.title='Ouvrir le dossier';
        } else if(/\.(zip|tar|tgz)$/i.test(it.name)||/\.tar\.gz$/i.test(it.name)){
          const open=el('button','b','<i class="fa-solid fa-folder-open"></i> Ouvrir');
          open.type='button'; open.onclick=()=>openZip(itemPath,it.name); row.append(open);
        }
        listing.append(row);
      });
      if(!r.items.length)listing.append(el('div','pad',tr('empty')));
      message(`${r.items.length} élément(s) · ${path}`);
    } catch(e) { message(e.message,true); }
  }
  toolbar.onclick=async e=>{
    const btn=e.target.closest('button[data-a]'); if(!btn)return;
    if(btn.dataset.a==='up'){path=path.split('/').slice(0,-1).join('/')||'/';load();return;}
    const sources=[...listing.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.dataset.path);
    if(!sources.length){message(tr('selectFiles'),true);return;}
    let name=$('#arc-name',toolbar).value.trim()||'archive.zip';
    if(!/\.(zip|tar|tgz|tar\.gz)$/i.test(name))name+='.zip';
    const target=join(name);
    try{
      await sys('fs.zip.create',{target,sources});
      message(`Archive créée : ${target}`); load();
    } catch(er){message(er.message,true);}
  };
  load();
  if (o.zip) openZip(o.zip, o.zip.split('/').pop());
}};

APPS.snake = { title: 'Snake Garden', icon: 'fa-gamepad', w: 520, h: 470, render(b) {
  b.innerHTML=`<div class="tool"><b class="sp">Snake Garden</b><span id="snake-score">Score : 0</span><button class="b" id="snake-start">Jouer / Recommencer</button></div><div style="padding:12px;text-align:center"><canvas id="snake-board" width="420" height="340" style="width:min(100%,420px);height:auto;background:#101b17;border:1px solid var(--glass-b);border-radius:12px;touch-action:none"></canvas><p style="color:var(--muted);font-size:12px">Flèches ou ZQSD · Espace pour pause · Mange les graines, évite les murs et ta queue.</p></div>`;
  const c=$('#snake-board',b),ctx=c.getContext('2d'),score=$('#snake-score',b);const cell=20,cols=21,rows=17;
  let snake,dir,next,food,points,timer,alive,paused;
  const place=()=>{let p;do{p={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)};}while(snake.some(s=>s.x===p.x&&s.y===p.y));return p;};
  function draw(){ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#14231d';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#e8c547';ctx.beginPath();ctx.arc(food.x*cell+10,food.y*cell+10,7,0,Math.PI*2);ctx.fill();snake.forEach((s,i)=>{ctx.fillStyle=i?'#32b879':'#8be0a8';ctx.fillRect(s.x*cell+1,s.y*cell+1,18,18);});if(!alive||paused){ctx.fillStyle='rgba(0,0,0,.58)';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 22px sans-serif';ctx.fillText(!alive?'Fin de partie':'Pause',c.width/2,c.height/2);ctx.font='13px sans-serif';ctx.fillText('Cliquez sur Jouer / Recommencer',c.width/2,c.height/2+25);}}
  function tick(){if(!alive||paused)return;dir=next;const h={x:snake[0].x+dir.x,y:snake[0].y+dir.y};if(h.x<0||h.y<0||h.x>=cols||h.y>=rows||snake.some((s,i)=>i>0&&s.x===h.x&&s.y===h.y)){alive=false;clearInterval(timer);draw();return;}snake.unshift(h);if(h.x===food.x&&h.y===food.y){points+=10;score.textContent='Score : '+points;food=place();}else snake.pop();draw();}
  function start(){clearInterval(timer);snake=[{x:10,y:8},{x:9,y:8},{x:8,y:8}];dir=next={x:1,y:0};points=0;score.textContent='Score : 0';food=place();alive=true;paused=false;draw();timer=setInterval(tick,125);}
  function change(x,y){if(x!==-dir.x||y!==-dir.y)next={x,y};}
  addEventListener('keydown',key);function key(e){const k=e.key.toLowerCase();const map={arrowup:[0,-1],z:[0,-1],arrowdown:[0,1],s:[0,1],arrowleft:[-1,0],q:[-1,0],arrowright:[1,0],d:[1,0]};if(map[k]){e.preventDefault();change(...map[k]);}if(k===' '&&alive){paused=!paused;draw();}}
  $('#snake-start',b).onclick=start;c.addEventListener('touchstart',e=>{const t=e.changedTouches[0],r=c.getBoundingClientRect(),x=(t.clientX-r.left)/r.width,y=(t.clientY-r.top)/r.height;if(Math.abs(x-.5)>Math.abs(y-.5))change(x>.5?1:-1,0);else change(0,y>.5?1:-1);},{passive:true});
  const oldDestroy=()=>{clearInterval(timer);removeEventListener('keydown',key);};const observer=new MutationObserver(()=>{if(!b.isConnected){oldDestroy();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});start();
}};

APPS.notes = { title: 'Notes', icon: 'fa-note-sticky', w: 520, h: 420, render(b) {
  const key = 'weed.notes.' + (Session.user?.name || 'guest');
  b.innerHTML = `<div class="tool"><b class="sp">Mes notes</b><small id="note-status">Enregistré automatiquement</small></div><textarea id="notes-area" class="t edit" placeholder="Écrivez vos idées ici…" style="height:calc(100% - 48px);padding:14px"></textarea>`;
  const area = $('#notes-area', b); area.value = store.get(key, '');
  area.oninput = () => { store.set(key, area.value); $('#note-status', b).textContent = 'Modifications enregistrées ✓'; };
} };
APPS.paint = { title: 'Peinture', icon: 'fa-paintbrush', w: 720, h: 520, render(b) {
  b.innerHTML = `<div class="tool"><label>Couleur <input id="paint-color" type="color" value="#20c879"></label><label>Taille <input id="paint-size" type="range" min="1" max="32" value="5"></label><button class="b" id="paint-clear">Effacer</button><button class="b" id="paint-save">Exporter PNG</button></div><canvas id="paint-canvas" style="display:block;width:100%;height:calc(100% - 48px);background:#fff;touch-action:none;cursor:crosshair"></canvas>`;
  const c = $('#paint-canvas', b), ctx = c.getContext('2d');
  const resize = () => { const old = document.createElement('canvas'); old.width = c.width; old.height = c.height; old.getContext('2d').drawImage(c,0,0); const r=c.getBoundingClientRect(); c.width=Math.max(1,Math.floor(r.width*devicePixelRatio)); c.height=Math.max(1,Math.floor(r.height*devicePixelRatio)); ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height); if(old.width)ctx.drawImage(old,0,0); };
  if (window.ResizeObserver) new ResizeObserver(resize).observe(c); else requestAnimationFrame(resize);
  let drawing = false;
  const point = e => { const r=c.getBoundingClientRect(); return [(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]; };
  c.onpointerdown = e => { drawing=true;c.setPointerCapture(e.pointerId);const [x,y]=point(e);ctx.beginPath();ctx.moveTo(x,y); };
  c.onpointermove = e => { if(!drawing)return;const [x,y]=point(e);ctx.strokeStyle=$('#paint-color',b).value;ctx.lineWidth=Number($('#paint-size',b).value)*devicePixelRatio;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineTo(x,y);ctx.stroke(); };
  c.onpointerup = c.onpointercancel = () => drawing=false;
  $('#paint-clear',b).onclick=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);};
  $('#paint-save',b).onclick=()=>{const a=document.createElement('a');a.download='weed-os-dessin.png';a.href=c.toDataURL('image/png');a.click();};
} };

APPS.programs = { title: 'Programmes', icon: 'fa-cubes', w: 620, h: 460, render(b) {
  const admin = Session.user?.role === 'admin';
  const tool = el('div', 'tool', admin ? `<input type="file" id="f" accept=".zip"><button class="pri b" id="up"><i class="fa-solid fa-upload"></i> Installer un Programme (.zip)</button><small id="st"></small>` : `<small id="st">Seuls les administrateurs peuvent installer ou retirer des Programmes.</small>`);
  const list = el('div'); b.append(tool, list);
  const st = $('#st', tool);
  async function load() {
    const ex = await sys('prog.list');
    list.innerHTML = ex.length ? '' : '<div class="pad"><small>Aucun Programme installé.</small></div>';
    ex.forEach(x => {
      const r = el('div', 'row', `${appIconHTML(x.app || {}, 'app.' + x.id)}<span class="sp"><b>${esc(x.name)}</b> <small>v${esc(x.version)} · ${esc(x.author)}</small><br><small>${esc(x.description)}</small><br><small>Permissions : ${esc((x.permissions || []).join(', ') || 'aucune')}</small></span>` +
        (admin ? `<button class="b" data-a="t">${x.enabled ? 'Désactiver' : 'Activer'}</button><button class="b" data-a="r" title="Supprimer"><i class="fa-solid fa-trash"></i></button>` : `<span class="badge ${x.enabled ? 'on' : ''}">${x.enabled ? 'actif' : 'inactif'}</span>`));
      r.onclick = async e => {
        const a = e.target.closest('button')?.dataset.a; if (!a) return;
        try {
          if (a === 't') await sys(x.enabled ? 'prog.disable' : 'prog.enable', { id: x.id });
          if (a === 'r') { if (!r.dataset.c) { r.dataset.c = 1; e.target.closest('button').textContent = 'Confirmer ?'; return; } await sys('prog.remove', { id: x.id }); }
          await loadApps(); load();
        } catch (er) { st.textContent = er.message; }
      };
      list.append(r);
    });
  }
  if (admin) $('#up', tool).onclick = async () => {
    const f = $('#f', tool).files[0]; if (!f) { st.textContent = 'Choisissez un fichier .zip'; return; }
    const fd = new FormData(); fd.append('file', f);
    try {
      const r = await fetch('/api/upload-app', { method: 'POST', headers: { 'X-Weed': '1' }, body: fd }); const j = await r.json();
      st.textContent = j.ok ? `Installé : ${j.result.name} (inactif : à activer après vérification des permissions)` : j.error; load();
    } catch (e) { st.textContent = e.message; }
  };
  load();
} };

APPS.installer = { title: 'Installer Weed OS', icon: 'fa-hard-drive', w: 650, h: 560, render(b) {
  if (Session.user?.role !== 'admin') { b.textContent = 'Cette fonction est réservée à un compte administrateur.'; return; }
  b.innerHTML = `<div class="settings-scroll" style="padding:16px">
    <div class="row" style="align-items:center;gap:12px"><i class="fa-solid fa-hard-drive" style="font-size:30px;color:var(--accent)"></i><div><h2 style="margin:0">Installer Weed OS sur un disque</h2><small class="settings-hint">Le mode Live reste utilisable sans installation. Cette opération crée une installation permanente.</small></div></div>
    <div class="pad" style="margin:14px 0;border:1px solid rgba(255,180,60,.45);border-radius:12px;background:rgba(180,110,20,.12)"><b><i class="fa-solid fa-triangle-exclamation"></i> Attention : effacement complet</b><p>Le disque sélectionné sera entièrement effacé : partitions, fichiers et systèmes existants. Ne sélectionnez jamais la clé USB Live ni le disque contenant vos données.</p><p><b>Limite actuelle :</b> démarrage BIOS/Legacy (MBR). UEFI/Secure Boot n’est pas encore pris en charge.</p></div>
    <div class="settings-row"><label for="weed-install-disk">Disque de destination</label><select id="weed-install-disk" class="t" style="min-width:220px"><option value="">Chargement des disques…</option></select></div>
    <div id="weed-install-detail" class="settings-hint">Détection des disques physiques…</div>
    <div class="settings-row"><label for="weed-install-confirm">Confirmation obligatoire</label><input id="weed-install-confirm" class="t" placeholder="ERASE /dev/sdX" autocomplete="off" spellcheck="false"></div>
    <div class="row" style="gap:8px;margin-top:12px"><button type="button" class="b" id="weed-install-refresh"><i class="fa-solid fa-rotate"></i> Actualiser</button><button type="button" class="b danger" id="weed-install-go" disabled><i class="fa-solid fa-download"></i> Effacer et installer</button></div>
    <pre id="weed-install-output" class="archive-preview" style="white-space:pre-wrap"></pre>
    <small class="settings-hint">Répartition : environ 75 % pour le système (ext4) et 25 % pour les données persistantes. Après réussite, retirez le support Live et redémarrez.</small>
  </div>`;
  const select=$('#weed-install-disk',b), detail=$('#weed-install-detail',b), confirmInput=$('#weed-install-confirm',b), go=$('#weed-install-go',b), output=$('#weed-install-output',b);
  let disks=[];
  const refresh=async()=>{select.innerHTML='<option value="">Chargement…</option>';go.disabled=true;output.textContent='';try{disks=await sys('system.install.disks');select.innerHTML='<option value="">Choisir un disque…</option>'+disks.map(d=>`<option value="${esc(d.device)}" ${d.mounted?'disabled':''}>${esc(d.device)} — ${esc(d.name)} — ${esc(d.size)}${d.removable?' — amovible':''}${d.mounted?' — MONTÉ':''}</option>`).join('');detail.textContent=disks.length?`${disks.length} disque(s) détecté(s). Les disques montés sont désactivés.`:'Aucun disque compatible détecté.';}catch(e){select.innerHTML='<option value="">Détection impossible</option>';detail.textContent=e.message;}};
  const update=()=>{const d=disks.find(x=>x.device===select.value);go.disabled=!d||d.mounted||confirmInput.value.trim()!==`ERASE ${d.device}`;detail.textContent=d?`${d.name} · ${d.size} · ${d.removable?'Support amovible':'Disque'} · ${d.mounted?'Monté : '+d.mountpoints.join(', '):'Non monté'}`:'Sélectionnez un disque compatible.';};
  select.onchange=update;confirmInput.oninput=update;$('#weed-install-refresh',b).onclick=refresh;
  go.onclick=async()=>{const d=disks.find(x=>x.device===select.value);if(!d||go.disabled)return;if(!confirm(`DERNIER AVERTISSEMENT\n\nToutes les données de ${d.device} (${d.size}) seront détruites. Continuer ?`))return;go.disabled=true;output.textContent='Installation en cours… Ne coupez pas l’alimentation.';try{const r=await sys('system.install.run',{device:d.device,confirmation:confirmInput.value.trim()});output.textContent=r.output||'Installation terminée. Retirez le support Live puis redémarrez.';notify('Installation terminée',d.device);}catch(e){output.textContent=e.message;notify('Échec de l’installation',e.message);}finally{await refresh();}};
  refresh();
}};

APPS.settings = { title: 'Réglages', icon: 'fa-gear', w: 560, h: 610, render(b) {
  const h = store.get('h', 145), bl = store.get('blur', 24), wp = store.get('wp', 'w1');
  const custom = store.get('wp.custom', '');
  const avatar = store.get('profile.avatar', '');
  b.innerHTML = `<div class="settings-scroll">
    <section class="settings-section"><h3>Sons du système</h3>
    <div class="settings-row"><label for="snd-boot">Son de démarrage du système</label><input type="checkbox" id="snd-boot" disabled></div>
    <div class="settings-row"><label for="snd-boot-vol">Volume du son de démarrage</label><input type="range" min="0" max="100" value="85" id="snd-boot-vol" disabled></div>
    <div class="settings-row"><span class="settings-inline"><button type="button" class="b" id="snd-boot-test">Tester le démarrage</button></span></div>
    <small class="settings-hint" id="snd-boot-info">Chargement…</small>
    <div class="settings-row"><label for="snd-on">Sons d'interface (arrêt, erreur) pour mon compte</label><input type="checkbox" id="snd-on" ${Sound.enabled() ? 'checked' : ''}></div>
    <div class="settings-row"><label for="snd-vol">Volume des sons d'interface</label><input type="range" min="0" max="100" value="${Math.round(Sound.volume() * 100)}" id="snd-vol"></div>
    <div class="settings-row"><span class="settings-inline"><button type="button" class="b" data-snd="shutdown">Arrêt</button><button type="button" class="b" data-snd="error">Erreur</button></span></div>
    <small class="settings-hint">Le son de démarrage est joué par le système au lancement, avant toute connexion : son réglage s'applique à tous les comptes et appartient à l'administrateur. Fichiers MP3 : <code>system/desktop/assets/sounds/</code> (startup.mp3, shutdown.mp3, error.mp3).</small></section>
    <section class="settings-section"><h3>Apparence</h3><div class="settings-row"><label for="h">Teinte d'accent</label><input type="range" min="90" max="190" value="${h}" id="h"></div>
    <div class="settings-row"><label for="bl">Flou des fenêtres</label><input type="range" min="0" max="50" value="${bl}" id="bl"></div>
    <div class="settings-row settings-stack"><b>Fond d'écran</b><div class="wallpaper-grid" id="wallpaper-grid">
      ${Array.from({length:20},(_,i)=>`<button type="button" class="wallpaper-thumb ${wp === 'w'+(i+1) ? 'selected' : ''}" data-wallpaper="w${i+1}" style="background-image:url('assets/wallpapers/wallpaper-${String(i+1).padStart(2,'0')}.jpg')" aria-label="Fond d'écran ${i+1}"><i class="fa-solid fa-check"></i></button>`).join('')}
      <button type="button" class="wallpaper-thumb custom-thumb ${wp === 'custom' ? 'selected' : ''}" id="custom-wallpaper-thumb" aria-label="Photo personnelle" style="${custom ? `background-image:url('${custom}')` : ''}"><i class="fa-solid fa-image"></i></button>
    </div><label class="file-pick"><i class="fa-solid fa-upload"></i> Choisir ma photo <input id="custom-wallpaper" type="file" accept="image/*"></label><small class="settings-hint">Aperçus miniatures · JPG, PNG ou WebP</small>
    <div class="settings-row"><label for="wall-fit">Mode d’affichage</label><select id="wall-fit" class="t"><option value="cover">Couvrir (par défaut)</option><option value="contain">Ajuster</option><option value="fill">Étirer</option><option value="center">Centrer</option><option value="tile">Mosaïque</option></select></div></section>
    <section class="settings-section"><h3>Personnalisation</h3><div class="settings-row"><label for="ui-theme">Mode d’affichage</label><select id="ui-theme" class="t"><option value="dark">Sombre</option><option value="light">Clair</option><option value="system">Automatique</option></select></div>
    <div class="settings-row"><label for="ui-lang">Langue</label><select id="ui-lang" class="t"><option value="en">English</option><option value="zh">中文</option><option value="hi">हिन्दी</option><option value="es">Español</option><option value="ar">العربية</option><option value="de">Deutsch</option><option value="pt">Português</option><option value="mg">Malagasy</option><option value="fr">Français</option></select></div><small class="settings-hint">${tr('settingsHint')}</small></section>
    <section class="settings-section"><h3>Restauration du système</h3><p class="settings-hint">Réinitialise les préférences locales sans supprimer les fichiers personnels ni les comptes.</p><button class="b" id="restore-settings" type="button">Restaurer les paramètres par défaut</button>
    ${Session.user?.role === 'admin' ? `<hr><b>Sauvegarde complète du système</b><p class="settings-hint">Inclut les comptes, fichiers personnels, applications installées et paramètres persistants. Archive chiffrée (AES-256-GCM). Conservez la phrase secrète : elle sera nécessaire pour restaurer.</p>
    <div class="tool"><input class="t" id="backup-password" type="password" minlength="8" maxlength="128" placeholder="Phrase secrète (8 caractères minimum)" autocomplete="new-password"></div>
    <div class="settings-inline"><button class="b pri" id="backup-download" type="button"><i class="fa-solid fa-download"></i> Télécharger une sauvegarde</button><label class="file-pick"><i class="fa-solid fa-upload"></i> Choisir une sauvegarde <input id="backup-file" type="file" accept=".weedbak,application/octet-stream"></label><button class="b" id="backup-restore" type="button">Restaurer</button></div><small id="backup-status" class="settings-hint"></small>` : '<p class="settings-hint">La sauvegarde complète est réservée à l’administrateur.</p>'}</section>
    <section class="settings-section"><h3>Profil utilisateur</h3><div class="profile-edit"><img id="profile-preview" src="${avatar || 'assets/logo-green.png'}" alt="Photo de profil"><div><b>${esc(Session.user?.name || 'Utilisateur')}</b><small>Photo de profil de ce navigateur</small><label class="file-pick"><i class="fa-solid fa-camera"></i> Modifier la photo <input id="profile-photo" type="file" accept="image/*"></label><button class="text-button" id="profile-reset" type="button">Réinitialiser</button></div></div></section>
    <section class="settings-section"><h3>Compte</h3><div class="settings-row"><label for="pw">Nouveau mot de passe</label><span class="settings-inline"><input class="t" id="pw" type="password" placeholder="6 caractères minimum"><button class="b" id="pwb">Changer</button></span></div><small id="st" class="settings-hint" role="status"></small></section>
    ${Session.user?.role === 'admin' ? '<section class="settings-section"><h3>Comptes</h3><div id="user-admin"></div></section>' : ''}
  </div>`;
  const applyCustom = data => {
    store.set('wp.custom', data); store.set('wp', 'custom'); applyTheme();
    $('#custom-wallpaper-thumb', b).style.backgroundImage = `url("${data}")`;
    $('#custom-wallpaper-thumb', b).classList.add('selected');
    b.querySelectorAll('[data-wallpaper]').forEach(x => x.classList.remove('selected'));
  };
  const readImage = (file, cb) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) { $('#st', b).textContent = 'Image trop volumineuse (maximum 8 Mo).'; return; }
    const reader = new FileReader(); reader.onload = () => cb(reader.result); reader.readAsDataURL(file);
  };
  $('#wallpaper-grid', b).onclick = e => {
    const tile = e.target.closest('[data-wallpaper]'); if (!tile) return;
    store.set('wp', tile.dataset.wallpaper); applyTheme();
    b.querySelectorAll('.wallpaper-thumb').forEach(x => x.classList.toggle('selected', x === tile));
  };
  $('#custom-wallpaper', b).onchange = e => readImage(e.target.files[0], applyCustom);
  $('#custom-wallpaper-thumb', b).onclick = () => {
    if (store.get('wp.custom', '')) { store.set('wp', 'custom'); applyTheme(); b.querySelectorAll('.wallpaper-thumb').forEach(x => x.classList.toggle('selected', x.id === 'custom-wallpaper-thumb')); }
    else $('#custom-wallpaper', b).click();
  };
  $('#profile-photo', b).onchange = e => readImage(e.target.files[0], data => {
    store.set('profile.avatar', data); $('#profile-preview', b).src = data; updateProfileAvatar();
    $('#st', b).textContent = 'Photo de profil mise à jour ✓';
  });
  $('#profile-reset', b).onclick = () => { store.set('profile.avatar', ''); $('#profile-preview', b).src = 'assets/logo-green.png'; updateProfileAvatar(); };
  $('#pwb', b).onclick = () => sys('user.passwd', { pass: $('#pw', b).value }).then(() => { $('#pw', b).value = ''; $('#st', b).textContent = 'Mot de passe modifié ✓'; }).catch(e => $('#st', b).textContent = e.message);
  if (Session.user?.role === 'admin') {
    const box = $('#user-admin', b);
    const draw = async () => {
      const us = await sys('user.list');
      box.innerHTML = us.map(u => `<div class="row"><i class="fa-solid fa-user"></i><span class="sp">${esc(u.name)} <small>${esc(u.role)}</small></span>${u.name === Session.user.name ? '' : `<button class="b" data-d="${esc(u.name)}"><i class="fa-solid fa-trash"></i></button>`}</div>`).join('') +
        `<div class="tool"><input class="t" id="nu" placeholder="nom" size="10"><input class="t" id="np" type="password" placeholder="mot de passe" size="10"><select class="t" id="nr"><option value="user">utilisateur</option><option value="admin">admin</option></select><button class="b" id="na">Ajouter</button></div>`;
      $('#na', box).onclick = () => sys('user.add', { name: $('#nu', box).value, pass: $('#np', box).value, role: $('#nr', box).value }).then(draw).catch(e => $('#st', b).textContent = e.message);
      box.querySelectorAll('[data-d]').forEach(x => x.onclick = () => sys('user.remove', { name: x.dataset.d }).then(draw).catch(e => $('#st', b).textContent = e.message));
    };
    draw().catch(() => {});
  }
  $('#snd-on', b).onchange = e => store.set('sound.on', e.target.checked ? '1' : '0');
  $('#snd-vol', b).oninput = e => store.set('sound.vol', e.target.value);
  b.querySelectorAll('[data-snd]').forEach(x => x.onclick = () => { Sound.play(x.dataset.snd, true); });
  const bootOn = $('#snd-boot', b), bootVol = $('#snd-boot-vol', b), bootInfo = $('#snd-boot-info', b);
  api('/api/system/sound/load').then(r => {
    bootOn.checked = r.startup; bootVol.value = r.volume;
    bootOn.disabled = bootVol.disabled = !r.admin;
    bootInfo.textContent = (r.capable ? 'Lecture native disponible : le son démarre sans clic, avant le bureau.'
      : 'Aucun lecteur audio système détecté : le navigateur essaiera de jouer le son (un premier clic peut être nécessaire).')
      + (r.admin ? '' : ' Réglage réservé à l’administrateur.');
  }).catch(e => { bootInfo.textContent = 'Réglage système indisponible : ' + e.message; });
  const saveBoot = async () => {
    try { await api('/api/system/sound/save', { startup: bootOn.checked, volume: Number(bootVol.value) }); bootInfo.textContent = 'Réglage enregistré pour le prochain démarrage.'; }
    catch (e) { bootInfo.textContent = e.message; }
  };
  bootOn.onchange = saveBoot; bootVol.onchange = saveBoot;
  $('#snd-boot-test', b).onclick = async () => {
    let native = false;
    try { native = (await api('/api/system/sound/test')).native; } catch (e) {}
    if (!native) Sound.play('startup', true, Number(bootVol.value) / 100);
  };
  $('#wall-fit', b).value = store.get('wp.fit', 'cover');
  $('#wall-fit', b).onchange = e => { store.set('wp.fit', e.target.value); applyTheme(); };
  $('#ui-theme', b).value = store.get('ui.theme', 'dark');
  $('#ui-theme', b).onchange = e => { store.set('ui.theme', e.target.value); applyTheme(); };
  $('#ui-lang', b).value = store.get('ui.lang', 'fr');
  $('#ui-lang', b).onchange = e => { store.set('ui.lang', e.target.value); applyTheme(); };
  $('#restore-settings', b).onclick = async () => {
    if (!confirm('Restaurer les paramètres par défaut ? Les fichiers et comptes ne seront pas supprimés.')) return;
    try { await api('/api/preferences/reset'); } catch(e) { $('#st',b).textContent = e.message; return; }
    ['h','blur','wp','wp.custom','wp.fit','ui.theme','ui.lang','sound.on','sound.vol','profile.avatar',FAVORITES_KEY,FREQUENT_KEY].forEach(k => { try { localStorage.removeItem(k); } catch(e) {} });
    applyTheme(); updateProfileAvatar(); Dock.build(); notify('Restauration', 'Les préférences par défaut ont été restaurées.');
  };
  if (Session.user?.role === 'admin') {
    $('#backup-download', b).onclick = async () => {
      const status = $('#backup-status', b), passphrase = $('#backup-password', b).value;
      if (passphrase.length < 8) { status.textContent = 'Choisissez une phrase secrète de 8 caractères minimum.'; return; }
      status.textContent = 'Préparation et chiffrement de la sauvegarde…';
      try {
        const response = await fetch('/api/system/backup', { method:'POST', headers:{'X-Weed':'1','Content-Type':'application/json'}, body:JSON.stringify({passphrase}), credentials: 'same-origin' });
        if (!response.ok) throw new Error(await response.text());
        const blob = await response.blob(), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'weed-os-backup-' + new Date().toISOString().slice(0,10) + '.weedbak'; a.click(); URL.revokeObjectURL(url);
        status.textContent = 'Sauvegarde téléchargée.';
      } catch(e) { status.textContent = e.message; }
    };
    $('#backup-restore', b).onclick = async () => {
      const file = $('#backup-file', b).files[0], status = $('#backup-status', b);
      const passphrase = $('#backup-password', b).value;
      if (!file) { status.textContent = 'Choisissez une archive de sauvegarde.'; return; }
      if (passphrase.length < 8) { status.textContent = 'Saisissez la phrase secrète de cette sauvegarde.'; return; }
      if (!confirm('Restaurer cette sauvegarde remplacera les comptes, fichiers et applications actuels. Continuer ?')) return;
      status.textContent = 'Restauration en cours…';
      try {
        const form = new FormData(); form.append('backup', file); form.append('passphrase', passphrase);
        const response = await fetch('/api/system/restore', { method:'POST', headers:{'X-Weed':'1'}, body:form, credentials:'same-origin' });
        const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || 'Restauration impossible');
        status.textContent = 'Restauration terminée. Redémarrage de la session…'; setTimeout(() => location.reload(), 1200);
      } catch(e) { status.textContent = e.message; }
    };
  }
  $('#h', b).oninput = e => { store.set('h', e.target.value); applyTheme(); };
  $('#bl', b).oninput = e => { store.set('blur', e.target.value); applyTheme(); };
} };

APPS.about = { title: 'À propos de Weed OS', icon: 'fa-circle-info', w: 380, h: 330, hidden: true, async render(b) {
  const i = await sys('sys.info').catch(() => ({ version: '1.0.0', php: '?', author: 'Tantely Orion', license: 'MIT' }));
  b.innerHTML = `<div class="about"><img src="assets/logo-white.png" alt=""><h2>Weed OS</h2><p>Version ${esc(i.version)}</p><p>Weed Kernel · PHP ${esc(i.php)}</p>
    <p>Projet libre et expérimental, licence ${esc(i.license)}</p><p>Créé par ${esc(i.author)}</p><p><button class="text-button" id="legal-open" type="button">Mentions légales et crédits des ressources</button></p></div>`;
  $('#legal-open', b).onclick = () => WM.open('legal');
} };

/* Crédits des fonds d'écran (numéros = ordre dans Réglages) — voir aussi CREDITS.md. */
const WALLPAPER_CREDITS = [
  'Weed OS Project', 'Marek Pavlik (Pexels)', 'Jan Moser (Pexels)', 'Oly Programming Language Project', 'Veronika Andrews (Pexels)',
  'Hafatra app for instant messaging', 'Priscila Dramisino (Pexels)', 'Erik Karits (Pexels)', 'Erik Karits (Pexels)', 'Marek Pavlik (Pexels)',
  'Weed OS Project', 'Tantely Orion Archives Photostock', 'Weed OS Project', 'ChatGPT image regenerations', 'molnarszabolcserdely (Pexels)',
  'Regan Dsouza (Pexels)', 'ChatGPT image regenerations', 'Weed OS Project', 'Tantely Orion (MEME)', 'Apasaric (Pexels)'
];
const THIRD_PARTY = [
  ['Linux (noyau)', 'GPL-2.0'], ['Buildroot', 'GPL-2.0 ou ultérieure'], ['PHP', 'PHP License 3.01'], ['GRUB 2', 'GPL-3.0 ou ultérieure'],
  ['cage (Wayland)', 'MIT'], ['WPE WebKit', 'LGPL-2.1 / BSD'], ['Cog', 'MIT'], ['Mesa 3D', 'MIT'], ['seatd', 'MIT'],
  ['mpg123', 'LGPL-2.1'], ['ALSA (alsa-lib / alsa-utils)', 'LGPL-2.1 / GPL-2.0'], ['NetworkManager', 'GPL-2.0 ou ultérieure'],
  ['BlueZ', 'GPL-2.0 ou ultérieure'], ['DejaVu Fonts', 'Licence Bitstream Vera / domaine public']
];
APPS.legal = { title: 'Mentions légales et crédits', icon: 'fa-scale-balanced', w: 660, h: 580, hidden: true, render(b) {
  const L = I18N.legalText();
  const wp = WALLPAPER_CREDITS.map((c, i) => `<li><span class="legal-thumb" style="background-image:url('assets/wallpapers/wallpaper-${String(i + 1).padStart(2, '0')}.jpg')"></span><span><b>${esc(I18N.t('Fond d’écran ' + (i + 1)))}</b><small>${esc(c)}</small></span></li>`).join('');
  const tp = THIRD_PARTY.map(([n, l]) => `<tr><td>${esc(I18N.t(n))}</td><td>${esc(I18N.t(l))}</td></tr>`).join('');
  const universfield = '<a href="https://pixabay.com/users/universfield-28281460/" target="_blank" rel="noopener noreferrer">Universfield</a>';
  b.innerHTML = `<div class="settings-scroll pad legal" dir="${document.documentElement.dir}">
    <h2>${L.title}</h2>
    <h3>Weed OS 1.0.0</h3>
    <p>${L.p1}</p>
    <p>${L.p2}</p>
    <h3>${L.icons}</h3>
    <p>${L.p3}</p>
    <h3>${L.sounds}</h3>
    <ul class="legal-sounds">
      <li>${L.s1}</li>
      <li>${L.s2.replace('%U', universfield)}</li>
    </ul>
    <h3>${L.wallpapers}</h3>
    <p>${L.p4}</p>
    <ul class="legal-wp">${wp}</ul>
    <p><small>${L.p5}</small></p>
    <h3>${L.third}</h3>
    <p>${L.p6}</p>
    <table class="legal-table"><thead><tr><th>${L.comp}</th><th>${L.lic}</th></tr></thead><tbody>${tp}</tbody></table>
    <h3>${L.mit}</h3>
    <pre class="legal-license" dir="ltr">MIT License

Copyright (c) 2026 Tantely Orion

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.</pre>
    <h3>${L.netTitle}</h3>
    <p>${L.netP}</p>
  </div>`;
} };

/* ---------- Programmes (.zip) -> apps, exécutés en iframe isolée ---------- */
async function loadApps() {
  Object.keys(APPS).filter(k => k.startsWith('app.')).forEach(k => delete APPS[k]);
  try {
    (await sys('prog.list')).filter(x => x.enabled && x.app).forEach(x => {
      const a = x.app;
      APPS['app.' + x.id] = { title: a.title || x.name, icon: a.icon || 'fa-cube', w: a.width || 480, h: a.height || 360, prog: x,
        render(b, w) {
          const f = document.createElement('iframe');
          f.src = '/app/' + encodeURIComponent(x.id) + '/' + String(a.entry || 'index.html').split('/').map(encodeURIComponent).join('/');
          f.setAttribute('sandbox', x.id === 'gnanja-browser' ? 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox' : 'allow-scripts allow-forms'); // isolation par défaut ; exception popup limitée au navigateur expérimental
          w.frame = f; b.append(f);
        } };
    });
  } catch (e) {}
  Dock.build();
}
/* Pont Programme -> système : seules les permissions déclarées dans manifest.json passent. */
addEventListener('message', async e => {
  const d = e.data; if (!d || d.weed !== 'req') return;
  const w = [...WM.wins].find(x => x.frame && x.frame.contentWindow === e.source); if (!w) return;
  const prog = w.app.prog, reply = (ok, v) => e.source.postMessage({ weed: 'res', id: d.id, ok, [ok ? 'result' : 'error']: v }, '*');
  const name = String(d.name || ''), perms = prog.permissions || [];
  const allowed = name === 'notify' || name.startsWith('app.' + prog.id + '.') && perms.includes(name) || perms.includes(name);
  if (!allowed) return reply(false, `permission refusée : ${name} (déclarez-la dans manifest.json)`);
  if (name === 'notify') { notify(prog.name, String(d.args?.message || d.args?.title || '')); return reply(true, true); }
  try { reply(true, await sys(name, d.args || {})); } catch (er) { reply(false, er.message); }
});

/* ---------- Gestionnaire de fenêtres ---------- */
/* États d'une fenêtre : normal | max (agrandie, barre de menu visible) | full (plein écran : barre de menu et Dock masqués).
   Le Dock se masque tout seul quand la fenêtre au premier plan est agrandie ; il réapparaît au survol du bord bas. */
const WM = {
  z: 10, wins: new Set(), n: 0, MIN_W: 280, MIN_H: 160,
  area() { const d = $('#desktop'); return { w: d.clientWidth, h: d.clientHeight }; },
  open(id, o = {}) {
    const app = APPS[id]; if (!app) return;
    recordFrequent(id);
    if (!o.fresh && !o.path) { const ex = [...this.wins].find(w => w.id === id); if (ex) return this.focus(ex); }
    const w = { id, app, el: el('div', 'win'), n: this.n++, state: 'normal', prev: null };
    const bar = el('div', 'titlebar', `<div class="lights"><button class="l close" title="Fermer"></button><button class="l min" title="Réduire"></button><button class="l max" title="Agrandir (Alt+clic : plein écran)"></button></div><div class="title">${esc(app.title)}</div>`);
    const body = el('div', 'body');
    w.el.append(bar, body);
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(dir => {
      const h = el('div', 'rz rz-' + dir); h.onpointerdown = e => this.startResize(w, dir, e); w.el.append(h);
    });
    const W = Math.min(app.w || 520, innerWidth - 20), H = Math.min(app.h || 380, innerHeight - 100);
    Object.assign(w.el.style, { width: W + 'px', height: H + 'px', left: Math.max(10, (innerWidth - W) / 2 + (w.n % 6) * 26 - 60) + 'px', top: 30 + (w.n % 6) * 26 + 'px' });
    $('#desktop').append(w.el); this.wins.add(w);
    w.el.onmousedown = () => this.focus(w);
    $('.close', bar).onclick = () => this.close(w);
    $('.min', bar).onclick = () => { w.el.classList.add('min'); this.sync(); Dock.build(); };
    $('.max', bar).onclick = e => this.toggleMax(w, e.altKey || e.shiftKey);
    bar.ondblclick = e => { if (!e.target.closest('.l')) this.toggleMax(w, false); };
    bar.onpointerdown = e => this.startDrag(w, bar, e);
    Promise.resolve(app.render(body, w, o)).catch(e => body.innerHTML = `<div class="pad err">${esc(e.message)}</div>`);
    this.focus(w); Dock.build();
  },
  focus(w) {
    w.el.classList.remove('min'); w.el.style.zIndex = ++this.z;
    this.wins.forEach(x => x.el.classList.toggle('focus', x === w));
    $('#appname').textContent = w.app.title; this.sync(); Dock.build();
  },
  close(w) { w.el.remove(); this.wins.delete(w); $('#appname').textContent = [...this.wins].pop()?.app.title || 'Cultivator'; this.sync(); Dock.build(); },
  /* Change l'état d'une fenêtre (la géométrie « normale » reste dans le style en ligne, elle est donc restaurée telle quelle). */
  setState(w, state) {
    w.state = state;
    w.el.classList.toggle('max', state !== 'normal');
    w.el.classList.toggle('full', state === 'full');
    this.sync();
  },
  toggleMax(w, full = false) {
    const target = full ? 'full' : 'max';
    this.setState(w, w.state === target ? 'normal' : target);
  },
  /* Adapte l'interface : Dock masqué si la fenêtre du dessus est agrandie, barre de menu aussi en plein écran. */
  sync() {
    const vis = [...this.wins].filter(x => x.el.isConnected && !x.el.classList.contains('min'));
    vis.sort((a, b) => (+a.el.style.zIndex || 0) - (+b.el.style.zIndex || 0));
    const top = vis[vis.length - 1], max = !!top && top.state !== 'normal', full = !!top && top.state === 'full';
    const cl = document.body.classList;
    cl.toggle('dock-auto', max); cl.toggle('chrome-full', full);
    if (!max) cl.remove('dock-peek');
    if (!full) cl.remove('bar-peek');
  },
  /* Garde les fenêtres normales dans le bureau (redimensionnement du navigateur ou de l'écran). */
  clampAll() {
    const A = this.area(); if (!A.w || !A.h) return;
    this.wins.forEach(w => {
      if (w.state !== 'normal') return;
      const s = w.el.style, wd = Math.min(w.el.offsetWidth, A.w), ht = Math.min(w.el.offsetHeight, A.h);
      s.width = wd + 'px'; s.height = ht + 'px';
      s.left = Math.min(Math.max(0, w.el.offsetLeft), Math.max(0, A.w - wd)) + 'px';
      s.top = Math.min(Math.max(0, w.el.offsetTop), Math.max(0, A.h - ht)) + 'px';
    });
  },
  /* Déplacement par la barre de titre : restaure une fenêtre agrandie, aimantation haut (agrandir) / gauche / droite (moitié d'écran). */
  startDrag(w, bar, e) {
    if (e.button > 0 || e.target.closest('.l')) return;
    const sx = e.clientX, sy = e.clientY; let started = false, snap = null, dx = 0, dy = 0, dr = null;
    try { bar.setPointerCapture(e.pointerId); } catch {}
    const move = m => {
      if (!started) {
        if (Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return;
        started = true; document.body.classList.add('wm-busy');
        dr = $('#desktop').getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (sx - dr.left - w.el.offsetLeft) / (w.el.offsetWidth || 1)));
        const wasMax = w.state !== 'normal', wasSnap = !!w.prev;
        if (wasMax) this.setState(w, 'normal');
        if (wasSnap) { Object.assign(w.el.style, { width: w.prev.width, height: w.prev.height }); w.prev = null; }
        if (wasMax || wasSnap) {
          dr = $('#desktop').getBoundingClientRect();
          w.el.style.left = Math.round(sx - dr.left - ratio * w.el.offsetWidth) + 'px';
          w.el.style.top = Math.max(0, Math.round(sy - dr.top - 18)) + 'px';
        }
        dx = sx - dr.left - w.el.offsetLeft; dy = sy - dr.top - w.el.offsetTop;
      }
      const wd = w.el.offsetWidth;
      w.el.style.left = Math.min(Math.max(m.clientX - dr.left - dx, 80 - wd), dr.width - 80) + 'px';
      w.el.style.top = Math.min(Math.max(m.clientY - dr.top - dy, 0), dr.height - 40) + 'px';
      snap = m.clientY <= 6 ? 'max' : m.clientX <= 6 ? 'left' : m.clientX >= innerWidth - 7 ? 'right' : null;
      this.showSnap(snap);
    };
    const end = () => {
      bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', end); bar.removeEventListener('pointercancel', end);
      document.body.classList.remove('wm-busy'); this.showSnap(null);
      if (started && snap) this.applySnap(w, snap);
    };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
  },
  showSnap(snap) {
    const p = $('#snap-preview'); if (!p) return;
    if (!snap) { p.style.display = 'none'; return; }
    const r = $('#desktop').getBoundingClientRect(), half = r.width / 2;
    Object.assign(p.style, { display: 'block', top: r.top + 'px', height: r.height + 'px', left: (snap === 'right' ? r.left + half : r.left) + 'px', width: (snap === 'max' ? r.width : half) + 'px' });
  },
  applySnap(w, snap) {
    const A = this.area(), s = w.el.style;
    if (snap === 'max') { s.left = Math.max(10, Math.round((A.w - w.el.offsetWidth) / 2)) + 'px'; s.top = '30px'; return this.setState(w, 'max'); }
    w.prev = { width: s.width, height: s.height };
    Object.assign(s, { left: (snap === 'left' ? 0 : Math.floor(A.w / 2)) + 'px', top: '0px', width: Math.floor(A.w / 2) + 'px', height: A.h + 'px' });
  },
  /* Redimensionnement par les 4 bords et les 4 coins. */
  startResize(w, dir, e) {
    if (e.button > 0 || w.state !== 'normal') return;
    e.preventDefault(); e.stopPropagation(); this.focus(w);
    const h = e.currentTarget; try { h.setPointerCapture(e.pointerId); } catch {}
    const r0 = { l: w.el.offsetLeft, t: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight, x: e.clientX, y: e.clientY };
    const A = this.area(); w.prev = null; document.body.classList.add('wm-busy');
    const move = m => {
      const dx = m.clientX - r0.x, dy = m.clientY - r0.y;
      let l = r0.l, t = r0.t, wd = r0.w, ht = r0.h;
      if (dir.includes('e')) wd = Math.min(Math.max(this.MIN_W, r0.w + dx), A.w - r0.l);
      if (dir.includes('s')) ht = Math.min(Math.max(this.MIN_H, r0.h + dy), A.h - r0.t);
      if (dir.includes('w')) { wd = Math.min(Math.max(this.MIN_W, r0.w - dx), r0.l + r0.w); l = r0.l + r0.w - wd; }
      if (dir.includes('n')) { ht = Math.min(Math.max(this.MIN_H, r0.h - dy), r0.t + r0.h); t = r0.t + r0.h - ht; }
      Object.assign(w.el.style, { left: l + 'px', top: t + 'px', width: wd + 'px', height: ht + 'px' });
    };
    const end = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', end); h.removeEventListener('pointercancel', end);
      document.body.classList.remove('wm-busy');
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  },
};
addEventListener('resize', () => WM.clampAll());
/* Ctrl+Alt+F : plein écran / restauration de la fenêtre active. */
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey && e.altKey && e.key.toLowerCase() === 'f')) return;
  const w = [...WM.wins].find(x => x.el.classList.contains('focus') && !x.el.classList.contains('min'));
  if (w) { e.preventDefault(); WM.toggleMax(w, true); }
});

/* ---------- Dock + App Center (popup, sans fenêtre système) ---------- */
const AppCenter = {
  open: false,
  appButton(id, a, compact = false) {
    const wrap = el('div', 'ac-item' + (compact ? ' compact' : ''));
    const item = el('button', 'ac-app', `<span class="ac-icon">${appIconHTML(a, id)}</span><span>${esc(a.title)}</span>`);
    item.type = 'button'; item.title = 'Ouvrir ' + a.title;
    item.setAttribute('aria-label', 'Ouvrir ' + a.title);
    item.onclick = () => { this.toggle(false); WM.open(id); };
    const favorite = getFavorites().includes(id);
    const star = el('button', 'ac-fav' + (favorite ? ' selected' : ''), `<i class="fa-solid fa-star"></i>`);
    star.type = 'button'; star.title = favorite ? 'Retirer des favoris' : 'Ajouter aux favoris';
    star.setAttribute('aria-label', star.title);
    star.onclick = e => { e.stopPropagation(); toggleFavorite(id); };
    wrap.append(item, star);
    return wrap;
  },
  render() {
    const grid = $('#ac-grid'), recent = $('#ac-recent'), recentSection = $('#ac-recent-section');
    const q = ($('#ac-search').value || '').trim().toLocaleLowerCase();
    const selected = $('#ac-categories .selected')?.dataset.category || 'all';
    const matches = ([id, a]) => !a.hidden && a.title.toLocaleLowerCase().includes(q) &&
      (selected === 'all' || (selected === 'favorites' ? getFavorites().includes(id) : categoryOf(id) === selected));
    const entries = Object.entries(APPS).filter(matches);
    grid.innerHTML = ''; recent.innerHTML = '';
    const recentIds = getFrequent().filter(id => APPS[id] && !APPS[id].hidden &&
      APPS[id].title.toLocaleLowerCase().includes(q) && (selected === 'all' || selected === 'favorites' && getFavorites().includes(id) || categoryOf(id) === selected)).slice(0, 5);
    recentIds.forEach(id => recent.append(this.appButton(id, APPS[id], true)));
    recentSection.classList.toggle('hidden', !recentIds.length);
    entries.sort((a,b) => a[1].title.localeCompare(b[1].title, 'fr'));
    $('#ac-count').textContent = `${entries.length} application${entries.length > 1 ? 's' : ''}`;
    if (!entries.length) { grid.append(el('div', 'ac-empty', selected === 'favorites' ? 'Aucun favori pour le moment. Cliquez sur ★ pour en ajouter.' : 'Aucune application trouvée')); return; }
    entries.forEach(([id, a]) => grid.append(this.appButton(id, a)));
  },
  toggle(force) {
    this.open = typeof force === 'boolean' ? force : !this.open;
    $('#appcenter').classList.toggle('hidden', !this.open);
    $('#ac-trigger')?.classList.toggle('active', this.open);
    if (this.open) {
      $('#ac-search').value = '';
      $('#ac-categories').querySelectorAll('button').forEach(x => x.classList.toggle('selected', x.dataset.category === 'all'));
      this.render(); $('#ac-search').focus();
    }
  }
};
$('#ac-search').oninput = () => AppCenter.render();
$('#ac-categories').addEventListener('click', e => {
  const button = e.target.closest('button[data-category]');
  if (!button) return;
  $('#ac-categories').querySelectorAll('button').forEach(x => x.classList.toggle('selected', x === button));
  AppCenter.render();
});
const Dock = {
  build() {
    const d = $('#dock'); d.innerHTML = '';
    const trigger = el('button', 'di ac-trigger', `<i class="fa-solid fa-grip"></i><span class="tip">App Center</span>`);
    trigger.id = 'ac-trigger'; trigger.type = 'button'; trigger.setAttribute('aria-label', 'Ouvrir App Center');
    trigger.onclick = e => { e.stopPropagation(); AppCenter.toggle(); }; d.append(trigger);
    const running = [...WM.wins].filter(w => w.el.isConnected);
    const runningIds = [...new Set(running.map(w => w.id))];
    const priority = [...getFavorites(), ...getFrequent(), ...DEFAULT_FREQUENT];
    const pinned = priority.filter((id, i, arr) => APPS[id] && arr.indexOf(id) === i && !runningIds.includes(id)).slice(0, 7);
    const ids = [...runningIds, ...pinned];
    if (ids.length) d.append(el('span', 'dock-separator'));
    ids.forEach(id => {
      const a = APPS[id]; if (!a) return;
      const wins = running.filter(w => w.id === id);
      const i = el('button', 'di' + (wins.length ? ' run' : ''), `${appIconHTML(a, id)}<span class="tip">${esc(a.title)}${wins.length > 1 ? ' ('+wins.length+')' : ''}</span>`);
      i.type = 'button'; i.title = a.title; i.onclick = () => {
        const w = [...wins].reverse().find(x => !x.el.classList.contains('min')) || wins[wins.length - 1];
        w ? WM.focus(w) : WM.open(id);
      }; d.append(i);
    });
    AppCenter.render();
  },
};
/* Masquage automatique : le Dock (bord bas) et la barre de menu (bord haut, plein écran) reviennent au survol du bord de l'écran. */
(() => {
  const autoHide = (zone, target, cls, keep = () => false) => {
    let t = 0;
    const show = () => { clearTimeout(t); document.body.classList.add(cls); };
    const hide = () => { clearTimeout(t); t = setTimeout(() => { if (!keep() && !zone.matches(':hover') && !target.matches(':hover')) document.body.classList.remove(cls); }, 450); };
    [zone, target].forEach(n => { n.addEventListener('pointerenter', show); n.addEventListener('pointerleave', hide); });
    zone.addEventListener('pointerdown', show);
    document.addEventListener('pointerdown', e => { if (!zone.contains(e.target) && !target.contains(e.target) && !keep()) document.body.classList.remove(cls); });
  };
  autoHide($('#edge-bottom'), $('#dock'), 'dock-peek', () => AppCenter.open);
  autoHide($('#edge-top'), $('#menubar'), 'bar-peek');
})();
$('#dock').addEventListener('mousemove', e => {
  document.querySelectorAll('#dock .di').forEach(i => {
    const r = i.getBoundingClientRect(), dist = Math.abs(e.clientX - (r.left + r.width / 2));
    i.style.transform = `scale(${1 + Math.max(0, 1 - dist / 110) * .55})`;
  });
});
$('#dock').addEventListener('mouseleave', () => document.querySelectorAll('#dock .di').forEach(i => i.style.transform = ''));
document.addEventListener('click', e => {
  if (AppCenter.open && !e.target.closest('#appcenter') && !e.target.closest('#ac-trigger') && !e.target.closest('#appmenu')) AppCenter.toggle(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && AppCenter.open) { AppCenter.toggle(false); return; }
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'a') {
    e.preventDefault(); AppCenter.toggle();
  }
});

/* ---------- Menu Weed, Spotlight, horloge, thème ---------- */
const menu = $('#appmenu');
menu.innerHTML = `<div data-a="appcenter"><i class="fa-solid fa-grip"></i> Toutes les applications…</div><hr><div data-a="about"><i class="fa-solid fa-circle-info"></i> À propos de Weed OS</div><hr><div data-a="settings"><i class="fa-solid fa-gear"></i> Réglages…</div><div data-a="programs"><i class="fa-solid fa-cubes"></i> Programmes…</div><hr><div data-a="power"><i class="fa-solid fa-power-off"></i> Session et alimentation…</div>`;
const powerDialog = $('#power-dialog');
const calendarPanel = el('div', 'glass hidden', `<div class="calendar-head"><button id="cal-prev" aria-label="Mois précédent">‹</button><div><b id="cal-month"></b><small id="cal-today"></small></div><button id="cal-next" aria-label="Mois suivant">›</button></div><div class="calendar-week">${I18N.weekdayInitials().map(x=>`<span>${x}</span>`).join('')}</div><div id="calendar-days" class="calendar-days"></div><div class="calendar-foot"><span id="calendar-live-time"></span><button id="cal-today-btn">Aujourd’hui</button></div>`);
calendarPanel.id = 'calendar-panel'; document.body.append(calendarPanel);
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
function renderCalendar() {
  const now=new Date(); $('#cal-month',calendarPanel).textContent=calendarMonth.toLocaleDateString(I18N.locale(),{month:'long',year:'numeric'});
  $('#cal-today',calendarPanel).textContent=now.toLocaleDateString(I18N.locale(),{weekday:'long',day:'numeric',month:'long'});
  const days=$('#calendar-days',calendarPanel); days.innerHTML='';
  const offset=(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1).getDay()+6)%7;
  const count=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,0).getDate();
  for(let i=0;i<offset;i++)days.append(el('span','cal-empty',''));
  for(let d=1;d<=count;d++){const dt=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),d);const b=el('button','cal-day'+(dt.toDateString()===now.toDateString()?' today':''),String(d));b.type='button';b.onclick=()=>{calendarMonth=new Date(dt.getFullYear(),dt.getMonth(),1);renderCalendar();};days.append(b);}
}
function updateCalendarTime(){ $('#calendar-live-time',calendarPanel).textContent=new Date().toLocaleTimeString(I18N.locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
$('#cal-prev',calendarPanel).onclick=()=>{calendarMonth.setMonth(calendarMonth.getMonth()-1);renderCalendar();};
$('#cal-next',calendarPanel).onclick=()=>{calendarMonth.setMonth(calendarMonth.getMonth()+1);renderCalendar();};
$('#cal-today-btn',calendarPanel).onclick=()=>{const n=new Date();calendarMonth=new Date(n.getFullYear(),n.getMonth(),1);renderCalendar();};
renderCalendar(); updateCalendarTime(); setInterval(updateCalendarTime,1000);
$('#clock').onclick=e=>{e.stopPropagation();calendarPanel.classList.toggle('hidden');renderCalendar();};
$('#clock').setAttribute('role','button');$('#clock').setAttribute('tabindex','0');$('#clock').title='Ouvrir le calendrier';
$('#clock').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();calendarPanel.classList.toggle('hidden');renderCalendar();}};

$('#apple').onclick = e => { e.stopPropagation(); powerDialog.classList.add('hidden'); menu.classList.toggle('hidden'); };
$('#profile-button').onclick = e => { e.stopPropagation(); menu.classList.add('hidden'); WM.open('settings'); };
menu.onclick = e => { const a = e.target.closest('div')?.dataset.a; menu.classList.add('hidden'); if (a === 'power') powerDialog.classList.toggle('hidden'); else if (a === 'appcenter') { e.stopPropagation(); AppCenter.toggle(true); } else if (a) WM.open(a); };
$('#power-dismiss').onclick = () => powerDialog.classList.add('hidden');
document.addEventListener('click', e => { if (!e.target.closest('#appmenu') && !e.target.closest('#apple')) menu.classList.add('hidden'); if (!e.target.closest('#power-dialog') && !e.target.closest('#appmenu')) powerDialog.classList.add('hidden'); if (!e.target.closest('#calendar-panel') && !e.target.closest('#clock')) calendarPanel.classList.add('hidden'); });


function runShutdownAnimation(action) {
  const screen = $('#shutdown-screen');
  const label = $('#shutdown-label'), status = $('#shutdown-status');
  Sound.play('shutdown');
  const sx = SHELL_TEXT[store.get('ui.lang','fr')] || SHELL_TEXT.fr;
  label.textContent = action === 'reboot' ? sx.restarting : sx.shutdown;
  status.textContent = 'Fermeture des fenêtres et des services…';
  screen.classList.remove('hidden');
  document.body.classList.add('system-shutting-down');
  const messages = ['Fermeture des fenêtres…', 'Arrêt des services Weed OS…', 'Transmission au système hôte…'];
  let i = 0;
  const timer = setInterval(() => {
    if (i < messages.length) status.textContent = messages[i++];
    else {
      clearInterval(timer);
      status.textContent = 'Demande acceptée par le Weed Kernel. En attente de l’arrêt du système hôte…';
      screen.classList.add('shutdown-final');
    }
  }, 900);
}
$('#power-dialog').addEventListener('click', async e => {
  const btn = e.target.closest('[data-power]'); if (!btn) return;
  const action = btn.dataset.power;
  if (action === 'logout') { $('#power-dialog').classList.add('hidden'); Session.logout(); return; }
  if (Session.user?.role !== 'admin') { notify('Autorisation requise', 'Seul un administrateur peut arrêter ou redémarrer le système.'); return; }
  btn.disabled = true;
  try {
    await sys('power', { action });
    $('#power-dialog').classList.add('hidden');
    runShutdownAnimation(action);
  } catch (err) {
    btn.disabled = false;
    notify('Action impossible', err.message);
  }
});

const spot = $('#spotlight'), sin = $('#spot-in'), sres = $('#spot-res'); let sel = 0, hits = [];
function spotRender() {
  const q = sin.value.toLowerCase();
  hits = Object.entries(APPS).filter(([k, a]) => !a.hidden && a.title.toLowerCase().includes(q)).slice(0, 7);
  sel = Math.min(sel, Math.max(0, hits.length - 1));
  sres.innerHTML = hits.map(([k, a], i) => `<div class="${i === sel ? 'sel' : ''}" data-k="${esc(k)}">${appIconHTML(a, k)}${esc(a.title)}</div>`).join('');
}
const spotToggle = on => { spot.classList.toggle('hidden', !on); if (on) { sin.value = ''; sel = 0; spotRender(); sin.focus(); } };
$('#spot-btn').onclick = e => { e.stopPropagation(); spotToggle(true); };
spot.onclick = e => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) { spotToggle(false); WM.open(k); } else if (e.target === spot) spotToggle(false); };
sin.oninput = () => { sel = 0; spotRender(); };
sin.onkeydown = e => {
  if (e.key === 'ArrowDown') { sel = Math.min(hits.length - 1, sel + 1); spotRender(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); spotRender(); e.preventDefault(); }
  if (e.key === 'Enter' && hits[sel]) { spotToggle(false); WM.open(hits[sel][0]); }
};
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey || e.altKey) && e.code === 'Space') { e.preventDefault(); spotToggle(spot.classList.contains('hidden')); }
  if (e.key === 'Escape') spotToggle(false);
});

function applyTheme() {
  const r = document.documentElement.style;
  r.setProperty('--h', store.get('h', 145)); r.setProperty('--blur', store.get('blur', 24) + 'px');
  const wallpaper = store.get('wp', 'w1');
  $('#wallpaper').className = /^w(?:[1-9]|1[0-9]|20)$/.test(wallpaper) ? wallpaper : (wallpaper === 'custom' && store.get('wp.custom', '') ? 'custom' : 'w1');
  if ($('#wallpaper').classList.contains('custom')) $('#wallpaper').style.backgroundImage = `url("${store.get('wp.custom', '')}")`;
  else $('#wallpaper').style.backgroundImage = '';
  const fit = store.get('wp.fit', 'cover'), wp = $('#wallpaper');
  wp.style.backgroundSize = fit === 'fill' ? '100% 100%' : fit === 'tile' ? 'auto' : fit === 'center' ? 'auto' : fit === 'contain' ? 'contain' : 'cover';
  wp.style.backgroundPosition = 'center'; wp.style.backgroundRepeat = fit === 'tile' ? 'repeat' : 'no-repeat';
  document.documentElement.dataset.theme = store.get('ui.theme', 'dark');
  document.documentElement.lang = store.get('ui.lang', 'fr');
  document.documentElement.dir = store.get('ui.lang', 'fr') === 'ar' ? 'rtl' : 'ltr';
  translateShell();
  const lang = UI_LANG[store.get('ui.lang','fr')] || UI_LANG.fr;
  Object.keys(APP_CATEGORIES).forEach(k => { if (lang.categories?.[k]) APP_CATEGORIES[k].label = lang.categories[k]; });
  if (typeof I18N !== 'undefined') I18N.apply();
}
function clock() { $('#clock').textContent = new Date().toLocaleString((UI_LANG[store.get('ui.lang','fr')] || UI_LANG.fr).locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
setInterval(clock, 10000); clock(); applyTheme();

/* ---------- Session (connexion) ---------- */
function updateProfileAvatar() {
  const img = $('#user-avatar'); if (!img) return;
  const avatar = store.get('profile.avatar', '');
  img.onerror = () => { img.onerror = null; img.src = 'assets/favicon.png'; }; img.src = avatar || 'assets/favicon.png'; img.classList.toggle('has-avatar', !!avatar);
}
const Session = {
  user: null, setup: false,
  show() {
    [...WM.wins].forEach(w => WM.close(w)); DesktopIcons.stop(); this.user = null; $('#usr').textContent = '';
    $('#login').classList.remove('hidden');
    $('#lt').textContent = 'Weed OS';
    $('#ls').textContent = this.setup ? 'Bienvenue ! Créez le compte administrateur.' : 'Connectez-vous pour continuer';
    $('#lb').dataset.setup = this.setup ? '1' : '0'; $('#lb').textContent = this.setup ? 'Créer le compte' : 'Se connecter'; translateShell();
    $('#lp').autocomplete = this.setup ? 'new-password' : 'current-password';
    $('#le').textContent = ''; $('#lp').value = ''; $('#lu').focus();
  },
  async enter(user) {
    this.user = user; this.setup = false; $('#login').classList.add('hidden'); $('#usr').textContent = user.name;
    try {
      const saved = await api('/api/preferences/load');
      if (Object.keys(saved).length) Object.entries(saved).forEach(([k,v]) => { try { localStorage.setItem(k, String(v)); } catch(e) {} });
      else ['h','blur','wp','wp.custom','wp.fit','ui.theme','ui.lang','sound.on','sound.vol','profile.avatar',FAVORITES_KEY,FREQUENT_KEY].forEach(k => {
        const v = store.get(k, null); if (v !== null) api('/api/preferences/save', {key:k,value:v}).catch(()=>{});
      });
    } catch(e) {}
    applyTheme(); updateProfileAvatar();
    await loadApps(); DesktopIcons.start(); WM.open('finder'); notify('Bienvenue', 'Session ouverte : ' + user.name);
  },
  async logout() { try { await api('/api/auth/logout'); } catch (e) {} this.show(); },
};
$('#lf').onsubmit = async e => {
  e.preventDefault(); $('#le').textContent = '';
  try {
    const u = await api(Session.setup ? '/api/auth/setup' : '/api/auth/login', { name: $('#lu').value, pass: $('#lp').value });
    await Session.enter(u);
  } catch (er) { $('#le').textContent = er.message; }
};

/* ---------- Démarrage ---------- */
// Le son de bienvenue est joué par le Kernel (ALSA sur le système réel, lecteur de l'hôte en mode dev),
// sans aucun clic. Le navigateur ne le joue qu'en dernier recours, si le Kernel ne l'a pas pris en charge
// (aucun lecteur, carte son absente...) : une politique d'autoplay peut alors exiger un premier geste.
const bootStatus = api('/api/auth/status').then(st => {
  const ss = st.startupSound || {};
  if (ss.enabled && !ss.native) Sound.play('startup', true, ss.volume / 100);
  return st;
});
setTimeout(async () => {
  $('#boot').classList.add('off');
  try {
    const st = await bootStatus;
    Session.setup = st.setup;
    st.user ? await Session.enter(st.user) : Session.show();
  } catch (e) { Session.show(); $('#le').textContent = 'Kernel injoignable : ' + e.message; }
}, 1800);
