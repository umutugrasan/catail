//! Platform-independent builders for the Windows clipboard byte layouts.
//! Kept pure so they can be unit tested without touching the real clipboard.

use std::path::Path;

use image::RgbaImage;

/// `sizeof(DROPFILES)`: pFiles(u32) + pt(i32, i32) + fNC(i32) + fWide(i32).
const DROPFILES_SIZE: u32 = 20;

/// Builds a CF_HDROP payload: a DROPFILES header followed by a double-NUL
/// terminated list of NUL-terminated UTF-16 paths. Order is preserved.
pub fn build_hdrop(paths: &[&Path]) -> Vec<u8> {
    let mut buf = Vec::new();
    buf.extend_from_slice(&DROPFILES_SIZE.to_le_bytes()); // pFiles: offset of file list
    buf.extend_from_slice(&0i32.to_le_bytes()); // pt.x
    buf.extend_from_slice(&0i32.to_le_bytes()); // pt.y
    buf.extend_from_slice(&0i32.to_le_bytes()); // fNC
    buf.extend_from_slice(&1i32.to_le_bytes()); // fWide: paths are UTF-16

    for path in paths {
        for unit in path.as_os_str().to_string_lossy().encode_utf16() {
            buf.extend_from_slice(&unit.to_le_bytes());
        }
        buf.extend_from_slice(&0u16.to_le_bytes());
    }
    buf.extend_from_slice(&0u16.to_le_bytes());
    buf
}

/// `sizeof(BITMAPINFOHEADER)`.
const BITMAPINFOHEADER_SIZE: u32 = 40;

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

    for y in (0..height).rev() {
        for x in 0..width {
            let [r, g, b, a] = img.get_pixel(x, y).0;
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
    fn hdrop_layout() {
        let a = Path::new(r"C:\a.png");
        let b = Path::new(r"C:\b.png");
        let buf = build_hdrop(&[a, b]);

        assert_eq!(u32::from_le_bytes(buf[0..4].try_into().unwrap()), 20);
        assert_eq!(i32::from_le_bytes(buf[16..20].try_into().unwrap()), 1);

        assert_eq!(file_list(&buf), "C:\\a.png\0C:\\b.png\0\0");
    }

    #[test]
    fn hdrop_keeps_non_ascii_paths() {
        let p = Path::new(r"C:\Kullanıcılar\görüntü.png");
        let buf = build_hdrop(&[p]);
        assert_eq!(file_list(&buf), "C:\\Kullanıcılar\\görüntü.png\0\0");
    }

    /// Decodes the UTF-16 file list that follows the DROPFILES header.
    fn file_list(buf: &[u8]) -> String {
        let (pairs, rest) = buf[DROPFILES_SIZE as usize..].as_chunks::<2>();
        assert!(rest.is_empty());
        let units: Vec<u16> = pairs.iter().map(|&p| u16::from_le_bytes(p)).collect();
        String::from_utf16(&units).unwrap()
    }

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
}
