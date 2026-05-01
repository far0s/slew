//! MIDI engine core - state management and initialization.

use once_cell::sync::Lazy;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

use super::constants::*;
use super::devices::{list_devices, list_devices_internal, list_output_devices_internal};
use super::types::*;

pub(crate) static MIDI_ENGINE: Lazy<Arc<Mutex<MidiEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(MidiEngineState::default())));

pub(crate) fn with_midi_engine<T, F: FnOnce(&mut MidiEngineState) -> T>(f: F) -> T {
    let mut state = MIDI_ENGINE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Controller registry
// ============================================================================

/// Describes a known MIDI controller and how Slew should treat it on connect.
pub(crate) struct ControllerProfile {
    /// Human-readable label used in log messages.
    pub label: &'static str,
    /// Returns true if a port name belongs to this controller.
    pub matches: fn(&str) -> bool,
    /// Whether this controller has a paired MIDI output port (for LED feedback).
    pub has_output: bool,
    /// Called once after the input port opens to install default parameter mappings.
    pub setup: fn(),
    /// Called with the output device ID once the paired output is connected.
    /// `None` means no LED startup sequence is needed.
    pub startup_leds: Option<fn(&str)>,
}

/// All recognised MIDI controllers, in priority order.
/// Add a new entry here to fully register a new controller — no other files need changing.
pub(crate) static CONTROLLERS: &[ControllerProfile] = &[
    ControllerProfile {
        label: "Midimix",
        matches: |name| name.contains(MIDIMIX_NAME_PATTERN),
        has_output: true,
        setup: || super::midimix::setup_midimix_default_mappings(),
        startup_leds: Some(|id| super::midimix::send_midimix_startup_animation(id)),
    },
    ControllerProfile {
        label: "APC Mini mk2",
        // mk2 must come before mk1 — its port name is a superset of mk1's
        matches: |name| name.to_ascii_lowercase().contains(APC_MINI_MK2_NAME_PATTERN),
        has_output: true,
        setup: || super::apc_mini::setup_apc_mini_default_mappings(),
        startup_leds: Some(|id| super::apc_mini::send_apc_mini_mk2_startup_leds(id)),
    },
    ControllerProfile {
        label: "APC Mini mk1",
        matches: |name| name.to_ascii_uppercase().contains(APC_MINI_MK1_NAME_PATTERN)
            && !name.to_ascii_lowercase().contains(APC_MINI_MK2_NAME_PATTERN),
        has_output: true,
        setup: || super::apc_mini::setup_apc_mini_default_mappings(),
        startup_leds: Some(|id| super::apc_mini::send_apc_mini_mk1_startup_leds(id)),
    },
    ControllerProfile {
        label: "MPD218",
        matches: |name| name.contains(MPD218_NAME_PATTERN),
        has_output: false,
        setup: || super::mpd218::setup_mpd218_default_mappings(),
        startup_leds: None,
    },
];

/// Find the controller profile matching a port name, if any.
pub(crate) fn find_controller(name: &str) -> Option<&'static ControllerProfile> {
    CONTROLLERS.iter().find(|p| (p.matches)(name))
}

// ============================================================================
// Legacy detection helpers
// ============================================================================
// Kept for back-compat with any call sites not yet using the registry directly.

pub fn is_midimix_device(name: &str) -> bool {
    (CONTROLLERS[0].matches)(name)
}

pub fn is_apc_mini_device(name: &str) -> bool {
    // mk2 check (index 1) or mk1 check (index 2)
    (CONTROLLERS[1].matches)(name) || (CONTROLLERS[2].matches)(name)
}

pub fn is_apc_mini_mk1_device(name: &str) -> bool {
    (CONTROLLERS[2].matches)(name)
}

pub fn is_apc_mini_mk2_device(name: &str) -> bool {
    (CONTROLLERS[1].matches)(name)
}

pub fn is_mpd218_device(name: &str) -> bool {
    (CONTROLLERS[3].matches)(name)
}

// ============================================================================
// Initialisation
// ============================================================================

