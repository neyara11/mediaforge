use tauri::State;

use crate::api::client::{ApiState, api_get};

#[tauri::command]
pub async fn fetch_models(
    state: State<'_, ApiState>,
) -> Result<String, String> {
    api_get(&state, "/models").await
}

#[tauri::command]
pub async fn get_model_info(
    state: State<'_, ApiState>,
    model_id: String,
) -> Result<String, String> {
    api_get(&state, &format!("/models/{}", model_id)).await
}
