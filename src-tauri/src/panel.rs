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

/// URI scheme for queued images: `queue://localhost/<item id>.png`.
pub const PROTOCOL: &str = "queue";

/// Logical size; the panel sits above the badge (see `badge.rs` for its size and margin).
const WIDTH: f64 = 300.0;
const HEIGHT: f64 = 460.0;
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
    pub source_app: Option<String>,
}

impl From<&QueueItem> for ItemView {
    fn from(item: &QueueItem) -> Self {
        Self {
            id: item.id,
            kind: item.kind,
            preview: item.text.as_deref().map(preview),
            full_text: item.text.clone(),
            source_app: item.source_app.clone(),
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
            let _ = app.emit_to(LABEL, EVENT_OPENED, ());
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
    } else {
        let _ = app.emit_to(LABEL, EVENT_UPDATE, items);
    }
}

fn ensure_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(LABEL) {
        return Ok(window);
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(URL.into()))
        .title("Stack Screen")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        // Rounded corners and a shadow on Windows 11.
        .shadow(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .build()
        .context("cannot create panel window")
}

/// Right-aligned with the badge, directly above it.
fn place<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (w, h) = ((WIDTH * scale).round(), (HEIGHT * scale).round());
    let x = f64::from(area.position.x) + f64::from(area.size.width) - w - MARGIN * scale;
    let bottom = f64::from(area.position.y) + f64::from(area.size.height)
        - (MARGIN + BADGE_HEIGHT + GAP) * scale;
    let y = (bottom - h).max(f64::from(area.position.y));
    let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
    let _ = window.set_size(PhysicalSize::new(w as u32, h as u32));
}

/// Parses `/<uuid>.png`.
pub fn parse_image_path(path: &str) -> Option<Uuid> {
    let name = path.trim_start_matches('/').strip_suffix(".png")?;
    Uuid::parse_str(name).ok()
}

/// Serves queued images to the panel's thumbnails.
pub fn serve<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let state = ctx.app_handle().state::<AppState>();
    let path = parse_image_path(request.uri().path()).and_then(|id| {
        let queue = state.queue.lock().unwrap();
        queue.get(id)?.image_path.clone()
    });
    let bytes = path.and_then(|p| std::fs::read(p).ok());

    let builder = Response::builder().header(header::CACHE_CONTROL, "no-store");
    match bytes {
        Some(png) => builder
            .header(header::CONTENT_TYPE, "image/png")
            .body(Cow::Owned(png)),
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
    fn image_paths() {
        let id = Uuid::new_v4();
        assert_eq!(parse_image_path(&format!("/{id}.png")), Some(id));
        assert_eq!(parse_image_path("/nope.png"), None);
        assert_eq!(parse_image_path(&format!("/{id}")), None);
    }
}
