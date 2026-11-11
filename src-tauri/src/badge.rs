//! "Kuyruk: N" badge in the bottom-right corner of the primary monitor, shown while the
//! queue has items or text mode is on.
//! Always on top and never focused; clicking it opens the queue panel.

use std::sync::atomic::Ordering;
use std::sync::Mutex;
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
pub const EVENT_FETCH: &str = "badge:fetch";
pub const EVENT_CAT_AWAY: &str = "badge:cat-away";
/// The queue is being saved (true) or is done (false): the cat packs itself into a box.
pub const EVENT_PACKING: &str = "badge:packing";
/// Files are being dragged over the badge (true) or have left it (false).
pub const EVENT_DROP_HOVER: &str = "badge:drop-hover";

/// Where a window that takes file drops starts life. A webview built hidden never registers its
/// drop target on the browser windows that end up under the mouse, so a later show leaves it
/// deaf to drops. These windows are built visible, out of sight, and hidden right after.
pub const OFF_SCREEN: f64 = -32000.0;

/// Logical size and distance from the work-area corner.
const WIDTH: f64 = 300.0;
const HEIGHT: f64 = 40.0;
const MARGIN: f64 = 16.0;
/// The (transparent) window is always this tall, reaching away from its corner, so the cat
/// has room to leap from the panel's bin into the box or jump about. It is never resized for
/// that, since a resize makes the webview flash. Only the badge's own strip of it (`HEIGHT`)
/// takes the mouse; anywhere else clicks go through it (`pass_clicks_outside_strip`).
const LEAP_HEIGHT: f64 = 170.0;
/// How often it checks whether the pointer is over the badge.
const HIT_TEST_EVERY: Duration = Duration::from_millis(30);

/// Where the badge itself is in its window, measured by its page (`set_hit_area`): left, top,
/// right and bottom in physical px from the window's client corner. Until the page says, the
/// strip along the corner's edge.
static HIT_AREA: Mutex<Option<[i32; 4]>> = Mutex::new(None);

/// The page measured where its badge (or "Geri al") is, in logical px within the window.
pub fn set_hit_area<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64, width: f64, height: f64) {
    let Some(scale) = app
        .get_webview_window(LABEL)
        .and_then(|window| window.scale_factor().ok())
    else {
        return;
    };
    let px = |v: f64| (v * scale).round() as i32;
    *HIT_AREA.lock().unwrap() = Some([px(x), px(y), px(x + width), px(y + height)]);
}
/// In a left corner the cat's tree stands between the window's edge and the cat (badge.css).
const TREE_ROOM: f64 = 34.0;

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
    /// How big it is ("Rozet boyutu"): its page is zoomed by this.
    pub zoom: f64,
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
        zoom: zoom(app),
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
        crate::stroll::stop(app);
        let _ = window.hide();
    }
}

/// The badge's size as a factor of its usual one; every size of it here is scaled by this.
pub fn zoom<R: Runtime>(app: &AppHandle<R>) -> f64 {
    app.state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .badge_zoom()
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
/// Where the badge's cat sits: left of a pill roughly 100 logical px wide, at the corner's side
/// of the window, or at the very edge in a left corner.
pub fn fly_target<R: Runtime>(app: &AppHandle<R>) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok()??;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let corner = corner(app);
    let z = zoom(app);
    let (ax, ay) = (f64::from(area.position.x), f64::from(area.position.y));
    let (aw, ah) = (f64::from(area.size.width), f64::from(area.size.height));
    let x = match corner.side() {
        -1 => ax + (MARGIN + (TREE_ROOM + 20.0) * z) * scale,
        0 => ax + aw / 2.0 - 52.0 * scale,
        _ => ax + aw - (MARGIN + 122.0 * z) * scale,
    };
    let y = if corner.is_top() {
        ay + (MARGIN + HEIGHT * z / 2.0) * scale
    } else {
        ay + ah - (MARGIN + HEIGHT * z / 2.0) * scale
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
    crate::stroll::stop(app);
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
        .inner_size(WIDTH * zoom(app), LEAP_HEIGHT * zoom(app))
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
    pass_clicks_outside_strip(&window);
    Ok(window)
}

/// Clicks go through the window except over the badge itself (`HIT_AREA`).
///
/// The window is made click-through for good, which also makes it layered; from then on only
/// `WS_EX_TRANSPARENT` is switched on and off, as the pointer leaves the strip or comes onto
/// it. That leaves how the window is drawn alone. (A window region would do it in one go, but
/// a region turns off the see-through drawing and brings back an old-style title bar.)
fn pass_clicks_outside_strip<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.set_ignore_cursor_events(true);
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{HWND, POINT, RECT};
        use windows::Win32::Graphics::Gdi::ScreenToClient;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetClientRect, GetCursorPos, GetWindowLongPtrW, IsWindow, IsWindowVisible,
            SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT,
        };

        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let app = window.app_handle().clone();
        // A window handle can't cross threads; its number can.
        let handle = hwnd.0 as isize;
        std::thread::spawn(move || loop {
            std::thread::sleep(HIT_TEST_EVERY);
            let hwnd = HWND(handle as _);
            // SAFETY: plain Win32 calls on our own window; they fail harmlessly once it's gone.
            unsafe {
                if !IsWindow(Some(hwnd)).as_bool() {
                    return;
                }
                if !IsWindowVisible(hwnd).as_bool() {
                    continue;
                }
                // The pointer, from the window's client corner.
                let (mut client, mut at) = (RECT::default(), POINT::default());
                if GetClientRect(hwnd, &mut client).is_err()
                    || GetCursorPos(&mut at).is_err()
                    || !ScreenToClient(hwnd, &mut at).as_bool()
                {
                    continue;
                }
                let [left, top, right, bottom] = HIT_AREA.lock().unwrap().unwrap_or_else(|| {
                    // The strip is the same share of the window at any size or zoom.
                    let strip = (client.bottom as f64 * HEIGHT / LEAP_HEIGHT).round() as i32;
                    if corner(&app).is_top() {
                        [0, 0, client.right, strip]
                    } else {
                        [0, client.bottom - strip, client.right, client.bottom]
                    }
                });
                let over = at.x >= left && at.x < right && at.y >= top && at.y < bottom;
                let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                let through = style & WS_EX_TRANSPARENT.0 as isize != 0;
                if over == through {
                    let flipped = style ^ WS_EX_TRANSPARENT.0 as isize;
                    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, flipped);
                }
            }
        });
    }
}

