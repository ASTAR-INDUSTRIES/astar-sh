use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::process::Command;

#[derive(Deserialize)]
struct AuthAccount {
    name: String,
    username: String,
}

#[derive(Deserialize)]
struct AuthCacheRaw {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "expiresAt")]
    expires_at: i64,
    account: AuthAccount,
}

#[derive(Serialize)]
pub struct AuthCache {
    pub token: String,
    pub expires_at: i64,
    pub account_email: String,
    pub account_name: String,
}

fn auth_path() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "no home dir".to_string())?;
    Ok(home.join(".astar").join("auth.json"))
}

#[tauri::command]
pub fn read_auth() -> Result<AuthCache, String> {
    let path = auth_path()?;
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("auth file not found at {}: {}", path.display(), e))?;
    if raw.trim().is_empty() {
        return Err("not signed in".into());
    }
    let parsed: AuthCacheRaw = serde_json::from_str(&raw)
        .map_err(|e| format!("auth file malformed: {e}"))?;
    Ok(AuthCache {
        token: parsed.access_token,
        expires_at: parsed.expires_at,
        account_email: parsed.account.username,
        account_name: parsed.account.name,
    })
}

#[tauri::command]
pub fn save_auth(
    token: String,
    expires_at: i64,
    account_email: String,
    account_name: String,
) -> Result<(), String> {
    let path = auth_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let payload = json!({
        "accessToken": token,
        "expiresAt": expires_at,
        "account": {
            "name": account_name,
            "username": account_email,
        },
    });
    fs::write(&path, serde_json::to_string_pretty(&payload).unwrap())
        .map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("open: {e}"))?;
    Ok(())
}

// ── Microsoft device-code flow (server-to-server, no Origin header) ──
//
// Doing the OAuth call from JS via tauri-plugin-http leaks an
// `Origin: tauri://localhost` header, which makes Azure AD reject the
// token redemption with AADSTS9002326. Routing through reqwest from Rust
// sends a clean server-to-server request without an Origin header.

const MS_TENANT: &str = "d6af3688-b659-4f90-b701-35246b209b9d";
const MS_CLIENT: &str = "384f7660-f5e6-4f72-aa24-3be21cad67ed";
const MS_SCOPES: &str = "openid profile email";

#[tauri::command]
pub async fn ms_device_code() -> Result<serde_json::Value, String> {
    let url = format!(
        "https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/devicecode"
    );
    let res = reqwest::Client::new()
        .post(&url)
        .form(&[("client_id", MS_CLIENT), ("scope", MS_SCOPES)])
        .send()
        .await
        .map_err(|e| format!("devicecode request: {e}"))?;
    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| format!("devicecode body: {e}"))?;
    if !status.is_success() {
        return Err(format!("devicecode {status}: {body}"));
    }
    serde_json::from_str(&body).map_err(|e| format!("devicecode parse: {e}"))
}

#[tauri::command]
pub async fn ms_poll_token(device_code: String) -> Result<serde_json::Value, String> {
    let url = format!(
        "https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/token"
    );
    let res = reqwest::Client::new()
        .post(&url)
        .form(&[
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:device_code",
            ),
            ("client_id", MS_CLIENT),
            ("device_code", device_code.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("token request: {e}"))?;
    let status = res.status();
    let body = res.text().await.map_err(|e| format!("token body: {e}"))?;
    let v: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("token parse: {e}: {body}"))?;
    // 200 means we got tokens; non-200 may be `authorization_pending`,
    // `slow_down`, etc. — return the JSON either way and let the caller
    // distinguish.
    if status.is_success() {
        Ok(v)
    } else {
        Ok(v) // includes `error` field — frontend handles it
    }
}
