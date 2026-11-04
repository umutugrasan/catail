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

/// The web address in a code's text, if there is one we may open: http(s) only, so a code
/// can't launch a file, a script or another app. Like a phone it also finds the address when
/// the code wraps it ("URL:https://…", a line of a contact card) or leaves out the scheme
/// ("www.site.com", "site.com/menu"; https:// goes in front).
pub fn web_url(text: &str) -> Option<String> {
    let text = text.trim();
    if text.is_empty() || text.len() > MAX_URL {
        return None;
    }
    if let Some(url) = as_url(text) {
        return Some(url);
    }
    // ASCII lower-casing keeps byte offsets, so `start` is valid in `text` too.
    let lower = text.to_ascii_lowercase();
    let start = ["https://", "http://"]
        .iter()
        .filter_map(|scheme| lower.find(scheme))
        .min()?;
    let candidate: String = text[start..]
        .chars()
        .take_while(|c| {
            !c.is_whitespace() && !c.is_control() && !matches!(c, '"' | '<' | '>' | ';')
        })
        .collect();
    as_url(candidate.trim_end_matches(['.', ',', ')', ']', '!', '?', '\'']))
}

/// `text` on its own as a web address.
fn as_url(text: &str) -> Option<String> {
    if text.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return None;
    }
    let lower = text.to_ascii_lowercase();
    let url = if lower.starts_with("https://") || lower.starts_with("http://") {
        text.to_owned()
    } else if looks_like_domain(text) {
        format!("https://{text}")
    } else {
        return None;
    };
    let rest = &url[url.find("//")? + 2..];
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    valid_host(host).then_some(url)
}

/// "www.example.com", "example.com/menu": a dotted name ending in letters, without a scheme.
fn looks_like_domain(text: &str) -> bool {
    let host = text.split(['/', '?', '#']).next().unwrap_or("");
    host.contains('.')
        && valid_host(host)
        && host
            .rsplit('.')
            .next()
            .is_some_and(|tld| tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic()))
}

/// A host name (letters in any script, digits, dots, dashes), maybe with a port.
fn valid_host(host: &str) -> bool {
    let host = host.rsplit_once('@').map_or(host, |(_, h)| h);
    let name = host.split(':').next().unwrap_or("");
    !name.is_empty()
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '.')
}

/// Opens `url` in the default browser. It must pass `web_url` unchanged.
#[cfg(windows)]
pub fn open(url: &str) -> anyhow::Result<()> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::{
        AllowSetForegroundWindow, ASFW_ANY, SW_SHOWNORMAL,
    };

    anyhow::ensure!(web_url(url).as_deref() == Some(url), "not a web address");
    // We hold the foreground (the overlay was clicked); pass it on, or an already running
    // browser opens the tab behind other windows.
    // SAFETY: no arguments to get wrong.
    let _ = unsafe { AllowSetForegroundWindow(ASFW_ANY) };
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
    if result.0 as isize > 32 {
        return Ok(());
    }
    // Fall back to the URL handler Explorer itself uses.
    std::process::Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map(drop)
        .map_err(|e| anyhow::anyhow!("cannot open the link ({}): {e}", result.0 as isize))
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
            "WIFI:S:home;T:WPA;P:secret;;",
            "1.5",
            "v1.2.3",
            "fiyat 12.50 TL",
        ] {
            assert_eq!(web_url(bad), None, "{bad}");
        }
        // Wrapped or bare addresses, like a phone finds them.
        for (text, url) in [
            ("URL:https://catail.test/x", "https://catail.test/x"),
            ("MEBKM:TITLE:Menü;URL:https://a.com/m;;", "https://a.com/m"),
            ("Menü için: https://a.com/b.", "https://a.com/b"),
            ("example.com/menu?t=3", "https://example.com/menu?t=3"),
            ("Örnek.com.tr", "https://Örnek.com.tr"),
        ] {
            assert_eq!(web_url(text).as_deref(), Some(url), "{text}");
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
