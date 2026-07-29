use tauri::Manager;
use tauri::AppHandle;
use tauri::State;
use sqlx::SqlitePool;
use serde_json::{json, Value};
use base64::Engine;
use std::time::Duration;

async fn get_ace_step_config(pool: &SqlitePool) -> Result<(String, Option<String>), String> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT key, value FROM user_settings WHERE key IN ('ace_step_url', 'ace_step_api_key')")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
    let mut url = "http://localhost:8001".to_string();
    let mut api_key: Option<String> = None;
    for (k, v) in rows {
        match k.as_str() {
            "ace_step_url" if !v.is_empty() => url = v,
            "ace_step_api_key" if !v.is_empty() => api_key = Some(v),
            _ => {}
        }
    }
    Ok((url.trim_end_matches('/').to_string(), api_key))
}

fn with_auth(req: reqwest::RequestBuilder, api_key: &Option<String>) -> reqwest::RequestBuilder {
    match api_key {
        Some(key) => req.header("Authorization", format!("Bearer {}", key)),
        None => req,
    }
}

fn parse_wrapper(body: Value) -> Result<Value, String> {
    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
    let error = body.get("error");
    if code == 200 && (error.is_none() || error == Some(&Value::Null) || error.and_then(|e| e.as_str()) == Some("")) {
        body.get("data").cloned().ok_or_else(|| "Missing data in response".to_string())
    } else {
        let msg = error
            .and_then(|e| e.as_str())
            .or_else(|| body.get("detail").and_then(|d| d.as_str()))
            .unwrap_or("Unknown error")
            .to_string();
        Err(msg)
    }
}

fn map_reqwest_error(err: reqwest::Error, url: &str) -> String {
    if err.is_connect() || err.is_timeout() || err.is_request() {
        format!("ACE-Step not reachable at {}", url)
    } else {
        err.to_string()
    }
}

async fn audio_part(path: &str) -> Result<reqwest::multipart::Part, String> {
    let file = tokio::fs::read(path)
        .await
        .map_err(|e| format!("Failed to read audio file {}: {}", path, e))?;
    let name = std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio");
    let mime = match std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("wav") => "audio/wav",
        Some("flac") => "audio/flac",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("opus") => "audio/opus",
        Some("aac") => "audio/aac",
        _ => "audio/mpeg",
    };
    reqwest::multipart::Part::bytes(file)
        .file_name(name.to_string())
        .mime_str(mime)
        .map_err(|e| format!("Invalid mime for {}: {}", path, e))
}

fn map_http_error(status: reqwest::StatusCode, body_text: &str) -> String {
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return "Server busy (queue full)".to_string();
    }
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return "ACE-Step unauthorized: check API key in Settings".to_string();
    }
    if let Ok(body) = serde_json::from_str::<Value>(body_text) {
        if let Some(detail) = body.get("detail").and_then(|d| d.as_str()) {
            return detail.to_string();
        }
        let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
        let error = body.get("error");
        if code != 200 {
            if let Some(e) = error.and_then(|e| e.as_str()) {
                return e.to_string();
            }
        }
    }
    format!("ACE-Step error {}: {}", status.as_u16(), body_text)
}

#[tauri::command]
pub async fn acestep_health(
    pool: State<'_, SqlitePool>,
) -> Result<bool, String> {
    let (url, api_key) = get_ace_step_config(&pool).await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = with_auth(client.get(format!("{}/health", url)), &api_key)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, &url))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_error(status, &body));
    }
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    let data = parse_wrapper(body)?;
    Ok(data.get("status").and_then(|s| s.as_str()) == Some("ok"))
}

