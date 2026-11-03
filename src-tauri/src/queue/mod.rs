//! Queue mode: captures go into an ordered queue instead of the clipboard.

pub mod item;
pub mod store;

use std::path::PathBuf;

use anyhow::Result;
use image::RgbaImage;
use tauri::{AppHandle, Manager, Runtime};

use crate::state::{AppState, Mode};
use crate::{badge, tray};

/// `%TEMP%/clipqueue`; each run gets its own session folder below it.
pub fn temp_root() -> PathBuf {
    std::env::temp_dir().join("clipqueue")
}

pub fn toggle_mode<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    let mode = {
        let mut mode = state.mode.lock().unwrap();
        *mode = match *mode {
            Mode::Normal => Mode::Queue,
            Mode::Queue => Mode::Normal,
        };
        *mode
    };
    tray::sync_queue_mode(app, mode == Mode::Queue);
    badge::refresh(app);
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
