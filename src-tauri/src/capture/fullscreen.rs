//! Full-screen capture of the monitor under the cursor: to the queue in queue mode,
//! otherwise straight to the clipboard.

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager, Runtime};

use crate::i18n::{t, t_with};
use crate::state::AppState;
use crate::{badge, clipboard, notify, queue};

/// Hotkey entry point. Runs on a worker thread.
pub fn capture<R: Runtime>(app: &AppHandle<R>) {
    let result = capture_monitor(app);
    badge::refresh(app);
    if let Err(e) = result {
        let msg = t_with("notify.capture_failed", &[("error", &format!("{e:#}"))]);
        notify::show(app, &t("app.name"), &msg);
    }
}

fn capture_monitor<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let cursor = app.cursor_position().context("cursor position")?;
    let monitor = xcap::Monitor::from_point(cursor.x as i32, cursor.y as i32)
        .context("no monitor under cursor")?;
    badge::hide_for_capture(app);
    let image = monitor.capture_image().context("monitor capture")?;
    if app.state::<AppState>().is_queue_mode() {
        queue::add_image(app, &image)
    } else {
        clipboard::write_image(&image)
    }
}
