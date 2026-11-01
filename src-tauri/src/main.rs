#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use windows::core::Interface;
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
use windows::Win32::Graphics::Dwm::{
    DwmEnableBlurBehindWindow, DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_SYSTEMBACKDROP_TYPE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWINDOWATTRIBUTE, DWM_BB_ENABLE, DWM_BLURBEHIND,
};
use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP, KEYBD_EVENT_FLAGS};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_CAPTION, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
static MONITOR: AtomicUsize = AtomicUsize::new(0);
const MEDIA_SCRIPT: &str = include_str!("../../helper/media.ps1");
const APPS_SCRIPT: &str = include_str!("../../helper/apps.ps1");
static APPS_CACHE: Mutex<Option<String>> = Mutex::new(None);
// 1x1 transparent PNG used as the drag image
const DRAG_PNG: [u8; 67] = [
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D,
    0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

struct Helper(Mutex<Option<ChildStdin>>);

fn hwnd_of(w: &WebviewWindow) -> Option<HWND> {
    w.hwnd().ok().map(|h| HWND(h.0 as isize as *mut _))
}

fn place(w: &WebviewWindow, size: (f64, f64)) {
    let monitor = w
        .available_monitors()
        .ok()
        .and_then(|v| v.into_iter().nth(MONITOR.load(Ordering::Relaxed)))
        .or_else(|| w.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let s = m.scale_factor();
        let pw = (size.0 * s).round() as i32;
        let ph = (size.1 * s).round() as i32;
        let x = m.position().x + (m.size().width as i32 - pw) / 2;
        let _ = w.set_size(PhysicalSize::new(pw as u32, ph as u32));
        let _ = w.set_position(PhysicalPosition::new(x, m.position().y));
    }
}

#[repr(C)]
struct AccentPolicy {
    state: u32,
    flags: u32,
    color: u32,
    anim: u32,
}
#[repr(C)]
struct CompositionAttrib {
    attr: u32,
    data: *mut std::ffi::c_void,
    size: usize,
}
type SetWcaFn = unsafe extern "system" fn(HWND, *mut CompositionAttrib) -> i32;

// Undocumented export, so it is looked up by name instead of linked.
unsafe fn set_window_composition_attribute(h: HWND, data: *mut CompositionAttrib) {
    use windows::core::{s, w};
    use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
    if let Ok(m) = GetModuleHandleW(w!("user32.dll")) {
        if let Some(p) = GetProcAddress(m, s!("SetWindowCompositionAttribute")) {
            let f: SetWcaFn = std::mem::transmute(p);
            f(h, data);
        }
    }
}

// Windows 11 22H2+ turns the transparent-window blur trick into a real acrylic blur of the whole
// window. Switch every backdrop off; the window library re-applies it on changes, so this is repeated.
fn clear_backdrop(h: HWND) {
    unsafe {
        let mut policy = AccentPolicy { state: 0, flags: 0, color: 0, anim: 0 }; // ACCENT_DISABLED
        let mut data = CompositionAttrib {
            attr: 19, // WCA_ACCENT_POLICY
            data: &mut policy as *mut AccentPolicy as *mut _,
            size: std::mem::size_of::<AccentPolicy>(),
        };
        set_window_composition_attribute(h, &mut data);
        let bb = DWM_BLURBEHIND { dwFlags: DWM_BB_ENABLE, fEnable: false.into(), ..Default::default() };
        let _ = DwmEnableBlurBehindWindow(h, &bb);
        let none: i32 = 1; // DWMSBT_NONE
        let _ = DwmSetWindowAttribute(h, DWMWA_SYSTEMBACKDROP_TYPE, &none as *const i32 as *const _, 4);
    }
}

// The window library keeps re-applying WS_CAPTION to undecorated windows; at 14px tall that
// paints a grey title bar. Strip it again whenever we touch the window.
fn strip_frame(h: HWND) {
    unsafe {
        let st = GetWindowLongPtrW(h, GWL_STYLE);
        let strip = (WS_CAPTION.0 | WS_THICKFRAME.0 | WS_SYSMENU.0 | WS_MINIMIZEBOX.0 | WS_MAXIMIZEBOX.0) as isize;
        if st & strip != 0 {
            SetWindowLongPtrW(h, GWL_STYLE, (st & !strip) | WS_POPUP.0 as isize);
            let _ = SetWindowPos(h, None, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        }
    }
}

fn keep_on_top(w: &WebviewWindow) {
    if let Some(h) = hwnd_of(w) {
        strip_frame(h);
        clear_backdrop(h);
        unsafe {
            let _ = SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}

#[tauri::command]
fn set_size(w: WebviewWindow, width: f64, height: f64) {
    place(&w, (width, height));
    keep_on_top(&w);
}

/// Clips the window to the island's exact shape (bottom corners rounded, top corners pushed above the
/// window), so nothing the system draws around the transparent webview can show.
fn apply_region(h: HWND, x: i32, width: i32, height: i32, radius: i32) {
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};
    unsafe {
        let r = radius.max(0);
        let rgn = CreateRoundRectRgn(x, -r, x + width + 1, height + 1, (r * 2).max(1), (r * 2).max(1));
        let _ = SetWindowRgn(h, rgn, true);
    }
}

#[tauri::command]
fn set_region(w: WebviewWindow, x: i32, width: i32, height: i32, radius: i32) {
    if let Some(h) = hwnd_of(&w) {
        apply_region(h, x, width, height, radius);
    }
}

static HOT_W: AtomicUsize = AtomicUsize::new(110);
static HOT_H: AtomicUsize = AtomicUsize::new(4);

#[tauri::command]
fn set_hot_zone(width: usize, height: usize) {
    HOT_W.store(width, Ordering::Relaxed);
    HOT_H.store(height, Ordering::Relaxed);
}

#[tauri::command]
fn set_click_through(w: WebviewWindow, on: bool) {
    let _ = w.set_ignore_cursor_events(on);
}

#[tauri::command]
fn monitors(w: WebviewWindow) -> Vec<String> {
    w.available_monitors()
        .map(|v| {
            v.iter()
                .enumerate()
                .map(|(i, m)| format!("{} ({}×{})", i + 1, m.size().width, m.size().height))
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn set_monitor(idx: usize) {
    MONITOR.store(idx, Ordering::Relaxed);
}

unsafe fn endpoint<T: Interface>() -> windows::core::Result<T> {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let dev = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
    dev.Activate::<T>(CLSCTX_ALL, None)
}

#[tauri::command]
fn get_volume() -> serde_json::Value {
    unsafe {
        match endpoint::<IAudioEndpointVolume>() {
            Ok(v) => serde_json::json!({
                "level": v.GetMasterVolumeLevelScalar().unwrap_or(0.0),
                "muted": v.GetMute().map(|b| b.as_bool()).unwrap_or(false)
            }),
            Err(_) => serde_json::json!({ "level": 0.0, "muted": false }),
        }
    }
}

#[tauri::command]
fn set_volume(level: f32) {
    unsafe {
        if let Ok(v) = endpoint::<IAudioEndpointVolume>() {
            let _ = v.SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null());
        }
    }
}

#[tauri::command]
fn toggle_mute() {
    unsafe {
        if let Ok(v) = endpoint::<IAudioEndpointVolume>() {
            let m = v.GetMute().map(|b| b.as_bool()).unwrap_or(false);
            let _ = v.SetMute(!m, std::ptr::null());
        }
    }
}

fn start_peak_meter(app: tauri::AppHandle) {
    thread::spawn(move || unsafe {
        let mut meter: Option<IAudioMeterInformation> = None;
        let mut tick = 0u32;
        loop {
            if meter.is_none() || tick % 100 == 0 {
                meter = endpoint::<IAudioMeterInformation>().ok();
            }
            tick += 1;
            if let Some(m) = &meter {
                let _ = app.emit("peak", m.GetPeakValue().unwrap_or(0.0));
            }
            thread::sleep(Duration::from_millis(45));
        }
    });
}

#[tauri::command]
fn set_visible(w: WebviewWindow, visible: bool) {
    if visible {
        let _ = w.show();
        keep_on_top(&w);
    } else {
        let _ = w.hide();
    }
}

#[tauri::command]
fn media_cmd(state: State<Helper>, cmd: String) {
    if let Some(stdin) = state.0.lock().unwrap().as_mut() {
        let _ = writeln!(stdin, "{}", cmd);
        let _ = stdin.flush();
    }
}

#[tauri::command]
fn vol_key(kind: String) {
    let vk: u8 = match kind.as_str() {
        "up" => 0xAF,
        "down" => 0xAE,
        _ => 0xAD,
    };
    unsafe {
        keybd_event(vk, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
    }
}

// The island normally never takes focus, so a paste lands in the app you were using. Typing into one
// of its boxes needs the keyboard, so it is taken only for that and handed back when the island closes.
#[tauri::command]
fn take_focus(w: WebviewWindow) {
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow};
    let Some(h) = hwnd_of(&w) else { return };
    unsafe {
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
        SetWindowLongPtrW(h, GWL_EXSTYLE, ex & !(WS_EX_NOACTIVATE.0 as isize));
        // Windows only lets the app in front hand over the foreground, so borrow its input queue for the call
        let front = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let ours = GetCurrentThreadId();
        let attached = front != ours && AttachThreadInput(ours, front, true).as_bool();
        let _ = SetForegroundWindow(h);
        if attached {
            let _ = AttachThreadInput(ours, front, false);
        }
    }
    let _ = w.set_focus();
}

#[tauri::command]
fn release_focus(w: WebviewWindow) {
    let Some(h) = hwnd_of(&w) else { return };
    unsafe {
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
        SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize);
    }
    restore_foreground();
}

#[tauri::command]
fn clip_set(text: String) {
    if let Ok(mut c) = arboard::Clipboard::new() {
        let _ = c.set_text(text);
    }
}

static LAST_FG: AtomicIsize = AtomicIsize::new(0);

/// Remembers the last foreground window that is not ours, so a paste can go back to it.
fn start_foreground_tracker() {
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowThreadProcessId};
    thread::spawn(|| loop {
        unsafe {
            let h = GetForegroundWindow();
            if !h.0.is_null() {
                let mut pid = 0u32;
                GetWindowThreadProcessId(h, Some(&mut pid));
                if pid != std::process::id() {
                    let mut cls = [0u16; 64];
                    let n = GetClassNameW(h, &mut cls).max(0) as usize;
                    let c = String::from_utf16_lossy(&cls[..n]);
                    if !matches!(c.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                        LAST_FG.store(h.0 as isize, Ordering::Relaxed);
                    }
                }
            }
        }
        thread::sleep(Duration::from_millis(100));
    });
}

fn restore_foreground() {
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    let v = LAST_FG.load(Ordering::Relaxed);
    if v != 0 {
        unsafe {
            let _ = SetForegroundWindow(HWND(v as *mut _));
        }
    }
}

/// Sends Ctrl+V to the window that had focus before the island was clicked.
fn send_ctrl_v() {
    restore_foreground();
    thread::sleep(Duration::from_millis(120));
    unsafe {
        keybd_event(0x11, 0, KEYBD_EVENT_FLAGS(0), 0); // Ctrl down
        keybd_event(0x56, 0, KEYBD_EVENT_FLAGS(0), 0); // V down
        keybd_event(0x56, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(0x11, 0, KEYEVENTF_KEYUP, 0);
    }
}

#[tauri::command]
async fn paste_text(text: String) {
    if let Ok(mut c) = arboard::Clipboard::new() {
        let _ = c.set_text(text);
    }
    thread::sleep(Duration::from_millis(70));
    send_ctrl_v();
}

#[tauri::command]
async fn paste_image(app: tauri::AppHandle, state: State<'_, ClipStore>, id: String) -> Result<bool, ()> {
    load_pinned_image(&app, &id);
    let ok = {
        let store = state.0.lock().unwrap();
        match store.iter().find(|e| e.0 == id) {
            Some((_, w, h, bytes)) => arboard::Clipboard::new()
                .map(|mut c| {
                    c.set_image(arboard::ImageData { width: *w, height: *h, bytes: std::borrow::Cow::Borrowed(bytes) }).is_ok()
                })
                .unwrap_or(false),
            None => false,
        }
    };
    if ok {
        thread::sleep(Duration::from_millis(90));
        send_ctrl_v();
    }
    Ok(ok)
}

#[tauri::command]
fn open_path(path: String) {
    let _ = Command::new("cmd").args(["/c", "start", "", &path]).creation_flags(CREATE_NO_WINDOW).spawn();
}

/// Opens `files` with the program at `exe` (a .exe, or a .lnk shortcut which is launched through the shell).
#[tauri::command]
fn open_with(exe: String, files: Vec<String>) {
    let is_lnk = exe.to_lowercase().ends_with(".lnk");
    if exe.starts_with("shell:") {
        let _ = Command::new("explorer.exe").arg(exe).spawn();
    } else if is_lnk {
        let mut args = vec!["/c".to_string(), "start".to_string(), String::new(), exe];
        args.extend(files);
        let _ = Command::new("cmd").args(args).creation_flags(CREATE_NO_WINDOW).spawn();
    } else {
        let _ = Command::new(exe).args(files).spawn();
    }
}

/// Finds LocalSend in the usual places so it can be offered as a default quick app.
#[tauri::command]
fn find_localsend() -> Option<String> {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let pf = std::env::var("ProgramFiles").unwrap_or_default();
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    [
        PathBuf::from(&local).join("Programs/LocalSend/localsend_app.exe"),
        PathBuf::from(&pf).join("LocalSend/localsend_app.exe"),
        PathBuf::from(&appdata).join("Microsoft/Windows/Start Menu/Programs/LocalSend.lnk"),
    ]
    .into_iter()
    .find(|p| p.exists())
    .map(|p| p.display().to_string())
}

fn run_ps(script: &str) -> Option<String> {
    let out = Command::new("powershell.exe")
        .args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

#[tauri::command]
async fn pick_exe() -> Option<String> {
    run_ps(
        "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; \
         $d.Filter = 'Programs|*.exe;*.lnk|All files|*.*'; if ($d.ShowDialog() -eq 'OK') { $d.FileName }",
    )
}

/// The Start menu's apps with icons, for the app picker. Takes a few seconds, so the result is kept.
#[tauri::command]
async fn list_apps() -> Option<String> {
    if let Some(c) = APPS_CACHE.lock().unwrap().clone() {
        return Some(c);
    }
    let script = std::env::temp_dir().join("dynisland_apps.ps1");
    std::fs::write(&script, APPS_SCRIPT).ok()?;
    let out = Command::new("powershell.exe")
        .args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        return None;
    }
    *APPS_CACHE.lock().unwrap() = Some(s.clone());
    Some(s)
}

/// Picks any number of files for the shelf.
#[tauri::command]
async fn pick_files() -> Vec<String> {
    run_ps(
        "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; \
         $d.Multiselect = $true; if ($d.ShowDialog() -eq 'OK') { $d.FileNames -join '|' }",
    )
    .map(|s| s.split('|').map(|p| p.to_string()).filter(|p| !p.is_empty()).collect())
    .unwrap_or_default()
}

/// A small preview for a shelf item: the picture itself for small images, otherwise the file's own
/// Windows icon (so an app shows its real icon).
#[tauri::command]
async fn file_thumb(path: String) -> Option<String> {
    use base64::Engine;
    let lower = path.to_lowercase();
    let mime = [("png", "image/png"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("gif", "image/gif"), ("webp", "image/webp"), ("bmp", "image/bmp")]
        .into_iter()
        .find(|(ext, _)| lower.ends_with(&format!(".{}", ext)))
        .map(|(_, m)| m);
    if let Some(m) = mime {
        if let Ok(meta) = std::fs::metadata(&path) {
            if meta.len() <= 3_000_000 {
                if let Ok(bytes) = std::fs::read(&path) {
                    return Some(format!("data:{};base64,{}", m, base64::engine::general_purpose::STANDARD.encode(bytes)));
                }
            }
        }
    }
    let script = format!(
        "Add-Type -AssemblyName System.Drawing; $i = [System.Drawing.Icon]::ExtractAssociatedIcon('{}'); \
         if ($i) {{ $b = $i.ToBitmap(); $m = New-Object System.IO.MemoryStream; \
         $b.Save($m, [System.Drawing.Imaging.ImageFormat]::Png); [Convert]::ToBase64String($m.ToArray()) }}",
        path.replace('\'', "''")
    );
    run_ps(&script).map(|b| format!("data:image/png;base64,{}", b))
}

/// The PC's own location (Windows location service), used for the weather. No web lookup involved.
#[tauri::command]
async fn get_location() -> Option<(f64, f64)> {
    let s = run_ps(
        "Add-Type -AssemblyName System.Device; $w = New-Object System.Device.Location.GeoCoordinateWatcher; $w.Start(); \
         for ($i = 0; $i -lt 40; $i++) { if (-not $w.Position.Location.IsUnknown) { break }; Start-Sleep -Milliseconds 250 }; \
         $l = $w.Position.Location; if (-not $l.IsUnknown) { '{0},{1}' -f $l.Latitude.ToString([cultureinfo]::InvariantCulture), $l.Longitude.ToString([cultureinfo]::InvariantCulture) }",
    )?;
    let (a, b) = s.split_once(',')?;
    Some((a.trim().parse().ok()?, b.trim().parse().ok()?))
}

#[tauri::command]
fn open_settings(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn settings_changed(app: tauri::AppHandle) {
    let _ = app.emit("settings-changed", ());
}

#[tauri::command]
fn data_dir(app: tauri::AppHandle) {
    if let Ok(d) = app.path().app_data_dir() {
        open_path(d.display().to_string());
    }
}

#[tauri::command]
fn set_autostart(enable: bool) -> bool {
    let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let mut cmd = Command::new("reg");
    if enable {
        cmd.args(["add", key, "/v", "DynIsland", "/t", "REG_SZ", "/d", &format!("\"{}\"", exe), "/f"]);
    } else {
        cmd.args(["delete", key, "/v", "DynIsland", "/f"]);
    }
    cmd.creation_flags(CREATE_NO_WINDOW).status().map(|s| s.success()).unwrap_or(false)
}

// The exe path registered to start with Windows, if any. The registry is the truth: the installer writes it too.
fn autostart_path() -> Option<String> {
    let out = Command::new("reg")
        .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "/v", "DynIsland"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let line = text.lines().find(|l| l.contains("REG_SZ"))?;
    Some(line.split("REG_SZ").nth(1)?.trim().trim_matches('"').to_string())
}

#[tauri::command]
async fn get_autostart() -> bool {
    autostart_path().is_some()
}

#[tauri::command]
fn start_drag(window: WebviewWindow, path: String) {
    let w = window.clone();
    let app = window.app_handle().clone();
    let _ = window.run_on_main_thread(move || {
        let p = path.clone();
        let _ = drag::start_drag(
            &w,
            drag::DragItem::Files(vec![PathBuf::from(path)]),
            drag::Image::Raw(DRAG_PNG.to_vec()),
            move |result, _| {
                if matches!(result, drag::DragResult::Dropped) {
                    let _ = app.emit("drag-done", p.clone());
                }
            },
            drag::Options::default(),
        );
    });
}

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

fn start_media_helper(app: tauri::AppHandle) {
    let script = std::env::temp_dir().join("dynisland_media.ps1");
    if std::fs::write(&script, MEDIA_SCRIPT).is_err() {
        return;
    }
    let child = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    let Ok(mut child) = child else { return };
    *app.state::<Helper>().0.lock().unwrap() = child.stdin.take();
    let stdout = child.stdout.take().unwrap();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                let _ = app.emit(if v["type"] == "fs" { "fs" } else { "media" }, v);
            }
        }
    });
}

type FullImage = (String, usize, usize, Vec<u8>);
struct ClipStore(Mutex<Vec<FullImage>>);

fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    let step = (bytes.len() / 4096).max(1);
    for b in bytes.iter().step_by(step) {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h ^ bytes.len() as u64
}

// Down-scales to a small PNG data URL so the history stays light.
fn thumbnail(w: usize, h: usize, rgba: &[u8]) -> Option<String> {
    scaled_png(w, h, rgba, 360.0)
}

// A pinned image is kept on disk so it survives a restart; the id is our own hash, checked before it names a file.
fn pinned_path(app: &tauri::AppHandle, id: &str) -> Option<PathBuf> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(app.path().app_data_dir().ok()?.join("clips").join(format!("{}.png", id)))
}

fn load_pinned_image(app: &tauri::AppHandle, id: &str) {
    let state = app.state::<ClipStore>();
    if state.0.lock().unwrap().iter().any(|e| e.0 == id) {
        return;
    }
    let read = || -> Option<FullImage> {
        let mut reader = png::Decoder::new(std::fs::File::open(pinned_path(app, id)?).ok()?).read_info().ok()?;
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).ok()?;
        buf.truncate(info.buffer_size());
        Some((id.to_string(), info.width as usize, info.height as usize, buf))
    };
    if let Some(img) = read() {
        state.0.lock().unwrap().push(img);
    }
}

