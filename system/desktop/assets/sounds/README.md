# Sons du système Weed OS

Déposez ici vos trois fichiers **MP3** (noms exacts, en minuscules) :

| Fichier       | Quand il est joué                                   |
|---------------|-----------------------------------------------------|
| `startup.mp3`  | au démarrage du bureau (après l'écran de boot)      |
| `shutdown.mp3` | à l'extinction ou au redémarrage                    |
| `error.mp3`    | lors d'une erreur (opération refusée, fichier illisible…) |

Chemin complet dans le projet : `system/desktop/assets/sounds/startup.mp3` (idem `shutdown.mp3`, `error.mp3`).
Dans l'ISO/installation : `/weed/system/desktop/assets/sounds/`.

Conseils : 1 à 4 secondes, MP3 (44,1 kHz), poids modeste (< 500 Ko). Un fichier absent est simplement ignoré (aucune erreur).
**Démarrage sans clic.** `startup.mp3` n'est pas joué par le navigateur (qui bloque l'audio avant le premier clic) mais par le système :
- ISO / installation : le Kernel lance `kernel/bin/startup-sound.sh` dès le boot (attente de la carte son, dé-mute ALSA, `mpg123`).
- Mode dev (`make dev`) : le Kernel utilise le lecteur de l'hôte (`afplay`, `mpg123`, `ffplay`, `mpv`, `cvlc` ou PowerShell).
- Dernier recours seulement : si rien de tout cela n'est possible, le bureau essaie de le jouer lui-même (rejoué au premier clic si le navigateur le bloque).

En machine virtuelle, la VM doit avoir une carte son (QEMU : `make qemu` ajoute `intel-hda`; VirtualBox/VMware : activer l'audio « Intel HD Audio »).
Réglages → « Sons du système » : activer/couper, volume et boutons de test (concernent shutdown/error et le repli navigateur).

**Crédits :** `startup.mp3` et `shutdown.mp3` : Brigitte Rasoafaniry · `error.mp3` : Universfield (Pixabay) — voir `CREDITS.md`.
