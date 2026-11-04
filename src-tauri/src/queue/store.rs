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
    /// Items just pasted or cleared, kept (with their files) so "Geri al" can bring them back.
    set_aside: Vec<QueueItem>,
}

impl QueueStore {
    /// Uses `<root>/<session>` for images. The folder is created on first use.
    pub fn new(root: &Path, session: &str) -> Self {
        Self {
            session_dir: root.join(session),
            items: Vec::new(),
            next_seq: 1,
            set_aside: Vec::new(),
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

    /// Removes one item and its file. Returns whether it was found.
    pub fn remove(&mut self, id: Uuid) -> bool {
        match self.items.iter().position(|item| item.id == id) {
            Some(index) => {
                remove_file(&self.items.remove(index));
                true
            }
            None => false,
        }
    }

    /// Puts items in the order of `order`. Unknown ids are ignored and items missing from
    /// `order` (e.g. added while the user was dragging) keep their order at the end.
    pub fn reorder(&mut self, order: &[Uuid]) {
        let mut rest = std::mem::take(&mut self.items);
        for id in order {
            if let Some(index) = rest.iter().position(|item| item.id == *id) {
                self.items.push(rest.remove(index));
            }
        }
        self.items.extend(rest);
    }

    pub fn get(&self, id: Uuid) -> Option<&QueueItem> {
        self.items.iter().find(|item| item.id == id)
    }

    /// Takes the given items out of the queue but keeps them (and their files, which a
    /// target app may still be reading) for `restore`. Returns how many were set aside.
    pub fn set_aside(&mut self, ids: &[Uuid]) -> usize {
        let (aside, keep) = std::mem::take(&mut self.items)
            .into_iter()
            .partition(|item| ids.contains(&item.id));
        self.items = keep;
        self.set_aside = aside;
        self.set_aside.len()
    }

    /// Empties the queue into the set-aside items.
    pub fn set_aside_all(&mut self) -> usize {
        self.set_aside = std::mem::take(&mut self.items);
        self.set_aside.len()
    }

    /// Puts the set-aside items back in front, in their old order, ahead of anything queued
    /// since. Returns how many came back.
    pub fn restore(&mut self) -> usize {
        let restored = std::mem::take(&mut self.set_aside);
        let count = restored.len();
        let newer = std::mem::replace(&mut self.items, restored);
        self.items.extend(newer);
        count
    }

    /// Gives up on undo. The files stay until exit or the next start, like pasted files.
    pub fn discard_set_aside(&mut self) {
        self.set_aside.clear();
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
        let root = std::env::temp_dir().join(format!("catail-test-{tag}-{}", std::process::id()));
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

        store.set_aside_all();
        assert_eq!(store.len(), 0);
        assert!(!store.undo_last());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn set_aside_keeps_files_and_unlisted_items() {
        let root = temp_root("aside");
        let mut store = QueueStore::new(&root, "s1");
        store.push_image(&RgbaImage::new(1, 1)).unwrap();
        let pasted = store.items()[0].clone();
        store.push(QueueItem::text("added during paste".into(), None));

        assert_eq!(store.set_aside(&[pasted.id]), 1);
        assert_eq!(store.len(), 1);
        assert_eq!(store.items()[0].text.as_deref(), Some("added during paste"));
        assert!(pasted.image_path.as_ref().unwrap().is_file());

        // Undo puts the pasted item back in front of what came later.
        assert_eq!(store.restore(), 1);
        assert_eq!(store.items()[0].id, pasted.id);
        assert_eq!(store.len(), 2);
        assert_eq!(store.restore(), 0);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn clearing_can_be_undone_until_discarded() {
        let mut store = QueueStore::new(&temp_root("clear"), "s1");
        store.push(QueueItem::text("a".into(), None));
        store.push(QueueItem::text("b".into(), None));
        assert_eq!(store.set_aside_all(), 2);
        assert_eq!(store.len(), 0);
        store.discard_set_aside();
        assert_eq!(store.restore(), 0);
        assert_eq!(store.len(), 0);
    }

    #[test]
    fn reorder_follows_ids_and_keeps_unlisted_items() {
        let mut store = QueueStore::new(&temp_root("reorder"), "s1");
        let items: Vec<QueueItem> = ["a", "b", "c", "d"]
            .iter()
            .map(|t| QueueItem::text((*t).into(), None))
            .collect();
        let ids: Vec<Uuid> = items.iter().map(|i| i.id).collect();
        items.into_iter().for_each(|i| store.push(i));

        store.reorder(&[ids[2], ids[0], Uuid::new_v4(), ids[1]]);
        let texts: Vec<&str> = store
            .items()
            .iter()
            .map(|i| i.text.as_deref().unwrap())
            .collect();
        assert_eq!(texts, ["c", "a", "b", "d"]);
    }

    #[test]
    fn remove_deletes_one_item_and_its_file() {
        let root = temp_root("remove");
        let mut store = QueueStore::new(&root, "s1");
        store.push_image(&RgbaImage::new(1, 1)).unwrap();
        store.push_image(&RgbaImage::new(1, 1)).unwrap();
        let first = store.items()[0].clone();

        assert!(store.remove(first.id));
        assert!(!store.remove(first.id));
        assert_eq!(store.len(), 1);
        assert!(!first.image_path.unwrap().exists());
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
