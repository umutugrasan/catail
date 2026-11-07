//! Global hotkey registration and dispatch. Bindings come from the settings
//! (`HotkeyMap`); Ctrl+V while the queue has items is fixed. Shortcuts with the Windows key
//! go through `winkeys` (a keyboard hook) instead of the plugin.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

use crate::capture::{fullscreen, region};
use crate::i18n::{t, t_with};
use crate::settings::HotkeyMap;
use crate::state::AppState;
use crate::{notify, paste, queue};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Action {
    CaptureRegion,
    CaptureFullScreen,
    PasteQueue,
    ClearQueue,
    UndoLast,
}

/// Why a shortcut can't be used; shown in the settings window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HotkeyError {
    Invalid(String),
    /// Ctrl+Alt alone is AltGr on Turkish and many other keyboards.
    AltGr(String),
    /// Ctrl+C/V/X/Z/Y/A (also with Shift) belong to the apps.
    Reserved(String),
    /// A plain letter, digit or space would block typing it everywhere.
    NeedsModifier(String),
    Duplicate(String),
    /// Another program already holds it.
    Taken(String),
}

impl HotkeyError {
    pub fn message(&self) -> String {
        let (key, shortcut) = match self {
            Self::Invalid(s) => ("settings.hotkey_invalid", s),
            Self::AltGr(s) => ("settings.hotkey_altgr", s),
            Self::Reserved(s) => ("settings.hotkey_reserved", s),
            Self::NeedsModifier(s) => ("settings.hotkey_needs_modifier", s),
            Self::Duplicate(s) => ("settings.hotkey_duplicate", s),
            Self::Taken(s) => ("settings.hotkey_taken", s),
        };
        t_with(key, &[("shortcut", &pretty(shortcut))])
    }
}

const RESERVED_WITH_CTRL: [Code; 6] = [
    Code::KeyC,
    Code::KeyV,
    Code::KeyX,
    Code::KeyZ,
    Code::KeyY,
    Code::KeyA,
];

fn is_typing_key(code: Code) -> bool {
    let name = format!("{code:?}");
    let letter_or_digit = (name.starts_with("Key") && name.len() == 4)
        || (name.starts_with("Digit") && name.len() == 6);
    letter_or_digit || code == Code::Space
}

/// Parses and vets one shortcut string such as `control+shift+alt+KeyV`.
pub fn validate(accelerator: &str) -> Result<Shortcut, HotkeyError> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|_| HotkeyError::Invalid(accelerator.to_owned()))?;
    let mods = shortcut.mods;
    if mods == Modifiers::CONTROL | Modifiers::ALT {
        return Err(HotkeyError::AltGr(accelerator.to_owned()));
    }
    let ctrl_like = mods == Modifiers::CONTROL || mods == Modifiers::CONTROL | Modifiers::SHIFT;
    if ctrl_like && RESERVED_WITH_CTRL.contains(&shortcut.key) {
        return Err(HotkeyError::Reserved(accelerator.to_owned()));
    }
    let plain = mods.is_empty() || mods == Modifiers::SHIFT;
    if plain && is_typing_key(shortcut.key) {
        return Err(HotkeyError::NeedsModifier(accelerator.to_owned()));
    }
    Ok(shortcut)
}

fn bindings(map: &HotkeyMap) -> Result<Vec<(Shortcut, Action, String)>, HotkeyError> {
    let entries = [
        (&map.region, Action::CaptureRegion),
        (&map.fullscreen, Action::CaptureFullScreen),
        (&map.paste, Action::PasteQueue),
        (&map.clear, Action::ClearQueue),
        (&map.undo, Action::UndoLast),
    ];
    let mut out: Vec<(Shortcut, Action, String)> = Vec::new();
    for (accelerator, action) in entries {
        let shortcut = validate(accelerator)?;
        if out.iter().any(|(s, _, _)| *s == shortcut) {
            return Err(HotkeyError::Duplicate(accelerator.clone()));
        }
        out.push((shortcut, action, accelerator.clone()));
    }
    Ok(out)
}

/// Shortcuts currently registered for our actions (Ctrl+V for the queue is separate).
static ACTIVE: Mutex<Vec<(Shortcut, Action)>> = Mutex::new(Vec::new());

