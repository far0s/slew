//! MIDI mapping import and export.

use serde::{Deserialize, Serialize};

use super::engine::with_midi_engine;
use super::types::MidiMapping;

// ============================================================================
// Types
// ============================================================================

/// Serialisable snapshot of MIDI mappings for export/import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiMappingExport {
    pub version: u32,
    /// Informational label for the source device (not used during import).
    pub device: Option<String>,
    /// ISO 8601 UTC timestamp of when the export was created.
    pub exported_at: String,
    pub mappings: Vec<MidiMapping>,
}

/// Controls how incoming mappings are merged with existing ones.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportMode {
    /// Clear all existing mappings, then insert the imported ones.
    Replace,
    /// Import all mappings, overwriting any existing entry with the same `parameter_id`.
    Merge,
    /// Import only mappings whose `parameter_id` is not already mapped.
    MergeSkipConflicts,
}

/// Summary returned after an import operation.
#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub replaced: usize,
    pub errors: Vec<String>,
}

// ============================================================================
// Helpers
// ============================================================================

/// Returns a basic ISO 8601 UTC timestamp string ("YYYY-MM-DDTHH:MM:SSZ")
/// using only `std::time`, to avoid a `chrono` dependency.
fn utc_timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Gregorian calendar arithmetic from Unix epoch.
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400; // days since 1970-01-01

    // Shift to a cycle starting from the year 0 for easier arithmetic.
    // 1970-01-01 is day 719_468 in the proleptic Gregorian calendar
    // (counting from 0000-03-01).
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z % 146_097; // day of era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // year of era [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day of year [0, 365]
    let mp = (5 * doy + 2) / 153; // month prime [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // day [1, 31]
    let mo = if mp < 10 { mp + 3 } else { mp - 9 }; // month [1, 12]
    let y = if mo <= 2 { y + 1 } else { y };

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

// ============================================================================
// Public API
// ============================================================================

/// Build an export snapshot from the current engine state.
///
/// If `device_filter` is `Some`, only mappings whose `device_id` matches the
/// filter value are included.
pub fn export_mappings(device_filter: Option<String>) -> MidiMappingExport {
    let all = with_midi_engine(|state| state.mappings.clone());

    let mappings = match &device_filter {
        Some(filter) => all
            .into_iter()
            .filter(|m| m.device_id.as_deref() == Some(filter.as_str()))
            .collect(),
        None => all,
    };

    MidiMappingExport {
        version: 1,
        device: device_filter,
        exported_at: utc_timestamp(),
        mappings,
    }
}

/// Apply an exported snapshot to the engine according to `mode`.
///
/// All mutations are batched inside a single `with_midi_engine` call, then
/// `save_mappings_to_disk` and `emit_mappings_changed` are called once.
pub fn import_mappings(export: MidiMappingExport, mode: ImportMode) -> ImportResult {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut replaced = 0usize;
    let errors: Vec<String> = Vec::new();

    with_midi_engine(|state| match mode {
        ImportMode::Replace => {
            state.mappings.clear();
            for mapping in export.mappings {
                state.mappings.push(mapping);
                imported += 1;
            }
        }
        ImportMode::Merge => {
            for mapping in export.mappings {
                let existed = {
                    let pos = state
                        .mappings
                        .iter()
                        .position(|m| m.parameter_id == mapping.parameter_id);
                    if let Some(idx) = pos {
                        state.mappings.remove(idx);
                        true
                    } else {
                        false
                    }
                };
                state.mappings.push(mapping);
                if existed {
                    replaced += 1;
                } else {
                    imported += 1;
                }
            }
        }
        ImportMode::MergeSkipConflicts => {
            for mapping in export.mappings {
                let exists = state
                    .mappings
                    .iter()
                    .any(|m| m.parameter_id == mapping.parameter_id);
                if exists {
                    skipped += 1;
                } else {
                    state.mappings.push(mapping);
                    imported += 1;
                }
            }
        }
    });

    super::mappings::save_mappings_to_disk();
    super::events::emit_mappings_changed();

    ImportResult {
        imported,
        skipped,
        replaced,
        errors,
    }
}
