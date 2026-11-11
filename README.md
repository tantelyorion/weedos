# 🌿 Weed OS

Version : **1.0.0** — première version publique de Weed OS (les numéros 0.8.x étaient des révisions de développement internes).

Système d'exploitation minimaliste, open source (MIT), dont la couche système est écrite en **PHP**.
Créé par **Tantely Orion** — projet expérimental et un peu « mème ».

![logo](system/desktop/assets/logo-green.png)

Logos : `system/desktop/assets/` (vert, noir, blanc transparent ; originaux haute résolution dans `docs/brand/`).

## Architecture (honnête et réaliste)

Un noyau écrit en PHP ne peut pas piloter le matériel (mode protégé, mémoire, interruptions) : PHP est un langage interprété qui a besoin d'un système sous lui. Weed OS adopte donc l'architecture suivante, qui donne un **vrai système bootable** tout en gardant PHP comme cœur du système :

```
BIOS/GRUB ──► Linux (pilotes matériels, ring 0)
                 └─► weedinit (Rust, PID 1)             init/
                        └─► WEED KERNEL (PHP)           kernel/    ← le "noyau" de Weed OS
                               ├─ superviseur de services (relance, journal, extinction)
                               ├─ VFS, appels système (syscalls), shell wsh
                               ├─ gestionnaire de Programmes .zip
                               ├─ service "shell"  : serveur PHP + API syscall   system/router.php
                               └─ service "display": cage + cog (affiche le bureau) system/desktop/
```

| Couche | Langage | Rôle |
|---|---|---|
| `boot/boot.asm` | Assembly | secteur de boot de test (stage 0) |
| `init/` | Rust | PID 1 : monte /proc /sys /dev, lance et relance le kernel PHP |
| `kernel/` | **PHP** | Weed Kernel : services, VFS, syscalls, paquets, installateur |
| `system/` | PHP + HTML/CSS/JS | routeur/API et bureau (glassmorphism vert, style macOS) |
| Linux, PHP, WebKit | C (composants tiers) | fournis par Buildroot, non écrits par ce projet |

Le code écrit pour Weed OS est donc très majoritairement PHP côté système ; l'interface graphique est en CSS/JS (comme demandé), ce qui fait baisser le pourcentage de PHP si on compte le front-end. Aucun C n'a été écrit.

## Évolutions de cette révision (0.8.27)

- RBAC côté Kernel : chaque syscall passe par une matrice de capacités ; les rôles inconnus sont refusés. Les actions administratives ne sont plus protégées uniquement par l'interface.
- Permissions applicatives effectives : une permission déclarée dans `manifest.json` n'accorde aucun droit. L'administrateur doit l'accorder explicitement ; le Kernel vérifie le registre à chaque appel et journalise les refus.
- Centre de diagnostic PHP en lecture seule : runtime, extensions, données, journal, mode firmware et état des prérequis d'isolation.
- Sauvegardes : ajout d'une vérification AES-256-GCM intégrale des blocs, empreinte SHA-256 et endpoint de vérification avant restauration.
- Stockage : inventaire enrichi des partitions et détection du mode BIOS/UEFI ainsi que des outils nécessaires à une future installation GPT. Aucun formatage UEFI n'est activé.
- Tests ciblés `make check-foundations`, `make check-app-permissions` et contrôles de syntaxe PHP.

### Limites explicites de la 0.8.27
- Les rôles `admin` et `user` sont les deux rôles intégrés ; l'extension à des rôles personnalisés nécessite une interface de gestion et une politique de migration.
- Le registre d'autorisations applicatives est conservateur : toutes les permissions doivent être accordées à nouveau après mise à jour de cette version. Les anciennes déclarations de manifeste ne sont pas considérées comme des consentements.
- Le diagnostic et l'inventaire UEFI/GPT sont informatifs ; le partitionnement reste désactivé. Secure Boot n'est pas annoncé.
- L'isolation Unix existante (`weedworker`, abandon des privilèges avant chargement du code) reste obligatoire en mode root. Elle ne constitue pas encore une sandbox noyau complète (namespaces/seccomp).
- Les catalogues de traduction existants sont conservés ; leur harmonisation exhaustive reste un chantier distinct.

## Évolutions de cette révision (0.8.24)