/// Plain Ctrl+V, taken over only while the queue has items so it pastes the whole queue.
fn queue_paste_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyV)
}

/// Sent to the settings window with the accelerator of a Win combo pressed while recording
/// (the webview never sees those keys).
pub const EVENT_RECORDED: &str = "settings:hotkey-recorded";

/// Global shortcut handler. Runs on the main thread, so real work goes to a worker.
pub fn handle<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    #[cfg(debug_assertions)]
    eprintln!("hotkey {} {:?}", shortcut.into_string(), event.state);
    if event.state == ShortcutState::Pressed {
        fire(app, shortcut);
    }
}

fn fire<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut) {
    #[cfg(windows)]
    crate::winkeys::diag(format!("fire {}", shortcut.into_string())); // TEMP-DIAG
    let action = if *shortcut == queue_paste_shortcut() {
        Some(Action::PasteQueue)
    } else {
        let active = ACTIVE.lock().unwrap();
        active.iter().find(|(s, _)| s == shortcut).map(|(_, a)| *a)
    };
    let Some(action) = action else { return };
    let app = app.clone();
    std::thread::spawn(move || match action {
        Action::CaptureRegion => region::start(&app),
        Action::CaptureFullScreen => fullscreen::capture(&app),
        Action::PasteQueue => paste::run(&app),
        Action::ClearQueue => queue::clear(&app),
        Action::UndoLast => queue::undo_last(&app),
    });
}

/// Starts the Windows-key hook; its shortcuts fire like the plugin's.
#[cfg(windows)]
pub fn start_hook<R: Runtime>(app: &AppHandle<R>) {
    let on_shortcut = app.clone();
    let on_recorded = app.clone();
    // Both callbacks run inside the hook, which must answer quickly: hand off to a worker.
    crate::winkeys::start(
        move |accelerator| {
            let app = on_shortcut.clone();
            std::thread::spawn(move || {
                if let Ok(shortcut) = accelerator.parse::<Shortcut>() {
                    fire(&app, &shortcut);
                }
            });
        },
        move |accelerator| {
            let app = on_recorded.clone();
            std::thread::spawn(move || {
                let _ = app.emit_to("settings", EVENT_RECORDED, accelerator);
            });
        },
    );
}

fn via_hook(shortcut: &Shortcut) -> bool {
    #[cfg(windows)]
    return crate::winkeys::needs_hook(shortcut);
    #[cfg(not(windows))]
    return {
        let _ = shortcut;
        false
    };
}

/// Win shortcuts are handled by the hook, everything else by `RegisterHotKey`.
fn register<R: Runtime>(app: &AppHandle<R>, shortcut: Shortcut) -> Result<(), String> {
    if via_hook(&shortcut) {
        return Ok(());
    }
    app.global_shortcut()
        .register(shortcut)
        .map_err(|e| e.to_string())
}

