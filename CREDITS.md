# Crédits et mentions légales — Weed OS 1.0.0

© 2026 Tantely Orion. Weed OS est distribué sous licence MIT (voir `LICENSE`).
Ces informations sont aussi consultables dans l'OS : **À propos de Weed OS → Mentions légales et crédits**.

## Icônes
**Font Awesome Free** © Fonticons, Inc. — icônes CC BY 4.0, polices SIL OFL 1.1, code MIT. https://fontawesome.com/license/free

## Sons du système
- `startup.mp3` (démarrage) et `shutdown.mp3` (arrêt) : Brigitte Rasoafaniry.
- `error.mp3` (erreur) : [Universfield](https://pixabay.com/users/universfield-28281460/) (Pixabay), sous licence Pixabay.

## Fonds d'écran
Les numéros correspondent à l'ordre dans Réglages (`wallpaper-NN.jpg`). « Pexels » : photo diffusée sous la licence Pexels.

| N° | Crédit | | N° | Crédit |
|---|---|---|---|---|
| 1 | Weed OS Project | | 11 | Weed OS Project |
| 2 | Marek Pavlik (Pexels) | | 12 | Tantely Orion Archives Photostock |
| 3 | Jan Moser (Pexels) | | 13 | Weed OS Project |
| 4 | Oly Programming Language Project | | 14 | ChatGPT image regenerations |
| 5 | Veronika Andrews (Pexels) | | 15 | molnarszabolcserdely (Pexels) |
| 6 | Hafatra app for instant messaging | | 16 | Regan Dsouza (Pexels) |
| 7 | Priscila Dramisino (Pexels) | | 17 | ChatGPT image regenerations |
| 8 | Erik Karits (Pexels) | | 18 | Weed OS Project |
| 9 | Erik Karits (Pexels) | | 19 | Tantely Orion (MEME) |
| 10 | Marek Pavlik (Pexels) | | 20 | Apasaric (Pexels) |

## Composants tiers de l'édition bootable
Linux (GPL-2.0), Buildroot (GPL-2.0+), PHP (PHP License 3.01), GRUB 2 (GPL-3.0+), cage (MIT), WPE WebKit (LGPL-2.1/BSD), Cog (MIT), Mesa 3D (MIT), seatd (MIT), mpg123 (LGPL-2.1), ALSA (LGPL-2.1 / GPL-2.0), NetworkManager (GPL-2.0+), BlueZ (GPL-2.0+), DejaVu Fonts (Bitstream Vera / domaine public).

### Moteur média (service Kernel `media.*`)
FFmpeg compilé en **version GPL** (GPL-2.0+), avec x264 (GPL-2.0+), x265 (GPL-2.0+), libvpx (BSD-3-Clause), Opus (BSD-3-Clause), LAME (LGPL-2.0+), libvorbis et libogg (BSD-3-Clause), libwebp (BSD-3-Clause).
Le code de Weed OS reste sous licence MIT ; l'image ISO qui embarque ce FFmpeg GPL doit être distribuée avec les sources correspondantes (Buildroot les télécharge dans `dl/` ; conservez-les et la configuration utilisée). Voir `docs/MEDIA-FFMPEG.md`.
Licences données à titre informatif : les textes fournis avec chaque composant font foi. `make legal-info` (Buildroot) génère le dossier de conformité à joindre à une ISO distribuée.
