use std::time::Duration;

use tauri::{AppHandle, Manager, RunEvent};

pub mod audio;
pub mod bpm;
pub mod commands;
pub mod common;
pub mod config;
pub mod frame_distribution;
pub mod hid;
pub mod link;
pub mod midi;
pub mod midi_clock;
pub mod midi_clock_out;
pub mod modulation;
pub mod osc;
pub mod parameter_store;
pub mod presets;
#[cfg(target_os = "windows")]
pub mod spout;
#[cfg(target_os = "macos")]
pub mod syphon;
pub mod updater;
pub mod video_out;
pub mod window_manager;
pub mod wled;

use parameter_store::{
    ensure_global_fade_parameters, ensure_slot_audio_reactivity, load_parameters_from_disk,
    load_slots_from_disk, start_parameter_tick_loop,
};

// Re-export parameter_store items at crate root so existing `crate::` references
// in submodules (midi, osc, audio, modulation) continue to resolve without changes.
pub use parameter_store::{
    extract_slot_index, with_parameter_store, with_slot_state, Parameter, ParameterCurve,
    ParameterId, ParameterStore, SlotInfo, SlotState,
};

// =============================================================================
// App Entry Point
// =============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    log::info!("[App] Starting Slew");

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.handle().plugin(tauri_plugin_mcp_bridge::init())?;
            load_parameters_from_disk(app);
            load_slots_from_disk(app);

            // Ensure audio_reactivity parameters exist for all 8 slots
            // These are slot-level parameters that gate audio mappings
            for slot_index in 0..8 {
                ensure_slot_audio_reactivity(&app.handle(), slot_index);
            }

            // Initialize global fade time parameters
            ensure_global_fade_parameters(&app.handle());

            // Initialize window manager (health monitoring, etc.)
            window_manager::init_window_manager(app.handle());

            // Build and set the application menu
            match window_manager::build_app_menu(app.handle()) {
                Ok(menu) => {
                    if let Err(e) = app.set_menu(menu) {
                        log::error!("[App] Failed to set menu: {}", e);
                    }
                }
                Err(e) => {
                    log::error!("[App] Failed to build menu: {}", e);
                }
            }

            // Initialize all engines (they log internally at debug level)
            midi::load_templates_from_disk();
            midi::init_midi_engine(app.handle().clone());
            osc::init_osc_engine(app.handle().clone());
            bpm::init_bpm_source(app.handle().clone());
            audio::init_audio_engine(app.handle().clone());
            hid::init_hid_engine(app.handle());
            modulation::init_modulation_engine(app.handle().clone());
            video_out::init_video_output(app.handle().clone());
            frame_distribution::init_frame_distribution(app.handle().clone());
            wled::init();

            // Log startup summary
            let video_backends = video_out::get_available_backends();
            log::info!(
                "[App] Initialized: MIDI, OSC, Audio, HID, Modulation, WindowManager, Video ({})",
                if video_backends.is_empty() {
                    "no backends".to_string()
                } else {
                    video_backends.join(", ")
                }
            );

            updater::init_updater(app.handle().clone());
            midi_clock::init_midi_clock_engine(app.handle().clone());
            midi_clock_out::init_midi_clock_out_engine(app.handle().clone());
            link::init_link_engine(app.handle().clone());
            start_parameter_tick_loop(app.handle().clone());

            // Window placement - spawn with delay to ensure windows are ready
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                // Wait for windows to be fully initialized
                std::thread::sleep(Duration::from_millis(100));
                setup_window_placement(&app_handle);
            });

            Ok(())
        })
        // Handle menu events
        .on_menu_event(|app, event| {
            window_manager::handle_menu_event(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            updater::check_for_update,
            updater::install_update,
            commands::forward_controls_event,
            commands::get_parameters,
            commands::get_parameter,
            commands::set_parameter,
            commands::set_parameter_with_transition,
            commands::set_color_channels,
            commands::clear_parameters,
            commands::set_slot_pairing,
            commands::set_all_slots,
            commands::get_slot_state,
            commands::initialize_slot_parameters,
            commands::reset_slot_parameters,
            // Window Manager
            window_manager::restart_controls_window,
            window_manager::restart_renderer_window,
            window_manager::toggle_window_visibility,
            window_manager::toggle_fullscreen,
            window_manager::focus_window,
            window_manager::get_window_status,
            window_manager::window_heartbeat,
            window_manager::get_window_restart_log_path,
            // MIDI Input
            midi::commands::list_midi_devices,
            midi::commands::open_midi_device,
            midi::commands::close_midi_device,
            midi::commands::start_midi_learn,
            midi::commands::cancel_midi_learn,
            midi::commands::get_midi_learn_state,
            midi::commands::get_midi_mappings,
            midi::commands::set_midi_mapping,
            midi::commands::remove_midi_mapping,
            midi::commands::clear_midi_mappings,
            midi::commands::set_midi_auto_reconnect,
            midi::commands::get_midi_auto_reconnect,
            midi::commands::clear_midi_auto_reconnect_devices,
            // MIDI Output
            midi::commands::list_midi_output_devices,
            midi::commands::open_midi_output_device,
            midi::commands::close_midi_output_device,
            midi::commands::send_midi_cc,
            midi::commands::send_midi_note_on,
            midi::commands::send_midi_note_off,
            midi::commands::set_midi_output_config,
            midi::commands::get_midi_output_config,
            midi::commands::trigger_midi_feedback,
            midi::commands::get_midi_pickup_states,
            // MIDI Import/Export & Templates
            midi::commands::export_midi_mappings,
            midi::commands::import_midi_mappings,
            midi::commands::list_controller_templates,
            midi::commands::import_controller_template,
            midi::commands::delete_controller_template,
            midi::commands::reload_controller_templates,
            // OSC
            osc::commands::start_osc_server,
            osc::commands::stop_osc_server,
            osc::commands::get_osc_status,
            osc::commands::get_osc_mappings,
            osc::commands::add_osc_mapping,
            osc::commands::remove_osc_mapping,
            osc::commands::clear_osc_mappings,
            osc::commands::get_osc_output_config,
            osc::commands::set_osc_output_config,
            osc::commands::send_osc_message_cmd,
            osc::commands::get_osc_beat_config_cmd,
            osc::commands::set_osc_beat_config_cmd,
            commands::notify_beat,
            commands::send_color_osc,
            // Audio
            audio::commands::list_audio_devices,
            audio::commands::start_audio_capture,
            audio::commands::stop_audio_capture,
            audio::commands::get_audio_status,
            audio::commands::get_audio_mappings,
            audio::commands::add_audio_mapping,
            audio::commands::remove_audio_mapping,
            audio::commands::clear_audio_mappings,
            audio::commands::set_audio_mapping_enabled,
            audio::commands::set_audio_auto_reconnect,
            audio::commands::get_audio_auto_reconnect,
            audio::commands::set_beat_sensitivity_command,
            // HID
            hid::commands::list_hid_devices,
            hid::commands::list_supported_hid_devices,
            hid::commands::connect_hid_device,
            hid::commands::connect_hid_megalodon,
            hid::commands::disconnect_hid_device,
            hid::commands::get_hid_status,
            hid::commands::get_hid_mappings,
            hid::commands::add_hid_mapping,
            hid::commands::remove_hid_mapping,
            hid::commands::clear_hid_mappings,
            hid::commands::setup_default_hid_mappings,
            hid::commands::set_hid_auto_connect,
            hid::commands::get_hid_auto_connect,
            // Modulation
            modulation::commands::get_modulation_lfos,
            modulation::commands::get_modulation_lfo,
            modulation::commands::add_modulation_lfo,
            modulation::commands::update_modulation_lfo,
            modulation::commands::remove_modulation_lfo,
            modulation::commands::clear_modulation_lfos,
            modulation::commands::get_modulation_targets,
            modulation::commands::add_modulation_target,
            modulation::commands::remove_modulation_target,
            modulation::commands::clear_modulation_targets,
            modulation::commands::update_modulation_base_value,
            modulation::commands::get_modulation_audio_modulations,
            modulation::commands::add_modulation_audio_modulation,
            modulation::commands::remove_modulation_audio_modulation,
            modulation::commands::clear_modulation_audio_modulations,
            modulation::commands::get_full_modulation_state,
            modulation::commands::is_parameter_modulated_cmd,
            modulation::commands::set_manual_bpm,
            // MIDI Clock input
            midi_clock::list_midi_clock_ports_cmd,
            midi_clock::connect_midi_clock_cmd,
            midi_clock::disconnect_midi_clock_cmd,
            midi_clock::get_midi_clock_status_cmd,
            midi_clock::set_midi_clock_phase_offset_cmd,
            // MIDI Clock output
            midi_clock_out::enable_midi_clock_out_cmd,
            midi_clock_out::disable_midi_clock_out_cmd,
            midi_clock_out::get_midi_clock_out_status_cmd,
            midi_clock_out::list_midi_clock_out_ports_cmd,
            // Ableton Link
            link::enable_link_cmd,
            link::get_link_status_cmd,
            // BPM source
            bpm::get_active_bpm_source,
            // Video Output
            video_out::commands::list_video_backends,
            video_out::commands::get_video_backend_status,
            video_out::commands::init_video_backend,
            video_out::commands::shutdown_video_backend,
            video_out::commands::publish_video_frame,
            video_out::commands::publish_video_frame_binary,
            // Frame Distribution (Preview Streaming)
            frame_distribution::distribute_frame,
            frame_distribution::get_frame_distribution_config,
            frame_distribution::set_frame_distribution_config,
            frame_distribution::set_frame_distribution_enabled,
            frame_distribution::get_frame_distribution_stats,
            frame_distribution::get_buffer_pool_stats,
            // WLED
            wled::get_wled_config,
            wled::set_wled_config,
            wled::test_wled_connection,
            wled::push_wled_color,
            // Frame capture dev tool
            commands::write_file_to_downloads,
            // Presets
            presets::list_presets_for_sketch,
            presets::save_preset,
            presets::load_preset,
            presets::delete_preset,
            presets::rename_preset,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::Exit = event {
                log::info!("[App] Exit event received, cleaning up...");
                midi::cleanup_midi();
                log::info!("[App] Cleanup complete, exiting");
            }
        });
}

