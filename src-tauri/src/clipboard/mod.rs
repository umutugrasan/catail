//! Clipboard access. Platform plumbing lives in per-OS modules behind the same functions.

pub(crate) mod files;
mod read;
mod snapshot;
#[cfg(windows)]
pub mod watcher;
#[cfg(windows)]
mod win32;
mod write;

pub use files::write_files;
pub use read::{read_for_queue, Clip, Copied};
pub use snapshot::ClipboardGuard;
pub use write::{write_image, write_png_file, write_text};

/// True if the clipboard still holds what Catail itself wrote last.
#[cfg(windows)]
pub fn is_self_write() -> bool {
    win32::is_self_write()
}

#[cfg(not(windows))]
pub fn is_self_write() -> bool {
    false
}
