//! Backs up the user's clipboard before a paste and restores it afterwards.

use anyhow::Result;

/// Copy of every memory-backed clipboard format at the time of capture.
pub struct ClipboardSnapshot {
    formats: Vec<(u32, Vec<u8>)>,
}

impl ClipboardSnapshot {
    #[cfg(windows)]
    pub fn capture() -> Result<Self> {
        Ok(Self {
            formats: super::win32::read_all_formats()?,
        })
    }

    #[cfg(windows)]
    pub fn restore(&self) -> Result<()> {
        super::win32::set_clipboard(&self.formats)
    }

    #[cfg(not(windows))]
    pub fn capture() -> Result<Self> {
        Ok(Self {
            formats: Vec::new(),
        })
    }

    #[cfg(not(windows))]
    pub fn restore(&self) -> Result<()> {
        let _ = &self.formats;
        Ok(())
    }
}

/// Restores the user's clipboard when dropped, including on error and panic paths.
pub struct ClipboardGuard {
    snapshot: ClipboardSnapshot,
}

impl ClipboardGuard {
    pub fn capture() -> Result<Self> {
        Ok(Self {
            snapshot: ClipboardSnapshot::capture()?,
        })
    }
}

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        if let Err(e) = self.snapshot.restore() {
            eprintln!("could not restore previous clipboard: {e:#}");
        }
    }
}
