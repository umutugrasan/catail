//! Updates from GitHub Releases (`latest.json`, signed with the key in tauri.conf.json).
//! This is the only network access the app makes, and it only downloads.

use std::sync::Mutex;

use anyhow::{Context, Result};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::i18n::{t, t_with};
use crate::notify;

/// The update found by the last check, ready to install.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

pub async fn check<R: Runtime>(app: &AppHandle<R>) -> Result<Option<UpdateInfo>> {
    let update = app
        .updater()
        .context("updater unavailable")?
        .check()
        .await
        .context("update check failed")?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone(),
    });
    *app.state::<PendingUpdate>().0.lock().unwrap() = update;
    Ok(info)
}

/// Downloads and installs the pending update, then restarts into it.
pub async fn install<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let update = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap()
        .take()
        .context("no update to install")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .context("update install failed")?;
    app.restart()
}

/// Startup check. Failures (offline, no release yet) are silent; a found update is announced.
pub fn check_in_background<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(Some(info)) = check(&app).await {
            let body = t_with(
                "notify.update_available_body",
                &[("version", &info.version)],
            );
            notify::show(&app, &t("notify.update_available_title"), &body);
        }
    });
}
