use tauri::State;
use serde_json::json;

use crate::api::client::{ApiState, api_post_binary, api_post};

#[tauri::command]
pub async fn text_to_speech(
    state: State<'_, ApiState>,
    text: String,
    model: String,
    voice: Option<String>,
    format: Option<String>,
    speed: Option<f64>,
) -> Result<Vec<u8>, String> {
    let mut body = json!({
        "model": model,
        "input": text,
        "response_format": format.unwrap_or_else(|| "mp3".to_string()),
        "speed": speed.unwrap_or(1.0),
    });
    if let Some(ref v) = voice {
        if !v.is_empty() {
            body["voice"] = json!(v);
        }
    }
    api_post_binary(&state, "/audio/speech", &body.to_string()).await
}

#[tauri::command]
pub async fn speech_to_text(
    state: State<'_, ApiState>,
    file_path: String,
    model: String,
    language: Option<String>,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "file": file_path,
        "language": language,
        "response_format": "verbose_json",
    });
    api_post(&state, "/audio/transcriptions", &body.to_string()).await
}
