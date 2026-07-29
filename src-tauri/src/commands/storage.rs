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

    // `data` is base64 (the convention used everywhere in this app) —
    // decode before writing, otherwise the saved file is corrupt text.
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn load_media(
    app: AppHandle,
    _state: tauri::State<'_, ApiState>,
    path: String,
) -> Result<String, String> {
    // Only files inside the app data dir may be read through this command.
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let requested = std::path::Path::new(&path);
    let canonical = requested
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical.starts_with(&app_dir) {
        return Err("Access outside the app data directory is not allowed".to_string());
    }
    let bytes = std::fs::read(&canonical).map_err(|e| e.to_string())?;
    use base64::Engine as _;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
pub async fn save_audio_file(
    app: AppHandle,
    base64_data: String,
    format: String,
) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let sanitized: String = format
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    let ext = if sanitized.is_empty() { "mp3".to_string() } else { sanitized };
    let dir = app_dir.join("media").join("audio");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let path = dir.join(&filename);
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_media_file(
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let media_root = app_dir.join("media").canonicalize().map_err(|e| e.to_string())?;
    let requested = std::path::Path::new(&path);
    let canonical = requested
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if !canonical.starts_with(&media_root) {
        return Err("not allowed".to_string());
    }
    if let Err(e) = std::fs::remove_file(&canonical) {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(e.to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn export_media_file(
    app: AppHandle,
    src_path: String,
    dest_path: String,
) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let requested = std::path::Path::new(&src_path);
    let canonical = requested
        .canonicalize()
        .map_err(|e| format!("Invalid source path: {}", e))?;
    if !canonical.starts_with(&app_dir) {
        return Err("not allowed".to_string());
    }
    std::fs::copy(&canonical, &dest_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn migrate_audio_to_disk(
    app: AppHandle,
    pool: tauri::State<'_, sqlx::SqlitePool>,
) -> Result<String, String> {
    use base64::Engine as _;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let audio_dir = app_dir.join("media").join("audio");
    std::fs::create_dir_all(&audio_dir).map_err(|e| e.to_string())?;

    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT id, response_json FROM generations WHERE (media_path IS NULL OR media_path LIKE 'blob:%') AND response_json LIKE '%audio_base64%'"
    )
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut migrated: i64 = 0;
    let mut skipped: i64 = 0;
    let mut failed: i64 = 0;

    for (id, response_json) in rows {
        let json_str = match response_json {
            Some(ref s) => s.clone(),
            None => {
                skipped += 1;
                continue;
            }
        };
        let mut value: serde_json::Value = match serde_json::from_str(&json_str) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("migrate_audio_to_disk: parse error for {}: {}", id, e);
                failed += 1;
                continue;
            }
        };
        let b64 = match value.get("audio_base64").and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => {
                skipped += 1;
                continue;
            }
        };
        let bytes = match base64::engine::general_purpose::STANDARD.decode(&b64) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("migrate_audio_to_disk: decode error for {}: {}", id, e);
                failed += 1;
                continue;
            }
        };
        let ext = value
            .get("audio_format")
            .and_then(|v| v.as_str())
            .unwrap_or("mp3")
            .to_lowercase()
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>();
        let ext = if ext.is_empty() { "mp3".to_string() } else { ext };
        let filename = format!("{}.{}", id, ext);
        let path = audio_dir.join(&filename);

        if let Err(e) = std::fs::write(&path, &bytes) {
            eprintln!("migrate_audio_to_disk: write error for {}: {}", id, e);
            failed += 1;
            continue;
        }

        let obj = value.as_object_mut().unwrap();
        obj.remove("audio_base64");
        let compact = serde_json::to_string(&value).map_err(|e| e.to_string())?;

        if let Err(e) = sqlx::query("UPDATE generations SET media_path = ?, response_json = ? WHERE id = ?")
            .bind(path.to_string_lossy().to_string())
            .bind(&compact)
            .bind(&id)
            .execute(&*pool)
            .await
        {
            eprintln!("migrate_audio_to_disk: update error for {}: {}", id, e);
            let _ = std::fs::remove_file(&path);
            failed += 1;
            continue;
        }

        migrated += 1;
    }

    if migrated > 0 {
        let _ = sqlx::query("VACUUM").execute(&*pool).await;
    }

    Ok(serde_json::json!({"migrated": migrated, "skipped": skipped, "failed": failed}).to_string())
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
