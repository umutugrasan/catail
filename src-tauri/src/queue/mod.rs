//! The capture queue. Screenshots join it from the overlay toolbar; in text mode (picked on
//! the overlay's top bar) every Ctrl+C joins it too. While it has items, Ctrl+V pastes the
//! whole queue instead of the clipboard.

pub mod item;
pub mod store;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::Result;
use image::RgbaImage;
use tauri::{AppHandle, Manager, Runtime};

use crate::clipboard::{self, Clip, Copied};
use crate::i18n::{t, t_with};
use crate::state::AppState;
use crate::{badge, hotkeys, notify};
use item::QueueItem;

/// Some apps announce one copy several times; identical content this soon is ignored.
const DUPLICATE_WINDOW: Duration = Duration::from_millis(700);

/// `%TEMP%/clipqueue`; each run gets its own session folder below it.
pub fn temp_root() -> PathBuf {
    std::env::temp_dir().join("clipqueue")
}

pub fn add_image<R: Runtime>(app: &AppHandle<R>, img: &RgbaImage) -> Result<()> {
    remember(content_hash_image(img));
    app.state::<AppState>()
        .queue
        .lock()
        .unwrap()
        .push_image(img)?;
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
    changed(app);
}

pub fn undo_last<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AppState>().queue.lock().unwrap().undo_last();
    changed(app);
}

/// Empties the queue and leaves text mode: everything is back to normal.
pub fn clear<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    state.queue.lock().unwrap().clear();
    state.text_mode.store(false, Ordering::SeqCst);
    changed(app);
}

pub fn set_text_mode<R: Runtime>(app: &AppHandle<R>, on: bool) {
    app.state::<AppState>()
        .text_mode
        .store(on, Ordering::SeqCst);
    changed(app);
}

/// Call after any change to the queue or text mode. The clipboard is only watched in text
/// mode, and Ctrl+V is only taken over while the queue has items; otherwise both keys
/// behave normally.
pub fn changed<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let has_items = state.queue.lock().unwrap().len() > 0;
    #[cfg(windows)]
    clipboard::watcher::set_active(state.text_mode.load(Ordering::SeqCst));
    hotkeys::set_queue_paste(app, has_items);
    badge::refresh(app);
}

/// Clipboard watcher callback: the user copied something in text mode.
pub fn on_clipboard_changed<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if state.pasting.load(Ordering::SeqCst) || clipboard::is_self_write() {
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

fn content_hash_image(img: &RgbaImage) -> u64 {
    let mut h = DefaultHasher::new();
    img.dimensions().hash(&mut h);
    img.as_raw().hash(&mut h);
    h.finish()
}
