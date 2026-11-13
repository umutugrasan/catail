//! User settings, stored in `%APPDATA%/Catail/settings.json` and edited in the
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

/// Where on the primary monitor the queue badge sits; the panel opens next to it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BadgeCorner {
    #[default]
    BottomRight,
    BottomCenter,
    BottomLeft,
    TopRight,
    TopCenter,
    TopLeft,
}

impl BadgeCorner {
    pub fn is_top(self) -> bool {
        matches!(self, Self::TopRight | Self::TopCenter | Self::TopLeft)
    }

    /// -1 left, 0 centre, 1 right.
    pub fn side(self) -> i8 {
        match self {
            Self::BottomLeft | Self::TopLeft => -1,
            Self::BottomCenter | Self::TopCenter => 0,
            Self::BottomRight | Self::TopRight => 1,
        }
    }
}

/// How the queue panel lays out its items. Unknown names, from a newer version's settings
/// file, fall back to the grid.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PanelLayout {
    /// One column as narrow as the badge's pill; a tile's buttons pop out beside it as bubbles.
    List,
    /// Two columns of square tiles; each tile's buttons sit on it.
    #[default]
    #[serde(other)]
    Grid,
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
    /// Interface language, e.g. "en"; `None` follows Windows.
    pub language: Option<String>,
    /// Language "Çevir" translates into; the last one picked.
    pub translate_to: String,
    pub badge_corner: BadgeCorner,
    /// The badge's size, in percent of its usual size (`BADGE_SIZE_RANGE`).
    pub badge_size: u16,
    pub panel_layout: PanelLayout,
    /// Which cat the app looks like; the theme follows it.
    pub cat: Cat,
    /// The plain theme's color, "#rrggbb".
    pub plain_accent: String,
    /// "Kendi kedin": its colors.
    pub custom_cat: CustomCat,
}

/// "Kendi kedin": the colors the orange cat is painted in, "#rrggbb" each.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct CustomCat {
    pub fur: String,
    pub belly: String,
    pub eyes: String,
}

impl Default for CustomCat {
    fn default() -> Self {
        Self {
            fur: "#8f7cf2".into(),
            belly: "#f6f2ff".into(),
            eyes: "#1c1c1c".into(),
        }
    }
}

impl CustomCat {
    /// Lower case, and each broken color back to its default.
    pub fn tidied(self) -> Self {
        let default = Self::default();
        let tidy = |value: String, fallback: String| {
            let value = value.to_lowercase();
            if is_hex_color(&value) {
                value
            } else {
                fallback
            }
        };
        Self {
            fur: tidy(self.fur, default.fur),
            belly: tidy(self.belly, default.belly),
            eyes: tidy(self.eyes, default.eyes),
        }
    }
}

/// The plain theme's color until one is picked: Windows' blue.
pub const PLAIN_ACCENT_DEFAULT: &str = "#0067c0";

/// "#rrggbb", lower case.
pub fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

/// Unknown names, from a newer version's settings file, fall back to the orange cat.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Cat {
    Gray,
    White,
    Calico,
    Black,
    /// "Kendi kedin": the orange cat in the colors of `custom_cat`.
    Custom,
    /// Not a cat: the turtle, with pictures of its own.
    Turtle,
    /// Not a cat either: the monkey, with pictures of its own.
    Monkey,
    /// No cat: plain colors, system pointers, no tail animation.
    Plain,
    #[default]
    #[serde(other)]
    Orange,
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
            language: None,
            translate_to: "tr".into(),
            badge_corner: BadgeCorner::BottomRight,
            badge_size: 100,
            panel_layout: PanelLayout::Grid,
            cat: Cat::default(),
            plain_accent: PLAIN_ACCENT_DEFAULT.into(),
            custom_cat: CustomCat::default(),
        }
    }
}

/// How much smaller or bigger the badge can be made, in percent.
pub const BADGE_SIZE_RANGE: std::ops::RangeInclusive<u16> = 70..=160;

/// Delays outside this range are either pointless or would freeze pasting.
const DELAY_RANGE_MS: std::ops::RangeInclusive<u32> = 50..=5000;

impl Settings {
    /// Reads the settings file; a missing or broken file yields the defaults.
    pub fn load() -> Self {
        let Some(path) = settings_path() else {
            return Self::default();
        };
        if !path.exists() {
            migrate_from_old_name(&path);
        }
        Self::load_from(&path)
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
        if !crate::translate::is_language_code(&self.translate_to) {
            self.translate_to = Self::default().translate_to;
        }
        self.language = self.language.filter(|code| crate::i18n::is_supported(code));
        self.plain_accent = self.plain_accent.to_lowercase();
        if !is_hex_color(&self.plain_accent) {
            self.plain_accent = PLAIN_ACCENT_DEFAULT.into();
        }
        self.custom_cat = self.custom_cat.tidied();
        self.badge_size = self
            .badge_size
            .clamp(*BADGE_SIZE_RANGE.start(), *BADGE_SIZE_RANGE.end());
        self
    }

