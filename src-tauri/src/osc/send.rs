//! OSC output — sending messages to external clients.

use std::net::UdpSocket;
use rosc::{OscMessage, OscPacket, OscType};
use tauri::Manager;

use super::engine::with_osc_engine;
use super::types::OscOutputConfig;

// ============================================================================
// OSC Output
// ============================================================================

/// Send a raw OSC message to the configured output target.
/// Fire-and-forget; errors are logged but not propagated.
pub fn send_osc_message(address: &str, args: Vec<OscType>) {
    let (socket_ref, target) = with_osc_engine(|state| {
        if !state.output_config.enabled {
            return (false, String::new());
        }
        let has_socket = state.output_socket.is_some();
        let target = format!("{}:{}", state.output_config.host, state.output_config.port);
        (has_socket, target)
    });

    if target.is_empty() {
        return; // disabled
    }

    let _ = socket_ref; // suppress unused warning

    // We need a socket reference — grab it separately to avoid holding the lock during send
    let packet = OscPacket::Message(OscMessage {
        addr: address.to_string(),
        args,
    });

    match rosc::encoder::encode(&packet) {
        Ok(bytes) => {
            with_osc_engine(|state| {
                if let Some(ref socket) = state.output_socket {
                    if let Err(e) = socket.send_to(&bytes, &target) {
                        log::warn!("[OSC Out] Send failed: {}", e);
                    } else {
                        log::debug!("[OSC Out] Sent {} to {}", address, target);
                        // Pulse the activity indicator
                        if let Some(ref handle) = state.app_handle {
                            use tauri::Emitter;
                            let _ = handle.emit("osc_output_sent", ());
                        }
                    }
                }
            });
        }
        Err(e) => {
            log::warn!("[OSC Out] Encode failed: {}", e);
        }
    }
}

/// Send /slew/beat if forward_beat is enabled.
pub fn send_osc_beat() {
    let should_send = with_osc_engine(|state| {
        state.output_config.enabled && state.output_config.forward_beat
    });
    if should_send {
        send_osc_message("/slew/beat", vec![OscType::Int(1)]);
    }
}

/// Send /slew/bpm <f32> if forward_bpm is enabled.
pub fn send_osc_bpm(bpm: f64) {
    let should_send = with_osc_engine(|state| {
        state.output_config.enabled && state.output_config.forward_bpm
    });
    if should_send {
        send_osc_message("/slew/bpm", vec![OscType::Float(bpm as f32)]);
    }
}

/// Send /slew/slot/{slot}/color/{template_id}  r g b  if forward_colors is enabled.
pub fn send_osc_color(slot: usize, template_id: &str, r: u8, g: u8, b: u8) {
    let should_send = with_osc_engine(|state| {
        state.output_config.enabled && state.output_config.forward_colors
    });
    if should_send {
        let address = format!("/slew/slot/{}/color/{}", slot, template_id);
        send_osc_message(
            &address,
            vec![
                OscType::Int(r as i32),
                OscType::Int(g as i32),
                OscType::Int(b as i32),
            ],
        );
    }
}

/// Get the current OSC output config.
pub fn get_output_config() -> OscOutputConfig {
    with_osc_engine(|state| state.output_config.clone())
}

/// Set the OSC output config, recreate the socket if needed, and persist to disk.
pub fn set_output_config(config: OscOutputConfig) -> Result<(), String> {
    with_osc_engine(|state| {
        if config.enabled {
            // Bind an ephemeral socket
            match UdpSocket::bind("0.0.0.0:0") {
                Ok(socket) => {
                    state.output_socket = Some(socket);
                }
                Err(e) => {
                    state.output_config = config.clone();
                    state.output_socket = None;
                    return Err(format!("Failed to bind output socket: {}", e));
                }
            }
        } else {
            state.output_socket = None;
        }
        state.output_config = config;
        Ok(())
    })?;

    save_output_config_to_disk();
    log::info!("[OSC Out] Config updated");
    Ok(())
}

// ============================================================================
// Persistence
// ============================================================================

/// Path to the OSC output config file.
fn output_config_path(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app_handle
        .path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("osc_output_config.json"))
}

/// Load OSC output config from disk.
pub(super) fn load_output_config_from_disk() {
    let app_handle = with_osc_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Some(path) = output_config_path(&handle) {
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(contents) => match serde_json::from_str::<OscOutputConfig>(&contents) {
                        Ok(config) => {
                            // Apply via set_output_config to also create socket if enabled
                            if let Err(e) = set_output_config(config) {
                                log::warn!("[OSC Out] Failed to restore config: {}", e);
                            } else {
                                log::debug!("[OSC Out] Loaded config from disk");
                            }
                        }
                        Err(e) => log::warn!("[OSC Out] Failed to parse output config: {}", e),
                    },
                    Err(e) => log::warn!("[OSC Out] Failed to read output config file: {}", e),
                }
            }
        }
    }
}

/// Save OSC output config to disk.
fn save_output_config_to_disk() {
    let (app_handle, config) =
        with_osc_engine(|state| (state.app_handle.clone(), state.output_config.clone()));

    if let Some(handle) = app_handle {
        if let Some(path) = output_config_path(&handle) {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match serde_json::to_string_pretty(&config) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path, json) {
                        log::error!("[OSC Out] Failed to write config file: {}", e);
                    }
                }
                Err(e) => log::error!("[OSC Out] Failed to serialize config: {}", e),
            }
        }
    }
}