#[tauri::command]
async fn clip_pin_image(app: tauri::AppHandle, id: String, pin: bool) -> bool {
    let Some(path) = pinned_path(&app, &id) else { return false };
    if !pin {
        return std::fs::remove_file(path).is_ok();
    }
    let state = app.state::<ClipStore>();
    let store = state.0.lock().unwrap();
    let Some((_, w, h, bytes)) = store.iter().find(|e| e.0 == id) else { return false };
    let _ = std::fs::create_dir_all(path.parent().unwrap());
    let Ok(file) = std::fs::File::create(path) else { return false };
    let mut enc = png::Encoder::new(file, *w as u32, *h as u32);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    enc.write_header().and_then(|mut wr| wr.write_image_data(bytes)).is_ok()
}

/// The big picture for the clipboard preview.
#[tauri::command]
async fn clip_preview(app: tauri::AppHandle, id: String) -> Option<String> {
    load_pinned_image(&app, &id);
    let state = app.state::<ClipStore>();
    let store = state.0.lock().unwrap();
    let (_, w, h, bytes) = store.iter().find(|e| e.0 == id)?;
    scaled_png(*w, *h, bytes, 1300.0)
}

#[tauri::command]
fn open_url(url: String) {
    if url.starts_with("http://") || url.starts_with("https://") {
        let _ = Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).creation_flags(CREATE_NO_WINDOW).spawn();
    }
}

