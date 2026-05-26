//! OSC message parsing and dispatch.

use rosc::{OscMessage, OscPacket, OscType};
use tauri::{AppHandle, Emitter};

use super::engine::with_osc_engine;
use super::send::{send_osc_beat, send_osc_bpm};
use super::types::{OscBeatInfo, OscMapping, OscMessageInfo};

// ============================================================================
// OSC Message Handling
// ============================================================================

/// Handle an incoming OSC packet (may contain multiple messages).
pub(super) fn handle_osc_packet(
    packet: &OscPacket,
    mappings: &[OscMapping],
    app_handle: Option<&AppHandle>,
) {
    match packet {
        OscPacket::Message(msg) => {
            handle_osc_message(msg, mappings, app_handle);
        }
        OscPacket::Bundle(bundle) => {
            for p in &bundle.content {
                handle_osc_packet(p, mappings, app_handle);
            }
        }
    }
}

/// Handle a single OSC message.
fn handle_osc_message(msg: &OscMessage, mappings: &[OscMapping], app_handle: Option<&AppHandle>) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // Convert args to strings for display
    let args: Vec<String> = msg
        .args
        .iter()
        .map(|arg| match arg {
            OscType::Int(i) => i.to_string(),
            OscType::Float(f) => format!("{:.4}", f),
            OscType::String(s) => s.clone(),
            OscType::Bool(b) => b.to_string(),
            OscType::Double(d) => format!("{:.4}", d),
            OscType::Long(l) => l.to_string(),
            _ => "[complex]".to_string(),
        })
        .collect();

    let msg_info = OscMessageInfo {
        address: msg.addr.clone(),
        args: args.clone(),
        timestamp,
    };

    // Emit raw message for activity indicator
    if let Some(handle) = app_handle {
        let _ = handle.emit("osc_message", &msg_info);
    }

    // -------------------------------------------------------------------------
    // Reserved /slew/* addresses — handled before user mappings
    // -------------------------------------------------------------------------

    // Fetch configured beat/bpm addresses for this check.
    let (beat_addr, bpm_addr) = with_osc_engine(|state| {
        (
            state.beat_config.beat_address.clone(),
            state.beat_config.bpm_address.clone(),
        )
    });

    // <beat_address> — fire a beat pulse into the modulation engine
    if msg.addr == beat_addr {
        handle_osc_beat(timestamp, app_handle);
        return;
    }

    // <bpm_address> <float> — update the modulation engine's BPM
    if msg.addr == bpm_addr {
        if let Some(bpm) = extract_numeric(&msg.args) {
            let clamped = bpm.clamp(20.0, 300.0);
            with_osc_engine(|state| {
                state.osc_bpm = Some(clamped);
            });
            send_osc_bpm(clamped);
            log::debug!("[OSC] BPM set to {:.1} via {}", clamped, bpm_addr);
        }
        return;
    }

    // -------------------------------------------------------------------------
    // User-defined parameter mappings
    // -------------------------------------------------------------------------

    // Try to extract a numeric value from the first argument
    let value = extract_numeric(&msg.args);

    if let Some(raw_value) = value {
        // Check all mappings for a match
        for mapping in mappings {
            if matches_address(&msg.addr, &mapping.address) {
                // Scale value from input range to output range
                let normalized =
                    (raw_value - mapping.min_input) / (mapping.max_input - mapping.min_input);
                let clamped = normalized.clamp(0.0, 1.0);
                let scaled =
                    mapping.min_output + clamped * (mapping.max_output - mapping.min_output);

                apply_osc_to_parameter(&mapping.parameter_id, scaled, app_handle);
            }
        }
    }
}

/// Fire a beat pulse into the modulation engine and emit `osc_beat` to the frontend.
fn handle_osc_beat(timestamp: u64, app_handle: Option<&AppHandle>) {
    let bpm = with_osc_engine(|state| state.osc_bpm);

    // Route through BPM source arbitration.
    crate::bpm::report_beat(crate::bpm::BpmSourceKind::Osc, bpm, app_handle);

    // Also trigger AudioLevels with beat=true so AudioSource::Beat mappings fire.
    let beat_levels = crate::audio::AudioLevels {
        rms: 0.0,
        peak: 0.0,
        bands: crate::audio::AudioBands {
            bass: 0.0,
            low_mid: 0.0,
            high_mid: 0.0,
            treble: 0.0,
        },
        beat: true,
        timestamp,
        spectrum: Vec::new(),
        waveform: Vec::new(),
    };
    crate::modulation::update_audio_levels(beat_levels);
    send_osc_beat();

    // Emit osc_beat event so the frontend beat indicator can pulse.
    if let Some(handle) = app_handle {
        let beat_info = OscBeatInfo { timestamp, bpm };
        let _ = handle.emit("osc_beat", &beat_info);
    }

    log::debug!("[OSC] Beat pulse fired");
}

// ============================================================================
// Helpers
// ============================================================================

/// Extract a numeric f64 from the first OSC argument, if possible.
pub(super) fn extract_numeric(args: &[OscType]) -> Option<f64> {
    match args.first() {
        Some(OscType::Float(f)) => Some(*f as f64),
        Some(OscType::Double(d)) => Some(*d),
        Some(OscType::Int(i)) => Some(*i as f64),
        Some(OscType::Long(l)) => Some(*l as f64),
        Some(OscType::Bool(b)) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

/// Check if an OSC address matches a pattern.
/// Supports exact matches and simple wildcard (*) at the end.
pub(super) fn matches_address(address: &str, pattern: &str) -> bool {
    if pattern.ends_with('*') {
        let prefix = &pattern[..pattern.len() - 1];
        address.starts_with(prefix)
    } else {
        address == pattern
    }
}

/// Apply an OSC-derived value to a parameter.
fn apply_osc_to_parameter(parameter_id: &str, value: f64, app_handle: Option<&AppHandle>) {
    crate::with_parameter_store(|store| {
        store.set_target(parameter_id.to_string(), value);
    });

    // Emit parameter_changed event so UI stays in sync
    if let Some(handle) = app_handle {
        if let Some(param) = crate::with_parameter_store(|store| store.get(parameter_id)) {
            let _ = handle.emit("parameter_changed", &param);
        }
    }

    log::debug!(
        "[OSC] Applied value {} to parameter {}",
        value,
        parameter_id
    );
}
