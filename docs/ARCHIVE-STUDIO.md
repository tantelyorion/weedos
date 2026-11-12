# Archive Studio

Archive Studio est le gestionnaire d’archives intégré de Weed OS. Les opérations sont exécutées côté serveur par PHP dans le VFS privé de l’utilisateur.

## Formats et fonctionnalités
- ZIP : créer, parcourir, extraire tout ou une sélection, supprimer des entrées sélectionnées.
- TAR, TAR.GZ et TGZ : créer, parcourir et extraire tout ou une sélection via `PharData`.
- Sélection multiple de fichiers et dossiers pour créer une archive.
- Navigation dans le contenu et affichage du nom, du type et de la taille des entrées.

## Dépendances
- ZIP : extension PHP `zip` / `ZipArchive` obligatoire.
- TAR/TAR.GZ/TGZ : extension PHP `Phar` avec `PharData`.
- Aucun binaire externe `unzip`, `tar`, `7z` ou `unrar` n’est requis pour ces opérations.
- RAR et 7z ne sont pas encore pris en charge nativement dans cette version ; ils nécessiteraient une extension PHP dédiée ou un outil externe optionnel.

## Limites et sécurité
- Jusqu’à 100 éléments sources et 2 000 fichiers par archive.
- Extraction limitée à 2 000 entrées et 100 Mio de données décompressées.
- Refus des chemins absolus, traversées `..`, liens symboliques, collisions et sorties du dossier personnel.
- Les entrées sont extraites comme fichiers/dossiers ordinaires dans le VFS de l’utilisateur.
- La suppression d’entrées est disponible uniquement pour ZIP ; les archives TAR sont en lecture/extraction dans cette version.
