//! Paste engine: turns the queue into keystrokes in the focused app.
//! Every path restores the user's previous clipboard through `ClipboardGuard`.

mod batch;
mod keys;
pub mod router;
mod sequential;
#[cfg(windows)]
mod win32;

#[cfg(windows)]
use win32 as platform;

#[cfg(not(windows))]
mod platform {
    pub fn esc_pressed() -> bool {
        false
    }
    pub fn wait_for_modifiers_released(_timeout: std::time::Duration) -> bool {
        true
    }
    pub fn foreground_process_name() -> Option<String> {
        None
    }
}

use std::sync::atomic::Ordering;
use std::time::Duration;

use anyhow::{bail, Result};
use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

use crate::i18n::{t, t_with};
use crate::state::AppState;
use crate::{badge, notify};
use router::Plan;

const MODIFIER_RELEASE_TIMEOUT: Duration = Duration::from_secs(3);

enum Outcome {
    Done,
    Cancelled { done: usize, total: usize },
    Empty,
}

/// Paste hotkey entry point. Runs on a worker thread.
pub fn run<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if state.pasting.swap(true, Ordering::SeqCst) {
        return; // a paste is already running
    }
    let result = paste(app, &state);
    state.pasting.store(false, Ordering::SeqCst);
    badge::refresh(app);

    let message = match result {
        Ok(Outcome::Done) => return,
        Ok(Outcome::Empty) => t("notify.queue_empty"),
        Ok(Outcome::Cancelled { done, total }) => t_with(
            "notify.paste_cancelled",
            &[("done", &done.to_string()), ("total", &total.to_string())],
        ),
        Err(e) => t_with("notify.paste_failed", &[("error", &format!("{e:#}"))]),
    };
    notify::show(app, &t("app.name"), &message);
}

fn paste<R: Runtime>(app: &AppHandle<R>, state: &AppState) -> Result<Outcome> {
    let items = state.queue.lock().unwrap().items().to_vec();
    if items.is_empty() {
        return Ok(Outcome::Empty);
    }
    let settings = state.settings.lock().unwrap().clone();

    if !platform::wait_for_modifiers_released(MODIFIER_RELEASE_TIMEOUT) {
        bail!(t("notify.release_keys"));
    }
    badge::refresh(app); // shows the "pasting" state

    let foreground = platform::foreground_process_name();
    let total = items.len();
    let restore_delay = Duration::from_millis(settings.batch_restore_delay_ms.into());
    let pasted = match router::plan(&items, &settings, foreground.as_deref()) {
        Plan::Batch(paths) => {
            batch::paste_files(&paths, restore_delay)?;
            total
        }
        Plan::JoinedText(text) => {
            batch::paste_text(&text, restore_delay)?;
            total
        }
        Plan::Sequential {
            steps,
            delay,
            enter_between_texts,
        } => sequential::paste(&steps, delay, enter_between_texts)?,
    };

    if pasted < total {
        return Ok(Outcome::Cancelled {
            done: pasted,
            total,
        });
    }
    if settings.clear_queue_after_paste {
        // Only the pasted items: anything captured meanwhile stays queued.
        let ids: Vec<Uuid> = items.iter().map(|i| i.id).collect();
        state.queue.lock().unwrap().forget(&ids);
    }
    Ok(Outcome::Done)
}
