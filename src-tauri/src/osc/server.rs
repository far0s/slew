//! OSC server lifecycle management.

use std::net::UdpSocket;
use std::thread;
use tauri::Emitter;

use super::engine::{with_osc_engine, OSC_ENGINE};
use super::handler::handle_osc_packet;
use super::types::{OscServerStatus};

// ============================================================================
// Server Management
// ============================================================================

/// Start the OSC server on the specified port.
pub fn start_server(port: u16) -> Result<(), String> {
    // Check if already running
    let is_running = with_osc_engine(|state| state.status.is_running);
    if is_running {
        return Err("OSC server is already running".to_string());
    }

    // Bind UDP socket
    let bind_addr = format!("0.0.0.0:{}", port);
    let socket = UdpSocket::bind(&bind_addr)
        .map_err(|e| format!("Failed to bind to {}: {}", bind_addr, e))?;

    // Set socket to non-blocking for graceful shutdown
    socket
        .set_read_timeout(Some(std::time::Duration::from_millis(100)))
        .map_err(|e| format!("Failed to set socket timeout: {}", e))?;

    // Reset stop flag
    let should_stop = with_osc_engine(|state| {
        *state.should_stop.lock().unwrap() = false;
        state.should_stop.clone()
    });

    // Get app handle and mappings for the thread
    let app_handle = with_osc_engine(|state| state.app_handle.clone());

    // Spawn receiver thread
    let engine = OSC_ENGINE.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];

        loop {
            // Check if we should stop
            if *should_stop.lock().unwrap() {
                break;
            }

            // Try to receive a packet
            match socket.recv_from(&mut buf) {
                Ok((size, _addr)) => {
                    // Parse OSC packet
                    if let Ok(packet) = rosc::decoder::decode_udp(&buf[..size]) {
                        // Get current mappings (they might have changed)
                        let current_mappings = {
                            let state = engine.lock().unwrap();
                            state.mappings.clone()
                        };

                        handle_osc_packet(&packet.1, &current_mappings, app_handle.as_ref());
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // Timeout, just continue
                    continue;
                }
                Err(e) => {
                    log::error!("[OSC] Socket error: {}", e);
                    break;
                }
            }
        }

        log::info!("[OSC] Server thread exiting");
    });

    // Update status
    with_osc_engine(|state| {
        state.status = OscServerStatus {
            is_running: true,
            port: Some(port),
            error: None,
        };
    });

    log::info!("[OSC] Server started on port {}", port);
    emit_status_changed();

    Ok(())
}

/// Stop the OSC server.
pub fn stop_server() -> Result<(), String> {
    let is_running = with_osc_engine(|state| state.status.is_running);
    if !is_running {
        return Err("OSC server is not running".to_string());
    }

    // Signal the thread to stop
    with_osc_engine(|state| {
        *state.should_stop.lock().unwrap() = true;
        state.status = OscServerStatus {
            is_running: false,
            port: None,
            error: None,
        };
    });

    log::info!("[OSC] Server stopped");
    emit_status_changed();

    Ok(())
}

/// Get the current server status.
pub fn get_status() -> OscServerStatus {
    with_osc_engine(|state| state.status.clone())
}

// ============================================================================
// Event Emission
// ============================================================================

/// Emit an osc_status_changed event.
pub(super) fn emit_status_changed() {
    let (app_handle, status) =
        with_osc_engine(|state| (state.app_handle.clone(), state.status.clone()));

    if let Some(handle) = app_handle {
        let _ = handle.emit("osc_status_changed", status);
    }
}
