use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

// =============================================================================
// Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

// =============================================================================
// Background update check (called on startup)
// =============================================================================

/// Spawns a background thread to check for updates ~3 seconds after startup.
/// Emits `update_available` event to the controls window if an update is found.
pub fn init_updater(app: AppHandle) {
    std::thread::spawn(move || {
        // Small delay so startup I/O settles first
        std::thread::sleep(std::time::Duration::from_secs(3));

        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                log::error!("[Updater] Failed to create runtime: {}", e);
                return;
            }
        };

        rt.block_on(async {
            match check_for_update_inner(&app).await {
                Ok(Some(info)) => {
                    log::info!("[Updater] Update available: {}", info.version);
                    if let Err(e) = app.emit("update_available", &info) {
                        log::error!("[Updater] Failed to emit update_available: {}", e);
                    }
                }
                Ok(None) => {
                    log::debug!("[Updater] App is up to date");
                }
                Err(e) => {
                    log::debug!("[Updater] Update check failed (offline?): {}", e);
                }
            }
        });
    });
}

// =============================================================================
// Core async helpers
// =============================================================================

async fn check_for_update_inner(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app
        .updater()
        .map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?;

    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        body: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    }))
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Check for an update manually (called from frontend on demand).
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    check_for_update_inner(&app).await
}

/// Download and install the update. The app will restart after installation.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    log::info!("[Updater] Downloading update {}…", update.version);

    update
        .download_and_install(|_chunk_length, _content_length| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    log::info!("[Updater] Update installed — restarting");
    app.restart();
}
