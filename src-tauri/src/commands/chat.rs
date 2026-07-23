use tauri::State;
use serde_json::json;

use crate::api::client::{ApiState, api_post_stream, api_post};

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

#[tauri::command]
pub async fn chat_audio_generate(
    state: State<'_, ApiState>,
    prompt: String,
    model: String,
) -> Result<String, String> {
    let messages = json!([
        {"role": "user", "content": prompt}
    ]);

    let body = json!({
        "model": model,
        "messages": messages,
        "audio": {"format": "mp3"},
        "stream": true,
    });

    let raw = api_post_stream(&state, "/chat/completions", &body.to_string()).await?;

    let preview: String = raw.chars().take(500).collect();
    eprintln!("[Audio SSE] raw len: {}, preview:\n{}", raw.len(), preview);

    let mut lyrics_text = String::new();
    let mut audio_base64 = String::new();
    let mut cost: Option<f64> = None;
    let mut sse_count = 0u32;
    let mut audio_chunks = 0u32;
    let mut text_chunks = 0u32;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if let Some(data) = line.strip_prefix("data: ") {
            if data == "[DONE]" { break; }
            sse_count += 1;
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(choices) = parsed["choices"].as_array() {
                    if let Some(first) = choices.first() {
                        if let Some(content) = first["delta"]["content"].as_str() {
                            lyrics_text.push_str(content);
                            text_chunks += 1;
                        }
                        if let Some(audio_data) = first["delta"]["audio"]["data"].as_str() {
                            audio_base64.push_str(audio_data);
                            audio_chunks += 1;
                        }
                    }
                }
                if cost.is_none() {
                    if let Some(c) = parsed["usage"]["cost"].as_f64() {
                        cost = Some(c);
                    }
                }
            }
        }
    }

    eprintln!(
        "[Audio SSE] sse_events={}, text_chunks={}, audio_chunks={}, lyrics_len={}, audio_b64_len={}",
        sse_count, text_chunks, audio_chunks, lyrics_text.len(), audio_base64.len()
    );

    if sse_count == 0 {
        return Err("No SSE events received".to_string());
    }

    if audio_base64.is_empty() {
        // Fallback: model returned text only (no audio parameter supported?)
        // Return text as lyrics without audio
        eprintln!("[Audio SSE] WARNING: No audio data in response. Check 'audio' parameter support for this model.");
        if lyrics_text.is_empty() {
            return Err(format!(
                "No content received in {} SSE events. Model may not support audio generation.",
                sse_count
            ));
        }
    }

    if !lyrics_text.is_empty() {
        let preview_len = lyrics_text.chars().take(500).collect::<String>();
        eprintln!("[Audio SSE] lyrics preview:\n{}", preview_len);
    }

    let result = json!({
        "lyrics": lyrics_text,
        "audio_base64": audio_base64,
        "audio_format": "mp3",
        "cost": cost,
    });

    Ok(result.to_string())
}
