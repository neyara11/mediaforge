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
    use base64::Engine as _;
    let audio_bytes = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;
    let audio_b64 = base64::engine::general_purpose::STANDARD.encode(&audio_bytes);
    let audio_format = detect_audio_format(&file_path);

    let mut body = json!({
        "model": model,
        "input_audio": {
            "data": audio_b64,
            "format": audio_format,
        },
        "response_format": "verbose_json",
    });
    if let Some(ref lang) = language {
        if !lang.is_empty() {
            body["language"] = json!(lang);
        }
    }
    api_post(&state, "/audio/transcriptions", &body.to_string()).await
}

fn detect_audio_format(path: &str) -> &str {
    let lower = path.to_lowercase();
    if lower.ends_with(".mp3") { "mp3" }
    else if lower.ends_with(".wav") { "wav" }
    else if lower.ends_with(".flac") { "flac" }
    else if lower.ends_with(".m4a") { "m4a" }
    else if lower.ends_with(".ogg") || lower.ends_with(".oga") { "ogg" }
    else if lower.ends_with(".webm") { "webm" }
    else if lower.ends_with(".aac") { "aac" }
    else { "mp3" }  // default fallback
}
