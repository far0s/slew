//! Generic MIDI controller template system.
//!
//! Loads controller profiles from JSON files in `~/.local/share/slew/device-templates/`
//! (or OS equivalent). Templates allow users to add controller support without recompiling.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;

use super::types::{MidiMapping, NoteMappingMode};

// ============================================================================
// Serde helpers
// ============================================================================

fn default_zero() -> f64 {
    0.0
}

fn default_one() -> f64 {
    1.0
}

// ============================================================================
// Structs
// ============================================================================

/// A single mapping entry inside a controller template JSON file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateMappingEntry {
    pub parameter_id: String,

    #[serde(default)]
    pub channel: Option<u8>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cc_number: Option<u8>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_number: Option<u8>,

    /// "velocity" or "trigger"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_mode: Option<String>,

    #[serde(default = "default_zero")]
    pub min_value: f64,

    #[serde(default = "default_one")]
    pub max_value: f64,
}

/// A single LED command sent on controller startup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateLedCommand {
    pub channel: u8,
    pub note: u8,
    pub velocity: u8,
}

/// A full controller template, loadable from a `.slew-controller.json` file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControllerTemplate {
    pub schema_version: u32,
    pub label: String,

    /// Substring patterns matched case-insensitively against the MIDI port name.
    pub match_patterns: Vec<String>,

    #[serde(default)]
    pub has_output: bool,

    #[serde(default)]
    pub default_mappings: Vec<TemplateMappingEntry>,

    #[serde(default)]
    pub startup_leds: Vec<TemplateLedCommand>,

    /// Filled in at load time — not present in the JSON file.
    #[serde(skip)]
    pub source_file: Option<String>,
}

/// Lightweight summary of a template, sent over IPC.
#[derive(Debug, Clone, Serialize)]
pub struct ControllerTemplateMeta {
    pub label: String,
    pub match_patterns: Vec<String>,
    pub has_output: bool,
    pub mapping_count: usize,
    /// Always "user" for file-based templates.
    pub source: String,
}

// ============================================================================
// Global state
// ============================================================================

static DYNAMIC_TEMPLATES: Lazy<RwLock<Vec<ControllerTemplate>>> =
    Lazy::new(|| RwLock::new(Vec::new()));

// ============================================================================
// Directory
// ============================================================================

/// Returns the directory where user controller templates are stored.
pub fn templates_dir() -> Option<PathBuf> {
    Some(
        dirs::data_local_dir()?
            .join("slew")
            .join("device-templates"),
    )
}

// ============================================================================
// Disk I/O
// ============================================================================

/// Scan the templates directory and load all `*.slew-controller.json` files.
///
/// Replaces the current in-memory list. Safe to call multiple times.
pub fn load_templates_from_disk() {
    let dir = match templates_dir() {
        Some(d) => d,
        None => {
            log::warn!("[MIDI Templates] Could not determine templates directory");
            return;
        }
    };

    if let Err(e) = fs::create_dir_all(&dir) {
        log::warn!("[MIDI Templates] Failed to create templates dir: {}", e);
        return;
    }

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("[MIDI Templates] Failed to read templates dir: {}", e);
            return;
        }
    };

    let mut templates = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();

        if !name.ends_with(".slew-controller.json") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("[MIDI Templates] Failed to read {:?}: {}", path, e);
                continue;
            }
        };

        match serde_json::from_str::<ControllerTemplate>(&content) {
            Ok(mut t) => {
                t.source_file = Some(path.to_string_lossy().into_owned());
                templates.push(t);
            }
            Err(e) => {
                log::warn!("[MIDI Templates] Failed to parse {:?}: {}", path, e);
            }
        }
    }

    let count = templates.len();

    match DYNAMIC_TEMPLATES.write() {
        Ok(mut guard) => *guard = templates,
        Err(e) => {
            log::error!("[MIDI Templates] Failed to acquire write lock: {}", e);
            return;
        }
    }

    log::debug!("[MIDI Templates] Loaded {} templates from disk", count);
}

/// Save a template to disk as `<label>.slew-controller.json`, then reload.
pub fn save_template_to_disk(template: &ControllerTemplate) -> Result<(), String> {
    let dir =
        templates_dir().ok_or_else(|| "Could not determine templates directory".to_string())?;

    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create templates dir: {}", e))?;

    // Sanitize label into a safe filename component.
    let safe_name: String = template
        .label
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();

    let filename = format!("{}.slew-controller.json", safe_name);
    let path = dir.join(&filename);

    let json = serde_json::to_string_pretty(template)
        .map_err(|e| format!("Serialization failed: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write template file: {}", e))?;

    log::debug!(
        "[MIDI Templates] Saved template '{}' to {:?}",
        template.label,
        path
    );

    // Keep in-memory list in sync.
    load_templates_from_disk();

    Ok(())
}

