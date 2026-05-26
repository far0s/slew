#[cfg(target_os = "macos")]
pub mod syphon;
#[cfg(target_os = "windows")]
pub mod spout;
pub mod ndi;

#[cfg(target_os = "macos")]
pub use syphon::SyphonBackend;
#[cfg(target_os = "windows")]
pub use spout::SpoutBackend;
pub use ndi::NdiBackend;
