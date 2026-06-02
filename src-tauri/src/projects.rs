//! Project save/load — captures and restores full session state.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    audio, hid, midi, modulation, osc,
    parameter_store::{
        save_parameters_to_disk, save_slots_to_disk, with_parameter_store, with_slot_state,
        Parameter, SlotState,
    },
};

// ============================================================================
// Types
// ============================================================================

const AUTOSAVE_NAME: &str = "__autosave__";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSnapshot {
    pub version: u32,
    pub name: String,
    pub created_at: String,
    pub slot_state: SlotState,
    pub parameters: Vec<Parameter>,
    pub midi_mappings: Vec<midi::MidiMapping>,
    pub osc_mappings: Vec<osc::OscMapping>,
    pub audio_mappings: Vec<audio::AudioMapping>,
    pub hid_mappings: Vec<hid::HidMapping>,
    pub modulation_state: modulation::ModulationState,
    /// Opaque JSON blob from the frontend (effects chain, active sidebar tab, etc.)
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub frontend_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub created_at: String,
    pub is_autosave: bool,
    /// Sketch IDs per slot index (8 slots, null = empty)
    pub sketches: Vec<Option<String>>,
}

// ============================================================================
// Helpers
// ============================================================================

fn slot_state_to_sketches(slot_state: &SlotState) -> Vec<Option<String>> {
    (0..8)
        .map(|i| {
            slot_state
                .slots
                .iter()
                .find(|s| s.index == i)
                .map(|s| s.sketch_id.clone())
        })
        .collect()
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if "/\\:*?\"<>|\0".contains(c) { '_' } else { c })
        .collect()
}

fn utc_timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400;
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z % 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

fn projects_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("projects");
        dir
    })
}

fn project_path(app: &AppHandle, name: &str) -> Option<PathBuf> {
    projects_dir(app).map(|mut dir| {
        dir.push(format!("{}.json", sanitize_name(name)));
        dir
    })
}

// ============================================================================
// Snapshot capture & restore
// ============================================================================

pub fn capture_snapshot(name: &str) -> ProjectSnapshot {
    let slot_state = with_slot_state(|s| s.clone());
    let parameters = with_parameter_store(|store| store.get_all());
    let midi_mappings = midi::get_mappings();
    let osc_mappings = osc::get_mappings();
    let audio_mappings = audio::get_mappings();
    let hid_mappings = hid::get_mappings();
    let modulation_state = modulation::get_modulation_state();

    ProjectSnapshot {
        version: 1,
        name: name.to_string(),
        created_at: utc_timestamp(),
        slot_state,
        parameters,
        midi_mappings,
        osc_mappings,
        audio_mappings,
        hid_mappings,
        modulation_state,
        frontend_state: None,
    }
}

pub fn restore_snapshot(snapshot: ProjectSnapshot, app: &AppHandle) {
    // 1. Parameters — snap value = target (no animation on restore)
    with_parameter_store(|store| {
        store.parameters.clear();
        for mut p in snapshot.parameters.iter().cloned() {
            p.value = p.target;
            store.parameters.insert(p.id.clone(), p);
        }
    });
    save_parameters_to_disk(app);
    for p in &snapshot.parameters {
        let snapped = Parameter { value: p.target, ..p.clone() };
        let _ = app.emit("parameter_changed", &snapped);
    }

    // 2. Slot state
    with_slot_state(|s| {
        *s = snapshot.slot_state.clone();
    });
    save_slots_to_disk(app);
    let _ = app.emit("all_slots_changed", &snapshot.slot_state.slots);

    // 3. MIDI mappings
    midi::restore_bulk(snapshot.midi_mappings);
    let _ = app.emit("midi_mappings_changed", &midi::get_mappings());

    // 4. OSC mappings
    osc::restore_bulk(snapshot.osc_mappings);
    let _ = app.emit("osc_mappings_changed", &osc::get_mappings());

    // 5. Audio mappings
    audio::restore_bulk(snapshot.audio_mappings);
    let _ = app.emit("audio_mappings_changed", &audio::get_mappings());

    // 6. HID mappings
    hid::restore_bulk(snapshot.hid_mappings);
    let _ = app.emit("hid_mappings_changed", &hid::get_mappings());

    // 7. Modulation
    modulation::restore_state(snapshot.modulation_state.clone());
    modulation::save_modulation_state_to_disk(app);
    let _ = app.emit("modulation_lfos_changed", &snapshot.modulation_state.lfos);
    let _ = app.emit("modulation_targets_changed", &snapshot.modulation_state.targets);
    let _ = app.emit("modulation_audio_changed", &snapshot.modulation_state.audio_modulations);

    // 8. Signal project restored — payload carries frontend_state so callers can restore
    //    effects chain, active sidebar tab, etc. without a separate round-trip.
    let _ = app.emit("project_restored", &snapshot.frontend_state);
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub fn save_project(
    app: AppHandle,
    name: String,
    frontend_state: Option<String>,
) -> Result<ProjectInfo, String> {
    let dir = projects_dir(&app).ok_or("Failed to resolve projects directory")?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create projects dir: {e}"))?;

    let mut snapshot = capture_snapshot(&name);
    snapshot.frontend_state = frontend_state;
    let created_at = snapshot.created_at.clone();
    let sketches = slot_state_to_sketches(&snapshot.slot_state);
    let path = project_path(&app, &name).ok_or("Failed to resolve project path")?;
    let json = serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("Failed to write project: {e}"))?;

    Ok(ProjectInfo {
        name,
        created_at,
        is_autosave: false,
        sketches,
    })
}

