//! Tauri commands exposed to the overlay and settings windows.

use std::path::PathBuf;

use chrono::{DateTime, Local};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::badge::{self, BadgeState};
use crate::capture::region::{self, SelectionRect};
use crate::i18n::{t, t_with};
use crate::panel::{self, ItemView};
use crate::state::AppState;
use crate::{clipboard, notify, overlay, paste, queue};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInfo {
    session: u64,
    index: usize,
    /// Frame size in physical pixels.
    width: u32,
    height: u32,
    /// Items already queued; decides between "create queue" and "add to queue".
    queue_count: usize,
    text_mode: bool,
}

#[tauri::command]
pub fn overlay_session(window: WebviewWindow, state: State<'_, AppState>) -> Option<OverlayInfo> {
    let index = overlay::index_of(window.label())?;
    let session = state.session.lock().unwrap();
    let session = session.as_ref()?;
    let shot = session.shots.get(index)?;
    Some(OverlayInfo {
        session: session.id,
        index,
        width: shot.image.width(),
        height: shot.image.height(),
        queue_count: state.queue.lock().unwrap().len(),
        text_mode: state.text_mode.load(std::sync::atomic::Ordering::SeqCst),
    })
}

#[tauri::command]
pub fn overlay_ready(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    overlay::show_ready(&app, &window).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn overlay_selection_started(app: AppHandle, window: WebviewWindow) {
    overlay::clear_other_selections(&app, window.label());
}

#[tauri::command]
pub fn overlay_cancel(app: AppHandle) {
    overlay::close_all(&app);
}

/// What to do with a finished capture.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Delivery {
    Copy,
    /// Starts the queue, or appends to the existing one.
    Enqueue,
    Save,
}

impl Delivery {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "copy" => Some(Self::Copy),
            "enqueue" => Some(Self::Enqueue),
            "save" => Some(Self::Save),
            _ => None,
        }
    }
}

/// Selection without drawings: cropped from the frozen frame in Rust, pixel for pixel.
#[tauri::command]
pub async fn capture_deliver(
    app: AppHandle,
    window: WebviewWindow,
    rect: SelectionRect,
    action: Delivery,
) -> Result<(), String> {
    let image = take_selection(&app, &window, rect)?;
    deliver(&app, image, action)
}

/// Selection with drawings: the overlay composes it at full resolution and sends the PNG as
/// the raw request body, with the action in the `x-action` header.
#[tauri::command]
pub async fn capture_deliver_annotated(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(png) = request.body() else {
        return Err("expected a raw PNG body".into());
    };
    let action = request
        .headers()
        .get("x-action")
        .and_then(|v| v.to_str().ok())
        .and_then(Delivery::parse)
        .ok_or("missing or unknown x-action header")?;
    overlay::close_all(&app);
    let image = image::load_from_memory(png)
        .map_err(|e| format!("cannot decode annotated capture: {e}"))?
        .to_rgba8();
    deliver(&app, image, action)
}

fn deliver(app: &AppHandle, image: image::RgbaImage, action: Delivery) -> Result<(), String> {
    match action {
        Delivery::Copy => {
            clipboard::write_image(&image).map_err(|e| report(app, "notify.copy_failed", e))
        }
        Delivery::Enqueue => {
            queue::add_image(app, &image).map_err(|e| report(app, "notify.queue_add_failed", e))
        }
        Delivery::Save => {
            save_with_dialog(app, image);
            Ok(())
        }
    }
}

/// Overlay top bar. Turning text mode on closes the overlay so the user can start copying;
/// turning it off keeps the overlay open.
#[tauri::command]
pub fn text_mode_set(app: AppHandle, enabled: bool) {
    if enabled {
        overlay::close_all(&app);
    }
    queue::set_text_mode(&app, enabled);
}

/// Badge click. Async: the panel window may be created here.
#[tauri::command]
pub async fn panel_toggle(app: AppHandle) {
    panel::toggle(&app);
}

#[tauri::command]
pub fn panel_close(app: AppHandle) {
    panel::hide(&app);
}

