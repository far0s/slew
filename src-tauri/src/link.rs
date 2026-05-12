//! Ableton Link BPM synchronisation engine.
//!
//! Starts a background thread that polls an `AblLink` session at ~10 ms
//! intervals, detects beat crossings, and reports them to the BPM source
//! arbitration layer via `crate::bpm::report_beat`.

use crate::bpm::BpmSourceKind;
use once_cell::sync::Lazy;
use rusty_link::{AblLink, SessionState};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkStatus {
    pub enabled: bool,
    pub peer_count: u64,
    pub bpm: Option<f64>,
    /// Always `true` — rusty_link is always compiled in.
    pub available: bool,
}

// ============================================================================
// State
// ============================================================================

struct LinkState {
    enabled: bool,
    peer_count: u64,
    bpm: Option<f64>,
    app_handle: Option<AppHandle>,
}

impl LinkState {
    fn new() -> Self {
        Self { enabled: false, peer_count: 0, bpm: None, app_handle: None }
    }

    fn as_status(&self) -> LinkStatus {
        LinkStatus {
            enabled: self.enabled,
            peer_count: self.peer_count,
            bpm: self.bpm,
            available: true,
        }
    }
}

static LINK_STATE: Lazy<Arc<Mutex<LinkState>>> =
    Lazy::new(|| Arc::new(Mutex::new(LinkState::new())));

fn with_link_state<T, F: FnOnce(&mut LinkState) -> T>(f: F) -> T {
    let mut state = LINK_STATE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Initialisation
// ============================================================================

pub fn init_link_engine(app_handle: AppHandle) {
    with_link_state(|state| {
        state.app_handle = Some(app_handle.clone());
    });

    std::thread::Builder::new()
        .name("link-engine".into())
        .spawn(move || {
            const INITIAL_BPM: f64 = 120.0;
            const QUANTUM: f64 = 4.0;
            const POLL_INTERVAL: Duration = Duration::from_millis(10);

            let link = AblLink::new(INITIAL_BPM);
            link.enable(false); // start disabled; set_link_enabled will call link.enable(true)

            let mut session = SessionState::new();
            let mut last_phase: f64 = -1.0;
            let mut last_peer_count: u64 = 0;
            let mut last_bpm: f64 = 0.0;
            let mut last_enabled: bool = false;
            let mut log_ticker: u32 = 0;

            loop {
                let enabled = with_link_state(|st| st.enabled);
                // Only call link.enable when the state actually changes to avoid
                // disrupting the Link session on every poll tick.
                if enabled != last_enabled {
                    last_enabled = enabled;
                    link.enable(enabled);
                    log::debug!("[Link] {}", if enabled { "enabled" } else { "disabled" });
                }

                if enabled {
                    link.capture_app_session_state(&mut session);
                    let bpm = session.tempo();
                    let phase = session.phase_at_time(link.clock_micros(), QUANTUM);
                    let peers = link.num_peers();

                    // Emit event if peer count or tempo changed.
                    let bpm_changed = (bpm - last_bpm).abs() > 0.05;
                    let peers_changed = peers != last_peer_count;

                    // Periodic raw log every ~2s (200 ticks × 10ms) for debugging.
                    log_ticker = log_ticker.wrapping_add(1);
                    if log_ticker % 200 == 0 {
                        log::debug!("[Link] poll: enabled={} peers={} bpm={:.2} phase={:.3}", enabled, peers, bpm, phase);
                    }

                    if peers_changed || bpm_changed {
                        if peers_changed { log::debug!("[Link] Peer count: {}", peers); }
                        if bpm_changed  { log::debug!("[Link] Tempo: {:.2} BPM", bpm); }
                        last_peer_count = peers;
                        last_bpm = bpm;
                        let (app_handle, status) = with_link_state(|st| {
                            st.peer_count = peers;
                            st.bpm = Some(bpm.round());
                            (st.app_handle.clone(), st.as_status())
                        });
                        // Always forward current BPM to the modulation engine so
                        // LFOs stay in sync even between beats.
                        crate::bpm::report_beat(BpmSourceKind::Link, Some(bpm), None);
                        if let Some(h) = app_handle {
                            let _ = h.emit("link_status_changed", status);
                        }
                    }

                    // Beat fires when phase wraps: last_phase near QUANTUM, phase near 0.
                    let beat_fired = last_phase >= 0.0
                        && last_phase > QUANTUM * 0.75
                        && phase < QUANTUM * 0.25;

                    if beat_fired {
                        log::debug!("[Link] Beat @ {:.2} BPM", bpm);
                        crate::bpm::report_beat(BpmSourceKind::Link, Some(bpm), None);
                    }

                    last_phase = phase;
                } else {
                    last_phase = -1.0;
                }

                std::thread::sleep(POLL_INTERVAL);
            }
        })
        .expect("[Link] Failed to spawn link-engine thread");

    log::debug!("[Link] Engine initialised");
}

// ============================================================================
// Control
// ============================================================================

pub fn set_link_enabled(enabled: bool) {
    let app_handle = with_link_state(|st| {
        st.enabled = enabled;
        st.app_handle.clone()
    });
    log::debug!("[Link] Enabled: {}", enabled);
    if let Some(h) = app_handle {
        let status = with_link_state(|st| st.as_status());
        let _ = h.emit("link_status_changed", status);
    }
}

pub fn get_link_status() -> LinkStatus {
    with_link_state(|st| st.as_status())
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub fn enable_link_cmd(enabled: bool) {
    set_link_enabled(enabled);
}

#[tauri::command]
pub fn get_link_status_cmd() -> LinkStatus {
    get_link_status()
}