- Nouveau **Utilisateurs et comptes** : consultation, création et suppression de comptes Weed OS réservées aux administrateurs.
- Les mots de passe sont hachés et jamais réaffichés ; la suppression révoque les sessions et le dernier administrateur est protégé.
- Interface traduite dans les neuf langues ; test `make check-users`.
- Les comptes Weed OS restent des identités applicatives et ne créent pas de comptes Unix distincts.

## Évolutions de la révision précédente (0.8.19)

- Nouveau **Services système** : inventaire en lecture seule des scripts init.d détectés ; aucune action start/stop/restart n’est exposée.
- Nouveau **Sécurité et permissions** : audit non intrusif des permissions des dossiers de données, comptes, sessions et préférences, plus contexte HTTPS et version PHP. L’audit signale les anomalies sans modifier les fichiers.
- Nouveaux syscalls `service.inventory` et `security.audit`, avec tests dédiés.
- App Store toujours reporté et hors périmètre.

## Évolutions de la révision précédente (0.8.18)

- Nouveau **Processus** : inventaire en lecture seule des processus Linux via `/proc`, implémenté en PHP, avec PID, nom et état ; aucune commande shell ni signal d’arrêt n’est exposé.
- Nouveau **Centre de notifications** : historique local des notifications, plafonné à 100 entrées, suppression individuelle ou globale ; les textes sont échappés avant affichage.
- Le centre de notifications et le gestionnaire de processus sont accessibles dans la catégorie Système.
- Le magasin d’applications est volontairement reporté et n’est pas développé dans cette version.
- `make check-processes` valide la structure et les limites de l’inventaire des processus.

## Évolutions de cette révision (0.8.17)

- Moniteur système enrichi avec charge moyenne, mémoire vive, swap, espace disque, uptime, nombre de processeurs logiques et état des services Weed OS.
- Nouveau syscall PHP `system.metrics` en lecture seule ; aucune commande shell ni chemin utilisateur n'est exécuté.
- Rafraîchissement du moniteur toutes les trois secondes, sans requêtes qui se chevauchent.
- `make check-metrics` valide la structure et les bornes des métriques.

## Évolutions de la révision précédente (0.8.16)

- Localisation étendue aux éléments communs du bureau : menu Weed, recherche Spotlight, profil, centre d’applications, dialogue de session/alimentation et écran d’arrêt dans les neuf langues proposées.
- Direction de document et attribut `lang` actualisés avec la langue choisie ; l’arabe conserve le mode RTL.
- Ajout d’un contrôle automatisé des catalogues de traduction (`make check-locales`) pour repérer les langues ou chaînes manquantes.
- Documentation de la trajectoire UEFI/GPT et des garde-fous obligatoires avant activation ; l’installateur reste BIOS/MBR dans cette version.
- Documentation du contrat de sécurité pour les futurs adaptateurs RAR/7Z ; ces formats ne sont pas annoncés comme pris en charge sans moteur externe validé.

## Évolutions de cette révision (0.8.14)

- Session Live utilisable sans installation et nouvelle application graphique « Installer Weed OS » pour détecter les disques, voir leur taille/état de montage et lancer l’installation après double confirmation explicite.
- Installation réservée à l’administrateur, exécutée par le service root ; les disques ou partitions montés sont refusés. L’installateur accepte aussi les noms eMMC `mmcblkN`.
- Archive Studio : lecture/extraction ZIP, TAR, TAR.GZ et TGZ ; extraction sélective ; suppression d’entrées ZIP ; création ZIP et TAR/TAR.GZ.
- Langues ajoutées au sélecteur : Malagasy, allemand et portugais. La localisation de l’interface principale et de l’Archive Manager progresse, mais toutes les applications/fenêtres ne sont pas encore traduites.
- La version actuelle de l’installateur reste BIOS/Legacy (MBR) ; UEFI/Secure Boot et les tests sur matériel réel restent à faire.

## Évolutions de cette révision (0.8.13)

