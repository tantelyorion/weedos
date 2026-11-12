# Service média FFmpeg 

FFmpeg et FFprobe font partie du système : l'ISO les embarque (`buildroot/weed_defconfig`) et le Kernel les met à
disposition des Programmes sous forme d'appels `media.*`. Un Programme (montage vidéo, lecteur, convertisseur…) n'embarque
donc pas son propre FFmpeg.

## Principe
```
Programme (iframe isolée) ── weed.media.* ──► pont du bureau ──► Syscalls (media.*) ──► Media.php ──► ffmpeg / ffprobe
                                                                                      └► tâche d'arrière-plan (media-runner.php)
```
* Le Programme ne voit jamais de chemin réel : il manipule des chemins du dossier personnel (`/Documents/clip.mp4`).
* Le Kernel construit lui-même la ligne de commande (tableau d'arguments, aucun shell, aucune option libre).
  Toute valeur reçue est validée : format dans une liste blanche, nombres bornés, chemins résolus par le `Vfs`.
* FFmpeg est lancé avec `-protocol_whitelist file,pipe` : pas de réseau, et une playlist (`.ffconcat`, HLS…) ne peut pas
  lire d'autres fichiers du système.
* Les sorties sont écrites dans `<nom>.weedpart` puis renommées à la fin : un fichier incomplet n'apparaît jamais sous son nom final.
  Un fichier existant n'est jamais écrasé sans `overwrite: true` ; la source n'est jamais remplacée.

## Permission
Le Programme déclare `app.<id>.media` dans `manifest.json` ; **un administrateur doit l'accorder** (app « Permissions des
applications » → bouton **Accorder**). Sans octroi, tout appel `media.*` est refusé et journalisé (`APP_ACCESS_DENIED`).
Le pont ajoute l'identifiant du Programme à chaque appel et le Kernel revérifie : actif, déclaré, accordé.
Un Programme ne voit que ses propres tâches.

```json
{ "id": "mon-montage", "permissions": ["fs.list", "fs.read", "fs.write", "notify", "app.mon-montage.media"], "app": { "title": "Mon montage", "entry": "index.html" } }
```

## SDK (`/sdk/weed.js`)
| Appel | Rôle |
|---|---|
| `weed.media.status()` | FFmpeg présent ? version, licence, formats disponibles, limites |
| `weed.media.probe(path)` | durée, conteneur, flux (codec, taille, cadence, canaux…) |
| `weed.media.thumbnail(path, {time, width, type, output})` | image à un instant ; sans `output` → `{data_url}` (idéal pour une timeline) |
| `weed.media.url(path)` | URL signée (1 h) pour `<video src>` / `<audio src>` avec avance rapide |
| `weed.media.convert(path, {format, quality, height, fps, audio_kbps, mute, start, end, output, overwrite})` | conversion → tâche |
| `weed.media.extractAudio(path, {format, …})` | piste audio (`mp3` par défaut) → tâche |
| `weed.media.trim(path, {start, end, output})` | découpe rapide sans ré-encodage (coupe sur les images clés) → tâche |
| `weed.media.render({clips:[{path,start,end,volume}], width, height, fps, format, quality, output})` | **montage** : assemble des extraits → tâche |
| `weed.media.concat([paths], opts)` | met des fichiers bout à bout → tâche |
| `weed.media.job(id)` / `jobs()` / `cancel(id)` | suivi et annulation |
| `weed.media.wait(id, onProgress)` | attend la fin (rejette en cas d'échec ou d'annulation) |

Une tâche : `{ id, op, state: queued|running|done|failed|cancelled, progress: 0..1, eta_seconds, speed, input, output, error }`.

Formats (`format`) : `mp4` (H.264+AAC), `mp4-h265`, `webm` (VP9+Opus), `mkv`, `gif` (30 s max), `mp3`, `m4a`, `opus`, `ogg`, `flac`, `wav`.
`quality` : `low`, `medium` (défaut), `high`. `media.status()` indique ceux réellement présents dans le FFmpeg installé.

Exemple de montage :
```js
const job = await weed.media.render({
  clips: [{ path: '/Documents/a.mp4', start: 2, end: 8 }, { path: '/Documents/b.mp4', volume: 0.5 }],
  width: 1280, height: 720, fps: 30, output: '/Documents/film.mp4'
});
await weed.media.wait(job.id, j => console.log(Math.round(j.progress * 100) + ' %'));
```

## Limites
Deux tâches simultanées sur tout le système, 64 extraits par montage, 6 h et 4 Gio par tâche, GIF de 30 s maximum.
Les fiches de tâches (`data/var/media/jobs`) sont purgées après 7 jours ; une tâche sans signe de vie depuis 90 s est
déclarée interrompue (arrêt du système). La découpe `trim` coupe sur les images clés : pour une coupe à l'image près,
utiliser `convert` avec `start`/`end`.

## Licence
Le FFmpeg de l'ISO est compilé en **GPL** (x264/x265 pour H.264/H.265). Le code de Weed OS reste MIT, mais l'ISO doit être
distribuée avec les sources correspondantes (voir `CREDITS.md`).

## Limites de sécurité à connaître
* FFmpeg décode des fichiers non fiables : c'est une surface d'attaque réelle (les bibliothèques de décodage ont des CVE
  régulières). Il tourne aujourd'hui avec le compte du Kernel, car c'est lui qui peut lire le dossier personnel de
  l'utilisateur ; l'isolation reste partielle (pas de seccomp/namespaces). Gardez FFmpeg à jour (version Buildroot).
  Piste d'amélioration : compte dédié `weedmedia` avec accès restreint aux fichiers de la tâche.
* L'URL signée `/media-stream?t=…` ne demande pas de cookie (nécessaire pour une iframe isolée) : toute personne qui possède
  ce lien peut lire ce fichier pendant 1 h. Elle ne sert que des fichiers audio/vidéo/image.

## Vérifier
```sh
make check-media   # génère des médias de test avec FFmpeg puis teste sonde, conversion, montage, miniature, annulation, garde-fous
make apps          # produit aussi build/apps/media-lab-1.0.0.zip (Programme d'exemple)
```
