//! Raw Win32 clipboard plumbing.

use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

pub const CF_DIB: u32 = 8;

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
