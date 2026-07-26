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
    genre: Option<String>,
    tempo: Option<String>,
    style: Option<String>,
    has_lyrics: Option<bool>,
) -> Result<String, String> {
    let style = {
        let mut parts: Vec<String> = Vec::new();
        if let Some(s) = style.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            parts.push(s.to_string());
        }
        if let Some(g) = genre.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            parts.push(g.to_string());
        }
        if let Some(t) = tempo.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            parts.push(format!("{} BPM", t));
        }
        parts.join(", ")
    };
    let style_clause = if style.is_empty() {
        String::new()
    } else {
        format!(" Style: {}.", style)
    };

    let content = if has_lyrics.unwrap_or(false) {
        format!(
            "Perform EXACTLY the following song lyrics. Do not add, remove or reorder sections, do not write your own lyrics, do not extend the song beyond the given sections.{}\n\nLyrics:\n{}",
            style_clause, prompt
        )
    } else {
        format!(
            "Write and perform a song.{}\n\nTheme: {}",
            style_clause, prompt
        )
    };

    let messages = json!([
        {"role": "user", "content": content}
    ]);

    let body = json!({
        "model": model,
        "messages": messages,
        "audio": {"format": "mp3"},
        "stream": true,
    });

    let body_str = body.to_string();
    eprintln!("[Audio SSE] Request model={}, has_lyrics={:?}, prompt_len={}, body_len={}", model, has_lyrics, prompt.len(), body_str.len());
    let content_preview: String = content.chars().take(300).collect();
    eprintln!("[Audio SSE] Composed message preview (first 300 chars): {}", content_preview);

    let raw = api_post_stream(&state, "/chat/completions", &body_str).await?;

    let preview: String = raw.chars().take(500).collect();
    eprintln!("[Audio SSE] raw len: {}, preview:\n{}", raw.len(), preview);

    let mut lyrics_text = String::new();
    let mut audio_base64 = String::new();
    let mut cost: Option<f64> = None;
    let mut sse_count = 0u32;
    let mut audio_chunks = 0u32;
    let mut text_chunks = 0u32;
    let mut finish_reason = String::new();
    let mut native_finish_reason = String::new();

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if let Some(data) = line.strip_prefix("data: ") {
            if data == "[DONE]" { break; }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(err) = parsed["error"]["message"].as_str() {
                    let err_type = parsed["error"]["metadata"]["error_type"]
                        .as_str()
                        .unwrap_or("unknown");
                    return Err(format!("API error ({err_type}): {err}"));
                }
                if let Some(choices) = parsed["choices"].as_array() {
                    sse_count += 1;
                    if let Some(first) = choices.first() {
                        if let Some(content) = first["delta"]["content"].as_str() {
                            if !content.is_empty() {
                                lyrics_text.push_str(content);
                                text_chunks += 1;
                            }
                        }
                        if let Some(audio_data) = first["delta"]["audio"]["data"].as_str() {
                            audio_base64.push_str(audio_data);
                            audio_chunks += 1;
                        }
                        if let Some(fr) = first["finish_reason"].as_str() {
                            finish_reason = fr.to_string();
                        }
                        if let Some(nfr) = first["native_finish_reason"].as_str() {
                            native_finish_reason = nfr.to_string();
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
        eprintln!("[Audio SSE] WARNING: No audio data in response. finish_reason={}, native_finish_reason={}", finish_reason, native_finish_reason);
        if lyrics_text.is_empty() {
            let reason_detail = if !native_finish_reason.is_empty() {
                native_finish_reason.clone()
            } else if !finish_reason.is_empty() {
                finish_reason.clone()
            } else {
                "unknown".to_string()
            };
            return Err(format!("Audio generation rejected by provider (native: {}). This usually means:\n- Google AI Studio free tier quota exhausted or model temporarily unavailable\n- Prompt content was filtered by safety checks\n- Model does not support audio output through this provider\nTry again later, use a shorter/simpler prompt, or check RouterAI logs at https://routerai.ru/settings/logs", reason_detail));
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
