//! Text recognition with the OCR engine built into Windows. Runs offline, in the user's
//! display languages (Turkish and English on a Turkish Windows).

use anyhow::Result;
use image::imageops::FilterType;
use image::RgbaImage;

/// Screen text is small for the engine; below this size it reads better enlarged 2×.
const UPSCALE_BELOW: u32 = 1600;

/// Returns the recognized lines, joined with newlines.
#[cfg(windows)]
pub fn recognize(img: &RgbaImage) -> Result<String> {
    use anyhow::{anyhow, Context};
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;

    let max = OcrEngine::MaxImageDimension().unwrap_or(10_000);
    let img = prepare(img, max);
    let writer = DataWriter::new()?;
    writer.WriteBytes(&to_bgra(&img))?;
    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
        &writer.DetachBuffer()?,
        BitmapPixelFormat::Bgra8,
        img.width() as i32,
        img.height() as i32,
    )
    .context("cannot hand the image to the OCR engine")?;

    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|_| anyhow!(crate::i18n::t("ocr.no_language")))?;
    let result = engine
        .RecognizeAsync(&bitmap)?
        .get()
        .context("text recognition failed")?;
    let lines = result.Lines()?;
    let mut text = Vec::with_capacity(lines.Size()? as usize);
    for i in 0..lines.Size()? {
        text.push(lines.GetAt(i)?.Text()?.to_string());
    }
    Ok(text.join("\n"))
}

#[cfg(not(windows))]
pub fn recognize(_img: &RgbaImage) -> Result<String> {
    anyhow::bail!("text recognition is not implemented on this platform yet")
}

/// Enlarges small captures and shrinks ones over the engine's size limit.
pub fn prepare(img: &RgbaImage, max_dimension: u32) -> RgbaImage {
    let (w, h) = img.dimensions();
    let longest = w.max(h).max(1);
    let scale = if longest < UPSCALE_BELOW {
        2.0
    } else if longest > max_dimension {
        f64::from(max_dimension) / f64::from(longest)
    } else {
        return img.clone();
    };
    let (nw, nh) = (
        ((f64::from(w) * scale) as u32).clamp(1, max_dimension),
        ((f64::from(h) * scale) as u32).clamp(1, max_dimension),
    );
    image::imageops::resize(img, nw, nh, FilterType::CatmullRom)
}

pub fn to_bgra(img: &RgbaImage) -> Vec<u8> {
    let mut out = Vec::with_capacity(img.as_raw().len());
    for &[r, g, b, a] in img.as_raw().as_chunks::<4>().0 {
        out.extend_from_slice(&[b, g, r, a]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn small_images_are_doubled_and_large_ones_capped() {
        assert_eq!(
            prepare(&RgbaImage::new(400, 100), 10_000).dimensions(),
            (800, 200)
        );
        assert_eq!(
            prepare(&RgbaImage::new(2000, 1000), 10_000).dimensions(),
            (2000, 1000)
        );
        assert_eq!(
            prepare(&RgbaImage::new(4000, 1000), 2000).dimensions(),
            (2000, 500)
        );
    }

    /// Manual smoke test against the real screen: `cargo test -- --ignored ocr_reads_screen`.
    #[test]
    #[ignore]
    #[cfg(windows)]
    fn ocr_reads_screen() {
        let monitor = xcap::Monitor::all().unwrap().remove(0);
        let text = recognize(&monitor.capture_image().unwrap()).unwrap();
        println!(
            "recognized {} chars: {:?}",
            text.chars().count(),
            text.chars().take(120).collect::<String>()
        );
        assert!(!text.trim().is_empty());
    }

    #[test]
    fn bgra_swaps_red_and_blue() {
        let img = RgbaImage::from_pixel(1, 1, Rgba([1, 2, 3, 4]));
        assert_eq!(to_bgra(&img), [3, 2, 1, 4]);
    }
}
