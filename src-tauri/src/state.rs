use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use crate::capture::MonitorShot;
use crate::queue::store::QueueStore;
use crate::settings::Settings;

/// Frozen screenshots of every monitor, taken when the region overlay opens.
pub struct CaptureSession {
    pub id: u64,
    pub shots: Vec<MonitorShot>,
}

pub struct AppState {
    pub queue: Mutex<QueueStore>,
    pub settings: Mutex<Settings>,
    /// Every Ctrl+C goes into the queue while this is on.
    pub text_mode: AtomicBool,
    /// True while the paste engine owns the clipboard and keyboard.
    pub pasting: AtomicBool,
    pub session: Mutex<Option<CaptureSession>>,
    /// True from the moment a region capture starts until its overlays close.
    pub overlay_active: AtomicBool,
    last_session_id: AtomicU64,
}

impl AppState {
    pub fn new(queue: QueueStore, settings: Settings) -> Self {
        Self {
            queue: Mutex::new(queue),
            settings: Mutex::new(settings),
            text_mode: AtomicBool::new(false),
            pasting: AtomicBool::new(false),
            session: Mutex::new(None),
            overlay_active: AtomicBool::new(false),
            last_session_id: AtomicU64::new(0),
        }
    }

    pub fn next_session_id(&self) -> u64 {
        self.last_session_id.fetch_add(1, Ordering::Relaxed) + 1
    }
}
