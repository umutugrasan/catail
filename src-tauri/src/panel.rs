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
use crate::state::AppState;

const LABEL: &str = "panel";
const URL: &str = "src/windows/panel/index.html";
pub const EVENT_UPDATE: &str = "panel:update";
/// Sent on every open so the panel replays its entrance animation.
pub const EVENT_OPENED: &str = "panel:opened";
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
            let corner = app
                .state::<AppState>()
                .settings
                .lock()
                .unwrap()
                .badge_corner;
            let _ = app.emit_to(LABEL, EVENT_OPENED, corner);
            let _ = window.show();
        }
        Err(e) => eprintln!("{e:#}"),
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

fn ensure_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(LABEL) {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(URL.into()))
        .title("Catail")
        .inner_size(WIDTH, height_for(0))
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // Rounded corners and a shadow on Windows 11.
        .shadow(true)
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
    let corner = state.settings.lock().unwrap().badge_corner;
    let (w, h) = ((WIDTH * scale).round(), (height_for(count) * scale).round());
    let (top, height) = (f64::from(area.position.y), f64::from(area.size.height));
    let x = crate::badge::aligned_x(
        corner,
        f64::from(area.position.x),
        f64::from(area.size.width),
        w,
        MARGIN * scale,
    );
    let y = if corner.is_top() {
        (top + (MARGIN + BADGE_HEIGHT + GAP) * scale).min(top + height - h)
    } else {
        (top + height - (MARGIN + BADGE_HEIGHT + GAP) * scale - h).max(top)
    };
    let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
    let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
}

/// Fits the grid's rows, so a short queue gets a short panel.
pub fn height_for(count: usize) -> f64 {
    let rows = count.div_ceil(COLUMNS).max(1);
    (CHROME_HEIGHT + rows as f64 * TILE_PITCH).min(MAX_HEIGHT)
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
