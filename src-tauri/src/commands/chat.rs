use tauri::State;
use tauri::Manager;
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
    app: tauri::AppHandle,
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

    let mut pcm_buffer: Vec<i16> = Vec::new();
    let sample_rate = 24000u32;

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line == "data: [DONE]" {
            continue;
        }
        if let Some(data) = line.strip_prefix("data: ") {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(choices) = parsed["choices"].as_array() {
                    for choice in choices {
                        if let Some(audio_b64) = choice["delta"]["audio"].as_str() {
                            if let Ok(bytes) = base64_decode(audio_b64) {
                                for chunk in bytes.chunks_exact(2) {
                                    if chunk.len() == 2 {
                                        let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                                        pcm_buffer.push(sample);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if pcm_buffer.is_empty() {
        return Err("No audio data received from API".to_string());
    }

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let audio_dir = app_dir.join("media").join("audio").join("mp3");
    std::fs::create_dir_all(&audio_dir).map_err(|e| e.to_string())?;

    let filename = format!("{}.wav", uuid::Uuid::new_v4());
    let wav_path = audio_dir.join(&filename);

    write_wav(&wav_path, &pcm_buffer, sample_rate)?;

    Ok(wav_path.to_string_lossy().to_string())
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(input)
        .map_err(|e| format!("Base64 decode error: {}", e))
}

fn write_wav(path: &std::path::Path, samples: &[i16], sample_rate: u32) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::File::create(path).map_err(|e| e.to_string())?;

    let data_size = (samples.len() * 2) as u32;
    let file_size = 36 + data_size;

    file.write_all(b"RIFF").map_err(|e| e.to_string())?;
    file.write_all(&file_size.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(b"WAVE").map_err(|e| e.to_string())?;
    file.write_all(b"fmt ").map_err(|e| e.to_string())?;
    file.write_all(&16u32.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(&1u16.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(&1u16.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(&sample_rate.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(&(sample_rate * 2).to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(&2u16.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(&16u16.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(b"data").map_err(|e| e.to_string())?;
    file.write_all(&data_size.to_le_bytes()).map_err(|e| e.to_string())?;

    for &sample in samples {
        file.write_all(&sample.to_le_bytes()).map_err(|e| e.to_string())?;
    }

    Ok(())
}
