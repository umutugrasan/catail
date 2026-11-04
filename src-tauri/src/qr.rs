//! QR codes in a captured frame, read on the device the way a phone camera does: the overlay
//! shows each code's link next to it.

use image::RgbaImage;
use serde::Serialize;

/// Longest web address we offer to open.
const MAX_URL: usize = 2048;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QrCode {
    pub text: String,
    /// The code's web address, when it holds one that is safe to open (http or https).
    pub url: Option<String>,
    /// Bounding box in frame pixels.
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Luminance of every pixel, row by row.
pub fn luma(img: &RgbaImage) -> Vec<u8> {
    img.pixels()
        .map(|p| {
            let [r, g, b, _] = p.0;
            ((u32::from(r) * 299 + u32::from(g) * 587 + u32::from(b) * 114) / 1000) as u8
        })
        .collect()
}

/// Every QR code in a `w` × `h` luminance image. Codes drawn light on dark (dark themes) are
/// found too.
pub fn find(w: usize, h: usize, luma: &[u8]) -> Vec<QrCode> {
    let mut found: Vec<QrCode> = Vec::new();
    for invert in [false, true] {
        let mut img = rqrr::PreparedImage::prepare_from_greyscale(w, h, |x, y| {
            let v = luma[y * w + x];
            if invert {
                255 - v
            } else {
                v
            }
        });
        for grid in img.detect_grids() {
            let Ok((_, text)) = grid.decode() else {
                continue;
            };
            let xs = grid.bounds.map(|p| p.x.clamp(0, w as i32) as u32);
            let ys = grid.bounds.map(|p| p.y.clamp(0, h as i32) as u32);
            let (x, y) = (*xs.iter().min().unwrap(), *ys.iter().min().unwrap());
            let code = QrCode {
                url: web_url(&text),
                text,
                x,
                y,
                width: xs.iter().max().unwrap() - x,
                height: ys.iter().max().unwrap() - y,
            };
            if !found
                .iter()
                .any(|f| f.text == code.text && overlaps(f, &code))
            {
                found.push(code);
            }
        }
    }
    found
}

fn overlaps(a: &QrCode, b: &QrCode) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/// The web address in a code's text, if it is one we may open: http(s) only, so a code can't
/// launch a file, a script or another app. "www.…" gets https:// in front, like phones do.
pub fn web_url(text: &str) -> Option<String> {
    let text = text.trim();
    if text.is_empty()
        || text.len() > MAX_URL
        || text.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return None;
    }
    let lower = text.to_ascii_lowercase();
    let url = if lower.starts_with("https://") || lower.starts_with("http://") {
        text.to_owned()
    } else if lower.starts_with("www.") {
        format!("https://{text}")
    } else {
        return None;
    };
    // Something must follow the scheme.
    let rest = &url[url.find("//")? + 2..];
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    (!host.is_empty()).then_some(url)
}

/// Opens `url` in the default browser. It must pass `web_url` unchanged.
#[cfg(windows)]
pub fn open(url: &str) -> anyhow::Result<()> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    anyhow::ensure!(web_url(url).as_deref() == Some(url), "not a web address");
    // SAFETY: plain strings; ShellExecuteW copies them before returning.
    let result = unsafe {
        ShellExecuteW(
            None,
            &HSTRING::from("open"),
            &HSTRING::from(url),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    // Values above 32 mean success.
    anyhow::ensure!(
        result.0 as isize > 32,
        "cannot open the link ({})",
        result.0 as isize
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_web_addresses_can_be_opened() {
        assert_eq!(
            web_url("https://example.com/a?b=1"),
            Some("https://example.com/a?b=1".into())
        );
        assert_eq!(
            web_url("  HTTP://Example.com "),
            Some("HTTP://Example.com".into())
        );
        assert_eq!(
            web_url("www.example.com"),
            Some("https://www.example.com".into())
        );
        for bad in [
            "",
            "hello world",
            "javascript:alert(1)",
            "file:///C:/Windows/system32/cmd.exe",
            "ms-settings:privacy",
            "https://",
            "https:///path",
            "https://exa mple.com",
            "WIFI:S:home;T:WPA;P:secret;;",
        ] {
            assert_eq!(web_url(bad), None, "{bad}");
        }
        assert_eq!(
            web_url(&format!("https://a.com/{}", "x".repeat(MAX_URL))),
            None
        );
    }

    /// A real QR code for `text`, drawn like a screenshot would show it: modules `scale` px,
    /// a quiet zone, on a larger background. `invert`: light modules on a dark page.
    fn screenshot_of(text: &str, invert: bool) -> (usize, usize, Vec<u8>) {
        let code = qrcode::QrCode::new(text).unwrap();
        let (n, scale, quiet, margin) = (code.width(), 5, 4, 30);
        let side = (n + 2 * quiet) * scale + 2 * margin;
        let (dark, light) = if invert { (235, 25) } else { (15, 245) };
        let mut img = vec![light; side * side];
        for (i, color) in code.to_colors().into_iter().enumerate() {
            if color == qrcode::Color::Dark {
                let (c, r) = (i % n, i / n);
                for dy in 0..scale {
                    for dx in 0..scale {
                        let x = margin + (quiet + c) * scale + dx;
                        let y = margin + (quiet + r) * scale + dy;
                        img[y * side + x] = dark;
                    }
                }
            }
        }
        (side, side, img)
    }

    #[test]
    fn finds_codes_both_ways_round() {
        for invert in [false, true] {
            let (w, h, img) = screenshot_of("https://catail.test/qr", invert);
            let codes = find(w, h, &img);
            assert_eq!(codes.len(), 1, "invert {invert}");
            assert_eq!(codes[0].url.as_deref(), Some("https://catail.test/qr"));
            // The box sits around the code, inside the margin.
            assert!(codes[0].x >= 30 && codes[0].y >= 30 && codes[0].width > 50);
        }
    }

    #[test]
    fn plain_text_codes_have_no_link() {
        let (w, h, img) = screenshot_of("Merhaba Catail", false);
        let codes = find(w, h, &img);
        assert_eq!(codes.len(), 1);
        assert_eq!(codes[0].text, "Merhaba Catail");
        assert_eq!(codes[0].url, None);
    }

    #[test]
    fn blank_frames_have_no_codes() {
        assert!(find(64, 48, &[200; 64 * 48]).is_empty());
    }
}
