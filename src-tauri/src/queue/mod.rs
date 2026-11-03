//! The capture queue, started from the overlay's "Kuyruk oluştur" button and pasted in order.

pub mod item;
pub mod store;

use std::path::PathBuf;

use anyhow::Result;
use image::RgbaImage;
use tauri::{AppHandle, Manager, Runtime};

use crate::badge;
use crate::state::AppState;

/// `%TEMP%/clipqueue`; each run gets its own session folder below it.
pub fn temp_root() -> PathBuf {
    std::env::temp_dir().join("clipqueue")
}

pub fn add_image<R: Runtime>(app: &AppHandle<R>, img: &RgbaImage) -> Result<()> {
    app.state::<AppState>()
        .queue
        .lock()
        .unwrap()
        .push_image(img)?;
    badge::refresh(app);
    Ok(())
}

pub fn undo_last<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AppState>().queue.lock().unwrap().undo_last();
    badge::refresh(app);
}

pub fn clear<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AppState>().queue.lock().unwrap().clear();
    badge::refresh(app);
}