pub fn init_midi_engine(app_handle: AppHandle) {
    with_midi_engine(|state| {
        state.app_handle = Some(app_handle);
    });

    super::mappings::load_mappings_from_disk();

    // Find the first device matching each known controller profile at startup
    let mut found: Vec<(&'static ControllerProfile, MidiDeviceInfo)> = Vec::new();

    if let Ok(devices) = list_devices() {
        with_midi_engine(|state| {
            state.known_device_names = devices.iter().map(|d| d.name.clone()).collect();
        });
        for d in &devices {
            if let Some(profile) = find_controller(&d.name) {
                // Only take the first device per profile
                if !found.iter().any(|(p, _)| p.label == profile.label) {
                    found.push((profile, d.clone()));
                }
            }
        }
    }

    if let Ok(devices) = super::devices::list_output_devices() {
        with_midi_engine(|state| {
            state.known_output_device_names = devices.iter().map(|d| d.name.clone()).collect();
        });
    }

    start_device_watcher_thread();

    for (profile, device) in found {
        log::info!(
            "[MIDI] {} found at startup, auto-connecting: {}",
            profile.label,
            device.name
        );
        let device_id = device.id;
        let label = profile.label;
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(500));
            if let Err(e) = super::connections::open_device(device_id) {
                log::warn!("[MIDI] Failed to auto-connect {} at startup: {}", label, e);
            }
        });
    }

    log::debug!("[MIDI] Engine initialized with hot-plug detection and output support");
}

pub fn cleanup_midi() {
    log::info!("[MIDI] Cleaning up MIDI on app exit");
    super::connections::close_all_output_devices();
    super::connections::close_all_devices();
    log::info!("[MIDI] MIDI cleanup complete");
}

