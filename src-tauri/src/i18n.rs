//! UI strings live in `src/locales/<code>.json`, shared with the React side. Turkish is the
//! source; other languages fall back to English, then Turkish, for anything they lack.

use std::sync::{OnceLock, RwLock};

use serde_json::Value;

/// Interface languages: code and the file with its strings. Keep in step with `LANGUAGES`
/// in `src/lib/i18n.ts`.
const LOCALES: &[(&str, &str)] = &[
    ("tr", include_str!("../../src/locales/tr.json")),
    ("en", include_str!("../../src/locales/en.json")),
    ("de", include_str!("../../src/locales/de.json")),
    ("fr", include_str!("../../src/locales/fr.json")),
    ("es", include_str!("../../src/locales/es.json")),
    ("it", include_str!("../../src/locales/it.json")),
    ("pt", include_str!("../../src/locales/pt.json")),
    ("nl", include_str!("../../src/locales/nl.json")),
    ("pl", include_str!("../../src/locales/pl.json")),
    ("ru", include_str!("../../src/locales/ru.json")),
    ("uk", include_str!("../../src/locales/uk.json")),
    ("ar", include_str!("../../src/locales/ar.json")),
    ("ja", include_str!("../../src/locales/ja.json")),
    ("zh-CN", include_str!("../../src/locales/zh-CN.json")),
    ("ko", include_str!("../../src/locales/ko.json")),
    ("id", include_str!("../../src/locales/id.json")),
];

const FALLBACKS: [&str; 2] = ["en", "tr"];

fn parsed() -> &'static Vec<(&'static str, Value)> {
    static PARSED: OnceLock<Vec<(&'static str, Value)>> = OnceLock::new();
    PARSED.get_or_init(|| {
        LOCALES
            .iter()
            .map(|(code, json)| {
                let value = serde_json::from_str(json)
                    .unwrap_or_else(|e| panic!("{code}.json must be valid JSON: {e}"));
                (*code, value)
            })
            .collect()
    })
}

fn locale(code: &str) -> Option<&'static Value> {
    parsed().iter().find(|(c, _)| *c == code).map(|(_, v)| v)
}

static CURRENT: RwLock<String> = RwLock::new(String::new());

pub fn is_supported(code: &str) -> bool {
    LOCALES.iter().any(|(c, _)| *c == code)
}

/// The interface language in use.
pub fn current() -> String {
    let code = CURRENT.read().unwrap();
    if code.is_empty() {
        "tr".into()
    } else {
        code.clone()
    }
}

/// Switches the interface language: `Some(code)` as chosen in the settings, `None` to follow
/// Windows. Returns the language now in use.
pub fn set_language(choice: Option<&str>) -> String {
    let code = choice
        .filter(|c| is_supported(c))
        .map(str::to_owned)
        .unwrap_or_else(system_language);
    *CURRENT.write().unwrap() = code.clone();
    code
}

/// The supported language closest to Windows' own, English if none is.
pub fn system_language() -> String {
    windows_locale()
        .and_then(|name| match_locale(&name))
        .unwrap_or_else(|| "en".into())
}

/// "tr-TR" → "tr", "zh-Hans-CN" → "zh-CN", "pt-BR" → "pt"; `None` if unsupported.
pub fn match_locale(name: &str) -> Option<String> {
    let lower = name.to_ascii_lowercase();
    let primary = lower.split(['-', '_']).next()?;
    let code = if primary == "zh" { "zh-CN" } else { primary };
    is_supported(code).then(|| code.to_owned())
}

/// Windows' display language (what its own menus are in), e.g. "tr-TR".
#[cfg(windows)]
fn windows_locale() -> Option<String> {
    use windows::Win32::Globalization::{GetUserDefaultUILanguage, LCIDToLocaleName};
    let mut buf = [0u16; 85];
    // SAFETY: plain query, then a conversion into a LOCALE_NAME_MAX_LENGTH buffer.
    let len = unsafe { LCIDToLocaleName(u32::from(GetUserDefaultUILanguage()), Some(&mut buf), 0) };
    (len > 1).then(|| String::from_utf16_lossy(&buf[..len as usize - 1]))
}

#[cfg(not(windows))]
fn windows_locale() -> Option<String> {
    None
}

fn lookup(root: &Value, key: &str) -> Option<String> {
    key.split('.')
        .try_fold(root, |node, part| node.get(part))?
        .as_str()
        .map(str::to_owned)
}

fn lookup_in(code: &str, key: &str) -> Option<String> {
    std::iter::once(code)
        .chain(FALLBACKS)
        .find_map(|c| lookup(locale(c)?, key))
}

/// Returns the string for a dotted key such as `tray.quit`, or the key itself if missing.
pub fn t(key: &str) -> String {
    lookup_in(&current(), key).unwrap_or_else(|| key.to_owned())
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
        "ocr.no_language",
        "ocr.translate_failed",
        "export.dialog_title",
        "export.zip_filter",
        "export.pdf_filter",
        "notify.export_done",
        "notify.export_failed",
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
            for (code, _) in LOCALES {
                assert!(
                    lookup(locale(code).unwrap(), key).is_some(),
                    "{code}: missing {key}"
                );
            }
        }
    }

    #[test]
    fn windows_locales_map_to_ours() {
        assert_eq!(match_locale("tr-TR").as_deref(), Some("tr"));
        assert_eq!(match_locale("pt-BR").as_deref(), Some("pt"));
        assert_eq!(match_locale("zh-Hans-CN").as_deref(), Some("zh-CN"));
        assert_eq!(match_locale("de_AT").as_deref(), Some("de"));
        assert_eq!(match_locale("xx-YY"), None);
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