// ---------------- keyboard shortcuts ----------------
static CLIP_HOTKEY: Mutex<Option<tauri_plugin_global_shortcut::Shortcut>> = Mutex::new(None);

/// Changes the shortcut that opens the clipboard. An empty string turns it off; Err means it can't be used.
#[tauri::command]
fn set_hotkey(app: tauri::AppHandle, combo: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let gs = app.global_shortcut();
    let mut cur = CLIP_HOTKEY.lock().unwrap();
    if let Some(old) = cur.take() {
        let _ = gs.unregister(old);
    }
    if combo.is_empty() {
        return Ok(());
    }
    let sc: Shortcut = combo.parse().map_err(|_| "invalid".to_string())?;
    gs.register(sc).map_err(|_| "taken".to_string())?;
    *cur = Some(sc);
    Ok(())
}

// The island never takes focus (a paste must land in the app you were using), so while it is
// opened from the keyboard these keys are claimed globally, and released as soon as it closes.
fn nav_shortcuts() -> Vec<(tauri_plugin_global_shortcut::Shortcut, &'static str)> {
    use tauri_plugin_global_shortcut::{Code, Shortcut};
    [(Code::ArrowLeft, "left"), (Code::ArrowRight, "right"), (Code::ArrowUp, "left"), (Code::ArrowDown, "right"), (Code::Enter, "enter"), (Code::Escape, "esc"), (Code::Space, "space")]
        .into_iter()
        .map(|(c, n)| (Shortcut::new(None, c), n))
        .collect()
}

