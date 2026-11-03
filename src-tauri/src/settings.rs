//! User settings, stored in `%APPDATA%/ClipQueue/settings.json`. The settings window that
//! edits them arrives in phase 5; until then the file is read if present, never written.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PasteMode {
    #[default]
    Auto,
    Batch,
    Sequential,
}

/// Per-target override chosen from the phase 0 paste matrix, e.g. apps that only take the
/// first file of a CF_HDROP list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppPasteRule {
    /// Executable name, matched case-insensitively (e.g. `whatsapp.exe`).
    pub process: String,
    pub mode: PasteMode,
    /// Overrides `sequential_delay_ms` for this app.
    #[serde(default)]
    pub delay_ms: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub paste_mode: PasteMode,
    pub sequential_delay_ms: u32,
    /// Batch mode: wait after Ctrl+V before restoring the previous clipboard.
    pub batch_restore_delay_ms: u32,
    pub text_separator: String,
    pub send_enter_between_texts: bool,
    pub clear_queue_after_paste: bool,
    pub app_rules: Vec<AppPasteRule>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            paste_mode: PasteMode::Auto,
            sequential_delay_ms: 250,
            batch_restore_delay_ms: 800,
            text_separator: "\n\n".into(),
            send_enter_between_texts: false,
            clear_queue_after_paste: true,
            app_rules: Vec::new(),
        }
    }
}

impl Settings {
    /// Reads the settings file; a missing or broken file yields the defaults.
    pub fn load() -> Self {
        let Some(path) = settings_path() else {
            return Self::default();
        };
        match std::fs::read_to_string(&path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
                eprintln!("ignoring invalid {}: {e}", path.display());
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn rule_for(&self, process: &str) -> Option<&AppPasteRule> {
        self.app_rules
            .iter()
            .find(|r| r.process.eq_ignore_ascii_case(process))
    }
}

fn settings_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(
        PathBuf::from(appdata)
            .join("ClipQueue")
            .join("settings.json"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_spec() {
        let s = Settings::default();
        assert_eq!(s.paste_mode, PasteMode::Auto);
        assert_eq!(s.sequential_delay_ms, 250);
        assert_eq!(s.text_separator, "\n\n");
        assert!(!s.send_enter_between_texts);
        assert!(s.clear_queue_after_paste);
    }

    #[test]
    fn partial_json_keeps_other_defaults() {
        let s: Settings = serde_json::from_str(
            r#"{"paste_mode":"sequential","app_rules":[{"process":"WhatsApp.exe","mode":"sequential"}]}"#,
        )
        .unwrap();
        assert_eq!(s.paste_mode, PasteMode::Sequential);
        assert_eq!(s.sequential_delay_ms, 250);
        assert_eq!(
            s.rule_for("whatsapp.exe").unwrap().mode,
            PasteMode::Sequential
        );
        assert!(s.rule_for("chrome.exe").is_none());
    }
}