/// Delete the on-disk file for a template identified by label, then reload.
pub fn delete_template(label: &str) -> Result<(), String> {
    let source_file = {
        let guard = DYNAMIC_TEMPLATES
            .read()
            .map_err(|e| format!("Lock poisoned: {}", e))?;

        guard
            .iter()
            .find(|t| t.label == label)
            .and_then(|t| t.source_file.clone())
            .ok_or_else(|| format!("No template found with label '{}'", label))?
    };

    fs::remove_file(&source_file)
        .map_err(|e| format!("Failed to delete template file '{}': {}", source_file, e))?;

    log::debug!(
        "[MIDI Templates] Deleted template '{}' ({})",
        label,
        source_file
    );

    load_templates_from_disk();

    Ok(())
}

// ============================================================================
// Queries
// ============================================================================

/// Clone the full list of loaded templates.
pub fn get_all_templates() -> Vec<ControllerTemplate> {
    DYNAMIC_TEMPLATES
        .read()
        .map(|g| g.clone())
        .unwrap_or_default()
}

/// Return lightweight meta structs for all templates (suitable for IPC).
pub fn list_template_meta() -> Vec<ControllerTemplateMeta> {
    get_all_templates()
        .into_iter()
        .map(|t| ControllerTemplateMeta {
            mapping_count: t.default_mappings.len(),
            label: t.label,
            match_patterns: t.match_patterns,
            has_output: t.has_output,
            source: "user".to_string(),
        })
        .collect()
}

/// Find the first template whose `match_patterns` contains a case-insensitive
/// substring of `port_name`.
pub fn find_template_for_port(port_name: &str) -> Option<ControllerTemplate> {
    let lower = port_name.to_lowercase();
    DYNAMIC_TEMPLATES
        .read()
        .ok()?
        .iter()
        .find(|t| {
            t.match_patterns
                .iter()
                .any(|pat| lower.contains(&pat.to_lowercase()))
        })
        .cloned()
}

// ============================================================================
// Setup helpers
// ============================================================================

/// Install the default mappings declared in a template into the engine state.
///
/// Skips any parameter that already has a mapping. Saves to disk once when done.
pub fn setup_template_default_mappings(template: &ControllerTemplate) {
    let existing = super::engine::with_midi_engine(|state| state.mappings.clone());

    let mut added = 0usize;

    for entry in &template.default_mappings {
        if existing
            .iter()
            .any(|m| m.parameter_id == entry.parameter_id)
        {
            log::debug!(
                "[MIDI Templates] Skipping '{}' - already mapped",
                entry.parameter_id
            );
            continue;
        }

        let note_mode = entry.note_mode.as_deref().and_then(|s| match s {
            "velocity" => Some(NoteMappingMode::Velocity),
            "trigger" => Some(NoteMappingMode::Trigger),
            other => {
                log::warn!(
                    "[MIDI Templates] Unknown note_mode '{}' for '{}', ignoring",
                    other,
                    entry.parameter_id
                );
                None
            }
        });

        let mapping = MidiMapping {
            parameter_id: entry.parameter_id.clone(),
            channel: entry.channel,
            cc_number: entry.cc_number,
            note_number: entry.note_number,
            note_mode,
            min_value: entry.min_value,
            max_value: entry.max_value,
            device_id: None,
        };

        super::engine::with_midi_engine(|state| {
            state.mappings.push(mapping);
        });

        log::debug!(
            "[MIDI Templates] Default mapping installed: '{}'",
            entry.parameter_id
        );
        added += 1;
    }

    if added > 0 {
        super::mappings::save_mappings_to_disk();
    }
}

/// Send startup LED commands declared in a template to the given output device.
pub fn send_template_startup_leds(template: &ControllerTemplate, device_id: &str) {
    for cmd in &template.startup_leds {
        if let Err(e) =
            super::output::send_note_on(Some(device_id), cmd.channel, cmd.note, cmd.velocity)
        {
            log::debug!(
                "[MIDI Templates] startup LED note_on failed (ch={} note={} vel={}): {}",
                cmd.channel,
                cmd.note,
                cmd.velocity,
                e
            );
        }
    }
}

// ============================================================================
// Integration hook
// ============================================================================

/// Check if a dynamic template matches `port_name`. If one does, install its
/// default mappings and return `true`. Called by the connection layer after a
/// device is opened when no static `ControllerProfile` matched.
pub fn find_and_setup_template(port_name: &str) -> bool {
    match find_template_for_port(port_name) {
        Some(template) => {
            setup_template_default_mappings(&template);
            true
        }
        None => false,
    }
}
