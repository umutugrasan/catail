//! Shortcuts that use the Windows key. Windows keeps many Win combos for itself (Win+Shift+S
//! opens the Snipping Tool) and opens Start when Win is released, so `RegisterHotKey` can't be
//! used for them. A low-level keyboard hook sees the keys first: it swallows a bound combo
//! and sends a harmless dummy key so the shell doesn't open Start on release.

use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use tauri_plugin_global_shortcut::{Modifiers, Shortcut};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Threading::{
    GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    VIRTUAL_KEY, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_RCONTROL,
    VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, HC_ACTION, KBDLLHOOKSTRUCT,
    MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
};

/// Unassigned virtual key; pressing it with Win held means "not a Start-menu tap".
const VK_DUMMY: u16 = 0xE8;
/// Tags our own injected keys so the hook lets them through.
const INJECTED: usize = 0x4341_544C; // "CATL"
/// Keyboards repeat a held key at least this often (the longest Windows repeat delay is 1 s).
/// A down after a longer gap is a new press, even if the old press's key-up never reached us:
/// Windows skips a low-level hook that answers late, so a key-up can get lost.
const REPEAT_WINDOW_MS: u32 = 1200;

type Callback = Box<dyn Fn(String) + Send + Sync>;

static ON_SHORTCUT: OnceLock<Callback> = OnceLock::new();
static ON_RECORDED: OnceLock<Callback> = OnceLock::new();
/// Win shortcuts we handle, as accelerators parsed into `Shortcut`s.
static BOUND: Mutex<Vec<Shortcut>> = Mutex::new(Vec::new());
/// While the settings window records a shortcut, every Win combo goes to it instead.
static RECORDING: AtomicBool = AtomicBool::new(false);

thread_local! {
    /// Keys whose down we swallowed, with the time of their last event; their repeats and
    /// key-up are swallowed too.
    static SWALLOWED: RefCell<Vec<(u32, u32)>> = const { RefCell::new(Vec::new()) };
}

/// Installs the hook on its own thread. `on_shortcut` gets the accelerator of a bound combo,
/// `on_recorded` the accelerator pressed while recording; both run on the hook thread, so they
/// must return quickly.
pub fn start(
    on_shortcut: impl Fn(String) + Send + Sync + 'static,
    on_recorded: impl Fn(String) + Send + Sync + 'static,
) {
    if ON_SHORTCUT.set(Box::new(on_shortcut)).is_err() {
        return; // already started
    }
    let _ = ON_RECORDED.set(Box::new(on_recorded));
    std::thread::spawn(|| {
        // SAFETY: a low-level hook needs no module handle; the loop keeps it serviced.
        unsafe {
            // Windows passes a key on without us if the hook answers late, and then it opens
            // the Snipping Tool. This thread only ever answers the hook, and answers quickly.
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
            if let Err(e) = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), None, 0) {
                eprintln!("cannot install keyboard hook: {e}");
                return;
            }
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                DispatchMessageW(&msg);
            }
        }
    });
}

/// Replaces the Win shortcuts the hook acts on.
pub fn set_bound(shortcuts: Vec<Shortcut>) {
    *BOUND.lock().unwrap() = shortcuts;
}

pub fn set_recording(on: bool) {
    RECORDING.store(on, Ordering::SeqCst);
}

unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        // SAFETY: for HC_ACTION, `lparam` points to a KBDLLHOOKSTRUCT.
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let down = matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
        if info.dwExtraInfo != INJECTED && on_key(info.vkCode, down, info.time) {
            return LRESULT(1);
        }
    }
    // SAFETY: passing the event on unchanged.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// Returns true to swallow the key.
fn on_key(vk: u32, down: bool, time: u32) -> bool {
    let last = SWALLOWED.with_borrow(|keys| keys.iter().find(|k| k.0 == vk).map(|k| k.1));
    if !down {
        if last.is_some() {
            SWALLOWED.with_borrow_mut(|keys| keys.retain(|k| k.0 != vk));
        }
        return last.is_some();
    }
    if let Some(last) = last {
        if is_repeat(last, time) {
            // Auto-repeat of a combo already handled.
            SWALLOWED.with_borrow_mut(|keys| {
                keys.iter_mut()
                    .filter(|k| k.0 == vk)
                    .for_each(|k| k.1 = time);
            });
            return true;
        }
        SWALLOWED.with_borrow_mut(|keys| keys.retain(|k| k.0 != vk));
    }
    let recording = RECORDING.load(Ordering::SeqCst);
    if is_win(vk) {
        // While recording, Win on its own must not open Start and take the focus away.
        if recording {
            mask_start_menu();
        }
        return false;
    }
    if is_modifier(vk) || !held(VK_LWIN) && !held(VK_RWIN) {
        return false;
    }
    let Some(accelerator) = accelerator(vk) else {
        return false;
    };
    let callback = if recording {
        ON_RECORDED.get()
    } else {
        let bound = BOUND.lock().unwrap();
        let hit = accelerator
            .parse::<Shortcut>()
            .is_ok_and(|s| bound.contains(&s));
        if !hit {
            return false;
        }
        ON_SHORTCUT.get()
    };
    SWALLOWED.with_borrow_mut(|keys| keys.push((vk, time)));
    mask_start_menu();
    if let Some(callback) = callback {
        callback(accelerator);
    }
    true
}

