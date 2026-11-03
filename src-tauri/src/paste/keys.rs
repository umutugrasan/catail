//! Synthetic keystrokes sent to the focused window.

use anyhow::{anyhow, Result};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};

pub struct Keys {
    enigo: Enigo,
}

impl Keys {
    pub fn new() -> Result<Self> {
        let enigo = Enigo::new(&Settings::default()).map_err(|e| anyhow!("enigo init: {e}"))?;
        Ok(Self { enigo })
    }

    /// Ctrl+V (Cmd+V on macOS later).
    pub fn paste(&mut self) -> Result<()> {
        self.enigo
            .key(Key::Control, Direction::Press)
            .map_err(|e| anyhow!("press Ctrl: {e}"))?;
        let v = self.enigo.key(v_key(), Direction::Click);
        // Always release Ctrl, even if the V click failed, so the keyboard isn't left stuck.
        let release = self.enigo.key(Key::Control, Direction::Release);
        v.map_err(|e| anyhow!("click V: {e}"))?;
        release.map_err(|e| anyhow!("release Ctrl: {e}"))?;
        Ok(())
    }

    pub fn enter(&mut self) -> Result<()> {
        self.enigo
            .key(Key::Return, Direction::Click)
            .map_err(|e| anyhow!("click Enter: {e}"))
    }
}

/// Raw virtual-key code on Windows: layout independent, unlike `Key::Unicode('v')`.
#[cfg(windows)]
fn v_key() -> Key {
    Key::Other(0x56)
}

#[cfg(not(windows))]
fn v_key() -> Key {
    Key::Unicode('v')
}
