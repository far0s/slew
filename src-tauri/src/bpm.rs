//! BPM source arbitration.
//!
//! Tracks which sources are active and which one currently "owns" the BPM.
//!
//! Priority waterfall (lowest number wins):
//!   1 = Manual / Tap  — always sticky, no timeout
//!   2 = OSC           — /slew/beat + /slew/bpm
//!   3 = MIDI Clock    — 24 PPQN 0xF8 bytes
//!   4 = Microphone    — audio analysis

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

// ============================================================================
// Types
// ============================================================================

/// Which source is currently driving BPM.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BpmSourceKind {
    Manual,
    Osc,
    Link,
    MidiClock,
    Microphone,
}

impl BpmSourceKind {
    /// Lower number = higher priority.
    fn priority(self) -> u8 {
        match self {
            BpmSourceKind::Manual    => 1,
            BpmSourceKind::Osc      => 2,
            BpmSourceKind::Link     => 3,
            BpmSourceKind::MidiClock => 4,
            BpmSourceKind::Microphone => 5,
        }
    }
}

/// Per-source liveness record.
#[derive(Debug)]
struct SourceRecord {
    kind: BpmSourceKind,
    last_seen: Option<Instant>,
    bpm: Option<f64>,
}

/// Event emitted when the winning source changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BpmSourceChangedEvent {
    pub source: BpmSourceKind,
    pub bpm: Option<f64>,
}

// ============================================================================
// Global state
// ============================================================================

struct BpmSourceState {
    sources: Vec<SourceRecord>,
    active_source: BpmSourceKind,
    active_bpm: Option<f64>,
    app_handle: Option<AppHandle>,
}

impl BpmSourceState {
    fn new() -> Self {
        let sources = vec![
            SourceRecord { kind: BpmSourceKind::Manual,     last_seen: None, bpm: None },
            SourceRecord { kind: BpmSourceKind::Osc,        last_seen: None, bpm: None },
            SourceRecord { kind: BpmSourceKind::Link,       last_seen: None, bpm: None },
            SourceRecord { kind: BpmSourceKind::MidiClock,  last_seen: None, bpm: None },
            SourceRecord { kind: BpmSourceKind::Microphone, last_seen: None, bpm: None },
        ];
        Self {
            sources,
            active_source: BpmSourceKind::Microphone,
            active_bpm: None,
            app_handle: None,
        }
    }
}

static BPM_SOURCE: Lazy<Arc<Mutex<BpmSourceState>>> =
    Lazy::new(|| Arc::new(Mutex::new(BpmSourceState::new())));

fn with_bpm_source<T, F: FnOnce(&mut BpmSourceState) -> T>(f: F) -> T {
    let mut state = BPM_SOURCE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Initialization
// ============================================================================

/// Store the app handle so arbitration can emit events.
pub fn init_bpm_source(app_handle: AppHandle) {
    with_bpm_source(|state| {
        state.app_handle = Some(app_handle);
    });
    log::debug!("[BPM] Source arbitration initialized");
}

// ============================================================================
// Timeout
// ============================================================================

const SOURCE_TIMEOUT_SECS: f64 = 5.0;

fn is_active(record: &SourceRecord) -> bool {
    // Manual has no timeout — it stays active until explicitly cleared.
    if record.kind == BpmSourceKind::Manual {
        return record.last_seen.is_some();
    }
    match record.last_seen {
        None => false,
        Some(t) => t.elapsed().as_secs_f64() < SOURCE_TIMEOUT_SECS,
    }
}

// ============================================================================
// Arbitration
// ============================================================================

/// Find the highest-priority active source.
fn winning_source(sources: &[SourceRecord]) -> Option<&SourceRecord> {
    sources
        .iter()
        .filter(|r| is_active(r))
        .min_by_key(|r| r.kind.priority())
}

/// Run arbitration and, if the winning source changed, update internal state
/// and emit the `bpm_source_changed` event. Returns `true` if the given
/// `candidate` is the current winner (after arbitration).
fn arbitrate(state: &mut BpmSourceState, candidate: BpmSourceKind) -> bool {
    let (new_winner, new_bpm) = match winning_source(&state.sources) {
        Some(r) => (r.kind, r.bpm),
        None => (BpmSourceKind::Microphone, None),
    };

    let changed = new_winner != state.active_source || new_bpm != state.active_bpm;
    if changed {
        log::debug!(
            "[BPM] Source changed: {:?} → {:?} ({:?} BPM)",
            state.active_source,
            new_winner,
            new_bpm
        );
        state.active_source = new_winner;
        state.active_bpm = new_bpm;

        if let Some(handle) = &state.app_handle {
            let _ = handle.emit(
                "bpm_source_changed",
                BpmSourceChangedEvent { source: new_winner, bpm: new_bpm },
            );
        }
    }

    new_winner == candidate
}

// ============================================================================
// Public API
// ============================================================================

/// Called by each beat-producing source when it fires.
///
/// Updates the source's `last_seen` timestamp and BPM, runs arbitration,
/// and if the caller wins: forwards to `update_bpm()` and (for OSC) fires
/// `handle_osc_beat_inner`.
pub fn report_beat(source: BpmSourceKind, bpm: Option<f64>, _app_handle: Option<&AppHandle>) {
    let wins = with_bpm_source(|state| {
        // Update the source record.
        if let Some(record) = state.sources.iter_mut().find(|r| r.kind == source) {
            record.last_seen = Some(Instant::now());
            if bpm.is_some() {
                record.bpm = bpm;
            }
        }
        arbitrate(state, source)
    });

    if wins {
        crate::modulation::update_bpm(bpm);
    }
}

/// Manual / tap BPM — always wins, no timeout.
/// Pass `None` to clear manual mode.
pub fn report_manual_bpm(bpm: Option<f64>) {
    with_bpm_source(|state| {
        if let Some(record) = state.sources.iter_mut().find(|r| r.kind == BpmSourceKind::Manual) {
            if bpm.is_some() {
                record.last_seen = Some(Instant::now());
                record.bpm = bpm;
            } else {
                record.last_seen = None;
                record.bpm = None;
            }
        }
        // Manual always wins when active; just re-run arbitration.
        arbitrate(state, BpmSourceKind::Manual);
    });

    // After arbitration the winning source's BPM is in state.active_bpm.
    // Forward that value so we don't overwrite the promoted source's BPM
    // with None when clearing manual while Link (or another source) is active.
    let winning_bpm = with_bpm_source(|state| state.active_bpm);
    crate::modulation::update_bpm(winning_bpm);
}

/// Return the currently winning source.
pub fn get_active_source() -> BpmSourceKind {
    with_bpm_source(|state| state.active_source)
}

/// Return the BPM of the currently winning source.
pub fn get_active_bpm() -> Option<f64> {
    with_bpm_source(|state| state.active_bpm)
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub fn get_active_bpm_source() -> serde_json::Value {
    use serde_json::json;
    with_bpm_source(|state| {
        json!({ "source": state.active_source, "bpm": state.active_bpm })
    })
}
