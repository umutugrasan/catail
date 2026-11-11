//! Queue panel that opens upward from the badge: items in order, drag to reorder,
//! ✕ to delete, paste and clear buttons.
//!
//! Like the badge it never takes focus, so "Yapıştır" pastes into the app the user was in.

use std::borrow::Cow;

use anyhow::{Context, Result};
use serde::Serialize;
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, UriSchemeContext,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use uuid::Uuid;

use crate::queue::item::{QueueItem, QueueItemKind};
use crate::settings::{BadgeCorner, PanelLayout};
use crate::state::AppState;

const LABEL: &str = "panel";
const URL: &str = "src/windows/panel/index.html";
pub const EVENT_UPDATE: &str = "panel:update";
/// Sent on every open so the panel replays its entrance animation (`Opened`).
pub const EVENT_OPENED: &str = "panel:opened";

/// What the panel needs to know as it opens.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Opened {
    /// It grows out of the badge, wherever that sits.
    pub corner: BadgeCorner,
    /// "Rozet boyutu": the panel is as much bigger or smaller as the badge.
    pub zoom: f64,
}
/// Asks the panel to play its exit animation and then call `panel_close`.
pub const EVENT_CLOSE: &str = "panel:close";
/// Files are being dragged over the panel (true) or have left it (false).
pub const EVENT_DROP_HOVER: &str = "panel:drop-hover";

/// URI scheme for queued items: `queue://localhost/<item id>.png` for images and
/// `queue://localhost/<item id>.pdf` for PDF files.
pub const PROTOCOL: &str = "queue";

/// Logical size: two columns of 72 px tiles (pitch 78, see Panel.tsx). The height follows
/// the number of rows, up to a cap. The panel sits above the badge (see `badge.rs`).
const WIDTH: f64 = 168.0;
const TILE_PITCH: f64 = 78.0;
const COLUMNS: usize = 2;
/// Header, footer, gaps and padding around the grid.
const CHROME_HEIGHT: f64 = 96.0;
const MAX_HEIGHT: f64 = 520.0;
const MARGIN: f64 = 16.0;
const BADGE_HEIGHT: f64 = 40.0;
const GAP: f64 = 8.0;
const TEXT_PREVIEW_CHARS: usize = 280;

/// The list layout (Panel.tsx, `.panel--list` in panel.css): a card about as wide as the
/// badge's pill with one column of tiles, in a see-through window that also holds the bubbles
/// which pop out beside a tile, and a little room for the card's shadow.
const LIST_CARD_WIDTH: f64 = 112.0;
const LIST_TILE_PITCH: f64 = 74.0;
/// Header, footer, gaps and padding around the column.
const LIST_CHROME_HEIGHT: f64 = 84.0;
/// Room for the card's shadow on every side.
const LIST_PAD: f64 = 10.0;
/// The bubbles' strip, on the side toward the middle of the screen.
const LIST_BUBBLES: f64 = 38.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemView {
    pub id: Uuid,
    pub kind: QueueItemKind,
    /// Start of the text, for text items.
    pub preview: Option<String>,
    /// Whole text, for exporting.
    pub full_text: Option<String>,
    /// For file items.
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub file_size: Option<u64>,
    pub source_app: Option<String>,
    pub revision: u32,
}

impl From<&QueueItem> for ItemView {
    fn from(item: &QueueItem) -> Self {
        Self {
            id: item.id,
            kind: item.kind,
            preview: item.text.as_deref().map(preview),
            full_text: item.text.clone(),
            file_name: item.file_name(),
            file_path: item.file_path.as_deref().map(|p| p.display().to_string()),
            file_size: item.file_size,
            source_app: item.source_app.clone(),
            revision: item.revision,
        }
    }
}

pub fn preview(text: &str) -> String {
    let trimmed = text.trim();
    match trimmed.char_indices().nth(TEXT_PREVIEW_CHARS) {
        Some((cut, _)) => format!("{}…", &trimmed[..cut]),
        None => trimmed.to_owned(),
    }
}

