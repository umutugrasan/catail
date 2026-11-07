//! The capture queue. Screenshots join it from the overlay toolbar; in text mode (picked on
//! the overlay's top bar) every Ctrl+C joins it too, files included, and files can be dropped
//! on the panel. While it has items, Ctrl+V pastes the whole queue instead of the clipboard.

pub mod item;
pub mod store;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::Result;
use image::RgbaImage;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, Runtime, WebviewWindow, WindowEvent};

use crate::clipboard::{self, Clip, Copied};
use crate::i18n::{t, t_with};
use crate::state::{AppState, UndoKind, UndoOffer};
use crate::{badge, hotkeys, notify, panel, preview};
use item::QueueItem;

/// How long "Geri al" stays on the badge after a paste or a clear.
pub const UNDO_FOR: Duration = Duration::from_secs(10);
static UNDO_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Some apps announce one copy several times; identical content this soon is ignored.
const DUPLICATE_WINDOW: Duration = Duration::from_millis(700);

/// `%TEMP%/catail`; each run gets its own session folder below it.
pub fn temp_root() -> PathBuf {
    std::env::temp_dir().join("catail")
}

pub fn add_image<R: Runtime>(app: &AppHandle<R>, img: &RgbaImage) -> Result<()> {
    remember(content_hash_image(img));
    app.state::<AppState>()
        .queue
        .lock()
        .unwrap()
        .push_image(img)?;
    withdraw_undo(app);
    changed(app);
    Ok(())
}

pub fn add_text<R: Runtime>(app: &AppHandle<R>, text: String, source_app: Option<String>) {
    remember(content_hash_text(&text));
    app.state::<AppState>()
        .queue
        .lock()
        .unwrap()
        .push(QueueItem::text(text, source_app));
    withdraw_undo(app);
    changed(app);
}

/// Queues files in the given order, by path. Whatever isn't a file (folders) is left out and
/// the user is told.
pub fn add_files<R: Runtime>(app: &AppHandle<R>, paths: Vec<PathBuf>, source_app: Option<String>) {
    remember(content_hash_paths(&paths));
    let state = app.state::<AppState>();
    let (added, left_out) = {
        let mut queue = state.queue.lock().unwrap();
        let total = paths.len();
        let added = paths
            .into_iter()
            .filter(|path| queue.push_file(path.clone(), source_app.clone()))
            .count();
        (added, total - added)
    };
    if added > 0 {
        withdraw_undo(app);
        changed(app);
    }
    if left_out > 0 {
        let msg = t_with(
            "notify.folders_skipped",
            &[("count", &left_out.to_string())],
        );
        notify::show(app, &t("app.name"), &msg);
    }
}

/// Lets files dragged from other apps onto this window join the queue. `hover_event` tells the
/// window when files are over it, so it can show that a drop would work.
pub fn accept_file_drops<R: Runtime>(window: &WebviewWindow<R>, hover_event: &'static str) {
    let app = window.app_handle().clone();
    let label = window.label().to_owned();
    window.on_window_event(move |event| {
        let WindowEvent::DragDrop(drop) = event else {
            return;
        };
        match drop {
            DragDropEvent::Enter { .. } => {
                let _ = app.emit_to(label.as_str(), hover_event, true);
            }
            DragDropEvent::Leave => {
                let _ = app.emit_to(label.as_str(), hover_event, false);
            }
            DragDropEvent::Drop { paths, .. } => {
                let _ = app.emit_to(label.as_str(), hover_event, false);
                let (app, paths) = (app.clone(), paths.clone());
                // Looking at each file can be slow on a network drive.
                std::thread::spawn(move || add_files(&app, paths, None));
            }
            _ => {}
        }
    });
}

/// Something new joined the queue: the user has moved on, so "Geri al" for the last paste or
/// clear gives way to the new queue, and what it would have brought back is let go.
fn withdraw_undo<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let offered = state.undo.lock().unwrap().take().is_some();
    if offered {
        state.queue.lock().unwrap().discard_set_aside();
    }
}

pub fn undo_last<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AppState>().queue.lock().unwrap().undo_last();
    changed(app);
}

/// Removes one item (the panel's ✕).
pub fn remove<R: Runtime>(app: &AppHandle<R>, id: uuid::Uuid) {
    app.state::<AppState>().queue.lock().unwrap().remove(id);
    changed(app);
}

/// Applies the order the user dragged items into in the panel.
pub fn reorder<R: Runtime>(app: &AppHandle<R>, order: &[uuid::Uuid]) {
    app.state::<AppState>().queue.lock().unwrap().reorder(order);
    changed(app);
}

/// Saves an edited image over its queue item. Returns whether the item was still there.
pub fn edit_image<R: Runtime>(app: &AppHandle<R>, id: uuid::Uuid, img: &RgbaImage) -> Result<bool> {
    let found = app
        .state::<AppState>()
        .queue
        .lock()
        .unwrap()
        .replace_image(id, img)?;
    changed(app);
    Ok(found)
}

/// Saves edited text over its queue item. Returns whether the item was still there.
pub fn edit_text<R: Runtime>(app: &AppHandle<R>, id: uuid::Uuid, text: String) -> bool {
    let found = app
        .state::<AppState>()
        .queue
        .lock()
        .unwrap()
        .replace_text(id, text);
    changed(app);
    found
}

