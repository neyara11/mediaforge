use reqwest::Client;
use std::time::Duration;
use std::sync::RwLock;

use super::retry::{should_retry, is_rate_limit, with_retry};

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

pub fn create_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .expect("Failed to create HTTP client")
}

pub async fn api_get(
    state: &ApiState,
    path: &str,
) -> Result<String, String> {
    let url = format!("{}{}", state.base_url, path);
    let api_key = {
        state
            .api_key
            .read()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "API key not set".to_string())?
    };
    let client = create_client();

    with_retry(
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
    )
    .await
}

pub async fn api_post(
    state: &ApiState,
    path: &str,
    body: &str,
) -> Result<String, String> {
    let url = format!("{}{}", state.base_url, path);
    let api_key = {
        state
            .api_key
            .read()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "API key not set".to_string())?
    };
    let client = create_client();

    with_retry(
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
    )
    .await
}

pub async fn api_post_binary(
    state: &ApiState,
    path: &str,
    body: &str,
) -> Result<Vec<u8>, String> {
    let url = format!("{}{}", state.base_url, path);
    let api_key = {
        state
            .api_key
            .read()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "API key not set".to_string())?
    };
    let client = create_client();

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    if status == 402 {
        return Err("Insufficient balance".to_string());
    }
    if !resp.status().is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, err_body));
    }

    resp.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
}
