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
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "prompt": prompt,
        "n": n.unwrap_or(1),
        "size": size.unwrap_or_else(|| "1024x1024".to_string()),
        "quality": quality.unwrap_or_else(|| "standard".to_string()),
        "response_format": "b64_json"
    });
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
