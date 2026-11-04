//! System tray icon and menu.

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

use crate::capture::region;
use crate::i18n::t;

const MENU_CAPTURE: &str = "capture";
const MENU_SETTINGS: &str = "settings";
const MENU_QUIT: &str = "quit";

const TRAY_ID: &str = "main";

fn menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let capture = MenuItem::with_id(
        app,
        MENU_CAPTURE,
        t("tray.capture"),
        true,
        Some("PrintScreen"),
    )?;
    let settings = MenuItem::with_id(app, MENU_SETTINGS, t("tray.settings"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, t("tray.quit"), true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&capture, &settings, &separator, &quit])
}

/// Puts the menu and tooltip into the current interface language.
pub fn retitle<R: Runtime>(app: &AppHandle<R>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = menu(app) {
            let _ = tray.set_menu(Some(menu));
        }
        let _ = tray.set_tooltip(Some(t("tray.tooltip")));
    }
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_title(&t("settings.title"));
    }
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = menu(app)?;
    TrayIconBuilder::with_id(TRAY_ID)
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
                std::thread::spawn(move || region::start(&app));
            }
        })
        .build(app)?;

    Ok(())
}

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let app = app.clone();
    match event.id.as_ref() {
        MENU_CAPTURE => {
            std::thread::spawn(move || region::start(&app));
        }
        MENU_SETTINGS => {
            std::thread::spawn(move || open_settings(&app));
        }
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

/// Opens (or focuses) the settings window. Must not run on the main thread.
pub fn open_settings<R: Runtime>(app: &AppHandle<R>) {
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
    .inner_size(640.0, 760.0)
    .min_inner_size(520.0, 480.0)
    .maximizable(false)
    .center()
    .build();
    if let Err(e) = result {
        eprintln!("cannot open settings: {e}");
    }
}
