//! Windows clipboard + keystroke plumbing for the paste spike.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE};

use crate::formats::{build_dib, build_hdrop};

const CF_BITMAP: u32 = 2;
const CF_METAFILEPICT: u32 = 3;
const CF_PALETTE: u32 = 9;
const CF_DIB: u32 = 8;
const CF_ENHMETAFILE: u32 = 14;
const CF_HDROP: u32 = 15;
const CF_OWNERDISPLAY: u32 = 0x80;
const CF_DSPBITMAP: u32 = 0x82;
const CF_DSPMETAFILEPICT: u32 = 0x83;
const CF_DSPENHMETAFILE: u32 = 0x8E;
const CF_PRIVATE_FIRST: u32 = 0x200;
const CF_GDIOBJ_LAST: u32 = 0x3FF;
const DROPEFFECT_COPY: u32 = 1;
const VK_V: u32 = 0x56;

pub enum Outcome {
    Done(usize),
    Cancelled(usize),
}

/// Mode A: one CF_HDROP file list, one Ctrl+V.
pub fn paste_batch(files: &[PathBuf], restore_delay: Duration) -> Result<Outcome> {
    let _guard = ClipboardGuard::capture()?;

    let paths: Vec<&Path> = files.iter().map(PathBuf::as_path).collect();
    let preferred_effect = register_format(w!("Preferred DropEffect"))?;
    set_clipboard(&[
        (CF_HDROP, build_hdrop(&paths)),
        (preferred_effect, DROPEFFECT_COPY.to_le_bytes().to_vec()),
    ])?;

    send_ctrl_v()?;
    // The target reads the clipboard asynchronously; restoring too early would paste the old content.
    std::thread::sleep(restore_delay);
    Ok(Outcome::Done(files.len()))
}

/// Mode B: each image goes on the clipboard on its own, followed by Ctrl+V. Esc aborts.
pub fn paste_sequential(files: &[PathBuf], delay: Duration) -> Result<Outcome> {
    let _guard = ClipboardGuard::capture()?;
    let png_format = register_format(w!("PNG"))?;

    // Reading clears the "pressed since last call" bit so an earlier Esc doesn't cancel us.
    esc_pressed();

    for (i, file) in files.iter().enumerate() {
        if esc_pressed() {
            return Ok(Outcome::Cancelled(i));
        }
        let png = std::fs::read(file).with_context(|| format!("cannot read {}", file.display()))?;
        let rgba = image::load_from_memory(&png)
            .with_context(|| format!("cannot decode {}", file.display()))?
            .to_rgba8();
        // CF_DIB for classic apps, "PNG" for browsers/Electron apps that prefer it.
        set_clipboard(&[(CF_DIB, build_dib(&rgba)), (png_format, png)])?;
        send_ctrl_v()?;
        std::thread::sleep(delay);
    }
    Ok(Outcome::Done(files.len()))
}

fn esc_pressed() -> bool {
    // SAFETY: plain Win32 query with no pointers involved.
    let state = unsafe { GetAsyncKeyState(i32::from(VK_ESCAPE.0)) } as u16;
    state & 0x8001 != 0
}

fn send_ctrl_v() -> Result<()> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| anyhow!("enigo init: {e}"))?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| anyhow!("press Ctrl: {e}"))?;
    // Raw VK code: layout independent, unlike Key::Unicode('v').
    let v = enigo.key(Key::Other(VK_V), Direction::Click);
    // Always release Ctrl, even if the V click failed, so the keyboard isn't left stuck.
    let release = enigo.key(Key::Control, Direction::Release);
    v.map_err(|e| anyhow!("click V: {e}"))?;
    release.map_err(|e| anyhow!("release Ctrl: {e}"))?;
    Ok(())
}

fn register_format(name: PCWSTR) -> Result<u32> {
    // SAFETY: `name` comes from the `w!` macro, a static NUL-terminated UTF-16 literal.
    match unsafe { RegisterClipboardFormatW(name) } {
        0 => Err(anyhow!("RegisterClipboardFormatW({}) failed", unsafe {
            name.display()
        })),
        id => Ok(id),
    }
}

/// RAII handle for an opened clipboard; closes it on drop.
struct OpenClipboardGuard;

