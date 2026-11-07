//! Mode A: everything in one clipboard write and a single Ctrl+V.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::Result;

use super::keys::Keys;
use crate::clipboard::{self, ClipboardGuard};

/// Pastes all images and files as one file list, in queue order.
pub fn paste_files(paths: &[PathBuf], restore_delay: Duration) -> Result<()> {
    let _guard = ClipboardGuard::capture()?;
    let paths: Vec<&Path> = paths.iter().map(PathBuf::as_path).collect();
    clipboard::write_files(&paths)?;
    Keys::new()?.paste()?;
    // The target reads the clipboard asynchronously; restoring too early pastes the old content.
    std::thread::sleep(restore_delay);
    Ok(())
}

/// Pastes the queue's texts already joined into one string.
pub fn paste_text(text: &str, restore_delay: Duration) -> Result<()> {
    let _guard = ClipboardGuard::capture()?;
    clipboard::write_text(text)?;
    Keys::new()?.paste()?;
    std::thread::sleep(restore_delay);
    Ok(())
}
