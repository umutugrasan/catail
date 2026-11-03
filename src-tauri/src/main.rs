// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod badge;
mod capture;
mod clipboard;
mod commands;
mod hotkeys;
mod i18n;
mod notify;
mod overlay;
mod paste;
#[cfg(windows)]
mod process;
mod queue;
mod settings;
mod state;
mod tray;

use tauri::{Manager, RunEvent};

use i18n::t;
use queue::store::{remove_stale_sessions, session_name, QueueStore};
use settings::Settings;
use state::AppState;

fn main() {
    let temp_root = queue::temp_root();
    let session = session_name(chrono::Local::now(), std::process::id());

    tauri::Builder::default()
        // Must be registered first so a second launch exits before doing anything else.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            notify::show(app, &t("app.name"), &t("notify.already_running"));
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(hotkeys::handle)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new(
            QueueStore::new(&temp_root, &session),
            Settings::load(),
        ))
        .register_uri_scheme_protocol(capture::region::PROTOCOL, capture::region::serve)
        .invoke_handler(tauri::generate_handler![
            commands::overlay_session,
            commands::overlay_ready,
            commands::overlay_selection_started,
            commands::overlay_cancel,
            commands::capture_copy,
            commands::capture_enqueue,
            commands::queue_clear,
            commands::text_mode_set,
            commands::capture_save,
            commands::badge_state,
        ])
        .setup(move |app| {
            // Single-instance has already exited any second copy, so older folders are stale.
            remove_stale_sessions(&temp_root, &session);
            tray::build(app.handle())?;
            hotkeys::register_defaults(app.handle());
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                clipboard::watcher::start(move || queue::on_clipboard_changed(&handle));
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                overlay::prewarm(&handle);
                badge::prewarm(&handle);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build ClipQueue")
        .run(|app, event| match event {
            // Tray app: closing the settings window must not quit. Only "Çıkış" (exit code set) does.
            RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(),
            // Queued screenshots may be sensitive; don't leave them in %TEMP%.
            RunEvent::Exit => {
                let state = app.state::<AppState>();
                let dir = state.queue.lock().unwrap().session_dir().to_path_buf();
                let _ = std::fs::remove_dir_all(dir);
            }
            _ => {}
        });
}
