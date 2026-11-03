//! User settings, stored in `%APPDATA%/Stack Screen/settings.json` and edited in the
//! settings window. Missing fields fall back to defaults, so older files keep working.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
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

/// Global shortcuts in the global-shortcut plugin's format, e.g. `shift+PrintScreen`.
/// Ctrl+V while the queue has items is fixed and not listed here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct HotkeyMap {
    pub region: String,
    pub fullscreen: String,
    pub paste: String,
    pub clear: String,
    pub undo: String,
}

impl Default for HotkeyMap {
    fn default() -> Self {
        Self {
            region: "PrintScreen".into(),
            fullscreen: "shift+PrintScreen".into(),
            paste: "control+shift+alt+KeyV".into(),
            clear: "control+shift+alt+KeyX".into(),
            undo: "control+shift+alt+KeyZ".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub hotkeys: HotkeyMap,
    pub paste_mode: PasteMode,
    pub sequential_delay_ms: u32,
    /// Batch mode: wait after Ctrl+V before restoring the previous clipboard.
    pub batch_restore_delay_ms: u32,
    pub text_separator: String,
    pub send_enter_between_texts: bool,
    pub clear_queue_after_paste: bool,
    /// Start with Windows. The source of truth is the registry; this mirrors it.
    pub autostart: bool,
    pub app_rules: Vec<AppPasteRule>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkeys: HotkeyMap::default(),
            paste_mode: PasteMode::Auto,
            sequential_delay_ms: 250,
            batch_restore_delay_ms: 800,
            text_separator: "\n\n".into(),
            send_enter_between_texts: false,
            clear_queue_after_paste: true,
            autostart: false,
            app_rules: Vec::new(),
        }
    }
}

/// Delays outside this range are either pointless or would freeze pasting.
const DELAY_RANGE_MS: std::ops::RangeInclusive<u32> = 50..=5000;

impl Settings {
    /// Reads the settings file; a missing or broken file yields the defaults.
    pub fn load() -> Self {
        settings_path().map_or_else(Self::default, |path| Self::load_from(&path))
    }

    fn load_from(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(json) => serde_json::from_str(&json).unwrap_or_else(|e| {
                eprintln!("ignoring invalid {}: {e}", path.display());
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = settings_path().context("APPDATA is not set")?;
        self.save_to(&path)
    }

    /// Writes to a temp file and renames it, so a crash can't leave half a file behind.
    fn save_to(&self, path: &Path) -> Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)
                .with_context(|| format!("cannot create {}", dir.display()))?;
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(self)?)
            .with_context(|| format!("cannot write {}", tmp.display()))?;
        std::fs::rename(&tmp, path).with_context(|| format!("cannot replace {}", path.display()))
    }

    /// Clamps numbers into sane ranges and tidies app rules (trimmed, lower-case, no blanks).
    pub fn sanitized(mut self) -> Self {
        let clamp = |v: u32| v.clamp(*DELAY_RANGE_MS.start(), *DELAY_RANGE_MS.end());
        self.sequential_delay_ms = clamp(self.sequential_delay_ms);
        self.batch_restore_delay_ms = clamp(self.batch_restore_delay_ms);
        self.app_rules = self
            .app_rules
            .into_iter()
            .filter_map(|mut rule| {
                rule.process = rule.process.trim().to_lowercase();
                rule.delay_ms = rule.delay_ms.map(clamp);
                (!rule.process.is_empty()).then_some(rule)
            })
            .collect();
        self
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
            .join("Stack Screen")
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
        assert_eq!(s.hotkeys.region, "PrintScreen");
    }

    #[test]
    fn partial_json_keeps_other_defaults() {
        let s: Settings = serde_json::from_str(
            r#"{"paste_mode":"sequential","hotkeys":{"region":"F9"},"app_rules":[{"process":"WhatsApp.exe","mode":"sequential"}]}"#,
        )
        .unwrap();
        assert_eq!(s.paste_mode, PasteMode::Sequential);
        assert_eq!(s.sequential_delay_ms, 250);
        assert_eq!(s.hotkeys.region, "F9");
        assert_eq!(s.hotkeys.fullscreen, "shift+PrintScreen");
        assert_eq!(
            s.rule_for("whatsapp.exe").unwrap().mode,
            PasteMode::Sequential
        );
        assert!(s.rule_for("chrome.exe").is_none());
    }

    #[test]
    fn sanitize_clamps_and_tidies() {
        let s = Settings {
            sequential_delay_ms: 1,
            batch_restore_delay_ms: 99_999,
            app_rules: vec![
                AppPasteRule {
                    process: "  WhatsApp.EXE ".into(),
                    mode: PasteMode::Sequential,
                    delay_ms: Some(10),
                },
                AppPasteRule {
                    process: "   ".into(),
                    mode: PasteMode::Batch,
                    delay_ms: None,
                },
            ],
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(s.sequential_delay_ms, 50);
        assert_eq!(s.batch_restore_delay_ms, 5000);
        assert_eq!(s.app_rules.len(), 1);
        assert_eq!(s.app_rules[0].process, "whatsapp.exe");
        assert_eq!(s.app_rules[0].delay_ms, Some(50));
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir =
            std::env::temp_dir().join(format!("stack-screen-settings-{}", std::process::id()));
        let path = dir.join("settings.json");
        let s = Settings {
            autostart: true,
            text_separator: " ".into(),
            ..Settings::default()
        };
        s.save_to(&path).unwrap();
        assert_eq!(Settings::load_from(&path), s);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
