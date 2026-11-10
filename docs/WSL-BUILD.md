# Compiler Weed OS sous Windows 10 avec WSL2

Résultat attendu : `build/weed-os.iso` (ISO bootable). Première compilation : **1 à 3 heures** et ~**30 Go** de disque
(Buildroot compile le noyau Linux, PHP, Mesa et WPE WebKit). Les suivantes reprennent le cache et sont bien plus rapides.

## 0. Prérequis Windows

- Windows 10 version 2004 ou plus (build 19041+), WSL **2** : dans PowerShell, `wsl -l -v` doit afficher `VERSION 2`.
  Sinon : `wsl --set-version Ubuntu 2`.
- Donnez assez de mémoire à WSL. Créez `C:\Users\<vous>\.wslconfig` :

```ini
[wsl2]
memory=10GB
processors=4
swap=16GB
```

  puis `wsl --shutdown` dans PowerShell. (WebKit demande ~2 Go par tâche à l'édition de liens ; sous 6 Go la compilation échoue.)

## 1. Préparer Ubuntu (une seule fois)

Dans le terminal Ubuntu (WSL), allez dans le dossier du projet, par exemple :

```sh
cd /mnt/c/Users/VOUS/Downloads/weed825
sh tools/wsl-setup.sh
```

Le script installe les paquets, Rust (rustup) et la cible `x86_64-unknown-linux-musl`, puis lance `make check-build-host`.

## 2. Compiler

```sh
sh tools/wsl-build.sh
```

Ce script résout les pièges classiques de WSL :

| Piège | Ce que fait le script |
| --- | --- |
| Projet sur `C:` (`/mnt/c/...`) : permissions et vitesse inadaptées, Buildroot refuse | copie le projet vers `~/weed-os` (système de fichiers Linux) et compile là |
| `PATH` Windows avec des espaces (`Program Files`) : Buildroot s'arrête | retire ces entrées du `PATH` |
| Fins de ligne CRLF après édition sous Windows (`\r: not found`) | convertit en LF les scripts copiés |
| Manque de RAM / disque | calcule le nombre de tâches d'après la RAM, vérifie 30 Go libres |
| Option Buildroot ignorée sans message | compare `weed_defconfig` au `.config` résolu et s'arrête avant la compilation longue |

Si la compilation s'interrompt (coupure, erreur réseau), relancez simplement la même commande : le cache de `~/weed-os/build` est conservé.
En cas d'erreur de paquet, le journal est dans `~/weed-os/build/buildroot/output/build/<paquet>/`.
L'ISO finale est copiée dans le dossier d'origine : `build/weed-os.iso` (+ `.sha256`).

## 3. Tester l'ISO

WSL2 sur Windows 10 n'a pas d'écran graphique ni de KVM : lancez l'ISO **côté Windows**.

**QEMU** (recommandé, la configuration correspond à `make qemu`) — dans PowerShell :

```powershell
winget install SoftwareFreedomConservancy.QEMU
powershell -ExecutionPolicy Bypass -File tools\qemu-windows.ps1
```

Le script essaie WHPX (accélération, nécessite la fonctionnalité Windows « Plateforme d'hyperviseur Windows ») puis bascule sur l'émulation logicielle.

**VirtualBox** : nouvelle machine Linux 64 bits, 2 Go de RAM, pas de disque, ISO en lecteur optique, EFI désactivé, contrôleur graphique `VMSVGA`, audio Intel HD. (Le noyau doit disposer du pilote graphique correspondant ; QEMU/virtio est le chemin validé par le projet.)

## 4. Ce qui est validé / non validé

Vérifié avant livraison : `weed_defconfig` résolu par Buildroot 2024.02.9 sans option ignorée, `weedinit` compile en Rust, syntaxe des scripts, tests du bureau.
**Non vérifié** : la compilation complète de l'ISO, son démarrage dans QEMU/VirtualBox et sur matériel réel.
Ne l'installez pas sur un vrai disque avant d'avoir testé dans une machine virtuelle jetable.