#[tauri::command]
pub fn load_project(app: AppHandle, name: String) -> Result<(), String> {
    let path = project_path(&app, &name).ok_or("Failed to resolve project path")?;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read project: {e}"))?;
    let snapshot: ProjectSnapshot =
        serde_json::from_slice(&bytes).map_err(|e| format!("Failed to parse project: {e}"))?;
    restore_snapshot(snapshot, &app);
    Ok(())
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Vec<ProjectInfo> {
    let dir = match projects_dir(&app) {
        Some(d) => d,
        None => return vec![],
    };
    if !dir.exists() {
        return vec![];
    }
    let mut infos = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(bytes) = fs::read(&path) {
                if let Ok(snap) = serde_json::from_slice::<ProjectSnapshot>(&bytes) {
                    let is_autosave = snap.name == AUTOSAVE_NAME;
                    let sketches = slot_state_to_sketches(&snap.slot_state);
                    infos.push(ProjectInfo {
                        name: snap.name,
                        created_at: snap.created_at,
                        is_autosave,
                        sketches,
                    });
                }
            }
        }
    }
    infos.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    infos
}

#[tauri::command]
pub fn delete_project(app: AppHandle, name: String) -> Result<(), String> {
    let path = project_path(&app, &name).ok_or("Failed to resolve project path")?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Failed to delete project: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_project(app: AppHandle, old_name: String, new_name: String) -> Result<ProjectInfo, String> {
    let old_path = project_path(&app, &old_name).ok_or("Failed to resolve old path")?;
    let bytes = fs::read(&old_path).map_err(|e| format!("Failed to read project: {e}"))?;
    let mut snapshot: ProjectSnapshot =
        serde_json::from_slice(&bytes).map_err(|e| format!("Failed to parse project: {e}"))?;
    snapshot.name = new_name.clone();
    let new_path = project_path(&app, &new_name).ok_or("Failed to resolve new path")?;
    if new_path.exists() && old_path != new_path {
        return Err(format!("A project named '{}' already exists", new_name));
    }
    let json = serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?;
    fs::write(&new_path, json).map_err(|e| format!("Failed to write renamed project: {e}"))?;
    if old_path != new_path {
        let _ = fs::remove_file(old_path);
    }
    let sketches = slot_state_to_sketches(&snapshot.slot_state);
    Ok(ProjectInfo {
        name: new_name,
        created_at: snapshot.created_at,
        is_autosave: false,
        sketches,
    })
}

// ============================================================================
// Export / Import (native file dialog)
// ============================================================================

#[tauri::command]
pub async fn export_project(app: AppHandle, name: String) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let path = project_path(&app, &name).ok_or("Failed to resolve project path")?;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read project: {e}"))?;

    let save_path = app
        .dialog()
        .file()
        .set_file_name(format!("{}.slew.json", sanitize_name(&name)))
        .add_filter("Slew Project", &["json"])
        .blocking_save_file();

    match save_path {
        Some(dest) => {
            let dest_path = dest.into_path().map_err(|e| format!("Invalid destination path: {e}"))?;
            fs::write(dest_path, bytes).map_err(|e| format!("Failed to export: {e}"))?;
            Ok(())
        }
        None => Ok(()), // user cancelled
    }
}

#[tauri::command]
pub async fn import_project(app: AppHandle) -> Result<Option<ProjectInfo>, String> {
    use tauri_plugin_dialog::DialogExt;

    let selected = app
        .dialog()
        .file()
        .add_filter("Slew Project", &["json"])
        .blocking_pick_file();

    match selected {
        Some(src) => {
            let src_path = src.into_path().map_err(|e| format!("Invalid source path: {e}"))?;
            let bytes = fs::read(&src_path).map_err(|e| format!("Failed to read file: {e}"))?;
            let mut snapshot: ProjectSnapshot =
                serde_json::from_slice(&bytes).map_err(|e| format!("Invalid project file: {e}"))?;

            let dir = projects_dir(&app).ok_or("Failed to resolve projects dir")?;
            fs::create_dir_all(&dir).map_err(|e| format!("Failed to create projects dir: {e}"))?;

            let dest_path = project_path(&app, &snapshot.name)
                .ok_or("Failed to resolve destination path")?;
            let final_name = if dest_path.exists() {
                format!("{} (imported)", snapshot.name)
            } else {
                snapshot.name.clone()
            };
            snapshot.name = final_name.clone();

            let final_path = project_path(&app, &final_name)
                .ok_or("Failed to resolve final path")?;
            let json = serde_json::to_vec_pretty(&snapshot).map_err(|e| e.to_string())?;
            fs::write(final_path, json).map_err(|e| format!("Failed to write project: {e}"))?;

            let sketches = slot_state_to_sketches(&snapshot.slot_state);
            Ok(Some(ProjectInfo {
                name: final_name,
                created_at: snapshot.created_at,
                is_autosave: false,
                sketches,
            }))
        }
        None => Ok(None), // user cancelled
    }
}

// ============================================================================
// Auto-save
// ============================================================================

pub fn start_autosave_loop(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(30));
            let Some(dir) = projects_dir(&app) else {
                log::warn!("[Projects] Cannot resolve config dir, skipping autosave");
                continue;
            };
            if let Err(e) = fs::create_dir_all(&dir) {
                log::warn!("[Projects] Failed to create projects dir for autosave: {e}");
                continue;
            }
            let snapshot = capture_snapshot(AUTOSAVE_NAME);
            if let Some(path) = project_path(&app, AUTOSAVE_NAME) {
                match serde_json::to_vec_pretty(&snapshot) {
                    Ok(json) => {
                        if let Err(e) = fs::write(path, json) {
                            log::warn!("[Projects] Autosave failed: {e}");
                        } else {
                            log::debug!("[Projects] Autosaved");
                        }
                    }
                    Err(e) => log::warn!("[Projects] Autosave serialize failed: {e}"),
                }
            }
        }
    });
}
