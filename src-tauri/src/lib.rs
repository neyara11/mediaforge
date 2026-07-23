pub mod api;
pub mod commands;
pub mod db;

use tauri::Manager;
use api::client::ApiState;
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(ApiState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = app.state::<ApiState>();
            let store = handle.store("settings.json").map_err(|e| format!("Store error: {}", e))?;
            if let Some(key) = store.get("api_key").and_then(|v| v.as_str().map(|s| s.to_string())) {
                if let Ok(mut guard) = state.api_key.write() {
                    *guard = Some(key);
                }
            }

            db::init_dirs(&handle)?;

            let db_path = db::get_db_path(&handle)?;
            let rt = tokio::runtime::Runtime::new().map_err(|e| format!("Runtime error: {}", e))?;
            rt.block_on(async {
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect_with(
                        sqlx::sqlite::SqliteConnectOptions::new()
                            .filename(&db_path)
                            .create_if_missing(true),
                    )
                    .await
                    .map_err(|e| format!("DB connection error: {}", e))?;
                sqlx::query(db::SCHEMA)
                    .execute(&pool)
                    .await
                    .map_err(|e| format!("Schema init error: {}", e))?;
                app.manage(pool);
                Ok::<_, String>(())
            })?;

            let _window = app.get_webview_window("main").unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::images::generate_image,
            commands::images::edit_image,
            commands::speech::text_to_speech,
            commands::speech::speech_to_text,
            commands::videos::create_video,
            commands::videos::poll_video,
            commands::videos::download_video,
            commands::chat::chat_completion,
            commands::models::fetch_models,
            commands::models::get_model_info,
            commands::auth::check_auth,
            commands::auth::set_api_key,
            commands::auth::test_connection,
            commands::auth::get_balance,
            commands::storage::save_media,
            commands::storage::load_media,
            commands::storage::list_generations,
            commands::db_commands::create_project,
            commands::db_commands::save_generation,
            commands::db_commands::get_generations,
            commands::db_commands::get_models_cache,
            commands::db_commands::save_models_cache,
            commands::db_commands::get_setting,
            commands::db_commands::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
