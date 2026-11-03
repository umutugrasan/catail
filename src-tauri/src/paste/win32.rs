//! Keyboard state and foreground-window queries.

use std::path::Path;
use std::time::{Duration, Instant};

use windows::core::PWSTR;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VIRTUAL_KEY, VK_CONTROL, VK_ESCAPE, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

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
    // SAFETY: every handle is checked before use and closed before returning.
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let result = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(process);
        result.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        Path::new(&path)
            .file_name()
            .map(|name| name.to_string_lossy().to_lowercase())
    }
}
