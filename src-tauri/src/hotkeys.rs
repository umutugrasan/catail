//! Global hotkey registration and dispatch.

use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

use crate::capture::{fullscreen, region};
use crate::i18n::{t, t_with};
use crate::notify;

fn region_shortcut() -> Shortcut {
    Shortcut::new(None, Code::PrintScreen)
}

fn fullscreen_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::SHIFT), Code::PrintScreen)
}

/// Global shortcut handler. Runs on the main thread, so real work goes to a worker.
pub fn handle<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut, event: ShortcutEvent) {
    #[cfg(debug_assertions)]
    eprintln!("hotkey {} {:?}", shortcut.into_string(), event.state);
    if event.state != ShortcutState::Pressed {
        return;
    }
    let app = app.clone();
    if *shortcut == region_shortcut() {
        std::thread::spawn(move || region::start(&app));
    } else if *shortcut == fullscreen_shortcut() {
        std::thread::spawn(move || fullscreen::capture_to_clipboard(&app));
    }
}

/// Registers the default shortcuts and tells the user (via toast) about any that failed.
pub fn register_defaults<R: Runtime>(app: &AppHandle<R>) {
    let shortcuts = [
        (region_shortcut(), "PrintScreen"),
        (fullscreen_shortcut(), "Shift+PrintScreen"),
    ];
    for (shortcut, name) in shortcuts {
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
