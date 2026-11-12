# Weed OS - Makefile principal
.PHONY: help install check-php check-project check-metrics check-processes check-services check-security-audit check-startup check-startup-audio check-sessions check-eventlog check-app-permissions check-kernel-policy check-storage check-users check-security check-worker check-isolation check-files check-desktop check-features check-browser check-mail check-connectivity check-installer check-media check-foundations check-build-host check-locales dev assets boot-stub init iso qemu wsl-setup wsl-build apps clean
help:
	@echo "make install    - verifie PHP puis installe les assets"
	@echo "make dev        - lance Weed OS en mode développement (PHP requis) sur http://127.0.0.1:8080"
	@echo "make assets     - télécharge FontAwesome Free en local"
	@echo "make boot-stub  - assemble le secteur de boot (NASM) dans build/weed-boot.img"
	@echo "make init       - compile weedinit (Rust, musl statique)"
	@echo "make check-project - vérifie la syntaxe PHP et les fonds d’écran"
	@echo "make check-locales - vérifie les catalogues des neuf langues"
	@echo "make check-archives - teste les archives ZIP/TAR/TAR.GZ (création, extraction, ajout, suppression, sécurité)"
	@echo "make check-metrics  - teste les métriques système en lecture seule"
	@echo "make check-processes - teste l’inventaire des processus /proc en lecture seule"
	@echo "make check-services - teste l’inventaire init.d en lecture seule"
	@echo "make check-security-audit - teste l’audit de configuration non intrusif"
	@echo "make check-startup - teste l’inventaire XDG Autostart en lecture seule"
	@echo "make check-startup-audio - teste le démarrage audio natif ALSA"
	@echo "make check-sessions - teste l’inventaire des sessions sans exposer les jetons"
	@echo "make check-eventlog - teste le filtrage de l’historique de sécurité"
	@echo "make check-app-permissions - teste l’inventaire des permissions déclarées"
	@echo "make check-kernel-policy - teste les octrois explicites et révocations Kernel"
	@echo "make check-storage - teste l’inventaire des volumes montés en lecture seule"
	@echo "make check-users   - teste la création, suppression et protection des comptes"
	@echo "make check-security - teste comptes, permissions et isolation VFS"
	@echo "make check-worker   - teste l’exécution isolée des hooks PHP"
	@echo "make check-isolation - teste réellement l’abandon des privilèges (root + compte weedworker 990)"
	@echo "make check-files    - teste copier, déplacer, import et lecture en flux des fichiers"
	@echo "make check-desktop  - test de bout en bout du bureau (PHP + jsdom : npm install jsdom)"
	@echo "make check-features - teste connectivité, comptes e-mail chiffrés, préférences et sauvegarde/restauration"
	@echo "make check-browser   - teste la persistance et le filtrage des données Gnanja Browser"
	@echo "make check-mail      - teste le décodage MIME, les pièces jointes, les brouillons chiffrés et les dossiers IMAP"
	@echo "make check-connectivity - teste les validations Wi-Fi, Ethernet et Bluetooth sans matériel réel"
	@echo "make check-media     - teste le service média FFmpeg (sonde, conversion, montage, miniature, jeton, annulation ; ignoré sans ffmpeg)"
	@echo "make check-installer    - teste les garde-fous de l’installateur sans écrire sur un disque"
	@echo "make check-foundations - teste RBAC, diagnostic Kernel et préparation UEFI/GPT"
	@echo "make check-build-host - vérifie les outils nécessaires à la compilation ISO"
	@echo "make iso        - construit l'ISO bootable via Buildroot (long)"
	@echo "make wsl-setup   - (WSL2) installe les dépendances de compilation, Rust et la cible musl"
	@echo "make wsl-build   - (WSL2) compile l'ISO depuis un dossier Windows ; voir docs/WSL-BUILD.md"
	@echo "make qemu       - démarre build/weed-os.iso dans QEMU avec carte son (QEMU_AUDIODEV=pa|alsa|sdl|pipewire)"
	@echo "make apps       - empaquette apps-src/* (Programmes) en .zip dans build/apps/"
install: check-php assets
	@echo "Environnement de développement Weed OS prêt."
check-project:
	sh tools/check-project.sh
check-locales:
	node tools/check-locales.js
check-metrics:
	php tests/system-metrics-smoke.php
check-processes:
	php tests/process-manager-smoke.php
check-services:
	php tests/service-manager-smoke.php
check-security-audit:
	php tests/security-audit-smoke.php
check-startup:
	php tests/startup-manager-smoke.php
check-startup-audio:
	php tests/native-startup-audio-smoke.php
check-sessions:
	php tests/session-manager-smoke.php
check-eventlog:
	php tests/event-log-smoke.php
check-app-permissions:
	php tests/app-permissions-smoke.php
check-kernel-policy:
	php tests/kernel-security-policy-smoke.php
check-storage:
	php tests/storage-manager-smoke.php
check-users:
	php tests/user-manager-smoke.php

check-security:
	php tests/security-smoke.php
check-worker:
	php tests/worker-smoke.php
check-files:
	php tests/files-smoke.php
check-archives:
	php tests/archive-smoke.php
check-desktop:
	node tests/desktop-e2e.js
check-features:
	php tests/system-features-smoke.php
check-browser:
	php tests/gnanja-browser-smoke.php
	php tests/gnanja-worker-smoke.php
check-mail:
	php tests/mail-mime-smoke.php
check-connectivity:
	php tests/connectivity-smoke.php
check-installer:
	php tests/installer-smoke.php
check-media:
	php tests/media-smoke.php
check-foundations:
	php tests/kernel-foundations-smoke.php
check-isolation:
	php tests/isolation-smoke.php
check-php:
	@php -r "if (PHP_VERSION_ID < 80100) { fwrite(STDERR, \"PHP 8.1 minimum requis\\n\"); exit(1); } if (!extension_loaded('zip')) { fwrite(STDERR, \"Extension PHP zip requise\\n\"); exit(1); } echo \"PHP \" . PHP_VERSION . \" / ZIP OK\\n\";"
dev:
	php kernel/boot.php --dev
assets:
	sh tools/fetch-fontawesome.sh
boot-stub:
	mkdir -p build && nasm -f bin boot/boot.asm -o build/weed-boot.img
	@echo "Test: qemu-system-x86_64 -drive format=raw,file=build/weed-boot.img"
init:
	cd init && cargo build --release --target x86_64-unknown-linux-musl
check-build-host:
	sh tools/check-build-host.sh
iso: check-build-host assets init
	sh tools/build-iso.sh
QEMU_AUDIODEV ?= pa
qemu:
	qemu-system-x86_64 -m 2048 -enable-kvm -cpu host -smp 2 -cdrom build/weed-os.iso -vga virtio -display gtk \
		-audiodev $(QEMU_AUDIODEV),id=weedaudio -device intel-hda -device hda-duplex,audiodev=weedaudio
wsl-setup:
	sh tools/wsl-setup.sh
wsl-build:
	sh tools/wsl-build.sh
apps:
	sh tools/pack-apps.sh
clean:
	rm -rf build init/target data
