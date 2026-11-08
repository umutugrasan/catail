//! Tauri commands exposed to the overlay and settings windows.

use std::path::PathBuf;

use chrono::{DateTime, Local};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::badge::{self, BadgeState};
use crate::capture::region::{self, SelectionRect};
use crate::i18n::{t, t_with};
use crate::panel::{self, ItemView};
use crate::queue::item::QueueItemKind;
use crate::settings::{Cat, CustomCat, Settings};
use crate::state::AppState;
use crate::translate::{self, Translation};
use crate::updater::{self, UpdateInfo};
use crate::{clipboard, export, hotkeys, notify, ocr, overlay, paste, qr, queue, tray};
use tauri_plugin_autostart::ManagerExt;

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
    /// Where queued captures fly to (the badge), in physical px relative to this monitor.
    fly_x: Option<f64>,
    fly_y: Option<f64>,
}

#[tauri::command]
pub fn overlay_session(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Option<OverlayInfo> {
    let index = overlay::index_of(window.label())?;
    let session = state.session.lock().unwrap();
    let session = session.as_ref()?;
    let shot = session.shots.get(index)?;
    let fly = badge::fly_target(&app);
    Some(OverlayInfo {
        session: session.id,
        index,
        width: shot.image.width(),
        height: shot.image.height(),
        queue_count: state.queue.lock().unwrap().len(),
        text_mode: state.text_mode.load(std::sync::atomic::Ordering::SeqCst),
        fly_x: fly.map(|(x, _)| x - f64::from(shot.x)),
        fly_y: fly.map(|(_, y)| y - f64::from(shot.y)),
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

/// The editor's "Kaydet" for an image: the edited PNG as a raw body, the item's id in a header.
#[tauri::command]
pub async fn queue_edit_image(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(png) = request.body() else {
        return Err("expected a raw PNG body".into());
    };
    let id = request
        .headers()
        .get("x-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| uuid::Uuid::parse_str(v).ok())
        .ok_or("missing or invalid x-id header")?;
    let image = image::load_from_memory(png)
        .map_err(|e| format!("cannot decode edited image: {e}"))?
        .to_rgba8();
    match queue::edit_image(&app, id, &image) {
        Ok(true) => Ok(()),
        Ok(false) => Err("the item is no longer in the queue".into()),
        Err(e) => Err(format!("{e:#}")),
    }
}

/// The editor's "Kaydet" for a text. An empty text wouldn't paste anything, so it's refused.
#[tauri::command]
pub fn queue_edit_text(app: AppHandle, id: uuid::Uuid, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("the text is empty".into());
    }
    if queue::edit_text(&app, id, text) {
        Ok(())
    } else {
        Err("the item is no longer in the queue".into())
    }
}

#[derive(Debug, Serialize)]
pub struct SettingsView {
    settings: Settings,
    version: String,
    /// The interface language "same as Windows" means here.
    system_language: String,
}

#[tauri::command]
pub fn settings_get(app: AppHandle, state: State<'_, AppState>) -> SettingsView {
    let mut settings = state.settings.lock().unwrap().clone();
    // The registry is the source of truth for autostart.
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        settings.autostart = enabled;
    }
    SettingsView {
        settings,
        version: app.package_info().version.to_string(),
        system_language: crate::i18n::system_language(),
    }
}

fn remember_translate_target(app: &AppHandle, target: &str) {
    if !translate::is_language_code(target) {
        return;
    }
    let state = app.state::<AppState>();
    let mut settings = state.settings.lock().unwrap();
    if settings.translate_to != target {
        settings.translate_to = target.to_owned();
        if let Err(e) = settings.save() {
            eprintln!("{e:#}");
        }
    }
}

/// Validates, applies (hotkeys, autostart) and saves. Async: hotkey changes wait for the
/// main thread. On a hotkey error nothing is changed.
#[tauri::command]
pub async fn settings_save(app: AppHandle, settings: Settings) -> Result<(), String> {
    let next = settings.sanitized();
    let previous = app.state::<AppState>().settings.lock().unwrap().clone();
    if next.hotkeys != previous.hotkeys {
        hotkeys::apply(&app, &next.hotkeys, &previous.hotkeys).map_err(|e| e.message())?;
    }
    let autolaunch = app.autolaunch();
    if autolaunch.is_enabled().ok() != Some(next.autostart) {
        let result = if next.autostart {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        result.map_err(|e| t_with("settings.autostart_failed", &[("error", &e.to_string())]))?;
    }
    next.save()
        .map_err(|e| t_with("settings.save_failed", &[("error", &format!("{e:#}"))]))?;
    let language_changed = next.language != previous.language;
    let corner_changed = next.badge_corner != previous.badge_corner;
    *app.state::<AppState>().settings.lock().unwrap() = next.clone();
    if language_changed {
        let before = crate::i18n::current();
        if crate::i18n::set_language(next.language.as_deref()) != before {
            tray::retitle(&app);
            crate::shell_menu::register();
            // Every window reloads itself in the new language.
            let _ = app.emit(EVENT_LANGUAGE, crate::i18n::current());
        }
    }
    if corner_changed {
        panel::hide(&app);
        badge::reposition(&app);
    }
    Ok(())
}

/// Sent to every window after the interface language changes.
pub const EVENT_LANGUAGE: &str = "app:language";
pub const EVENT_CAT: &str = "app:cat";

/// The cat every window dresses for.
#[tauri::command]
pub fn ui_cat(state: State<'_, AppState>) -> Cat {
    state.settings.lock().unwrap().cat
}

/// A cat picked in Settings. Saved and shown everywhere right away, unlike the rest of the page.
#[tauri::command]
pub fn cat_set(app: AppHandle, state: State<'_, AppState>, cat: Cat) -> Result<(), String> {
    let mut settings = state.settings.lock().unwrap();
    settings.cat = cat;
    let saved = settings.save();
    drop(settings);
    let _ = app.emit(EVENT_CAT, cat);
    saved.map_err(|e| t_with("settings.save_failed", &[("error", &format!("{e:#}"))]))
}

pub const EVENT_PLAIN_ACCENT: &str = "app:plain-accent";

#[tauri::command]
pub fn ui_plain_accent(state: State<'_, AppState>) -> String {
    state.settings.lock().unwrap().plain_accent.clone()
}

/// The plain theme's color, picked in Settings. Saved and shown everywhere right away.
#[tauri::command]
pub fn plain_accent_set(
    app: AppHandle,
    state: State<'_, AppState>,
    color: String,
) -> Result<(), String> {
    let color = color.to_lowercase();
    if !crate::settings::is_hex_color(&color) {
        return Err(format!("not a color: {color}"));
    }
    let mut settings = state.settings.lock().unwrap();
    settings.plain_accent = color.clone();
    let saved = settings.save();
    drop(settings);
    let _ = app.emit(EVENT_PLAIN_ACCENT, color);
    saved.map_err(|e| t_with("settings.save_failed", &[("error", &format!("{e:#}"))]))
}

pub const EVENT_CUSTOM_CAT: &str = "app:custom-cat";

#[tauri::command]
pub fn ui_custom_cat(state: State<'_, AppState>) -> CustomCat {
    state.settings.lock().unwrap().custom_cat.clone()
}

/// "Kendi kedin": its colors, picked in Settings. Saved and shown everywhere right away.
#[tauri::command]
pub fn custom_cat_set(
    app: AppHandle,
    state: State<'_, AppState>,
    custom: CustomCat,
) -> Result<(), String> {
    let custom = custom.tidied();
    let mut settings = state.settings.lock().unwrap();
    settings.custom_cat = custom.clone();
    let saved = settings.save();
    drop(settings);
    let _ = app.emit(EVENT_CUSTOM_CAT, custom);
    saved.map_err(|e| t_with("settings.save_failed", &[("error", &format!("{e:#}"))]))
}

/// The interface language for the windows' strings, e.g. "en".
#[tauri::command]
pub fn ui_language() -> String {
    crate::i18n::current()
}

/// Recorder feedback: the readable form of a valid shortcut, or why it can't be used.
#[tauri::command]
pub fn hotkey_check(accelerator: String) -> Result<String, String> {
    hotkeys::validate(&accelerator)
        .map(|_| hotkeys::pretty(&accelerator))
        .map_err(|e| e.message())
}

/// While recording a shortcut, our own global shortcuts must not swallow the keys.
#[tauri::command]
pub async fn hotkeys_suspend(app: AppHandle) {
    hotkeys::suspend(&app);
}

#[tauri::command]
pub async fn hotkeys_resume(app: AppHandle) {
    hotkeys::resume(&app);
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    updater::check(&app).await.map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    updater::install(&app).await.map_err(|e| format!("{e:#}"))
}

/// "Metni al" on the overlay: recognizes text in the selection. The overlay stays open.
#[tauri::command]
pub async fn capture_ocr(
    app: AppHandle,
    window: WebviewWindow,
    rect: SelectionRect,
) -> Result<String, String> {
    let index = overlay::index_of(window.label()).ok_or("not an overlay window")?;
    let image = region::crop_selection(&app.state::<AppState>(), index, rect)
        .map_err(|e| format!("{e:#}"))?;
    tauri::async_runtime::spawn_blocking(move || ocr::recognize(&image))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

/// QR codes anywhere on this overlay's frozen frame, with their links. Runs in the background
/// right after the overlay shows; the overlay puts each link next to its code.
#[tauri::command]
pub async fn capture_qr(app: AppHandle, window: WebviewWindow) -> Result<Vec<qr::QrCode>, String> {
    let index = overlay::index_of(window.label()).ok_or("not an overlay window")?;
    let (w, h, luma) = {
        let state = app.state::<AppState>();
        let session = state.session.lock().unwrap();
        let shot = session
            .as_ref()
            .and_then(|s| s.shots.get(index))
            .ok_or("no capture")?;
        let (w, h) = (shot.image.width() as usize, shot.image.height() as usize);
        (w, h, qr::luma(&shot.image))
    };
    tauri::async_runtime::spawn_blocking(move || qr::find(w, h, &luma))
        .await
        .map_err(|e| e.to_string())
}

/// Opens a QR code's web address in the browser, then closes the overlays. In that order: the
/// overlay still has the foreground and hands it to the browser.
#[tauri::command]
pub fn open_link(app: AppHandle, url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let opened = qr::open(&url).map_err(|e| format!("{e:#}"));
        if opened.is_ok() {
            overlay::close_all(&app);
        }
        opened
    }
    #[cfg(not(windows))]
    {
        let _ = (app, url);
        Err("not supported".into())
    }
}

#[tauri::command]
pub fn clipboard_write_text(text: String) -> Result<(), String> {
    clipboard::write_text(&text).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub fn queue_add_text(app: AppHandle, text: String) {
    queue::add_text(&app, text, None);
}

/// Translates into `target` and remembers it as the language to offer next time.
#[tauri::command]
pub async fn translate_text(
    app: AppHandle,
    text: String,
    target: String,
) -> Result<Translation, String> {
    remember_translate_target(&app, &target);
    translate::translate(&text, &target)
        .await
        .map_err(|e| t_with("ocr.translate_failed", &[("error", &format!("{e:#}"))]))
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Zip,
    Pdf,
}

/// Panel "Dışa aktar". For PDF the panel renders text items into page images (it has the
/// fonts) and passes them as base64 PNGs keyed by item id. Returns the saved path, or `None`
/// when the user cancels the dialog.
#[tauri::command]
pub async fn queue_export(
    app: AppHandle,
    format: ExportFormat,
    text_pages: std::collections::HashMap<uuid::Uuid, String>,
) -> Result<Option<String>, String> {
    use base64::Engine;

    let items = app
        .state::<AppState>()
        .queue
        .lock()
        .unwrap()
        .items()
        .to_vec();
    if items.is_empty() {
        return Ok(None);
    }
    // A PDF can't hold files; don't ask where to save an empty one.
    let only_files = items.iter().all(|i| i.kind == QueueItemKind::File);
    if matches!(format, ExportFormat::Pdf) && only_files {
        return Err(t("export.pdf_only_files"));
    }
    // The panel is always on top and would cover the dialog.
    panel::hide(&app);

    let (extension, filter) = match format {
        ExportFormat::Zip => ("zip", t("export.zip_filter")),
        ExportFormat::Pdf => ("pdf", t("export.pdf_filter")),
    };
    let mut dialog = app
        .dialog()
        .file()
        .set_title(t("export.dialog_title"))
        .set_file_name(format!(
            "Catail_Kuyruk_{}.{extension}",
            Local::now().format("%Y-%m-%d_%H-%M-%S")
        ))
        .add_filter(filter, &[extension]);
    if let Ok(dir) = app.path().document_dir() {
        dialog = dialog.set_directory(dir);
    }
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_save_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    let path = match path.extension() {
        Some(ext) if ext.eq_ignore_ascii_case(extension) => path,
        _ => path.with_extension(extension),
    };

    let target = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || match format {
        ExportFormat::Zip => export::write_zip(&items, &target),
        ExportFormat::Pdf => {
            let mut pages = std::collections::HashMap::new();
            for (id, encoded) in text_pages {
                let png = base64::engine::general_purpose::STANDARD
                    .decode(encoded)
                    .map_err(|e| anyhow::anyhow!("bad text page: {e}"))?;
                pages.insert(id, image::load_from_memory(&png)?.to_rgba8());
            }
            export::write_pdf(&items, &pages, &target)
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    match result {
        Ok(left_out) => {
            let shown = path.display().to_string();
            let mut message = t_with("notify.export_done", &[("path", &shown)]);
            if left_out > 0 {
                let key = match format {
                    ExportFormat::Zip => "notify.export_zip_unreadable",
                    ExportFormat::Pdf => "notify.export_pdf_left_out",
                };
                message.push('\n');
                message.push_str(&t_with(key, &[("count", &left_out.to_string())]));
            }
            notify::show(&app, &t("app.name"), &message);
            Ok(Some(shown))
        }
        Err(e) => Err(report(&app, "notify.export_failed", e)),
    }
}

/// Panel zoom button. Async: the preview window may be created here.
#[tauri::command]
pub async fn preview_open(app: AppHandle, id: uuid::Uuid) -> Result<(), String> {
    crate::preview::open(&app, id).map_err(|e| format!("{e:#}"))
}

/// The image the preview window should show, for a window that has only just loaded.
#[tauri::command]
pub fn preview_current() -> Option<uuid::Uuid> {
    crate::preview::current()
}

#[tauri::command]
pub fn preview_close(app: AppHandle) {
    crate::preview::close(&app);
}

/// Badge "Geri al": brings back what the last paste or clear removed.
#[tauri::command]
pub fn queue_restore(app: AppHandle) {
    queue::restore(&app);
}

#[tauri::command]
pub fn undo_dismiss(app: AppHandle) {
    queue::dismiss_undo(&app);
}

/// Clears the queue from the overlay toolbar; the overlay stays open.
#[tauri::command]
pub fn queue_clear(app: AppHandle, leap: Option<bool>) {
    // From the panel's bin: the cat jumps from there into the badge's box.
    if leap == Some(true) {
        badge::leap(&app);
    }
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

#[tauri::command]
pub fn badge_make_room(app: AppHandle, room: bool) {
    badge::make_room(&app, room);
}

#[tauri::command]
pub fn badge_cat_away(app: AppHandle, ms: u64) {
    badge::cat_away(&app, ms);
}

#[tauri::command]
pub fn badge_cursor(app: AppHandle) -> Option<(f64, f64)> {
    badge::cursor(&app)
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
    format!("Catail_{}.png", now.format("%Y-%m-%d_%H-%M-%S"))
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
        assert_eq!(default_file_name(now), "Catail_2026-11-03_09-05-07.png");
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
