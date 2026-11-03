use std::path::Path;

use anyhow::{Context, Result};
use image::RgbaImage;

use crate::capture::encode_png;

/// `sizeof(BITMAPINFOHEADER)`.
const BITMAPINFOHEADER_SIZE: u32 = 40;

/// Puts an image on the clipboard as CF_DIB (classic apps such as Paint and Word)
/// plus the registered "PNG" format (browsers and Electron apps prefer it).
pub fn write_image(img: &RgbaImage) -> Result<()> {
    write_image_with_png(img, encode_png(img)?)
}

/// Like [`write_image`] for a PNG already on disk, reusing its bytes for the "PNG" format.
pub fn write_png_file(path: &Path) -> Result<()> {
    let png = std::fs::read(path).with_context(|| format!("cannot read {}", path.display()))?;
    let img = image::load_from_memory(&png)
        .with_context(|| format!("cannot decode {}", path.display()))?
        .to_rgba8();
    write_image_with_png(&img, png)
}

#[cfg(windows)]
fn write_image_with_png(img: &RgbaImage, png: Vec<u8>) -> Result<()> {
    use super::win32;

    let png_format = win32::register_format(windows::core::w!("PNG"))?;
    win32::set_clipboard(&[(win32::CF_DIB, build_dib(img)), (png_format, png)])
}

#[cfg(not(windows))]
fn write_image_with_png(_img: &RgbaImage, _png: Vec<u8>) -> Result<()> {
    anyhow::bail!("image clipboard is not implemented on this platform yet")
}

/// Puts plain text on the clipboard as CF_UNICODETEXT.
#[cfg(windows)]
pub fn write_text(text: &str) -> Result<()> {
    use super::win32;
    win32::set_clipboard(&[(win32::CF_UNICODETEXT, encode_unicode_text(text))])
}

#[cfg(not(windows))]
pub fn write_text(_text: &str) -> Result<()> {
    anyhow::bail!("text clipboard is not implemented on this platform yet")
}

/// NUL-terminated UTF-16LE with CRLF line endings, as CF_UNICODETEXT expects.
pub fn encode_unicode_text(text: &str) -> Vec<u8> {
    let normalized = text.replace("\r\n", "\n").replace('\n', "\r\n");
    normalized
        .encode_utf16()
        .chain(std::iter::once(0))
        .flat_map(u16::to_le_bytes)
        .collect()
}

/// Builds a CF_DIB payload: BITMAPINFOHEADER + 32bpp bottom-up BGRA pixels.
pub fn build_dib(img: &RgbaImage) -> Vec<u8> {
    let (width, height) = img.dimensions();
    let pixel_bytes = width * height * 4;

    let mut buf = Vec::with_capacity((BITMAPINFOHEADER_SIZE + pixel_bytes) as usize);
    buf.extend_from_slice(&BITMAPINFOHEADER_SIZE.to_le_bytes()); // biSize
    buf.extend_from_slice(&(width as i32).to_le_bytes()); // biWidth
    buf.extend_from_slice(&(height as i32).to_le_bytes()); // biHeight > 0: bottom-up
    buf.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    buf.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
    buf.extend_from_slice(&0u32.to_le_bytes()); // biCompression = BI_RGB
    buf.extend_from_slice(&pixel_bytes.to_le_bytes()); // biSizeImage
    buf.extend_from_slice(&0i32.to_le_bytes()); // biXPelsPerMeter
    buf.extend_from_slice(&0i32.to_le_bytes()); // biYPelsPerMeter
    buf.extend_from_slice(&0u32.to_le_bytes()); // biClrUsed
    buf.extend_from_slice(&0u32.to_le_bytes()); // biClrImportant

    let row_bytes = width as usize * 4;
    for row in img.as_raw().chunks_exact(row_bytes.max(1)).rev() {
        for &[r, g, b, a] in row.as_chunks::<4>().0 {
            buf.extend_from_slice(&[b, g, r, a]);
        }
    }
    buf
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn dib_is_bottom_up_bgra() {
        let mut img = RgbaImage::new(2, 2);
        img.put_pixel(0, 0, Rgba([1, 2, 3, 255])); // top-left
        img.put_pixel(0, 1, Rgba([10, 20, 30, 255])); // bottom-left

        let buf = build_dib(&img);
        assert_eq!(buf.len(), 40 + 2 * 2 * 4);
        assert_eq!(i32::from_le_bytes(buf[4..8].try_into().unwrap()), 2);
        assert_eq!(i32::from_le_bytes(buf[8..12].try_into().unwrap()), 2);
        assert_eq!(u16::from_le_bytes(buf[14..16].try_into().unwrap()), 32);

        // First stored row is the bottom row of the image.
        assert_eq!(&buf[40..44], &[30, 20, 10, 255]);
        // Second stored row is the top row.
        assert_eq!(&buf[48..52], &[3, 2, 1, 255]);
    }

    #[test]
    fn unicode_text_is_crlf_utf16_with_nul() {
        let bytes = encode_unicode_text("a\nğ");
        let (pairs, _) = bytes.as_chunks::<2>();
        let units: Vec<u16> = pairs.iter().map(|&p| u16::from_le_bytes(p)).collect();
        assert_eq!(String::from_utf16(&units).unwrap(), "a\r\nğ\0");
        // Existing CRLF must not double up.
        assert_eq!(encode_unicode_text("x\r\ny").len(), (4 + 1) * 2);
    }

    #[test]
    fn dib_handles_odd_widths() {
        let img = RgbaImage::from_pixel(3, 1, Rgba([9, 8, 7, 255]));
        let buf = build_dib(&img);
        assert_eq!(buf.len(), 40 + 3 * 4);
        assert_eq!(&buf[48..52], &[7, 8, 9, 255]);
    }
}
