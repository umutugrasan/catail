//! Global hotkey registration and dispatch.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

use crate::capture::{fullscreen, region};
use crate::i18n::{t, t_with};
use crate::{notify, paste, queue};

#[derive(Debug, Clone, Copy)]
enum Action {
    CaptureRegion,
    CaptureFullScreen,
    PasteQueue,
    ClearQueue,
    UndoLast,
}

/// Default bindings. Never plain Ctrl+Alt (AltGr on Turkish keyboards) or Ctrl+Shift+V
/// (paste-as-plain-text in many apps).
fn bindings() -> [(Shortcut, &'static str, Action); 5] {
    let csa = Modifiers::CONTROL | Modifiers::SHIFT | Modifiers::ALT;
    [
        (
            Shortcut::new(None, Code::PrintScreen),
            "PrintScreen",
            Action::CaptureRegion,
        ),
        (
            Shortcut::new(Some(Modifiers::SHIFT), Code::PrintScreen),
            "Shift+PrintScreen",
            Action::CaptureFullScreen,
        ),
        (
            Shortcut::new(Some(csa), Code::KeyV),
            "Ctrl+Shift+Alt+V",
            Action::PasteQueue,
        ),
        (
            Shortcut::new(Some(csa), Code::KeyX),
            "Ctrl+Shift+Alt+X",
            Action::ClearQueue,
        ),
        (
            Shortcut::new(Some(csa), Code::KeyZ),
            "Ctrl+Shift+Alt+Z",
            Action::UndoLast,
        ),
    ]
}

/// Plain Ctrl+V, taken over only while the queue has items so it pastes the whole queue.
fn queue_paste_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL), Code::KeyV)
}

/// Global shortcut handler. Runs on the main thread, so real work goes to a worker.
pub fn handle<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    #[cfg(debug_assertions)]
    eprintln!("hotkey {} {:?}", shortcut.into_string(), event.state);
    if event.state != ShortcutState::Pressed {
        return;
    }
    let action = if *shortcut == queue_paste_shortcut() {
        Action::PasteQueue
    } else if let Some((_, _, action)) = bindings().into_iter().find(|(s, _, _)| s == shortcut) {
        action
    } else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || match action {
        Action::CaptureRegion => region::start(&app),
        Action::CaptureFullScreen => fullscreen::capture(&app),
        Action::PasteQueue => paste::run(&app),
        Action::ClearQueue => queue::clear(&app),
        Action::UndoLast => queue::undo_last(&app),
    });
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

/// Registers the default shortcuts and tells the user (via toast) about any that failed.
pub fn register_defaults<R: Runtime>(app: &AppHandle<R>) {
    for (shortcut, name, _) in bindings() {
        let result = app.global_shortcut().register(shortcut);
        #[cfg(debug_assertions)]
        eprintln!("register {name}: {result:?}");
        if let Err(e) = result {
            eprintln!("cannot register {name}: {e}");
            let body = t_with("notify.hotkey_failed_body", &[("shortcut", name)]);
            notify::show(app, &t("notify.hotkey_failed_title"), &body);
        }
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
