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
use crate::{badge, hotkeys, notify, queue};
use router::Plan;

const MODIFIER_RELEASE_TIMEOUT: Duration = Duration::from_secs(3);

enum Outcome {
    /// `missing`: names of the files that were skipped because they're gone.
    Done {
        missing: Vec<String>,
    },
    Cancelled {
        done: usize,
        total: usize,
    },
    Empty,
}

/// Paste hotkey entry point: the whole queue. Runs on a worker thread.
pub fn run<R: Runtime>(app: &AppHandle<R>) {
    run_items(app, None);
}

/// Pastes only the queued items in `only` (in queue order), or the whole queue with `None`.
/// The rest stays queued. Runs on a worker thread.
pub fn run_items<R: Runtime>(app: &AppHandle<R>, only: Option<&[Uuid]>) {
    // The editor has the focus, so a paste would land in it instead of the target app.
    if crate::preview::is_open() {
        return;
    }
    let state = app.state::<AppState>();
    if state.pasting.swap(true, Ordering::SeqCst) {
        return; // a paste is already running
    }
    // Our own Ctrl+V must reach the target app, not our Ctrl+V hotkey.
    hotkeys::suspend_queue_paste(app);
    let result = paste(app, &state, only);
    state.pasting.store(false, Ordering::SeqCst);
    queue::changed(app);

    let message = match result {
        Ok(Outcome::Done { missing }) if missing.is_empty() => return,
        Ok(Outcome::Done { missing }) => t_with(
            "notify.files_missing",
            &[
                ("count", &missing.len().to_string()),
                ("names", &shown_names(&missing)),
            ],
        ),
        Ok(Outcome::Empty) => t("notify.queue_empty"),
        Ok(Outcome::Cancelled { done, total }) => t_with(
            "notify.paste_cancelled",
            &[("done", &done.to_string()), ("total", &total.to_string())],
        ),
        Err(e) => t_with("notify.paste_failed", &[("error", &format!("{e:#}"))]),
    };
    notify::show(app, &t("app.name"), &message);
}

/// The first few names; a long list wouldn't fit a notification.
fn shown_names(names: &[String]) -> String {
    const SHOWN: usize = 3;
    let mut text = names[..names.len().min(SHOWN)].join(", ");
    if names.len() > SHOWN {
        text.push_str(", …");
    }
    text
}

fn paste<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    only: Option<&[Uuid]>,
) -> Result<Outcome> {
    let queued: Vec<_> = {
        let queue = state.queue.lock().unwrap();
        let items = queue.items().iter();
        items
            .filter(|item| only.is_none_or(|ids| ids.contains(&item.id)))
            .cloned()
            .collect()
    };
    if queued.is_empty() {
        return Ok(Outcome::Empty);
    }
    let ids: Vec<Uuid> = queued.iter().map(|i| i.id).collect();
    let settings = state.settings.lock().unwrap().clone();

    if !platform::wait_for_modifiers_released(MODIFIER_RELEASE_TIMEOUT) {
        bail!(t("notify.release_keys"));
    }
    badge::refresh(app); // shows the "pasting" state

    // Checked as late as possible: a file can be moved or deleted while it waits in the queue.
    let (items, missing) = router::split_missing(queued, std::path::Path::is_file);
    let missing: Vec<String> = missing.iter().filter_map(|i| i.file_name()).collect();

    let foreground = platform::foreground_process_name();
    let total = items.len();
    let restore_delay = Duration::from_millis(settings.batch_restore_delay_ms.into());
    let pasted = if items.is_empty() {
        0
    } else {
        match router::plan(&items, &settings, foreground.as_deref()) {
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
        }
    };

    if pasted < total {
        return Ok(Outcome::Cancelled {
            done: pasted,
            total,
        });
    }
    if settings.clear_queue_after_paste {
        // Only what this paste dealt with, gone files included: they'd otherwise hold Ctrl+V
        // forever. Anything captured meanwhile stays queued.
        queue::set_aside_pasted(app, &ids);
        // Pasting the queue finishes the job: Ctrl+C goes back to normal. After pasting a few
        // picked items the rest is still being gathered.
        if only.is_none() || state.queue.lock().unwrap().len() == 0 {
            state.text_mode.store(false, Ordering::SeqCst);
        }
    }
    Ok(Outcome::Done { missing })
}
