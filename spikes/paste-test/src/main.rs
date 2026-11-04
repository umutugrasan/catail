//! Phase 0 spike: paste a list of images into whatever window has focus,
//! either all at once as a file list (batch / CF_HDROP) or one by one (sequential).
//!
//! Usage:
//!   paste-test --mode batch --files a.png b.png c.png
//!   paste-test --mode sequential --files a.png b.png --delay-ms 400
//!   paste-test --generate-samples samples --count 5

mod formats;
mod samples;

#[cfg(windows)]
mod win;

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use clap::{Parser, ValueEnum};

#[derive(Copy, Clone, Debug, PartialEq, Eq, ValueEnum)]
enum Mode {
    /// Put all files on the clipboard as a CF_HDROP list and send a single Ctrl+V.
    Batch,
    /// Put each image on the clipboard in turn and send Ctrl+V for each.
    Sequential,
}

#[derive(Parser, Debug)]
#[command(name = "paste-test", about = "Catail Phase 0 paste spike")]
struct Cli {
    /// Paste method to test.
    #[arg(long, value_enum, required_unless_present = "generate_samples")]
    mode: Option<Mode>,

    /// Image files to paste, in order.
    #[arg(long, num_args = 1.., required_unless_present = "generate_samples")]
    files: Vec<PathBuf>,

    /// Seconds to wait before pasting, so the target window can be focused.
    #[arg(long, default_value_t = 3)]
    countdown: u64,

    /// Sequential mode: wait after each Ctrl+V.
    #[arg(long, default_value_t = 250)]
    delay_ms: u64,

    /// Batch mode: wait after Ctrl+V before restoring the previous clipboard.
    #[arg(long, default_value_t = 800)]
    restore_delay_ms: u64,

    /// Write numbered sample PNGs (001.png, 002.png, ...) into this folder and exit.
    #[arg(long, value_name = "DIR")]
    generate_samples: Option<PathBuf>,

    /// Number of sample images to generate.
    #[arg(long, default_value_t = 5)]
    count: u32,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    if let Some(dir) = &cli.generate_samples {
        let written = samples::write_samples(dir, cli.count)?;
        for path in &written {
            println!("{}", path.display());
        }
        return Ok(());
    }

    let mode = cli.mode.expect("clap enforces --mode");
    let files = resolve_files(&cli.files)?;

    countdown(cli.countdown);
    run(mode, &files, &cli)
}

fn resolve_files(files: &[PathBuf]) -> Result<Vec<PathBuf>> {
    files
        .iter()
        .map(|f| {
            if !f.is_file() {
                bail!("file not found: {}", f.display());
            }
            // `absolute` avoids the `\\?\` prefix that `canonicalize` adds, which some apps reject.
            std::path::absolute(f).with_context(|| format!("cannot resolve {}", f.display()))
        })
        .collect()
}

fn countdown(seconds: u64) {
    for remaining in (1..=seconds).rev() {
        println!("Pasting in {remaining}... focus the target window");
        std::thread::sleep(Duration::from_secs(1));
    }
}

#[cfg(windows)]
fn run(mode: Mode, files: &[PathBuf], cli: &Cli) -> Result<()> {
    let outcome = match mode {
        Mode::Batch => win::paste_batch(files, Duration::from_millis(cli.restore_delay_ms))?,
        Mode::Sequential => win::paste_sequential(files, Duration::from_millis(cli.delay_ms))?,
    };
    match outcome {
        win::Outcome::Done(n) => println!("Pasted {n} item(s); previous clipboard restored."),
        win::Outcome::Cancelled(n) => {
            println!("Cancelled with Esc after {n} item(s); previous clipboard restored.")
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn run(_mode: Mode, _files: &[PathBuf], _cli: &Cli) -> Result<()> {
    bail!("paste-test currently supports Windows only")
}
