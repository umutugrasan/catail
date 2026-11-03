//! Full-screen capture of the monitor under the cursor, straight to the clipboard.

use anyhow::{Context, Result};
use tauri::{AppHandle, Runtime};

use crate::i18n::{t, t_with};
use crate::{clipboard, notify};

/// Hotkey entry point. Runs on a worker thread.
pub fn capture_to_clipboard<R: Runtime>(app: &AppHandle<R>) {
    if let Err(e) = capture(app) {
        let msg = t_with("notify.capture_failed", &[("error", &format!("{e:#}"))]);
        notify::show(app, &t("app.name"), &msg);
    }
}

fn capture<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let cursor = app.cursor_position().context("cursor position")?;
    let monitor = xcap::Monitor::from_point(cursor.x as i32, cursor.y as i32)
        .context("no monitor under cursor")?;
    let image = monitor.capture_image().context("monitor capture")?;
    clipboard::write_image(&image)
}
