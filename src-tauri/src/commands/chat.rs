use tauri::State;
use serde_json::json;

use crate::api::client::{ApiState, api_post};

#[tauri::command]
pub async fn chat_completion(
    state: State<'_, ApiState>,
    messages: String,
    model: String,
    modalities: Option<Vec<String>>,
) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(&messages)
        .map_err(|e| format!("Invalid messages JSON: {}", e))?;

    let body = json!({
        "model": model,
        "messages": parsed,
        "modalities": modalities.unwrap_or_else(|| vec!["text".to_string()]),
    });
    api_post(&state, "/chat/completions", &body.to_string()).await
}
