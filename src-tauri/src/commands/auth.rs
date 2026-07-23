use tauri::State;
use tauri_plugin_store::StoreExt;

use crate::api::client::{ApiState, api_get};

#[tauri::command]
pub async fn set_api_key(
    app: tauri::AppHandle,
    state: State<'_, ApiState>,
    key: String,
) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("api_key", serde_json::json!(key));
    store.save().map_err(|e| e.to_string())?;

    if let Ok(mut guard) = state.api_key.write() {
        *guard = Some(key);
    }
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
