use std::{collections::HashMap, fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub name: String,
    pub sketch_id: String,
    pub parameters: HashMap<String, f64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub thumbnail: Option<String>,
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if c == '/' || c == '\\' || c == '\0' { '_' } else { c })
        .collect()
}

fn presets_dir(app: &AppHandle, sketch_id: &str) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("presets");
        dir.push(sanitize_name(sketch_id));
        dir
    })
}

#[tauri::command]
pub fn list_presets_for_sketch(app: AppHandle, sketch_id: String) -> Vec<Preset> {
    let dir = match presets_dir(&app, &sketch_id) {
        Some(d) => d,
        None => return vec![],
    };

    if !dir.exists() {
        return vec![];
    }

    let mut presets = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(bytes) = fs::read(&path) {
                    if let Ok(preset) = serde_json::from_slice::<Preset>(&bytes) {
                        presets.push(preset);
                    }
                }
            }
        }
    }

    presets.sort_by(|a, b| a.name.cmp(&b.name));
    presets
}

#[tauri::command]
pub fn save_preset(
    app: AppHandle,
    sketch_id: String,
    name: String,
    parameters: HashMap<String, f64>,
    thumbnail: Option<String>,
) -> Result<Preset, String> {
    let dir = presets_dir(&app, &sketch_id).ok_or("Failed to resolve presets directory")?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create presets dir: {e}"))?;

    let preset = Preset {
        name: name.clone(),
        sketch_id: sketch_id.clone(),
        parameters,
        thumbnail,
    };

    let filename = format!("{}.json", sanitize_name(&name));
    let path = dir.join(filename);
    let json = serde_json::to_vec_pretty(&preset).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("Failed to write preset: {e}"))?;

    Ok(preset)
}

#[tauri::command]
pub fn load_preset(app: AppHandle, sketch_id: String, name: String) -> Result<Preset, String> {
    let dir = presets_dir(&app, &sketch_id).ok_or("Failed to resolve presets directory")?;
    let filename = format!("{}.json", sanitize_name(&name));
    let path = dir.join(filename);

    let bytes = fs::read(&path).map_err(|e| format!("Failed to read preset: {e}"))?;
    serde_json::from_slice::<Preset>(&bytes).map_err(|e| format!("Failed to parse preset: {e}"))
}

#[tauri::command]
pub fn delete_preset(app: AppHandle, sketch_id: String, name: String) -> Result<(), String> {
    let dir = presets_dir(&app, &sketch_id).ok_or("Failed to resolve presets directory")?;
    let filename = format!("{}.json", sanitize_name(&name));
    let path = dir.join(filename);

    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Failed to delete preset: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn rename_preset(
    app: AppHandle,
    sketch_id: String,
    old_name: String,
    new_name: String,
) -> Result<Preset, String> {
    let dir = presets_dir(&app, &sketch_id).ok_or("Failed to resolve presets directory")?;

    let old_path = dir.join(format!("{}.json", sanitize_name(&old_name)));
    let bytes = fs::read(&old_path).map_err(|e| format!("Failed to read preset: {e}"))?;
    let mut preset: Preset =
        serde_json::from_slice(&bytes).map_err(|e| format!("Failed to parse preset: {e}"))?;

    preset.name = new_name.clone();

    let new_path = dir.join(format!("{}.json", sanitize_name(&new_name)));
    let json = serde_json::to_vec_pretty(&preset).map_err(|e| e.to_string())?;
    fs::write(&new_path, json).map_err(|e| format!("Failed to write renamed preset: {e}"))?;

    if old_path != new_path {
        let _ = fs::remove_file(old_path);
    }

    Ok(preset)
}