#[tauri::command]
fn nav_keys(app: tauri::AppHandle, on: bool) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    for (sc, _) in nav_shortcuts() {
        let _ = if on { gs.register(sc) } else { gs.unregister(sc) };
    }
}

fn scaled_png(w: usize, h: usize, rgba: &[u8], max: f64) -> Option<String> {
    use base64::Engine;
    let f = (w.max(h) as f64 / max).ceil().max(1.0) as usize;
    let (tw, th) = ((w / f).max(1), (h / f).max(1));
    let mut buf = Vec::with_capacity(tw * th * 4);
    for y in 0..th {
        for x in 0..tw {
            let i = ((y * f) * w + x * f) * 4;
            buf.extend_from_slice(rgba.get(i..i + 4)?);
        }
    }
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, tw as u32, th as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.write_header().ok()?.write_image_data(&buf).ok()?;
    }
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(out)))
}

#[tauri::command]
fn clip_set_image(app: tauri::AppHandle, state: State<ClipStore>, id: String) -> bool {
    load_pinned_image(&app, &id);
    let store = state.0.lock().unwrap();
    if let Some((_, w, h, bytes)) = store.iter().find(|e| e.0 == id) {
        if let Ok(mut c) = arboard::Clipboard::new() {
            return c
                .set_image(arboard::ImageData { width: *w, height: *h, bytes: std::borrow::Cow::Borrowed(bytes) })
                .is_ok();
        }
    }
    false
}

