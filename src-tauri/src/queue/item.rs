use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum QueueItemKind {
    Image,
    Text,
    File,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueueItem {
    pub id: Uuid,
    pub kind: QueueItemKind,
    pub created_at: DateTime<Utc>,
    /// `%TEMP%/catail/<session>/001.png` for images.
    pub image_path: Option<PathBuf>,
    pub text: Option<String>,
    /// The user's own file, for file items. Kept apart from `image_path` on purpose: Catail
    /// deletes files it made itself, and never this one.
    pub file_path: Option<PathBuf>,
    /// Size when it joined the queue, for showing.
    pub file_size: Option<u64>,
    /// Process the text was copied from; informational only.
    pub source_app: Option<String>,
    /// Goes up with every edit, so windows showing the image know to load it again.
    pub revision: u32,
}

impl QueueItem {
    pub fn image(path: PathBuf) -> Self {
        Self {
            id: Uuid::new_v4(),
            kind: QueueItemKind::Image,
            created_at: Utc::now(),
            image_path: Some(path),
            text: None,
            file_path: None,
            file_size: None,
            source_app: None,
            revision: 0,
        }
    }

    pub fn text(text: String, source_app: Option<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            kind: QueueItemKind::Text,
            created_at: Utc::now(),
            image_path: None,
            text: Some(text),
            file_path: None,
            file_size: None,
            source_app,
            revision: 0,
        }
    }

    pub fn file(path: PathBuf, size: u64, source_app: Option<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            kind: QueueItemKind::File,
            created_at: Utc::now(),
            image_path: None,
            text: None,
            file_path: Some(path),
            file_size: Some(size),
            source_app,
            revision: 0,
        }
    }

    /// What goes on the clipboard as a file: a queued image's PNG or the user's own file.
    pub fn path_to_paste(&self) -> Option<&Path> {
        self.image_path.as_deref().or(self.file_path.as_deref())
    }

    /// Whether this is a file the preview window can show.
    pub fn is_pdf(&self) -> bool {
        self.kind == QueueItemKind::File
            && self
                .file_path
                .as_deref()
                .and_then(Path::extension)
                .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
    }

    /// The file's name, for file items.
    pub fn file_name(&self) -> Option<String> {
        let name = self.file_path.as_deref()?.file_name()?;
        Some(name.to_string_lossy().into_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_files_ending_in_pdf_are_pdfs() {
        let file = |name: &str| QueueItem::file(PathBuf::from(name), 1, None);
        assert!(file(r"C:\rapor.pdf").is_pdf());
        assert!(file(r"C:\RAPOR.PDF").is_pdf());
        assert!(!file(r"C:\tez.docx").is_pdf());
        assert!(!file(r"C:\pdf").is_pdf());
        assert!(!QueueItem::text("a.pdf".into(), None).is_pdf());
        assert!(!QueueItem::image(PathBuf::from("a.pdf")).is_pdf());
    }
}
