use std::time::Duration;
use std::future::Future;
use tokio::time::sleep;

pub fn default_retry_durations() -> Vec<Duration> {
    vec![
        Duration::from_secs(1),
        Duration::from_secs(2),
        Duration::from_secs(4),
        Duration::from_secs(8),
    ]
}

pub async fn with_retry<F, Fut, T, E>(
    operation: F,
    max_retries: usize,
) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    let durations = default_retry_durations();
    let mut last_error = None;

    for attempt in 0..=max_retries.min(durations.len()) {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                last_error = Some(e);
                if attempt < max_retries.min(durations.len()) {
                    sleep(durations[attempt]).await;
                }
            }
        }
    }

    Err(last_error.unwrap())
}

pub fn should_retry(status: u16) -> bool {
    matches!(status, 429 | 503 | 502 | 504 | 500)
}

pub fn is_rate_limit(status: u16) -> bool {
    status == 429
}