- Connectivité : état des interfaces Wi-Fi et Ethernet, diagnostic NetworkManager d’accès Internet, scan Wi-Fi, connexion/déconnexion et commandes Ethernet.
- Bluetooth : état de l’adaptateur et de la recherche, découverte, appairage, connexion/déconnexion et gestion de confiance des appareils connus.
- Courrier : répondre, transférer, supprimer et déplacer les messages IMAP ; brouillons persistants chiffrés avec AES-256-GCM dans le dossier privé de l’utilisateur.
- Les actions réseau sont validées côté serveur et les erreurs des outils système sont renvoyées à l’interface.
- Le fragment noyau active des familles de pilotes Wi-Fi courantes ; certains contrôleurs nécessitent toujours leur firmware propriétaire ou spécifique, qui doit être ajouté selon le matériel cible.

### Limites matérielles et réseau (0.8.13)
- La détection Internet repose sur `nmcli networking connectivity check` et la configuration du niveau NetworkManager ; elle ne remplace pas un test applicatif vers chaque site.
- L’accès réel dépend de NetworkManager, BlueZ, des services DBus, des permissions du processus système, du firmware et des pilotes adaptés au matériel.
- Les brouillons ne conservent que destinataire, objet et texte ; les fichiers sélectionnés en pièce jointe doivent être resélectionnés avant l’envoi.
- La suppression utilise `UID EXPUNGE` pour éviter de supprimer les autres messages marqués comme supprimés ; les serveurs IMAP qui ne prennent pas en charge cette extension peuvent refuser l’opération.

### Fonctionnalités conservées depuis les versions précédentes
- Gnanja Browser 0.4.0 : onglets privés temporaires, favoris, historique, page d’accueil, téléchargements et interface localisée en six langues.
- Courrier : navigation dans les dossiers IMAP, lecture détaillée à la demande et téléchargement des pièces jointes reçues (limite de 8 Mo par message).
- Les données du navigateur passent par le SDK isolé et des hooks PHP autorisés, sans dépendre du stockage local d’une iframe sandboxée.
- `make check-browser` vérifie la persistance, le filtrage des URL, les marqueurs du mode privé et les permissions privées. Le mode privé ne sauvegarde ni historique ni liens de téléchargement, mais ne peut pas isoler les cookies/cache du navigateur hôte.

- Applications intégrées Archive Studio (ZIP/TAR/TAR.GZ) et Snake Garden.
- Appels VFS ZIP protégés contre les chemins d'extraction dangereux ; nécessite PHP ZipArchive.
- Fonds d’écran JPG (1920×1080) : 20 visuels intégrés, plus la possibilité d’importer une image personnelle. Aucun SVG n’est requis pour les arrière-plans du bureau.
- Contrôle des chemins du VFS renforcé : les accès via liens symboliques sortant du dossier utilisateur sont refusés, y compris lors de la création de nouveaux fichiers.
- Validation du choix de fond d’écran côté interface pour revenir au fond par défaut si une préférence locale est invalide.


### Courrier — réception des pièces jointes (0.8.12)
- Dossiers IMAP listés à partir des réponses du serveur (INBOX, Envoyés, Brouillons, Corbeille si disponibles).
- Lecture complète à la demande et extraction MIME récursive des pièces jointes ; téléchargement depuis le lecteur de message.
- Limite de 8 Mo par message récupéré pour maîtriser la mémoire côté serveur.
- Les noms et contenus des fichiers sont contrôlés ; le HTML des messages distants n’est pas rendu.

### Courrier — pièces jointes sortantes (0.8.11)
- Envoi de pièces jointes via MIME multipart/mixed, avec encodage Base64 et noms UTF-8.
- Limites côté interface et serveur : 5 fichiers maximum, 5 Mo par fichier et 10 Mo au total ; type MIME détecté côté serveur, noms de fichiers nettoyés.
- La réception des pièces jointes est ajoutée en 0.8.12 (voir ci-dessus).

## Réseau, Bluetooth et Courrier (0.8.9)