pub fn items<R: Runtime>(app: &AppHandle<R>) -> Vec<ItemView> {
    let state = app.state::<AppState>();
    let queue = state.queue.lock().unwrap();
    queue.items().iter().map(ItemView::from).collect()
}

fn is_open<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.get_webview_window(LABEL)
        .is_some_and(|w| w.is_visible().unwrap_or(false))
}

/// Badge click. Must not run on the main thread (the window may be created here).
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    if is_open(app) {
        let _ = app.emit_to(LABEL, EVENT_CLOSE, ());
        return;
    }
    match ensure_window(app) {
        Ok(window) => {
            place(app, &window);
            let _ = app.emit_to(LABEL, EVENT_UPDATE, items(app));
            let _ = app.emit_to(LABEL, EVENT_OPENED, opened(app));
            let _ = window.show();
        }
        Err(e) => eprintln!("{e:#}"),
    }
}

/// What the panel needs to know as it opens. Also asked for by the page as it loads: a panel
/// built for its first open isn't listening yet when that open's event is sent.
pub fn opened<R: Runtime>(app: &AppHandle<R>) -> Opened {
    // One lock: the settings mutex isn't reentrant.
    let state = app.state::<AppState>();
    let settings = state.settings.lock().unwrap();
    Opened {
        corner: settings.badge_corner,
        zoom: settings.badge_zoom(),
    }
}

pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}

/// Keeps an open panel in sync with the queue and closes it once the queue is empty.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    if !is_open(app) {
        return;
    }
    let items = items(app);
    if items.is_empty() {
        hide(app);
        return;
    }
    // Grow or shrink with the queue (the bottom edge stays put above the badge).
    if let Some(window) = app.get_webview_window(LABEL) {
        place(app, &window);
    }
    let _ = app.emit_to(LABEL, EVENT_UPDATE, items);
}

/// The layout changed in Settings: the window is built anew for it on the next open, since a
/// window can't turn see-through after the fact.
pub fn reset<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.destroy();
    }
}

fn ensure_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(LABEL) {
        return Ok(window);
    }
    let layout = app
        .state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .panel_layout;
    let list = layout == PanelLayout::List;
    let (w, h) = size_for(layout, 0);
    let z = crate::badge::zoom(app);
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(URL.into()))
        .title("Catail")
        .inner_size(w * z, h * z)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // The grid: Windows 11 rounds the window and gives it a shadow. The list draws its own
        // card on a see-through window, with room for the bubbles beside it.
        .shadow(!list)
        .transparent(list)
        // Known before the page loads (layout.ts). The document doesn't exist yet when this
        // runs, so it goes on `window`.
        .initialization_script(if list {
            "window.__CATAIL_PANEL_LAYOUT__ = 'list';"
        } else {
            "window.__CATAIL_PANEL_LAYOUT__ = 'grid';"
        })
        .focusable(false)
        .focused(false)
        // See `OFF_SCREEN`: it must exist as a visible window to take file drops.
        .visible(true)
        .position(crate::badge::OFF_SCREEN, crate::badge::OFF_SCREEN)
        .build()
        .context("cannot create panel window")?;
    window.hide()?;
    crate::queue::accept_file_drops(&window, EVENT_DROP_HOVER);
    Ok(window)
}

