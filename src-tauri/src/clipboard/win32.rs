//! Raw Win32 clipboard plumbing.

use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};

pub const CF_DIB: u32 = 8;
pub const CF_UNICODETEXT: u32 = 13;
pub const CF_HDROP: u32 = 15;

const CF_BITMAP: u32 = 2;
const CF_METAFILEPICT: u32 = 3;
const CF_PALETTE: u32 = 9;
const CF_ENHMETAFILE: u32 = 14;
const CF_OWNERDISPLAY: u32 = 0x80;
const CF_DSPBITMAP: u32 = 0x82;
const CF_DSPMETAFILEPICT: u32 = 0x83;
const CF_DSPENHMETAFILE: u32 = 0x8E;
const CF_PRIVATE_FIRST: u32 = 0x200;
const CF_GDIOBJ_LAST: u32 = 0x3FF;

pub fn register_format(name: PCWSTR) -> Result<u32> {
    // SAFETY: callers pass a `w!` literal, a static NUL-terminated UTF-16 string.
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

/// Empties the clipboard and writes each `(format, bytes)` pair.
pub fn set_clipboard(items: &[(u32, Vec<u8>)]) -> Result<()> {
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

/// Copies every memory-backed format currently on the clipboard.
pub fn read_all_formats() -> Result<Vec<(u32, Vec<u8>)>> {
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
    Ok(formats)
}

/// GDI-handle formats (bitmaps, metafiles, palettes) aren't HGLOBALs and can't be byte-copied.
/// Windows re-synthesizes CF_BITMAP from CF_DIB, so skipping it loses nothing.
pub fn is_memory_format(format: u32) -> bool {
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
        assert!(is_memory_format(CF_UNICODETEXT));
        assert!(is_memory_format(0xC123)); // registered formats
    }
}