fn unregister<R: Runtime>(app: &AppHandle<R>, shortcut: Shortcut) {
    if !via_hook(&shortcut) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

/// Tells the hook which Win shortcuts are live.
fn sync_hook(active: &[(Shortcut, Action)]) {
    #[cfg(windows)]
    crate::winkeys::set_bound(
        active
            .iter()
            .map(|(s, _)| *s)
            .filter(crate::winkeys::needs_hook)
            .collect(),
    );
    #[cfg(not(windows))]
    let _ = active;
}

fn unregister_active<R: Runtime>(app: &AppHandle<R>) {
    let mut active = ACTIVE.lock().unwrap();
    for (shortcut, _) in active.drain(..) {
        unregister(app, shortcut);
    }
    sync_hook(&active);
}

/// Switches to `map`, all or nothing: if any shortcut can't be registered, `previous` is
/// restored and the error says which. Must not run on the main thread.
pub fn apply<R: Runtime>(
    app: &AppHandle<R>,
    map: &HotkeyMap,
    previous: &HotkeyMap,
) -> Result<(), HotkeyError> {
    let next = bindings(map)?;
    #[cfg(windows)]
    crate::winkeys::diag(format!("apply {}", map.region)); // TEMP-DIAG
    unregister_active(app);
    let mut registered = Vec::new();
    for (shortcut, action, accelerator) in &next {
        if register(app, *shortcut).is_err() {
            for (s, _) in &registered {
                unregister(app, *s);
            }
            register_best_effort(app, previous);
            return Err(HotkeyError::Taken(accelerator.clone()));
        }
        registered.push((*shortcut, *action));
    }
    sync_hook(&registered);
    *ACTIVE.lock().unwrap() = registered;
    Ok(())
}

/// Registers what it can (falling back to the defaults if `map` is invalid) and returns the
/// accelerators that failed.
fn register_best_effort<R: Runtime>(app: &AppHandle<R>, map: &HotkeyMap) -> Vec<String> {
    let Ok(next) = bindings(map).or_else(|_| bindings(&HotkeyMap::default())) else {
        return Vec::new();
    };
    let mut failed = Vec::new();
    let mut active = ACTIVE.lock().unwrap();
    for (shortcut, action, accelerator) in next {
        let result = register(app, shortcut);
        #[cfg(debug_assertions)]
        eprintln!("register {accelerator}: {result:?}");
        match result {
            Ok(()) => active.push((shortcut, action)),
            Err(_) => failed.push(accelerator),
        }
    }
    sync_hook(&active);
    failed
}

/// Lets the settings window record a shortcut that is currently bound (e.g. PrintScreen):
/// while suspended, no global shortcut swallows the keys. Must not run on the main thread.
pub fn suspend<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    crate::winkeys::diag("suspend".into()); // TEMP-DIAG
    unregister_active(app);
    #[cfg(windows)]
    crate::winkeys::set_recording(true);
}

pub fn resume<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(windows)]
    crate::winkeys::diag("resume".into()); // TEMP-DIAG
    #[cfg(windows)]
    crate::winkeys::set_recording(false);
    if ACTIVE.lock().unwrap().is_empty() {
        let map = app
            .state::<AppState>()
            .settings
            .lock()
            .unwrap()
            .hotkeys
            .clone();
        register_best_effort(app, &map);
    }
}

/// `control+shift+alt+KeyV` → `Ctrl+Shift+Alt+V`, for messages.
pub fn pretty(accelerator: &str) -> String {
    accelerator
        .split('+')
        .map(|part| match part.to_ascii_lowercase().as_str() {
            "control" | "ctrl" => "Ctrl".to_owned(),
            "shift" => "Shift".to_owned(),
            "alt" => "Alt".to_owned(),
            "super" => "Win".to_owned(),
            _ => part
                .strip_prefix("Key")
                .or_else(|| part.strip_prefix("Digit"))
                .unwrap_or(part)
                .to_owned(),
        })
        .collect::<Vec<_>>()
        .join("+")
}

/// Whether Ctrl+V should paste the queue. Applied on a worker thread because the plugin
/// (un)registers on the main thread and waits for it.
static QUEUE_PASTE_WANTED: AtomicBool = AtomicBool::new(false);
/// Whether Ctrl+V is currently registered; the lock also serializes changes.
static QUEUE_PASTE_REGISTERED: Mutex<bool> = Mutex::new(false);

/// Takes over (or releases) Ctrl+V. Safe on any thread; the last call wins.
pub fn set_queue_paste<R: Runtime>(app: &AppHandle<R>, on: bool) {
    QUEUE_PASTE_WANTED.store(on, Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || apply_queue_paste(&app));
}

/// Releases Ctrl+V and returns once it is released, so the paste engine's own Ctrl+V reaches
/// the target app. Must run on a worker thread.
pub fn suspend_queue_paste<R: Runtime>(app: &AppHandle<R>) {
    QUEUE_PASTE_WANTED.store(false, Ordering::SeqCst);
    apply_queue_paste(app);
}

fn apply_queue_paste<R: Runtime>(app: &AppHandle<R>) {
    let mut registered = QUEUE_PASTE_REGISTERED.lock().unwrap();
    let want = QUEUE_PASTE_WANTED.load(Ordering::SeqCst);
    if want == *registered {
        return;
    }
    let shortcuts = app.global_shortcut();
    let result = if want {
        shortcuts.register(queue_paste_shortcut())
    } else {
        shortcuts.unregister(queue_paste_shortcut())
    };
    match result {
        Ok(()) => *registered = want,
        Err(e) => eprintln!(
            "cannot {} Ctrl+V: {e}",
            if want { "register" } else { "release" }
        ),
    }
}

