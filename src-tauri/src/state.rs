use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use crate::capture::MonitorShot;

/// Frozen screenshots of every monitor, taken when the region overlay opens.
pub struct CaptureSession {
    pub id: u64,
    pub shots: Vec<MonitorShot>,
}

#[derive(Default)]
pub struct AppState {
    pub session: Mutex<Option<CaptureSession>>,
    /// True from the moment a region capture starts until its overlays close.
    pub overlay_active: AtomicBool,
    last_session_id: AtomicU64,
}

impl AppState {
    pub fn next_session_id(&self) -> u64 {
        self.last_session_id.fetch_add(1, Ordering::Relaxed) + 1
    }
}