#[tauri::command]
pub async fn acestep_models(
    pool: State<'_, SqlitePool>,
) -> Result<String, String> {
    let (url, api_key) = get_ace_step_config(&pool).await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = with_auth(client.get(format!("{}/v1/models", url)), &api_key)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, &url))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_error(status, &body));
    }
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if let Ok(data) = parse_wrapper(body.clone()) {
        return serde_json::to_string(&data).map_err(|e| e.to_string());
    }
    if body.get("object").and_then(|o| o.as_str()) == Some("list") {
        let items = body
            .get("data")
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();
        let models: Vec<Value> = items
            .iter()
            .enumerate()
            .filter_map(|(i, m)| {
                let id = m.get("id").and_then(|v| v.as_str())?;
                let short = id.rsplit('/').next().unwrap_or(id);
                Some(json!({ "name": short, "is_default": i == 0 }))
            })
            .collect();
        let default_model = models
            .first()
            .and_then(|m| m.get("name").and_then(|n| n.as_str()))
            .unwrap_or("")
            .to_string();
        return serde_json::to_string(&json!({ "models": models, "default_model": default_model }))
            .map_err(|e| e.to_string());
    }
    Err("Unexpected /v1/models response format".to_string())
}

#[tauri::command]
pub async fn acestep_generate(
    pool: State<'_, SqlitePool>,
    prompt: String,
    lyrics: String,
    task_type: String,
    model: Option<String>,
    audio_format: Option<String>,
    bpm: Option<i64>,
    key_scale: Option<String>,
    time_signature: Option<String>,
    audio_duration: Option<f64>,
    vocal_language: Option<String>,
    batch_size: Option<i64>,
    inference_steps: Option<i64>,
    seed: Option<i64>,
    use_random_seed: Option<bool>,
    src_audio_path: Option<String>,
    reference_audio_path: Option<String>,
    repainting_start: Option<f64>,
    repainting_end: Option<f64>,
    audio_cover_strength: Option<f64>,
    instruction: Option<String>,
) -> Result<String, String> {
    let (url, api_key) = get_ace_step_config(&pool).await?;
    let use_multipart = src_audio_path.is_some() || reference_audio_path.is_some();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = if use_multipart {
        let mut form = reqwest::multipart::Form::new()
            .text("prompt", prompt)
            .text("lyrics", lyrics)
            .text("task_type", task_type)
            .text("thinking", "false")
            .text("use_cot_caption", "false")
            .text("use_cot_language", "false")
            .text("use_cot_metas", "false");

        if let Some(ref m) = model { form = form.text("model", m.clone()); }
        if let Some(ref f) = audio_format { form = form.text("audio_format", f.clone()); }
        if let Some(b) = bpm { form = form.text("bpm", b.to_string()); }
        if let Some(ref k) = key_scale { form = form.text("key_scale", k.clone()); }
        if let Some(ref t) = time_signature { form = form.text("time_signature", t.clone()); }
        if let Some(d) = audio_duration { form = form.text("audio_duration", d.to_string()); }
        if let Some(ref v) = vocal_language { form = form.text("vocal_language", v.clone()); }
        if let Some(b) = batch_size { form = form.text("batch_size", b.to_string()); }
        if let Some(i) = inference_steps { form = form.text("inference_steps", i.to_string()); }
        if let Some(s) = seed { form = form.text("seed", s.to_string()); }
        if let Some(r) = use_random_seed { form = form.text("use_random_seed", r.to_string()); }
        if let Some(ref p) = src_audio_path {
            form = form.part("src_audio", audio_part(p).await?);
        }
        if let Some(ref p) = reference_audio_path {
            form = form.part("reference_audio", audio_part(p).await?);
        }
        if let Some(r) = repainting_start { form = form.text("repainting_start", r.to_string()); }
        if let Some(r) = repainting_end { form = form.text("repainting_end", r.to_string()); }
        if let Some(s) = audio_cover_strength { form = form.text("audio_cover_strength", s.to_string()); }
        if let Some(ref i) = instruction { form = form.text("instruction", i.clone()); }

        with_auth(client.post(format!("{}/release_task", url)).multipart(form), &api_key)
            .send()
            .await
            .map_err(|e| map_reqwest_error(e, &url))?
    } else {
        let mut body = json!({
            "prompt": prompt,
            "lyrics": lyrics,
            "task_type": task_type,
            "thinking": false,
            "use_cot_caption": false,
            "use_cot_language": false,
            "use_cot_metas": false,
        });
        if let Some(ref m) = model { body["model"] = json!(m); }
        if let Some(ref f) = audio_format { body["audio_format"] = json!(f); }
        if let Some(b) = bpm { body["bpm"] = json!(b); }
        if let Some(ref k) = key_scale { body["key_scale"] = json!(k); }
        if let Some(ref t) = time_signature { body["time_signature"] = json!(t); }
        if let Some(d) = audio_duration { body["audio_duration"] = json!(d); }
        if let Some(ref v) = vocal_language { body["vocal_language"] = json!(v); }
        if let Some(b) = batch_size { body["batch_size"] = json!(b); }
        if let Some(i) = inference_steps { body["inference_steps"] = json!(i); }
        if let Some(s) = seed { body["seed"] = json!(s); }
        if let Some(r) = use_random_seed { body["use_random_seed"] = json!(r); }
        if let Some(r) = repainting_start { body["repainting_start"] = json!(r); }
        if let Some(r) = repainting_end { body["repainting_end"] = json!(r); }
        if let Some(s) = audio_cover_strength { body["audio_cover_strength"] = json!(s); }
        if let Some(ref i) = instruction { body["instruction"] = json!(i); }

        with_auth(client.post(format!("{}/release_task", url)).json(&body), &api_key)
            .send()
            .await
            .map_err(|e| map_reqwest_error(e, &url))?
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_error(status, &body));
    }
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    let data = parse_wrapper(body)?;
    let result = json!({
        "task_id": data.get("task_id").and_then(|v| v.as_str()).unwrap_or(""),
        "queue_position": data.get("queue_position"),
    });
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acestep_poll(
    pool: State<'_, SqlitePool>,
    task_ids: Vec<String>,
) -> Result<String, String> {
    let (url, api_key) = get_ace_step_config(&pool).await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = with_auth(
        client
            .post(format!("{}/query_result", url))
            .json(&json!({ "task_id_list": task_ids })),
        &api_key,
    )
    .send()
    .await
    .map_err(|e| map_reqwest_error(e, &url))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_error(status, &body));
    }
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    let data = parse_wrapper(body)?;
    let empty_vec = vec![];
    let items = data.as_array().unwrap_or(&empty_vec);
    let mut results: Vec<Value> = Vec::new();

    for item in items.iter().cloned() {
        let task_id = item.get("task_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let status: i64 = item.get("status").and_then(|v| v.as_i64()).unwrap_or(0);
        let result_raw = item.get("result").and_then(|v| v.as_str()).unwrap_or("");

        let files: Vec<Value> = if !result_raw.is_empty() {
            serde_json::from_str::<Vec<Value>>(result_raw).unwrap_or_default()
        } else {
            vec![]
        };

        let error = if status == 2 {
            files.first()
                .and_then(|f| f.get("error").and_then(|e| e.as_str()))
                .map(|s| Value::String(s.to_string()))
                .or_else(|| {
                    if !result_raw.is_empty() {
                        Some(Value::String(result_raw.to_string()))
                    } else {
                        Some(Value::String("Generation failed".to_string()))
                    }
                })
        } else {
            None
        };

        results.push(json!({
            "task_id": task_id,
            "status": status,
            "files": files,
            "error": error,
        }));
    }

    serde_json::to_string(&results).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acestep_download_audio(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    file: String,
) -> Result<String, String> {
    let (url, api_key) = get_ace_step_config(&pool).await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = with_auth(client.get(format!("{}{}", url, file)), &api_key)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, &url))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(map_http_error(status, &body));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let audio_format = if file.contains(".wav") { "wav" } else { "mp3" };
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let audio_dir = app_dir.join("media").join("audio");
    std::fs::create_dir_all(&audio_dir).map_err(|e| e.to_string())?;
    let filename = format!("{}.{}", uuid::Uuid::new_v4(), audio_format);
    let path = audio_dir.join(&filename);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    let result = json!({
        "media_path": path.to_string_lossy(),
        "audio_format": audio_format,
    });
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acestep_stage_audio(
    base64_data: String,
    format: String,
) -> Result<String, String> {
    let ext = format.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>();
    let ext = if ext.is_empty() { "mp3".to_string() } else { ext };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Invalid base64: {}", e))?;
    let filename = format!("mediaforge_stage_{}.{}", uuid::Uuid::new_v4(), ext);
    let path = std::env::temp_dir().join(&filename);
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}
