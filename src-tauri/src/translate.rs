//! Translation of recognized text through Google Translate's free web endpoint, as the user
//! chose. Text leaves the computer only when "Çevir" is pressed. The endpoint is unofficial and
//! may change; errors are shown to the user rather than hidden.

use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use serde_json::Value;

const ENDPOINT: &str = "https://translate.googleapis.com/translate_a/single";
/// Requests carry the text in the URL; stay well under URL length limits.
const CHUNK_CHARS: usize = 1800;
const TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Translation {
    pub text: String,
    /// Detected source language, e.g. "en".
    pub source: String,
    pub target: String,
}

/// Translates into Turkish, or into English when the text is already Turkish.
pub async fn translate(text: &str) -> Result<Translation> {
    let first = translate_to(text, "tr").await?;
    if first.source == "tr" {
        return translate_to(text, "en").await;
    }
    Ok(first)
}

async fn translate_to(text: &str, target: &str) -> Result<Translation> {
    // The updater does the same: reqwest is built without a default TLS crypto provider.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .context("cannot create HTTP client")?;

    let mut parts = Vec::new();
    let mut source = String::new();
    for chunk in chunks(text, CHUNK_CHARS) {
        let body: Value = client
            .get(ENDPOINT)
            .query(&[
                ("client", "gtx"),
                ("sl", "auto"),
                ("tl", target),
                ("dt", "t"),
                ("q", chunk.as_str()),
            ])
            .send()
            .await
            .context("translation service unreachable")?
            .error_for_status()
            .context("translation service refused the request")?
            .json()
            .await
            .context("unexpected translation response")?;
        let (translated, detected) = parse(&body)?;
        parts.push(translated);
        if source.is_empty() {
            source = detected;
        }
    }
    Ok(Translation {
        text: parts.join("\n"),
        source,
        target: target.to_owned(),
    })
}

/// `[[["çeviri", "kaynak", …], …], null, "en", …]` → ("çeviri…", "en").
pub fn parse(body: &Value) -> Result<(String, String)> {
    let segments = body
        .get(0)
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow!("unexpected translation response"))?;
    let text: String = segments
        .iter()
        .filter_map(|s| s.get(0).and_then(Value::as_str))
        .collect();
    let source = body.get(2).and_then(Value::as_str).unwrap_or("").to_owned();
    Ok((text, source))
}

/// Splits on line breaks into pieces of at most `max` characters (a single longer line is
/// split by characters).
pub fn chunks(text: &str, max: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();
    for line in text.lines() {
        let mut line: Vec<char> = line.chars().collect();
        while line.len() > max {
            let rest = line.split_off(max);
            if !current.is_empty() {
                out.push(std::mem::take(&mut current));
            }
            out.push(line.into_iter().collect());
            line = rest;
        }
        let line: String = line.into_iter().collect();
        let needed =
            current.chars().count() + line.chars().count() + usize::from(!current.is_empty());
        if needed > max && !current.is_empty() {
            out.push(std::mem::take(&mut current));
        }
        if !current.is_empty() {
            current.push('\n');
        }
        current.push_str(&line);
    }
    if !current.trim().is_empty() {
        out.push(current);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_segments_and_language() {
        let body = json!([
            [["Merhaba ", "Hello ", null], ["dünya", "world", null]],
            null,
            "en"
        ]);
        assert_eq!(parse(&body).unwrap(), ("Merhaba dünya".into(), "en".into()));
        assert!(parse(&json!({"error": 1})).is_err());
    }

    /// Manual smoke test against Google: `cargo test -- --ignored translates_online`.
    #[test]
    #[ignore]
    fn translates_online() {
        let result = tauri::async_runtime::block_on(translate("Hello world")).unwrap();
        println!("{result:?}");
        assert_eq!(result.target, "tr");
        assert!(!result.text.is_empty());
        let back = tauri::async_runtime::block_on(translate("Merhaba dünya")).unwrap();
        println!("{back:?}");
        assert_eq!(back.target, "en");
    }

    #[test]
    fn chunks_keep_lines_together_and_split_long_ones() {
        assert_eq!(chunks("a\nb\nc", 3), ["a\nb", "c"]);
        assert_eq!(chunks("abcdefg", 3), ["abc", "def", "g"]);
        assert_eq!(chunks("  \n ", 10), Vec::<String>::new());
        assert_eq!(chunks("çok güzel", 100), ["çok güzel"]);
    }
}
