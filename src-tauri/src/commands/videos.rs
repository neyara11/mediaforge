use tauri::State;
use serde_json::json;

use crate::api::client::{ApiState, api_post, api_get};

#[tauri::command]
pub async fn create_video(
    state: State<'_, ApiState>,
    prompt: String,
    model: String,
    duration: Option<u32>,
    resolution: Option<String>,
) -> Result<String, String> {
    let body = json!({
        "model": model,
        "prompt": prompt,
        "duration": duration.unwrap_or(8),
        "resolution": resolution.unwrap_or_else(|| "1080p".to_string()),
    });
    api_post(&state, "/videos", &body.to_string()).await
}

#[tauri::command]
pub async fn poll_video(
    state: State<'_, ApiState>,
    video_id: String,
) -> Result<String, String> {
    api_get(&state, &format!("/videos/{}", video_id)).await
}

#[tauri::command]
pub async fn download_video(
    state: State<'_, ApiState>,
    video_id: String,
) -> Result<String, String> {
    api_get(&state, &format!("/videos/{}/content", video_id)).await
}
