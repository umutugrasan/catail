use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

/// Shows a Windows toast. Failures are only logged: a missing toast must never break capture.
pub fn show<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("notification failed: {e}");
    }
}