/// Where the panel's bin is, seen from the badge window, in logical px: the spot the cat
/// stands on (the top of the bin icon).
#[derive(Debug, Clone, Copy, Serialize)]
pub struct LeapStart {
    pub x: f64,
    pub y: f64,
}

/// Tells the badge a cat leaps over from the panel's bin.
pub fn leap<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let panel = app.get_webview_window("panel");
    let (bin_x, bin_from_bottom) = crate::panel::bin_spot(app);
    let start = (|| {
        let panel = panel?;
        let scale = window.scale_factor().ok()?;
        let (p, size) = (panel.outer_position().ok()?, panel.outer_size().ok()?);
        let b = window.outer_position().ok()?;
        let bin_x = f64::from(p.x) + bin_x * scale;
        let bin_top = f64::from(p.y) + f64::from(size.height) - bin_from_bottom * scale;
        Some(LeapStart {
            x: (bin_x - f64::from(b.x)) / scale,
            y: (bin_top - f64::from(b.y)) / scale,
        })
    })();
    if let Some(start) = start {
        let _ = app.emit_to(LABEL, EVENT_LEAP, start);
    }
}

/// "Geri al" brought `count` items back: the badge's cat carries them over.
pub fn fetch<R: Runtime>(app: &AppHandle<R>, count: usize) {
    let _ = app.emit_to(LABEL, EVENT_FETCH, count);
}

/// The panel needs a cat for `ms`: the one on the badge goes up there.
pub fn cat_away<R: Runtime>(app: &AppHandle<R>, ms: u64) {
    let _ = app.emit_to(LABEL, EVENT_CAT_AWAY, ms);
}

/// The queue is being saved (`true`) or the save is over, done or not (`false`).
pub fn packing<R: Runtime>(app: &AppHandle<R>, on: bool) {
    let _ = app.emit_to(LABEL, EVENT_PACKING, on);
}

/// Tells the badge the save is over when dropped, whichever way the save ends.
pub struct Packing<R: Runtime>(pub AppHandle<R>);

impl<R: Runtime> Packing<R> {
    pub fn start(app: &AppHandle<R>) -> Self {
        packing(app, true);
        Self(app.clone())
    }
}

impl<R: Runtime> Drop for Packing<R> {
    fn drop(&mut self) {
        packing(&self.0, false);
    }
}

/// The pointer, in logical px from the window's corner, for the cat's eyes to follow.
pub fn cursor<R: Runtime>(app: &AppHandle<R>) -> Option<(f64, f64)> {
    let window = app.get_webview_window(LABEL)?;
    let scale = window.scale_factor().ok()?;
    let pointer = app.cursor_position().ok()?;
    let corner = window.outer_position().ok()?;
    Some((
        (pointer.x - f64::from(corner.x)) / scale,
        (pointer.y - f64::from(corner.y)) / scale,
    ))
}

/// In the chosen corner of the primary monitor's work area (above the taskbar).
fn place<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    place_sized(app, window, LEAP_HEIGHT);
}

/// In the chosen corner, `height` logical px tall, reaching away from it (up from a bottom
/// corner, down from a top one).
fn place_sized<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>, height: f64) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let corner = corner(app);
    let (w, h, margin) = (
        (WIDTH * zoom(app) * scale).round(),
        (height * zoom(app) * scale).round(),
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
