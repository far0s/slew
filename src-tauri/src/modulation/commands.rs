//! Tauri command handlers for the modulation engine

use super::audio_mod::{
    add_audio_modulation, clear_audio_modulations, get_audio_modulations,
    remove_audio_modulation,
};
use super::engine::{get_modulation_state, is_parameter_modulated};
use super::lfos::{add_lfo, clear_lfos, get_lfo, get_lfos, remove_lfo, update_lfo};
use super::targets::{add_target, clear_targets, get_targets, remove_target, update_base_value};
use super::types::{AudioModulation, LfoSource, ModulationState, ModulationTarget};

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub fn set_manual_bpm(bpm: Option<f64>) {
    let clamped = bpm.map(|b| b.clamp(20.0, 300.0));
    crate::bpm::report_manual_bpm(clamped);
    if let Some(b) = clamped {
        crate::osc::send_osc_bpm(b);
        crate::osc::send_osc_beat();
    }
}

#[tauri::command]
pub fn get_modulation_lfos() -> Vec<LfoSource> {
    get_lfos()
}

#[tauri::command]
pub fn get_modulation_lfo(id: String) -> Option<LfoSource> {
    get_lfo(&id)
}

#[tauri::command]
pub fn add_modulation_lfo(lfo: LfoSource) -> LfoSource {
    add_lfo(lfo)
}

#[tauri::command]
pub fn update_modulation_lfo(lfo: LfoSource) -> Option<LfoSource> {
    update_lfo(lfo)
}

#[tauri::command]
pub fn remove_modulation_lfo(id: String) -> bool {
    remove_lfo(&id)
}

#[tauri::command]
pub fn clear_modulation_lfos() {
    clear_lfos()
}

#[tauri::command]
pub fn get_modulation_targets() -> Vec<ModulationTarget> {
    get_targets()
}

#[tauri::command]
pub fn add_modulation_target(target: ModulationTarget) -> ModulationTarget {
    add_target(target)
}

#[tauri::command]
pub fn remove_modulation_target(id: String) -> bool {
    remove_target(&id)
}

#[tauri::command]
pub fn clear_modulation_targets() {
    clear_targets()
}

#[tauri::command]
pub fn update_modulation_base_value(parameter_id: String, value: f64) {
    update_base_value(&parameter_id, value)
}

#[tauri::command]
pub fn get_modulation_audio_modulations() -> Vec<AudioModulation> {
    get_audio_modulations()
}

#[tauri::command]
pub fn add_modulation_audio_modulation(audio_mod: AudioModulation) -> AudioModulation {
    add_audio_modulation(audio_mod)
}

#[tauri::command]
pub fn remove_modulation_audio_modulation(id: String) -> bool {
    remove_audio_modulation(&id)
}

#[tauri::command]
pub fn clear_modulation_audio_modulations() {
    clear_audio_modulations()
}

#[tauri::command]
pub fn get_full_modulation_state() -> ModulationState {
    get_modulation_state()
}

#[tauri::command]
pub fn is_parameter_modulated_cmd(parameter_id: String) -> bool {
    is_parameter_modulated(&parameter_id)
}
