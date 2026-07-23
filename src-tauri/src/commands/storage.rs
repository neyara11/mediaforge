use tauri::Manager;
use tauri::AppHandle;

use crate::api::client::ApiState;

#[tauri::command]
pub async fn save_base64_file(
    _app: AppHandle,
    _state: tauri::State<'_, ApiState>,
    base64_data: String,
    file_path: String,
) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    std::fs::write(&file_path, &bytes).map_err(|e| format!("Write error: {}", e))?;
    Ok(file_path)
}

#[tauri::command]
pub async fn save_media(
    app: AppHandle,
    _state: tauri::State<'_, ApiState>,
    data: String,
    media_type: String,
) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let subdir = match media_type.as_str() {
        "image" => "media/images",
        "audio" => "media/audio/mp3",
        "video" => "media/video/mp4",
        _ => "media",
    };
    let dir = app_dir.join(subdir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), extension_for_type(&media_type));
    let path = dir.join(&filename);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn load_media(
    _app: AppHandle,
    _state: tauri::State<'_, ApiState>,
    path: String,
) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_generations(
    _app: AppHandle,
    _state: tauri::State<'_, ApiState>,
) -> Result<String, String> {
    Ok("[]".to_string())
}

fn extension_for_type(media_type: &str) -> &str {
    match media_type {
        "image" => "png",
        "audio" => "mp3",
        "video" => "mp4",
        _ => "bin",
    }
}
