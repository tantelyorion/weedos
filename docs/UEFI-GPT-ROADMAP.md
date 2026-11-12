# Weed OS — feuille de route UEFI/GPT



L'installateur livré reste un installateur BIOS/Legacy avec table MBR. La 0.8.25 ajoute une détection informative BIOS/UEFI, l'inventaire des partitions et un rapport de présence des outils `sgdisk`, `parted`, `mkfs.fat`, `mkfs.ext4` et `grub-install`. Le rapport ne lance aucune commande de partitionnement et `destructive_uefi_enabled` reste toujours `false`.

## Architecture cible

- Détecter le mode de démarrage via `/sys/firmware/efi` ; ne jamais déduire le mode à partir du seul nom du disque.
- BIOS : conserver la table MBR et la partition système ext4 actuelles.
- UEFI : GPT avec une partition système EFI FAT32 (ESP, type EFI System), une partition système Linux et une partition de données séparée.
- Installer et vérifier un chargeur EFI x86_64 dans `EFI/BOOT/BOOTX64.EFI`, ainsi que l'entrée GRUB correspondante.
- Vérifier la présence des outils `sgdisk`/`parted`, `mkfs.fat`, `mkfs.ext4`, `grub-install` et les modules Buildroot associés avant de proposer le mode UEFI.
- Ne pas promettre Secure Boot tant que les binaires EFI ne sont pas signés et que la chaîne de confiance n'est pas testée.

## Garde-fous obligatoires

1. Identifier et exclure le support Live et tous les disques contenant `/`, `/boot`, `/boot/efi`, `/weed/data` ou leurs ancêtres.
2. Refaire l'inventaire immédiatement avant l'écriture et comparer modèle, taille et identifiant matériel avec la sélection initiale.
3. Refuser les disques montés, les périphériques inconnus, les disques système et les partitions enfants ciblées comme disques entiers.
4. Afficher la table de partitions proposée et demander une confirmation exacte liée au périphérique choisi.
5. Exécuter les commandes sans shell, avec arguments séparés, journaliser les étapes et interrompre sur toute erreur.
6. Vérifier les UUID, le montage, le contenu EFI et la présence du chargeur avant de déclarer l'installation terminée.

## Plan de tests

- Tests unitaires sur la détection BIOS/UEFI et la génération de la table de partitions.
- Tests QEMU BIOS et OVMF/UEFI avec disques virtuels vierges.
- Tests d'interruption à chaque étape et vérification qu'aucun succès partiel n'est annoncé.
- Essais sur matériel réel uniquement après validation des scénarios QEMU et sauvegarde préalable.

L'installateur ne doit pas proposer UEFI tant que ces tests ne sont pas automatisés et réussis.
