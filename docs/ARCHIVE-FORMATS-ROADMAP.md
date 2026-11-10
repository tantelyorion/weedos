# Archive Studio — formats et stratégie d'extension

## Formats pris en charge par le cœur PHP actuel

- ZIP : création, consultation, extraction totale ou sélective et suppression d'entrées selon les fonctions disponibles de `ZipArchive`.
- TAR, TAR.GZ et TGZ : lecture/création/extraction via `PharData`, lorsque l'extension Phar et les codecs nécessaires sont présents.

## Formats externes envisagés

RAR et 7Z ne sont pas annoncés comme pris en charge par le cœur PHP actuel. Ils nécessitent généralement un outil externe (par exemple `7zz` ou `unar`) ou une extension dédiée. L'intégration doit rester facultative et détecter les capacités réellement installées.

## Contrat de sécurité avant d'activer un adaptateur externe

- Aucun appel via `shell_exec` ou concaténation de commandes : `proc_open` avec tableau d'arguments.
- Liste blanche des exécutables et options ; chemins transmis comme arguments, jamais comme fragments shell.
- Extraction dans un répertoire temporaire privé, contrôle de chaque chemin canonique et refus des chemins absolus, `..`, liens symboliques et liens durs.
- Limites configurables sur le nombre d'entrées, la taille totale décompressée, la taille individuelle et le temps d'exécution.
- Refus des archives chiffrées ou multi-volumes tant que leur traitement n'est pas explicitement pris en charge.
- Déplacement atomique vers la destination uniquement après validation complète ; nettoyage garanti en cas d'erreur.

L'interface doit afficher « format non disponible » plutôt que prétendre extraire un fichier si aucun moteur compatible n'est installé.
