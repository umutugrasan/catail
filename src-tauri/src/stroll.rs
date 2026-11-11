//! The badge's cat out for a walk along the taskbar. A see-through strip across the bottom of
//! the work area that lets every click through to whatever is under it; all it ever shows is
//! the walking cat. The badge hides its own cat meanwhile and gets it back when the walk ends.

use anyhow::{Context, Result};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

const LABEL: &str = "stroll";
const URL: &str = "src/windows/stroll/index.html";
pub const EVENT_START: &str = "stroll:start";
pub const EVENT_HURRY: &str = "stroll:hurry";
/// To the badge: its cat is back in its seat.
pub const EVENT_BACK: &str = "badge:stroll-back";

/// Logical height of the strip: the cat, its hop up to the badge's seat and a little over.
const HEIGHT: f64 = 96.0;
/// Between the badge showing its cat again and this window going, so it never blinks out.
const HANDOVER: Duration = Duration::from_millis(60);
/// For the page to put the cat on its seat before the strip comes into view.
const READY: Duration = Duration::from_millis(50);

/// The strip is never hidden or shown, only moved into view and out of it again: showing a
/// see-through webview window makes it flash. Out of view it sits far off the screen.
static OUT_FOR_A_WALK: AtomicBool = AtomicBool::new(false);
const PARKED: f64 = crate::badge::OFF_SCREEN;

/// Where the walk starts, in the strip's logical px.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrollStart {
    /// The seat's middle, from the strip's left edge.
    pub home: f64,
    /// How high the seat's bottom is above the strip's (the taskbar's top edge).
    pub seat: f64,
    pub width: f64,
    /// The cat's belly, as on the badge.
    pub fat: f64,
    /// The badge's size: the cat out walking is as big as the one on it.
    pub zoom: f64,
}

/// Creates the strip ahead of time, out of view. Must not run on the main thread.
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
        .title("Catail")
        .inner_size(400.0, HEIGHT)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .focusable(false)
        .focused(false)
        .visible(true)
        .position(PARKED, PARKED)
        .build()
        .context("cannot create stroll window")?;
    // Every click goes through to what's underneath, for good.
    let _ = window.set_ignore_cursor_events(true);
    Ok(window)
}

fn park<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.set_position(tauri::LogicalPosition::new(PARKED, PARKED));
}

/// Sends the cat off from its seat at `seat_x`, `seat_bottom` (logical px in the badge window).
/// False when it can't go (no badge on show, no strip yet): the cat stays put.
pub fn start<R: Runtime>(app: &AppHandle<R>, seat_x: f64, seat_bottom: f64, fat: f64) -> bool {
    let (Some(badge), Ok(window)) = (app.get_webview_window("badge"), ensure_window(app)) else {
        return false;
    };
    if !badge.is_visible().unwrap_or(false) {
        return false;
    }
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return false;
    };
    let Ok(corner) = badge.outer_position() else {
        return false;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (ax, ay) = (f64::from(area.position.x), f64::from(area.position.y));
    let (aw, ah) = (f64::from(area.size.width), f64::from(area.size.height));
    let zoom = crate::badge::zoom(app);
    let h = (HEIGHT * zoom * scale).round();
    let bottom = ay + ah;
    let _ = window.set_size(PhysicalSize::new(aw as u32, h as u32));
    let start = StrollStart {
        home: (f64::from(corner.x) + seat_x * scale - ax) / scale,
        seat: (bottom - (f64::from(corner.y) + seat_bottom * scale)) / scale,
        width: aw / scale,
        fat,
        zoom,
    };
    let _ = app.emit_to(LABEL, EVENT_START, start);
    std::thread::sleep(READY);
    let _ = window.set_position(PhysicalPosition::new(ax as i32, (bottom - h) as i32));
    OUT_FOR_A_WALK.store(true, Ordering::Relaxed);
    true
}

/// Something came up: the cat runs straight home.
pub fn hurry<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit_to(LABEL, EVENT_HURRY, ());
}

/// The cat has hopped back up to its seat: the badge shows it again, then the strip goes.
pub fn done<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit_to("badge", EVENT_BACK, ());
    std::thread::sleep(HANDOVER);
    OUT_FOR_A_WALK.store(false, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window(LABEL) {
        park(&window);
    }
}

/// Ends a walk on the spot (the badge is going away, or a screenshot is about to be taken).
pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    if OUT_FOR_A_WALK.swap(false, Ordering::Relaxed) {
        park(&window);
        let _ = app.emit_to("badge", EVENT_BACK, ());
    }
}
