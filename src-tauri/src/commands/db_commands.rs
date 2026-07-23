use tauri::State;
use sqlx::{FromRow, SqlitePool};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRow {
    pub id: String,
    pub project_id: Option<String>,
    pub model: String,
    pub endpoint: String,
    pub request_json: String,
    pub response_json: Option<String>,
    pub status: String,
    pub media_path: Option<String>,
    pub media_type: Option<String>,
    pub thumbnail_path: Option<String>,
    pub parent_id: Option<String>,
    pub cost_rub: Option<f64>,
    pub generation_id: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ModelCacheRow {
    pub id: String,
    pub name: Option<String>,
    pub provider: Option<String>,
    pub input_modalities: Option<String>,
    pub output_modalities: Option<String>,
    pub pricing_json: Option<String>,
    pub supported_params: Option<String>,
    pub cached_at: String,
}

#[tauri::command]
pub async fn create_project(
    pool: State<'_, SqlitePool>,
    id: String,
    name: String,
    project_type: String,
) -> Result<(), String> {
    sqlx::query("INSERT INTO projects (id, name, type) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(&project_type)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_generation(
    pool: State<'_, SqlitePool>,
    id: String,
    project_id: Option<String>,
    model: String,
    endpoint: String,
    request_json: String,
    response_json: Option<String>,
    status: String,
    media_path: Option<String>,
    media_type: Option<String>,
    parent_id: Option<String>,
    cost_rub: Option<f64>,
    generation_id: Option<String>,
) -> Result<(), String> {
    eprintln!("[DB] save_generation id={}, endpoint={}, response_json_len={}", 
        id, endpoint, response_json.as_ref().map(|s| s.len()).unwrap_or(0));
    sqlx::query(
        "INSERT INTO generations (id, project_id, model, endpoint, request_json, response_json, status, media_path, media_type, parent_id, cost_rub, generation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           response_json = excluded.response_json,
           status = excluded.status,
           media_path = excluded.media_path,
           cost_rub = excluded.cost_rub,
           generation_id = excluded.generation_id,
           completed_at = CASE WHEN excluded.status IN ('completed','failed') THEN datetime('now') ELSE completed_at END"
    )
        .bind(&id)
        .bind(&project_id)
        .bind(&model)
        .bind(&endpoint)
        .bind(&request_json)
        .bind(&response_json)
        .bind(&status)
        .bind(&media_path)
        .bind(&media_type)
        .bind(&parent_id)
        .bind(&cost_rub)
        .bind(&generation_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_generations(
    pool: State<'_, SqlitePool>,
    project_id: Option<String>,
) -> Result<Vec<GenerationRow>, String> {
    let rows = if let Some(pid) = project_id {
        sqlx::query_as::<_, GenerationRow>(
            "SELECT * FROM generations WHERE project_id = ? ORDER BY created_at DESC"
        )
        .bind(&pid)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as::<_, GenerationRow>(
            "SELECT * FROM generations ORDER BY created_at DESC LIMIT 100"
        )
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?
    };
    Ok(rows)
}

#[tauri::command]
pub async fn get_models_cache(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ModelCacheRow>, String> {
    sqlx::query_as::<_, ModelCacheRow>("SELECT * FROM model_cache")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_models_cache(
    pool: State<'_, SqlitePool>,
    models_json: String,
) -> Result<(), String> {
    let models: Vec<serde_json::Value> = serde_json::from_str(&models_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    sqlx::query("DELETE FROM model_cache")
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    for model in models {
        let id = model["id"].as_str().unwrap_or("").to_string();
        let name = model["name"].as_str().map(|s| s.to_string());
        let provider = model["provider"].as_str().map(|s| s.to_string());
        let input_mod = model["input_modalities"].to_string();
        let output_mod = model["output_modalities"].to_string();
        let pricing = model["pricing"].to_string();
        let params = model["supported_params"].to_string();

        sqlx::query(
            "INSERT INTO model_cache (id, name, provider, input_modalities, output_modalities, pricing_json, supported_params)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
            .bind(&id)
            .bind(&name)
            .bind(&provider)
            .bind(&input_mod)
            .bind(&output_mod)
            .bind(&pricing)
            .bind(&params)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_setting(
    pool: State<'_, SqlitePool>,
    key: String,
) -> Result<Option<String>, String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM user_settings WHERE key = ?")
        .bind(&key)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.map(|r| r.0))
}

#[tauri::command]
pub async fn set_setting(
    pool: State<'_, SqlitePool>,
    key: String,
    value: String,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO user_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
        .bind(&key)
        .bind(&value)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
