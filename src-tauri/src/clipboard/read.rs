//! Turns what the user copied into a queue item: files, then text, then an image.

use std::collections::HashMap;
use std::path::PathBuf;

use image::RgbaImage;

pub enum Copied {
    Text(String),
    Image(RgbaImage),
    /// Files picked in Explorer and the like, in the order the list has them.
    Files(Vec<PathBuf>),
}

pub struct Clip {
    pub content: Copied,
    pub source_app: Option<String>,
}

/// Registered format ids that `classify` needs to know about.
pub struct FormatIds {
    pub png: u32,
    /// Set by password managers and similar: never record this content.
    pub exclude_from_monitoring: u32,
    /// DWORD 0 means "keep out of clipboard history"; treated like the exclusion above.
    pub can_include_in_history: u32,
    pub viewer_ignore: u32,
}

const CF_UNICODETEXT: u32 = 13;
const CF_DIB: u32 = 8;
const CF_DIBV5: u32 = 17;
const CF_HDROP: u32 = 15;

/// Reads the clipboard for the watcher. `None` when it's excluded or holds nothing usable.
#[cfg(windows)]
pub fn read_for_queue() -> anyhow::Result<Option<Clip>> {
    use super::win32;
    use windows::core::w;

    let ids = FormatIds {
        png: win32::register_format(w!("PNG"))?,
        exclude_from_monitoring: win32::register_format(w!(
            "ExcludeClipboardContentFromMonitorProcessing"
        ))?,
        can_include_in_history: win32::register_format(w!("CanIncludeInClipboardHistory"))?,
        viewer_ignore: win32::register_format(w!("Clipboard Viewer Ignore"))?,
    };
    let formats: HashMap<u32, Vec<u8>> = win32::read_all_formats()?.into_iter().collect();
    Ok(classify(&formats, &ids).map(|content| Clip {
        content,
        source_app: win32::owner_process_name(),
    }))
}

#[cfg(not(windows))]
pub fn read_for_queue() -> anyhow::Result<Option<Clip>> {
    Ok(None)
}

pub fn classify(formats: &HashMap<u32, Vec<u8>>, ids: &FormatIds) -> Option<Copied> {
    let hidden_from_history = formats
        .get(&ids.can_include_in_history)
        .is_some_and(|v| v.get(..4) == Some(&[0, 0, 0, 0]));
    if formats.contains_key(&ids.exclude_from_monitoring)
        || formats.contains_key(&ids.viewer_ignore)
        || hidden_from_history
    {
        return None;
    }

    // A file list that comes with a picture is about the picture: some browsers' "Copy image"
    // adds a temp file they delete later. Beside plain text, the files are what was copied.
    let has_image = [ids.png, CF_DIBV5, CF_DIB]
        .iter()
        .any(|f| formats.contains_key(f));
    if !has_image {
        if let Some(bytes) = formats.get(&CF_HDROP) {
            let paths = super::files::parse_hdrop(bytes);
            if !paths.is_empty() {
                return Some(Copied::Files(paths));
            }
        }
    }

    if let Some(bytes) = formats.get(&CF_UNICODETEXT) {
        let text = decode_unicode_text(bytes);
        // Office puts text next to a picture of it; whitespace-only text means "not text".
        if !text.trim().is_empty() {
            return Some(Copied::Text(text));
        }
    }
    if let Some(png) = formats.get(&ids.png) {
        if let Ok(img) = image::load_from_memory(png) {
            return Some(Copied::Image(img.to_rgba8()));
        }
    }
    [CF_DIBV5, CF_DIB]
        .iter()
        .find_map(|f| formats.get(f).and_then(|b| parse_dib(b)))
        .map(Copied::Image)
}

/// CF_UNICODETEXT: UTF-16LE up to the first NUL, CRLF normalized to LF.
pub fn decode_unicode_text(bytes: &[u8]) -> String {
    let (pairs, _) = bytes.as_chunks::<2>();
    let units: Vec<u16> = pairs
        .iter()
        .map(|&p| u16::from_le_bytes(p))
        .take_while(|&u| u != 0)
        .collect();
    String::from_utf16_lossy(&units).replace("\r\n", "\n")
}

