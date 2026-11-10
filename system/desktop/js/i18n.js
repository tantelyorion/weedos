'use strict';
/* Weed OS - traduction centrale du bureau.
 *
 * Le français est la langue source. Chaque entrée de ROWS est :
 *   [français, en, es, zh, hi, ar, de, pt, mg]
 * Le traducteur parcourt le DOM (texte, title, placeholder, aria-label, alt), surveille les
 * changements (MutationObserver) et traduit aussi les titres d'applications, confirm(), alert()
 * et prompt(). Pour ajouter une traduction : ajouter une ligne dans ROWS, rien d'autre.
 * Les textes déjà traduits par une application (services, sessions…) ne correspondent à aucune
 * clé française et ne sont donc jamais modifiés.
 */
(function () {
  const LANGS = ['en', 'es', 'zh', 'hi', 'ar', 'de', 'pt', 'mg'];
  const ROWS = [
    /* ---- Pictoweed ---- */
    ["Bibliothèque", "Library", "Biblioteca", "图库", "लाइब्रेरी", "المكتبة", "Bibliothek", "Biblioteca", "Tahiry sary"],
    ["Toutes les photos", "All photos", "Todas las fotos", "所有照片", "सभी फ़ोटो", "كل الصور", "Alle Fotos", "Todas as fotografias", "Sary rehetra"],
    ["Favoris", "Favorites", "Favoritos", "收藏", "पसंदीदा", "المفضلة", "Favoriten", "Favoritos", "Tiana"],
    ["Dossiers", "Folders", "Carpetas", "文件夹", "फ़ोल्डर", "المجلدات", "Ordner", "Pastas", "Lahatahiry"],
    ["Albums", "Albums", "Álbumes", "相册", "एल्बम", "الألبومات", "Alben", "Álbuns", "Rakitsary"],
    ["Nouvel album", "New album", "Nuevo álbum", "新建相册", "नया एल्बम", "ألبوم جديد", "Neues Album", "Novo álbum", "Rakitsary vaovao"],
    ["Nom de l'album", "Album name", "Nombre del álbum", "相册名称", "एल्बम का नाम", "اسم الألبوم", "Albumname", "Nome do álbum", "Anaran’ny rakitsary"],
    ["Rechercher une photo…", "Search photos…", "Buscar fotos…", "搜索照片…", "फ़ोटो खोजें…", "ابحث عن صورة…", "Fotos suchen…", "Pesquisar fotografias…", "Hitady sary…"],
    ["Trier", "Sort", "Ordenar", "排序", "क्रमबद्ध करें", "فرز", "Sortieren", "Ordenar", "Alahatra"],
    ["Plus récentes", "Newest", "Más recientes", "最新", "सबसे नए", "الأحدث", "Neueste", "Mais recentes", "Vaovao indrindra"],
    ["Taille des miniatures", "Thumbnail size", "Tamaño de las miniaturas", "缩略图大小", "थंबनेल आकार", "حجم الصور المصغّرة", "Vorschaugröße", "Tamanho das miniaturas", "Habetsahan’ny sary kely"],
    ["Diaporama", "Slideshow", "Presentación", "幻灯片放映", "स्लाइडशो", "عرض الشرائح", "Diashow", "Apresentação", "Fampisehoana mifandimby"],
    ["Favori", "Favorite", "Favorito", "收藏", "पसंदीदा", "مفضلة", "Favorit", "Favorito", "Tiana"],
    ["Ajouter à un album", "Add to an album", "Añadir a un álbum", "添加到相册", "एल्बम में जोड़ें", "إضافة إلى ألبوم", "Zu einem Album hinzufügen", "Adicionar a um álbum", "Ampio amin’ny rakitsary"],
    ["Ajouter à l'album…", "Add to album…", "Añadir al álbum…", "添加到相册…", "एल्बम में जोड़ें…", "إضافة إلى الألبوم…", "Zum Album hinzufügen…", "Adicionar ao álbum…", "Ampio amin’ny rakitsary…"],
    ["Retirer de l'album", "Remove from album", "Quitar del álbum", "从相册移除", "एल्बम से हटाएँ", "إزالة من الألبوم", "Aus Album entfernen", "Remover do álbum", "Esory amin’ny rakitsary"],
    ["Retoucher", "Edit", "Retocar", "修图", "संपादित करें", "تعديل", "Bearbeiten", "Retocar", "Hanitsy"],
    ["Analyse de la bibliothèque…", "Scanning the library…", "Analizando la biblioteca…", "正在扫描图库…", "लाइब्रेरी स्कैन हो रही है…", "جارٍ فحص المكتبة…", "Bibliothek wird durchsucht…", "A analisar a biblioteca…", "Mamantatra ny tahiry sary…"],
    ["Cet album existe déjà.", "This album already exists.", "Este álbum ya existe.", "此相册已存在。", "यह एल्बम पहले से मौजूद है।", "هذا الألبوم موجود بالفعل.", "Dieses Album existiert bereits.", "Este álbum já existe.", "Efa misy io rakitsary io."],
    ["Aucune photo ici. Importez des images ou ouvrez un autre dossier.", "No photos here. Import images or open another folder.", "No hay fotos aquí. Importa imágenes o abre otra carpeta.", "此处没有照片。请导入图片或打开其他文件夹。", "यहाँ कोई फ़ोटो नहीं। चित्र आयात करें या कोई अन्य फ़ोल्डर खोलें।", "لا توجد صور هنا. استورد صوراً أو افتح مجلداً آخر.", "Hier sind keine Fotos. Bilder importieren oder einen anderen Ordner öffnen.", "Não há fotografias aqui. Importe imagens ou abra outra pasta.", "Tsy misy sary eto. Ampidiro ny sary na sokafy lahatahiry hafa."],
    ["Déposez vos photos pour les importer", "Drop your photos to import them", "Suelta tus fotos para importarlas", "拖放照片即可导入", "आयात करने के लिए अपनी फ़ोटो यहाँ छोड़ें", "أفلت صورك لاستيرادها", "Fotos hier ablegen, um sie zu importieren", "Largue as suas fotografias para as importar", "Apetraho eto ny sary hampidirina"],
    ["Lecture / pause", "Play / pause", "Reproducir / pausa", "播放 / 暂停", "चलाएँ / रोकें", "تشغيل / إيقاف مؤقت", "Wiedergabe / Pause", "Reproduzir / pausa", "Alefaso / ajanony"],
    ["Enregistrement…", "Saving…", "Guardando…", "正在保存…", "सहेजा जा रहा है…", "جارٍ الحفظ…", "Wird gespeichert…", "A guardar…", "Mitahiry…"],
    ["Image illisible", "Unreadable image", "Imagen ilegible", "无法读取图片", "चित्र पढ़ा नहीं जा सका", "صورة غير قابلة للقراءة", "Bild nicht lesbar", "Imagem ilegível", "Tsy azo vakiana ny sary"],
    ["Encodage impossible", "Encoding failed", "Codificación imposible", "无法编码", "एन्कोडिंग संभव नहीं", "تعذّر الترميز", "Kodierung nicht möglich", "Codificação impossível", "Tsy azo ny fanamafisana"],
    ["Abandonner les modifications non enregistrées ?", "Discard unsaved changes?", "¿Descartar los cambios sin guardar?", "放弃未保存的修改？", "बिना सहेजे बदलाव छोड़ें?", "تجاهل التعديلات غير المحفوظة؟", "Nicht gespeicherte Änderungen verwerfen?", "Descartar as alterações não guardadas?", "Foanana ve ny fanovana tsy voatahiry?"],
    ["Rétablir", "Redo", "Rehacer", "重做", "फिर से करें", "إعادة", "Wiederholen", "Refazer", "Averina"],
    ["Maintenir pour voir l'original", "Hold to see the original", "Mantén pulsado para ver el original", "按住查看原图", "मूल देखने के लिए दबाए रखें", "اضغط مطولاً لعرض الأصل", "Gedrückt halten, um das Original zu sehen", "Mantenha premido para ver o original", "Tazony hijerena ny tany am-boalohany"],
    ["Original", "Original", "Original", "原图", "मूल", "الأصل", "Original", "Original", "Tany am-boalohany"],
    ["Tout réinitialiser", "Reset all", "Restablecer todo", "全部重置", "सब रीसेट करें", "إعادة تعيين الكل", "Alles zurücksetzen", "Repor tudo", "Avereno daholo"],
    ["Enregistrer une copie", "Save a copy", "Guardar una copia", "另存为副本", "प्रति सहेजें", "حفظ نسخة", "Kopie speichern", "Guardar uma cópia", "Tehirizo ny dika"],
    ["Géométrie", "Geometry", "Geometría", "几何", "ज्यामिति", "الهندسة", "Geometrie", "Geometria", "Endrika"],
    ["Filtres", "Filters", "Filtros", "滤镜", "फ़िल्टर", "المرشحات", "Filter", "Filtros", "Sivana"],
    ["Miroir H", "Flip H", "Espejo H", "水平翻转", "क्षैतिज पलटें", "قلب أفقي", "Horizontal spiegeln", "Espelho H", "Fitaratra H"],
    ["Miroir V", "Flip V", "Espejo V", "垂直翻转", "ऊर्ध्वाधर पलटें", "قلب عمودي", "Vertikal spiegeln", "Espelho V", "Fitaratra V"],
    ["Recadrage", "Crop", "Recorte", "裁剪", "क्रॉप", "القص", "Zuschneiden", "Recorte", "Fanapahana"],
    ["Libre", "Free", "Libre", "自由", "मुक्त", "حر", "Frei", "Livre", "Malalaka"],
    ["1:1 carré", "1:1 square", "1:1 cuadrado", "1:1 正方形", "1:1 वर्ग", "1:1 مربع", "1:1 quadratisch", "1:1 quadrado", "1:1 efa-joro"],
    ["3:4 portrait", "3:4 portrait", "3:4 vertical", "3:4 竖版", "3:4 पोर्ट्रेट", "3:4 عمودي", "3:4 Hochformat", "3:4 retrato", "3:4 mitsangana"],
    ["2:3 portrait", "2:3 portrait", "2:3 vertical", "2:3 竖版", "2:3 पोर्ट्रेट", "2:3 عمودي", "2:3 Hochformat", "2:3 retrato", "2:3 mitsangana"],
    ["Recadrer", "Crop", "Recortar", "裁剪", "क्रॉप करें", "قص", "Zuschneiden", "Recortar", "Tapaho"],
    ["Appliquer", "Apply", "Aplicar", "应用", "लागू करें", "تطبيق", "Anwenden", "Aplicar", "Ampiharo"],
    ["Faites glisser sur l'image pour choisir la zone.", "Drag on the image to choose the area.", "Arrastra sobre la imagen para elegir la zona.", "在图片上拖动以选择区域。", "क्षेत्र चुनने के लिए चित्र पर खींचें।", "اسحب فوق الصورة لاختيار المنطقة.", "Auf dem Bild ziehen, um den Bereich zu wählen.", "Arraste sobre a imagem para escolher a área.", "Mamintsa eo ambonin’ny sary hisafidianana ny faritra."],
    ["Luminosité", "Brightness", "Brillo", "亮度", "चमक", "السطوع", "Helligkeit", "Luminosidade", "Hamaivanana"],
    ["Contraste", "Contrast", "Contraste", "对比度", "कंट्रास्ट", "التباين", "Kontrast", "Contraste", "Fifanohitra"],
    ["Saturation", "Saturation", "Saturación", "饱和度", "संतृप्ति", "التشبّع", "Sättigung", "Saturação", "Fahamaroan’ny loko"],
    ["Chaleur", "Warmth", "Calidez", "色温", "गर्माहट", "الدفء", "Wärme", "Calor", "Hafanana"],
    ["Ombres", "Shadows", "Sombras", "阴影", "छायाएँ", "الظلال", "Schatten", "Sombras", "Aloka"],
    ["Hautes lumières", "Highlights", "Altas luces", "高光", "हाइलाइट", "الإضاءات العالية", "Lichter", "Realces", "Hazavana"],
    ["Netteté", "Sharpness", "Nitidez", "锐度", "तीक्ष्णता", "الحدّة", "Schärfe", "Nitidez", "Fanamafisana"],
    ["Vignettage", "Vignette", "Viñeta", "暗角", "विनेट", "التظليل الطرفي", "Vignette", "Vinheta", "Vignette"],
    ["Réinitialiser les réglages", "Reset adjustments", "Restablecer los ajustes", "重置调整", "समायोजन रीसेट करें", "إعادة ضبط التعديلات", "Anpassungen zurücksetzen", "Repor os ajustes", "Avereno ny fanitsiana"],
    ["Noir et blanc", "Black and white", "Blanco y negro", "黑白", "श्वेत-श्याम", "أبيض وأسود", "Schwarzweiß", "Preto e branco", "Mainty sy fotsy"],
    ["Noir intense", "Deep black", "Negro intenso", "深黑", "गहरा काला", "أسود حاد", "Tiefschwarz", "Preto intenso", "Mainty mavesatra"],
    ["Sépia", "Sepia", "Sepia", "棕褐色", "सेपिया", "بني داكن", "Sepia", "Sépia", "Sepia"],
    ["Vintage", "Vintage", "Vintage", "复古", "विंटेज", "قديم", "Vintage", "Vintage", "Taloha"],
    ["Délavé", "Faded", "Desvaído", "褪色", "फीका", "باهت", "Verblasst", "Desbotado", "Nikimpy"],
    ["Éclatant", "Vivid", "Vívido", "鲜艳", "चटकीला", "نابض", "Lebendig", "Vívido", "Mamirapiratra"],
    ["Froid", "Cool", "Frío", "冷色", "ठंडा", "بارد", "Kühl", "Frio", "Mangatsiaka"],
    ["Chaud", "Warm", "Cálido", "暖色", "गरम", "دافئ", "Warm", "Quente", "Mafana"],
    /* ---- Fenêtres, menus, barre du haut ---- */
    ['Enregistrer', 'Save', 'Guardar', '保存', 'सहेजें', 'حفظ', 'Speichern', 'Guardar', 'Tehirizo'],
    ['Créer ZIP', 'Create ZIP', 'Crear ZIP', '创建 ZIP', 'ZIP बनाएँ', 'إنشاء ZIP', 'ZIP erstellen', 'Criar ZIP', 'Mamoròna ZIP'],
    ['Nom de l\'archive', 'Archive name', 'Nombre del archivo', '压缩包名称', 'संग्रह का नाम', 'اسم الأرشيف', 'Archivname', 'Nome do arquivo', 'Anaran’ny arisiva'],
    ['Réglage réservé à l’administrateur.', 'Setting reserved for the administrator.', 'Ajuste reservado al administrador.', '此设置仅限管理员。', 'यह सेटिंग केवल व्यवस्थापक के लिए है।', 'هذا الإعداد مخصّص للمسؤول.', 'Einstellung dem Administrator vorbehalten.', 'Definição reservada ao administrador.', 'Ny mpitantana ihany no afaka manova io fikirana io.'],
    ['Le son de démarrage est joué par le système au lancement, avant toute connexion : son réglage s\'applique à tous les comptes et appartient à l\'administrateur. Fichiers MP3 :', 'The startup sound is played by the system at launch, before any sign-in: its setting applies to all accounts and belongs to the administrator. MP3 files:', 'El sistema reproduce el sonido de inicio al arrancar, antes de cualquier inicio de sesión: su ajuste se aplica a todas las cuentas y corresponde al administrador. Archivos MP3:', '启动音由系统在启动时播放，早于任何登录：其设置适用于所有账户，由管理员管理。MP3 文件：', 'स्टार्टअप ध्वनि सिस्टम द्वारा लॉन्च के समय, किसी भी साइन-इन से पहले चलाई जाती है: इसकी सेटिंग सभी खातों पर लागू होती है और व्यवस्थापक के अधीन है। MP3 फ़ाइलें:', 'يشغّل النظام صوت بدء التشغيل عند الإقلاع قبل أي تسجيل دخول: ويسري إعداده على جميع الحسابات ويعود إلى المسؤول. ملفات MP3:', 'Der Startklang wird beim Start vom System vor jeder Anmeldung abgespielt: Seine Einstellung gilt für alle Konten und liegt beim Administrator. MP3-Dateien:', 'O som de arranque é reproduzido pelo sistema ao iniciar, antes de qualquer início de sessão: a sua definição aplica-se a todas as contas e pertence ao administrador. Ficheiros MP3:', 'Ny rafitra no mampihaino ny feon’ny fandehanana rehefa mandeha, alohan’ny fidirana rehetra: mihatra amin’ny kaonty rehetra ny fikirana ary an’ny mpitantana. Rakitra MP3:'],
    ['Calculatrice', 'Calculator', 'Calculadora', '计算器', 'कैलकुलेटर', 'الآلة الحاسبة', 'Rechner', 'Calculadora', 'Milina mpanao kajy'],
    ['Calendrier', 'Calendar', 'Calendario', '日历', 'कैलेंडर', 'التقويم', 'Kalender', 'Calendário', 'Kalandrie'],
    ['Lecteur PDF', 'PDF reader', 'Lector de PDF', 'PDF 阅读器', 'PDF रीडर', 'قارئ PDF', 'PDF-Reader', 'Leitor de PDF', 'Mpamaky PDF'],
    ['Application introuvable', 'Application not found', 'Aplicación no encontrada', '未找到应用', 'ऐप नहीं मिला', 'التطبيق غير موجود', 'Anwendung nicht gefunden', 'Aplicação não encontrada', 'Tsy hita ny rindranasa'],
    ['Type de fichier inconnu', 'Unknown file type', 'Tipo de archivo desconocido', '未知文件类型', 'अज्ञात फ़ाइल प्रकार', 'نوع ملف غير معروف', 'Unbekannter Dateityp', 'Tipo de ficheiro desconhecido', 'Karazan-drakitra tsy fantatra'],
    ['Fermer', 'Close', 'Cerrar', '关闭', 'बंद करें', 'إغلاق', 'Schließen', 'Fechar', 'Hidio'],
    ['Réduire', 'Minimize', 'Minimizar', '最小化', 'छोटा करें', 'تصغير', 'Minimieren', 'Minimizar', 'Ahena'],
    ['Agrandir (Alt+clic : plein écran)', 'Maximize (Alt+click: full screen)', 'Maximizar (Alt+clic: pantalla completa)', '最大化（Alt+点击：全屏）', 'बड़ा करें (Alt+क्लिक: पूर्ण स्क्रीन)', 'تكبير (Alt+نقر: ملء الشاشة)', 'Maximieren (Alt+Klick: Vollbild)', 'Maximizar (Alt+clique: ecrã inteiro)', 'Hanitatra (Alt+tsindrio: efijery feno)'],
    ['Ouvrir', 'Open', 'Abrir', '打开', 'खोलें', 'فتح', 'Öffnen', 'Abrir', 'Sokafy'],
    ['Ouvrir le dossier', 'Open folder', 'Abrir carpeta', '打开文件夹', 'फ़ोल्डर खोलें', 'فتح المجلد', 'Ordner öffnen', 'Abrir pasta', 'Sokafy ny lahatahiry'],
    ['Ouvrir App Center', 'Open App Center', 'Abrir Centro de aplicaciones', '打开应用中心', 'ऐप केंद्र खोलें', 'فتح مركز التطبيقات', 'App-Center öffnen', 'Abrir Centro de aplicações', 'Sokafy ny Foiben’ny rindranasa'],
    ['Ouvrir le dossier Bureau', 'Open the Desktop folder', 'Abrir la carpeta Escritorio', '打开桌面文件夹', 'डेस्कटॉप फ़ोल्डर खोलें', 'فتح مجلد سطح المكتب', 'Ordner Schreibtisch öffnen', 'Abrir a pasta Ambiente de trabalho', 'Sokafy ny lahatahiry Birao'],
    ['Ouvrir avec…', 'Open with…', 'Abrir con…', '打开方式…', 'इसके साथ खोलें…', 'فتح باستخدام…', 'Öffnen mit…', 'Abrir com…', 'Sokafy amin’ny…'],
    ['Changer le fond d’écran…', 'Change wallpaper…', 'Cambiar el fondo de pantalla…', '更换壁纸…', 'वॉलपेपर बदलें…', 'تغيير الخلفية…', 'Hintergrundbild ändern…', 'Alterar o papel de parede…', 'Ovay ny sary ambadika…'],
    ['Retirer des favoris', 'Remove from favorites', 'Quitar de favoritos', '从收藏中移除', 'पसंदीदा से हटाएँ', 'إزالة من المفضلة', 'Aus Favoriten entfernen', 'Remover dos favoritos', 'Esory amin’ny tiana'],
    ['Ajouter aux favoris', 'Add to favorites', 'Añadir a favoritos', '添加到收藏', 'पसंदीदा में जोड़ें', 'إضافة إلى المفضلة', 'Zu Favoriten hinzufügen', 'Adicionar aos favoritos', 'Ampio amin’ny tiana'],
    ['Aucun favori pour le moment. Cliquez sur ★ pour en ajouter.', 'No favorites yet. Click ★ to add some.', 'Aún no hay favoritos. Haz clic en ★ para añadir.', '暂无收藏。点击 ★ 添加。', 'अभी कोई पसंदीदा नहीं। जोड़ने के लिए ★ पर क्लिक करें।', 'لا توجد مفضلات حالياً. انقر على ★ للإضافة.', 'Noch keine Favoriten. Auf ★ klicken, um welche hinzuzufügen.', 'Ainda não há favoritos. Clique em ★ para adicionar.', 'Mbola tsy misy tiana. Tsindrio ny ★ hanampiana.'],
    ['Aucune application trouvée', 'No applications found', 'No se encontraron aplicaciones', '未找到应用', 'कोई ऐप नहीं मिला', 'لم يتم العثور على تطبيقات', 'Keine Anwendungen gefunden', 'Nenhuma aplicação encontrada', 'Tsy nahitana rindranasa'],
    ['Toutes les applications…', 'All applications…', 'Todas las aplicaciones…', '所有应用…', 'सभी ऐप…', 'كل التطبيقات…', 'Alle Anwendungen…', 'Todas as aplicações…', 'Rindranasa rehetra…'],
    ['À propos de Weed OS', 'About Weed OS', 'Acerca de Weed OS', '关于 Weed OS', 'Weed OS के बारे में', 'حول Weed OS', 'Über Weed OS', 'Sobre o Weed OS', 'Momba ny Weed OS'],
    ['Réglages…', 'Settings…', 'Ajustes…', '设置…', 'सेटिंग्स…', 'الإعدادات…', 'Einstellungen…', 'Definições…', 'Fikirana…'],
    ['Programmes…', 'Programs…', 'Programas…', '程序…', 'प्रोग्राम…', 'البرامج…', 'Programme…', 'Programas…', 'Programa…'],
    ['Session et alimentation…', 'Session and power…', 'Sesión y energía…', '会话与电源…', 'सत्र और पावर…', 'الجلسة والطاقة…', 'Sitzung und Energie…', 'Sessão e energia…', 'Fivoriana sy herinaratra…'],
    ['Menu Weed', 'Weed menu', 'Menú Weed', 'Weed 菜单', 'Weed मेनू', 'قائمة Weed', 'Weed-Menü', 'Menu Weed', 'Sakafo Weed'],
    ['Profil utilisateur', 'User profile', 'Perfil de usuario', '用户资料', 'उपयोगकर्ता प्रोफ़ाइल', 'ملف المستخدم', 'Benutzerprofil', 'Perfil do utilizador', 'Mombamomba ny mpampiasa'],
    ['Spotlight (Ctrl+Espace)', 'Spotlight (Ctrl+Space)', 'Spotlight (Ctrl+Espacio)', 'Spotlight（Ctrl+空格）', 'Spotlight (Ctrl+स्पेस)', 'Spotlight (Ctrl+مسافة)', 'Spotlight (Strg+Leertaste)', 'Spotlight (Ctrl+Espaço)', 'Spotlight (Ctrl+Habaka)'],
    ['Ouvrir le calendrier', 'Open the calendar', 'Abrir el calendario', '打开日历', 'कैलेंडर खोलें', 'فتح التقويم', 'Kalender öffnen', 'Abrir o calendário', 'Sokafy ny kalandrie'],
    ['Mois précédent', 'Previous month', 'Mes anterior', '上个月', 'पिछला महीना', 'الشهر السابق', 'Vorheriger Monat', 'Mês anterior', 'Volana teo aloha'],
    ['Mois suivant', 'Next month', 'Mes siguiente', '下个月', 'अगला महीना', 'الشهر التالي', 'Nächster Monat', 'Mês seguinte', 'Volana manaraka'],
    ['Aujourd’hui', 'Today', 'Hoy', '今天', 'आज', 'اليوم', 'Heute', 'Hoje', 'Androany'],
    ['Session et alimentation', 'Session and power', 'Sesión y energía', '会话与电源', 'सत्र और पावर', 'الجلسة والطاقة', 'Sitzung und Energie', 'Sessão e energia', 'Fivoriana sy herinaratra'],
    ['Se déconnecter', 'Log out', 'Cerrar sesión', '退出登录', 'साइन आउट', 'تسجيل الخروج', 'Abmelden', 'Terminar sessão', 'Hivoaka'],
    ['Redémarrer', 'Restart', 'Reiniciar', '重新启动', 'पुनः प्रारंभ', 'إعادة التشغيل', 'Neu starten', 'Reiniciar', 'Avereno alefa'],
    ['Éteindre', 'Shut down', 'Apagar', '关机', 'बंद करें', 'إيقاف التشغيل', 'Ausschalten', 'Desligar', 'Vonoy'],
    ['Fermeture des fenêtres et des services…', 'Closing windows and services…', 'Cerrando ventanas y servicios…', '正在关闭窗口和服务…', 'विंडो और सेवाएँ बंद हो रही हैं…', 'جارٍ إغلاق النوافذ والخدمات…', 'Fenster und Dienste werden geschlossen…', 'A fechar janelas e serviços…', 'Ahidy ny varavarankely sy ny tolotra…'],
    ['Fermeture des fenêtres…', 'Closing windows…', 'Cerrando ventanas…', '正在关闭窗口…', 'विंडो बंद हो रही हैं…', 'جارٍ إغلاق النوافذ…', 'Fenster werden geschlossen…', 'A fechar janelas…', 'Ahidy ny varavarankely…'],
    ['Arrêt des services Weed OS…', 'Stopping Weed OS services…', 'Deteniendo los servicios de Weed OS…', '正在停止 Weed OS 服务…', 'Weed OS सेवाएँ रोकी जा रही हैं…', 'جارٍ إيقاف خدمات Weed OS…', 'Weed-OS-Dienste werden beendet…', 'A parar os serviços do Weed OS…', 'Ajanona ny tolotra Weed OS…'],
    ['Transmission au système hôte…', 'Passing the request to the host system…', 'Transmitiendo al sistema anfitrión…', '正在传递给主机系统…', 'होस्ट सिस्टम को अनुरोध भेजा जा रहा है…', 'جارٍ إرسال الطلب إلى النظام المضيف…', 'Anfrage wird an das Hostsystem übergeben…', 'A transmitir ao sistema anfitrião…', 'Ampitain’ny solosaina fototra…'],
    ['Demande acceptée par le Weed Kernel. En attente de l’arrêt du système hôte…', 'Request accepted by the Weed Kernel. Waiting for the host system to stop…', 'Solicitud aceptada por el Weed Kernel. Esperando el apagado del sistema anfitrión…', 'Weed Kernel 已接受请求。正在等待主机系统关闭…', 'Weed Kernel ने अनुरोध स्वीकार किया। होस्ट सिस्टम के बंद होने की प्रतीक्षा है…', 'قبل Weed Kernel الطلب. بانتظار إيقاف النظام المضيف…', 'Anfrage vom Weed Kernel akzeptiert. Warten auf das Herunterfahren des Hostsystems…', 'Pedido aceite pelo Weed Kernel. A aguardar o encerramento do sistema anfitrião…', 'Nekena ny Weed Kernel ny fangatahana. Miandry ny famonoana ny solosaina fototra…'],
    ['Autorisation requise', 'Permission required', 'Autorización necesaria', '需要授权', 'अनुमति आवश्यक है', 'الإذن مطلوب', 'Berechtigung erforderlich', 'Autorização necessária', 'Mila alalana'],
    ['Seul un administrateur peut arrêter ou redémarrer le système.', 'Only an administrator can shut down or restart the system.', 'Solo un administrador puede apagar o reiniciar el sistema.', '只有管理员可以关闭或重启系统。', 'केवल व्यवस्थापक ही सिस्टम बंद या पुनः प्रारंभ कर सकता है।', 'يمكن للمسؤول فقط إيقاف النظام أو إعادة تشغيله.', 'Nur ein Administrator kann das System herunterfahren oder neu starten.', 'Apenas um administrador pode desligar ou reiniciar o sistema.', 'Ny mpitantana ihany no afaka mamono na mandefa indray ny rafitra.'],
    ['Action impossible', 'Action not possible', 'Acción imposible', '无法执行操作', 'कार्रवाई संभव नहीं', 'تعذّر تنفيذ الإجراء', 'Aktion nicht möglich', 'Ação impossível', 'Tsy azo atao ny asa'],
    ['Bienvenue', 'Welcome', 'Bienvenido', '欢迎', 'स्वागत है', 'مرحباً', 'Willkommen', 'Bem-vindo', 'Tongasoa'],
    ['Kernel injoignable : ', 'Kernel unreachable: ', 'Kernel inaccesible: ', '无法连接内核：', 'Kernel तक पहुँच नहीं: ', 'تعذّر الوصول إلى النواة: ', 'Kernel nicht erreichbar: ', 'Kernel inacessível: ', 'Tsy azo ny Kernel: '],
    ['Section Services', 'Services section', 'Sección Servicios', '服务部分', 'सेवाएँ अनुभाग', 'قسم الخدمات', 'Bereich Dienste', 'Secção Serviços', 'Fizarana Tolotra'],

    /* ---- Titres d'applications ---- */
    ['Réglages', 'Settings', 'Ajustes', '设置', 'सेटिंग्स', 'الإعدادات', 'Einstellungen', 'Definições', 'Fikirana'],
    ['Programmes', 'Programs', 'Programas', '程序', 'प्रोग्राम', 'البرامج', 'Programme', 'Programas', 'Programa'],
    ['Peinture', 'Paint', 'Pintura', '绘画', 'चित्रकारी', 'الرسم', 'Malen', 'Pintura', 'Sary'],
    ['Courrier', 'Mail', 'Correo', '邮件', 'मेल', 'البريد', 'E-Mail', 'Correio', 'Mailaka'],
    ['Réseau et Bluetooth', 'Network and Bluetooth', 'Red y Bluetooth', '网络与蓝牙', 'नेटवर्क और ब्लूटूथ', 'الشبكة والبلوتوث', 'Netzwerk und Bluetooth', 'Rede e Bluetooth', 'Tambajotra sy Bluetooth'],
    ['Moniteur système', 'System monitor', 'Monitor del sistema', '系统监视器', 'सिस्टम मॉनिटर', 'مراقب النظام', 'Systemüberwachung', 'Monitor do sistema', 'Mpanara-maso ny rafitra'],
    ['Processus', 'Processes', 'Procesos', '进程', 'प्रक्रियाएँ', 'العمليات', 'Prozesse', 'Processos', 'Dingana'],
    ['Services système', 'System services', 'Servicios del sistema', '系统服务', 'सिस्टम सेवाएँ', 'خدمات النظام', 'Systemdienste', 'Serviços do sistema', 'Tolotra rafitra'],
    ['Applications au démarrage', 'Startup applications', 'Aplicaciones de inicio', '启动应用', 'स्टार्टअप ऐप', 'تطبيقات بدء التشغيل', 'Autostart-Anwendungen', 'Aplicações de arranque', 'Rindranasa mandeha am-piandohana'],
    ['Sessions utilisateur', 'User sessions', 'Sesiones de usuario', '用户会话', 'उपयोगकर्ता सत्र', 'جلسات المستخدمين', 'Benutzersitzungen', 'Sessões de utilizador', 'Fivoriam-pampiasa'],
    ['Historique système', 'System history', 'Historial del sistema', '系统历史', 'सिस्टम इतिहास', 'سجل النظام', 'Systemverlauf', 'Histórico do sistema', 'Tantaran’ny rafitra'],
    ['Permissions des applications', 'App permissions', 'Permisos de aplicaciones', '应用权限', 'ऐप अनुमतियाँ', 'أذونات التطبيقات', 'App-Berechtigungen', 'Permissões das aplicações', 'Alalan’ny rindranasa'],
    ['Utilisateurs et comptes', 'Users and accounts', 'Usuarios y cuentas', '用户与账户', 'उपयोगकर्ता और खाते', 'المستخدمون والحسابات', 'Benutzer und Konten', 'Utilizadores e contas', 'Mpampiasa sy kaonty'],
    ['Stockage et volumes', 'Storage and volumes', 'Almacenamiento y volúmenes', '存储与卷', 'संग्रहण और वॉल्यूम', 'التخزين والأقراص', 'Speicher und Datenträger', 'Armazenamento e volumes', 'Fitahirizana sy volume'],
    ['Sécurité et permissions', 'Security and permissions', 'Seguridad y permisos', '安全与权限', 'सुरक्षा और अनुमतियाँ', 'الأمان والأذونات', 'Sicherheit und Berechtigungen', 'Segurança e permissões', 'Fiarovana sy alalana'],
    ['Centre de notifications', 'Notification center', 'Centro de notificaciones', '通知中心', 'सूचना केंद्र', 'مركز الإشعارات', 'Mitteilungszentrale', 'Centro de notificações', 'Foibe fampandrenesana'],
    ['Installer Weed OS', 'Install Weed OS', 'Instalar Weed OS', '安装 Weed OS', 'Weed OS स्थापित करें', 'تثبيت Weed OS', 'Weed OS installieren', 'Instalar o Weed OS', 'Mametraka Weed OS'],
    ['Mentions légales et crédits', 'Legal notices and credits', 'Avisos legales y créditos', '法律声明与致谢', 'कानूनी सूचनाएँ और श्रेय', 'الإشعارات القانونية والاعتمادات', 'Rechtliche Hinweise und Danksagungen', 'Avisos legais e créditos', 'Fanamarihana ara-dalàna sy fisaorana'],
    ['Mentions légales et crédits des ressources', 'Legal notices and resource credits', 'Avisos legales y créditos de recursos', '法律声明与资源致谢', 'कानूनी सूचनाएँ और संसाधन श्रेय', 'الإشعارات القانونية واعتمادات الموارد', 'Rechtliche Hinweise und Ressourcen-Danksagungen', 'Avisos legais e créditos dos recursos', 'Fanamarihana ara-dalàna sy fisaorana ny loharano'],
    ['Visionneuse de photos', 'Photo viewer', 'Visor de fotos', '照片查看器', 'फ़ोटो व्यूअर', 'عارض الصور', 'Fotobetrachter', 'Visualizador de fotografias', 'Mpijery sary'],
    ['Lecteur audio', 'Audio player', 'Reproductor de audio', '音频播放器', 'ऑडियो प्लेयर', 'مشغّل الصوت', 'Audioplayer', 'Leitor de áudio', 'Mpilalao feo'],
    ['Lecteur vidéo', 'Video player', 'Reproductor de vídeo', '视频播放器', 'वीडियो प्लेयर', 'مشغّل الفيديو', 'Videoplayer', 'Leitor de vídeo', 'Mpilalao horonan-tsary'],
    ['Vidéo', 'Video', 'Vídeo', '视频', 'वीडियो', 'فيديو', 'Video', 'Vídeo', 'Horonan-tsary'],
    ['Ouvrir une vidéo', 'Open a video', 'Abrir un vídeo', '打开视频', 'वीडियो खोलें', 'فتح فيديو', 'Video öffnen', 'Abrir um vídeo', 'Sokafy horonan-tsary'],
    ['Ouvrir un document PDF', 'Open a PDF document', 'Abrir un documento PDF', '打开 PDF 文档', 'PDF दस्तावेज़ खोलें', 'فتح مستند PDF', 'PDF-Dokument öffnen', 'Abrir um documento PDF', 'Sokafy antontan-taratasy PDF'],

    /* ---- Fichiers (Cultivator) ---- */
    ['Dossier parent', 'Parent folder', 'Carpeta superior', '上级文件夹', 'ऊपरी फ़ोल्डर', 'المجلد الأعلى', 'Übergeordneter Ordner', 'Pasta superior', 'Lahatahiry ambony'],
    ['Bureau', 'Desktop', 'Escritorio', '桌面', 'डेस्कटॉप', 'سطح المكتب', 'Schreibtisch', 'Ambiente de trabalho', 'Birao'],
    ['Documents', 'Documents', 'Documentos', '文档', 'दस्तावेज़', 'المستندات', 'Dokumente', 'Documentos', 'Antontan-taratasy'],
    ['Dossier personnel', 'Home folder', 'Carpeta personal', '个人文件夹', 'होम फ़ोल्डर', 'المجلد الشخصي', 'Persönlicher Ordner', 'Pasta pessoal', 'Lahatahiry manokana'],
    ['Dossier', 'Folder', 'Carpeta', '文件夹', 'फ़ोल्डर', 'مجلد', 'Ordner', 'Pasta', 'Lahatahiry'],
    ['Fichier', 'File', 'Archivo', '文件', 'फ़ाइल', 'ملف', 'Datei', 'Ficheiro', 'Rakitra'],
    ['Importer', 'Import', 'Importar', '导入', 'आयात करें', 'استيراد', 'Importieren', 'Importar', 'Ampidiro'],
    ['Annuler', 'Cancel', 'Cancelar', '取消', 'रद्द करें', 'إلغاء', 'Abbrechen', 'Cancelar', 'Foano'],
    ['Précédente', 'Previous', 'Anterior', '上一个', 'पिछला', 'السابق', 'Zurück', 'Anterior', 'Teo aloha'],
    ['Suivante', 'Next', 'Siguiente', '下一个', 'अगला', 'التالي', 'Weiter', 'Seguinte', 'Manaraka'],
    ['Télécharger', 'Download', 'Descargar', '下载', 'डाउनलोड करें', 'تنزيل', 'Herunterladen', 'Transferir', 'Alaivo'],
    ['Dossier vide — clic droit pour créer, ou glissez des fichiers ici.', 'Empty folder — right-click to create, or drag files here.', 'Carpeta vacía: clic derecho para crear o arrastra archivos aquí.', '文件夹为空——右键新建，或将文件拖到此处。', 'फ़ोल्डर खाली है — बनाने के लिए राइट-क्लिक करें या फ़ाइलें यहाँ खींचें।', 'المجلد فارغ — انقر بزر الفأرة الأيمن للإنشاء أو اسحب الملفات إلى هنا.', 'Leerer Ordner — Rechtsklick zum Erstellen oder Dateien hierher ziehen.', 'Pasta vazia — clique com o botão direito para criar ou arraste ficheiros para aqui.', 'Foana ny lahatahiry — tsindrio havanana hamorona, na mamintsy rakitra eto.'],
    ['Coupé', 'Cut', 'Cortado', '已剪切', 'काटा गया', 'تم القص', 'Ausgeschnitten', 'Cortado', 'Voatapaka'],
    ['Copié', 'Copied', 'Copiado', '已复制', 'कॉपी किया गया', 'تم النسخ', 'Kopiert', 'Copiado', 'Voadika'],
    ['Entrée', 'Entry', 'Entrada', '条目', 'प्रविष्टि', 'عنصر', 'Eintrag', 'Entrada', 'Singa'],
    [' élément', ' item', ' elemento', ' 项', ' आइटम', ' عنصر', ' Element', ' item', ' singa'],
    [' éléments', ' items', ' elementos', ' 项', ' आइटम', ' عناصر', ' Elemente', ' itens', ' singa'],
    ['Archive créée', 'Archive created', 'Archivo comprimido creado', '压缩包已创建', 'संग्रह बनाया गया', 'تم إنشاء الأرشيف', 'Archiv erstellt', 'Arquivo criado', 'Voaforona ny arisiva'],
    ['Import terminé', 'Import complete', 'Importación terminada', '导入完成', 'आयात पूर्ण', 'اكتمل الاستيراد', 'Import abgeschlossen', 'Importação concluída', 'Vita ny fampidirana'],
    ['Création impossible', 'Cannot create', 'No se puede crear', '无法创建', 'बनाना संभव नहीं', 'تعذّر الإنشاء', 'Erstellen nicht möglich', 'Não foi possível criar', 'Tsy azo foronina'],
    ['Opération impossible', 'Operation not possible', 'Operación imposible', '无法执行操作', 'ऑपरेशन संभव नहीं', 'تعذّرت العملية', 'Vorgang nicht möglich', 'Operação impossível', 'Tsy azo atao ny asa'],
    ['Ce fichier audio ne peut pas être lu par le navigateur.', 'This audio file cannot be played by the browser.', 'El navegador no puede reproducir este archivo de audio.', '浏览器无法播放此音频文件。', 'ब्राउज़र इस ऑडियो फ़ाइल को नहीं चला सकता।', 'لا يمكن للمتصفح تشغيل هذا الملف الصوتي.', 'Diese Audiodatei kann vom Browser nicht abgespielt werden.', 'Este ficheiro de áudio não pode ser reproduzido pelo navegador.', 'Tsy azon’ny navigatera ilalaovana ity rakitra feo ity.'],
    ['Le nom ne peut pas contenir « / » ni « \\ ».', 'The name cannot contain “/” or “\\”.', 'El nombre no puede contener «/» ni «\\».', '名称不能包含“/”或“\\”。', 'नाम में “/” या “\\” नहीं हो सकता।', 'لا يمكن أن يحتوي الاسم على «/» أو «\\».', 'Der Name darf weder „/“ noch „\\“ enthalten.', 'O nome não pode conter «/» nem «\\».', 'Tsy azo misy “/” na “\\” ny anarana.'],

    /* ---- Réglages ---- */
    ['Apparence', 'Appearance', 'Apariencia', '外观', 'दिखावट', 'المظهر', 'Erscheinungsbild', 'Aparência', 'Endrika'],
    ['Teinte d’accent', 'Accent hue', 'Tono de acento', '强调色调', 'एक्सेंट रंग', 'درجة اللون المميز', 'Akzentfarbton', 'Tom de destaque', 'Loko fanasongadinana'],
    ['Flou des fenêtres', 'Window blur', 'Desenfoque de ventanas', '窗口模糊', 'विंडो धुंधलापन', 'ضبابية النوافذ', 'Fensterunschärfe', 'Desfocagem das janelas', 'Fanaparitahana varavarankely'],
    ['Fond d’écran', 'Wallpaper', 'Fondo de pantalla', '壁纸', 'वॉलपेपर', 'الخلفية', 'Hintergrundbild', 'Papel de parede', 'Sary ambadika'],
    ['Photo personnelle', 'Personal photo', 'Foto personal', '个人照片', 'निजी फ़ोटो', 'صورة شخصية', 'Eigenes Foto', 'Fotografia pessoal', 'Sary manokana'],
    ['Choisir ma photo', 'Choose my photo', 'Elegir mi foto', '选择我的照片', 'मेरी फ़ोटो चुनें', 'اختيار صورتي', 'Eigenes Foto wählen', 'Escolher a minha fotografia', 'Misafidia ny sariko'],
    ['Aperçus miniatures · JPG, PNG ou WebP', 'Thumbnail previews · JPG, PNG or WebP', 'Miniaturas · JPG, PNG o WebP', '缩略图预览 · JPG、PNG 或 WebP', 'थंबनेल पूर्वावलोकन · JPG, PNG या WebP', 'معاينات مصغّرة · JPG أو PNG أو WebP', 'Vorschaubilder · JPG, PNG oder WebP', 'Miniaturas · JPG, PNG ou WebP', 'Sary kely · JPG, PNG na WebP'],
    ['Mode d’affichage', 'Display mode', 'Modo de visualización', '显示模式', 'प्रदर्शन मोड', 'وضع العرض', 'Darstellungsmodus', 'Modo de visualização', 'Fomba fampisehoana'],
    ['Couvrir (par défaut)', 'Cover (default)', 'Cubrir (predeterminado)', '覆盖（默认）', 'कवर (डिफ़ॉल्ट)', 'تغطية (افتراضي)', 'Füllen (Standard)', 'Cobrir (predefinido)', 'Rakotra (tsotra)'],
    ['Ajuster', 'Fit', 'Ajustar', '适应', 'फ़िट करें', 'ملاءمة', 'Einpassen', 'Ajustar', 'Ampifanaraho'],
    ['Étirer', 'Stretch', 'Estirar', '拉伸', 'खींचें', 'تمديد', 'Strecken', 'Esticar', 'Ahitsin’ny'],
    ['Centrer', 'Center', 'Centrar', '居中', 'केंद्र में', 'توسيط', 'Zentrieren', 'Centrar', 'Afovoany'],
    ['Mosaïque', 'Tile', 'Mosaico', '平铺', 'टाइल', 'تجانب', 'Kacheln', 'Mosaico', 'Mozaika'],
    ['Personnalisation', 'Personalization', 'Personalización', '个性化', 'वैयक्तिकरण', 'التخصيص', 'Personalisierung', 'Personalização', 'Fanamafisana manokana'],
    ['Sombre', 'Dark', 'Oscuro', '深色', 'गहरा', 'داكن', 'Dunkel', 'Escuro', 'Maizina'],
    ['Clair', 'Light', 'Claro', '浅色', 'हल्का', 'فاتح', 'Hell', 'Claro', 'Mazava'],
    ['Automatique', 'Automatic', 'Automático', '自动', 'स्वचालित', 'تلقائي', 'Automatisch', 'Automático', 'Ho azy'],
    ['Langue', 'Language', 'Idioma', '语言', 'भाषा', 'اللغة', 'Sprache', 'Idioma', 'Fiteny'],
    ['Thème', 'Theme', 'Tema', '主题', 'थीम', 'السمة', 'Design', 'Tema', 'Lohahevitra'],
    ['Sons du système', 'System sounds', 'Sonidos del sistema', '系统声音', 'सिस्टम ध्वनियाँ', 'أصوات النظام', 'Systemklänge', 'Sons do sistema', 'Feon’ny rafitra'],
    ['Son de démarrage du système', 'System startup sound', 'Sonido de inicio del sistema', '系统启动音', 'सिस्टम स्टार्टअप ध्वनि', 'صوت بدء تشغيل النظام', 'Systemstartklang', 'Som de arranque do sistema', 'Feon’ny fandehanan’ny rafitra'],
    ['Volume du son de démarrage', 'Startup sound volume', 'Volumen del sonido de inicio', '启动音音量', 'स्टार्टअप ध्वनि की आवाज़', 'مستوى صوت بدء التشغيل', 'Lautstärke des Startklangs', 'Volume do som de arranque', 'Haavon’ny feon’ny fandehanana'],
    ['Tester le démarrage', 'Test startup sound', 'Probar el inicio', '测试启动音', 'स्टार्टअप ध्वनि जाँचें', 'اختبار صوت البدء', 'Startklang testen', 'Testar o arranque', 'Andramo ny fandehanana'],
    ['Sons d\'interface (arrêt, erreur) pour mon compte', 'Interface sounds (shutdown, error) for my account', 'Sonidos de interfaz (apagado, error) para mi cuenta', '我的账户的界面声音（关机、错误）', 'मेरे खाते के लिए इंटरफ़ेस ध्वनियाँ (बंद, त्रुटि)', 'أصوات الواجهة (الإيقاف، الخطأ) لحسابي', 'Oberflächenklänge (Herunterfahren, Fehler) für mein Konto', 'Sons da interface (encerramento, erro) para a minha conta', 'Feon’ny interface (famonoana, hadisoana) ho an’ny kaontiko'],
    ['Volume des sons d\'interface', 'Interface sounds volume', 'Volumen de los sonidos de interfaz', '界面声音音量', 'इंटरफ़ेस ध्वनियों की आवाज़', 'مستوى صوت الواجهة', 'Lautstärke der Oberflächenklänge', 'Volume dos sons da interface', 'Haavon’ny feon’ny interface'],
    ['Arrêt', 'Shutdown', 'Apagado', '关机', 'बंद', 'الإيقاف', 'Herunterfahren', 'Encerramento', 'Famonoana'],
    ['Erreur', 'Error', 'Error', '错误', 'त्रुटि', 'خطأ', 'Fehler', 'Erro', 'Hadisoana'],
    ['Restauration du système', 'System restore', 'Restauración del sistema', '系统还原', 'सिस्टम पुनर्स्थापना', 'استعادة النظام', 'Systemwiederherstellung', 'Restauro do sistema', 'Famerenana ny rafitra'],
    ['Réinitialise les préférences locales sans supprimer les fichiers personnels ni les comptes.', 'Resets local preferences without deleting personal files or accounts.', 'Restablece las preferencias locales sin eliminar archivos personales ni cuentas.', '重置本地偏好设置，不会删除个人文件或账户。', 'व्यक्तिगत फ़ाइलें या खाते हटाए बिना स्थानीय प्राथमिकताएँ रीसेट करता है।', 'يعيد ضبط التفضيلات المحلية دون حذف الملفات الشخصية أو الحسابات.', 'Setzt lokale Einstellungen zurück, ohne persönliche Dateien oder Konten zu löschen.', 'Repõe as preferências locais sem eliminar ficheiros pessoais nem contas.', 'Avereno ny safidy eto an-toerana tsy mamafa rakitra manokana na kaonty.'],
    ['Restaurer les paramètres par défaut', 'Restore default settings', 'Restaurar la configuración predeterminada', '恢复默认设置', 'डिफ़ॉल्ट सेटिंग्स पुनर्स्थापित करें', 'استعادة الإعدادات الافتراضية', 'Standardeinstellungen wiederherstellen', 'Repor as definições predefinidas', 'Averina ny fikirana tsotra'],
    ['Restaurer les paramètres par défaut ? Les fichiers et comptes ne seront pas supprimés.', 'Restore default settings? Files and accounts will not be deleted.', '¿Restaurar la configuración predeterminada? No se eliminarán archivos ni cuentas.', '恢复默认设置？文件和账户不会被删除。', 'डिफ़ॉल्ट सेटिंग्स पुनर्स्थापित करें? फ़ाइलें और खाते हटाए नहीं जाएँगे।', 'استعادة الإعدادات الافتراضية؟ لن تُحذف الملفات والحسابات.', 'Standardeinstellungen wiederherstellen? Dateien und Konten werden nicht gelöscht.', 'Repor as definições predefinidas? Os ficheiros e as contas não serão eliminados.', 'Averina ny fikirana tsotra? Tsy ho voafafa ny rakitra sy ny kaonty.'],
    ['Les préférences par défaut ont été restaurées.', 'Default preferences have been restored.', 'Se han restaurado las preferencias predeterminadas.', '已恢复默认偏好设置。', 'डिफ़ॉल्ट प्राथमिकताएँ पुनर्स्थापित हो गईं।', 'تمت استعادة التفضيلات الافتراضية.', 'Die Standardeinstellungen wurden wiederhergestellt.', 'As preferências predefinidas foram repostas.', 'Voaverina ny safidy tsotra.'],
    ['Sauvegarde complète du système', 'Full system backup', 'Copia de seguridad completa del sistema', '完整系统备份', 'पूर्ण सिस्टम बैकअप', 'نسخة احتياطية كاملة للنظام', 'Vollständige Systemsicherung', 'Cópia de segurança completa do sistema', 'Tahiry rafitra feno'],
    ['Phrase secrète (8 caractères minimum)', 'Passphrase (8 characters minimum)', 'Frase secreta (mínimo 8 caracteres)', '密语（至少 8 个字符）', 'पासफ़्रेज़ (कम से कम 8 अक्षर)', 'عبارة المرور (8 أحرف على الأقل)', 'Passphrase (mindestens 8 Zeichen)', 'Frase secreta (mínimo 8 caracteres)', 'Fehezanteny miafina (8 tarehintsoratra farafahakeliny)'],
    ['Télécharger une sauvegarde', 'Download a backup', 'Descargar una copia de seguridad', '下载备份', 'बैकअप डाउनलोड करें', 'تنزيل نسخة احتياطية', 'Sicherung herunterladen', 'Transferir uma cópia de segurança', 'Alaivo ny tahiry'],
    ['Choisir une sauvegarde', 'Choose a backup', 'Elegir una copia de seguridad', '选择备份', 'बैकअप चुनें', 'اختيار نسخة احتياطية', 'Sicherung auswählen', 'Escolher uma cópia de segurança', 'Misafidiana tahiry'],
    ['Restaurer', 'Restore', 'Restaurar', '还原', 'पुनर्स्थापित करें', 'استعادة', 'Wiederherstellen', 'Restaurar', 'Avereno'],
    ['La sauvegarde complète est réservée à l’administrateur.', 'Full backup is reserved for the administrator.', 'La copia de seguridad completa está reservada al administrador.', '完整备份仅限管理员使用。', 'पूर्ण बैकअप केवल व्यवस्थापक के लिए है।', 'النسخة الاحتياطية الكاملة مخصّصة للمسؤول.', 'Die vollständige Sicherung ist dem Administrator vorbehalten.', 'A cópia de segurança completa é reservada ao administrador.', 'Ny mpitantana ihany no afaka manao tahiry feno.'],
    ['Profil utilisateur', 'User profile', 'Perfil de usuario', '用户资料', 'उपयोगकर्ता प्रोफ़ाइल', 'ملف المستخدم', 'Benutzerprofil', 'Perfil do utilizador', 'Mombamomba ny mpampiasa'],
    ['Photo de profil de ce navigateur', 'Profile photo of this browser', 'Foto de perfil de este navegador', '此浏览器的头像', 'इस ब्राउज़र की प्रोफ़ाइल फ़ोटो', 'صورة الملف الشخصي لهذا المتصفح', 'Profilfoto dieses Browsers', 'Fotografia de perfil deste navegador', 'Sary mombamomba ny navigatera ity'],
    ['Modifier la photo', 'Change photo', 'Cambiar la foto', '更换照片', 'फ़ोटो बदलें', 'تغيير الصورة', 'Foto ändern', 'Alterar a fotografia', 'Ovay ny sary'],
    ['Réinitialiser', 'Reset', 'Restablecer', '重置', 'रीसेट करें', 'إعادة تعيين', 'Zurücksetzen', 'Repor', 'Avereno'],
    ['Photo de profil', 'Profile photo', 'Foto de perfil', '头像', 'प्रोफ़ाइल फ़ोटो', 'صورة الملف الشخصي', 'Profilfoto', 'Fotografia de perfil', 'Sary mombamomba'],
    ['Photo de profil mise à jour ✓', 'Profile photo updated ✓', 'Foto de perfil actualizada ✓', '头像已更新 ✓', 'प्रोफ़ाइल फ़ोटो अपडेट हुई ✓', 'تم تحديث صورة الملف الشخصي ✓', 'Profilfoto aktualisiert ✓', 'Fotografia de perfil atualizada ✓', 'Vita ny fanavaozana ny sary ✓'],
    ['Compte', 'Account', 'Cuenta', '账户', 'खाता', 'الحساب', 'Konto', 'Conta', 'Kaonty'],
    ['Comptes', 'Accounts', 'Cuentas', '账户', 'खाते', 'الحسابات', 'Konten', 'Contas', 'Kaonty'],
    ['Nouveau mot de passe', 'New password', 'Nueva contraseña', '新密码', 'नया पासवर्ड', 'كلمة مرور جديدة', 'Neues Passwort', 'Nova palavra-passe', 'Tenimiafina vaovao'],
    ['Changer', 'Change', 'Cambiar', '更改', 'बदलें', 'تغيير', 'Ändern', 'Alterar', 'Ovay'],
    ['6 caractères minimum', '6 characters minimum', 'Mínimo 6 caracteres', '至少 6 个字符', 'कम से कम 6 अक्षर', '6 أحرف على الأقل', 'Mindestens 6 Zeichen', 'Mínimo de 6 caracteres', '6 tarehintsoratra farafahakeliny'],
    ['Mot de passe : 6 caractères minimum.', 'Password: 6 characters minimum.', 'Contraseña: mínimo 6 caracteres.', '密码：至少 6 个字符。', 'पासवर्ड: कम से कम 6 अक्षर।', 'كلمة المرور: 6 أحرف على الأقل.', 'Passwort: mindestens 6 Zeichen.', 'Palavra-passe: mínimo de 6 caracteres.', 'Tenimiafina: 6 tarehintsoratra farafahakeliny.'],
    ['Mot de passe modifié', 'Password changed', 'Contraseña cambiada', '密码已更改', 'पासवर्ड बदला गया', 'تم تغيير كلمة المرور', 'Passwort geändert', 'Palavra-passe alterada', 'Voaova ny tenimiafina'],
    ['Mot de passe modifié ✓', 'Password changed ✓', 'Contraseña cambiada ✓', '密码已更改 ✓', 'पासवर्ड बदला गया ✓', 'تم تغيير كلمة المرور ✓', 'Passwort geändert ✓', 'Palavra-passe alterada ✓', 'Voaova ny tenimiafina ✓'],
    ['utilisateur', 'user', 'usuario', '用户', 'उपयोगकर्ता', 'مستخدم', 'Benutzer', 'utilizador', 'mpampiasa'],
    ['admin', 'admin', 'admin', '管理员', 'व्यवस्थापक', 'مسؤول', 'Admin', 'admin', 'mpitantana'],
    ['Ajouter', 'Add', 'Añadir', '添加', 'जोड़ें', 'إضافة', 'Hinzufügen', 'Adicionar', 'Ampio'],
    ['nom', 'name', 'nombre', '名称', 'नाम', 'الاسم', 'Name', 'nome', 'anarana'],
    ['mot de passe', 'password', 'contraseña', '密码', 'पासवर्ड', 'كلمة المرور', 'Passwort', 'palavra-passe', 'tenimiafina'],
    ['Compte créé.', 'Account created.', 'Cuenta creada.', '账户已创建。', 'खाता बनाया गया।', 'تم إنشاء الحساب.', 'Konto erstellt.', 'Conta criada.', 'Voaforona ny kaonty.'],
    ['Compte supprimé.', 'Account deleted.', 'Cuenta eliminada.', '账户已删除。', 'खाता हटाया गया।', 'تم حذف الحساب.', 'Konto gelöscht.', 'Conta eliminada.', 'Voafafa ny kaonty.'],
    ['Confirmer la suppression de ce compte ?', 'Confirm deletion of this account?', '¿Confirmar la eliminación de esta cuenta?', '确认删除此账户？', 'क्या इस खाते को हटाने की पुष्टि करें?', 'تأكيد حذف هذا الحساب؟', 'Löschen dieses Kontos bestätigen?', 'Confirmar a eliminação desta conta?', 'Hohamafisina ny famafana ity kaonty ity?'],
    ['Cette fonction est réservée à un compte administrateur.', 'This function is reserved for an administrator account.', 'Esta función está reservada a una cuenta de administrador.', '此功能仅限管理员账户使用。', 'यह सुविधा केवल व्यवस्थापक खाते के लिए है।', 'هذه الميزة مخصّصة لحساب المسؤول.', 'Diese Funktion ist einem Administratorkonto vorbehalten.', 'Esta função é reservada a uma conta de administrador.', 'Ho an’ny kaonty mpitantana ihany ity asa ity.'],
    ['Le nom doit contenir 3 à 20 caractères : a-z, 0-9, _ ; commencer par une lettre.', 'The name must be 3 to 20 characters: a-z, 0-9, _ ; starting with a letter.', 'El nombre debe tener de 3 a 20 caracteres: a-z, 0-9, _ ; empezar por una letra.', '名称必须为 3 到 20 个字符：a-z、0-9、_；以字母开头。', 'नाम 3 से 20 अक्षरों का होना चाहिए: a-z, 0-9, _ ; अक्षर से शुरू हो।', 'يجب أن يتكوّن الاسم من 3 إلى 20 حرفاً: a-z و0-9 و_ ؛ ويبدأ بحرف.', 'Der Name muss 3 bis 20 Zeichen haben: a-z, 0-9, _ ; mit einem Buchstaben beginnen.', 'O nome deve ter 3 a 20 caracteres: a-z, 0-9, _ ; começar por uma letra.', 'Ny anarana dia 3 ka hatramin’ny 20 tarehintsoratra: a-z, 0-9, _ ; manomboka amin’ny litera.'],
    ['Réglage enregistré pour le prochain démarrage.', 'Setting saved for the next startup.', 'Ajuste guardado para el próximo inicio.', '设置已保存，将在下次启动时生效。', 'सेटिंग अगले स्टार्टअप के लिए सहेजी गई।', 'تم حفظ الإعداد لبدء التشغيل التالي.', 'Einstellung für den nächsten Start gespeichert.', 'Definição guardada para o próximo arranque.', 'Voatahiry ho an’ny fandehanana manaraka ny fikirana.'],
    ['Réglage système indisponible : ', 'System setting unavailable: ', 'Ajuste del sistema no disponible: ', '系统设置不可用：', 'सिस्टम सेटिंग उपलब्ध नहीं: ', 'إعداد النظام غير متاح: ', 'Systemeinstellung nicht verfügbar: ', 'Definição do sistema indisponível: ', 'Tsy misy ny fikirana rafitra: '],
    ['Lecture native disponible : le son démarre sans clic, avant le bureau.', 'Native playback available: the sound starts without a click, before the desktop.', 'Reproducción nativa disponible: el sonido se inicia sin clic, antes del escritorio.', '支持原生播放：声音无需点击，在桌面之前启动。', 'नेटिव प्लेबैक उपलब्ध: ध्वनि बिना क्लिक के डेस्कटॉप से पहले शुरू होती है।', 'التشغيل الأصلي متاح: يبدأ الصوت دون نقر قبل سطح المكتب.', 'Native Wiedergabe verfügbar: Der Klang startet ohne Klick, noch vor dem Desktop.', 'Reprodução nativa disponível: o som arranca sem clique, antes do ambiente de trabalho.', 'Misy ny fampiasana natoraly: mihaino ny feo tsy mila tsindrio, alohan’ny birao.'],
    ['Aucun lecteur audio système détecté : le navigateur essaiera de jouer le son (un premier clic peut être nécessaire).', 'No system audio player detected: the browser will try to play the sound (a first click may be needed).', 'No se detectó reproductor de audio del sistema: el navegador intentará reproducir el sonido (puede hacer falta un primer clic).', '未检测到系统音频播放器：浏览器将尝试播放声音（可能需要先点击一次）。', 'कोई सिस्टम ऑडियो प्लेयर नहीं मिला: ब्राउज़र ध्वनि चलाने का प्रयास करेगा (पहली बार क्लिक करना पड़ सकता है)।', 'لم يتم اكتشاف مشغّل صوت للنظام: سيحاول المتصفح تشغيل الصوت (قد يلزم نقرة أولى).', 'Kein System-Audioplayer erkannt: Der Browser versucht, den Klang abzuspielen (ein erster Klick kann nötig sein).', 'Nenhum leitor de áudio do sistema detetado: o navegador tentará reproduzir o som (pode ser necessário um primeiro clique).', 'Tsy nisy mpilalao feo rafitra hita: hanandrana hilalao ny feo ny navigatera (mety mila tsindrio voalohany).'],

    /* ---- Connexion ---- */
    ['Nom d’utilisateur', 'Username', 'Usuario', '用户名', 'उपयोगकर्ता नाम', 'اسم المستخدم', 'Benutzername', 'Nome de utilizador', 'Anaran’ny mpampiasa'],
    ['Mot de passe', 'Password', 'Contraseña', '密码', 'पासवर्ड', 'كلمة المرور', 'Passwort', 'Palavra-passe', 'Tenimiafina'],
    ['Se connecter', 'Sign in', 'Iniciar sesión', '登录', 'साइन इन', 'تسجيل الدخول', 'Anmelden', 'Iniciar sessão', 'Hiditra'],
    ['Connexion réussie', 'Sign-in successful', 'Inicio de sesión correcto', '登录成功', 'साइन इन सफल', 'تم تسجيل الدخول', 'Anmeldung erfolgreich', 'Sessão iniciada com sucesso', 'Tafiditra soa aman-tsara'],
    ['Échec de connexion', 'Sign-in failed', 'Error al iniciar sesión', '登录失败', 'साइन इन विफल', 'فشل تسجيل الدخول', 'Anmeldung fehlgeschlagen', 'Falha ao iniciar sessão', 'Tsy nahomby ny fidirana'],
    ['Création de compte', 'Account creation', 'Creación de cuenta', '创建账户', 'खाता निर्माण', 'إنشاء حساب', 'Kontoerstellung', 'Criação de conta', 'Famoronana kaonty'],
    ['Suppression de compte', 'Account deletion', 'Eliminación de cuenta', '删除账户', 'खाता हटाना', 'حذف حساب', 'Kontolöschung', 'Eliminação de conta', 'Famafana kaonty'],
    ['Session ouverte : ', 'Session opened: ', 'Sesión iniciada: ', '会话已打开：', 'सत्र खुला: ', 'تم فتح الجلسة: ', 'Sitzung geöffnet: ', 'Sessão iniciada: ', 'Nisokatra ny fivoriana: '],

    /* ---- Réseau et Bluetooth ---- */
    ['Réseau et connectivité', 'Network and connectivity', 'Red y conectividad', '网络与连接', 'नेटवर्क और कनेक्टिविटी', 'الشبكة والاتصال', 'Netzwerk und Konnektivität', 'Rede e conectividade', 'Tambajotra sy fifandraisana'],
    ['Actualiser', 'Refresh', 'Actualizar', '刷新', 'रीफ़्रेश करें', 'تحديث', 'Aktualisieren', 'Atualizar', 'Havaozy'],
    ['Vérification…', 'Checking…', 'Comprobando…', '正在检查…', 'जाँच हो रही है…', 'جارٍ التحقق…', 'Prüfung läuft…', 'A verificar…', 'Manamarina…'],
    ['Détection…', 'Detecting…', 'Detectando…', '正在检测…', 'पता लगाया जा रहा है…', 'جارٍ الكشف…', 'Erkennung läuft…', 'A detetar…', 'Mitady…'],
    ['Rechercher les réseaux', 'Scan for networks', 'Buscar redes', '搜索网络', 'नेटवर्क खोजें', 'البحث عن الشبكات', 'Netzwerke suchen', 'Procurar redes', 'Hitady tambajotra'],
    ['Recherche des réseaux…', 'Scanning for networks…', 'Buscando redes…', '正在搜索网络…', 'नेटवर्क खोजे जा रहे हैं…', 'جارٍ البحث عن الشبكات…', 'Netzwerke werden gesucht…', 'A procurar redes…', 'Mitady tambajotra…'],
    ['Activer / désactiver', 'Turn on / off', 'Activar / desactivar', '开启 / 关闭', 'चालू / बंद करें', 'تشغيل / إيقاف', 'Ein- / ausschalten', 'Ativar / desativar', 'Alefaso / vonoy'],
    ['Nom du réseau (SSID)', 'Network name (SSID)', 'Nombre de la red (SSID)', '网络名称（SSID）', 'नेटवर्क नाम (SSID)', 'اسم الشبكة (SSID)', 'Netzwerkname (SSID)', 'Nome da rede (SSID)', 'Anaran’ny tambajotra (SSID)'],
    ['Mot de passe Wi-Fi', 'Wi-Fi password', 'Contraseña Wi-Fi', 'Wi-Fi 密码', 'Wi-Fi पासवर्ड', 'كلمة مرور Wi-Fi', 'WLAN-Passwort', 'Palavra-passe Wi-Fi', 'Tenimiafina Wi-Fi'],
    ['Rechercher des appareils', 'Scan for devices', 'Buscar dispositivos', '搜索设备', 'डिवाइस खोजें', 'البحث عن الأجهزة', 'Geräte suchen', 'Procurar dispositivos', 'Hitady fitaovana'],
    ['Arrêter la recherche', 'Stop scanning', 'Detener la búsqueda', '停止搜索', 'खोज रोकें', 'إيقاف البحث', 'Suche beenden', 'Parar a procura', 'Ajanony ny fitadiavana'],
    ['Déconnecter', 'Disconnect', 'Desconectar', '断开连接', 'डिस्कनेक्ट करें', 'قطع الاتصال', 'Trennen', 'Desligar', 'Ampiala'],
    ['Connecter', 'Connect', 'Conectar', '连接', 'कनेक्ट करें', 'اتصال', 'Verbinden', 'Ligar', 'Ampifandraiso'],
    ['Activer', 'Enable', 'Activar', '启用', 'सक्षम करें', 'تفعيل', 'Aktivieren', 'Ativar', 'Alefaso'],
    ['Désactiver', 'Disable', 'Desactivar', '停用', 'अक्षम करें', 'تعطيل', 'Deaktivieren', 'Desativar', 'Vonoy'],
    ['Associer', 'Pair', 'Vincular', '配对', 'पेयर करें', 'اقتران', 'Koppeln', 'Emparelhar', 'Ampiarahaba'],
    ['Connecté', 'Connected', 'Conectado', '已连接', 'कनेक्टेड', 'متصل', 'Verbunden', 'Ligado', 'Mifandray'],
    ['Associé', 'Paired', 'Vinculado', '已配对', 'पेयर किया गया', 'مقترن', 'Gekoppelt', 'Emparelhado', 'Voampiarahaba'],
    ['Détecté', 'Detected', 'Detectado', '已检测到', 'पता चला', 'تم اكتشافه', 'Erkannt', 'Detetado', 'Hita'],
    ['Aucune interface Ethernet détectée.', 'No Ethernet interface detected.', 'No se detectó ninguna interfaz Ethernet.', '未检测到以太网接口。', 'कोई ईथरनेट इंटरफ़ेस नहीं मिला।', 'لم يتم اكتشاف واجهة Ethernet.', 'Keine Ethernet-Schnittstelle erkannt.', 'Nenhuma interface Ethernet detetada.', 'Tsy nisy interface Ethernet hita.'],
    ['Aucun réseau trouvé.', 'No network found.', 'No se encontró ninguna red.', '未找到网络。', 'कोई नेटवर्क नहीं मिला।', 'لم يتم العثور على شبكة.', 'Kein Netzwerk gefunden.', 'Nenhuma rede encontrada.', 'Tsy nahitana tambajotra.'],
    ['Aucun appareil détecté. Lancez une recherche.', 'No device detected. Start a scan.', 'No se detectó ningún dispositivo. Inicia una búsqueda.', '未检测到设备。请开始搜索。', 'कोई डिवाइस नहीं मिला। खोज शुरू करें।', 'لم يتم اكتشاف أي جهاز. ابدأ البحث.', 'Kein Gerät erkannt. Suche starten.', 'Nenhum dispositivo detetado. Inicie uma procura.', 'Tsy nisy fitaovana hita. Atombohy ny fitadiavana.'],
    ['Wi-Fi désactivé.', 'Wi-Fi is off.', 'Wi-Fi desactivado.', 'Wi-Fi 已关闭。', 'Wi-Fi बंद है।', 'Wi-Fi معطّل.', 'WLAN ist ausgeschaltet.', 'Wi-Fi desativado.', 'Tsy mandeha ny Wi-Fi.'],
    ['Wi-Fi activé, non connecté.', 'Wi-Fi is on, not connected.', 'Wi-Fi activado, sin conexión.', 'Wi-Fi 已开启，未连接。', 'Wi-Fi चालू है, कनेक्ट नहीं है।', 'Wi-Fi مفعّل وغير متصل.', 'WLAN ist eingeschaltet, nicht verbunden.', 'Wi-Fi ativado, sem ligação.', 'Mandeha ny Wi-Fi, tsy mifandray.'],
    ['Bluetooth désactivé.', 'Bluetooth is off.', 'Bluetooth desactivado.', '蓝牙已关闭。', 'ब्लूटूथ बंद है।', 'البلوتوث معطّل.', 'Bluetooth ist ausgeschaltet.', 'Bluetooth desativado.', 'Tsy mandeha ny Bluetooth.'],
    ['Aucune connexion Ethernet active.', 'No active Ethernet connection.', 'Ninguna conexión Ethernet activa.', '没有活动的以太网连接。', 'कोई सक्रिय ईथरनेट कनेक्शन नहीं।', 'لا يوجد اتصال Ethernet نشط.', 'Keine aktive Ethernet-Verbindung.', 'Nenhuma ligação Ethernet ativa.', 'Tsy misy fifandraisana Ethernet mihetsika.'],
    ['Connexion Ethernet active.', 'Ethernet connection active.', 'Conexión Ethernet activa.', '以太网连接已启用。', 'ईथरनेट कनेक्शन सक्रिय है।', 'اتصال Ethernet نشط.', 'Ethernet-Verbindung aktiv.', 'Ligação Ethernet ativa.', 'Mihetsika ny fifandraisana Ethernet.'],
    ['Connexion demandée.', 'Connection requested.', 'Conexión solicitada.', '已请求连接。', 'कनेक्शन का अनुरोध किया गया।', 'تم طلب الاتصال.', 'Verbindung angefordert.', 'Ligação pedida.', 'Nangatahana fifandraisana.'],
    ['Recherche lancée. Actualisez dans quelques secondes.', 'Scan started. Refresh in a few seconds.', 'Búsqueda iniciada. Actualiza en unos segundos.', '已开始搜索。请几秒后刷新。', 'खोज शुरू हुई। कुछ सेकंड में रीफ़्रेश करें।', 'بدأ البحث. حدّث الصفحة بعد ثوانٍ.', 'Suche gestartet. In einigen Sekunden aktualisieren.', 'Procura iniciada. Atualize dentro de alguns segundos.', 'Nanomboka ny fitadiavana. Havaozy afaka segondra vitsy.'],
    ['Diagnostic Internet indisponible.', 'Internet diagnostics unavailable.', 'Diagnóstico de Internet no disponible.', '无法进行互联网诊断。', 'इंटरनेट डायग्नोस्टिक उपलब्ध नहीं।', 'تشخيص الإنترنت غير متاح.', 'Internetdiagnose nicht verfügbar.', 'Diagnóstico de Internet indisponível.', 'Tsy misy ny fitiliana Internet.'],
    ['NetworkManager (nmcli) indisponible.', 'NetworkManager (nmcli) unavailable.', 'NetworkManager (nmcli) no disponible.', 'NetworkManager (nmcli) 不可用。', 'NetworkManager (nmcli) उपलब्ध नहीं।', 'NetworkManager (nmcli) غير متاح.', 'NetworkManager (nmcli) nicht verfügbar.', 'NetworkManager (nmcli) indisponível.', 'Tsy misy ny NetworkManager (nmcli).'],
    ['NetworkManager indisponible.', 'NetworkManager unavailable.', 'NetworkManager no disponible.', 'NetworkManager 不可用。', 'NetworkManager उपलब्ध नहीं।', 'NetworkManager غير متاح.', 'NetworkManager nicht verfügbar.', 'NetworkManager indisponível.', 'Tsy misy ny NetworkManager.'],
    ['BlueZ (bluetoothctl) indisponible.', 'BlueZ (bluetoothctl) unavailable.', 'BlueZ (bluetoothctl) no disponible.', 'BlueZ (bluetoothctl) 不可用。', 'BlueZ (bluetoothctl) उपलब्ध नहीं।', 'BlueZ (bluetoothctl) غير متاح.', 'BlueZ (bluetoothctl) nicht verfügbar.', 'BlueZ (bluetoothctl) indisponível.', 'Tsy misy ny BlueZ (bluetoothctl).'],
    ['réseau Wi-Fi', 'Wi-Fi network', 'red Wi-Fi', 'Wi-Fi 网络', 'Wi-Fi नेटवर्क', 'شبكة Wi-Fi', 'WLAN-Netzwerk', 'rede Wi-Fi', 'tambajotra Wi-Fi'],
    ['(réseau masqué)', '(hidden network)', '(red oculta)', '（隐藏网络）', '(छिपा नेटवर्क)', '(شبكة مخفية)', '(verstecktes Netzwerk)', '(rede oculta)', '(tambajotra miafina)'],
    ['Le contrôle matériel requiert NetworkManager, BlueZ, les services associés et des pilotes compatibles. Les états affichés proviennent du système ; les actions peuvent nécessiter des droits administrateur.', 'Hardware control requires NetworkManager, BlueZ, the related services and compatible drivers. Displayed states come from the system; actions may require administrator rights.', 'El control del hardware requiere NetworkManager, BlueZ, los servicios asociados y controladores compatibles. Los estados mostrados provienen del sistema; las acciones pueden requerir derechos de administrador.', '硬件控制需要 NetworkManager、BlueZ、相关服务和兼容的驱动程序。显示的状态来自系统；某些操作可能需要管理员权限。', 'हार्डवेयर नियंत्रण के लिए NetworkManager, BlueZ, संबंधित सेवाएँ और संगत ड्राइवर आवश्यक हैं। दिखाई गई स्थितियाँ सिस्टम से आती हैं; कुछ कार्रवाइयों के लिए व्यवस्थापक अधिकार चाहिए।', 'يتطلب التحكم بالعتاد NetworkManager وBlueZ والخدمات المرتبطة ببرامج تشغيل متوافقة. الحالات المعروضة مصدرها النظام؛ وقد تتطلب بعض الإجراءات صلاحيات المسؤول.', 'Die Hardwaresteuerung erfordert NetworkManager, BlueZ, die zugehörigen Dienste und kompatible Treiber. Die angezeigten Zustände stammen vom System; Aktionen können Administratorrechte erfordern.', 'O controlo do hardware requer NetworkManager, BlueZ, os serviços associados e controladores compatíveis. Os estados apresentados provêm do sistema; as ações podem exigir direitos de administrador.', 'Ny fifehezana ny fitaovana dia mitaky NetworkManager, BlueZ, ny tolotra mifandray aminy ary driver mifanaraka. Avy amin’ny rafitra ny toetra aseho; mety mila alalana mpitantana ny asa sasany.'],

    /* ---- Courrier ---- */
    ['Boîte de réception', 'Inbox', 'Bandeja de entrada', '收件箱', 'इनबॉक्स', 'صندوق الوارد', 'Posteingang', 'Caixa de entrada', 'Boaty fandraisana'],
    ['Recevoir', 'Receive', 'Recibir', '接收', 'प्राप्त करें', 'استلام', 'Abrufen', 'Receber', 'Raiso'],
    ['Brouillons', 'Drafts', 'Borradores', '草稿', 'ड्राफ़्ट', 'المسودات', 'Entwürfe', 'Rascunhos', 'Volavolan-dahatsoratra'],
    ['Nouveau', 'New', 'Nuevo', '新建', 'नया', 'جديد', 'Neu', 'Novo', 'Vaovao'],
    ['Nouveau message', 'New message', 'Nuevo mensaje', '新邮件', 'नया संदेश', 'رسالة جديدة', 'Neue Nachricht', 'Nova mensagem', 'Hafatra vaovao'],
    ['Dossier e-mail', 'Mail folder', 'Carpeta de correo', '邮件文件夹', 'मेल फ़ोल्डर', 'مجلد البريد', 'E-Mail-Ordner', 'Pasta de correio', 'Lahatahirin’ny mailaka'],
    ['Chargement…', 'Loading…', 'Cargando…', '正在加载…', 'लोड हो रहा है…', 'جارٍ التحميل…', 'Wird geladen…', 'A carregar…', 'Eo am-pakàna…'],
    ['Sélectionnez un message pour le lire.', 'Select a message to read it.', 'Selecciona un mensaje para leerlo.', '选择一封邮件进行阅读。', 'पढ़ने के लिए कोई संदेश चुनें।', 'اختر رسالة لقراءتها.', 'Wählen Sie eine Nachricht zum Lesen aus.', 'Selecione uma mensagem para a ler.', 'Safidio ny hafatra hovakiana.'],
    ['Configurer un compte e-mail', 'Set up an email account', 'Configurar una cuenta de correo', '设置电子邮件账户', 'ईमेल खाता सेट करें', 'إعداد حساب بريد إلكتروني', 'E-Mail-Konto einrichten', 'Configurar uma conta de e-mail', 'Amboary kaonty mailaka'],
    ['Nom affiché', 'Display name', 'Nombre mostrado', '显示名称', 'प्रदर्शित नाम', 'الاسم المعروض', 'Anzeigename', 'Nome apresentado', 'Anarana aseho'],
    ['Adresse e-mail', 'Email address', 'Dirección de correo', '电子邮件地址', 'ईमेल पता', 'عنوان البريد الإلكتروني', 'E-Mail-Adresse', 'Endereço de e-mail', 'Adiresy mailaka'],
    ['Nom d\'utilisateur', 'Username', 'Usuario', '用户名', 'उपयोगकर्ता नाम', 'اسم المستخدم', 'Benutzername', 'Nome de utilizador', 'Anaran’ny mpampiasa'],
    ['Personnel', 'Personal', 'Personal', '个人', 'व्यक्तिगत', 'شخصي', 'Persönlich', 'Pessoal', 'Manokana'],
    ['vous@exemple.com', 'you@example.com', 'tu@ejemplo.com', 'you@example.com', 'you@example.com', 'you@example.com', 'sie@beispiel.de', 'voce@exemplo.com', 'ianao@ohatra.com'],
    ['souvent votre adresse e-mail', 'often your email address', 'normalmente tu dirección de correo', '通常是您的电子邮件地址', 'अक्सर आपका ईमेल पता', 'غالباً عنوان بريدك الإلكتروني', 'meist Ihre E-Mail-Adresse', 'normalmente o seu endereço de e-mail', 'matetika ny adiresy mailakao'],
    ['Serveur IMAP', 'IMAP server', 'Servidor IMAP', 'IMAP 服务器', 'IMAP सर्वर', 'خادم IMAP', 'IMAP-Server', 'Servidor IMAP', 'Mpizara IMAP'],
    ['Port IMAP', 'IMAP port', 'Puerto IMAP', 'IMAP 端口', 'IMAP पोर्ट', 'منفذ IMAP', 'IMAP-Port', 'Porta IMAP', 'Seranan-tsambo IMAP'],
    ['Sécurité IMAP', 'IMAP security', 'Seguridad IMAP', 'IMAP 安全性', 'IMAP सुरक्षा', 'أمان IMAP', 'IMAP-Sicherheit', 'Segurança IMAP', 'Fiarovana IMAP'],
    ['Serveur SMTP', 'SMTP server', 'Servidor SMTP', 'SMTP 服务器', 'SMTP सर्वर', 'خادم SMTP', 'SMTP-Server', 'Servidor SMTP', 'Mpizara SMTP'],
    ['Port SMTP', 'SMTP port', 'Puerto SMTP', 'SMTP 端口', 'SMTP पोर्ट', 'منفذ SMTP', 'SMTP-Port', 'Porta SMTP', 'Seranan-tsambo SMTP'],
    ['Sécurité SMTP', 'SMTP security', 'Seguridad SMTP', 'SMTP 安全性', 'SMTP सुरक्षा', 'أمان SMTP', 'SMTP-Sicherheit', 'Segurança SMTP', 'Fiarovana SMTP'],
    ['Aucune', 'None', 'Ninguna', '无', 'कोई नहीं', 'بلا', 'Keine', 'Nenhuma', 'Tsy misy'],
    ['imap.exemple.com', 'imap.example.com', 'imap.ejemplo.com', 'imap.example.com', 'imap.example.com', 'imap.example.com', 'imap.beispiel.de', 'imap.exemplo.com', 'imap.ohatra.com'],
    ['smtp.exemple.com', 'smtp.example.com', 'smtp.ejemplo.com', 'smtp.example.com', 'smtp.example.com', 'smtp.example.com', 'smtp.beispiel.de', 'smtp.exemplo.com', 'smtp.ohatra.com'],
    ['Enregistrer le compte', 'Save account', 'Guardar la cuenta', '保存账户', 'खाता सहेजें', 'حفظ الحساب', 'Konto speichern', 'Guardar a conta', 'Tehirizo ny kaonty'],
    ['Destinataire', 'Recipient', 'Destinatario', '收件人', 'प्राप्तकर्ता', 'المستلم', 'Empfänger', 'Destinatário', 'Mpandray'],
    ['Objet', 'Subject', 'Asunto', '主题', 'विषय', 'الموضوع', 'Betreff', 'Assunto', 'Lohahevitra'],
    ['Message', 'Message', 'Mensaje', '正文', 'संदेश', 'الرسالة', 'Nachricht', 'Mensagem', 'Hafatra'],
    ['Pièces jointes (5 fichiers max., 5 Mo chacun)', 'Attachments (5 files max., 5 MB each)', 'Archivos adjuntos (máx. 5 archivos, 5 MB cada uno)', '附件（最多 5 个文件，每个 5 MB）', 'अनुलग्नक (अधिकतम 5 फ़ाइलें, प्रत्येक 5 MB)', 'المرفقات (5 ملفات كحد أقصى، 5 ميغابايت لكل ملف)', 'Anhänge (max. 5 Dateien, je 5 MB)', 'Anexos (máx. 5 ficheiros, 5 MB cada)', 'Rakitra miaraka (5 farafahabetsany, 5 Mo isaky ny iray)'],
    ['10 Mo maximum au total. Les fichiers joints ne sont pas inclus dans les brouillons enregistrés.', '10 MB maximum in total. Attachments are not included in saved drafts.', 'Máximo 10 MB en total. Los adjuntos no se incluyen en los borradores guardados.', '总计最大 10 MB。附件不会包含在已保存的草稿中。', 'कुल अधिकतम 10 MB। संलग्न फ़ाइलें सहेजे गए ड्राफ़्ट में शामिल नहीं होतीं।', 'الحد الأقصى 10 ميغابايت في المجموع. لا تُدرج المرفقات في المسودات المحفوظة.', 'Insgesamt höchstens 10 MB. Anhänge sind in gespeicherten Entwürfen nicht enthalten.', 'Máximo de 10 MB no total. Os anexos não são incluídos nos rascunhos guardados.', '10 Mo ny fara-tampony. Tsy ao anatin’ny volavolan-dahatsoratra voatahiry ny rakitra miaraka.'],
    ['Enregistrer le brouillon', 'Save draft', 'Guardar borrador', '保存草稿', 'ड्राफ़्ट सहेजें', 'حفظ المسودة', 'Entwurf speichern', 'Guardar rascunho', 'Tehirizo ny volavolan-dahatsoratra'],
    ['Modifier le brouillon', 'Edit draft', 'Editar borrador', '编辑草稿', 'ड्राफ़्ट संपादित करें', 'تعديل المسودة', 'Entwurf bearbeiten', 'Editar rascunho', 'Ovay ny volavolan-dahatsoratra'],
    ['Envoyer', 'Send', 'Enviar', '发送', 'भेजें', 'إرسال', 'Senden', 'Enviar', 'Alefaso'],
    ['Supprimer', 'Delete', 'Eliminar', '删除', 'हटाएँ', 'حذف', 'Löschen', 'Eliminar', 'Fafao'],
    ['Répondre', 'Reply', 'Responder', '回复', 'उत्तर दें', 'رد', 'Antworten', 'Responder', 'Valio'],
    ['Transférer', 'Forward', 'Reenviar', '转发', 'अग्रेषित करें', 'إعادة توجيه', 'Weiterleiten', 'Reencaminhar', 'Alefaso any amin’ny hafa'],
    ['Déplacer', 'Move', 'Mover', '移动', 'स्थानांतरित करें', 'نقل', 'Verschieben', 'Mover', 'Afindrao'],
    ['Pièces jointes', 'Attachments', 'Adjuntos', '附件', 'अनुलग्नक', 'المرفقات', 'Anhänge', 'Anexos', 'Rakitra miaraka'],
    ['Ajoutez un compte pour commencer.', 'Add an account to get started.', 'Añade una cuenta para empezar.', '添加账户以开始使用。', 'शुरू करने के लिए खाता जोड़ें।', 'أضف حساباً للبدء.', 'Fügen Sie ein Konto hinzu, um zu beginnen.', 'Adicione uma conta para começar.', 'Ampio kaonty hanombohana.'],
    ['Ajoutez et sélectionnez un compte.', 'Add and select an account.', 'Añade y selecciona una cuenta.', '请添加并选择一个账户。', 'कोई खाता जोड़ें और चुनें।', 'أضف حساباً وحدده.', 'Konto hinzufügen und auswählen.', 'Adicione e selecione uma conta.', 'Ampio ary safidio ny kaonty.'],
    ['Aucun brouillon enregistré.', 'No saved drafts.', 'No hay borradores guardados.', '没有已保存的草稿。', 'कोई सहेजा गया ड्राफ़्ट नहीं।', 'لا توجد مسودات محفوظة.', 'Keine gespeicherten Entwürfe.', 'Nenhum rascunho guardado.', 'Tsy misy volavolan-dahatsoratra voatahiry.'],
    ['Sélectionnez un brouillon pour le modifier.', 'Select a draft to edit it.', 'Selecciona un borrador para editarlo.', '选择一份草稿进行编辑。', 'संपादित करने के लिए कोई ड्राफ़्ट चुनें।', 'اختر مسودة لتعديلها.', 'Wählen Sie einen Entwurf zum Bearbeiten aus.', 'Selecione um rascunho para o editar.', 'Safidio ny volavolan-dahatsoratra hovaina.'],
    ['Aucun message dans ce dossier.', 'No messages in this folder.', 'No hay mensajes en esta carpeta.', '此文件夹中没有邮件。', 'इस फ़ोल्डर में कोई संदेश नहीं।', 'لا توجد رسائل في هذا المجلد.', 'Keine Nachrichten in diesem Ordner.', 'Nenhuma mensagem nesta pasta.', 'Tsy misy hafatra ao amin’ity lahatahiry ity.'],
    ['Réception des messages…', 'Receiving messages…', 'Recibiendo mensajes…', '正在接收邮件…', 'संदेश प्राप्त हो रहे हैं…', 'جارٍ استلام الرسائل…', 'Nachrichten werden abgerufen…', 'A receber mensagens…', 'Mandray hafatra…'],
    ['Ouverture du message…', 'Opening message…', 'Abriendo mensaje…', '正在打开邮件…', 'संदेश खुल रहा है…', 'جارٍ فتح الرسالة…', 'Nachricht wird geöffnet…', 'A abrir a mensagem…', 'Misokatra ny hafatra…'],
    ['Préparation des pièces jointes…', 'Preparing attachments…', 'Preparando los adjuntos…', '正在准备附件…', 'अनुलग्नक तैयार हो रहे हैं…', 'جارٍ تجهيز المرفقات…', 'Anhänge werden vorbereitet…', 'A preparar os anexos…', 'Manomana ny rakitra miaraka…'],
    ['Message envoyé.', 'Message sent.', 'Mensaje enviado.', '邮件已发送。', 'संदेश भेजा गया।', 'تم إرسال الرسالة.', 'Nachricht gesendet.', 'Mensagem enviada.', 'Lasa ny hafatra.'],
    ['Choisissez un autre dossier.', 'Choose another folder.', 'Elige otra carpeta.', '请选择其他文件夹。', 'कोई अन्य फ़ोल्डर चुनें।', 'اختر مجلداً آخر.', 'Wählen Sie einen anderen Ordner.', 'Escolha outra pasta.', 'Misafidiana lahatahiry hafa.'],
    ['Supprimer ce compte de Weed OS ?', 'Remove this account from Weed OS?', '¿Eliminar esta cuenta de Weed OS?', '从 Weed OS 中移除此账户？', 'क्या इस खाते को Weed OS से हटाएँ?', 'إزالة هذا الحساب من Weed OS؟', 'Dieses Konto aus Weed OS entfernen?', 'Remover esta conta do Weed OS?', 'Esorina ao amin’ny Weed OS ity kaonty ity?'],
    ['Supprimer définitivement ce message ?', 'Permanently delete this message?', '¿Eliminar este mensaje definitivamente?', '永久删除此邮件？', 'क्या इस संदेश को स्थायी रूप से हटाएँ?', 'حذف هذه الرسالة نهائياً؟', 'Diese Nachricht endgültig löschen?', 'Eliminar esta mensagem definitivamente?', 'Fafana tanteraka ity hafatra ity?'],
    ['Brouillon enregistré de façon chiffrée sur cet appareil.', 'Draft saved encrypted on this device.', 'Borrador guardado cifrado en este dispositivo.', '草稿已加密保存在此设备上。', 'ड्राफ़्ट इस डिवाइस पर एन्क्रिप्टेड रूप में सहेजा गया।', 'تم حفظ المسودة مشفّرة على هذا الجهاز.', 'Entwurf verschlüsselt auf diesem Gerät gespeichert.', 'Rascunho guardado de forma cifrada neste dispositivo.', 'Voatahiry nohamarinina eto amin’ity fitaovana ity ny volavolan-dahatsoratra.'],
    ['Compte enregistré. Mot de passe chiffré localement.', 'Account saved. Password encrypted locally.', 'Cuenta guardada. Contraseña cifrada localmente.', '账户已保存。密码已在本地加密。', 'खाता सहेजा गया। पासवर्ड स्थानीय रूप से एन्क्रिप्ट किया गया।', 'تم حفظ الحساب. كلمة المرور مشفّرة محلياً.', 'Konto gespeichert. Passwort lokal verschlüsselt.', 'Conta guardada. Palavra-passe cifrada localmente.', 'Voatahiry ny kaonty. Nohamarinina eto an-toerana ny tenimiafina.'],
    ['Limite dépassée : 5 fichiers, 5 Mo chacun, 10 Mo au total.', 'Limit exceeded: 5 files, 5 MB each, 10 MB in total.', 'Límite superado: 5 archivos, 5 MB cada uno, 10 MB en total.', '超出限制：最多 5 个文件，每个 5 MB，总计 10 MB。', 'सीमा पार: 5 फ़ाइलें, प्रत्येक 5 MB, कुल 10 MB।', 'تم تجاوز الحد: 5 ملفات، 5 ميغابايت لكل ملف، 10 ميغابايت في المجموع.', 'Limit überschritten: 5 Dateien, je 5 MB, insgesamt 10 MB.', 'Limite excedido: 5 ficheiros, 5 MB cada, 10 MB no total.', 'Tafahoatra ny fetra: rakitra 5, 5 Mo isaky ny iray, 10 Mo ny fitambarany.'],
    ['Aucune pièce jointe sélectionnée.', 'No attachment selected.', 'Ningún adjunto seleccionado.', '未选择附件。', 'कोई अनुलग्नक नहीं चुना गया।', 'لم يتم تحديد أي مرفق.', 'Kein Anhang ausgewählt.', 'Nenhum anexo selecionado.', 'Tsy misy rakitra miaraka voafidy.'],

    /* ---- Moniteur, processus ---- */
    ['Système', 'System', 'Sistema', '系统', 'सिस्टम', 'النظام', 'System', 'Sistema', 'Rafitra'],
    ['Hôte', 'Host', 'Anfitrión', '主机', 'होस्ट', 'المضيف', 'Host', 'Anfitrião', 'Solosaina fototra'],
    ['Architecture', 'Architecture', 'Arquitectura', '架构', 'आर्किटेक्चर', 'البنية', 'Architektur', 'Arquitetura', 'Rafitra fototra'],
    ['Processeurs logiques', 'Logical processors', 'Procesadores lógicos', '逻辑处理器', 'लॉजिकल प्रोसेसर', 'المعالجات المنطقية', 'Logische Prozessoren', 'Processadores lógicos', 'Mpanodina lojika'],
    ['Charge moyenne (1/5/15 min)', 'Load average (1/5/15 min)', 'Carga media (1/5/15 min)', '平均负载（1/5/15 分钟）', 'औसत लोड (1/5/15 मिनट)', 'متوسط الحمل (1/5/15 دقيقة)', 'Durchschnittslast (1/5/15 Min.)', 'Carga média (1/5/15 min)', 'Enta-mavesatra salanalany (1/5/15 min)'],
    ['Temps actif', 'Uptime', 'Tiempo activo', '运行时间', 'अपटाइम', 'مدة التشغيل', 'Betriebszeit', 'Tempo ativo', 'Fotoana nandehanana'],
    ['Mémoire vive', 'Memory (RAM)', 'Memoria RAM', '内存', 'मेमोरी (RAM)', 'الذاكرة (RAM)', 'Arbeitsspeicher', 'Memória RAM', 'Tahiry vonjimaika (RAM)'],
    ['Stockage', 'Storage', 'Almacenamiento', '存储', 'संग्रहण', 'التخزين', 'Speicher', 'Armazenamento', 'Fitahirizana'],
    ['Données Weed', 'Weed data', 'Datos de Weed', 'Weed 数据', 'Weed डेटा', 'بيانات Weed', 'Weed-Daten', 'Dados do Weed', 'Angona Weed'],
    ['Informations de stockage indisponibles.', 'Storage information unavailable.', 'Información de almacenamiento no disponible.', '存储信息不可用。', 'संग्रहण जानकारी उपलब्ध नहीं।', 'معلومات التخزين غير متاحة.', 'Speicherinformationen nicht verfügbar.', 'Informações de armazenamento indisponíveis.', 'Tsy misy ny fampahalalana momba ny fitahirizana.'],
    ['Services Weed OS', 'Weed OS services', 'Servicios de Weed OS', 'Weed OS 服务', 'Weed OS सेवाएँ', 'خدمات Weed OS', 'Weed-OS-Dienste', 'Serviços do Weed OS', 'Tolotra Weed OS'],
    ['Service', 'Service', 'Servicio', '服务', 'सेवा', 'الخدمة', 'Dienst', 'Serviço', 'Tolotra'],
    ['État', 'Status', 'Estado', '状态', 'स्थिति', 'الحالة', 'Status', 'Estado', 'Toetra'],
    ['Nom', 'Name', 'Nombre', '名称', 'नाम', 'الاسم', 'Name', 'Nome', 'Anarana'],
    ['Processus système', 'System processes', 'Procesos del sistema', '系统进程', 'सिस्टम प्रक्रियाएँ', 'عمليات النظام', 'Systemprozesse', 'Processos do sistema', 'Dingan’ny rafitra'],
    ['Cette vue consulte /proc en PHP. Elle n\'envoie aucun signal et ne permet pas d\'arrêter un processus.', 'This view reads /proc in PHP. It sends no signal and cannot stop a process.', 'Esta vista consulta /proc en PHP. No envía ninguna señal ni permite detener un proceso.', '此视图通过 PHP 读取 /proc，不会发送任何信号，也无法终止进程。', 'यह दृश्य PHP में /proc पढ़ता है। यह कोई सिग्नल नहीं भेजता और किसी प्रक्रिया को रोक नहीं सकता।', 'تقرأ هذه الواجهة /proc عبر PHP. لا ترسل أي إشارة ولا تتيح إيقاف أي عملية.', 'Diese Ansicht liest /proc über PHP. Sie sendet kein Signal und kann keinen Prozess beenden.', 'Esta vista consulta /proc em PHP. Não envia sinais nem permite parar um processo.', 'Mamaky /proc amin’ny PHP ity fijery ity. Tsy mandefa famantarana ary tsy afaka manajanona dingana.'],
    ['/proc indisponible sur cet environnement.', '/proc is unavailable in this environment.', '/proc no está disponible en este entorno.', '此环境中 /proc 不可用。', 'इस परिवेश में /proc उपलब्ध नहीं है।', '/proc غير متاح في هذه البيئة.', '/proc ist in dieser Umgebung nicht verfügbar.', '/proc indisponível neste ambiente.', 'Tsy misy ny /proc amin’ity tontolo ity.'],

    /* ---- Installateur, Programmes ---- */
    ['Installer Weed OS sur un disque', 'Install Weed OS to a disk', 'Instalar Weed OS en un disco', '将 Weed OS 安装到磁盘', 'Weed OS को डिस्क पर स्थापित करें', 'تثبيت Weed OS على قرص', 'Weed OS auf einem Datenträger installieren', 'Instalar o Weed OS num disco', 'Hametraka Weed OS amin’ny kapila'],
    ['Attention : effacement complet', 'Warning: complete erasure', 'Atención: borrado completo', '注意：将完全擦除', 'चेतावनी: पूर्ण मिटाव', 'تنبيه: مسح كامل', 'Achtung: vollständiges Löschen', 'Atenção: apagamento completo', 'Tandremo: fafana tanteraka'],
    ['Disque de destination', 'Target disk', 'Disco de destino', '目标磁盘', 'गंतव्य डिस्क', 'القرص الهدف', 'Zieldatenträger', 'Disco de destino', 'Kapila tanjona'],
    ['Chargement des disques…', 'Loading disks…', 'Cargando discos…', '正在加载磁盘…', 'डिस्क लोड हो रही हैं…', 'جارٍ تحميل الأقراص…', 'Datenträger werden geladen…', 'A carregar discos…', 'Eo am-pakàna ny kapila…'],
    ['Détection des disques physiques…', 'Detecting physical disks…', 'Detectando discos físicos…', '正在检测物理磁盘…', 'भौतिक डिस्क खोजी जा रही हैं…', 'جارٍ اكتشاف الأقراص الفعلية…', 'Physische Datenträger werden erkannt…', 'A detetar discos físicos…', 'Mitady kapila ara-batana…'],
    ['Confirmation obligatoire', 'Confirmation required', 'Confirmación obligatoria', '必须确认', 'पुष्टि आवश्यक', 'التأكيد مطلوب', 'Bestätigung erforderlich', 'Confirmação obrigatória', 'Tsy maintsy hamafisina'],
    ['Effacer et installer', 'Erase and install', 'Borrar e instalar', '擦除并安装', 'मिटाएँ और स्थापित करें', 'مسح وتثبيت', 'Löschen und installieren', 'Apagar e instalar', 'Fafao ary apetraka'],
    ['Choisir un disque…', 'Choose a disk…', 'Elegir un disco…', '选择磁盘…', 'डिस्क चुनें…', 'اختر قرصاً…', 'Datenträger wählen…', 'Escolher um disco…', 'Misafidiana kapila…'],
    ['Détection impossible', 'Detection failed', 'Detección imposible', '无法检测', 'पता लगाना संभव नहीं', 'تعذّر الاكتشاف', 'Erkennung nicht möglich', 'Deteção impossível', 'Tsy azo hita'],
    ['Installation terminée', 'Installation complete', 'Instalación terminada', '安装完成', 'स्थापना पूर्ण', 'اكتمل التثبيت', 'Installation abgeschlossen', 'Instalação concluída', 'Vita ny fametrahana'],
    ['Échec de l’installation', 'Installation failed', 'Error de instalación', '安装失败', 'स्थापना विफल', 'فشل التثبيت', 'Installation fehlgeschlagen', 'Falha na instalação', 'Tsy nahomby ny fametrahana'],
    ['Installation terminée. Retirez le support Live puis redémarrez.', 'Installation complete. Remove the Live media, then restart.', 'Instalación terminada. Retira el soporte Live y reinicia.', '安装完成。请移除 Live 介质后重启。', 'स्थापना पूर्ण। Live मीडिया हटाएँ और पुनः प्रारंभ करें।', 'اكتمل التثبيت. أزل وسيط Live ثم أعد التشغيل.', 'Installation abgeschlossen. Live-Medium entfernen und neu starten.', 'Instalação concluída. Retire o suporte Live e reinicie.', 'Vita ny fametrahana. Esory ny Live avy eo avereno alefa.'],
    ['Aucun disque compatible détecté.', 'No compatible disk detected.', 'No se detectó ningún disco compatible.', '未检测到兼容磁盘。', 'कोई संगत डिस्क नहीं मिली।', 'لم يتم اكتشاف قرص متوافق.', 'Kein kompatibler Datenträger erkannt.', 'Nenhum disco compatível detetado.', 'Tsy nisy kapila mifanaraka hita.'],
    ['Sélectionnez un disque compatible.', 'Select a compatible disk.', 'Selecciona un disco compatible.', '请选择兼容的磁盘。', 'कोई संगत डिस्क चुनें।', 'اختر قرصاً متوافقاً.', 'Wählen Sie einen kompatiblen Datenträger.', 'Selecione um disco compatível.', 'Safidio ny kapila mifanaraka.'],
    ['Installer un Programme (.zip)', 'Install a Program (.zip)', 'Instalar un programa (.zip)', '安装程序 (.zip)', 'प्रोग्राम स्थापित करें (.zip)', 'تثبيت برنامج (.zip)', 'Programm installieren (.zip)', 'Instalar um programa (.zip)', 'Mametraka Programa (.zip)'],
    ['Choisissez un fichier .zip', 'Choose a .zip file', 'Elige un archivo .zip', '请选择 .zip 文件', '.zip फ़ाइल चुनें', 'اختر ملف .zip', '.zip-Datei auswählen', 'Escolha um ficheiro .zip', 'Misafidiana rakitra .zip'],
    ['Seuls les administrateurs peuvent installer ou retirer des Programmes.', 'Only administrators can install or remove Programs.', 'Solo los administradores pueden instalar o quitar programas.', '只有管理员可以安装或移除程序。', 'केवल व्यवस्थापक प्रोग्राम स्थापित या हटा सकते हैं।', 'يمكن للمسؤولين فقط تثبيت البرامج أو إزالتها.', 'Nur Administratoren können Programme installieren oder entfernen.', 'Apenas os administradores podem instalar ou remover programas.', 'Ny mpitantana ihany no afaka mametraka na manala programa.'],
    ['Aucun Programme installé.', 'No Programs installed.', 'No hay programas instalados.', '未安装任何程序。', 'कोई प्रोग्राम स्थापित नहीं।', 'لا توجد برامج مثبّتة.', 'Keine Programme installiert.', 'Nenhum programa instalado.', 'Tsy misy programa napetraka.'],
    ['Aucune application installée', 'No applications installed', 'No hay aplicaciones instaladas', '未安装任何应用', 'कोई ऐप स्थापित नहीं', 'لا توجد تطبيقات مثبّتة', 'Keine Anwendungen installiert', 'Nenhuma aplicação instalada', 'Tsy misy rindranasa napetraka'],

    /* ---- Notes, Peinture, Snake, divers ---- */
    ['Mes notes', 'My notes', 'Mis notas', '我的笔记', 'मेरे नोट्स', 'ملاحظاتي', 'Meine Notizen', 'As minhas notas', 'Ny naotiko'],
    ['Enregistré automatiquement', 'Saved automatically', 'Guardado automáticamente', '自动保存', 'अपने आप सहेजा गया', 'يُحفظ تلقائياً', 'Automatisch gespeichert', 'Guardado automaticamente', 'Voatahiry ho azy'],
    ['Écrivez vos idées ici…', 'Write your ideas here…', 'Escribe tus ideas aquí…', '在此写下您的想法…', 'अपने विचार यहाँ लिखें…', 'اكتب أفكارك هنا…', 'Schreiben Sie hier Ihre Ideen auf…', 'Escreva aqui as suas ideias…', 'Soraty eto ny hevitrao…'],
    ['Couleur', 'Color', 'Color', '颜色', 'रंग', 'اللون', 'Farbe', 'Cor', 'Loko'],
    ['Taille', 'Size', 'Tamaño', '大小', 'आकार', 'الحجم', 'Größe', 'Tamanho', 'Habe'],
    ['Effacer', 'Clear', 'Borrar', '清除', 'साफ़ करें', 'مسح', 'Löschen', 'Limpar', 'Fafao'],
    ['Exporter PNG', 'Export PNG', 'Exportar PNG', '导出 PNG', 'PNG निर्यात करें', 'تصدير PNG', 'PNG exportieren', 'Exportar PNG', 'Avoaka PNG'],
    ['Jouer / Recommencer', 'Play / Restart', 'Jugar / Reiniciar', '开始 / 重新开始', 'खेलें / फिर शुरू करें', 'العب / أعد البدء', 'Spielen / Neustart', 'Jogar / Recomeçar', 'Milalà / Atombohy indray'],
    ['Flèches ou ZQSD · Espace pour pause · Mange les graines, évite les murs et ta queue.', 'Arrow keys or WASD · Space to pause · Eat the seeds, avoid the walls and your tail.', 'Flechas o WASD · Espacio para pausar · Come las semillas, evita las paredes y tu cola.', '方向键或 WASD · 空格键暂停 · 吃种子，避开墙壁和自己的尾巴。', 'तीर कुंजियाँ या WASD · रोकने के लिए स्पेस · बीज खाएँ, दीवारों और अपनी पूँछ से बचें।', 'مفاتيح الأسهم أو WASD · مسافة للإيقاف المؤقت · كُل البذور وتجنّب الجدران وذيلك.', 'Pfeiltasten oder WASD · Leertaste für Pause · Samen fressen, Wänden und dem eigenen Schwanz ausweichen.', 'Setas ou WASD · Espaço para pausar · Coma as sementes, evite as paredes e a sua cauda.', 'Zana-tsipika na WASD · Habaka ho fitsaharana · Homano ny voa, ialao ny manda sy ny rambonao.'],
    ['Fin de partie', 'Game over', 'Fin de la partida', '游戏结束', 'खेल समाप्त', 'انتهت اللعبة', 'Spiel vorbei', 'Fim de jogo', 'Vita ny lalao'],
    ['Utilisées récemment', 'Recently used', 'Usadas recientemente', '最近使用', 'हाल ही में उपयोग किए गए', 'المستخدمة مؤخراً', 'Zuletzt verwendet', 'Usadas recentemente', 'Nampiasaina farany'],
    ['Toutes les applications', 'All applications', 'Todas las aplicaciones', '所有应用', 'सभी ऐप', 'كل التطبيقات', 'Alle Anwendungen', 'Todas as aplicações', 'Rindranasa rehetra'],
    ['Rechercher une application…', 'Search applications…', 'Buscar aplicaciones…', '搜索应用…', 'ऐप खोजें…', 'ابحث عن التطبيقات…', 'Anwendungen suchen…', 'Pesquisar aplicações…', 'Hitady rindranasa…'],
    ['Rechercher une app…', 'Search apps…', 'Buscar aplicaciones…', '搜索应用…', 'ऐप खोजें…', 'ابحث عن التطبيقات…', 'Anwendungen suchen…', 'Pesquisar aplicações…', 'Hitady rindranasa…'],
    ['Catégories', 'Categories', 'Categorías', '分类', 'श्रेणियाँ', 'الفئات', 'Kategorien', 'Categorias', 'Sokajy'],
    ['Aucune notification', 'No notifications', 'Sin notificaciones', '没有通知', 'कोई सूचना नहीं', 'لا توجد إشعارات', 'Keine Mitteilungen', 'Sem notificações', 'Tsy misy fampandrenesana'],
    ['Wi-Fi', 'Wi-Fi', 'Wi-Fi', 'Wi-Fi', 'Wi-Fi', 'Wi-Fi', 'WLAN', 'Wi-Fi', 'Wi-Fi'],

    /* ---- Mentions légales ---- */
    ['Composant', 'Component', 'Componente', '组件', 'घटक', 'المكوّن', 'Komponente', 'Componente', 'Singa'],
    ['Licence', 'License', 'Licencia', '许可证', 'लाइसेंस', 'الترخيص', 'Lizenz', 'Licença', 'Fahazoan-dalana'],
    ['Linux (noyau)', 'Linux (kernel)', 'Linux (núcleo)', 'Linux（内核）', 'Linux (कर्नेल)', 'Linux (النواة)', 'Linux (Kernel)', 'Linux (kernel)', 'Linux (kernel)'],
    ['GPL-2.0 ou ultérieure', 'GPL-2.0 or later', 'GPL-2.0 o posterior', 'GPL-2.0 或更高版本', 'GPL-2.0 या बाद का', 'GPL-2.0 أو أحدث', 'GPL-2.0 oder neuer', 'GPL-2.0 ou posterior', 'GPL-2.0 na vao tsy ela'],
    ['GPL-3.0 ou ultérieure', 'GPL-3.0 or later', 'GPL-3.0 o posterior', 'GPL-3.0 或更高版本', 'GPL-3.0 या बाद का', 'GPL-3.0 أو أحدث', 'GPL-3.0 oder neuer', 'GPL-3.0 ou posterior', 'GPL-3.0 na vao tsy ela'],
    ['Licence Bitstream Vera / domaine public', 'Bitstream Vera license / public domain', 'Licencia Bitstream Vera / dominio público', 'Bitstream Vera 许可证 / 公有领域', 'Bitstream Vera लाइसेंस / सार्वजनिक डोमेन', 'ترخيص Bitstream Vera / ملكية عامة', 'Bitstream-Vera-Lizenz / Gemeinfrei', 'Licença Bitstream Vera / domínio público', 'Fahazoan-dalana Bitstream Vera / sehatra ho an’ny daholobe'],
    ['Licence MIT', 'MIT License', 'Licencia MIT', 'MIT 许可证', 'MIT लाइसेंस', 'رخصة MIT', 'MIT-Lizenz', 'Licença MIT', 'Fahazoan-dalana MIT'],
  ];

  /* Chaînes à paramètres : [regex sur le français, [en, es, zh, hi, ar, de, pt, mg]] ($1, $2… = captures) */
  const PATTERNS = [
    [/^(\d+) sélectionnée\(s\) sur (\d+)$/, ["$1 selected of $2", "$1 seleccionada(s) de $2", "已选 $1 / 共 $2", "$2 में से $1 चयनित", "تم تحديد $1 من $2", "$1 von $2 ausgewählt", "$1 selecionada(s) de $2", "$1 voafidy tamin’ny $2"]],
    [/^(\d+) photo\(s\)$/, ["$1 photo(s)", "$1 foto(s)", "$1 张照片", "$1 फ़ोटो", "$1 صورة", "$1 Foto(s)", "$1 fotografia(s)", "Sary $1"]],
    [/^Ajouté à l'album « (.+) »$/, ["Added to album “$1”", "Añadido al álbum «$1»", "已添加到相册“$1”", "एल्बम “$1” में जोड़ा गया", "تمت الإضافة إلى الألبوم «$1»", "Zum Album „$1“ hinzugefügt", "Adicionado ao álbum «$1»", "Nampidirina tao amin’ny rakitsary “$1”"]],
    [/^Import… (\d+)\/(\d+)$/, ["Importing… $1/$2", "Importando… $1/$2", "正在导入… $1/$2", "आयात हो रहा है… $1/$2", "جارٍ الاستيراد… $1/$2", "Import… $1/$2", "A importar… $1/$2", "Eo am-pampidirana… $1/$2"]],
    [/^(\d+) importée\(s\), (\d+) échec\(s\)\.$/, ["$1 imported, $2 failed.", "$1 importada(s), $2 error(es).", "已导入 $1 张，失败 $2 张。", "$1 आयात हुईं, $2 विफल।", "تم استيراد $1، وفشل $2.", "$1 importiert, $2 fehlgeschlagen.", "$1 importada(s), $2 falha(s).", "$1 voampidirina, $2 tsy nahomby."]],
    [/^(\d+) photo\(s\) importée\(s\)\.$/, ["$1 photo(s) imported.", "$1 foto(s) importada(s).", "已导入 $1 张照片。", "$1 फ़ोटो आयात हुईं।", "تم استيراد $1 صورة.", "$1 Foto(s) importiert.", "$1 fotografia(s) importada(s).", "Sary $1 voampidirina."]],
    [/^(\d+) photo\(s\) n'ont pas pu être supprimées\.$/, ["$1 photo(s) could not be deleted.", "No se pudieron eliminar $1 foto(s).", "无法删除 $1 张照片。", "$1 फ़ोटो हटाई नहीं जा सकीं।", "تعذّر حذف $1 صورة.", "$1 Foto(s) konnten nicht gelöscht werden.", "Não foi possível eliminar $1 fotografia(s).", "Tsy voafafa ny sary $1."]],
    [/^Supprimer (\d+) photos définitivement \? Cette action est irréversible\.$/, ["Permanently delete $1 photos? This cannot be undone.", "¿Eliminar $1 fotos definitivamente? Esta acción es irreversible.", "永久删除 $1 张照片？此操作无法撤销。", "$1 फ़ोटो स्थायी रूप से हटाएँ? यह कार्रवाई पूर्ववत नहीं हो सकती।", "حذف $1 صورة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.", "$1 Fotos endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.", "Eliminar $1 fotografias definitivamente? Esta ação é irreversível.", "Fafana tanteraka ve ny sary $1? Tsy azo averina ity asa ity."]],
    [/^(.*) · modifiée$/, ["$1 · modified", "$1 · modificada", "$1 · 已修改", "$1 · संशोधित", "$1 · معدّلة", "$1 · geändert", "$1 · modificada", "$1 · novaina"]],
    [/^Dernière lecture : (.+)$/, ['Last reading: $1', 'Última lectura: $1', '最近读取：$1', 'अंतिम पठन: $1', 'آخر قراءة: $1', 'Letzte Messung: $1', 'Última leitura: $1', 'Famakiana farany: $1']],
    [/^(\d+) élément\(s\) · (.*)$/, ['$1 item(s) · $2', '$1 elemento(s) · $2', '$1 项 · $2', '$1 आइटम · $2', '$1 عنصر · $2', '$1 Element(e) · $2', '$1 item(ns) · $2', 'singa $1 · $2']],
    [/^(\d+) éléments?$/, ['$1 item(s)', '$1 elemento(s)', '$1 项', '$1 आइटम', '$1 عنصر', '$1 Element(e)', '$1 item(ns)', 'singa $1']],
    [/^Ouvrir (.+)$/, ['Open $1', 'Abrir $1', '打开 $1', '$1 खोलें', 'فتح $1', '$1 öffnen', 'Abrir $1', 'Sokafy ny $1']],
    [/^Version (.+)$/, ['Version $1', 'Versión $1', '版本 $1', 'संस्करण $1', 'الإصدار $1', 'Version $1', 'Versão $1', 'Version $1']],
    [/^Projet libre et expérimental, licence (.+)$/, ['Free, experimental project, $1 license', 'Proyecto libre y experimental, licencia $1', '自由的实验性项目，$1 许可证', 'मुक्त और प्रायोगिक परियोजना, $1 लाइसेंस', 'مشروع حر وتجريبي، ترخيص $1', 'Freies, experimentelles Projekt, $1-Lizenz', 'Projeto livre e experimental, licença $1', 'Tetikasa maimaim-poana sy andrana, fahazoan-dalana $1']],
    [/^Créé par (.+)$/, ['Created by $1', 'Creado por $1', '作者：$1', 'निर्माता: $1', 'من إنشاء $1', 'Erstellt von $1', 'Criado por $1', 'Noforonin’i $1']],
    [/^Fond d’écran (\d+)$/, ['Wallpaper $1', 'Fondo de pantalla $1', '壁纸 $1', 'वॉलपेपर $1', 'الخلفية $1', 'Hintergrundbild $1', 'Papel de parede $1', 'Sary ambadika $1']],
    [/^Connecté : (.+)$/, ['Connected: $1', 'Conectado: $1', '已连接：$1', 'कनेक्टेड: $1', 'متصل: $1', 'Verbunden: $1', 'Ligado: $1', 'Mifandray: $1']],
    [/^Monté : (.+)$/, ['Mounted: $1', 'Montado: $1', '已挂载：$1', 'माउंट किया गया: $1', 'مُركَّب: $1', 'Eingehängt: $1', 'Montado: $1', 'Voapetraka: $1']],
    [/^Non monté$/, ['Not mounted', 'No montado', '未挂载', 'माउंट नहीं', 'غير مُركَّب', 'Nicht eingehängt', 'Não montado', 'Tsy voapetraka']],
    [/^(.+) utilisés$/, ['$1 used', '$1 usados', '已用 $1', '$1 उपयोग में', '$1 مستخدم', '$1 belegt', '$1 usados', '$1 ampiasaina']],
    [/^(.+) libres \/ (.+)$/, ['$1 free / $2', '$1 libres / $2', '可用 $1 / $2', '$1 मुक्त / $2', '$1 متاح / $2', '$1 frei / $2', '$1 livres / $2', '$1 malalaka / $2']],
    [/^Actualisé : (.+)$/, ['Updated: $1', 'Actualizado: $1', '已刷新：$1', 'अपडेट: $1', 'آخر تحديث: $1', 'Aktualisiert: $1', 'Atualizado: $1', 'Navaozina: $1']],
    [/^(\d+) processus détectés · lecture seule$/, ['$1 processes detected · read-only', '$1 procesos detectados · solo lectura', '检测到 $1 个进程 · 只读', '$1 प्रक्रियाएँ मिलीं · केवल पढ़ने के लिए', 'تم اكتشاف $1 عملية · للقراءة فقط', '$1 Prozesse erkannt · schreibgeschützt', '$1 processos detetados · só de leitura', 'Dingana $1 hita · fijerena ihany']],
    [/^Bluetooth activé(.*)$/, ['Bluetooth is on$1', 'Bluetooth activado$1', '蓝牙已开启$1', 'ब्लूटूथ चालू है$1', 'البلوتوث مفعّل$1', 'Bluetooth ist eingeschaltet$1', 'Bluetooth ativado$1', 'Mandeha ny Bluetooth$1']],
    [/^(.*) · recherche en cours(.*)$/, ['$1 · scanning$2', '$1 · buscando$2', '$1 · 正在搜索$2', '$1 · खोज जारी$2', '$1 · جارٍ البحث$2', '$1 · Suche läuft$2', '$1 · a procurar$2', '$1 · mitady$2']],
    [/^Brouillon non enregistré : (.+)$/, ['Draft not saved: $1', 'Borrador no guardado: $1', '草稿未保存：$1', 'ड्राफ़्ट सहेजा नहीं गया: $1', 'لم تُحفظ المسودة: $1', 'Entwurf nicht gespeichert: $1', 'Rascunho não guardado: $1', 'Tsy voatahiry ny volavolan-dahatsoratra: $1']],
    [/^Le (.+), (.+) a écrit :$/, ['On $1, $2 wrote:', 'El $1, $2 escribió:', '$1，$2 写道：', '$1 को $2 ने लिखा:', 'في $1، كتب $2:', 'Am $1 schrieb $2:', 'Em $1, $2 escreveu:', 'Tamin’ny $1, nanoratra i $2:']],
    [/^Un élément nommé « (.+) » existe déjà\.$/, ['An item named “$1” already exists.', 'Ya existe un elemento llamado «$1».', '已存在名为“$1”的项目。', '“$1” नाम का आइटम पहले से मौजूद है।', 'يوجد عنصر باسم «$1» بالفعل.', 'Ein Element namens „$1“ existiert bereits.', 'Já existe um item com o nome «$1».', 'Efa misy singa mitondra ny anarana “$1”.']],
    [/^Supprimer « (.+) » définitivement \? Cette action est irréversible\.$/, ['Permanently delete “$1”? This cannot be undone.', '¿Eliminar «$1» definitivamente? Esta acción es irreversible.', '永久删除“$1”？此操作无法撤销。', '“$1” को स्थायी रूप से हटाएँ? यह कार्रवाई पूर्ववत नहीं हो सकती।', 'حذف «$1» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.', '„$1“ endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.', 'Eliminar «$1» definitivamente? Esta ação é irreversível.', 'Fafana tanteraka ve “$1”? Tsy azo averina ity asa ity.']],
  ];

  const apo = re => new RegExp(re.source.replace(/\u2019/g, "['\u2019]"));
  const norm = s => s.replace(/\u2019|\u2018/g, "'").replace(/\s+/g, ' ').trim();
  const MAP = new Map(ROWS.map(r => [norm(r[0]), r.slice(1)]));
  const SKIP = 'script,style,textarea,pre,code,.term,[data-no-i18n]';      // texte (le contenu saisi n'est jamais traduit)
  const SKIP_ATTR = '[data-no-i18n],.term';                                  // attributs (les placeholder de champs sont traduits)
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const textOrig = new WeakMap();   // nœud texte -> { fr, out }
  const attrOrig = new WeakMap();   // élément -> { attr: { fr, out } }
  const titleOrig = new Map();      // id app -> titre français d'origine

  const lang = () => { try { return localStorage.getItem('ui.lang') || 'fr'; } catch (e) { return 'fr'; } };
  const idx = l => LANGS.indexOf(l);

  /* Traduit une chaîne française ; renvoie null si aucune règle ne s'applique. */
  function translate(source, l) {
    const i = idx(l); if (i < 0 || typeof source !== 'string') return null;
    const core = source.trim(); if (!core) return null;
    const key = norm(core);
    const hit = MAP.get(key);
    if (hit && hit[i]) return source.replace(core, () => hit[i]);
    const parts = core.split(/(?<=[.!?…])\s+/);
    if (parts.length > 1) {
      const outs = parts.map(x => { const h = MAP.get(norm(x)); return h && h[i] ? h[i] : null; });
      if (outs.every(Boolean)) return source.replace(core, () => outs.join(l === 'zh' ? '' : ' '));
    }
    for (const [re0, tpl] of PATTERNS) {
      const m = core.match(re0.__apo || (re0.__apo = apo(re0)));
      if (m && tpl[i]) {
        const out = tpl[i].replace(/\$(\d)/g, (_, n) => translateInner(m[n], l));
        return source.replace(core, () => out);
      }
    }
    return null;
  }
  /* Les captures peuvent elles-mêmes être des textes français (ex. nom d'application). */
  function translateInner(text, l) { return text == null ? '' : (translate(text, l) ?? text); }
  function t(text) { const l = lang(); return l === 'fr' ? text : (translate(String(text), l) ?? text); }

  function skipped(node) {
    const e = node.nodeType === 1 ? node : node.parentElement;
    return !e || !!e.closest(SKIP);
  }
  function doText(node, l) {
    let rec = textOrig.get(node);
    if (rec && node.data !== rec.out) rec = null;           // le texte a été réécrit par l'application
    const fr = rec ? rec.fr : node.data;
    if (l === 'fr') { if (rec) { node.data = fr; textOrig.delete(node); } return; }
    if (skipped(node)) return;
    const out = translate(fr, l);
    if (out != null && out !== node.data) { textOrig.set(node, { fr, out }); node.data = out; }
    else if (out == null && rec) { node.data = fr; textOrig.delete(node); }
  }
  function doAttrs(el, l) {
    if (el.nodeType !== 1 || (l !== 'fr' && el.closest(SKIP_ATTR))) return;
    let rec = attrOrig.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a), r = rec && rec[a];
      const fr = r && r.out === cur ? r.fr : cur;
      if (l === 'fr') { if (r && r.out === cur) { el.setAttribute(a, fr); delete rec[a]; } continue; }
      const out = translate(fr, l);
      if (out != null && out !== cur) { rec = rec || {}; rec[a] = { fr, out }; attrOrig.set(el, rec); el.setAttribute(a, out); }
    }
  }
  function walk(root, l) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root, l);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) doAttrs(root, l);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n; while ((n = tw.nextNode())) n.nodeType === 3 ? doText(n, l) : doAttrs(n, l);
  }

  /* Titres des applications (fenêtres, dock, Spotlight, App Center) */
  function translateTitles(l) {
    if (typeof APPS === 'undefined') return;
    for (const [id, app] of Object.entries(APPS)) {
      if (!titleOrig.has(id) && typeof app.title === 'string' && MAP.has(norm(app.title))) titleOrig.set(id, app.title);
      const fr = titleOrig.get(id); if (!fr) continue;
      app.title = l === 'fr' ? fr : (translate(fr, l) ?? fr);
    }
  }

  let busy = false;
  function apply() {
    const l = lang(); busy = true;
    try { translateTitles(l); walk(document.body, l); document.title = 'Weed OS'; }
    finally { busy = false; }
  }
  const observer = new MutationObserver(list => {
    if (busy) return;
    const l = lang(); if (l === 'fr') return;
    busy = true;
    try {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target, l);
        else if (m.type === 'attributes') doAttrs(m.target, l);
        else m.addedNodes.forEach(n => walk(n, l));
      }
      translateTitles(l);
    } finally { busy = false; }
  });

  /* confirm() / alert() / prompt() ne passent pas par le DOM */
  for (const fn of ['confirm', 'alert', 'prompt']) {
    const native = window[fn].bind(window);
    window[fn] = (msg, ...rest) => native(t(msg), ...rest);
  }

  /* Locale pour les dates (calendrier, horloge) */
  const LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', zh: 'zh-CN', hi: 'hi-IN', ar: 'ar', de: 'de-DE', pt: 'pt-PT', mg: 'mg-MG' };
  const locale = () => LOCALES[lang()] || 'fr-FR';
  function weekdayInitials() {
    const out = [];
    for (let d = 0; d < 7; d++) { try { out.push(new Date(2024, 0, 1 + d).toLocaleDateString(locale(), { weekday: 'narrow' })); } catch (e) { out.push('LMMJVSD'[d]); } }
    return out;
  }

  /* Mentions légales : paragraphes complets (contiennent du balisage, donc hors du dictionnaire ligne à ligne) */
  const LEGAL = {
    fr: {
      title: 'Mentions légales et crédits',
      p1: '© 2026 Tantely Orion. Weed OS est un logiciel libre distribué sous <b>licence MIT</b> (fichier <code>LICENSE</code>). Le nom, le logo et les fonds d’écran « Weed OS Project » font partie du projet.',
      p2: 'Éditeur et auteur : Tantely Orion. Première publication officielle : version 1.0.0.',
      icons: 'Icônes', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — icônes sous licence CC BY 4.0, polices sous licence SIL OFL 1.1, code sous licence MIT. Détails : <code>fontawesome.com/license/free</code>.',
      sounds: 'Sons du système', s1: '<b>Son de démarrage</b> (<code>startup.mp3</code>) et <b>son d’arrêt</b> (<code>shutdown.mp3</code>) : Brigitte Rasoafaniry.', s2: '<b>Son d’erreur</b> (<code>error.mp3</code>) : %U (Pixabay), diffusé sous la licence Pixabay.',
      wallpapers: 'Fonds d’écran', p4: 'Les images « Pexels » sont diffusées sous la licence Pexels par leurs auteurs. Les droits de chaque image restent à son auteur ou à son projet d’origine ; aucune propriété sur ces œuvres n’est revendiquée par Weed OS en dehors de celles du projet.',
      p5: 'Votre propre photo choisie dans Réglages reste votre propriété et n’est pas transmise à des tiers par Weed OS.',
      third: 'Composants logiciels tiers', p6: 'L’édition bootable repose sur des logiciels libres écrits par d’autres. Les licences ci-dessous sont indiquées à titre informatif ; les textes officiels fournis avec chaque composant (et générés par Buildroot, <code>make legal-info</code>) font foi.',
      comp: 'Composant', lic: 'Licence', mit: 'Licence MIT',
      netTitle: 'Réseau et services externes', netP: 'Les fonctions nécessitant Internet (navigateur, courrier, réseau) dépendent de la connexion et des services du système hôte.'
    },
    en: {
      title: 'Legal notices and credits',
      p1: '© 2026 Tantely Orion. Weed OS is free software distributed under the <b>MIT license</b> (<code>LICENSE</code> file). The name, logo and “Weed OS Project” wallpapers are part of the project.',
      p2: 'Publisher and author: Tantely Orion. First official release: version 1.0.0.',
      icons: 'Icons', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — icons under the CC BY 4.0 license, fonts under the SIL OFL 1.1 license, code under the MIT license. Details: <code>fontawesome.com/license/free</code>.',
      sounds: 'System sounds', s1: '<b>Startup sound</b> (<code>startup.mp3</code>) and <b>shutdown sound</b> (<code>shutdown.mp3</code>): Brigitte Rasoafaniry.', s2: '<b>Error sound</b> (<code>error.mp3</code>): %U (Pixabay), distributed under the Pixabay license.',
      wallpapers: 'Wallpapers', p4: 'The “Pexels” images are distributed under the Pexels license by their authors. Rights to each image remain with its author or original project; Weed OS claims no ownership of these works other than those of the project itself.',
      p5: 'Your own photo chosen in Settings remains your property and is not shared with third parties by Weed OS.',
      third: 'Third-party software components', p6: 'The bootable edition relies on free software written by others. The licenses below are given for information; the official texts supplied with each component (and generated by Buildroot, <code>make legal-info</code>) are authoritative.',
      comp: 'Component', lic: 'License', mit: 'MIT License',
      netTitle: 'Network and external services', netP: 'Features that require the Internet (browser, mail, network) depend on the connection and services of the host system.'
    },
    es: {
      title: 'Avisos legales y créditos',
      p1: '© 2026 Tantely Orion. Weed OS es software libre distribuido bajo la <b>licencia MIT</b> (archivo <code>LICENSE</code>). El nombre, el logotipo y los fondos de pantalla «Weed OS Project» forman parte del proyecto.',
      p2: 'Editor y autor: Tantely Orion. Primera publicación oficial: versión 1.0.0.',
      icons: 'Iconos', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — iconos bajo licencia CC BY 4.0, fuentes bajo licencia SIL OFL 1.1, código bajo licencia MIT. Detalles: <code>fontawesome.com/license/free</code>.',
      sounds: 'Sonidos del sistema', s1: '<b>Sonido de inicio</b> (<code>startup.mp3</code>) y <b>sonido de apagado</b> (<code>shutdown.mp3</code>): Brigitte Rasoafaniry.', s2: '<b>Sonido de error</b> (<code>error.mp3</code>): %U (Pixabay), distribuido bajo la licencia Pixabay.',
      wallpapers: 'Fondos de pantalla', p4: 'Las imágenes «Pexels» son distribuidas por sus autores bajo la licencia Pexels. Los derechos de cada imagen pertenecen a su autor o a su proyecto de origen; Weed OS no reclama la propiedad de estas obras salvo las del propio proyecto.',
      p5: 'Tu propia foto elegida en Ajustes sigue siendo de tu propiedad y Weed OS no la transmite a terceros.',
      third: 'Componentes de software de terceros', p6: 'La edición arrancable se basa en software libre escrito por otras personas. Las licencias siguientes se indican a título informativo; los textos oficiales incluidos con cada componente (y generados por Buildroot, <code>make legal-info</code>) son los que prevalecen.',
      comp: 'Componente', lic: 'Licencia', mit: 'Licencia MIT',
      netTitle: 'Red y servicios externos', netP: 'Las funciones que requieren Internet (navegador, correo, red) dependen de la conexión y de los servicios del sistema anfitrión.'
    },
    zh: {
      title: '法律声明与致谢',
      p1: '© 2026 Tantely Orion。Weed OS 是以 <b>MIT 许可证</b>（<code>LICENSE</code> 文件）发布的自由软件。名称、徽标以及“Weed OS Project”壁纸均属于本项目。',
      p2: '发布者与作者：Tantely Orion。首个正式版本：1.0.0。',
      icons: '图标', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — 图标采用 CC BY 4.0 许可证，字体采用 SIL OFL 1.1 许可证，代码采用 MIT 许可证。详情：<code>fontawesome.com/license/free</code>。',
      sounds: '系统声音', s1: '<b>启动音</b>（<code>startup.mp3</code>）和<b>关机音</b>（<code>shutdown.mp3</code>）：Brigitte Rasoafaniry。', s2: '<b>错误音</b>（<code>error.mp3</code>）：%U（Pixabay），按 Pixabay 许可证发布。',
      wallpapers: '壁纸', p4: '“Pexels”图片由其作者按 Pexels 许可证发布。每张图片的权利仍归其作者或原始项目所有；除项目自身作品外，Weed OS 不主张对这些作品的任何所有权。',
      p5: '您在“设置”中选择的个人照片仍归您所有，Weed OS 不会将其传输给第三方。',
      third: '第三方软件组件', p6: '可启动版本基于他人编写的自由软件。以下许可证仅供参考；各组件附带的官方文本（由 Buildroot 通过 <code>make legal-info</code> 生成）具有最终效力。',
      comp: '组件', lic: '许可证', mit: 'MIT 许可证',
      netTitle: '网络与外部服务', netP: '需要互联网的功能（浏览器、邮件、网络）取决于主机系统的连接和服务。'
    },
    hi: {
      title: 'कानूनी सूचनाएँ और श्रेय',
      p1: '© 2026 Tantely Orion। Weed OS एक मुक्त सॉफ़्टवेयर है जो <b>MIT लाइसेंस</b> (<code>LICENSE</code> फ़ाइल) के अंतर्गत वितरित है। नाम, लोगो और “Weed OS Project” वॉलपेपर परियोजना का हिस्सा हैं।',
      p2: 'प्रकाशक और लेखक: Tantely Orion। पहला आधिकारिक प्रकाशन: संस्करण 1.0.0।',
      icons: 'आइकन', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — आइकन CC BY 4.0 लाइसेंस के अंतर्गत, फ़ॉन्ट SIL OFL 1.1 लाइसेंस के अंतर्गत, कोड MIT लाइसेंस के अंतर्गत। विवरण: <code>fontawesome.com/license/free</code>।',
      sounds: 'सिस्टम ध्वनियाँ', s1: '<b>स्टार्टअप ध्वनि</b> (<code>startup.mp3</code>) और <b>शटडाउन ध्वनि</b> (<code>shutdown.mp3</code>): Brigitte Rasoafaniry।', s2: '<b>त्रुटि ध्वनि</b> (<code>error.mp3</code>): %U (Pixabay), Pixabay लाइसेंस के अंतर्गत वितरित।',
      wallpapers: 'वॉलपेपर', p4: '“Pexels” चित्र उनके लेखकों द्वारा Pexels लाइसेंस के अंतर्गत वितरित हैं। प्रत्येक चित्र के अधिकार उसके लेखक या मूल परियोजना के पास रहते हैं; परियोजना की अपनी कृतियों के अलावा Weed OS इन कृतियों पर कोई स्वामित्व नहीं जताता।',
      p5: 'सेटिंग्स में चुनी गई आपकी अपनी फ़ोटो आपकी संपत्ति रहती है और Weed OS द्वारा किसी तीसरे पक्ष को नहीं भेजी जाती।',
      third: 'तृतीय-पक्ष सॉफ़्टवेयर घटक', p6: 'बूट करने योग्य संस्करण दूसरों द्वारा लिखे मुक्त सॉफ़्टवेयर पर आधारित है। नीचे दिए लाइसेंस केवल जानकारी के लिए हैं; प्रत्येक घटक के साथ दिए गए आधिकारिक पाठ (Buildroot द्वारा <code>make legal-info</code> से बनाए गए) ही मान्य हैं।',
      comp: 'घटक', lic: 'लाइसेंस', mit: 'MIT लाइसेंस',
      netTitle: 'नेटवर्क और बाहरी सेवाएँ', netP: 'इंटरनेट की आवश्यकता वाली सुविधाएँ (ब्राउज़र, मेल, नेटवर्क) होस्ट सिस्टम के कनेक्शन और सेवाओं पर निर्भर करती हैं।'
    },
    ar: {
      title: 'الإشعارات القانونية والاعتمادات',
      p1: '© 2026 Tantely Orion. Weed OS برنامج حر يُوزَّع بموجب <b>رخصة MIT</b> (الملف <code>LICENSE</code>). الاسم والشعار وخلفيات «Weed OS Project» جزء من المشروع.',
      p2: 'الناشر والمؤلف: Tantely Orion. أول إصدار رسمي: النسخة 1.0.0.',
      icons: 'الأيقونات', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — الأيقونات بموجب رخصة CC BY 4.0، والخطوط بموجب رخصة SIL OFL 1.1، والشيفرة بموجب رخصة MIT. التفاصيل: <code>fontawesome.com/license/free</code>.',
      sounds: 'أصوات النظام', s1: '<b>صوت بدء التشغيل</b> (<code>startup.mp3</code>) و<b>صوت الإيقاف</b> (<code>shutdown.mp3</code>): Brigitte Rasoafaniry.', s2: '<b>صوت الخطأ</b> (<code>error.mp3</code>): %U (Pixabay)، يُوزَّع بموجب رخصة Pixabay.',
      wallpapers: 'الخلفيات', p4: 'تُوزَّع صور «Pexels» من قِبل مؤلفيها بموجب رخصة Pexels. تبقى حقوق كل صورة لمؤلفها أو لمشروعها الأصلي؛ ولا يدّعي Weed OS ملكية هذه الأعمال باستثناء أعمال المشروع نفسه.',
      p5: 'صورتك الخاصة التي تختارها في الإعدادات تبقى ملكاً لك ولا ينقلها Weed OS إلى أطراف ثالثة.',
      third: 'مكوّنات برمجية تابعة لجهات خارجية', p6: 'يعتمد الإصدار القابل للإقلاع على برامج حرة كتبها آخرون. التراخيص أدناه لأغراض المعلومات؛ والنصوص الرسمية المرفقة بكل مكوّن (والمولَّدة بواسطة Buildroot عبر <code>make legal-info</code>) هي المرجع.',
      comp: 'المكوّن', lic: 'الترخيص', mit: 'رخصة MIT',
      netTitle: 'الشبكة والخدمات الخارجية', netP: 'تعتمد الميزات التي تتطلب الإنترنت (المتصفح والبريد والشبكة) على اتصال النظام المضيف وخدماته.'
    },
    de: {
      title: 'Rechtliche Hinweise und Danksagungen',
      p1: '© 2026 Tantely Orion. Weed OS ist freie Software unter der <b>MIT-Lizenz</b> (Datei <code>LICENSE</code>). Name, Logo und die Hintergrundbilder „Weed OS Project“ gehören zum Projekt.',
      p2: 'Herausgeber und Autor: Tantely Orion. Erste offizielle Veröffentlichung: Version 1.0.0.',
      icons: 'Symbole', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — Symbole unter CC-BY-4.0-Lizenz, Schriften unter SIL-OFL-1.1-Lizenz, Code unter MIT-Lizenz. Details: <code>fontawesome.com/license/free</code>.',
      sounds: 'Systemklänge', s1: '<b>Startklang</b> (<code>startup.mp3</code>) und <b>Herunterfahr-Klang</b> (<code>shutdown.mp3</code>): Brigitte Rasoafaniry.', s2: '<b>Fehlerklang</b> (<code>error.mp3</code>): %U (Pixabay), verbreitet unter der Pixabay-Lizenz.',
      wallpapers: 'Hintergrundbilder', p4: 'Die „Pexels“-Bilder werden von ihren Urhebern unter der Pexels-Lizenz verbreitet. Die Rechte an jedem Bild verbleiben beim Urheber oder beim ursprünglichen Projekt; Weed OS erhebt keinen Eigentumsanspruch auf diese Werke, außer auf die des Projekts selbst.',
      p5: 'Ihr eigenes, in den Einstellungen gewähltes Foto bleibt Ihr Eigentum und wird von Weed OS nicht an Dritte weitergegeben.',
      third: 'Software-Komponenten von Drittanbietern', p6: 'Die startfähige Edition beruht auf freier Software anderer Autoren. Die untenstehenden Lizenzen dienen nur der Information; maßgeblich sind die offiziellen Texte, die jeder Komponente beiliegen (und von Buildroot mit <code>make legal-info</code> erzeugt werden).',
      comp: 'Komponente', lic: 'Lizenz', mit: 'MIT-Lizenz',
      netTitle: 'Netzwerk und externe Dienste', netP: 'Funktionen, die das Internet benötigen (Browser, E-Mail, Netzwerk), hängen von der Verbindung und den Diensten des Hostsystems ab.'
    },
    pt: {
      title: 'Avisos legais e créditos',
      p1: '© 2026 Tantely Orion. O Weed OS é software livre distribuído sob a <b>licença MIT</b> (ficheiro <code>LICENSE</code>). O nome, o logótipo e os papéis de parede «Weed OS Project» fazem parte do projeto.',
      p2: 'Editor e autor: Tantely Orion. Primeira publicação oficial: versão 1.0.0.',
      icons: 'Ícones', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — ícones sob licença CC BY 4.0, tipos de letra sob licença SIL OFL 1.1, código sob licença MIT. Detalhes: <code>fontawesome.com/license/free</code>.',
      sounds: 'Sons do sistema', s1: '<b>Som de arranque</b> (<code>startup.mp3</code>) e <b>som de encerramento</b> (<code>shutdown.mp3</code>): Brigitte Rasoafaniry.', s2: '<b>Som de erro</b> (<code>error.mp3</code>): %U (Pixabay), distribuído sob a licença Pixabay.',
      wallpapers: 'Papéis de parede', p4: 'As imagens «Pexels» são distribuídas pelos seus autores sob a licença Pexels. Os direitos de cada imagem permanecem com o seu autor ou projeto de origem; o Weed OS não reivindica a propriedade destas obras, exceto as do próprio projeto.',
      p5: 'A sua própria fotografia escolhida nas Definições continua a ser sua e não é transmitida a terceiros pelo Weed OS.',
      third: 'Componentes de software de terceiros', p6: 'A edição de arranque assenta em software livre escrito por outros. As licenças abaixo são indicadas a título informativo; os textos oficiais fornecidos com cada componente (e gerados pelo Buildroot, <code>make legal-info</code>) são os que fazem fé.',
      comp: 'Componente', lic: 'Licença', mit: 'Licença MIT',
      netTitle: 'Rede e serviços externos', netP: 'As funcionalidades que requerem Internet (navegador, correio, rede) dependem da ligação e dos serviços do sistema anfitrião.'
    },
    mg: {
      title: 'Fanamarihana ara-dalàna sy fisaorana',
      p1: '© 2026 Tantely Orion. Rindrambaiko malalaka ny Weed OS, zarainà eo ambanin’ny <b>fahazoan-dalana MIT</b> (rakitra <code>LICENSE</code>). Anisan’ny tetikasa ny anarana, ny logo ary ny sary ambadika “Weed OS Project”.',
      p2: 'Mpamoaka sy mpamorona: Tantely Orion. Famoahana ofisialy voalohany: version 1.0.0.',
      icons: 'Sary kely', p3: '<b>Font Awesome Free</b> © Fonticons, Inc. — sary kely eo ambanin’ny CC BY 4.0, endrika soratra eo ambanin’ny SIL OFL 1.1, kaody eo ambanin’ny MIT. Antsipiriany: <code>fontawesome.com/license/free</code>.',
      sounds: 'Feon’ny rafitra', s1: '<b>Feon’ny fandehanana</b> (<code>startup.mp3</code>) sy <b>feon’ny famonoana</b> (<code>shutdown.mp3</code>): Brigitte Rasoafaniry.', s2: '<b>Feon’ny hadisoana</b> (<code>error.mp3</code>): %U (Pixabay), zarainà eo ambanin’ny fahazoan-dalana Pixabay.',
      wallpapers: 'Sary ambadika', p4: 'Ny sary “Pexels” dia zarain’ny mpamorona azy eo ambanin’ny fahazoan-dalana Pexels. Ny zon’ny sary tsirairay dia an’ny mpamorona azy na ny tetikasa niaviany; tsy mitaky fananana amin’ireo asa ireo ny Weed OS afa-tsy ny an’ny tetikasa mihitsy.',
      p5: 'Ny sarinao manokana voafidy ao amin’ny Fikirana dia mijanona ho anao ary tsy alain’ny Weed OS ho an’ny hafa.',
      third: 'Singa rindrambaiko avy amin’ny hafa', p6: 'Miorina amin’ny rindrambaiko malalaka sorat’ny hafa ny dikan-tsary azo andehanana. Ho fampahalalana ihany ny fahazoan-dalana etsy ambany; ny soratra ofisialy omena miaraka amin’ny singa tsirairay (novolavolain’ny Buildroot, <code>make legal-info</code>) no manan-kery.',
      comp: 'Singa', lic: 'Fahazoan-dalana', mit: 'Fahazoan-dalana MIT',
      netTitle: 'Tambajotra sy tolotra ivelany', netP: 'Miankina amin’ny fifandraisana sy ny tolotry ny solosaina fototra ny asa mila Internet (navigatera, mailaka, tambajotra).'
    }
  };

  function legalText() { return LEGAL[lang()] || LEGAL.fr; }

  window.I18N = { t, apply, translate, lang, locale, weekdayInitials, legalText, rows: ROWS, patterns: PATTERNS };

  function start() {
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    apply();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
