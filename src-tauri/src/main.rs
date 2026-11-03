// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod clipboard;
mod commands;
mod hotkeys;
mod i18n;
mod notify;
mod overlay;
mod state;

use tauri::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

use i18n::t;
use state::AppState;

const MENU_CAPTURE: &str = "capture";
const MENU_QUEUE: &str = "queue";
const MENU_SETTINGS: &str = "settings";
const MENU_QUIT: &str = "quit";

fn main() {
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
        .manage(AppState::default())
        .register_uri_scheme_protocol(capture::region::PROTOCOL, capture::region::serve)
        .invoke_handler(tauri::generate_handler![
            commands::overlay_session,
            commands::overlay_ready,
            commands::overlay_selection_started,
            commands::overlay_cancel,
            commands::capture_copy,
            commands::capture_save,
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            hotkeys::register_defaults(app.handle());
            let handle = app.handle().clone();
            std::thread::spawn(move || overlay::prewarm(&handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build ClipQueue")
        .run(|_app, event| {
            // Tray app: closing the settings window must not quit. Only "Çıkış" (exit code set) does.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let capture = MenuItem::with_id(
        app,
        MENU_CAPTURE,
        t("tray.capture"),
        true,
        Some("PrintScreen"),
    )?;
    // Queue mode arrives in phase 2; shown disabled so the menu layout is final.
    let queue = CheckMenuItem::with_id(
        app,
        MENU_QUEUE,
        t("tray.queue_mode"),
        false,
        false,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, MENU_SETTINGS, t("tray.settings"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, t("tray.quit"), true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&capture, &queue, &settings, &separator, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(
            app.default_window_icon()
                .cloned()
                .expect("bundle icon is configured"),
        )
        .tooltip(t("tray.tooltip"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle().clone();
                std::thread::spawn(move || capture::region::start(&app));
            }
        })
        .build(app)?;
    Ok(())
}

fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    let app = app.clone();
    match event.id.as_ref() {
        MENU_CAPTURE => {
            std::thread::spawn(move || capture::region::start(&app));
        }
        MENU_SETTINGS => {
            std::thread::spawn(move || open_settings(&app));
        }
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

/// Opens (or focuses) the settings window. Must not run on the main thread.
fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let result = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("src/windows/settings/index.html".into()),
    )
    .title(t("settings.title"))
    .inner_size(560.0, 520.0)
    .resizable(false)
    .maximizable(false)
    .center()
    .build();
    if let Err(e) = result {
        eprintln!("cannot open settings: {e}");
    }
}
