use tauri::State;
use serde_json::json;

use crate::api::client::{ApiState, api_post};

/// Returns (supports_quality, max_n, default_size)
fn model_caps(model: &str) -> (bool, u32, &str) {
    let m = model.to_lowercase();
    if m.contains("dall-e") || m.contains("gpt-image") {
        (true, 4, "1024x1024")
    } else if m.contains("seed") || m.contains("seedream") {
        (false, 1, "1920x1920")  // min 3686400 px
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
    if !size_str.is_empty() {
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
