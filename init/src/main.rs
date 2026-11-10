// weedinit : PID 1 de Weed OS (Rust, sans dépendance externe).
// Monte les pseudo-FS, prépare l'environnement, lance le Kernel PHP,
// récolte les zombies et relance le kernel s'il tombe.
use std::ffi::{c_char, c_int, c_void, CString};
use std::process::Command;
use std::{fs, io::Write, thread, time::Duration};

extern "C" {
    fn mount(src: *const c_char, target: *const c_char, fstype: *const c_char, flags: u64, data: *const c_void) -> c_int;
    fn waitpid(pid: c_int, status: *mut c_int, options: c_int) -> c_int;
    fn sethostname(name: *const c_char, len: usize) -> c_int;
}

fn mnt(src: &str, target: &str, fstype: &str) {
    let _ = fs::create_dir_all(target);
    let (s, t, f) = (CString::new(src).unwrap(), CString::new(target).unwrap(), CString::new(fstype).unwrap());
    unsafe { mount(s.as_ptr(), t.as_ptr(), f.as_ptr(), 0, std::ptr::null()); }
}

const WORKER_USER: &str = "weedworker";
const WORKER_ID: &str = "990";

// Garantit le compte Unix dédié weedworker (UID/GID 990, sans shell, sans mot de passe).
// Refuse (sans rien écraser) tout conflit : le Kernel PHP rejettera alors les workers (fail-closed).
fn ensure_db(path: &str, line: &str, id_field: usize) {
    let content = fs::read_to_string(path).unwrap_or_default();
    for l in content.lines() {
        let f: Vec<&str> = l.split(':').collect();
        if f.len() <= id_field { continue; }
        let named = f[0] == WORKER_USER;
        let same_id = f[id_field] == WORKER_ID;
        if named && same_id { return; }
        if named || same_id {
            eprintln!("[weedinit] conflit {path} : {WORKER_USER}/{WORKER_ID} ({l}) - isolation indisponible");
            return;
        }
    }
    match fs::OpenOptions::new().append(true).create(true).open(path) {
        Ok(mut fh) => {
            let prefix = if content.is_empty() || content.ends_with('\n') { "" } else { "\n" };
            let _ = write!(fh, "{prefix}{line}\n");
        }
        Err(e) => eprintln!("[weedinit] ecriture {path} impossible : {e}"),
    }
}

fn ensure_worker_account() {
    ensure_db("/etc/group", &format!("{WORKER_USER}:x:{WORKER_ID}:"), 2);
    ensure_db("/etc/passwd", &format!("{WORKER_USER}:x:{WORKER_ID}:{WORKER_ID}:Weed Program Worker:/nonexistent:/sbin/nologin"), 2);
    // Mot de passe verrouille ('!') : aucune connexion possible.
    if fs::metadata("/etc/shadow").is_ok() {
        let sh = fs::read_to_string("/etc/shadow").unwrap_or_default();
        if !sh.lines().any(|l| l.starts_with("weedworker:")) {
            if let Ok(mut fh) = fs::OpenOptions::new().append(true).open("/etc/shadow") {
                let _ = writeln!(fh, "{WORKER_USER}:!:19000:0:99999:7:::");
            }
        }
    }
}

fn spawn_kernel() -> u32 {
    let child = Command::new("/usr/bin/php")
        .args(["-d", "memory_limit=256M", "/weed/kernel/boot.php"])
        .env("WEED_ROOT", "/weed")
        .env("WEED_DATA", "/weed/data")
        .env("WEED_DISPLAY", "1")
        .env("XDG_RUNTIME_DIR", "/run/user/0")
        .env("LIBSEAT_BACKEND", "seatd")
        .env("WLR_RENDERER", "pixman")
        .env("WLR_NO_HARDWARE_CURSORS", "1")
        .env("HOME", "/root")
        .env("PATH", "/usr/sbin:/usr/bin:/sbin:/bin")
        .spawn();
    match child {
        Ok(c) => { let pid = c.id(); std::mem::forget(c); pid }
        Err(e) => { eprintln!("weedinit: impossible de lancer PHP: {e}"); 0 }
    }
}

fn main() {
    std::env::set_var("PATH", "/usr/sbin:/usr/bin:/sbin:/bin");
    mnt("proc", "/proc", "proc");
    mnt("sysfs", "/sys", "sysfs");
    mnt("devtmpfs", "/dev", "devtmpfs");
    mnt("tmpfs", "/run", "tmpfs");
    mnt("tmpfs", "/tmp", "tmpfs");
    let _ = fs::create_dir_all("/run/user/0");
    let _ = fs::create_dir_all("/weed/data");
    // Sur une installation disque, les fichiers utilisateur vivent sur WEEDDATA.
    // En session live, l'absence de cette partition est normale.
    let _ = Command::new("mount")
        .args(["-t", "ext4", "-o", "noatime", "LABEL=WEEDDATA", "/weed/data"])
        .status();
    let h = CString::new("weed").unwrap();
    unsafe { sethostname(h.as_ptr(), 4); }
    println!("\n[weedinit] Weed OS 1.0.0 - demarrage");

    let _ = Command::new("/usr/bin/seatd").args(["-g", "video"]).spawn();
    thread::sleep(Duration::from_millis(500));

    ensure_worker_account();
    let mut kernel_pid = spawn_kernel();
    loop {
        let mut status: c_int = 0;
        let pid = unsafe { waitpid(-1, &mut status, 0) };
        if pid < 0 { thread::sleep(Duration::from_millis(500)); continue; }
        if pid as u32 == kernel_pid {
            eprintln!("[weedinit] kernel PHP termine (status {status}), relance dans 2s");
            thread::sleep(Duration::from_secs(2));
            kernel_pid = spawn_kernel();
        }
    }
}
