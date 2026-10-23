use tauri::State;
use serde_json::json;

use crate::api::client::{ApiState, api_post};

/// FLUX 3 models take a resolution tier (768, 1K, 1.5K, 2K, 4K) plus
/// `aspect_ratio` instead of pixel dimensions like "1024x1024".
fn is_flux3(model: &str) -> bool {
    let m = model.to_lowercase();
    m.contains("flux-3-image") || m.contains("flux.3-image")
}

const FLUX3_TIERS: [&str; 5] = ["768", "1K", "1.5K", "2K", "4K"];

/// Normalizes any size value to a FLUX 3 resolution tier.
fn flux3_tier(size: &str) -> &'static str {
    let s = size.trim().to_lowercase();
    match s.as_str() {
        "768" => "768",
        "1k" => "1K",
        "1.5k" => "1.5K",
        "2k" => "2K",
        "4k" => "4K",
        _ => {
            let max_side = s
                .split('x')
                .filter_map(|p| p.trim().parse::<u32>().ok())
                .max()
                .unwrap_or(1024);
            if max_side <= 768 {
                FLUX3_TIERS[0]
            } else if max_side <= 1024 {
                FLUX3_TIERS[1]
            } else if max_side <= 1536 {
                FLUX3_TIERS[2]
            } else if max_side <= 2048 {
                FLUX3_TIERS[3]
            } else {
                FLUX3_TIERS[4]
            }
        }
    }
}

const FLUX3_RATIOS: [(&str, f64); 16] = [
    ("21:9", 2.3333),
    ("2:1", 2.0),
    ("16:9", 1.7778),
    ("3:2", 1.5),
    ("7:5", 1.4),
    ("4:3", 1.3333),
    ("5:4", 1.25),
    ("1:1", 1.0),
    ("4:5", 0.8),
    ("3:4", 0.75),
    ("5:7", 0.7143),
    ("2:3", 0.6667),
    ("9:16", 0.5625),
    ("1:2", 0.5),
    ("9:21", 0.4286),
    ("auto", 1.0),
];

/// Picks the closest supported FLUX 3 aspect ratio for a "WxH" size.
fn flux3_aspect_ratio(size: &str) -> &'static str {
    let parts: Vec<f64> = size
        .to_lowercase()
        .split('x')
        .filter_map(|p| p.trim().parse::<f64>().ok())
        .collect();
    if parts.len() != 2 || parts[0] <= 0.0 || parts[1] <= 0.0 {
        return "1:1";
    }
    let target = parts[0] / parts[1];
    FLUX3_RATIOS
        .iter()
        .filter(|(name, _)| *name != "auto")
        .min_by(|a, b| {
            (a.1 - target)
                .abs()
                .partial_cmp(&(b.1 - target).abs())
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(name, _)| *name)
        .unwrap_or("1:1")
}

/// Returns (supports_quality, max_n, default_size)
fn model_caps(model: &str) -> (bool, u32, &str) {
    let m = model.to_lowercase();
    if m.contains("dall-e") || m.contains("gpt-image") {
        (true, 4, "1024x1024")
    } else if m.contains("seed") || m.contains("seedream") {
        (false, 1, "1920x1920")  // min 3686400 px
    } else if is_flux3(&m) {
        (false, 1, "1K")
    } else if m.contains("flux") || m.contains("gemini") || m.contains("imagen") {
        (false, 1, "1024x1024")
    } else {
        // Safe defaults for unknown models
        (false, 1, "1024x1024")
    }
}

#[tauri::command]
pub async fn generate_image(
    state: State<'_, ApiState>,
    prompt: String,
    model: String,
    n: Option<u32>,
    size: Option<String>,
    quality: Option<String>,
    aspect_ratio: Option<String>,
    input_references: Option<Vec<serde_json::Value>>,
) -> Result<String, String> {
    let (supports_quality, max_n, default_size) = model_caps(&model);

    let mut body = json!({
        "model": model,
        "prompt": prompt,
        "response_format": "b64_json"
    });

    // n: clamp to model's max
    let n_val = n.unwrap_or(1).min(max_n);
    body["n"] = json!(n_val);

    // size: use provided or model-appropriate default
    let size_str = size.as_deref().unwrap_or("").to_string();
    if is_flux3(&model) {
        body["size"] = json!(flux3_tier(&size_str));
        let ratio = match aspect_ratio {
            Some(r) if !r.trim().is_empty() => r,
            _ => flux3_aspect_ratio(&size_str).to_string(),
        };
        body["aspect_ratio"] = json!(ratio);
    } else if !size_str.is_empty() {
        body["size"] = json!(size_str);
    } else {
        body["size"] = json!(default_size);
    }

    // quality: only if model supports it
    if supports_quality {
        body["quality"] = json!(quality.as_deref().unwrap_or("standard"));
    }

    if let Some(refs) = input_references {
        if !refs.is_empty() {
            body["input_references"] = serde_json::Value::Array(refs);
        }
    }

    api_post(&state, "/images", &body.to_string()).await
}

#[tauri::command]
pub async fn edit_image(
    state: State<'_, ApiState>,
    image_id: String,
    prompt: String,
    model: String,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "prompt": prompt,
        "input_references": [image_id],
        "response_format": "b64_json"
    });
    api_post(&state, "/images", &body.to_string()).await
}
