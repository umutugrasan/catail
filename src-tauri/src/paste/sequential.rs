//! Mode B: one clipboard write and Ctrl+V per item. Esc stops between items.

use std::time::Duration;

use anyhow::Result;

use super::keys::Keys;
use super::platform;
use super::router::Step;
use crate::clipboard::{self, ClipboardGuard};

/// Returns how many steps were pasted before finishing or being cancelled.
pub fn paste(steps: &[Step], delay: Duration, enter_between_texts: bool) -> Result<usize> {
    let _guard = ClipboardGuard::capture()?;
    let mut keys = Keys::new()?;
    // Reading clears the "pressed since last call" bit so an earlier Esc doesn't cancel us.
    platform::esc_pressed();

    for (i, step) in steps.iter().enumerate() {
        if platform::esc_pressed() {
            return Ok(i);
        }
        match step {
            Step::Image(path) => clipboard::write_png_file(path)?,
            Step::Text(text) => clipboard::write_text(text)?,
        }
        keys.paste()?;
        std::thread::sleep(delay);

        let more_follow = i + 1 < steps.len();
        if enter_between_texts && more_follow && matches!(step, Step::Text(_)) {
            keys.enter()?;
            std::thread::sleep(delay);
        }
    }
    Ok(steps.len())
}
