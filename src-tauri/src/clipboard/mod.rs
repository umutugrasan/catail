//! Clipboard access. Platform plumbing lives in per-OS modules behind the same functions.

mod files;
mod snapshot;
#[cfg(windows)]
mod win32;
mod write;

pub use files::write_files;
pub use snapshot::ClipboardGuard;
pub use write::{write_image, write_png_file, write_text};
