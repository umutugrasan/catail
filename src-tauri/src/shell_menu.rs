//! "Kuyruğa ekle" in Explorer's right-click menu for files. Explorer starts Catail once per
//! selected file with `--enqueue <path>`; a running Catail receives that as a second launch.
//!
//! It is a classic verb under HKCU: no admin rights, and the app can write it itself in the
//! interface language. Windows 11 lists classic verbs under "Show more options"; its short menu
//! only takes signed packaged apps.

use std::path::PathBuf;

const ENQUEUE_ARG: &str = "--enqueue";

/// The files to queue, when this launch came from the menu.
pub fn paths_to_enqueue(args: &[String]) -> Option<Vec<PathBuf>> {
    let at = args.iter().position(|arg| arg == ENQUEUE_ARG)?;
    Some(args[at + 1..].iter().map(PathBuf::from).collect())
}

/// `(subkey below the verb's key, value name, data)`; an empty name is the key's default value.
fn registry_values(exe: &str, label: &str) -> [(&'static str, &'static str, String); 4] {
    [
        ("", "", label.to_owned()),
        ("", "Icon", format!("\"{exe}\",0")),
        // No limit on how many files can be selected. Each still gets its own launch.
        ("", "MultiSelectModel", "Player".to_owned()),
        ("command", "", format!("\"{exe}\" {ENQUEUE_ARG} \"%1\"")),
    ]
}

/// Adds or refreshes the menu entry for this exe, in the current interface language. A debug
/// build leaves it alone, so it can't point Explorer at a build folder.
pub fn register() {
    if cfg!(debug_assertions) {
        return;
    }
    if let Err(e) = write_entry() {
        eprintln!("cannot add the Explorer menu entry: {e:#}");
    }
}

#[cfg(windows)]
fn write_entry() -> anyhow::Result<()> {
    let exe = std::env::current_exe()?;
    let label = crate::i18n::t("overlay.add_to_queue");
    for (subkey, name, data) in registry_values(&exe.display().to_string(), &label) {
        win::set_string(subkey, name, &data)?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn write_entry() -> anyhow::Result<()> {
    Ok(())
}

#[cfg(windows)]
mod win {
    use anyhow::{bail, Result};
    use windows::core::HSTRING;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, REG_SZ,
    };

    /// Keep in step with the uninstaller's hook, `src-tauri/windows/hooks.nsh`.
    const VERB_KEY: &str = r"Software\Classes\*\shell\Catail.AddToQueue";

    pub fn set_string(subkey: &str, name: &str, data: &str) -> Result<()> {
        let path = if subkey.is_empty() {
            VERB_KEY.to_owned()
        } else {
            format!(r"{VERB_KEY}\{subkey}")
        };
        let mut key = HKEY::default();
        // SAFETY: the strings outlive the call and `key` is valid for writes.
        let status =
            unsafe { RegCreateKeyW(HKEY_CURRENT_USER, &HSTRING::from(path.as_str()), &mut key) };
        if status != ERROR_SUCCESS {
            bail!("RegCreateKeyW({path}): {status:?}");
        }

        // REG_SZ data is UTF-16 with its terminator, counted in bytes.
        let bytes: Vec<u8> = data
            .encode_utf16()
            .chain(std::iter::once(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        let value_name = HSTRING::from(name);
        // SAFETY: `key` was just opened; `bytes` outlives the call.
        let status = unsafe { RegSetValueExW(key, &value_name, None, REG_SZ, Some(&bytes)) };
        // SAFETY: `key` is open and not used again.
        let _ = unsafe { RegCloseKey(key) };
        if status != ERROR_SUCCESS {
            bail!("RegSetValueExW({path}, {name}): {status:?}");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn a_menu_launch_gives_its_files() {
        assert_eq!(
            paths_to_enqueue(&args(&["catail.exe", "--enqueue", r"C:\Masaüstü\a b.pdf"])),
            Some(vec![PathBuf::from(r"C:\Masaüstü\a b.pdf")])
        );
        assert_eq!(
            paths_to_enqueue(&args(&["catail.exe", "--enqueue", "a.pdf", "b.docx"])),
            Some(vec![PathBuf::from("a.pdf"), PathBuf::from("b.docx")])
        );
    }

    #[test]
    fn a_plain_launch_gives_nothing() {
        assert_eq!(paths_to_enqueue(&args(&["catail.exe"])), None);
        assert_eq!(paths_to_enqueue(&args(&["catail.exe", "--other"])), None);
    }

    #[test]
    fn the_command_quotes_paths_with_spaces() {
        let values = registry_values(r"C:\Program Files\Catail\catail.exe", "Kuyruğa ekle");
        assert_eq!(values[0], ("", "", "Kuyruğa ekle".to_owned()));
        assert_eq!(values[1].2, r#""C:\Program Files\Catail\catail.exe",0"#);
        assert_eq!(values[2], ("", "MultiSelectModel", "Player".to_owned()));
        assert_eq!(
            values[3],
            (
                "command",
                "",
                r#""C:\Program Files\Catail\catail.exe" --enqueue "%1""#.to_owned()
            )
        );
    }
}
