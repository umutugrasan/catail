use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum QueueItemKind {
    Image,
    Text,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueueItem {
    pub id: Uuid,
    pub kind: QueueItemKind,
    pub created_at: DateTime<Utc>,
    /// `%TEMP%/clipqueue/<session>/001.png` for images.
    pub image_path: Option<PathBuf>,
    pub text: Option<String>,
    /// Process the text was copied from; informational only.
    pub source_app: Option<String>,
}

impl QueueItem {
    pub fn image(path: PathBuf) -> Self {
        Self {
            id: Uuid::new_v4(),
            kind: QueueItemKind::Image,
            created_at: Utc::now(),
            image_path: Some(path),
            text: None,
            source_app: None,
        }
    }

    pub fn text(text: String, source_app: Option<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            kind: QueueItemKind::Text,
            created_at: Utc::now(),
            image_path: None,
            text: Some(text),
            source_app,
        }
    }
}
