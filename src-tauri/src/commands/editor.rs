use std::fs;
use std::io::Cursor;

use base64::Engine as _;
use image::{DynamicImage, ImageFormat, RgbaImage};
use serde_json::json;
use tauri::State;

use crate::api::client::{api_post, ApiState};

fn encode_png(img: &DynamicImage) -> Result<String, String> {
    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}

fn decode_b64(b64: &str) -> Result<DynamicImage, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    image::load_from_memory(&bytes).map_err(|e| e.to_string())
}

fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let delta = max - min;

    let h = if delta == 0.0 {
        0.0
    } else if max == rf {
        60.0 * (((gf - bf) / delta) % 6.0)
    } else if max == gf {
        60.0 * (((bf - rf) / delta) + 2.0)
    } else {
        60.0 * (((rf - gf) / delta) + 4.0)
    };
    let h = if h < 0.0 { h + 360.0 } else { h };

    let s = if max == 0.0 { 0.0 } else { delta / max };
    let v = max;

    (h, s, v)
}

fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (u8, u8, u8) {
    let c = v * s;
    let hp = h / 60.0;
    let x = c * (1.0 - ((hp % 2.0) - 1.0).abs());
    let m = v - c;

    let (r, g, b) = if hp < 1.0 {
        (c, x, 0.0)
    } else if hp < 2.0 {
        (x, c, 0.0)
    } else if hp < 3.0 {
        (0.0, c, x)
    } else if hp < 4.0 {
        (0.0, x, c)
    } else if hp < 5.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };

    (
        ((r + m) * 255.0).round() as u8,
        ((g + m) * 255.0).round() as u8,
        ((b + m) * 255.0).round() as u8,
    )
}

#[tauri::command]
pub async fn load_image_from_path(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    match image::ImageReader::open(&path) {
        Ok(reader) => match reader.with_guessed_format().map_err(|e| e.to_string())?.decode() {
            Ok(img) => encode_png(&img),
            Err(_) => Ok(base64::engine::general_purpose::STANDARD.encode(&bytes)),
        },
        Err(_) => Ok(base64::engine::general_purpose::STANDARD.encode(&bytes)),
    }
}

#[tauri::command]
pub async fn apply_native_filter(
    b64: String,
    filter_type: String,
    value: f32,
) -> Result<String, String> {
    let mut img = decode_b64(&b64)?;

    match filter_type.as_str() {
        "brightness" => {
            img = img.brighten(value as i32);
        }
        "contrast" => {
            img = img.adjust_contrast(value);
        }
        "blur" => {
            img = DynamicImage::ImageRgba8(image::imageops::blur(&img, value));
        }
        "sharpen" => {
            img = DynamicImage::ImageRgba8(image::imageops::unsharpen(&img, value, 0));
        }
        "saturation" => {
            let mut rgba: RgbaImage = img.to_rgba8();
            for pixel in rgba.pixels_mut() {
                let (h, s, v) = rgb_to_hsv(pixel[0], pixel[1], pixel[2]);
                let new_s = (s * value).clamp(0.0, 1.0);
                let (r, g, b) = hsv_to_rgb(h, new_s, v);
                pixel[0] = r;
                pixel[1] = g;
                pixel[2] = b;
            }
            img = DynamicImage::ImageRgba8(rgba);
        }
        _ => return Err(format!("Unknown filter type: {}", filter_type)),
    }

    encode_png(&img)
}

#[tauri::command]
pub async fn inpaint_image(
    state: State<'_, ApiState>,
    image_b64: String,
    mask_b64: String,
    prompt: String,
    model: String,
) -> Result<String, String> {
    let mut refs: Vec<serde_json::Value> = vec![
        json!({"type": "image_url", "image_url": {"url": format!("data:image/png;base64,{}", image_b64)}}),
    ];
    if !mask_b64.is_empty() {
        refs.push(json!({"type": "image_url", "image_url": {"url": format!("data:image/png;base64,{}", mask_b64)}}));
    }
    let body = json!({
        "model": model,
        "prompt": prompt,
        "input_references": refs,
        "response_format": "b64_json"
    });
    let body_str = body.to_string();
    eprintln!("[inpaint_image] POST /images refs={} body: {}", refs.len(), &body_str[..body_str.len().min(200)]);
    let result = api_post(&state, "/images", &body_str).await;
    match &result {
        Ok(text) => eprintln!("[inpaint_image] response (first 200 chars): {}", &text[..text.len().min(200)]),
        Err(e) => eprintln!("[inpaint_image] error: {}", e),
    }
    result
}

