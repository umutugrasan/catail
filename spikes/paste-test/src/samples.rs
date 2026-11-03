//! Generates numbered test images so paste order is easy to verify by eye.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use image::{Rgba, RgbaImage};

const WIDTH: u32 = 480;
const HEIGHT: u32 = 270;
const GLYPH_SCALE: u32 = 24;

/// 3x5 bitmap digits, one row per entry, MSB = left column.
const DIGITS: [[u8; 5]; 10] = [
    [0b111, 0b101, 0b101, 0b101, 0b111],
    [0b010, 0b110, 0b010, 0b010, 0b111],
    [0b111, 0b001, 0b111, 0b100, 0b111],
    [0b111, 0b001, 0b111, 0b001, 0b111],
    [0b101, 0b101, 0b111, 0b001, 0b001],
    [0b111, 0b100, 0b111, 0b001, 0b111],
    [0b111, 0b100, 0b111, 0b101, 0b111],
    [0b111, 0b001, 0b010, 0b010, 0b010],
    [0b111, 0b101, 0b111, 0b101, 0b111],
    [0b111, 0b101, 0b111, 0b001, 0b111],
];

/// Writes `001.png` .. `NNN.png` into `dir` and returns their paths in order.
pub fn write_samples(dir: &Path, count: u32) -> Result<Vec<PathBuf>> {
    std::fs::create_dir_all(dir).with_context(|| format!("cannot create {}", dir.display()))?;
    (1..=count)
        .map(|n| {
            let path = dir.join(format!("{n:03}.png"));
            render_sample(n, count)
                .save(&path)
                .with_context(|| format!("cannot write {}", path.display()))?;
            Ok(path)
        })
        .collect()
}

/// Renders a solid background (hue varies with `n`) with `n` drawn large in white.
pub fn render_sample(n: u32, count: u32) -> RgbaImage {
    let hue = (n - 1) as f32 / count.max(1) as f32;
    let mut img = RgbaImage::from_pixel(WIDTH, HEIGHT, hsv_to_rgba(hue, 0.65, 0.75));

    let digits: Vec<usize> = n.to_string().bytes().map(|b| (b - b'0') as usize).collect();
    let glyph_w = 3 * GLYPH_SCALE;
    let gap = GLYPH_SCALE;
    let total_w = digits.len() as u32 * glyph_w + (digits.len() as u32 - 1) * gap;
    let origin_x = WIDTH.saturating_sub(total_w) / 2;
    let origin_y = HEIGHT.saturating_sub(5 * GLYPH_SCALE) / 2;

    for (i, &d) in digits.iter().enumerate() {
        let gx = origin_x + i as u32 * (glyph_w + gap);
        draw_digit(&mut img, d, gx, origin_y);
    }
    img
}

fn draw_digit(img: &mut RgbaImage, digit: usize, x0: u32, y0: u32) {
    let white = Rgba([255, 255, 255, 255]);
    for (row, bits) in DIGITS[digit].iter().enumerate() {
        for col in 0..3u32 {
            if bits & (0b100 >> col) == 0 {
                continue;
            }
            for dy in 0..GLYPH_SCALE {
                for dx in 0..GLYPH_SCALE {
                    let x = x0 + col * GLYPH_SCALE + dx;
                    let y = y0 + row as u32 * GLYPH_SCALE + dy;
                    if x < img.width() && y < img.height() {
                        img.put_pixel(x, y, white);
                    }
                }
            }
        }
    }
}

fn hsv_to_rgba(h: f32, s: f32, v: f32) -> Rgba<u8> {
    let i = (h * 6.0).floor();
    let f = h * 6.0 - i;
    let (p, q, t) = (v * (1.0 - s), v * (1.0 - f * s), v * (1.0 - (1.0 - f) * s));
    let (r, g, b) = match i as i32 % 6 {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    };
    Rgba([(r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8, 255])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_differ_and_have_fixed_size() {
        let a = render_sample(1, 5);
        let b = render_sample(2, 5);
        assert_eq!(a.dimensions(), (WIDTH, HEIGHT));
        assert_ne!(a.get_pixel(0, 0), b.get_pixel(0, 0));
    }

    #[test]
    fn multi_digit_numbers_fit() {
        let img = render_sample(12, 12);
        let white = Rgba([255, 255, 255, 255]);
        assert!(img.pixels().any(|p| *p == white));
    }

    #[test]
    fn writes_ordered_files() {
        let dir = std::env::temp_dir().join(format!("paste-test-samples-{}", std::process::id()));
        let paths = write_samples(&dir, 3).unwrap();
        let names: Vec<_> = paths
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["001.png", "002.png", "003.png"]);
        assert!(paths.iter().all(|p| p.is_file()));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