- L'application **Réseau et Bluetooth** utilise NetworkManager (`nmcli`) pour les réseaux Wi-Fi et BlueZ (`bluetoothctl`) pour la découverte, l'association et la connexion Bluetooth.
- Le Kernel PHP supervise facultativement `dbus-daemon`, `NetworkManager` et `bluetoothd` lorsqu'ils sont présents. Les pilotes Wi-Fi/Bluetooth restent dépendants du matériel et de la configuration du noyau Linux.
- Le client **Courrier** utilise IMAP et SMTP via sockets PHP TLS. Les mots de passe de compte sont chiffrés localement avec AES-256-GCM ; l'extension PHP OpenSSL est requise. Les serveurs IMAP/SMTP et leurs ports sont configurables.
- Les sauvegardes administrateur sont des fichiers `.weedbak` chiffrés en AES-256-GCM (phrase secrète obligatoire) contenant les comptes, répertoires personnels, préférences, Programmes installés, données applicatives et journaux. La restauration remplace ces données persistantes ; elle ne restaure pas le noyau Linux ni les pilotes. Conservez la phrase secrète séparément : elle ne peut pas être récupérée.
- La localisation propose six langues pour les éléments principaux du bureau. La traduction de toutes les chaînes de toutes les applications reste progressive.

### Services Buildroot requis pour les fonctions matérielles
Le defconfig active NetworkManager avec `nmcli`, `wpa_supplicant`, BlueZ avec `bluetoothctl`, PHP OpenSSL et Phar. Les options NetworkManager exigent notamment udev et des en-têtes Linux suffisamment récents ; vérifiez le résultat de `make menuconfig` avec la version Buildroot réellement utilisée.

## Localisation et fonds d’écran (0.8.15)

- Le bureau propose neuf langues : français, anglais, espagnol, chinois, hindi, arabe, allemand, portugais et malgache. Le menu des catégories, la recherche, l’écran de connexion et les libellés communs sont localisés ; les écrans métier des applications sont encore en cours de traduction.
- Le sélecteur de personnalisation propose 20 fonds d’écran intégrés (JPG 1920×1080) et l’import d’une image personnelle.

## 1. Lancer en développement (5 minutes)

Prérequis : PHP ≥ 8.1 avec le module `zip`, ainsi que `curl` et `unzip`.

```sh
make assets      # télécharge FontAwesome Free en local (une seule fois)
make dev         # démarre le Weed Kernel
```
Ouvrez <http://127.0.0.1:8080/>. Les données vont dans `./data/` (fichiers de l'utilisateur dans `data/home/<nom>`, Programmes dans `data/apps`, journaux dans `data/var/log`). Arrêt : `Ctrl+C`.

Au premier lancement, créez votre compte administrateur. Utilisation : `Ctrl+Espace` = Spotlight, menu 🌿 en haut à gauche, dock en bas, terminal `wsh` (tapez `help`).

## 2. Compiler l'ISO bootable

Hôte Linux (Debian/Ubuntu), ~25 Go libres, Internet, 1 à 3 h au premier build.

```sh
sudo apt install build-essential git curl unzip wget cpio rsync bc file python3 \
     libncurses-dev libssl-dev nasm qemu-system-x86 php-cli php-zip
curl https://sh.rustup.rs -sSf | sh && rustup target add x86_64-unknown-linux-musl

make check-build-host # vérifie les dépendances de compilation
make iso         # = assets + init (Rust) + Buildroot -> build/weed-os.iso
make qemu        # test dans QEMU
```

**Windows 10 + WSL2** : `sh tools/wsl-setup.sh` (une fois) puis `sh tools/wsl-build.sh`, et `tools\qemu-windows.ps1` côté Windows pour lancer l'ISO — détails et pièges dans [docs/WSL-BUILD.md](docs/WSL-BUILD.md).

Optionnel : `make boot-stub` assemble le secteur de boot NASM (`build/weed-boot.img`) pour tester la chaîne assembleur.

> ⚠️ **État de validation** : le code PHP/JS/Rust/ASM a été écrit pour ce projet, mais l'ISO Buildroot n'a **pas** pu être construite ni démarrée dans l'environnement où ce dépôt a été généré (pas de PHP, NASM, Rust ni réseau). `buildroot/weed_defconfig` est un point de départ : au premier build, lancez `cd build/buildroot && make menuconfig`, corrigez les options que votre version de Buildroot renomme, puis `make savedefconfig BR2_DEFCONFIG=../../buildroot/weed_defconfig`. Les points les plus susceptibles de demander un ajustement : le menu de boot ISO (`grub.cfg`, chemin du noyau), les options `cog`/`wpewebkit`, et le pilote graphique de votre machine virtuelle.

## 3. Installer sur une clé USB / un disque