impl OpenClipboardGuard {
    fn open() -> Result<Self> {
        // Another process may briefly hold the clipboard; retry for ~500 ms.
        for _ in 0..25 {
            if unsafe { OpenClipboard(None) }.is_ok() {
                return Ok(Self);
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        Err(anyhow!("clipboard is busy (OpenClipboard kept failing)"))
    }
}

impl Drop for OpenClipboardGuard {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

/// Copy of every memory-backed clipboard format at the time of capture.
struct ClipboardSnapshot {
    formats: Vec<(u32, Vec<u8>)>,
}

impl ClipboardSnapshot {
    fn capture() -> Result<Self> {
        let _open = OpenClipboardGuard::open()?;
        let mut formats = Vec::new();
        let mut format = 0;
        loop {
            format = unsafe { EnumClipboardFormats(format) };
            if format == 0 {
                break;
            }
            if !is_memory_format(format) {
                continue;
            }
            let Ok(handle) = (unsafe { GetClipboardData(format) }) else {
                continue; // delayed rendering failed; nothing to keep
            };
            if let Some(bytes) = unsafe { read_global(HGLOBAL(handle.0)) } {
                formats.push((format, bytes));
            }
        }
        Ok(Self { formats })
    }

    fn restore(&self) -> Result<()> {
        set_clipboard(&self.formats)
    }
}

/// Restores the user's clipboard when dropped, including on error and panic paths.
struct ClipboardGuard {
    snapshot: ClipboardSnapshot,
}

impl ClipboardGuard {
    fn capture() -> Result<Self> {
        Ok(Self {
            snapshot: ClipboardSnapshot::capture()?,
        })
    }
}

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        if let Err(e) = self.snapshot.restore() {
            eprintln!("warning: could not restore previous clipboard: {e:#}");
        }
    }
}

/// GDI-handle formats (bitmaps, metafiles, palettes) aren't HGLOBALs and can't be byte-copied.
/// Windows re-synthesizes CF_BITMAP from CF_DIB, so skipping it loses nothing.
fn is_memory_format(format: u32) -> bool {
    !matches!(
        format,
        CF_BITMAP
            | CF_METAFILEPICT
            | CF_PALETTE
            | CF_ENHMETAFILE
            | CF_OWNERDISPLAY
            | CF_DSPBITMAP
            | CF_DSPMETAFILEPICT
            | CF_DSPENHMETAFILE
    ) && !(CF_PRIVATE_FIRST..=CF_GDIOBJ_LAST).contains(&format)
}

/// Empties the clipboard and writes each `(format, bytes)` pair.
fn set_clipboard(items: &[(u32, Vec<u8>)]) -> Result<()> {
    let _open = OpenClipboardGuard::open()?;
    unsafe { EmptyClipboard() }.context("EmptyClipboard")?;
    for (format, bytes) in items {
        let mem = unsafe { alloc_global(bytes) }?;
        // On success the system owns `mem`; on failure we must free it.
        if unsafe { SetClipboardData(*format, Some(HANDLE(mem.0))) }.is_err() {
            let _ = unsafe { GlobalFree(Some(mem)) };
            return Err(anyhow!("SetClipboardData({format}) failed"));
        }
    }
    Ok(())
}

/// # Safety
/// `handle` must be an HGLOBAL obtained from the open clipboard.
unsafe fn read_global(handle: HGLOBAL) -> Option<Vec<u8>> {
    let size = GlobalSize(handle);
    let ptr = GlobalLock(handle) as *const u8;
    if ptr.is_null() {
        return None;
    }
    let bytes = std::slice::from_raw_parts(ptr, size).to_vec();
    let _ = GlobalUnlock(handle);
    Some(bytes)
}

/// # Safety
/// Returns a movable HGLOBAL that the caller must hand to the clipboard or free.
unsafe fn alloc_global(bytes: &[u8]) -> Result<HGLOBAL> {
    let mem = GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1)).context("GlobalAlloc")?;
    let ptr = GlobalLock(mem) as *mut u8;
    if ptr.is_null() {
        let _ = GlobalFree(Some(mem));
        return Err(anyhow!("GlobalLock failed"));
    }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
    let _ = GlobalUnlock(mem);
    Ok(mem)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gdi_formats_are_skipped() {
        assert!(!is_memory_format(CF_BITMAP));
        assert!(!is_memory_format(CF_ENHMETAFILE));
        assert!(!is_memory_format(0x250));
        assert!(is_memory_format(CF_DIB));
        assert!(is_memory_format(CF_HDROP));
        assert!(is_memory_format(13)); // CF_UNICODETEXT
        assert!(is_memory_format(0xC123)); // registered formats
    }
}