#[tauri::command]
pub async fn generative_expand(
    state: State<'_, ApiState>,
    image_b64: String,
    direction: String,
    expand_px: u32,
    prompt: String,
    model: String,
) -> Result<String, String> {
    let expand_prompt = format!("{} Expand canvas {} by {} pixels", prompt, direction, expand_px);
    let body = json!({
        "model": model,
        "prompt": expand_prompt,
        "input_references": [
            {"type": "image_url", "image_url": {"url": format!("data:image/png;base64,{}", image_b64)}}
        ],
        "response_format": "b64_json"
    });
    api_post(&state, "/images", &body.to_string()).await
}

#[tauri::command]
pub async fn style_transfer(
    state: State<'_, ApiState>,
    image_b64: String,
    style_ref_b64: String,
    model: String,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "prompt": "Apply this style to the image",
        "input_references": [
            {"type": "image_url", "image_url": {"url": format!("data:image/png;base64,{}", image_b64)}},
            {"type": "image_url", "image_url": {"url": format!("data:image/png;base64,{}", style_ref_b64)}}
        ],
        "response_format": "b64_json"
    });
    api_post(&state, "/images", &body.to_string()).await
}

#[tauri::command]
pub async fn enhance_image(
    state: State<'_, ApiState>,
    image_b64: String,
    scale: u32,
    model: String,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "prompt": format!("Upscale this image by {}x, enhance quality, remove noise", scale),
        "input_references": [
            {"type": "image_url", "image_url": {"url": format!("data:image/png;base64,{}", image_b64)}}
        ],
        "response_format": "b64_json"
    });
    api_post(&state, "/images", &body.to_string()).await
}

#[tauri::command]
pub async fn edit_region(
    state: State<'_, ApiState>,
    image_b64: String,
    prompt: String,
    model: String,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "prompt": prompt,
        "input_references": [
            {"type": "image_url", "image_url": {"url": format!("data:image/png;base64,{}", image_b64)}}
        ],
        "response_format": "b64_json"
    });
    eprintln!("[edit_region] POST /images body: {}", &body.to_string()[..body.to_string().len().min(200)]);
    let result = api_post(&state, "/images", &body.to_string()).await;
    match &result {
        Ok(text) => eprintln!("[edit_region] response (first 200 chars): {}", &text[..text.len().min(200)]),
        Err(e) => eprintln!("[edit_region] error: {}", e),
    }
    result
}

#[tauri::command]
pub async fn save_editor_project(json_data: String, file_path: String) -> Result<(), String> {
    fs::write(&file_path, &json_data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_editor_project(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_canvas_image(
    b64: String,
    format: String,
    quality: u8,
    file_path: String,
) -> Result<(), String> {
    let img = decode_b64(&b64)?;

    match format.as_str() {
        "png" => {
            let mut file = fs::File::create(&file_path).map_err(|e| e.to_string())?;
            img.write_to(&mut file, ImageFormat::Png)
                .map_err(|e| e.to_string())?;
        }
        "jpeg" => {
            let mut buf = Cursor::new(Vec::new());
            let encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
            img.write_with_encoder(encoder)
                .map_err(|e| e.to_string())?;
            fs::write(&file_path, buf.into_inner()).map_err(|e| e.to_string())?;
        }
        "webp" => {
            let mut file = fs::File::create(&file_path).map_err(|e| e.to_string())?;
            img.write_to(&mut file, ImageFormat::WebP)
                .map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unsupported export format: {}", format)),
    }

    Ok(())
}
