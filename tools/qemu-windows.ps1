# Lance build\weed-os.iso dans QEMU pour Windows (à exécuter depuis PowerShell, côté Windows, pas dans WSL).
#   winget install SoftwareFreedomConservancy.QEMU      (installation de QEMU, une seule fois)
#   powershell -ExecutionPolicy Bypass -File tools\qemu-windows.ps1
# Accélération : WHPX si la fonctionnalité Windows « Plateforme d'hyperviseur Windows » est activée, sinon émulation logicielle (lente).
param(
  [string]$Iso = (Join-Path $PSScriptRoot '..\build\weed-os.iso'),
  [int]$Memory = 2048,
  [switch]$NoAccel
)
$qemu = (Get-Command qemu-system-x86_64.exe -ErrorAction SilentlyContinue).Source
if (-not $qemu) { $c = Join-Path $env:ProgramFiles 'qemu\qemu-system-x86_64.exe'; if (Test-Path $c) { $qemu = $c } }
if (-not $qemu) { Write-Error 'QEMU introuvable. Installez-le : winget install SoftwareFreedomConservancy.QEMU'; exit 1 }
if (-not (Test-Path $Iso)) { Write-Error "ISO introuvable : $Iso (compilez d'abord avec sh tools/wsl-build.sh dans WSL)"; exit 1 }
$common = @('-m', $Memory, '-smp', 2, '-cdrom', $Iso, '-boot', 'd', '-vga', 'virtio', '-display', 'gtk',
  '-usb', '-device', 'usb-tablet', '-audiodev', 'dsound,id=weedaudio', '-device', 'intel-hda', '-device', 'hda-duplex,audiodev=weedaudio')
if (-not $NoAccel) {
  & $qemu @common '-accel' 'whpx,kernel-irqchip=off'
  if ($LASTEXITCODE -eq 0) { exit 0 }
  Write-Warning 'WHPX indisponible : nouvel essai en émulation logicielle (plus lent).'
}
& $qemu @common '-accel' 'tcg'