// Password managers mark what they copy with these formats so clipboard tools leave it alone.
fn clipboard_is_private() -> bool {
    use windows::core::w;
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW};
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
    unsafe {
        if [w!("ExcludeClipboardContentFromMonitorProcessing"), w!("Clipboard Viewer Ignore")]
            .into_iter()
            .any(|name| IsClipboardFormatAvailable(RegisterClipboardFormatW(name)).is_ok())
        {
            return true;
        }
        // this one holds a value: screenshot tools and others set it to 1 ("allowed"), only 0 means private
        let can_include = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
        if IsClipboardFormatAvailable(can_include).is_err() || OpenClipboard(None).is_err() {
            return false;
        }
        let mut private = false;
        if let Ok(data) = GetClipboardData(can_include) {
            let mem = HGLOBAL(data.0);
            let p = GlobalLock(mem) as *const u32;
            if !p.is_null() {
                private = p.read_unaligned() == 0;
                let _ = GlobalUnlock(mem);
            }
        }
        let _ = CloseClipboard();
        private
    }
}

fn read_clipboard(c: &mut arboard::Clipboard, app: &tauri::AppHandle) -> bool {
    if clipboard_is_private() {
        return true;
    }
    if let Ok(files) = c.get().file_list() {
        if !files.is_empty() {
            let v: Vec<String> = files.iter().map(|p| p.display().to_string()).collect();
            let _ = app.emit("clip", serde_json::json!({ "kind": "files", "v": v }));
            return true;
        }
    }
    if let Ok(img) = c.get_image() {
        let id = format!("{:x}", fnv(&img.bytes));
        if let Some(thumb) = thumbnail(img.width, img.height, &img.bytes) {
            let state = app.state::<ClipStore>();
            let mut store = state.0.lock().unwrap();
            store.retain(|e| e.0 != id);
            store.push((id.clone(), img.width, img.height, img.bytes.to_vec()));
            if store.len() > 8 {
                store.remove(0);
            }
            let _ = app.emit(
                "clip",
                serde_json::json!({ "kind": "image", "id": id, "w": img.width, "h": img.height, "thumb": thumb }),
            );
            return true;
        }
    }
    if let Ok(t) = c.get_text() {
        if !t.trim().is_empty() {
            let _ = app.emit("clip", serde_json::json!({ "kind": "text", "v": t }));
            return true;
        }
    }
    false
}

// True when the foreground window (not ours, not the desktop or taskbar) covers a whole monitor.
fn fullscreen_foreground() -> bool {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId};
    unsafe {
        let h = GetForegroundWindow();
        if h.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid));
        if pid == std::process::id() {
            return false;
        }
        let mut cls = [0u16; 64];
        let n = GetClassNameW(h, &mut cls).max(0) as usize;
        let c = String::from_utf16_lossy(&cls[..n]);
        if matches!(c.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return false;
        }
        let mut r = RECT::default();
        if GetWindowRect(h, &mut r).is_err() {
            return false;
        }
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mut mi).as_bool() {
            return false;
        }
        let m = mi.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

fn start_fullscreen_watcher(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut was = false;
        loop {
            let now = fullscreen_foreground();
            if now != was {
                was = now;
                let _ = app.emit("fs", serde_json::json!({ "value": now }));
            }
            thread::sleep(Duration::from_millis(600));
        }
    });
}

fn start_clipboard_watcher(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut cb = arboard::Clipboard::new().ok();
        let mut last_seq = 0u32;
        loop {
            let seq = unsafe { GetClipboardSequenceNumber() };
            if seq != last_seq {
                last_seq = seq;
                // another app may still hold the clipboard right after copying (screenshot tools take a while), so retry
                for _ in 0..20 {
                    if cb.is_none() {
                        cb = arboard::Clipboard::new().ok();
                    }
                    if let Some(c) = cb.as_mut() {
                        if read_clipboard(c, &app) {
                            break;
                        }
                    }
                    thread::sleep(Duration::from_millis(80));
                }
            }
            thread::sleep(Duration::from_millis(250));
        }
    });
}

// ---------------- system monitor ----------------
struct SysState(Mutex<SysData>);
struct SysData {
    sys: sysinfo::System,
    nets: sysinfo::Networks,
    last: std::time::Instant,
    gpu_at: Option<std::time::Instant>,
    gpu: Option<(f64, f64, f64, f64)>,
}