    /// The badge's size as a factor of its usual one.
    pub fn badge_zoom(&self) -> f64 {
        f64::from(self.badge_size) / 100.0
    }

    pub fn rule_for(&self, process: &str) -> Option<&AppPasteRule> {
        self.app_rules
            .iter()
            .find(|r| r.process.eq_ignore_ascii_case(process))
    }
}

fn settings_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(PathBuf::from(appdata).join("Catail").join("settings.json"))
}

/// The app was called Stack Screen before 0.5.0; its settings are carried over once.
fn migrate_from_old_name(path: &Path) {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return;
    };
    let old = PathBuf::from(appdata)
        .join("Stack Screen")
        .join("settings.json");
    if old.exists() {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::copy(&old, path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_cats_become_the_orange_one() {
        let parsed: Settings = serde_json::from_str(r#"{"cat":"tiger"}"#).unwrap();
        assert_eq!(parsed.cat, Cat::Orange);
        let parsed: Settings = serde_json::from_str(r#"{"cat":"black"}"#).unwrap();
        assert_eq!(parsed.cat, Cat::Black);
        assert_eq!(serde_json::to_string(&Cat::Calico).unwrap(), "\"calico\"");
        // Files from before cats existed keep the look they had.
        let parsed: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed.cat, Cat::Orange);
    }

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
    fn custom_cat_and_turtle() {
        let s = Settings {
            custom_cat: CustomCat {
                fur: "#ABCDEF".into(),
                belly: "beyaz".into(),
                eyes: "#00ff00".into(),
            },
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(s.custom_cat.fur, "#abcdef");
        assert_eq!(s.custom_cat.belly, CustomCat::default().belly);
        assert_eq!(s.custom_cat.eyes, "#00ff00");
        let parsed: Settings = serde_json::from_str(r#"{"cat":"turtle"}"#).unwrap();
        assert_eq!(parsed.cat, Cat::Turtle);
        let monkey: Settings = serde_json::from_str(r#"{"cat":"monkey"}"#).unwrap();
        assert_eq!(monkey.cat, Cat::Monkey);
        assert_eq!(parsed.custom_cat, CustomCat::default());
        assert_eq!(serde_json::to_string(&Cat::Custom).unwrap(), "\"custom\"");
    }

    #[test]
    fn plain_accent_must_be_a_color() {
        let tidy = |value: &str| {
            Settings {
                plain_accent: value.into(),
                ..Settings::default()
            }
            .sanitized()
            .plain_accent
        };
        assert_eq!(tidy("#C239B3"), "#c239b3");
        assert_eq!(tidy("mavi"), PLAIN_ACCENT_DEFAULT);
        assert_eq!(tidy("#12345"), PLAIN_ACCENT_DEFAULT);
        assert_eq!(tidy("#12345g"), PLAIN_ACCENT_DEFAULT);
        // Settings saved before the color existed get the default.
        let old: Settings = serde_json::from_str(r#"{"cat":"plain"}"#).unwrap();
        assert_eq!(old.plain_accent, PLAIN_ACCENT_DEFAULT);
    }

    #[test]
    fn badge_size_stays_in_range() {
        let size = |percent: u16| {
            Settings {
                badge_size: percent,
                ..Settings::default()
            }
            .sanitized()
            .badge_size
        };
        assert_eq!(size(100), 100);
        assert_eq!(size(10), *BADGE_SIZE_RANGE.start());
        assert_eq!(size(900), *BADGE_SIZE_RANGE.end());
        let old: Settings = serde_json::from_str(r#"{"cat":"gray"}"#).unwrap();
        assert_eq!(old.badge_zoom(), 1.0);
    }

    #[test]
    fn panel_layout_defaults_to_the_grid() {
        let old: Settings = serde_json::from_str(r#"{"cat":"gray"}"#).unwrap();
        assert_eq!(old.panel_layout, PanelLayout::Grid);
        let list: Settings = serde_json::from_str(r#"{"panel_layout":"list"}"#).unwrap();
        assert_eq!(list.panel_layout, PanelLayout::List);
        let newer: Settings = serde_json::from_str(r#"{"panel_layout":"carousel"}"#).unwrap();
        assert_eq!(newer.panel_layout, PanelLayout::Grid);
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = std::env::temp_dir().join(format!("catail-settings-{}", std::process::id()));
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