Pour tester, utilisez d’abord `make qemu`. Pour une clé USB, copiez l’ISO sur une clé préparée avec Ventoy ; le démarrage USB direct par écriture brute n’est pas encore certifié dans cette version.

L'installateur intégré propose une simulation par défaut :
```sh
weed-install /dev/sdX
```

Pour lancer l'installation réelle, vérifiez impérativement le nom du disque :
```sh
weed-install /dev/sdX --yes-erase --disk-is-correct
```

**Attention : installation destructive.** Toutes les partitions et données du disque choisi sont supprimées, y compris la partition de données si vous réinstallez sur ce disque. Le disque doit être différent du support live et ne doit pas être monté. L'installateur crée une table MBR, une partition système ext4 (75 %) et une partition de données ext4 (25 %). Les données Weed OS sont montées sous `/weed/data` au démarrage. Cette version cible le démarrage **BIOS/Legacy** ; UEFI/Secure Boot n'est pas encore pris en charge par l'installateur. Testez dans QEMU avant tout disque physique.

Le démarrage live et l'installateur dépendent des artefacts Buildroot réellement produits. L'ISO n'est pas considérée validée tant qu'elle n'a pas démarré dans QEMU et sur une machine cible.

## 4. Programmes (apps `.zip`)

Dans Weed OS, une app s'appelle un **Programme**. C'est un `.zip` contenant `manifest.json` (à la racine ou dans un seul dossier) :

```json
{ "id": "notes", "name": "Notes", "version": "1.0.0", "description": "…", "author": "…",
  "permissions": ["fs.list", "fs.read", "fs.write", "notify"],
  "app":   { "title": "Notes", "icon": "fa-note-sticky", "entry": "index.html", "width": 620, "height": 420 },
  "hooks": "hooks.php" }
```
- `app` : le Programme s'ouvre dans une fenêtre du bureau (page HTML servie depuis `/app/<id>/…`) avec une icône FontAwesome locale. `hooks` est facultatif.
- **SDK** : `<script src="/sdk/weed.js"></script>` donne `weed.fs.read/write/list/mkdir/rm`, `weed.notify()` et `weed.call()`. `/sdk/weed.css` fournit le style Weed.
- **Appels PHP** : `hooks.php` retourne `['syscalls' => ['nom' => fn(array $args, array $user) => …]]` ; le Programme les appelle avec `weed.call('app.<id>.nom', args)`, après les avoir déclarés dans `permissions`.
- **Isolation** : chaque Programme tourne dans une iframe `sandbox` sans `allow-same-origin`. Il ne peut ni lire les cookies ni appeler l'API directement : tout passe par le pont du bureau, qui refuse tout appel absent de `permissions` (`notify` est toujours autorisé).
- **Installation** (compte administrateur) : app **Programmes** → choisir le `.zip` → Installer → relire les permissions → **Activer**. Un Programme installé est inactif par défaut.
- Exemples fournis dans `apps-src/` (Hello Weed, Calculatrice, Notes) : `make apps` produit `build/apps/*.zip`.

**Sécurité** : l'installateur refuse les chemins `..`, absolus ou avec `\`, limite la taille décompressée (20 Mo) et ne sert jamais de fichiers `.php`. Depuis la 0.8.6, `hooks.php` s'exécute dans un worker PHP sous le compte Unix `weedworker` (UID/GID 990), sans droit root ; le code est en lecture seule et chaque Programme a son dossier `appdata/<id>`. L'isolation reste partielle (pas de chroot/seccomp, UID partagé) : n'installez que des Programmes de confiance.