/// Empties the queue and leaves text mode: everything is back to normal, with "Geri al"
/// offered for a while.
pub fn clear<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let count = state.queue.lock().unwrap().set_aside_all();
    state.text_mode.store(false, Ordering::SeqCst);
    offer_undo(app, UndoKind::Clear, count);
    changed(app);
}

/// After a paste: the pasted items leave the queue (so Ctrl+V is normal again) but can be
/// brought back with "Geri al".
pub fn set_aside_pasted<R: Runtime>(app: &AppHandle<R>, ids: &[uuid::Uuid]) {
    let count = app.state::<AppState>().queue.lock().unwrap().set_aside(ids);
    offer_undo(app, UndoKind::Paste, count);
}

/// "Geri al": brings back what the last paste or clear took away.
pub fn restore<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let offer = state.undo.lock().unwrap().take();
    state.queue.lock().unwrap().restore();
    if let Some(offer) = offer {
        badge::fetch(app, offer.count);
    }
    changed(app);
}

/// The ✕ on "Geri al": the offer goes now, and what it would have brought back with it.
pub fn dismiss_undo<R: Runtime>(app: &AppHandle<R>) {
    withdraw_undo(app);
    changed(app);
}

fn offer_undo<R: Runtime>(app: &AppHandle<R>, kind: UndoKind, count: usize) {
    if count == 0 {
        return;
    }
    let generation = UNDO_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    *app.state::<AppState>().undo.lock().unwrap() = Some(UndoOffer {
        kind,
        count,
        until: Instant::now() + UNDO_FOR,
        generation,
    });
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(UNDO_FOR);
        let state = app.state::<AppState>();
        let mut undo = state.undo.lock().unwrap();
        if undo.is_some_and(|u| u.generation == generation) {
            undo.take();
            drop(undo);
            state.queue.lock().unwrap().discard_set_aside();
            changed(&app);
        }
    });
}

pub fn set_text_mode<R: Runtime>(app: &AppHandle<R>, on: bool) {
    app.state::<AppState>()
        .text_mode
        .store(on, Ordering::SeqCst);
    changed(app);
}

/// Call after any change to the queue, text mode or the editor being open. The clipboard is
/// only watched in text mode, and Ctrl+V is only taken over while the queue has items;
/// otherwise both keys behave normally. They also do while the editor is open, whose text
/// boxes need their own copy and paste.
pub fn changed<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let has_items = state.queue.lock().unwrap().len() > 0;
    #[cfg(windows)]
    clipboard::watcher::set_active(state.text_mode.load(Ordering::SeqCst));
    hotkeys::set_queue_paste(app, has_items && !preview::is_open());
    badge::refresh(app);
    panel::refresh(app);
}

/// Clipboard watcher callback: the user copied something in text mode.
pub fn on_clipboard_changed<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if state.pasting.load(Ordering::SeqCst) || clipboard::is_self_write() || preview::is_open() {
        return;
    }
    if !state.text_mode.load(Ordering::SeqCst) {
        return;
    }
    let result = match clipboard::read_for_queue() {
        Ok(Some(Clip {
            content: Copied::Text(text),
            source_app,
        })) => {
            if !is_recent_duplicate(content_hash_text(&text)) {
                add_text(app, text, source_app);
            }
            Ok(())
        }
        Ok(Some(Clip {
            content: Copied::Image(img),
            ..
        })) => {
            if is_recent_duplicate(content_hash_image(&img)) {
                Ok(())
            } else {
                add_image(app, &img)
            }
        }
        Ok(Some(Clip {
            content: Copied::Files(paths),
            source_app,
        })) => {
            if !is_recent_duplicate(content_hash_paths(&paths)) {
                add_files(app, paths, source_app);
            }
            Ok(())
        }
        Ok(None) => Ok(()),
        Err(e) => Err(e),
    };
    if let Err(e) = result {
        let msg = t_with("notify.queue_add_failed", &[("error", &format!("{e:#}"))]);
        notify::show(app, &t("app.name"), &msg);
    }
}

static LAST_ADDED: Mutex<Option<(u64, Instant)>> = Mutex::new(None);

fn remember(hash: u64) {
    *LAST_ADDED.lock().unwrap() = Some((hash, Instant::now()));
}

fn is_recent_duplicate(hash: u64) -> bool {
    LAST_ADDED
        .lock()
        .unwrap()
        .is_some_and(|(last, at)| last == hash && at.elapsed() < DUPLICATE_WINDOW)
}

fn content_hash_text(text: &str) -> u64 {
    let mut h = DefaultHasher::new();
    text.hash(&mut h);
    h.finish()
}

fn content_hash_paths(paths: &[PathBuf]) -> u64 {
    let mut h = DefaultHasher::new();
    paths.hash(&mut h);
    h.finish()
}

fn content_hash_image(img: &RgbaImage) -> u64 {
    let mut h = DefaultHasher::new();
    img.dimensions().hash(&mut h);
    img.as_raw().hash(&mut h);
    h.finish()
}
