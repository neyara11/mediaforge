use reqwest::Client;
use std::time::Duration;
use std::sync::{OnceLock, RwLock};

use super::retry::{should_retry, is_rate_limit, with_retry_if};

pub const API_BASE_URL: &str = "https://routerai.ru/api/v1";

pub struct ApiState {
    pub api_key: RwLock<Option<String>>,
    pub base_url: String,
}

impl ApiState {
    pub fn new() -> Self {
        Self {
            api_key: RwLock::new(None),
            base_url: API_BASE_URL.to_string(),
        }
    }

    pub fn has_key(&self) -> bool {
        self.api_key.read().ok().map(|g| g.is_some()).unwrap_or(false)
    }
}

/// Shared client: connection pooling / keep-alive across requests.
static SHARED_CLIENT: OnceLock<Client> = OnceLock::new();

pub fn create_client() -> Client {
    SHARED_CLIENT
        .get_or_init(|| {
            Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .expect("Failed to create HTTP client")
        })
        .clone()
}

/// Client for long-running streamed generations: no total timeout, only a
/// per-read idle timeout, so a slow SSE generation isn't killed at 120 s.
static STREAM_CLIENT: OnceLock<Client> = OnceLock::new();

fn create_stream_client() -> Client {
    STREAM_CLIENT
        .get_or_init(|| {
            Client::builder()
                .read_timeout(Duration::from_secs(120))
                .build()
                .expect("Failed to create streaming HTTP client")
        })
        .clone()
}

/// Errors that must never be retried: insufficient balance (402) and
/// non-retryable 4xx responses ("API error 4xx: ...").
fn is_fatal_error(e: &str) -> bool {
    e == "Insufficient balance" || e.starts_with("API error ")
}

/// GET requests are idempotent — retry anything except fatal errors.
fn retryable_get_error(e: &String) -> bool {
    !is_fatal_error(e)
}

/// POSTs here are paid generation endpoints. Retry network failures and rate
/// limits, but never 5xx ("Server error ..."): the server may have processed
/// the generation, and a blind retry would charge the balance twice.
fn retryable_paid_post_error(e: &String) -> bool {
    !is_fatal_error(e) && !e.starts_with("Server error")
}

/// On HTTP 429 honor the server's Retry-After header (capped at 60 s) before
/// the retry loop fires again.
async fn wait_for_rate_limit(resp: &reqwest::Response) {
    let wait_secs = resp
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0)
        .min(60);
    if wait_secs > 0 {
        tokio::time::sleep(Duration::from_secs(wait_secs)).await;
    }
}

fn get_api_key(state: &ApiState) -> Result<String, String> {
    state
        .api_key
        .read()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "API key not set".to_string())
}

pub async fn api_get(
    state: &ApiState,
    path: &str,
) -> Result<String, String> {
    let url = format!("{}{}", state.base_url, path);
    let api_key = get_api_key(state)?;
    let client = create_client();

    with_retry_if(
        || {
            let client = client.clone();
            let url = url.clone();
            let api_key = api_key.clone();
            async move {
                let resp = client
                    .get(&url)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                let status = resp.status().as_u16();
                if status == 402 {
                    return Err("Insufficient balance".to_string());
                }
                if should_retry(status) {
                    if is_rate_limit(status) {
                        wait_for_rate_limit(&resp).await;
                        return Err("Rate limited".to_string());
                    }
                    return Err(format!("Server error {}", status));
                }
                if !resp.status().is_success() {
                    let body = resp.text().await.unwrap_or_default();
                    return Err(format!("API error {}: {}", status, body));
                }

                resp.text().await.map_err(|e| e.to_string())
            }
        },
        3,
        retryable_get_error,
    )
    .await
}

pub async fn api_get_bytes(
    state: &ApiState,
    path: &str,
) -> Result<Vec<u8>, String> {
    let url = format!("{}{}", state.base_url, path);
    let api_key = get_api_key(state)?;
    let client = create_client();

    with_retry_if(
        || {
            let client = client.clone();
            let url = url.clone();
            let api_key = api_key.clone();
            async move {
                let resp = client
                    .get(&url)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                let status = resp.status().as_u16();
                if status == 402 {
                    return Err("Insufficient balance".to_string());
                }
                if should_retry(status) {
                    if is_rate_limit(status) {
                        wait_for_rate_limit(&resp).await;
                        return Err("Rate limited".to_string());
                    }
                    return Err(format!("Server error {}", status));
                }
                if !resp.status().is_success() {
                    let body = resp.text().await.unwrap_or_default();
                    return Err(format!("API error {}: {}", status, body));
                }

                resp.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
            }
        },
        3,
        retryable_get_error,
    )
    .await
}