/// Panel "Yapıştır". The panel never takes focus, so the target app is still in front.
#[tauri::command]
pub async fn panel_paste(app: AppHandle) {
    panel::hide(&app);
    paste::run(&app);
}

#[tauri::command]
pub fn queue_items(app: AppHandle) -> Vec<ItemView> {
    panel::items(&app)
}

#[tauri::command]
pub fn queue_remove(app: AppHandle, id: uuid::Uuid) {
    queue::remove(&app, id);
}

#[tauri::command]
pub fn queue_reorder(app: AppHandle, ids: Vec<uuid::Uuid>) {
    queue::reorder(&app, &ids);
}

/// Clears the queue from the overlay toolbar; the overlay stays open.
#[tauri::command]
pub fn queue_clear(app: AppHandle) {
    queue::clear(&app);
}

fn report(app: &AppHandle, key: &str, error: anyhow::Error) -> String {
    let msg = t_with(key, &[("error", &format!("{error:#}"))]);
    notify::show(app, &t("app.name"), &msg);
    msg
}

#[tauri::command]
pub fn badge_state(app: AppHandle) -> BadgeState {
    badge::current(&app)
}

/// The overlays are already closed, so the always-on-top windows don't cover the dialog.
fn save_with_dialog(app: &AppHandle, image: image::RgbaImage) {
    let mut dialog = app
        .dialog()
        .file()
        .set_title(t("save.dialog_title"))
        .set_file_name(default_file_name(Local::now()))
        .add_filter(t("save.filter_name"), &["png"]);
    if let Ok(dir) = app.path().picture_dir() {
        dialog = dialog.set_directory(dir);
    }

    let app_for_result = app.clone();
    dialog.save_file(move |picked| {
        let Some(picked) = picked else { return };
        let result = picked
            .into_path()
            .map_err(|e| e.to_string())
            .map(with_png_extension)
            .and_then(|path| image.save(&path).map_err(|e| e.to_string()));
        if let Err(e) = result {
            let msg = t_with("notify.save_failed", &[("error", &e)]);
            notify::show(&app_for_result, &t("app.name"), &msg);
        }
    });
}

/// Crops the selection, then closes the overlays (which frees the frozen frames).
fn take_selection(
    app: &AppHandle,
    window: &WebviewWindow,
    rect: SelectionRect,
) -> Result<image::RgbaImage, String> {
    let index = overlay::index_of(window.label()).ok_or("not an overlay window")?;
    let result = region::crop_selection(&app.state::<AppState>(), index, rect);
    overlay::close_all(app);
    result.map_err(|e| format!("{e:#}"))
}

pub fn default_file_name(now: DateTime<Local>) -> String {
    format!("ClipQueue_{}.png", now.format("%Y-%m-%d_%H-%M-%S"))
}

pub fn with_png_extension(path: PathBuf) -> PathBuf {
    let is_png = path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("png"));
    if is_png {
        path
    } else {
        let mut name = path.into_os_string();
        name.push(".png");
        name.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn file_name_has_timestamp() {
        let now = Local.with_ymd_and_hms(2026, 11, 3, 9, 5, 7).unwrap();
        assert_eq!(default_file_name(now), "ClipQueue_2026-11-03_09-05-07.png");
    }

    #[test]
    fn delivery_actions_parse() {
        assert_eq!(Delivery::parse("copy"), Some(Delivery::Copy));
        assert_eq!(Delivery::parse("enqueue"), Some(Delivery::Enqueue));
        assert_eq!(Delivery::parse("save"), Some(Delivery::Save));
        assert_eq!(Delivery::parse("print"), None);
    }

    #[test]
    fn png_extension_is_added_once() {
        assert_eq!(
            with_png_extension("a/shot".into()),
            PathBuf::from("a/shot.png")
        );
        assert_eq!(
            with_png_extension("a/shot.PNG".into()),
            PathBuf::from("a/shot.PNG")
        );
        assert_eq!(
            with_png_extension("a/shot.jpg".into()),
            PathBuf::from("a/shot.jpg.png")
        );
    }
}
