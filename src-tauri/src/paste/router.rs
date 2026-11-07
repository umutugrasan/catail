//! Picks how to paste the queue: one file list, one joined text, or item by item.

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::queue::item::{QueueItem, QueueItemKind};
use crate::settings::{PasteMode, Settings};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Step {
    Image(PathBuf),
    Text(String),
    File(PathBuf),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Plan {
    /// Mode A: every image and file as one CF_HDROP list, one Ctrl+V.
    Batch(Vec<PathBuf>),
    /// All texts joined with the separator, one Ctrl+V.
    JoinedText(String),
    /// Mode B: one clipboard write + Ctrl+V per item.
    Sequential {
        steps: Vec<Step>,
        delay: Duration,
        enter_between_texts: bool,
    },
}

/// `foreground` is the target window's executable name, used to look up `app_rules`.
/// `items` must not be empty.
pub fn plan(items: &[QueueItem], settings: &Settings, foreground: Option<&str>) -> Plan {
    let no_texts = items.iter().all(|i| i.kind != QueueItemKind::Text);
    let all_texts = items.iter().all(|i| i.kind == QueueItemKind::Text);
    let rule = foreground.and_then(|p| settings.rule_for(p));
    let delay_ms = rule
        .and_then(|r| r.delay_ms)
        .unwrap_or(settings.sequential_delay_ms);

    let sequential = || Plan::Sequential {
        steps: items.iter().filter_map(step).collect(),
        delay: Duration::from_millis(delay_ms.into()),
        enter_between_texts: settings.send_enter_between_texts,
    };
    let batch = || {
        let paths = items.iter().filter_map(QueueItem::path_to_paste);
        Plan::Batch(paths.map(Path::to_path_buf).collect())
    };
    let joined = || {
        let texts: Vec<&str> = items.iter().filter_map(|i| i.text.as_deref()).collect();
        Plan::JoinedText(texts.join(&settings.text_separator))
    };

    match settings.paste_mode {
        PasteMode::Sequential => sequential(),
        // A file list can't carry text, so forced batch only applies to pure queues.
        PasteMode::Batch if no_texts => batch(),
        PasteMode::Batch if all_texts => joined(),
        PasteMode::Batch => sequential(),
        PasteMode::Auto if all_texts => {
            if settings.send_enter_between_texts {
                sequential()
            } else {
                joined()
            }
        }
        PasteMode::Auto if !no_texts => sequential(),
        PasteMode::Auto => match rule.map(|r| r.mode) {
            Some(PasteMode::Sequential) => sequential(),
            _ => batch(),
        },
    }
}

fn step(item: &QueueItem) -> Option<Step> {
    match item.kind {
        QueueItemKind::Image => item.image_path.clone().map(Step::Image),
        QueueItemKind::Text => item.text.clone().map(Step::Text),
        QueueItemKind::File => item.file_path.clone().map(Step::File),
    }
}

/// Splits off the file items whose file is gone (`exists` is false for it): they can't be
/// pasted, and the user is told. Returns what can be pasted, in order, and what can't.
pub fn split_missing(
    items: Vec<QueueItem>,
    exists: impl Fn(&Path) -> bool,
) -> (Vec<QueueItem>, Vec<QueueItem>) {
    items.into_iter().partition(|item| match item.kind {
        QueueItemKind::File => item.file_path.as_deref().is_some_and(&exists),
        QueueItemKind::Image | QueueItemKind::Text => true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::AppPasteRule;

    fn img(name: &str) -> QueueItem {
        QueueItem::image(PathBuf::from(name))
    }

    fn txt(text: &str) -> QueueItem {
        QueueItem::text(text.into(), None)
    }

    fn file(name: &str) -> QueueItem {
        QueueItem::file(PathBuf::from(name), 1, None)
    }

    fn whatsapp_rule(delay_ms: Option<u32>) -> Settings {
        Settings {
            app_rules: vec![AppPasteRule {
                process: "WhatsApp.exe".into(),
                mode: PasteMode::Sequential,
                delay_ms,
            }],
            ..Settings::default()
        }
    }

    #[test]
    fn images_default_to_batch_in_order() {
        let plan = plan(
            &[img("001.png"), img("002.png")],
            &Settings::default(),
            Some("chrome.exe"),
        );
        assert_eq!(plan, Plan::Batch(vec!["001.png".into(), "002.png".into()]));
    }

    #[test]
    fn app_rule_switches_images_to_sequential() {
        let settings = whatsapp_rule(Some(600));
        let Plan::Sequential { steps, delay, .. } =
            plan(&[img("a.png")], &settings, Some("whatsapp.exe"))
        else {
            panic!("expected sequential");
        };
        assert_eq!(steps, [Step::Image("a.png".into())]);
        assert_eq!(delay, Duration::from_millis(600));
    }

    #[test]
    fn rule_without_delay_uses_default_delay() {
        let settings = whatsapp_rule(None);
        let Plan::Sequential { delay, .. } = plan(&[img("a.png")], &settings, Some("WHATSAPP.EXE"))
        else {
            panic!("expected sequential");
        };
        assert_eq!(delay, Duration::from_millis(250));
    }

    #[test]
    fn texts_are_joined_with_separator() {
        let plan = plan(&[txt("a"), txt("b"), txt("c")], &Settings::default(), None);
        assert_eq!(plan, Plan::JoinedText("a\n\nb\n\nc".into()));
    }

    #[test]
    fn texts_with_enter_go_sequential() {
        let settings = Settings {
            send_enter_between_texts: true,
            ..Settings::default()
        };
        let Plan::Sequential {
            enter_between_texts,
            steps,
            ..
        } = plan(&[txt("a"), txt("b")], &settings, None)
        else {
            panic!("expected sequential");
        };
        assert!(enter_between_texts);
        assert_eq!(steps.len(), 2);
    }

    #[test]
    fn mixed_queue_is_always_sequential_in_order() {
        let plan = plan(
            &[img("1.png"), txt("t"), img("2.png")],
            &Settings::default(),
            None,
        );
        let Plan::Sequential { steps, .. } = plan else {
            panic!("expected sequential");
        };
        assert_eq!(
            steps,
            [
                Step::Image("1.png".into()),
                Step::Text("t".into()),
                Step::Image("2.png".into())
            ]
        );
    }

    #[test]
    fn images_and_files_go_as_one_list_in_order() {
        let plan = plan(
            &[file("a.pdf"), img("1.png"), file("b.docx")],
            &Settings::default(),
            Some("chrome.exe"),
        );
        assert_eq!(
            plan,
            Plan::Batch(vec!["a.pdf".into(), "1.png".into(), "b.docx".into()])
        );
    }

    #[test]
    fn text_among_files_goes_item_by_item() {
        let Plan::Sequential { steps, .. } = plan(
            &[file("a.pdf"), txt("t"), img("1.png")],
            &Settings::default(),
            None,
        ) else {
            panic!("expected sequential");
        };
        assert_eq!(
            steps,
            [
                Step::File("a.pdf".into()),
                Step::Text("t".into()),
                Step::Image("1.png".into())
            ]
        );
    }

    #[test]
    fn app_rule_and_forced_modes_apply_to_files() {
        let Plan::Sequential { steps, .. } = plan(
            &[file("a.pdf"), file("b.pdf")],
            &whatsapp_rule(None),
            Some("whatsapp.exe"),
        ) else {
            panic!("expected sequential");
        };
        assert_eq!(
            steps,
            [Step::File("a.pdf".into()), Step::File("b.pdf".into())]
        );

        let forced = Settings {
            paste_mode: PasteMode::Sequential,
            ..Settings::default()
        };
        assert!(matches!(
            plan(&[file("a.pdf")], &forced, None),
            Plan::Sequential { .. }
        ));
        let batch = Settings {
            paste_mode: PasteMode::Batch,
            ..whatsapp_rule(None)
        };
        assert!(matches!(
            plan(&[file("a.pdf")], &batch, Some("whatsapp.exe")),
            Plan::Batch(_)
        ));
    }

    #[test]
    fn only_gone_files_are_split_off() {
        let items = vec![file("kayip.pdf"), txt("t"), img("1.png"), file("var.pdf")];
        let (available, missing) = split_missing(items, |p| p == Path::new("var.pdf"));
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].file_name().as_deref(), Some("kayip.pdf"));
        let kinds: Vec<QueueItemKind> = available.iter().map(|i| i.kind).collect();
        assert_eq!(
            kinds,
            [
                QueueItemKind::Text,
                QueueItemKind::Image,
                QueueItemKind::File
            ]
        );
    }

    #[test]
    fn explicit_modes_skip_auto_logic() {
        let sequential = Settings {
            paste_mode: PasteMode::Sequential,
            ..Settings::default()
        };
        assert!(matches!(
            plan(&[img("a.png")], &sequential, None),
            Plan::Sequential { .. }
        ));

        let batch = Settings {
            paste_mode: PasteMode::Batch,
            ..whatsapp_rule(None)
        };
        assert!(matches!(
            plan(&[img("a.png")], &batch, Some("whatsapp.exe")),
            Plan::Batch(_)
        ));
        assert!(matches!(
            plan(&[img("a.png"), txt("b")], &batch, None),
            Plan::Sequential { .. }
        ));
    }
}