/// Registers the saved shortcuts at startup and tells the user (via toast) about any that
/// failed.
pub fn register_saved<R: Runtime>(app: &AppHandle<R>) {
    let map = app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .hotkeys
        .clone();
    for accelerator in register_best_effort(app, &map) {
        eprintln!("cannot register {accelerator}");
        let body = t_with(
            "notify.hotkey_failed_body",
            &[("shortcut", &pretty(&accelerator))],
        );
        notify::show(app, &t("notify.hotkey_failed_title"), &body);
    }

    #[cfg(windows)]
    if win::snipping_tool_owns_print_screen() {
        notify::show(app, &t("notify.snipping_title"), &t("notify.snipping_body"));
    }
}

#[cfg(windows)]
mod win {
    use windows::core::w;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
    };

    /// Windows 11 build where "Print Screen opens Snipping Tool" became the default.
    const SNIPPING_DEFAULT_ON_BUILD: u32 = 22621;

    /// Whether Windows itself handles PrintScreen ("Use the Print screen key to open
    /// screen capture"). The setting is only stored once the user has changed it.
    pub fn snipping_tool_owns_print_screen() -> bool {
        match read_dword(
            w!(r"Control Panel\Keyboard"),
            w!("PrintScreenKeyForSnippingEnabled"),
        ) {
            Some(value) => value != 0,
            None => windows_build().is_some_and(|b| b >= SNIPPING_DEFAULT_ON_BUILD),
        }
    }

    fn read_dword(subkey: windows::core::PCWSTR, value: windows::core::PCWSTR) -> Option<u32> {
        let mut data = 0u32;
        let mut size = size_of::<u32>() as u32;
        // SAFETY: `data`/`size` are valid for writes and sized for a DWORD.
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                subkey,
                value,
                RRF_RT_REG_DWORD,
                None,
                Some((&raw mut data).cast()),
                Some(&mut size),
            )
        };
        (status == ERROR_SUCCESS).then_some(data)
    }

    fn windows_build() -> Option<u32> {
        let mut buf = [0u16; 32];
        let mut size = size_of_val(&buf) as u32;
        // SAFETY: `buf`/`size` describe a writable UTF-16 buffer.
        let status = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"),
                w!("CurrentBuildNumber"),
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if status != ERROR_SUCCESS {
            return None;
        }
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16(&buf[..len]).ok()?.trim().parse().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid_and_distinct() {
        assert_eq!(bindings(&HotkeyMap::default()).unwrap().len(), 5);
    }

    #[test]
    fn rejects_unsafe_shortcuts() {
        assert!(matches!(
            validate("control+alt+KeyQ"),
            Err(HotkeyError::AltGr(_))
        ));
        assert!(matches!(
            validate("control+KeyV"),
            Err(HotkeyError::Reserved(_))
        ));
        assert!(matches!(
            validate("control+shift+KeyV"),
            Err(HotkeyError::Reserved(_))
        ));
        assert!(matches!(
            validate("KeyQ"),
            Err(HotkeyError::NeedsModifier(_))
        ));
        assert!(matches!(
            validate("shift+Digit1"),
            Err(HotkeyError::NeedsModifier(_))
        ));
        assert!(matches!(
            validate("nonsense+++"),
            Err(HotkeyError::Invalid(_))
        ));
    }

    #[test]
    fn accepts_sensible_shortcuts() {
        for ok in [
            "PrintScreen",
            "F9",
            "alt+KeyQ",
            "control+shift+KeyQ",
            "control+alt+shift+KeyV",
            "Pause",
            "shift+super+KeyS",
        ] {
            assert!(validate(ok).is_ok(), "{ok} should be accepted");
        }
    }

    #[test]
    fn duplicates_are_rejected() {
        let map = HotkeyMap {
            fullscreen: "PrintScreen".into(),
            ..HotkeyMap::default()
        };
        assert!(matches!(bindings(&map), Err(HotkeyError::Duplicate(_))));
    }

    #[test]
    fn pretty_names() {
        assert_eq!(pretty("control+shift+alt+KeyV"), "Ctrl+Shift+Alt+V");
        assert_eq!(pretty("shift+PrintScreen"), "Shift+PrintScreen");
    }
}
