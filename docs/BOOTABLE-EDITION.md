# Weed OS — Bootable Edition 

## Architecture

- Linux x86_64 is the hardware kernel and driver layer.
- `weedinit` (Rust) is PID 1 and launches the Weed PHP services.
- `kernel/` is the PHP system layer (services, virtual filesystem, syscalls, package manager).
- `system/` is the PHP/HTML/CSS/JavaScript desktop.
- Buildroot assembles the live ISO and its initramfs.

PHP is the main system/application language, but it is not a hardware kernel and does not replace Linux.

## Live ISO build

On Debian/Ubuntu, install the host dependencies listed in README.md, install Rust with rustup, then:

```sh
rustup target add x86_64-unknown-linux-musl
make check-build-host
make iso
make qemu
```

The expected output is `build/weed-os.iso`. The build script also writes `build/weed-os.iso.sha256`.

## Live session and graphical disk installer

The ISO can be used as a Live session without installing or modifying an internal disk. The desktop now includes an **Installer Weed OS** application that lists compatible physical disks, shows mounted state and requires an exact `ERASE /dev/...` confirmation plus a second confirmation dialog. The backend requires an administrator account and a root-running Weed OS service; mounted disks are refused.

## Disk installer

The installer is destructive and targets BIOS/Legacy boot with an MBR partition table. It creates:

- `WEEDROOT`: ext4 system partition (approximately 75% of the disk)
- `WEEDDATA`: ext4 persistent data partition (approximately 25% of the disk), mounted at `/weed/data`

First run a simulation:

```sh
weed-install /dev/sdX
```

Only after checking the exact target disk, start installation:

```sh
weed-install /dev/sdX --yes-erase --disk-is-correct
```

Never select the live USB, the host system disk, or a disk containing data you need. Back up first. The installer looks for the kernel on the live ISO9660 medium if it is not already available at `/boot/bzImage`.

## Validation status

Source-level checks performed for this revision:

- PHP syntax checks on all PHP files.
- JavaScript syntax checks on the desktop and SDK.
- Shell syntax checks on build and packaging scripts.
- Installer simulation path tested; it does not partition or format a disk.

Not yet validated in this environment:

- Full Buildroot compilation and ISO creation.
- Boot in QEMU and on physical hardware.
- Installation onto a real disk.
- UEFI/Secure Boot (not supported by this installer revision).

Do not install this revision on a production computer until the ISO has been built and tested in a disposable virtual machine.
