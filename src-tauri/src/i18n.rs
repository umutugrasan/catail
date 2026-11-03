//! UI strings live in `src/locales/tr.json`, shared with the React side.

use std::sync::OnceLock;

use serde_json::Value;

const TR: &str = include_str!("../../src/locales/tr.json");

fn locale() -> &'static Value {
    static LOCALE: OnceLock<Value> = OnceLock::new();
    LOCALE.get_or_init(|| serde_json::from_str(TR).expect("tr.json must be valid JSON"))
}

fn lookup(root: &Value, key: &str) -> Option<String> {
    key.split('.')
        .try_fold(root, |node, part| node.get(part))?
        .as_str()
        .map(str::to_owned)
}

/// Returns the string for a dotted key such as `tray.quit`, or the key itself if missing.
pub fn t(key: &str) -> String {
    lookup(locale(), key).unwrap_or_else(|| key.to_owned())
}

/// Like [`t`], replacing `{name}` placeholders with the given values.
pub fn t_with(key: &str, vars: &[(&str, &str)]) -> String {
    vars.iter().fold(t(key), |text, (name, value)| {
        text.replace(&format!("{{{name}}}"), value)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every key the Rust side uses; keep in sync when adding strings.
    const RUST_KEYS: &[&str] = &[
        "app.name",
        "tray.tooltip",
        "tray.capture",
        "tray.settings",
        "tray.quit",
        "save.dialog_title",
        "save.filter_name",
        "notify.hotkey_failed_title",
        "notify.hotkey_failed_body",
        "notify.snipping_title",
        "notify.snipping_body",
        "notify.capture_failed",
        "notify.copy_failed",
        "notify.save_failed",
        "notify.queue_add_failed",
        "notify.queue_empty",
        "notify.paste_cancelled",
        "notify.paste_failed",
        "notify.release_keys",
        "settings.title",
        "notify.update_available_title",
        "notify.update_available_body",
        "settings.hotkey_invalid",
        "settings.hotkey_altgr",
        "settings.hotkey_reserved",
        "settings.hotkey_needs_modifier",
        "settings.hotkey_duplicate",
        "settings.hotkey_taken",
        "settings.autostart_failed",
        "settings.save_failed",
    ];

    #[test]
    fn all_rust_keys_exist() {
        for key in RUST_KEYS {
            assert!(lookup(locale(), key).is_some(), "missing locale key {key}");
        }
    }

    #[test]
    fn missing_key_falls_back_to_key() {
        assert_eq!(t("does.not.exist"), "does.not.exist");
    }

    #[test]
    fn placeholders_are_replaced() {
        let text = t_with("notify.hotkey_failed_body", &[("shortcut", "PrintScreen")]);
        assert!(text.starts_with("PrintScreen "));
        assert!(!text.contains('{'));
    }
}
