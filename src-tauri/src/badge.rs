//! "Kuyruk: N" badge in the bottom-right corner of the primary monitor, shown while the
//! queue has items or text mode is on.
//! Always on top and never focused; clicking it opens the queue panel.

use std::sync::atomic::Ordering;
use std::time::Duration;

use anyhow::{Context, Result};
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::settings::BadgeCorner;
use crate::state::{AppState, UndoKind};

const LABEL: &str = "badge";
const URL: &str = "src/windows/badge/index.html";
pub const EVENT_UPDATE: &str = "badge:update";
/// The panel's bin was clicked: a cat is on its way from there into the box.
pub const EVENT_LEAP: &str = "badge:leap";
/// Files are being dragged over the badge (true) or have left it (false).
pub const EVENT_DROP_HOVER: &str = "badge:drop-hover";

/// Where a window that takes file drops starts life. A webview built hidden never registers its
/// drop target on the browser windows that end up under the mouse, so a later show leaves it
/// deaf to drops. These windows are built visible, out of sight, and hidden right after.
pub const OFF_SCREEN: f64 = -32000.0;

/// Logical size and distance from the work-area corner.
const WIDTH: f64 = 260.0;
const HEIGHT: f64 = 40.0;
const MARGIN: f64 = 16.0;
/// While the cat leaps from the panel's bin into the box, the (transparent) window reaches
/// up to where the bin was, so the cat isn't cut off.
const LEAP_HEIGHT: f64 = 170.0;
const LEAP_FOR: Duration = Duration::from_millis(1500);

/// Gives the compositor time to remove the badge before a screenshot is taken.
const HIDE_SETTLE: Duration = Duration::from_millis(80);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BadgeState {
    pub count: usize,
    pub text_mode: bool,
    pub pasting: bool,
    pub undo: Option<UndoView>,
    /// Where the badge sits, so it lines its content up with that corner.
    pub corner: BadgeCorner,
}

/// "Geri al" offer as the badge shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoView {
    pub kind: UndoKind,
    pub count: usize,
    /// For the countdown bar.
    pub remaining_ms: u64,
    pub total_ms: u64,
}

pub fn current<R: Runtime>(app: &AppHandle<R>) -> BadgeState {
    let state = app.state::<AppState>();
    let count = state.queue.lock().unwrap().len();
    let undo = state.undo.lock().unwrap().map(|offer| UndoView {
        kind: offer.kind,
        count: offer.count,
        remaining_ms: offer
            .until
            .saturating_duration_since(std::time::Instant::now())
            .as_millis() as u64,
        total_ms: crate::queue::UNDO_FOR.as_millis() as u64,
    });
    BadgeState {
        count,
        text_mode: state.text_mode.load(Ordering::SeqCst),
        pasting: state.pasting.load(Ordering::SeqCst),
        undo,
        corner: corner(app),
    }
}

fn should_show<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state = app.state::<AppState>();
    let has_items = state.queue.lock().unwrap().len() > 0;
    let undo = state.undo.lock().unwrap().is_some();
    let active = has_items || undo || state.text_mode.load(Ordering::SeqCst);
    active && !state.overlay_active.load(Ordering::SeqCst)
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

fn corner<R: Runtime>(app: &AppHandle<R>) -> BadgeCorner {
    app.state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .badge_corner
}

/// Left edge for something `w` wide lined up with `corner` in the work area.
pub fn aligned_x(corner: BadgeCorner, area_x: f64, area_w: f64, w: f64, margin: f64) -> f64 {
    match corner.side() {
        -1 => area_x + margin,
        0 => area_x + ((area_w - w) / 2.0).round(),
        _ => area_x + area_w - w - margin,
    }
}

/// Where captures "fly" to when queued: the badge pill's center, in physical screen pixels.
/// The pill is roughly 120 logical px wide, at the corner's side of its window.
pub fn fly_target<R: Runtime>(app: &AppHandle<R>) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok()??;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let corner = corner(app);
    let (ax, ay) = (f64::from(area.position.x), f64::from(area.position.y));
    let (aw, ah) = (f64::from(area.size.width), f64::from(area.size.height));
    let x = match corner.side() {
        -1 => ax + (MARGIN + 60.0) * scale,
        0 => ax + aw / 2.0,
        _ => ax + aw - (MARGIN + 60.0) * scale,
    };
    let y = if corner.is_top() {
        ay + (MARGIN + HEIGHT / 2.0) * scale
    } else {
        ay + ah - (MARGIN + HEIGHT / 2.0) * scale
    };
    Some((x, y))
}

/// Moves a visible badge to the corner now set.
pub fn reposition<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(LABEL) {
        place(app, &window);
        let _ = app.emit_to(LABEL, EVENT_UPDATE, current(app));
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
        .title("Catail")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .focusable(false)
        .focused(false)
        .visible(true)
        .position(OFF_SCREEN, OFF_SCREEN)
        .build()
        .context("cannot create badge window")?;
    window.hide()?;
    crate::queue::accept_file_drops(&window, EVENT_DROP_HOVER);
    Ok(window)
}

/// Where the panel's bin is, seen from the badge window, in logical px: the spot the cat
/// stands on (the top of the bin icon).
#[derive(Debug, Clone, Copy, Serialize)]
pub struct LeapStart {
    pub x: f64,
    pub y: f64,
}

/// Offsets of the bin inside the panel (panel.css): first footer button, 8 px padding,
/// 38 × 34, a 17 px icon in its middle.
const BIN_X: f64 = 8.0 + 38.0 / 2.0;
const BIN_TOP_FROM_BOTTOM: f64 = 8.0 + 34.0 / 2.0 + 17.0 / 2.0;

/// Tells the badge a cat leaps over from the panel's bin, and makes room for it for a moment.
pub fn leap<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let panel = app.get_webview_window("panel");
    place_sized(app, &window, LEAP_HEIGHT);
    let start = (|| {
        let panel = panel?;
        let scale = window.scale_factor().ok()?;
        let (p, size) = (panel.outer_position().ok()?, panel.outer_size().ok()?);
        let b = window.outer_position().ok()?;
        let bin_x = f64::from(p.x) + BIN_X * scale;
        let bin_top = f64::from(p.y) + f64::from(size.height) - BIN_TOP_FROM_BOTTOM * scale;
        Some(LeapStart {
            x: (bin_x - f64::from(b.x)) / scale,
            y: (bin_top - f64::from(b.y)) / scale,
        })
    })();
    let Some(start) = start else {
        place(app, &window);
        return;
    };
    let _ = app.emit_to(LABEL, EVENT_LEAP, start);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(LEAP_FOR);
        if let Some(window) = app.get_webview_window(LABEL) {
            place(&app, &window);
        }
    });
}

/// In the chosen corner of the primary monitor's work area (above the taskbar).
fn place<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    place_sized(app, window, HEIGHT);
}

/// Like `place`, `height` logical px tall; it grows away from its corner (up from a bottom
/// corner, down from a top one), so the badge itself stays put.
fn place_sized<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>, height: f64) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let corner = corner(app);
    let (w, h, margin) = (
        (WIDTH * scale).round(),
        (height * scale).round(),
        (MARGIN * scale).round(),
    );
    let x = aligned_x(
        corner,
        f64::from(area.position.x),
        f64::from(area.size.width),
        w,
        margin,
    );
    let y = if corner.is_top() {
        f64::from(area.position.y) + margin
    } else {
        f64::from(area.position.y) + f64::from(area.size.height) - h - margin
    };
    let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
    let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
}