/// Decodes a 24/32-bit CF_DIB or CF_DIBV5 payload (BI_RGB or BI_BITFIELDS).
pub fn parse_dib(bytes: &[u8]) -> Option<RgbaImage> {
    let u32_at = |o: usize| Some(u32::from_le_bytes(bytes.get(o..o + 4)?.try_into().ok()?));
    let header_size = u32_at(0)? as usize;
    let width = u32_at(4)? as i32;
    let height = u32_at(8)? as i32;
    let bit_count = u16::from_le_bytes(bytes.get(14..16)?.try_into().ok()?);
    let compression = u32_at(16)?;
    let colors_used = u32_at(32)? as usize;

    const BI_RGB: u32 = 0;
    const BI_BITFIELDS: u32 = 3;
    if width <= 0 || height == 0 || !matches!(bit_count, 24 | 32) {
        return None;
    }
    if !matches!(compression, BI_RGB | BI_BITFIELDS) {
        return None;
    }

    // A plain BITMAPINFOHEADER with BI_BITFIELDS is followed by three DWORD masks.
    let masks = if compression == BI_BITFIELDS && header_size == 40 {
        12
    } else {
        0
    };
    let pixels_at = header_size + masks + colors_used * 4;
    let (w, h) = (width as u32, height.unsigned_abs());
    let bytes_per_px = usize::from(bit_count / 8);
    let stride = (w as usize * usize::from(bit_count)).div_ceil(32) * 4;
    let pixels = bytes.get(pixels_at..pixels_at + stride * h as usize)?;

    let mut img = RgbaImage::new(w, h);
    let mut any_alpha = false;
    for y in 0..h {
        // Positive height means the rows are stored bottom-up.
        let src_row = if height > 0 { h - 1 - y } else { y } as usize;
        let row = &pixels[src_row * stride..];
        for x in 0..w {
            let px = &row[x as usize * bytes_per_px..];
            let alpha = if bit_count == 32 { px[3] } else { 255 };
            any_alpha |= alpha != 0;
            img.put_pixel(x, y, image::Rgba([px[2], px[1], px[0], alpha]));
        }
    }
    // Many apps leave the alpha byte of 32-bit BI_RGB at zero; that means opaque.
    if !any_alpha {
        img.pixels_mut().for_each(|p| p.0[3] = 255);
    }
    Some(img)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::write::{build_dib, encode_unicode_text};
    use image::Rgba;

    const IDS: FormatIds = FormatIds {
        png: 0xC001,
        exclude_from_monitoring: 0xC002,
        can_include_in_history: 0xC003,
        viewer_ignore: 0xC004,
    };

    fn formats(items: &[(u32, Vec<u8>)]) -> HashMap<u32, Vec<u8>> {
        items.iter().cloned().collect()
    }

    #[test]
    fn text_round_trips_with_lf() {
        assert_eq!(
            decode_unicode_text(&encode_unicode_text("a\nb ğ")),
            "a\nb ğ"
        );
    }

    #[test]
    fn text_wins_over_image() {
        let img = RgbaImage::from_pixel(1, 1, Rgba([1, 2, 3, 255]));
        let f = formats(&[
            (CF_UNICODETEXT, encode_unicode_text("hi")),
            (CF_DIB, build_dib(&img)),
        ]);
        assert!(matches!(classify(&f, &IDS), Some(Copied::Text(t)) if t == "hi"));
    }

    fn hdrop(paths: &[&str]) -> (u32, Vec<u8>) {
        let paths: Vec<&std::path::Path> = paths.iter().map(std::path::Path::new).collect();
        (CF_HDROP, crate::clipboard::files::build_hdrop(&paths))
    }

    #[test]
    fn a_file_list_becomes_files_in_order() {
        let f = formats(&[hdrop(&[r"C:\a.pdf", r"C:\b.docx"])]);
        let Some(Copied::Files(paths)) = classify(&f, &IDS) else {
            panic!("expected files");
        };
        assert_eq!(
            paths,
            [PathBuf::from(r"C:\a.pdf"), PathBuf::from(r"C:\b.docx")]
        );
    }

    #[test]
    fn files_win_over_text() {
        let f = formats(&[
            hdrop(&[r"C:\a.pdf"]),
            (CF_UNICODETEXT, encode_unicode_text(r"C:\a.pdf")),
        ]);
        assert!(matches!(classify(&f, &IDS), Some(Copied::Files(_))));
    }

    #[test]
    fn a_picture_wins_over_its_temp_file() {
        let img = RgbaImage::from_pixel(1, 1, Rgba([1, 2, 3, 255]));
        let f = formats(&[hdrop(&[r"C:\Temp\img.png"]), (CF_DIB, build_dib(&img))]);
        assert!(matches!(classify(&f, &IDS), Some(Copied::Image(_))));
    }

    #[test]
    fn excluded_file_lists_are_ignored() {
        let f = formats(&[hdrop(&[r"C:\a.pdf"]), (IDS.exclude_from_monitoring, vec![])]);
        assert!(classify(&f, &IDS).is_none());
    }

    #[test]
    fn an_empty_file_list_falls_through() {
        let f = formats(&[hdrop(&[]), (CF_UNICODETEXT, encode_unicode_text("hi"))]);
        assert!(matches!(classify(&f, &IDS), Some(Copied::Text(_))));
    }

    #[test]
    fn password_managers_are_ignored() {
        let text = (CF_UNICODETEXT, encode_unicode_text("secret"));
        assert!(classify(
            &formats(&[text.clone(), (IDS.exclude_from_monitoring, vec![])]),
            &IDS
        )
        .is_none());
        assert!(classify(
            &formats(&[text.clone(), (IDS.can_include_in_history, vec![0; 4])]),
            &IDS
        )
        .is_none());
        assert!(classify(
            &formats(&[text.clone(), (IDS.can_include_in_history, vec![1, 0, 0, 0])]),
            &IDS
        )
        .is_some());
    }

    #[test]
    fn blank_text_falls_back_to_image() {
        let img = RgbaImage::from_pixel(2, 1, Rgba([9, 8, 7, 255]));
        let f = formats(&[
            (CF_UNICODETEXT, encode_unicode_text("  ")),
            (CF_DIB, build_dib(&img)),
        ]);
        assert!(matches!(classify(&f, &IDS), Some(Copied::Image(i)) if i == img));
    }

    #[test]
    fn dib_round_trips() {
        let mut img = RgbaImage::from_pixel(3, 2, Rgba([10, 20, 30, 255]));
        img.put_pixel(2, 0, Rgba([200, 100, 50, 255]));
        assert_eq!(parse_dib(&build_dib(&img)), Some(img));
    }

    #[test]
    fn dib_24bit_with_row_padding_and_zero_alpha_32bit() {
        // 1x1, 24bpp, bottom-up: BGR + 1 padding byte.
        let mut dib = vec![0u8; 40];
        dib[0] = 40;
        dib[4] = 1;
        dib[8] = 1;
        dib[12] = 1;
        dib[14] = 24;
        dib.extend_from_slice(&[3, 2, 1, 0]);
        assert_eq!(
            parse_dib(&dib).unwrap().get_pixel(0, 0),
            &Rgba([1, 2, 3, 255])
        );

        let mut dib32 = build_dib(&RgbaImage::from_pixel(1, 1, Rgba([5, 6, 7, 255])));
        dib32[43] = 0; // alpha byte of the only pixel
        assert_eq!(
            parse_dib(&dib32).unwrap().get_pixel(0, 0),
            &Rgba([5, 6, 7, 255])
        );
    }
}
