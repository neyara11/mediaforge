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
        "modalities": ["text", "audio"],
        "stream": true,
    });

    let raw = api_post_stream(&state, "/chat/completions", &body.to_string()).await?;

    let preview: String = raw.chars().take(500).collect();
    eprintln!("[Audio SSE] raw len: {}, preview:\n{}", raw.len(), preview);

    let mut lyrics_text = String::new();
    let mut sse_count = 0u32;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if let Some(data) = line.strip_prefix("data: ") {
            if data == "[DONE]" { break; }
            sse_count += 1;
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = parsed["choices"]
                    .as_array()
                    .and_then(|c| c.first())
                    .and_then(|c| c["delta"]["content"].as_str())
                {
                    lyrics_text.push_str(content);
                }
            }
        }
    }

    if sse_count == 0 {
        return Err("No SSE events received".to_string());
    }

    if lyrics_text.is_empty() {
        return Err(format!("Received {} SSE events but no text content. Check delta field format.", sse_count));
    }

    eprintln!("[Audio SSE] collected lyrics ({} chars):\n{}", lyrics_text.len(), &lyrics_text[..lyrics_text.len().min(500)]);

    Ok(lyrics_text)
}