/// Whether a down at `now` continues a press last seen at `last` (tick counts, which wrap).
fn is_repeat(last: u32, now: u32) -> bool {
    now.wrapping_sub(last) < REPEAT_WINDOW_MS
}

/// Presses and releases the dummy key, so releasing Win doesn't open Start.
fn mask_start_menu() {
    let key = |flags| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(VK_DUMMY),
                dwFlags: flags,
                dwExtraInfo: INJECTED,
                ..Default::default()
            },
        },
    };
    let inputs = [key(Default::default()), key(KEYEVENTF_KEYUP)];
    // SAFETY: `inputs` is a valid array of keyboard inputs.
    unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
}

fn held(vk: VIRTUAL_KEY) -> bool {
    // SAFETY: plain key state query.
    unsafe { GetAsyncKeyState(vk.0 as i32) < 0 }
}

fn is_win(vk: u32) -> bool {
    vk == VK_LWIN.0 as u32 || vk == VK_RWIN.0 as u32
}

fn is_modifier(vk: u32) -> bool {
    [
        VK_SHIFT,
        VK_LSHIFT,
        VK_RSHIFT,
        VK_CONTROL,
        VK_LCONTROL,
        VK_RCONTROL,
        VK_MENU,
        VK_LMENU,
        VK_RMENU,
    ]
    .iter()
    .any(|m| m.0 as u32 == vk)
}

/// The accelerator for `vk` with the modifiers held now (Win is known to be down), in the
/// global-shortcut plugin's format, e.g. `shift+super+KeyS`.
fn accelerator(vk: u32) -> Option<String> {
    let key = key_name(vk)?;
    let mut parts = Vec::new();
    if held(VK_CONTROL) {
        parts.push("control");
    }
    if held(VK_SHIFT) {
        parts.push("shift");
    }
    if held(VK_MENU) {
        parts.push("alt");
    }
    parts.push("super");
    Some(format!("{}+{key}", parts.join("+")))
}

/// Plugin key name (`KeyboardEvent.code` style) for the keys a shortcut may end in.
fn key_name(vk: u32) -> Option<String> {
    let name = match vk {
        0x41..=0x5A => format!("Key{}", char::from(vk as u8)),
        0x30..=0x39 => format!("Digit{}", vk - 0x30),
        0x60..=0x69 => format!("Numpad{}", vk - 0x60),
        0x70..=0x87 => format!("F{}", vk - 0x6F),
        _ => {
            let fixed = match vk {
                0x08 => "Backspace",
                0x09 => "Tab",
                0x0D => "Enter",
                0x13 => "Pause",
                0x20 => "Space",
                0x21 => "PageUp",
                0x22 => "PageDown",
                0x23 => "End",
                0x24 => "Home",
                0x25 => "ArrowLeft",
                0x26 => "ArrowUp",
                0x27 => "ArrowRight",
                0x28 => "ArrowDown",
                0x2C => "PrintScreen",
                0x2D => "Insert",
                0x2E => "Delete",
                _ => return None,
            };
            fixed.to_owned()
        }
    };
    Some(name)
}

/// Whether `shortcut` has to go through the hook instead of `RegisterHotKey`.
pub fn needs_hook(shortcut: &Shortcut) -> bool {
    shortcut.mods.contains(Modifiers::SUPER)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_names_match_the_plugin() {
        for (vk, name) in [
            (0x53, "KeyS"),
            (0x31, "Digit1"),
            (0x70, "F1"),
            (0x87, "F24"),
            (0x2C, "PrintScreen"),
        ] {
            let name_of = key_name(vk).unwrap();
            assert_eq!(name_of, name);
            assert!(format!("shift+super+{name_of}").parse::<Shortcut>().is_ok());
        }
        assert_eq!(key_name(0xE8), None);
    }

    #[test]
    fn a_long_gap_means_a_new_press() {
        // Held key: the first repeat comes after the repeat delay (up to 1 s).
        assert!(is_repeat(5_000, 5_000));
        assert!(is_repeat(5_000, 6_000));
        // The key-up was lost and the user pressed again later.
        assert!(!is_repeat(5_000, 6_200));
        assert!(!is_repeat(5_000, 60_000));
        // The tick count wraps after about 49 days.
        assert!(is_repeat(u32::MAX - 100, 200));
        assert!(!is_repeat(u32::MAX - 100, 2_000));
    }

    #[test]
    fn win_shift_s_parses_either_way() {
        let a: Shortcut = "shift+super+KeyS".parse().unwrap();
        let b: Shortcut = "super+shift+KeyS".parse().unwrap();
        assert_eq!(a, b);
        assert!(needs_hook(&a));
        assert!(!needs_hook(&"shift+alt+KeyS".parse().unwrap()));
    }
}
