//! Tauri commands exposed to the overlay and settings windows.

use std::path::PathBuf;

use chrono::{DateTime, Local};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::badge::{self, BadgeState};
use crate::capture::region::{self, SelectionRect};
use crate::i18n::{t, t_with};
use crate::state::AppState;
use crate::{clipboard, notify, overlay, queue};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayInfo {
    session: u64,
    index: usize,
    /// Frame size in physical pixels.
    width: u32,
    height: u32,
    /// Confirming adds to the queue instead of copying.
    queue_mode: bool,
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
        queue_mode: state.is_queue_mode(),
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

/// Copy (normal mode) or add to the queue (queue mode).
#[tauri::command]
pub async fn capture_commit(
    app: AppHandle,
    window: WebviewWindow,
    rect: SelectionRect,
) -> Result<(), String> {
    let image = take_selection(&app, &window, rect)?;
    let (result, error_key) = if app.state::<AppState>().is_queue_mode() {
        (queue::add_image(&app, &image), "notify.queue_add_failed")
    } else {
        (clipboard::write_image(&image), "notify.copy_failed")
    };
    result.map_err(|e| {
        let msg = t_with(error_key, &[("error", &format!("{e:#}"))]);
        notify::show(&app, &t("app.name"), &msg);
        msg
    })
}

#[tauri::command]
pub fn badge_state(app: AppHandle) -> BadgeState {
    badge::current(&app)
}

#[tauri::command]
pub async fn capture_save(
    app: AppHandle,
    window: WebviewWindow,
    rect: SelectionRect,
) -> Result<(), String> {
    // The overlays close first so the always-on-top windows don't cover the dialog.
    let image = take_selection(&app, &window, rect)?;

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
    Ok(())
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
