//! Saves the queue as a ZIP (numbered PNG/TXT files) or a PDF (one page per item).

use std::collections::HashMap;
use std::io::Write;
use std::path::Path;

use anyhow::{anyhow, Context, Result};
use image::codecs::jpeg::JpegEncoder;
use image::{ImageEncoder, RgbImage, RgbaImage};
use uuid::Uuid;

use crate::queue::item::{QueueItem, QueueItemKind};

const JPEG_QUALITY: u8 = 90;
/// Pages are sized from pixels at 96 DPI (1 px = 0.75 pt).
const POINTS_PER_PIXEL: f64 = 0.75;

/// `001.png`, `002.txt`, … in queue order.
pub fn write_zip(items: &[QueueItem], path: &Path) -> Result<()> {
    let file =
        std::fs::File::create(path).with_context(|| format!("cannot create {}", path.display()))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for (i, item) in items.iter().enumerate() {
        let n = i + 1;
        match item.kind {
            QueueItemKind::Image => {
                let source = item
                    .image_path
                    .as_ref()
                    .ok_or_else(|| anyhow!("image without file"))?;
                let bytes = std::fs::read(source)
                    .with_context(|| format!("cannot read {}", source.display()))?;
                // PNGs are already compressed.
                zip.start_file(
                    format!("{n:03}.png"),
                    options.compression_method(zip::CompressionMethod::Stored),
                )?;
                zip.write_all(&bytes)?;
            }
            QueueItemKind::Text => {
                zip.start_file(format!("{n:03}.txt"), options)?;
                zip.write_all(item.text.as_deref().unwrap_or_default().as_bytes())?;
            }
        }
    }
    zip.finish()?;
    Ok(())
}

/// One page per item. Text items are rendered to images by the panel (it has the fonts) and
/// passed in `text_pages`, keyed by item id.
pub fn write_pdf(
    items: &[QueueItem],
    text_pages: &HashMap<Uuid, RgbaImage>,
    path: &Path,
) -> Result<()> {
    let mut pages = Vec::with_capacity(items.len());
    for item in items {
        let img = match item.kind {
            QueueItemKind::Image => {
                let source = item
                    .image_path
                    .as_ref()
                    .ok_or_else(|| anyhow!("image without file"))?;
                image::open(source)
                    .with_context(|| format!("cannot read {}", source.display()))?
                    .to_rgba8()
            }
            QueueItemKind::Text => match text_pages.get(&item.id) {
                Some(page) => page.clone(),
                None => continue,
            },
        };
        pages.push(PdfPage::from_image(&img)?);
    }
    std::fs::write(path, build_pdf(&pages))
        .with_context(|| format!("cannot write {}", path.display()))
}

pub struct PdfPage {
    width: u32,
    height: u32,
    jpeg: Vec<u8>,
}

impl PdfPage {
    /// JPEG on a white background (PDF pages have no alpha here).
    pub fn from_image(img: &RgbaImage) -> Result<Self> {
        let rgb = flatten_on_white(img);
        let mut jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY)
            .write_image(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                image::ExtendedColorType::Rgb8,
            )
            .context("JPEG encoding failed")?;
        Ok(Self {
            width: rgb.width(),
            height: rgb.height(),
            jpeg,
        })
    }
}

fn flatten_on_white(img: &RgbaImage) -> RgbImage {
    RgbImage::from_fn(img.width(), img.height(), |x, y| {
        let [r, g, b, a] = img.get_pixel(x, y).0;
        let blend =
            |c: u8| ((u16::from(c) * u16::from(a) + 255 * (255 - u16::from(a))) / 255) as u8;
        image::Rgb([blend(r), blend(g), blend(b)])
    })
}