/// Lined up with the badge on the same side, directly above it (below it in a top corner).
fn place<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let state = app.state::<AppState>();
    let count = state.queue.lock().unwrap().len();
    let (corner, layout) = {
        let settings = state.settings.lock().unwrap();
        (settings.badge_corner, settings.panel_layout)
    };
    // As much bigger or smaller as the badge ("Rozet boyutu"); the page is zoomed to match.
    let z = crate::badge::zoom(app);
    let (lw, lh) = size_for(layout, count);
    let (top, height) = (f64::from(area.position.y), f64::from(area.size.height));
    let (left, width) = (f64::from(area.position.x), f64::from(area.size.width));
    // How far the window reaches past the card it shows: not at all for the grid; for the
    // list, the shadow's room on every side and the bubbles' strip on the side toward the middle.
    let (outer, inner) = match layout {
        PanelLayout::Grid => (0.0, 0.0),
        PanelLayout::List => (LIST_PAD * z, (LIST_PAD + LIST_BUBBLES) * z),
    };
    let reach = (MARGIN + (BADGE_HEIGHT + GAP) * z - outer) * scale;
    // A big panel on a small screen: no taller than the room above (or below) the badge; its
    // list scrolls.
    let room = (height - reach - MARGIN * scale).max(0.0);
    let (w, h) = ((lw * z * scale).round(), (lh * z * scale).round().min(room));
    let x = match corner.side() {
        -1 => left + (MARGIN - outer) * scale,
        // The card itself in the middle; the bubbles' strip is on its left.
        0 => left + ((width - w) / 2.0).round() - ((inner - outer) / 2.0 * scale).round(),
        _ => left + width - w - (MARGIN - outer) * scale,
    };
    let y = if corner.is_top() {
        (top + reach).min(top + height - h)
    } else {
        (top + height - reach - h).max(top)
    };
    let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
    let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
}

/// The window's logical size: it fits the tiles, so a short queue gets a short panel.
pub fn size_for(layout: PanelLayout, count: usize) -> (f64, f64) {
    match layout {
        PanelLayout::Grid => (WIDTH, height_for(count)),
        PanelLayout::List => {
            let rows = count.max(1) as f64;
            let card = (LIST_CHROME_HEIGHT + rows * LIST_TILE_PITCH).min(MAX_HEIGHT);
            (
                LIST_CARD_WIDTH + 2.0 * LIST_PAD + LIST_BUBBLES,
                card + 2.0 * LIST_PAD,
            )
        }
    }
}

/// Fits the grid's rows, so a short queue gets a short panel.
pub fn height_for(count: usize) -> f64 {
    let rows = count.div_ceil(COLUMNS).max(1);
    (CHROME_HEIGHT + rows as f64 * TILE_PITCH).min(MAX_HEIGHT)
}

/// Where the clear button's bin sits in the panel window (panel.css), in logical px from the
/// window's left and from its bottom: the top of the bin icon, where the cat stands.
pub fn bin_spot<R: Runtime>(app: &AppHandle<R>) -> (f64, f64) {
    let (corner, layout, z) = {
        let state = app.state::<AppState>();
        let settings = state.settings.lock().unwrap();
        (
            settings.badge_corner,
            settings.panel_layout,
            settings.badge_zoom(),
        )
    };
    let (x, from_bottom) = bin_spot_for(layout, corner);
    (x * z, from_bottom * z)
}

fn bin_spot_for(layout: PanelLayout, corner: BadgeCorner) -> (f64, f64) {
    match layout {
        // First footer button, 8 px padding, 38 × 34, a 17 px icon in its middle.
        PanelLayout::Grid => (8.0 + 38.0 / 2.0, 8.0 + 34.0 / 2.0 + 17.0 / 2.0),
        // The same in the card: 6 px padding, 30 × 30, a 15 px icon.
        PanelLayout::List => {
            let card_left = if corner.side() < 0 {
                LIST_PAD
            } else {
                LIST_PAD + LIST_BUBBLES
            };
            (
                card_left + 6.0 + 30.0 / 2.0,
                LIST_PAD + 6.0 + 30.0 / 2.0 + 15.0 / 2.0,
            )
        }
    }
}

/// Parses `/<uuid>.png`.
pub fn parse_image_path(path: &str) -> Option<Uuid> {
    let name = path.trim_start_matches('/').strip_suffix(".png")?;
    Uuid::parse_str(name).ok()
}

/// Parses `/<uuid>.pdf`.
pub fn parse_pdf_path(path: &str) -> Option<Uuid> {
    let name = path.trim_start_matches('/').strip_suffix(".pdf")?;
    Uuid::parse_str(name).ok()
}

