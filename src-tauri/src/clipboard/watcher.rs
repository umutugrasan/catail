//! Clipboard change listener. Only registered while the queue has items, so nothing the
//! user copies is looked at otherwise.

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::OnceLock;

use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::{
    AddClipboardFormatListener, RemoveClipboardFormatListener,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, PostMessageW, RegisterClassW,
    HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_CLIPBOARDUPDATE, WNDCLASSW,
};

const WM_SYNC_LISTENER: u32 = WM_APP + 1;

static ON_CHANGE: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();
static WINDOW: AtomicIsize = AtomicIsize::new(0);
/// What the caller wants; applied on the watcher thread.
static WANT_ACTIVE: AtomicBool = AtomicBool::new(false);
static LISTENING: AtomicBool = AtomicBool::new(false);

/// Starts the watcher thread. `on_change` runs on that thread for every clipboard update
/// while active.
pub fn start(on_change: impl Fn() + Send + Sync + 'static) {
    if ON_CHANGE.set(Box::new(on_change)).is_err() {
        return; // already started
    }
    std::thread::spawn(|| {
        if let Err(e) = run() {
            eprintln!("clipboard watcher stopped: {e}");
        }
    });
}

/// Starts or stops listening. Safe on any thread.
pub fn set_active(active: bool) {
    WANT_ACTIVE.store(active, Ordering::SeqCst);
    let hwnd = WINDOW.load(Ordering::SeqCst);
    if hwnd != 0 {
        // SAFETY: the message-only window lives for the whole process.
        let _ = unsafe {
            PostMessageW(
                Some(HWND(hwnd as *mut _)),
                WM_SYNC_LISTENER,
                WPARAM(0),
                LPARAM(0),
            )
        };
    }
}

fn run() -> windows::core::Result<()> {
    // SAFETY: standard message-only window setup; the class and window outlive the loop.
    unsafe {
        let instance = GetModuleHandleW(None)?;
        let class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance.into(),
            lpszClassName: w!("StackScreenClipboardWatcher"),
            ..Default::default()
        };
        RegisterClassW(&class);
        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class.lpszClassName,
            w!(""),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance.into()),
            None,
        )?;
        WINDOW.store(hwnd.0 as isize, Ordering::SeqCst);
        sync_listener(hwnd);

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            DispatchMessageW(&msg);
        }
    }
    Ok(())
}

fn sync_listener(hwnd: HWND) {
    let want = WANT_ACTIVE.load(Ordering::SeqCst);
    if want == LISTENING.load(Ordering::SeqCst) {
        return;
    }
    // SAFETY: `hwnd` is our message-only window.
    let result = unsafe {
        if want {
            AddClipboardFormatListener(hwnd)
        } else {
            RemoveClipboardFormatListener(hwnd)
        }
    };
    if result.is_ok() {
        LISTENING.store(want, Ordering::SeqCst);
    }
}

extern "system" fn window_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_CLIPBOARDUPDATE => {
            if let Some(on_change) = ON_CHANGE.get() {
                on_change();
            }
            LRESULT(0)
        }
        WM_SYNC_LISTENER => {
            sync_listener(hwnd);
            LRESULT(0)
        }
        // SAFETY: default handling for everything else.
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}
