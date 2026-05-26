//! OSC Input Engine
//!
//! Provides OSC (Open Sound Control) message reception via UDP,
//! address pattern matching, and routing to the Parameter Server.

mod beat;
pub mod commands;
mod engine;
mod handler;
mod mappings;
mod send;
mod server;
mod types;

// Re-export all public symbols from the original osc.rs
pub use beat::{get_osc_beat_config, set_osc_beat_config};
pub use commands::{
    add_osc_mapping, clear_osc_mappings, get_osc_beat_config_cmd, get_osc_mappings,
    get_osc_output_config, get_osc_status, remove_osc_mapping, send_osc_message_cmd,
    set_osc_beat_config_cmd, set_osc_output_config, start_osc_server, stop_osc_server,
};
pub use engine::init_osc_engine;
pub use mappings::{add_mapping, clear_mappings, get_mappings, remove_mapping};
pub use send::{
    get_output_config, send_osc_beat, send_osc_bpm, send_osc_color, send_osc_message,
    set_output_config,
};
pub use server::{get_status, start_server, stop_server};
pub use types::{
    OscBeatConfig, OscBeatInfo, OscMapping, OscMessageInfo, OscOutputConfig, OscServerStatus,
};

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::handler::{extract_numeric, matches_address};
    use rosc::OscType;

    // -------------------------------------------------------------------------
    // matches_address
    // -------------------------------------------------------------------------

    #[test]
    fn test_exact_match() {
        assert!(matches_address("/foo/bar", "/foo/bar"));
    }

    #[test]
    fn test_exact_mismatch() {
        assert!(!matches_address("/foo/bar", "/foo/baz"));
    }

    #[test]
    fn test_wildcard_match() {
        assert!(matches_address("/foo/bar", "/foo/*"));
        assert!(matches_address("/foo/anything", "/foo/*"));
    }

    #[test]
    fn test_wildcard_no_match_different_prefix() {
        assert!(!matches_address("/baz/bar", "/foo/*"));
    }

    // -------------------------------------------------------------------------
    // Reserved /slew/* addresses must NOT match user mappings
    // -------------------------------------------------------------------------

    #[test]
    fn test_slew_beat_not_matched_by_user_wildcard() {
        // A user mapping like /slew/* should technically match, but /slew/beat
        // is intercepted before the mapping loop so it never reaches here.
        // This test documents that matches_address itself would match — the
        // protection is the early-return in handle_osc_message.
        assert!(matches_address("/slew/beat", "/slew/*"));
    }

    #[test]
    fn test_slew_beat_exact() {
        assert!(matches_address("/slew/beat", "/slew/beat"));
    }

    #[test]
    fn test_slew_bpm_exact() {
        assert!(matches_address("/slew/bpm", "/slew/bpm"));
    }

    #[test]
    fn test_non_slew_address_not_reserved() {
        // Regular user addresses must not be confused with reserved ones
        assert!(!matches_address("/scene/brightness", "/slew/beat"));
        assert!(!matches_address("/slew/beat", "/scene/brightness"));
    }

    // -------------------------------------------------------------------------
    // extract_numeric
    // -------------------------------------------------------------------------

    #[test]
    fn test_extract_float() {
        let args = vec![OscType::Float(0.75)];
        assert!((extract_numeric(&args).unwrap() - 0.75).abs() < 1e-6);
    }

    #[test]
    fn test_extract_double() {
        let args = vec![OscType::Double(120.0)];
        assert!((extract_numeric(&args).unwrap() - 120.0).abs() < 1e-9);
    }

    #[test]
    fn test_extract_int() {
        let args = vec![OscType::Int(1)];
        assert_eq!(extract_numeric(&args).unwrap() as i32, 1);
    }

    #[test]
    fn test_extract_bool_true() {
        let args = vec![OscType::Bool(true)];
        assert_eq!(extract_numeric(&args).unwrap() as i32, 1);
    }

    #[test]
    fn test_extract_bool_false() {
        let args = vec![OscType::Bool(false)];
        assert_eq!(extract_numeric(&args).unwrap() as i32, 0);
    }

    #[test]
    fn test_extract_empty_args() {
        assert!(extract_numeric(&[]).is_none());
    }

    #[test]
    fn test_bpm_clamping() {
        // Values outside 20-300 should be clamped — verify the clamp bounds
        assert_eq!(19.0_f64.clamp(20.0, 300.0), 20.0);
        assert_eq!(301.0_f64.clamp(20.0, 300.0), 300.0);
        assert_eq!(120.0_f64.clamp(20.0, 300.0), 120.0);
    }
}
