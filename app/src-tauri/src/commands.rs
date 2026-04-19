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
