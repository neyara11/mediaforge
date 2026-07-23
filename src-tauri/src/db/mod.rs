use tauri::AppHandle;
use tauri::Manager;

pub fn get_db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("mediaforge.db"))
}

pub fn get_media_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_dir.join("media"))
}

pub fn init_dirs(app: &AppHandle) -> Result<(), String> {
    let media_dir = get_media_dir(app)?;
    std::fs::create_dir_all(media_dir.join("images")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(media_dir.join("audio/raw")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(media_dir.join("audio/mp3")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(media_dir.join("video/mp4")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(media_dir.join("exports")).map_err(|e| e.to_string())?;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(app_dir.join("thumbnails")).map_err(|e| e.to_string())?;

    Ok(())
}

pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('image','music','video','speech')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_json TEXT NOT NULL,
    response_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
    media_path TEXT,
    media_type TEXT,
    thumbnail_path TEXT,
    parent_id TEXT REFERENCES generations(id),
    cost_rub REAL,
    generation_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS model_cache (
    id TEXT PRIMARY KEY,
    name TEXT,
    provider TEXT,
    input_modalities TEXT,
    output_modalities TEXT,
    pricing_json TEXT,
    supported_params TEXT,
    cached_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);
"#;