pub async fn api_post(
    state: &ApiState,
    path: &str,
    body: &str,
) -> Result<String, String> {
    let url = format!("{}{}", state.base_url, path);
    let api_key = get_api_key(state)?;
    let client = create_client();

    with_retry_if(
        || {
            let client = client.clone();
            let url = url.clone();
            let api_key = api_key.clone();
            let body = body.to_string();
            async move {
                let resp = client
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("Content-Type", "application/json")
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                let status = resp.status().as_u16();
                if status == 402 {
                    return Err("Insufficient balance".to_string());
                }
                if should_retry(status) {
                    let error_body = resp.text().await.unwrap_or_default();
                    eprintln!("[api_post] retryable error {} body: {}", status, error_body);
                    if is_rate_limit(status) {
                        return Err(format!("Rate limited: {}", error_body));
                    }
                    return Err(format!("Server error {}: {}", status, error_body));
                }
                if !resp.status().is_success() {
                    let body = resp.text().await.unwrap_or_default();
                    return Err(format!("API error {}: {}", status, body));
                }

                resp.text().await.map_err(|e| e.to_string())
            }
        },
        3,
        retryable_paid_post_error,
    )
    .await
}

pub async fn api_post_binary(
    state: &ApiState,
    path: &str,
    body: &str,
) -> Result<Vec<u8>, String> {
    let url = format!("{}{}", state.base_url, path);
    let api_key = get_api_key(state)?;
    let client = create_client();

    with_retry_if(
        || {
            let client = client.clone();
            let url = url.clone();
            let api_key = api_key.clone();
            let body = body.to_string();
            async move {
                let resp = client
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("Content-Type", "application/json")
                    .body(body)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                let status = resp.status().as_u16();
                if status == 402 {
                    return Err("Insufficient balance".to_string());
                }
                if should_retry(status) {
                    if is_rate_limit(status) {
                        wait_for_rate_limit(&resp).await;
                        return Err("Rate limited".to_string());
                    }
                    return Err(format!("Server error {}", status));
                }
                if !resp.status().is_success() {
                    let err_body = resp.text().await.unwrap_or_default();
                    return Err(format!("API error {}: {}", status, err_body));
                }

                resp.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
            }
        },
        3,
        retryable_paid_post_error,
    )
    .await
}

pub async fn api_post_stream(
    state: &ApiState,
    path: &str,
    body_json: &str,
) -> Result<String, String> {
    let url = format!("{}{}", state.base_url, path);
    let api_key = get_api_key(state)?;
    let client = create_stream_client();

    with_retry_if(
        || {
            let client = client.clone();
            let url = url.clone();
            let api_key = api_key.clone();
            let body_json = body_json.to_string();
            async move {
                let resp = client
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("Content-Type", "application/json")
                    .body(body_json)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                let status = resp.status().as_u16();
                if status == 402 {
                    return Err("Insufficient balance".to_string());
                }
                if should_retry(status) {
                    if is_rate_limit(status) {
                        wait_for_rate_limit(&resp).await;
                        return Err("Rate limited".to_string());
                    }
                    return Err(format!("Server error {}", status));
                }
                if !resp.status().is_success() {
                    let err_body = resp.text().await.unwrap_or_default();
                    return Err(format!("API error {}: {}", status, err_body));
                }

                let content_type = resp
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("unknown")
                    .to_string();

                let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

                eprintln!("[API Stream] status={}, content-type={}, len={}", status, content_type, bytes.len());

                String::from_utf8(bytes.to_vec()).map_err(|e| format!("UTF-8 error: {} (first 100 bytes: {:?})", e, &bytes[..bytes.len().min(100)]))
            }
        },
        3,
        retryable_paid_post_error,
    )
    .await
}
