use tauri::State;
use tauri_plugin_store::StoreExt;

use crate::api::client::{ApiState, api_get};

#[tauri::command]
pub async fn check_auth(app: tauri::AppHandle) -> Result<bool, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    Ok(store.get("api_key").and_then(|v| v.as_str().map(|s| !s.is_empty())).unwrap_or(false))
}

#[tauri::command]
pub async fn set_api_key(
    app: tauri::AppHandle,
    state: State<'_, ApiState>,
    key: String,
) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("api_key", serde_json::json!(key));
    store.save().map_err(|e| e.to_string())?;

    let mut guard = state
        .api_key
        .write()
        .map_err(|e| format!("API key lock poisoned: {}", e))?;
    *guard = Some(key);
    Ok(())
}

#[tauri::command]
pub async fn delete_api_key(
    app: tauri::AppHandle,
    state: State<'_, ApiState>,
) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.delete("api_key");
    store.save().map_err(|e| e.to_string())?;

    let mut guard = state
        .api_key
        .write()
        .map_err(|e| format!("API key lock poisoned: {}", e))?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, ApiState>,
) -> Result<String, String> {
    api_get(&state, "/models").await
}

#[tauri::command]
pub async fn get_balance(
    state: State<'_, ApiState>,
) -> Result<String, String> {
    api_get(&state, "/balance").await
}
