//! "Kuyruk: N" badge in the bottom-right corner of the primary monitor, shown while the
//! queue has items.
//! Always on top, never focused, and click-through so it can't get in the way.

use std::sync::atomic::Ordering;
use std::time::Duration;

use anyhow::{Context, Result};
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::state::AppState;

const LABEL: &str = "badge";
const URL: &str = "src/windows/badge/index.html";
pub const EVENT_UPDATE: &str = "badge:update";

/// Logical size and distance from the work-area corner.
const WIDTH: f64 = 180.0;
const HEIGHT: f64 = 40.0;
const MARGIN: f64 = 16.0;

/// Gives the compositor time to remove the badge before a screenshot is taken.
const HIDE_SETTLE: Duration = Duration::from_millis(80);

#[derive(Debug, Clone, Serialize)]
pub struct BadgeState {
    pub count: usize,
    pub pasting: bool,
}

pub fn current<R: Runtime>(app: &AppHandle<R>) -> BadgeState {
    let state = app.state::<AppState>();
    let count = state.queue.lock().unwrap().len();
    BadgeState {
        count,
        pasting: state.pasting.load(Ordering::SeqCst),
    }
}

fn should_show<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state = app.state::<AppState>();
    let has_items = state.queue.lock().unwrap().len() > 0;
    has_items && !state.overlay_active.load(Ordering::SeqCst)
}

/// Pushes the current count to the badge and shows or hides it. Safe on any thread.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let visible = should_show(app);
    let Some(window) = app.get_webview_window(LABEL) else {
        if visible {
            // Window creation must not run on the main thread.
            let app = app.clone();
            std::thread::spawn(move || match ensure_window(&app) {
                Ok(_) => refresh(&app),
                Err(e) => eprintln!("{e:#}"),
            });
        }
        return;
    };

    let _ = app.emit_to(LABEL, EVENT_UPDATE, current(app));
    let is_visible = window.is_visible().unwrap_or(false);
    if visible && !is_visible {
        place(app, &window);
        let _ = window.show();
    } else if !visible && is_visible {
        let _ = window.hide();
    }
}

/// Hides the badge so it doesn't end up in a screenshot. `refresh` brings it back.
pub fn hide_for_capture<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            std::thread::sleep(HIDE_SETTLE);
        }
    }
}

/// Creates the hidden badge ahead of time. Must not run on the main thread.
pub fn prewarm<R: Runtime>(app: &AppHandle<R>) {
    if let Err(e) = ensure_window(app) {
        eprintln!("{e:#}");
    }
}

fn ensure_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(LABEL) {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(URL.into()))
        .title("ClipQueue")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .focusable(false)
        .focused(false)
        .visible(false)
        .build()
        .context("cannot create badge window")?;
    window
        .set_ignore_cursor_events(true)
        .context("cannot make badge click-through")?;
    Ok(window)
}

/// Bottom-right of the primary monitor's work area (above the taskbar).
fn place<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (w, h, margin) = (
        (WIDTH * scale).round(),
        (HEIGHT * scale).round(),
        (MARGIN * scale).round(),
    );
    let x = f64::from(area.position.x) + f64::from(area.size.width) - w - margin;
    let y = f64::from(area.position.y) + f64::from(area.size.height) - h - margin;
    let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
    let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
}
