//! In-memory queue backed by a per-session temp folder of numbered PNGs.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use image::RgbaImage;
use uuid::Uuid;

use super::item::QueueItem;
use crate::capture::encode_png;

/// Insertion order is paste order.
pub struct QueueStore {
    session_dir: PathBuf,
    items: Vec<QueueItem>,
    /// Never reset within a session: files of already-pasted items may still be read
    /// by the target app (browsers upload lazily), so names must not be reused.
    next_seq: u32,
}

impl QueueStore {
    /// Uses `<root>/<session>` for images. The folder is created on first use.
    pub fn new(root: &Path, session: &str) -> Self {
        Self {
            session_dir: root.join(session),
            items: Vec::new(),
            next_seq: 1,
        }
    }

    pub fn items(&self) -> &[QueueItem] {
        &self.items
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn session_dir(&self) -> &Path {
        &self.session_dir
    }

    /// Saves the image as the next numbered PNG and appends it.
    pub fn push_image(&mut self, img: &RgbaImage) -> Result<()> {
        std::fs::create_dir_all(&self.session_dir)
            .with_context(|| format!("cannot create {}", self.session_dir.display()))?;
        let path = self.session_dir.join(format!("{:03}.png", self.next_seq));
        std::fs::write(&path, encode_png(img)?)
            .with_context(|| format!("cannot write {}", path.display()))?;
        self.next_seq += 1;
        self.items.push(QueueItem::image(path));
        Ok(())
    }

    pub fn push(&mut self, item: QueueItem) {
        self.items.push(item);
    }

    /// Removes the newest item and its file. Returns whether anything was removed.
    pub fn undo_last(&mut self) -> bool {
        match self.items.pop() {
            Some(item) => {
                remove_file(&item);
                true
            }
            None => false,
        }
    }

    /// Removes every item and its file.
    pub fn clear(&mut self) {
        for item in self.items.drain(..) {
            remove_file(&item);
        }
    }

    /// Drops the given items but keeps their files, which a target app may still be reading.
    /// The files are deleted on exit or at the next start.
    pub fn forget(&mut self, ids: &[Uuid]) {
        self.items.retain(|item| !ids.contains(&item.id));
    }
}

fn remove_file(item: &QueueItem) {
    if let Some(path) = &item.image_path {
        let _ = std::fs::remove_file(path);
    }
}

/// Deletes session folders under `root` left behind by earlier runs.
pub fn remove_stale_sessions(root: &Path, current: &str) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
        if is_dir && entry.file_name() != current {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

/// Session folder name: local start time plus PID, unique per run.
pub fn session_name(now: chrono::DateTime<chrono::Local>, pid: u32) -> String {
    format!("{}-{pid}", now.format("%Y%m%d-%H%M%S"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use image::Rgba;

    fn temp_root(tag: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("clipqueue-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        root
    }

    fn file_names(store: &QueueStore) -> Vec<String> {
        store
            .items()
            .iter()
            .map(|i| {
                i.image_path
                    .as_ref()
                    .unwrap()
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect()
    }

    #[test]
    fn images_get_sequential_names() {
        let root = temp_root("seq");
        let mut store = QueueStore::new(&root, "s1");
        let img = RgbaImage::from_pixel(2, 2, Rgba([1, 2, 3, 255]));
        for _ in 0..3 {
            store.push_image(&img).unwrap();
        }
        assert_eq!(file_names(&store), ["001.png", "002.png", "003.png"]);
        assert!(store
            .items()
            .iter()
            .all(|i| i.image_path.as_ref().unwrap().is_file()));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn undo_removes_newest_and_names_are_not_reused() {
        let root = temp_root("undo");
        let mut store = QueueStore::new(&root, "s1");
        let img = RgbaImage::new(1, 1);
        store.push_image(&img).unwrap();
        store.push_image(&img).unwrap();
        let removed = store.items()[1].image_path.clone().unwrap();

        assert!(store.undo_last());
        assert!(!removed.exists());
        store.push_image(&img).unwrap();
        assert_eq!(file_names(&store), ["001.png", "003.png"]);

        store.clear();
        assert_eq!(store.len(), 0);
        assert!(!store.undo_last());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn forget_keeps_files_and_unlisted_items() {
        let root = temp_root("forget");
        let mut store = QueueStore::new(&root, "s1");
        store.push_image(&RgbaImage::new(1, 1)).unwrap();
        let pasted = store.items()[0].clone();
        store.push(QueueItem::text("added during paste".into(), None));

        store.forget(&[pasted.id]);
        assert_eq!(store.len(), 1);
        assert_eq!(store.items()[0].text.as_deref(), Some("added during paste"));
        assert!(pasted.image_path.unwrap().is_file());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn stale_sessions_are_removed() {
        let root = temp_root("stale");
        std::fs::create_dir_all(root.join("old-1")).unwrap();
        std::fs::create_dir_all(root.join("current")).unwrap();
        std::fs::write(root.join("old-1").join("001.png"), b"x").unwrap();
        remove_stale_sessions(&root, "current");
        assert!(!root.join("old-1").exists());
        assert!(root.join("current").exists());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn session_names_are_sortable() {
        let now = chrono::Local
            .with_ymd_and_hms(2026, 11, 3, 17, 5, 9)
            .unwrap();
        assert_eq!(session_name(now, 42), "20261103-170509-42");
    }
}
