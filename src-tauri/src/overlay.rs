//! One borderless, always-on-top overlay window per monitor.
//!
//! A single window can't span monitors with different DPI scales cleanly, so each monitor
//! gets its own window sized to that monitor in physical pixels. Windows are created once
//! and reused, because creating a webview takes a few hundred milliseconds.

use std::sync::atomic::Ordering;

use anyhow::{Context, Result};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::state::AppState;

const LABEL_PREFIX: &str = "overlay-";
const URL: &str = "src/windows/overlay/index.html";

/// Tells an overlay to fetch the current session and load its frame.
pub const EVENT_REFRESH: &str = "overlay:refresh";
/// Tells an overlay to drop its selection because another monitor started one.
pub const EVENT_CLEAR_SELECTION: &str = "overlay:clear-selection";
/// Tells an overlay it was hidden and should release its frame.
pub const EVENT_RESET: &str = "overlay:reset";

pub fn label(index: usize) -> String {
    format!("{LABEL_PREFIX}{index}")
}

pub fn index_of(label: &str) -> Option<usize> {
    label.strip_prefix(LABEL_PREFIX)?.parse().ok()
}

fn overlay_windows<R: Runtime>(app: &AppHandle<R>) -> Vec<WebviewWindow<R>> {
    app.webview_windows()
        .into_values()
        .filter(|w| index_of(w.label()).is_some())
        .collect()
}

fn ensure_window<R: Runtime>(app: &AppHandle<R>, index: usize) -> Result<WebviewWindow<R>> {
    let label = label(index);
    if let Some(window) = app.get_webview_window(&label) {
        return Ok(window);
    }
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App(URL.into()))
        .title("ClipQueue")
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .visible(false)
        .build()
        .with_context(|| format!("cannot create overlay window {label}"))
}

/// Creates one hidden overlay per monitor ahead of time so the first PrintScreen is fast.
/// Must not run on the main thread (window creation would deadlock on Windows).
pub fn prewarm<R: Runtime>(app: &AppHandle<R>) {
    let count = app.available_monitors().map(|m| m.len()).unwrap_or(1);
    for index in 0..count {
        if let Err(e) = ensure_window(app, index) {
            eprintln!("overlay prewarm failed: {e:#}");
        }
    }
}

/// Positions an overlay over each monitor (`bounds` = x, y, width, height in physical px)
/// and asks it to load its frame. The overlay calls back `overlay_ready` once painted.
pub fn present<R: Runtime>(app: &AppHandle<R>, bounds: &[(i32, i32, u32, u32)]) -> Result<()> {
    for (index, &(x, y, width, height)) in bounds.iter().enumerate() {
        let window = ensure_window(app, index)?;
        // Position first: moving onto a monitor with another DPI may resize the window,
        // so the size is applied afterwards.
        window.set_position(PhysicalPosition::new(x, y))?;
        window.set_size(PhysicalSize::new(width, height))?;
        app.emit_to(window.label(), EVENT_REFRESH, ())?;
    }
    // Monitors may have been unplugged since the windows were created.
    for window in overlay_windows(app) {
        if index_of(window.label()).is_some_and(|i| i >= bounds.len()) {
            let _ = window.hide();
        }
    }
    Ok(())
}

/// Shows an overlay whose frame has loaded. The overlay under the cursor gets focus
/// so Esc and Ctrl+C work without clicking first.
pub fn show_ready<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) -> Result<()> {
    let state = app.state::<AppState>();
    if !state.overlay_active.load(Ordering::SeqCst) {
        return Ok(()); // closed while the frame was loading
    }
    window.set_always_on_top(true)?;
    window.show()?;

    let has_cursor = app.cursor_position().ok().is_some_and(|c| {
        let session = state.session.lock().unwrap();
        index_of(window.label())
            .and_then(|i| session.as_ref()?.shots.get(i).map(|s| s.contains(c.x, c.y)))
            .unwrap_or(false)
    });
    if has_cursor {
        window.set_focus()?;
    }
    Ok(())
}

/// Tells every overlay except `origin` to drop its selection.
pub fn clear_other_selections<R: Runtime>(app: &AppHandle<R>, origin: &str) {
    for window in overlay_windows(app) {
        if window.label() != origin {
            let _ = app.emit_to(window.label(), EVENT_CLEAR_SELECTION, ());
        }
    }
}

/// Hides all overlays and frees the frozen frames.
pub fn close_all<R: Runtime>(app: &AppHandle<R>) {
    for window in overlay_windows(app) {
        let _ = window.hide();
        let _ = app.emit_to(window.label(), EVENT_RESET, ());
    }
    let state = app.state::<AppState>();
    state.session.lock().unwrap().take();
    state.overlay_active.store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_round_trip() {
        assert_eq!(label(2), "overlay-2");
        assert_eq!(index_of(&label(7)), Some(7));
        assert_eq!(index_of("settings"), None);
        assert_eq!(index_of("overlay-x"), None);
    }
}
