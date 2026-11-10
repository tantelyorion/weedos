; Weed OS - stage 0 : secteur de boot 512 octets (BIOS / x86 mode réel)
; Test de la chaîne "assembleur -> machine". L'ISO complète utilise GRUB (voir buildroot/).
; Build : nasm -f bin boot/boot.asm -o build/weed-boot.img
; Test  : qemu-system-x86_64 -drive format=raw,file=build/weed-boot.img
BITS 16
ORG 0x7C00
start:
    cli
    xor ax, ax
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x7C00
    sti
    mov ax, 0x0003
    int 0x10
    mov si, msg
.print:
    lodsb
    or al, al
    jz .halt
    mov ah, 0x0E
    mov bx, 0x000A
    int 0x10
    jmp .print
.halt:
    hlt
    jmp .halt
msg db "Weed OS - stage0 OK", 13, 10, "Kernel PHP: voir ISO (make iso)", 13, 10, 0
times 510 - ($ - $$) db 0
dw 0xAA55
