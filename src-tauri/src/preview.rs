//! Large preview of a queued image, opened from the panel's zoom button. Covers the primary
//! monitor with a dimmed backdrop; a click or Esc closes it.

use std::sync::Mutex;

use anyhow::{Context, Result};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use uuid::Uuid;

const LABEL: &str = "preview";
const URL: &str = "src/windows/preview/index.html";
pub const EVENT_SHOW: &str = "preview:show";

/// The image being shown. A window created just now hasn't loaded its page when the show
/// event goes out and misses it, so on load it asks for this instead.
static CURRENT: Mutex<Option<Uuid>> = Mutex::new(None);

pub fn current() -> Option<Uuid> {
    *CURRENT.lock().unwrap()
}

/// Must not run on the main thread (the window may be created here).
pub fn open<R: Runtime>(app: &AppHandle<R>, id: Uuid) -> Result<()> {
    let window = ensure_window(app)?;
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let _ = window.set_position(PhysicalPosition::new(
            monitor.position().x,
            monitor.position().y,
        ));
        let _ = window.set_size(PhysicalSize::new(
            monitor.size().width,
            monitor.size().height,
        ));
    }
    *CURRENT.lock().unwrap() = Some(id);
    app.emit_to(LABEL, EVENT_SHOW, id)?;
    window.show()?;
    // Focus so Esc reaches it.
    let _ = window.set_focus();
    Ok(())
}

pub fn close<R: Runtime>(app: &AppHandle<R>) {
    *CURRENT.lock().unwrap() = None;
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}

fn ensure_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(LABEL) {
        return Ok(window);
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(URL.into()))
        .title("Catail")
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .visible(false)
        .build()
        .context("cannot create preview window")
}
