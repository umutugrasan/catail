//! Screen capture. All geometry here is in physical pixels.

pub mod fullscreen;
pub mod region;

use anyhow::{Context, Result};
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder, RgbaImage};

/// One monitor's frozen frame plus its position on the virtual desktop.
pub struct MonitorShot {
    pub x: i32,
    pub y: i32,
    pub image: RgbaImage,
    /// Fast-compressed PNG of `image`, served to the overlay webview.
    pub png: Vec<u8>,
}

impl MonitorShot {
    pub fn contains(&self, px: f64, py: f64) -> bool {
        let (w, h) = self.image.dimensions();
        px >= f64::from(self.x)
            && py >= f64::from(self.y)
            && px < f64::from(self.x) + f64::from(w)
            && py < f64::from(self.y) + f64::from(h)
    }
}

/// Captures every monitor. PNG encoding runs in parallel since it dominates latency.
pub fn capture_all_monitors() -> Result<Vec<MonitorShot>> {
    let monitors = xcap::Monitor::all().context("cannot enumerate monitors")?;
    let mut frames = Vec::with_capacity(monitors.len());
    for monitor in &monitors {
        let x = monitor.x().context("monitor x")?;
        let y = monitor.y().context("monitor y")?;
        let image = monitor.capture_image().context("monitor capture")?;
        frames.push((x, y, image));
    }

    std::thread::scope(|scope| {
        let handles: Vec<_> = frames
            .into_iter()
            .map(|(x, y, image)| {
                scope.spawn(move || {
                    let png = encode_png(&image)?;
                    Ok(MonitorShot { x, y, image, png })
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().expect("PNG encoder thread panicked"))
            .collect()
    })
}

/// PNG with fast compression: screenshots are large and speed matters more than size.
pub fn encode_png(img: &RgbaImage) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    PngEncoder::new_with_quality(&mut out, CompressionType::Fast, FilterType::Sub)
        .write_image(
            img.as_raw(),
            img.width(),
            img.height(),
            ExtendedColorType::Rgba8,
        )
        .context("PNG encoding failed")?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn png_round_trips() {
        let img = RgbaImage::from_pixel(7, 3, Rgba([10, 200, 30, 255]));
        let png = encode_png(&img).unwrap();
        let decoded = image::load_from_memory(&png).unwrap().to_rgba8();
        assert_eq!(decoded, img);
    }

    #[test]
    fn contains_uses_half_open_bounds() {
        let shot = MonitorShot {
            x: -1920,
            y: 0,
            image: RgbaImage::new(1920, 1080),
            png: Vec::new(),
        };
        assert!(shot.contains(-1920.0, 0.0));
        assert!(shot.contains(-1.0, 1079.0));
        assert!(!shot.contains(0.0, 10.0));
        assert!(!shot.contains(-100.0, 1080.0));
    }
}
