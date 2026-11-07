//! File lists on the clipboard (CF_HDROP), as Explorer's "Copy" produces.

use std::path::{Path, PathBuf};

use anyhow::Result;

/// `sizeof(DROPFILES)`: pFiles(u32) + pt(i32, i32) + fNC(i32) + fWide(i32).
const DROPFILES_SIZE: u32 = 20;

/// Puts the files on the clipboard in the given order, marked as a copy (not a move).
#[cfg(windows)]
pub fn write_files(paths: &[&Path]) -> Result<()> {
    use super::win32;
    const DROPEFFECT_COPY: u32 = 1;

    let preferred_effect = win32::register_format(windows::core::w!("Preferred DropEffect"))?;
    win32::set_clipboard(&[
        (win32::CF_HDROP, build_hdrop(paths)),
        (preferred_effect, DROPEFFECT_COPY.to_le_bytes().to_vec()),
    ])
}

#[cfg(not(windows))]
pub fn write_files(_paths: &[&Path]) -> Result<()> {
    anyhow::bail!("file clipboard is not implemented on this platform yet")
}

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

/// Reads a CF_HDROP payload back into paths, in order. Anything malformed yields what could be
/// read up to there, so a bad list can't take the watcher down.
pub fn parse_hdrop(bytes: &[u8]) -> Vec<PathBuf> {
    let u32_at = |o: usize| Some(u32::from_le_bytes(bytes.get(o..o + 4)?.try_into().ok()?));
    let (Some(offset), Some(wide)) = (u32_at(0), u32_at(16)) else {
        return Vec::new();
    };
    let Some(list) = bytes.get(offset as usize..) else {
        return Vec::new();
    };
    if wide == 0 {
        // Very old programs. Their code page is unknown: a wrong guess gives a path that
        // doesn't exist, which the queue turns away.
        return list
            .split(|&b| b == 0)
            .take_while(|name| !name.is_empty())
            .map(|name| PathBuf::from(String::from_utf8_lossy(name).into_owned()))
            .collect();
    }
    let (pairs, _) = list.as_chunks::<2>();
    let units: Vec<u16> = pairs.iter().map(|&p| u16::from_le_bytes(p)).collect();
    units
        .split(|&u| u == 0)
        .take_while(|name| !name.is_empty())
        .map(|name| PathBuf::from(String::from_utf16_lossy(name)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Decodes the UTF-16 file list that follows the DROPFILES header.
    fn file_list(buf: &[u8]) -> String {
        let (pairs, rest) = buf[DROPFILES_SIZE as usize..].as_chunks::<2>();
        assert!(rest.is_empty());
        let units: Vec<u16> = pairs.iter().map(|&p| u16::from_le_bytes(p)).collect();
        String::from_utf16(&units).unwrap()
    }

    #[test]
    fn hdrop_reads_back_in_order() {
        let paths = [
            Path::new(r"C:\Masaüstü\rapor.pdf"),
            Path::new(r"\\sunucu\pay\tez.docx"),
        ];
        let parsed = parse_hdrop(&build_hdrop(&paths));
        assert_eq!(parsed, paths.map(Path::to_path_buf));
    }

    #[test]
    fn hdrop_with_narrow_paths() {
        let mut buf = vec![0u8; 20];
        buf[0] = 20;
        buf.extend_from_slice(b"C:\\a.txt\0C:\\b.txt\0\0");
        assert_eq!(
            parse_hdrop(&buf),
            [PathBuf::from(r"C:\a.txt"), PathBuf::from(r"C:\b.txt")]
        );
    }

    #[test]
    fn broken_hdrop_gives_nothing() {
        assert!(parse_hdrop(&[]).is_empty());
        assert!(parse_hdrop(&[1, 2, 3]).is_empty());
        // Offset past the end of the data.
        let mut buf = vec![0u8; 20];
        buf[0] = 200;
        assert!(parse_hdrop(&buf).is_empty());
        // Header only, no list.
        let mut empty = vec![0u8; 20];
        empty[0] = 20;
        empty[16] = 1;
        assert!(parse_hdrop(&empty).is_empty());
    }

    #[test]
    fn hdrop_layout() {
        let buf = build_hdrop(&[Path::new(r"C:\a.png"), Path::new(r"C:\b.png")]);
        assert_eq!(u32::from_le_bytes(buf[0..4].try_into().unwrap()), 20);
        assert_eq!(i32::from_le_bytes(buf[16..20].try_into().unwrap()), 1);
        assert_eq!(file_list(&buf), "C:\\a.png\0C:\\b.png\0\0");
    }

    #[test]
    fn hdrop_keeps_non_ascii_paths() {
        let buf = build_hdrop(&[Path::new(r"C:\Kullanıcılar\görüntü.png")]);
        assert_eq!(file_list(&buf), "C:\\Kullanıcılar\\görüntü.png\0\0");
    }
}
