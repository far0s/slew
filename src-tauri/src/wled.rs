// ============================================================================
// WLED Integration
// ============================================================================
//
// Manages a connection to a WLED controller over HTTP. Slot+template colours
// from the VJ engine are forwarded to WLED LED segments at ≤25 Hz.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

// ============================================================================
// Public types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WledSegmentMapping {
    /// WLED segment index (the `id` field in WLED's JSON API)
    pub segment_id: u8,
    /// Slot index (0-based) this mapping responds to
    pub slot_index: usize,
    /// Template/parameter id this mapping responds to, e.g. "color_primary"
    pub template_id: String,
    /// Which colour slot within the WLED segment (0 = primary, 1 = secondary, 2 = tertiary)
    pub color_index: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WledConfig {
    pub enabled: bool,
    pub ip: String,
    pub port: u16,
    pub mappings: Vec<WledSegmentMapping>,
}

impl Default for WledConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            ip: "192.168.1.42".to_string(),
            port: 80,
            mappings: vec![],
        }
    }
}

// ============================================================================
// Internal state
// ============================================================================

struct WledState {
    config: WledConfig,
    /// Pending colour updates: key = (segment_id, color_index), value = [r, g, b]
    pending: HashMap<(u8, u8), [u8; 3]>,
    /// When we last flushed to the device
    last_push: Instant,
    /// Reusable HTTP client (connection pooling, configured timeout)
    client: reqwest::blocking::Client,
}

impl Default for WledState {
    fn default() -> Self {
        Self {
            config: WledConfig::default(),
            pending: HashMap::new(),
            last_push: Instant::now(),
            client: reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(3))
                .build()
                .expect("[WLED] Failed to build HTTP client"),
        }
    }
}

static WLED_STATE: Lazy<Arc<Mutex<WledState>>> =
    Lazy::new(|| Arc::new(Mutex::new(WledState::default())));

fn with_wled_state<T, F: FnOnce(&mut WledState) -> T>(f: F) -> T {
    let mut state = WLED_STATE.lock().unwrap_or_else(|p| p.into_inner());
    f(&mut state)
}

// ============================================================================
// Initialization
// ============================================================================

pub fn init() {
    // Eagerly initialise the lazy static so the lock is ready before any
    // Tauri command arrives.
    drop(WLED_STATE.lock().unwrap_or_else(|p| p.into_inner()));
    log::debug!("[WLED] Module initialised");
}

// ============================================================================
// Core logic
// ============================================================================

const PUSH_INTERVAL: Duration = Duration::from_millis(40); // 25 Hz

/// Update the pending colour for every WLED segment that is mapped to
/// `slot_index` + `template_id`, then flush if the throttle window has passed.
pub fn push_color(slot_index: usize, template_id: &str, r: u8, g: u8, b: u8) {
    let should_flush = with_wled_state(|state| {
        if !state.config.enabled {
            return false;
        }

        // Collect matching mappings without holding an immutable borrow while
        // mutating `pending`.
        let matches: Vec<(u8, u8)> = state
            .config
            .mappings
            .iter()
            .filter(|m| m.slot_index == slot_index && m.template_id == template_id)
            .map(|m| (m.segment_id, m.color_index))
            .collect();

        for key in matches {
            state.pending.insert(key, [r, g, b]);
        }

        state.last_push.elapsed() >= PUSH_INTERVAL
    });

    if should_flush {
        flush();
    }
}

/// Build the WLED `/json/state` payload from all pending segment colours and
/// POST it to the device.  Clears `pending` and updates `last_push` on success.
fn flush() {
    // Snapshot what we need while holding the lock, then release it before the
    // blocking HTTP call so we don't hold the mutex across I/O.
    let (ip, port, pending_snapshot) = with_wled_state(|state| {
        let ip = state.config.ip.clone();
        let port = state.config.port;
        let snap = state.pending.clone();
        (ip, port, snap)
    });

    if pending_snapshot.is_empty() {
        return;
    }

    // Group colours by segment_id.
    // Each segment needs up to 3 colour slots: col[0], col[1], col[2].
    let mut segments: HashMap<u8, [[u8; 3]; 3]> = HashMap::new();
    let mut present: HashMap<u8, [bool; 3]> = HashMap::new();

    for ((seg_id, color_idx), rgb) in &pending_snapshot {
        if *color_idx > 2 {
            continue;
        }
        let entry = segments.entry(*seg_id).or_insert([[0, 0, 0]; 3]);
        let flags = present.entry(*seg_id).or_insert([false; 3]);
        entry[*color_idx as usize] = *rgb;
        flags[*color_idx as usize] = true;
    }

    // Build JSON: `{"seg": [{"id": N, "col": [[r,g,b], ...]}, ...]}`
    let seg_array: Vec<Value> = segments
        .iter()
        .map(|(seg_id, colors)| {
            let flags = present.get(seg_id).copied().unwrap_or([false; 3]);
            // Only include colour slots up to the highest present index so we
            // don't accidentally clear slots we didn't intend to touch.
            let highest = (0..3).rev().find(|&i| flags[i]).unwrap_or(0);
            let col: Vec<Value> = (0..=highest)
                .map(|i| {
                    if flags[i] {
                        json!([colors[i][0], colors[i][1], colors[i][2]])
                    } else {
                        // Placeholder: empty array means "don't change this slot"
                        json!([])
                    }
                })
                .collect();

            json!({ "id": seg_id, "col": col })
        })
        .collect();

    let payload = json!({ "seg": seg_array });
    let url = format!("http://{}:{}/json/state", ip, port);

    let client = with_wled_state(|state| state.client.clone());

    match do_post(&client, &url, &payload) {
        Ok(_) => {
            with_wled_state(|state| {
                state.pending.clear();
                state.last_push = Instant::now();
            });
            log::debug!("[WLED] Flushed {} segment(s)", segments.len());
        }
        Err(e) => {
            log::warn!("[WLED] Flush failed: {}", e);
        }
    }
}

/// Test the connection by sending `{"v": true}` and returning the `info` field.
fn test_connection() -> Result<String, String> {
    let (client, ip, port) = with_wled_state(|state| (state.client.clone(), state.config.ip.clone(), state.config.port));

    let url = format!("http://{}:{}/json/state", ip, port);
    let payload = json!({ "v": true });

    let body = do_post(&client, &url, &payload)?;

    // WLED returns a JSON object; try to pull out `info.ver` for a friendly msg.
    let version = body
        .get("info")
        .and_then(|i| i.get("ver"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    Ok(format!("Connected — WLED version {}", version))
}

/// Shared blocking HTTP POST helper.
fn do_post(client: &reqwest::blocking::Client, url: &str, payload: &Value) -> Result<Value, String> {
    let response = client
        .post(url)
        .json(payload)
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("WLED returned HTTP {}", response.status()));
    }

    let body: Value = response
        .json()
        .map_err(|e| format!("Failed to parse WLED response: {}", e))?;

    Ok(body)
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub fn get_wled_config() -> WledConfig {
    with_wled_state(|state| state.config.clone())
}

#[tauri::command]
pub fn set_wled_config(config: WledConfig) -> Result<(), String> {
    with_wled_state(|state| {
        state.config = config;
        state.pending.clear(); // stale pending data is no longer valid
    });
    log::debug!("[WLED] Config updated");
    Ok(())
}

#[tauri::command]
pub fn test_wled_connection() -> Result<String, String> {
    test_connection()
}

#[tauri::command]
pub fn push_wled_color(slot: usize, template_id: String, r: u8, g: u8, b: u8) {
    push_color(slot, &template_id, r, g, b);
}