// util %, memory used MB, memory total MB, temperature; NVIDIA only (nvidia-smi ships with the driver)
fn read_gpu() -> Option<(f64, f64, f64, f64)> {
    let out = Command::new("nvidia-smi")
        .args(["--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    let v: Vec<f64> = s.lines().next()?.split(',').filter_map(|x| x.trim().parse().ok()).collect();
    (v.len() == 4).then(|| (v[0], v[1], v[2], v[3]))
}

#[tauri::command]
async fn sys_stats(state: State<'_, SysState>) -> Result<serde_json::Value, ()> {
    let mut d = state.0.lock().unwrap();
    d.sys.refresh_cpu_usage();
    d.sys.refresh_memory();
    d.nets.refresh();
    let secs = d.last.elapsed().as_secs_f64().max(0.1);
    d.last = std::time::Instant::now();
    let (mut down, mut up) = (0u64, 0u64);
    for (_, n) in d.nets.iter() {
        down += n.received();
        up += n.transmitted();
    }
    if d.gpu_at.map_or(true, |t| t.elapsed().as_secs() >= 2) {
        d.gpu = read_gpu();
        d.gpu_at = Some(std::time::Instant::now());
    }
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let (mut disk_total, mut disk_free) = (0u64, 0u64);
    for k in disks.iter() {
        disk_total += k.total_space();
        disk_free += k.available_space();
    }
    Ok(serde_json::json!({
        "cpu": d.sys.global_cpu_usage(),
        "cores": d.sys.cpus().len(),
        "ramUsed": d.sys.used_memory(),
        "ramTotal": d.sys.total_memory(),
        "gpu": d.gpu.map(|g| serde_json::json!({ "util": g.0, "memUsed": g.1, "memTotal": g.2, "temp": g.3 })),
        "diskUsed": disk_total - disk_free,
        "diskTotal": disk_total,
        "down": down as f64 / secs,
        "up": up as f64 / secs,
    }))
}

// ---------------- web lookups ----------------
fn get_json(req: ureq::Request) -> Option<serde_json::Value> {
    let body = req.timeout(Duration::from_secs(8)).set("User-Agent", "DynIsland/0.1").call().ok()?.into_string().ok()?;
    serde_json::from_str(&body).ok()
}

const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

fn get_page(url: &str) -> Option<String> {
    ureq::get(url).timeout(Duration::from_secs(8)).set("User-Agent", BROWSER_UA).call().ok()?.into_string().ok()
}

fn norm(s: &str) -> String {
    s.split(['(', '[']).next().unwrap_or("").chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

// Search results are loose, and the wrong song's lyrics are worse than none, so both title and artist must match.
fn same_song(title: &str, artist: &str, got_title: &str, got_artist: &str) -> bool {
    let close = |a: &str, b: &str| !a.is_empty() && !b.is_empty() && (a == b || (a.len() >= 3 && b.contains(a)) || (b.len() >= 3 && a.contains(b)));
    if !close(&norm(title), &norm(got_title)) {
        return false;
    }
    artist.trim().is_empty() || artist.split([',', '&', ';', '/']).any(|a| close(&norm(a), &norm(got_artist)))
}

fn html_text(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('<') {
        out.push_str(&rest[..i]);
        let Some(end) = rest[i..].find('>') else { break };
        if rest[i..].starts_with("<br") {
            out.push('\n');
        }
        rest = &rest[i + end + 1..];
    }
    out.push_str(rest);
    let mut text = String::new();
    let mut rest = out.as_str();
    // numeric entities first (&#x27; &#39;), then the named ones
    while let Some(i) = rest.find("&#") {
        text.push_str(&rest[..i]);
        let tail = &rest[i + 2..];
        let decoded = tail.find(';').and_then(|e| {
            let code = &tail[..e];
            let n = match code.strip_prefix(['x', 'X']) {
                Some(h) => u32::from_str_radix(h, 16).ok(),
                None => code.parse().ok(),
            };
            n.and_then(char::from_u32).map(|c| (c, e))
        });
        match decoded {
            Some((c, e)) => {
                text.push(c);
                rest = &tail[e + 1..];
            }
            None => {
                text.push_str("&#");
                rest = tail;
            }
        }
    }
    text.push_str(rest);
    xml_unescape(&text).replace("&nbsp;", " ")
}

// Byte offset just past the </div> that closes the <div> starting at `start`.
fn div_end(s: &str, start: usize) -> Option<usize> {
    let (mut pos, mut depth) = (start, 0i32);
    loop {
        let (open, close) = (s[pos..].find("<div"), s[pos..].find("</div>"));
        match (open, close) {
            (Some(o), Some(c)) if o < c => {
                depth += 1;
                pos += o + 4;
            }
            (_, Some(c)) => {
                depth -= 1;
                pos += c + 6;
                if depth == 0 {
                    return Some(pos);
                }
            }
            _ => return None,
        }
    }
}

// Genius has no lyrics API, so they are read from the song page's lyric containers.
fn genius_page_lyrics(html: &str) -> Option<String> {
    let mut parts = Vec::new();
    let mut pos = 0;
    while let Some(i) = html[pos..].find("data-lyrics-container") {
        let start = html[..pos + i].rfind("<div")?;
        let end = div_end(html, start)?;
        let mut block = html[start..end].to_string();
        // the "N Contributors / Song Lyrics" header sits inside the first container
        while let Some(x) = block.find("data-exclude-from-selection") {
            let Some(s) = block[..x].rfind("<div") else { break };
            let Some(e) = div_end(&block, s) else { break };
            block.replace_range(s..e, "");
        }
        parts.push(html_text(&block));
        pos = end;
    }
    let lines: Vec<&str> = parts.iter().flat_map(|p| p.lines()).map(str::trim).filter(|l| !l.is_empty() && !(l.starts_with('[') && l.ends_with(']'))).collect();
    (!lines.is_empty()).then(|| lines.join("\n"))
}

fn genius_lyrics(title: &str, artist: &str) -> Option<String> {
    let q = format!("{} {}", artist, title);
    let v = get_json(ureq::get("https://genius.com/api/search/song").query("q", q.trim()).query("per_page", "5"))?;
    let hits = v["response"]["sections"][0]["hits"].as_array()?;
    let url = hits.iter().map(|h| &h["result"]).find(|r| {
        r["lyrics_state"] == "complete" && same_song(title, artist, r["title"].as_str().unwrap_or(""), r["primary_artist"]["name"].as_str().unwrap_or(""))
    })?["url"].as_str()?.to_string();
    genius_page_lyrics(&get_page(&url)?)
}

fn netease_lyrics(title: &str, artist: &str) -> Option<String> {
    let q = format!("{} {}", artist, title);
    let res = ureq::post("https://music.163.com/api/search/get")
        .timeout(Duration::from_secs(8))
        .set("User-Agent", BROWSER_UA)
        .set("Referer", "https://music.163.com/")
        .send_form(&[("s", q.trim()), ("type", "1"), ("limit", "6"), ("offset", "0")])
        .ok()?
        .into_string()
        .ok()?;
    let v: serde_json::Value = serde_json::from_str(&res).ok()?;
    let id = v["result"]["songs"].as_array()?.iter().find(|s| {
        s["artists"].as_array().is_some_and(|l| l.iter().any(|a| same_song(title, artist, s["name"].as_str().unwrap_or(""), a["name"].as_str().unwrap_or(""))))
    })?["id"].as_i64()?;
    let id = id.to_string();
    let v = get_json(ureq::get("https://music.163.com/api/song/lyric").set("Referer", "https://music.163.com/").query("id", &id).query("lv", "1"))?;
    let lrc = v["lrc"]["lyric"].as_str()?;
    lrc.lines().any(|l| l.starts_with('[') && l.as_bytes().get(1).is_some_and(u8::is_ascii_digit)).then(|| lrc.to_string())
}

/// Synced lyrics from any source win over plain ones: LRCLIB, then NetEase; for plain text LRCLIB, Genius, lyrics.ovh.
#[tauri::command]
async fn lyrics(title: String, artist: String, duration: f64) -> Option<serde_json::Value> {
    let found = |src: &str, synced: &str, plain: &str| Some(serde_json::json!({ "source": src, "synced": synced, "plain": plain }));
    let text = |v: &serde_json::Value, k: &str| v[k].as_str().unwrap_or("").to_string();
    let mut exact = ureq::get("https://lrclib.net/api/get").query("track_name", &title).query("artist_name", &artist);
    let dur = (duration.round() as i64).to_string();
    if duration > 0.0 {
        exact = exact.query("duration", &dur);
    }
    let mut plain = String::new();
    if let Some(v) = get_json(exact) {
        if !text(&v, "syncedLyrics").is_empty() {
            return found("LRCLIB", &text(&v, "syncedLyrics"), &text(&v, "plainLyrics"));
        }
        plain = text(&v, "plainLyrics");
    }
    let q = format!("{} {}", artist, title);
    if let Some(list) = get_json(ureq::get("https://lrclib.net/api/search").query("q", q.trim())) {
        let matches: Vec<&serde_json::Value> = list.as_array().map(|l| l.iter().filter(|v| same_song(&title, &artist, v["trackName"].as_str().unwrap_or(""), v["artistName"].as_str().unwrap_or(""))).collect()).unwrap_or_default();
        if let Some(v) = matches.iter().find(|v| !text(v, "syncedLyrics").is_empty()) {
            return found("LRCLIB", &text(v, "syncedLyrics"), &text(v, "plainLyrics"));
        }
        if plain.is_empty() {
            plain = matches.first().map(|v| text(v, "plainLyrics")).unwrap_or_default();
        }
    }
    if let Some(lrc) = netease_lyrics(&title, &artist) {
        return found("NetEase", &lrc, "");
    }
    if !plain.is_empty() {
        return found("LRCLIB", "", &plain);
    }
    if let Some(t) = genius_lyrics(&title, &artist) {
        return found("Genius", "", &t);
    }
    if artist.trim().is_empty() {
        return None;
    }
    let ovh = get_json(ureq::get(&format!("https://api.lyrics.ovh/v1/{}/{}", url_part(&artist), url_part(&title))))?;
    let t = text(&ovh, "lyrics");
    if t.trim().is_empty() { None } else { found("lyrics.ovh", "", &t) }
}

fn url_part(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{:02X}", b) }).collect()
}

/// Google's free endpoint needs no key; DeepL needs the user's own API key.
#[tauri::command]
async fn translate(text: String, target: String, provider: String, key: String) -> Result<serde_json::Value, String> {
    let text: String = text.chars().take(4500).collect();
    if provider == "deepl" {
        if key.trim().is_empty() {
            return Err("no_key".into());
        }
        let host = if key.trim().ends_with(":fx") { "api-free.deepl.com" } else { "api.deepl.com" };
        let lang = match target.as_str() {
            "en" => "EN-US".to_string(),
            "pt" => "PT-BR".to_string(),
            "zh-CN" => "ZH".to_string(),
            "zh-TW" => "ZH-HANT".to_string(),
            t => t.to_uppercase(),
        };
        let res = ureq::post(&format!("https://{}/v2/translate", host))
            .timeout(Duration::from_secs(10))
            .set("Authorization", &format!("DeepL-Auth-Key {}", key.trim()))
            .send_form(&[("text", text.as_str()), ("target_lang", lang.as_str())])
            .map_err(|e| match e {
                ureq::Error::Status(403, _) => "bad_key".to_string(),
                _ => "failed".to_string(),
            })?;
        let v: serde_json::Value = serde_json::from_str(&res.into_string().map_err(|_| "failed")?).map_err(|_| "failed")?;
        let t = &v["translations"][0];
        return Ok(serde_json::json!({ "text": t["text"], "from": t["detected_source_language"].as_str().unwrap_or("").to_lowercase() }));
    }
    let v = get_json(
        ureq::get("https://translate.googleapis.com/translate_a/single")
            .query("client", "gtx")
            .query("sl", "auto")
            .query("tl", &target)
            .query("dt", "t")
            .query("q", &text),
    )
    .ok_or("failed")?;
    let out: String = v[0].as_array().ok_or("failed")?.iter().filter_map(|p| p[0].as_str()).collect();
    Ok(serde_json::json!({ "text": out, "from": v[2] }))
}

// ---------------- Windows notifications ----------------
fn xml_unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

// The <text> elements of a toast payload, in order: the title first, then the body lines.
fn toast_texts(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find("<text") {
        rest = &rest[i + 5..];
        let Some(gt) = rest.find('>') else { break };
        let self_closed = rest[..gt].ends_with('/');
        rest = &rest[gt + 1..];
        if self_closed {
            continue;
        }
        let Some(end) = rest.find("</text>") else { break };
        let t = xml_unescape(rest[..end].trim());
        if !t.is_empty() {
            out.push(t);
        }
        rest = &rest[end + 7..];
    }
    out
}

// Some toasts name a link to open when clicked (<toast activationType="protocol" launch="app://...">).
fn toast_link(xml: &str) -> Option<String> {
    let start = xml.find("<toast")?;
    let tag = &xml[start..start + xml[start..].find('>')?];
    let attr = |name: &str| {
        let key = format!("{}=\"", name);
        let i = tag.find(&key)? + key.len();
        Some(xml_unescape(&tag[i..i + tag[i..].find('"')?]))
    };
    (attr("activationType")?.eq_ignore_ascii_case("protocol")).then(|| attr("launch")).flatten()
}

/// Opens a notification's link. The text comes from other apps, so schemes that can run or reach local files are refused.
#[tauri::command]
fn open_link(uri: String) {
    let scheme = uri.split(':').next().unwrap_or("").to_lowercase();
    let safe = uri.contains(':') && scheme.len() > 1 && scheme.chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c));
    if safe && !matches!(scheme.as_str(), "file" | "javascript" | "vbscript" | "data" | "ms-msdt" | "search-ms" | "search" | "shell") {
        let _ = Command::new("rundll32").args(["url.dll,FileProtocolHandler", &uri]).creation_flags(CREATE_NO_WINDOW).spawn();
    }
}

static NOTIFS_ON: AtomicBool = AtomicBool::new(false);

// Windows keeps the toasts it shows in this per-user database; it is only ever read, and nothing leaves the PC.
fn read_toasts(conn: &rusqlite::Connection, last: &mut i64, app: &tauri::AppHandle) -> rusqlite::Result<()> {
    let first = *last < 0;
    let sql = if first {
        "SELECT * FROM (SELECT n.Id, h.PrimaryId, n.Payload, n.ArrivalTime FROM Notification n LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId WHERE n.Type = 'toast' AND n.Id > ?1 ORDER BY n.Id DESC LIMIT 30) ORDER BY Id"
    } else {
        "SELECT n.Id, h.PrimaryId, n.Payload, n.ArrivalTime FROM Notification n LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId WHERE n.Type = 'toast' AND n.Id > ?1 ORDER BY n.Id"
    };
    let mut q = conn.prepare_cached(sql)?;
    let mut rows = q.query([*last])?;
    while let Some(r) = rows.next()? {
        let id: i64 = r.get(0)?;
        *last = (*last).max(id);
        let handler: String = r.get(1).unwrap_or_default();
        let payload = String::from_utf8_lossy(r.get_ref(2)?.as_bytes().unwrap_or(&[])).to_string();
        let texts = toast_texts(&payload);
        if texts.is_empty() {
            continue;
        }
        let filetime: i64 = r.get(3).unwrap_or(0);
        let _ = app.emit(
            "wnotif",
            serde_json::json!({
                "id": id, "handler": handler, "title": texts[0], "body": texts[1..].join("\n"), "launch": toast_link(&payload),
                "t": filetime / 10_000 - 11_644_473_600_000, "old": first
            }),
        );
    }
    if first {
        *last = (*last).max(0);
    }
    Ok(())
}

/// Called by the page once it is listening, so the backlog isn't emitted into the void.
#[tauri::command]
fn start_notifs(app: tauri::AppHandle) {
    use rusqlite::{Connection, OpenFlags};
    if NOTIFS_ON.swap(true, Ordering::Relaxed) {
        return;
    }
    let path = PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Microsoft/Windows/Notifications/wpndatabase.db");
    thread::spawn(move || {
        let mut conn: Option<Connection> = None;
        let mut last = -1i64;
        loop {
            if conn.is_none() {
                conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).ok();
                if let Some(c) = &conn {
                    let _ = c.busy_timeout(Duration::from_millis(500));
                }
            }
            if let Some(c) = &conn {
                if read_toasts(c, &mut last, &app).is_err() {
                    conn = None;
                }
            }
            thread::sleep(Duration::from_millis(1200));
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, sc, ev| {
                    if ev.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        return;
                    }
                    if CLIP_HOTKEY.lock().unwrap().as_ref() == Some(sc) {
                        let _ = app.emit("clip-key", "toggle");
                    } else if let Some((_, name)) = nav_shortcuts().into_iter().find(|(s, _)| s == sc) {
                        let _ = app.emit("clip-key", name);
                    }
                })
                .build(),
        )
        .manage(Helper(Mutex::new(None)))
        .manage(ClipStore(Mutex::new(Vec::new())))
        .manage(SysState(Mutex::new(SysData {
            sys: sysinfo::System::new(),
            nets: sysinfo::Networks::new_with_refreshed_list(),
            last: std::time::Instant::now(),
            gpu_at: None,
            gpu: None,
        })))
        .invoke_handler(tauri::generate_handler![
            sys_stats, lyrics, translate, start_notifs, list_apps, clip_pin_image, clip_preview, open_url, set_hotkey, nav_keys, take_focus, release_focus, open_link, set_hot_zone, get_autostart,
            clip_set_image, paste_text, paste_image,
            set_size, set_region, set_click_through, monitors, set_monitor, get_volume, set_volume, toggle_mute, set_visible, media_cmd,
            vol_key, clip_set, open_path, open_with, find_localsend, pick_exe, pick_files, file_thumb, get_location,
            open_settings,
            settings_changed, data_dir, set_autostart, start_drag, quit
        ])
        .setup(|app| {
            let win = app.get_webview_window("main").unwrap();
            if let Some(h) = hwnd_of(&win) {
                unsafe {
                    let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
                    SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize);
                    // no DWM border or rounded corners around the transparent window
                    let none: u32 = 0xFFFF_FFFE;
                    let _ = DwmSetWindowAttribute(h, DWMWA_BORDER_COLOR, &none as *const u32 as *const _, 4);
                    let pref = DWMWCP_DONOTROUND;
                    let _ = DwmSetWindowAttribute(h, DWMWA_WINDOW_CORNER_PREFERENCE, &pref as *const _ as *const _, 4);
                }
            }
            place(&win, (220.0, 14.0));
            // start as just the thin line so the opaque window never shows as a box before the page loads
            if let Some(h) = hwnd_of(&win) {
                let s = win.scale_factor().unwrap_or(1.0);
                let px = |v: f64| (v * s).round() as i32;
                apply_region(h, px(55.0), px(110.0), px(4.0), px(6.0));
            }
            keep_on_top(&win);

            // Hover zone: the cursor is polled so the closed island can have a generous hit area
            // without owning any screen space. `drag` is true while a mouse button is held.
            let w3 = win.clone();
            let app3 = app.handle().clone();
            thread::spawn(move || {
                let mut was = (false, false);
                loop {
                    thread::sleep(Duration::from_millis(16));
                    let (Ok(pos), Ok(size)) = (w3.outer_position(), w3.outer_size()) else { continue };
                    let s = w3.scale_factor().unwrap_or(1.0);
                    let mut p = POINT::default();
                    if unsafe { GetCursorPos(&mut p) }.is_err() {
                        continue;
                    }
                    let cx = pos.x + size.width as i32 / 2;
                    let half = (170.0 * s) as i32;
                    let hh = (22.0 * s) as i32;
                    let on = p.x >= cx - half && p.x <= cx + half && p.y >= pos.y && p.y <= pos.y + hh;
                    // `on` is the roomy zone (breathing, dragging files in); `touch` is the island's own shape, which opens it
                    let w = (HOT_W.load(Ordering::Relaxed) as f64 * s) as i32;
                    let h = (HOT_H.load(Ordering::Relaxed) as f64 * s) as i32;
                    let touch = (p.x - cx).abs() <= w / 2 + 1 && p.y >= pos.y && p.y <= pos.y + h + 1;
                    if (on, touch) != was {
                        was = (on, touch);
                        let down = unsafe { GetAsyncKeyState(0x01) } as u16 & 0x8000 != 0;
                        let _ = app3.emit("hot", serde_json::json!({ "on": on, "touch": touch, "drag": on && down }));
                    }
                }
            });

            let w2 = win.clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(1500));
                if w2.is_visible().unwrap_or(false) {
                    keep_on_top(&w2);
                }
            });

            // closing the settings window only hides it
            if let Some(sw) = app.get_webview_window("settings") {
                let sw2 = sw.clone();
                sw.on_window_event(move |e| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                        api.prevent_close();
                        let _ = sw2.hide();
                    }
                });
            }

            let settings_i = MenuItem::with_id(app, "settings", "Settings / Ayarlar", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit / Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_i, &quit_i])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DynIsland")
                .menu(&menu)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "quit" => app.exit(0),
                    "settings" => open_settings(app.clone()),
                    _ => {}
                })
                .build(app)?;

            // the exe was moved since autostart was turned on: point it at this copy
            thread::spawn(|| {
                if autostart_path().is_some_and(|p| !PathBuf::from(p).exists()) {
                    set_autostart(true);
                }
            });

            start_media_helper(app.handle().clone());
            start_clipboard_watcher(app.handle().clone());
            start_fullscreen_watcher(app.handle().clone());
            start_foreground_tracker();
            start_peak_meter(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DynIsland");
}
