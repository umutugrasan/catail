//! Keyboard state and foreground-window queries.

use std::time::{Duration, Instant};

use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VIRTUAL_KEY, VK_CONTROL, VK_ESCAPE, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

fn key_state(key: VIRTUAL_KEY) -> u16 {
    // SAFETY: plain Win32 query with no pointers involved.
    unsafe { GetAsyncKeyState(i32::from(key.0)) as u16 }
}

/// True if Esc is down or was pressed since the previous call.
pub fn esc_pressed() -> bool {
    key_state(VK_ESCAPE) & 0x8001 != 0
}

fn modifiers_down() -> bool {
    [VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN]
        .into_iter()
        .any(|k| key_state(k) & 0x8000 != 0)
}

/// Waits until the user lets go of the paste hotkey's modifiers. Otherwise our Ctrl+V
/// would arrive as Ctrl+Shift+Alt+V. Returns false on timeout.
pub fn wait_for_modifiers_released(timeout: Duration) -> bool {
    let start = Instant::now();
    while modifiers_down() {
        if start.elapsed() > timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    true
}

/// Lower-case executable name of the foreground window's process, e.g. `chrome.exe`.
pub fn foreground_process_name() -> Option<String> {
    // SAFETY: plain Win32 query.
    crate::process::window_process_name(unsafe { GetForegroundWindow() })
}