/// A minimal PDF 1.4: each page shows one JPEG (DCTDecode) filling the page.
pub fn build_pdf(pages: &[PdfPage]) -> Vec<u8> {
    let mut out: Vec<u8> = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offsets: Vec<usize> = Vec::new();
    // Objects: 1 catalog, 2 page tree, then per page: page, contents, image.
    let page_ids: Vec<usize> = (0..pages.len()).map(|i| 3 + i * 3).collect();

    let mut object = |out: &mut Vec<u8>, id: usize, body: &[u8]| {
        debug_assert_eq!(offsets.len() + 1, id);
        offsets.push(out.len());
        out.extend_from_slice(format!("{id} 0 obj\n").as_bytes());
        out.extend_from_slice(body);
        out.extend_from_slice(b"\nendobj\n");
    };

    object(&mut out, 1, b"<< /Type /Catalog /Pages 2 0 R >>");
    let kids: Vec<String> = page_ids.iter().map(|id| format!("{id} 0 R")).collect();
    object(
        &mut out,
        2,
        format!(
            "<< /Type /Pages /Kids [{}] /Count {} >>",
            kids.join(" "),
            pages.len()
        )
        .as_bytes(),
    );

    for (page, &id) in pages.iter().zip(&page_ids) {
        let (w, h) = (
            f64::from(page.width) * POINTS_PER_PIXEL,
            f64::from(page.height) * POINTS_PER_PIXEL,
        );
        object(
            &mut out,
            id,
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w:.2} {h:.2}] \
                 /Resources << /XObject << /Im0 {} 0 R >> >> /Contents {} 0 R >>",
                id + 2,
                id + 1
            )
            .as_bytes(),
        );
        let content = format!("q {w:.2} 0 0 {h:.2} 0 0 cm /Im0 Do Q");
        object(
            &mut out,
            id + 1,
            format!(
                "<< /Length {} >>\nstream\n{content}\nendstream",
                content.len()
            )
            .as_bytes(),
        );
        let mut image = format!(
            "<< /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /DeviceRGB \
             /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
            page.width,
            page.height,
            page.jpeg.len()
        )
        .into_bytes();
        image.extend_from_slice(&page.jpeg);
        image.extend_from_slice(b"\nendstream");
        object(&mut out, id + 2, &image);
    }

    let xref_at = out.len();
    out.extend_from_slice(
        format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len() + 1).as_bytes(),
    );
    for offset in &offsets {
        out.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n",
            offsets.len() + 1
        )
        .as_bytes(),
    );
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;
    use std::io::Read;

    fn text_of(pdf: &[u8]) -> String {
        String::from_utf8_lossy(pdf).into_owned()
    }

    #[test]
    fn pdf_has_one_page_per_image_and_valid_xref() {
        let pages = vec![
            PdfPage::from_image(&RgbaImage::from_pixel(40, 20, Rgba([255, 0, 0, 255]))).unwrap(),
            PdfPage::from_image(&RgbaImage::from_pixel(10, 30, Rgba([0, 0, 255, 128]))).unwrap(),
        ];
        let pdf = build_pdf(&pages);
        let text = text_of(&pdf);
        assert!(text.starts_with("%PDF-1.4"));
        assert!(text.contains("/Count 2"));
        assert!(text.contains("/MediaBox [0 0 30.00 15.00]"));
        assert!(text.trim_end().ends_with("%%EOF"));

        // Every xref offset must point at its object header.
        let xref = text.rfind("xref\n").unwrap();
        let entries: Vec<&str> = text[xref..].lines().skip(3).take(8).collect();
        for (i, entry) in entries.iter().enumerate() {
            let offset: usize = entry[..10].parse().unwrap();
            assert!(pdf[offset..].starts_with(format!("{} 0 obj", i + 1).as_bytes()));
        }
    }

    #[test]
    fn transparency_is_flattened_on_white() {
        let img = RgbaImage::from_pixel(1, 1, Rgba([0, 0, 0, 0]));
        assert_eq!(flatten_on_white(&img).get_pixel(0, 0).0, [255, 255, 255]);
    }

    #[test]
    fn zip_numbers_items_in_order() {
        let dir = std::env::temp_dir().join(format!("catail-export-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let png = dir.join("a.png");
        RgbaImage::new(2, 2).save(&png).unwrap();
        let items = vec![
            QueueItem::text("merhaba".into(), None),
            QueueItem::image(png),
        ];
        let zip_path = dir.join("out.zip");
        write_zip(&items, &zip_path).unwrap();

        let mut archive = zip::ZipArchive::new(std::fs::File::open(&zip_path).unwrap()).unwrap();
        assert_eq!(archive.by_index(0).unwrap().name().unwrap(), "001.txt");
        assert_eq!(archive.by_index(1).unwrap().name().unwrap(), "002.png");
        let mut text = String::new();
        archive
            .by_index(0)
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        assert_eq!(text, "merhaba");
        drop(archive);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