/// Serves queued images to the panel's thumbnails and the editor, which draws them on a canvas
/// and so needs the CORS header to read the result back, and queued PDFs to the preview window.
/// Only ever what's in the queue, asked for by item id: no path comes from the page.
pub fn serve<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let state = ctx.app_handle().state::<AppState>();
    let uri_path = request.uri().path();
    let (path, content_type) = {
        let queue = state.queue.lock().unwrap();
        match parse_pdf_path(uri_path) {
            Some(id) => (
                queue
                    .get(id)
                    .filter(|item| item.is_pdf())
                    .and_then(|item| item.file_path.clone()),
                "application/pdf",
            ),
            None => (
                parse_image_path(uri_path).and_then(|id| queue.get(id)?.image_path.clone()),
                "image/png",
            ),
        }
    };
    let bytes = path.and_then(|p| std::fs::read(p).ok());

    let builder = Response::builder()
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
    match bytes {
        Some(bytes) => builder
            .header(header::CONTENT_TYPE, content_type)
            .body(Cow::Owned(bytes)),
        None => builder
            .status(StatusCode::NOT_FOUND)
            .body(Cow::Borrowed(&[][..])),
    }
    .expect("static response parts are valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews_are_trimmed_and_capped() {
        assert_eq!(preview("  merhaba\n"), "merhaba");
        let long = "ğ".repeat(TEXT_PREVIEW_CHARS + 5);
        let p = preview(&long);
        assert_eq!(p.chars().count(), TEXT_PREVIEW_CHARS + 1);
        assert!(p.ends_with('…'));
    }

    #[test]
    fn height_follows_rows_up_to_a_cap() {
        assert_eq!(height_for(0), CHROME_HEIGHT + TILE_PITCH);
        assert_eq!(height_for(2), CHROME_HEIGHT + TILE_PITCH);
        assert_eq!(height_for(3), CHROME_HEIGHT + 2.0 * TILE_PITCH);
        assert_eq!(height_for(100), MAX_HEIGHT);
    }

    #[test]
    fn list_fits_one_tile_a_row_with_room_beside_it() {
        let (w, h) = size_for(PanelLayout::List, 3);
        assert_eq!(w, LIST_CARD_WIDTH + 2.0 * LIST_PAD + LIST_BUBBLES);
        assert_eq!(
            h,
            LIST_CHROME_HEIGHT + 3.0 * LIST_TILE_PITCH + 2.0 * LIST_PAD
        );
        assert_eq!(
            size_for(PanelLayout::List, 0),
            size_for(PanelLayout::List, 1)
        );
        assert_eq!(
            size_for(PanelLayout::List, 100).1,
            MAX_HEIGHT + 2.0 * LIST_PAD
        );
        assert_eq!(size_for(PanelLayout::Grid, 3), (WIDTH, height_for(3)));
    }

    #[test]
    fn list_bin_is_in_the_card_on_either_side() {
        let (right, _) = bin_spot_for(PanelLayout::List, BadgeCorner::BottomRight);
        let (left, _) = bin_spot_for(PanelLayout::List, BadgeCorner::TopLeft);
        assert_eq!(right - left, LIST_BUBBLES);
    }

    #[test]
    fn pdf_paths() {
        let id = Uuid::new_v4();
        assert_eq!(parse_pdf_path(&format!("/{id}.pdf")), Some(id));
        assert_eq!(parse_pdf_path(&format!("/{id}.png")), None);
        assert_eq!(parse_pdf_path("/../../gizli.pdf"), None);
    }

    #[test]
    fn image_paths() {
        let id = Uuid::new_v4();
        assert_eq!(parse_image_path(&format!("/{id}.png")), Some(id));
        assert_eq!(parse_image_path("/nope.png"), None);
        assert_eq!(parse_image_path(&format!("/{id}")), None);
    }
}
