use tauri::State;
use serde_json::json;

use crate::api::client::{ApiState, api_post};

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
    let mut body = json!({
        "model": model,
        "prompt": prompt,
        "response_format": "b64_json"
    });

    // Flux models: no quality param, n must be 1
    let is_flux = model.to_lowercase().contains("flux");
    let is_dalle = model.to_lowercase().contains("dall-e") || model.to_lowercase().contains("gpt-image");

    body["n"] = if is_flux { json!(1) } else { json!(n.unwrap_or(1)) };

    if !is_flux {
        body["quality"] = json!(quality.as_deref().unwrap_or(if is_dalle { "standard" } else { "auto" }));
    }

    if let Some(ref s) = size {
        if !s.is_empty() && s != "1024x1024" || is_flux {
            body["size"] = json!(s);
        }
    } else if !is_flux {
        body["size"] = json!("1024x1024");
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
