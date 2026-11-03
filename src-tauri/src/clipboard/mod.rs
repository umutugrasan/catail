//! Clipboard access. Platform plumbing lives in per-OS modules behind the same functions.

#[cfg(windows)]
mod win32;
mod write;

pub use write::write_image;