### Bureau, fichiers et sons (0.8.7)
- Le Bureau affiche le dossier `/Bureau` de l'utilisateur ; clic droit, copier/couper/coller, renommer, supprimer, glisser-déposer et import depuis l'ordinateur fonctionnent sur le Bureau et dans Cultivator.
- Le double-clic ouvre l'application adaptée au type du fichier (vidéo, audio, image, PDF, ZIP, texte) ; type inconnu : « Ouvrir avec… ».
- Mentions légales et crédits : `CREDITS.md` (aussi dans l'OS : À propos → Mentions légales).
- Sons : placez `startup.mp3`, `shutdown.mp3` et `error.mp3` dans `system/desktop/assets/sounds/` (voir le `README.md` de ce dossier).

## 5. Comptes et sécurité du prototype

### Weed Security Core (0.8.6)
- Les Programmes installés reçoivent une empreinte SHA-256 authentifiée par HMAC-SHA-256 ; les hooks sont bloqués si les fichiers ont été modifiés après signature.
- La clé locale se trouve dans `data/etc/security.key` (mode `0600`) et le registre dans `data/etc/program-signatures.json`.
- Les événements de sécurité sont consignés dans `data/var/log/security.jsonl` (JSON Lines, mode `0600`).

**Portée réelle :** la signature locale détecte les altérations après installation, mais ne prouve pas l'identité de l'éditeur du paquet. La clé locale est créée par le serveur PHP ; elle ne protège donc pas contre un attaquant disposant des mêmes privilèges Unix que PHP. Les hooks PHP sont isolés dans un worker `weedworker` (990) mais le Kernel et le serveur web restent root. Les UID Unix par utilisateur et la vérification signée du Kernel au démarrage restent à implémenter.

- Au premier lancement, l'écran de connexion demande de **créer le compte administrateur**. Les mots de passe sont hachés (`password_hash`), les sessions utilisent un cookie `HttpOnly` + `SameSite=Strict`, et 5 échecs en 5 minutes bloquent le compte temporairement.
- Chaque utilisateur a son dossier `data/home/<nom>` (Documents, Bureau, Notes) ; le VFS interdit toute sortie de ce dossier (anti-traversée, liens symboliques contrôlés).
- Les administrateurs gèrent les comptes (Réglages) et les Programmes ; l'extinction/redémarrage leur est réservé.
- Le serveur écoute sur `127.0.0.1` uniquement ; l'API exige l'en-tête `X-Weed: 1` (anti-CSRF). Pas de HTTPS : ne l'exposez pas sur un réseau.
- `wsh` n'exécute aucune commande de l'hôte.

## 6. Feuille de route suggérée

1. Valider/stabiliser l'ISO Buildroot en VM ; persistance (partition `data`).
2. Exécuter `hooks.php` dans un processus isolé (utilisateur dédié) ; signature des Programmes.
3. Gestionnaire de réseau (Wi-Fi) en PHP, mises à jour du système via paquets `.zip` signés ; HTTPS local.
4. Dépôt de Programmes, centre de notifications, multi-fenêtres plus riche (snap, espaces).
5. Remplacer progressivement les briques tierces (compositeur, navigateur) si un jour possible.

## Arborescence

```
boot/boot.asm   init/ (Rust)   kernel/ (PHP)   system/{router.php,desktop/{sdk,assets,js,css}}
buildroot/      tools/         apps-src/ (Programmes d'exemple)   Makefile  LICENSE (MIT)
```
Licence MIT © 2026 Tantely Orion.

### Windows (Git Bash + XAMPP)

```bash
export PATH="/c/xampp/php:$PATH"
make install
make dev
```

Le téléchargement Font Awesome est une archive ZIP : le script utilise `unzip` ou PowerShell `Expand-Archive`. Le superviseur ferme proprement le pipe stdin du service PHP sous Windows (pas de dépendance à `/dev/null`).

## Edition enrichie

Ajouts : dix fonds d'écran locaux sélectionnables dans Réglages ; Calculatrice, Visionneuse de photos, Lecteur audio, Lecteur vidéo, Lecteur PDF et Calendrier. Les lecteurs ouvrent les fichiers locaux choisis par l'utilisateur. Les formats pris en charge dépendent du moteur WPE/WebKit embarqué.

Weed OS est un système Linux embarqué : Linux démarre et pilote le matériel ; PHP fournit les services et appels système Weed OS ; HTML/CSS/JavaScript constituent le bureau. PHP seul ne peut pas remplacer un noyau matériel. La construction ISO dépend de Buildroot et doit être compilée puis testée sur un hôte Linux avant installation réelle. Les fichiers multimédias sélectionnés ne sont pas copiés automatiquement dans le système.


## État de la version Bootable Edition

- Installateur BIOS/MBR révisé avec simulation par défaut, confirmation explicite, partition système et partition de données séparée.
- Le PID 1 tente de monter la partition `WEEDDATA` au démarrage ; en mode live, son absence est normale.
- `make check-build-host` contrôle les dépendances avant une compilation longue.
- La compilation ISO et le démarrage matériel restent à valider sur un hôte Linux avec QEMU. Aucun support UEFI/Secure Boot n'est promis dans cette version.


## Weed OS 0.8.3 — permissions et isolation

- Chaque compte dispose d'une racine VFS dédiée `data/home/<utilisateur>`.
- Les racines personnelles et leurs dossiers standards sont créés en `0700`; les nouveaux fichiers du VFS sont écrits atomiquement en `0600`.
- Les dossiers internes `home`, `etc`, `apps` et `var` sont privés (`0700`) et les liens symboliques utilisés comme racines système ou racines personnelles sont refusés.
- La suppression d'un compte et le changement de son mot de passe révoquent ses sessions existantes.
- Les appels PHP personnalisés `app.<id>.<fonction>` sont vérifiés côté serveur : le Programme doit être activé et la permission exacte doit figurer dans son manifeste.

**Limite de sécurité importante :** les comptes Weed OS restent des identités applicatives gérées par PHP. Le serveur PHP traite les requêtes sous un même UID Unix ; `0700` protège les données contre les autres comptes Unix, mais ne constitue pas une séparation de processus entre utilisateurs Weed OS. Les hooks PHP installés restent du code de confiance exécuté dans le processus du serveur. Une isolation forte des hooks exige un worker séparé, un UID dédié et des restrictions OS (par exemple namespaces/seccomp), hors du périmètre de cette version.


### Courrier — dossiers IMAP et réception des pièces jointes (0.8.12)
- Liste les dossiers exposés par le serveur IMAP et permet de basculer entre eux.
- Ouvre un message complet à la demande, sans charger les fichiers joints pour toute la liste.
- Décode les messages MIME multipart, les textes UTF-8 et les pièces jointes encodées en base64 ou quoted-printable.
- Propose le téléchargement local des pièces jointes reçues ; limite de 8 Mo par message récupéré.
- Les dossiers disponibles dépendent des dossiers et droits annoncés par le serveur de messagerie.

### Gnanja Browser (Programme 0.4.0 / Weed OS 0.8.11)
- Historique, favoris, page d’accueil et liste des téléchargements lancés conservés par utilisateur dans le stockage privé du Programme.
- Panneaux de gestion des favoris, téléchargements et confidentialité ; effacement de l’historique ou de toutes les données de navigation.
- Le téléchargement est ouvert dans le navigateur hôte : l’application conserve le lien lancé mais ne peut pas suivre la progression ni déterminer le dossier final choisi par le navigateur hôte.
- Les données persistantes transitent par le SDK et les permissions de hooks PHP du Programme ; elles ne dépendent pas du `localStorage` d’une iframe sandboxée.
- Mode privé : nouveaux onglets privés, sans ajout à l’historique persistant, sans favoris ni liens de téléchargement enregistrés ; fermeture de l’onglet détruit son historique de navigation en mémoire. Les cookies/cache restent sous le contrôle du navigateur hôte.
- Interface principale traduite en français, anglais, espagnol, chinois, hindi et arabe selon le choix de langue du bureau.
- Tests : `make check-browser`.

### Outils système 0.8.19
- **Services système** fournit un inventaire en lecture seule des scripts init.d détectés. Les commandes start/stop/restart ne sont pas exposées depuis le bureau.
- **Sécurité et permissions** exécute un audit non intrusif des permissions et du contexte d'exécution. Il signale les points à vérifier mais ne modifie aucun fichier.
- L'App Store n'est pas développé dans cette étape et reste reporté.

### Inventaire du démarrage
`startup.inventory` fournit un inventaire en lecture seule des fichiers XDG Autostart système et utilisateur. Il n'exécute, ne modifie et ne désactive aucune entrée.

### Sessions et historique (0.8.22)

Le bureau propose désormais, aux administrateurs uniquement, un inventaire consultatif des sessions locales et un historique filtré des événements de sécurité. Les jetons de session, hashes, mots de passe et contextes arbitraires ne sont jamais transmis à l'interface. La gestion active (révocation depuis le bureau, export ou rotation des journaux) reste désactivée jusqu'à l'ajout d'une politique d'administration et d'un service privilégié dédié.

### v0.8.22 — Permissions des applications

- Ajout d’un inventaire administrateur des permissions déclarées par les Programmes installés.
- Filtrage strict des permissions par identifiant de Programme ; aucun jeton ou contenu arbitraire de manifeste n’est exposé.
- Interface traduite dans les neuf langues du bureau.
- L’inventaire est consultatif : il ne prétend pas accorder ni révoquer des droits.

### Stockage et volumes (0.8.23)

L'application **Stockage et volumes** présente les systèmes de fichiers actuellement montés, leur point de montage et les capacités disponibles lorsque le système hôte les fournit. L'inventaire s'appuie sur `/proc/self/mountinfo`, n'expose pas les chemins de périphériques et reste strictement en lecture seule. Le partitionnement, le montage, le démontage et le formatage ne sont pas encore proposés depuis le bureau.


### Utilisateurs et comptes (0.8.24)

L’application administrateur « Utilisateurs et comptes » permet de consulter les comptes Weed OS, d’en créer et d’en supprimer. Les mots de passe sont hachés et ne sont jamais transmis à l’interface. La suppression révoque les sessions du compte ; le dernier administrateur ne peut pas être supprimé et un administrateur ne peut pas supprimer son propre compte depuis le bureau. Le module ne change pas les identités Unix de l’hôte : les comptes restent des comptes applicatifs Weed OS.

## Traductions (i18n)

Le bureau est traduit en 9 langues (fr, en, es, zh, hi, ar, de, pt, mg). Le français est la langue source.
`system/desktop/js/i18n.js` contient un dictionnaire (`ROWS`, une ligne par texte français) et des motifs à paramètres (`PATTERNS`).
Il traduit automatiquement le DOM (texte, `title`, `placeholder`, `aria-label`), les titres d'applications, `confirm()`/`alert()`/`prompt()`,
ainsi que la page « Mentions légales ». Pour traduire un nouveau texte, ajouter une ligne dans `ROWS` — aucune autre modification n'est nécessaire.

## Pictoweed (photos)

Application photo intégrée (catégorie Multimédia, aussi proposée dans « Ouvrir avec… » sur les images) : `system/desktop/js/pictoweed.js`.
- **Bibliothèque** : toutes les photos du dossier personnel, par dossier, albums et favoris (stockés dans `/Pictoweed/library.json`), recherche, tri, miniatures redimensionnables, sélection multiple (Ctrl/Maj).
- **Retouche non destructive** : rotation, miroir, recadrage (formats libres ou imposés), luminosité, contraste, saturation, chaleur, ombres, hautes lumières, netteté, vignettage, 8 filtres, annuler/rétablir (Ctrl+Z), comparaison avec l'original.
- **Enregistrer** (remplace le fichier JPEG/PNG) ou **Enregistrer une copie** (`nom-edit.ext`) ; téléchargement possible.
- **Diaporama** plein cadre, **import** par bouton ou glisser-déposer (vers `/Pictures`), suppression.
Aucune dépendance externe : tout le traitement d'image se fait dans le navigateur (canvas), sans `ctx.filter`, donc compatible WPE WebKit.

## Gestionnaire d'archives

`system/desktop/js/archive.js` (+ `kernel/src/TarArchive.php`, `Vfs::archive*`) — interface type WinRAR, sans la liste du gestionnaire de fichiers :
- **Formats** : ZIP, TAR, TAR.GZ/TGZ (lecture, création, extraction, ajout, suppression).
- **Vue d'archive** : navigation dans les dossiers de l'archive, colonnes triables (nom, taille, compressé, type, date), recherche, sélection multiple, aperçu texte/image.
- **Outils** : Ajouter, Extraire vers… (remplacer / ignorer / garder les deux, dossier au nom de l'archive), Extraire ici, Tester l'intégrité, Supprimer, Informations.
- **Noyau** : syscalls `fs.zip.list|create|extract|add|delete|test|read`. L'extraction refuse « .. », chemins absolus, liens symboliques et collisions dangereuses, borne le nombre d'entrées (5000) et la taille (300 Mo).
- Correction : l'extraction TAR.GZ (PharData) produisait des fichiers vides ; remplacée par un lecteur/écrivain TAR en flux (`TarArchive`), compatible avec `tar` GNU (noms longs, `./`).
- Test : `make check-archives`.