fn start_device_watcher_thread() {
    let engine = MIDI_ENGINE.clone();

    thread::spawn(move || {
        log::debug!("[MIDI] Device watcher thread started");

        loop {
            thread::sleep(Duration::from_millis(DEVICE_POLL_INTERVAL_MS));

            let current_devices = match list_devices_internal() {
                Ok(devices) => devices,
                Err(e) => {
                    log::debug!("[MIDI] Device enumeration error: {}", e);
                    continue;
                }
            };

            let current_output_devices = match list_output_devices_internal() {
                Ok(devices) => devices,
                Err(e) => {
                    log::debug!("[MIDI] Output device enumeration error: {}", e);
                    Vec::new()
                }
            };

            let current_names: std::collections::HashSet<String> =
                current_devices.iter().map(|d| d.name.clone()).collect();
            let current_output_names: std::collections::HashSet<String> = current_output_devices
                .iter()
                .map(|d| d.name.clone())
                .collect();

            let (
                previous_names,
                previous_output_names,
                connected_device_names,
                connected_output_device_names,
                auto_reconnect_devices,
                auto_reconnect_output_devices,
                auto_reconnect_enabled,
                app_handle,
            ) = {
                let state = engine.lock().unwrap();
                let connected_names: std::collections::HashSet<String> = state
                    .connections
                    .values()
                    .map(|c| c.device_name.clone())
                    .collect();
                let connected_output_names: std::collections::HashSet<String> = state
                    .output_connections
                    .values()
                    .map(|c| c.device_name.clone())
                    .collect();
                (
                    state.known_device_names.clone(),
                    state.known_output_device_names.clone(),
                    connected_names,
                    connected_output_names,
                    state.auto_reconnect_devices.clone(),
                    state.auto_reconnect_output_devices.clone(),
                    state.auto_reconnect_enabled,
                    state.app_handle.clone(),
                )
            };

            let added: Vec<String> = current_names.difference(&previous_names).cloned().collect();
            let removed: Vec<String> = previous_names.difference(&current_names).cloned().collect();

            let output_added: Vec<String> = current_output_names
                .difference(&previous_output_names)
                .cloned()
                .collect();
            let output_removed: Vec<String> = previous_output_names
                .difference(&current_output_names)
                .cloned()
                .collect();

            let has_changes = !added.is_empty()
                || !removed.is_empty()
                || !output_added.is_empty()
                || !output_removed.is_empty();

            for name in &added {
                log::debug!("[MIDI] Input device connected: {}", name);
            }
            for name in &removed {
                log::debug!("[MIDI] Input device disconnected: {}", name);
            }
            for name in &output_added {
                log::debug!("[MIDI] Output device connected: {}", name);
            }
            for name in &output_removed {
                log::debug!("[MIDI] Output device disconnected: {}", name);
            }

            let mut disconnected_open_devices = Vec::new();
            for name in &removed {
                if connected_device_names.contains(name) {
                    disconnected_open_devices.push(name.clone());
                }
            }

            let mut disconnected_open_output_devices = Vec::new();
            for name in &output_removed {
                if connected_output_device_names.contains(name) {
                    disconnected_open_output_devices.push(name.clone());
                }
            }

            if !disconnected_open_devices.is_empty() {
                let mut state = engine.lock().unwrap();
                let device_ids_to_remove: Vec<String> = state
                    .connections
                    .iter()
                    .filter(|(_, conn)| disconnected_open_devices.contains(&conn.device_name))
                    .map(|(id, _)| id.clone())
                    .collect();

                for device_id in device_ids_to_remove {
                    if let Some(mut conn) = state.connections.remove(&device_id) {
                        if let Some(c) = conn.connection.take() {
                            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                c.close();
                            }));
                        }
                        log::debug!(
                            "[MIDI] Closed input connection to disconnected device: {}",
                            conn.device_name
                        );
                    }
                }
            }

            if !disconnected_open_output_devices.is_empty() {
                let mut state = engine.lock().unwrap();
                let device_ids_to_remove: Vec<String> = state
                    .output_connections
                    .iter()
                    .filter(|(_, conn)| {
                        disconnected_open_output_devices.contains(&conn.device_name)
                    })
                    .map(|(id, _)| id.clone())
                    .collect();

                for device_id in device_ids_to_remove {
                    if let Some(mut conn) = state.output_connections.remove(&device_id) {
                        if let Some(c) = conn.connection.take() {
                            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                drop(c);
                            }));
                        }
                        state.last_sent_cc.remove(&device_id);
                        log::debug!(
                            "[MIDI] Closed output connection to disconnected device: {}",
                            conn.device_name
                        );
                    }
                }
            }

            {
                let mut state = engine.lock().unwrap();
                state.known_device_names = current_names.clone();
                state.known_output_device_names = current_output_names.clone();
            }

            if has_changes {
                if let Some(handle) = &app_handle {
                    use tauri::Emitter;
                    if let Ok(devices) = list_devices() {
                        let _ = handle.emit("midi_devices_changed", &devices);
                    }
                    if let Ok(devices) = super::devices::list_output_devices() {
                        let _ = handle.emit("midi_output_devices_changed", &devices);
                    }
                }
            }

            if auto_reconnect_enabled && !added.is_empty() {
                for name in &added {
                    let should_connect = auto_reconnect_devices.contains(name)
                        || find_controller(name).is_some();

                    if should_connect {
                        if let Ok(devices) = list_devices() {
                            if let Some(device) = devices.iter().find(|d| &d.name == name) {
                                log::debug!("[MIDI] Auto-reconnecting input: {}", name);
                                if let Err(e) = super::connections::open_device(device.id.clone()) {
                                    log::warn!(
                                        "[MIDI] Auto-reconnect failed for input {}: {}",
                                        name,
                                        e
                                    );
                                }
                            }
                        }
                    }
                }
            }

            if auto_reconnect_enabled && !output_added.is_empty() {
                for name in &output_added {
                    // Skip output auto-reconnect for controllers that manage
                    // their own output pairing inside open_device via the registry
                    if find_controller(name).map(|p| p.has_output).unwrap_or(false) {
                        continue;
                    }

                    if auto_reconnect_output_devices.contains(name) {
                        if let Ok(devices) = super::devices::list_output_devices() {
                            if let Some(device) = devices.iter().find(|d| &d.name == name) {
                                log::debug!("[MIDI] Auto-reconnecting output: {}", name);
                                if let Err(e) =
                                    super::connections::open_output_device(device.id.clone())
                                {
                                    log::warn!(
                                        "[MIDI] Auto-reconnect failed for output {}: {}",
                                        name,
                                        e
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}