/// Place Controls on primary monitor, Renderer on largest secondary (or primary if none).
/// In dev mode, Renderer is centered on target monitor. In production, both go fullscreen.
///
/// Called with a delay to ensure windows are fully initialized.
fn setup_window_placement(app_handle: &AppHandle) {
    let is_dev = cfg!(debug_assertions);

    let primary_monitor = match app_handle.primary_monitor().ok().flatten() {
        Some(m) => m,
        None => return,
    };

    // Controls → primary monitor
    if let Some(window) = app_handle.get_webview_window("controls") {
        let _ = window.set_position(*primary_monitor.position());
        let _ = window.set_size(*primary_monitor.size());
        if !is_dev {
            let _ = window.set_fullscreen(true);
        }
    }

    // Find largest secondary monitor
    let all_monitors = app_handle.available_monitors().unwrap_or_default();
    let secondary = all_monitors
        .into_iter()
        .filter(|m| {
            m.position() != primary_monitor.position() || m.size() != primary_monitor.size()
        })
        .max_by_key(|m| {
            let size = m.size();
            size.width as i64 * size.height as i64
        });

    // Renderer → secondary or primary
    if let Some(window) = app_handle.get_webview_window("renderer") {
        let target = secondary.as_ref().unwrap_or(&primary_monitor);
        let monitor_pos = target.position();
        let monitor_size = target.size();
        let monitor_scale = target.scale_factor();

        if is_dev {
            // In dev mode, ensure window is at least 1920x1080 (scaled for monitor DPI)
            let min_width = (1920.0 * monitor_scale) as u32;
            let min_height = (1080.0 * monitor_scale) as u32;

            // Set size first to ensure proper dimensions
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: min_width,
                height: min_height,
            }));

            // Two-step positioning: move to target monitor first (so macOS updates the
            // window's scale factor), then center it.
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: monitor_pos.x,
                y: monitor_pos.y,
            }));

            // Let window manager process the move and size update
            std::thread::sleep(std::time::Duration::from_millis(50));

            // Center the window on the target monitor
            let center_x = monitor_pos.x + ((monitor_size.width as i32 - min_width as i32) / 2);
            let center_y = monitor_pos.y + ((monitor_size.height as i32 - min_height as i32) / 2);

            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: center_x,
                y: center_y,
            }));
        } else {
            let _ = window.set_position(*monitor_pos);
            let _ = window.set_size(*monitor_size);
            let _ = window.set_fullscreen(true);
        }
    }
}
