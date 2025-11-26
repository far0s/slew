//! Syphon Native Bindings for macOS
//!
//! This module provides Rust bindings to the Syphon framework for sharing
//! video frames with other applications on macOS.
//!
//! ## Architecture
//!
//! Since Syphon requires an OpenGL context and we're receiving raw pixel data
//! from WebGL, we:
//! 1. Load Syphon.framework dynamically at runtime
//! 2. Create a headless OpenGL context (CGL)
//! 3. Create a texture and upload pixel data to it
//! 4. Publish the texture via SyphonOpenGLServer
//!
//! ## Safety
//!
//! This module uses unsafe code to interact with:
//! - Core OpenGL (CGL) for context management
//! - OpenGL for texture operations
//! - Objective-C runtime for Syphon framework
//! - Dynamic library loading (dlopen)

#![cfg(target_os = "macos")]

use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::{msg_send, Encode, Encoding, RefEncode};
use std::ffi::{c_void, CStr, CString};
use std::path::PathBuf;
use std::ptr;
use std::sync::{Mutex, Once};

// ============================================================================
// OpenGL / CGL Types and Constants
// ============================================================================

/// Opaque CGL context type
#[repr(C)]
pub struct _CGLContextObject {
    _private: [u8; 0],
}
pub type CGLContextObj = *mut _CGLContextObject;

// Implement Encode traits for CGL types so they can be passed via msg_send
unsafe impl RefEncode for _CGLContextObject {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Encoding::Struct("_CGLContextObject", &[]));
}

/// Opaque CGL pixel format type
#[repr(C)]
pub struct _CGLPixelFormatObject {
    _private: [u8; 0],
}
pub type CGLPixelFormatObj = *mut _CGLPixelFormatObject;

unsafe impl RefEncode for _CGLPixelFormatObject {
    const ENCODING_REF: Encoding =
        Encoding::Pointer(&Encoding::Struct("_CGLPixelFormatObject", &[]));
}

/// CGL error type
pub type CGLError = i32;

/// CGL pixel format attributes
pub type CGLPixelFormatAttribute = i32;

// CGL pixel format attribute constants
const K_CGL_PFA_ACCELERATED: CGLPixelFormatAttribute = 73;
const K_CGL_PFA_ALLOW_OFFLINE_RENDERERS: CGLPixelFormatAttribute = 96;
const K_CGL_PFA_COLOR_SIZE: CGLPixelFormatAttribute = 8;
const K_CGL_PFA_DEPTH_SIZE: CGLPixelFormatAttribute = 12;
const K_CGL_PFA_OPENGL_PROFILE: CGLPixelFormatAttribute = 99;
const K_CGL_OPENGL_PROFILE_LEGACY: CGLPixelFormatAttribute = 0x1000;

// OpenGL constants
const GL_TEXTURE_RECTANGLE: u32 = 0x84F5;
const GL_RGBA: u32 = 0x1908;
const GL_RGBA8: u32 = 0x8058;
const GL_UNSIGNED_BYTE: u32 = 0x1401;
const GL_TEXTURE_MIN_FILTER: u32 = 0x2801;
const GL_TEXTURE_MAG_FILTER: u32 = 0x2800;
const GL_LINEAR: i32 = 0x2601;
const GL_TEXTURE_WRAP_S: u32 = 0x2802;
const GL_TEXTURE_WRAP_T: u32 = 0x2803;
const GL_CLAMP_TO_EDGE: i32 = 0x812F;
const GL_UNPACK_ALIGNMENT: u32 = 0x0CF5;

// ============================================================================
// External Function Declarations
// ============================================================================

#[link(name = "OpenGL", kind = "framework")]
extern "C" {
    fn CGLChoosePixelFormat(
        attribs: *const CGLPixelFormatAttribute,
        pix: *mut CGLPixelFormatObj,
        npix: *mut i32,
    ) -> CGLError;

    fn CGLCreateContext(
        pix: CGLPixelFormatObj,
        share: CGLContextObj,
        ctx: *mut CGLContextObj,
    ) -> CGLError;

    fn CGLDestroyPixelFormat(pix: CGLPixelFormatObj) -> CGLError;

    fn CGLSetCurrentContext(ctx: CGLContextObj) -> CGLError;

    fn CGLGetCurrentContext() -> CGLContextObj;

    fn CGLDestroyContext(ctx: CGLContextObj) -> CGLError;

    fn CGLLockContext(ctx: CGLContextObj) -> CGLError;

    fn CGLUnlockContext(ctx: CGLContextObj) -> CGLError;

    fn glGenTextures(n: i32, textures: *mut u32);
    fn glDeleteTextures(n: i32, textures: *const u32);
    fn glBindTexture(target: u32, texture: u32);
    fn glTexImage2D(
        target: u32,
        level: i32,
        internalformat: i32,
        width: i32,
        height: i32,
        border: i32,
        format: u32,
        typ: u32,
        data: *const c_void,
    );
    fn glTexSubImage2D(
        target: u32,
        level: i32,
        xoffset: i32,
        yoffset: i32,
        width: i32,
        height: i32,
        format: u32,
        typ: u32,
        data: *const c_void,
    );
    fn glTexParameteri(target: u32, pname: u32, param: i32);
    fn glPixelStorei(pname: u32, param: i32);
    fn glGetError() -> u32;
    fn glFlush();
}

// Dynamic library loading
#[link(name = "System")]
extern "C" {
    fn dlopen(filename: *const i8, flags: i32) -> *mut c_void;
    fn dlerror() -> *const i8;
}

const RTLD_NOW: i32 = 0x2;
const RTLD_GLOBAL: i32 = 0x8;

// ============================================================================
// Framework Loading
// ============================================================================

use std::sync::atomic::{AtomicBool, Ordering};

static FRAMEWORK_INIT: Once = Once::new();
static FRAMEWORK_LOADED: AtomicBool = AtomicBool::new(false);
static FRAMEWORK_ERROR: Mutex<Option<String>> = Mutex::new(None);

/// Find the Syphon.framework path
fn find_syphon_framework() -> Option<PathBuf> {
    // Try multiple locations in order of preference
    let search_paths = [
        // 1. Bundled with the app (for distribution)
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("../Frameworks/Syphon.framework/Syphon")),
        // 2. Development: relative to src-tauri
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("frameworks/Syphon.framework/Syphon")),
        // 3. Development: from cargo manifest dir
        std::env::var("CARGO_MANIFEST_DIR")
            .ok()
            .map(|p| PathBuf::from(p).join("frameworks/Syphon.framework/Syphon")),
        // 4. System-wide installation
        Some(PathBuf::from("/Library/Frameworks/Syphon.framework/Syphon")),
        // 5. User installation
        dirs::home_dir().map(|p| p.join("Library/Frameworks/Syphon.framework/Syphon")),
    ];

    for path_opt in search_paths.iter() {
        if let Some(path) = path_opt {
            if path.exists() {
                log::debug!("[Syphon] Found framework at: {:?}", path);
                return Some(path.clone());
            }
        }
    }

    None
}

/// Load the Syphon framework dynamically
fn load_syphon_framework() -> Result<(), String> {
    FRAMEWORK_INIT.call_once(|| {
        // Find the framework
        let framework_path = match find_syphon_framework() {
            Some(p) => p,
            None => {
                if let Ok(mut err) = FRAMEWORK_ERROR.lock() {
                    *err = Some(
                        "Syphon.framework not found. Please install it to:\n\
                         - src-tauri/frameworks/Syphon.framework (development)\n\
                         - /Library/Frameworks/Syphon.framework (system-wide)\n\
                         Download from: https://github.com/Syphon/Syphon-Framework/releases"
                            .to_string(),
                    );
                }
                return;
            }
        };

        // Convert path to C string
        let path_str = match framework_path.to_str() {
            Some(s) => s,
            None => {
                if let Ok(mut err) = FRAMEWORK_ERROR.lock() {
                    *err = Some("Invalid framework path".to_string());
                }
                return;
            }
        };

        let c_path = match CString::new(path_str) {
            Ok(p) => p,
            Err(_) => {
                if let Ok(mut err) = FRAMEWORK_ERROR.lock() {
                    *err = Some("Failed to convert path to CString".to_string());
                }
                return;
            }
        };

        // Load the framework
        unsafe {
            let handle = dlopen(c_path.as_ptr(), RTLD_NOW | RTLD_GLOBAL);
            if handle.is_null() {
                let error = dlerror();
                let error_msg = if error.is_null() {
                    "Unknown error".to_string()
                } else {
                    CStr::from_ptr(error).to_string_lossy().to_string()
                };

                // Provide helpful error message for architecture mismatch
                let helpful_msg = if error_msg.contains("mach-o")
                    || error_msg.contains("wrong architecture")
                    || error_msg.contains("arm64")
                    || error_msg.contains("x86_64")
                {
                    format!(
                        "Failed to load Syphon.framework: {}\n\n\
                        This usually means the framework architecture doesn't match your system.\n\
                        On Apple Silicon (M1/M2/M3), you need to build Syphon from source:\n\
                        \n\
                        1. Install Xcode from the App Store\n\
                        2. Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer\n\
                        3. Run: ./scripts/install-syphon.sh --force-build\n\
                        \n\
                        Or download a universal binary from the Syphon project.",
                        error_msg
                    )
                } else {
                    format!("Failed to load Syphon.framework: {}", error_msg)
                };

                if let Ok(mut err) = FRAMEWORK_ERROR.lock() {
                    *err = Some(helpful_msg);
                }
                return;
            }
        }

        log::debug!(
            "[Syphon] Framework loaded successfully from {:?}",
            framework_path
        );
        FRAMEWORK_LOADED.store(true, Ordering::SeqCst);
    });

    if FRAMEWORK_LOADED.load(Ordering::SeqCst) {
        Ok(())
    } else {
        let error = FRAMEWORK_ERROR
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
            .unwrap_or_else(|| "Unknown framework loading error".to_string());
        Err(error)
    }
}

/// Check if Syphon framework is available
pub fn is_syphon_available() -> bool {
    load_syphon_framework().is_ok()
}

// ============================================================================
// NSRect, NSPoint, NSSize for Syphon API
// ============================================================================

#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct NSPoint {
    x: f64,
    y: f64,
}

// Implement Encode for NSPoint to make it compatible with objc2 msg_send
unsafe impl Encode for NSPoint {
    const ENCODING: Encoding = Encoding::Struct("CGPoint", &[Encoding::Double, Encoding::Double]);
}

unsafe impl RefEncode for NSPoint {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct NSSize {
    width: f64,
    height: f64,
}

unsafe impl Encode for NSSize {
    const ENCODING: Encoding = Encoding::Struct("CGSize", &[Encoding::Double, Encoding::Double]);
}

unsafe impl RefEncode for NSSize {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct NSRect {
    origin: NSPoint,
    size: NSSize,
}

unsafe impl Encode for NSRect {
    const ENCODING: Encoding = Encoding::Struct(
        "CGRect",
        &[
            Encoding::Struct("CGPoint", &[Encoding::Double, Encoding::Double]),
            Encoding::Struct("CGSize", &[Encoding::Double, Encoding::Double]),
        ],
    );
}

unsafe impl RefEncode for NSRect {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

// ============================================================================
// NSString helper
// ============================================================================

/// Create an NSString from a Rust string
fn create_nsstring(s: &str) -> Retained<AnyObject> {
    unsafe {
        let cls = AnyClass::get(c"NSString").expect("NSString class not found");
        let bytes = s.as_ptr();
        let len = s.len();

        // Allocate - returns Allocated<AnyObject>
        let alloc: Allocated<AnyObject> = msg_send![cls, alloc];

        // Use initWithBytes:length:encoding: with UTF8 encoding (4)
        let obj: Retained<AnyObject> = msg_send![
            alloc,
            initWithBytes: bytes,
            length: len,
            encoding: 4u64  // NSUTF8StringEncoding
        ];
        obj
    }
}

// ============================================================================
// Syphon Server Wrapper
// ============================================================================

/// Wrapper around SyphonOpenGLServer
pub struct SyphonServer {
    /// The Objective-C SyphonOpenGLServer instance
    server: Retained<AnyObject>,
    /// CGL context for OpenGL operations
    context: CGLContextObj,
    /// OpenGL texture for uploading frame data
    texture_id: u32,
    /// Current texture dimensions
    texture_width: u32,
    texture_height: u32,
    /// Server name
    name: String,
}

// Safety: SyphonServer is Send because we properly synchronize access to OpenGL
unsafe impl Send for SyphonServer {}

impl SyphonServer {
    /// Create a new Syphon server with the given name
    pub fn new(name: &str) -> Result<Self, String> {
        unsafe {
            // Create CGL context
            let context = Self::create_cgl_context()?;

            // Make it current
            let err = CGLSetCurrentContext(context);
            if err != 0 {
                CGLDestroyContext(context);
                return Err(format!("Failed to set CGL context: error {}", err));
            }

            // Create OpenGL texture
            let mut texture_id: u32 = 0;
            glGenTextures(1, &mut texture_id);
            if texture_id == 0 {
                CGLDestroyContext(context);
                return Err("Failed to create OpenGL texture".to_string());
            }

            // Initialize texture
            glBindTexture(GL_TEXTURE_RECTANGLE, texture_id);
            glTexParameteri(GL_TEXTURE_RECTANGLE, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
            glTexParameteri(GL_TEXTURE_RECTANGLE, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
            glTexParameteri(GL_TEXTURE_RECTANGLE, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
            glTexParameteri(GL_TEXTURE_RECTANGLE, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
            glBindTexture(GL_TEXTURE_RECTANGLE, 0);

            // Create SyphonOpenGLServer
            let server = Self::create_syphon_server(name, context)?;

            log::debug!("[Syphon] Server '{}' created successfully", name);

            Ok(Self {
                server,
                context,
                texture_id,
                texture_width: 0,
                texture_height: 0,
                name: name.to_string(),
            })
        }
    }

    /// Create a CGL context for OpenGL operations
    unsafe fn create_cgl_context() -> Result<CGLContextObj, String> {
        // Define pixel format attributes for a basic OpenGL context
        let attribs: [CGLPixelFormatAttribute; 9] = [
            K_CGL_PFA_ACCELERATED,
            K_CGL_PFA_ALLOW_OFFLINE_RENDERERS,
            K_CGL_PFA_COLOR_SIZE,
            24,
            K_CGL_PFA_DEPTH_SIZE,
            16,
            K_CGL_PFA_OPENGL_PROFILE,
            K_CGL_OPENGL_PROFILE_LEGACY,
            0, // Null terminator
        ];

        let mut pixel_format: CGLPixelFormatObj = ptr::null_mut();
        let mut num_pixel_formats: i32 = 0;

        let err = CGLChoosePixelFormat(attribs.as_ptr(), &mut pixel_format, &mut num_pixel_formats);
        if err != 0 || pixel_format.is_null() {
            return Err(format!(
                "Failed to choose pixel format: error {}, count {}",
                err, num_pixel_formats
            ));
        }

        let mut context: CGLContextObj = ptr::null_mut();
        let err = CGLCreateContext(pixel_format, ptr::null_mut(), &mut context);
        CGLDestroyPixelFormat(pixel_format);

        if err != 0 || context.is_null() {
            return Err(format!("Failed to create CGL context: error {}", err));
        }

        Ok(context)
    }

    /// Create a SyphonOpenGLServer instance
    unsafe fn create_syphon_server(
        name: &str,
        context: CGLContextObj,
    ) -> Result<Retained<AnyObject>, String> {
        // Ensure framework is loaded
        load_syphon_framework()?;

        // Get the SyphonOpenGLServer class
        let class = match AnyClass::get(c"SyphonOpenGLServer") {
            Some(c) => c,
            None => {
                return Err(
                    "SyphonOpenGLServer class not found. Framework loaded but class missing."
                        .to_string(),
                )
            }
        };

        // Create NSString for the server name
        let ns_name = create_nsstring(name);

        // Allocate and initialize the server
        // - (instancetype)initWithName:(NSString*)serverName context:(CGLContextObj)context options:(NSDictionary*)options
        let alloc: Allocated<AnyObject> = msg_send![class, alloc];
        let server: Option<Retained<AnyObject>> = msg_send![
            alloc,
            initWithName: &*ns_name,
            context: context,
            options: ptr::null::<AnyObject>()
        ];

        server.ok_or_else(|| "Failed to create SyphonOpenGLServer".to_string())
    }

    /// Publish a frame with raw RGBA pixel data
    pub fn publish_frame(&mut self, data: &[u8], width: u32, height: u32) -> Result<(), String> {
        if data.len() != (width * height * 4) as usize {
            return Err(format!(
                "Data size mismatch: expected {} bytes, got {}",
                width * height * 4,
                data.len()
            ));
        }

        unsafe {
            // Lock the context for thread safety
            CGLLockContext(self.context);

            // Save current context
            let prev_context = CGLGetCurrentContext();

            // Make our context current
            let set_err = CGLSetCurrentContext(self.context);
            if set_err != 0 {
                CGLUnlockContext(self.context);
                return Err(format!("Failed to set CGL context: {}", set_err));
            }

            // Bind texture
            glBindTexture(GL_TEXTURE_RECTANGLE, self.texture_id);
            glPixelStorei(GL_UNPACK_ALIGNMENT, 1);

            // Upload pixel data
            if self.texture_width != width || self.texture_height != height {
                // Need to reallocate texture
                log::debug!(
                    "[Syphon] Resizing texture from {}x{} to {}x{}",
                    self.texture_width,
                    self.texture_height,
                    width,
                    height
                );
                glTexImage2D(
                    GL_TEXTURE_RECTANGLE,
                    0,
                    GL_RGBA8 as i32,
                    width as i32,
                    height as i32,
                    0,
                    GL_RGBA,
                    GL_UNSIGNED_BYTE,
                    data.as_ptr() as *const c_void,
                );
                self.texture_width = width;
                self.texture_height = height;
            } else {
                // Just update the existing texture
                glTexSubImage2D(
                    GL_TEXTURE_RECTANGLE,
                    0,
                    0,
                    0,
                    width as i32,
                    height as i32,
                    GL_RGBA,
                    GL_UNSIGNED_BYTE,
                    data.as_ptr() as *const c_void,
                );
            }

            // Check for GL errors after texture upload
            let gl_error = glGetError();
            if gl_error != 0 {
                log::error!("[Syphon] OpenGL error after texture upload: {}", gl_error);
                glBindTexture(GL_TEXTURE_RECTANGLE, 0);
                CGLSetCurrentContext(prev_context);
                CGLUnlockContext(self.context);
                return Err(format!("OpenGL error: {}", gl_error));
            }

            // IMPORTANT: Keep texture bound and flush before publishing
            // Syphon needs the texture to be ready
            glFlush();

            // Publish to Syphon
            // - (void)publishFrameTexture:(GLuint)texID
            //         textureTarget:(GLenum)target
            //         imageRegion:(NSRect)region
            //         textureDimensions:(NSSize)size
            //         flipped:(BOOL)isFlipped
            let region = NSRect {
                origin: NSPoint { x: 0.0, y: 0.0 },
                size: NSSize {
                    width: width as f64,
                    height: height as f64,
                },
            };
            let dimensions = NSSize {
                width: width as f64,
                height: height as f64,
            };

            // Note: flipped:YES because our data is already flipped in the frontend
            // (WebGL reads bottom-to-top, we flip to top-to-bottom)
            let _: () = msg_send![
                &*self.server,
                publishFrameTexture: self.texture_id,
                textureTarget: GL_TEXTURE_RECTANGLE,
                imageRegion: region,
                textureDimensions: dimensions,
                flipped: Bool::YES
            ];

            // Unbind texture after publishing
            glBindTexture(GL_TEXTURE_RECTANGLE, 0);

            // Restore previous context
            CGLSetCurrentContext(prev_context);
            CGLUnlockContext(self.context);
        }

        Ok(())
    }

    /// Check if any clients are connected
    pub fn has_clients(&self) -> bool {
        unsafe {
            let result: Bool = msg_send![&*self.server, hasClients];
            result.as_bool()
        }
    }

    /// Get the server name
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Stop the server
    pub fn stop(&mut self) {
        unsafe {
            let _: () = msg_send![&*self.server, stop];
        }
        log::debug!("[Syphon] Server '{}' stopped", self.name);
    }
}

impl Drop for SyphonServer {
    fn drop(&mut self) {
        unsafe {
            // Stop the server
            let _: () = msg_send![&*self.server, stop];

            // Clean up OpenGL resources
            CGLLockContext(self.context);
            let prev_context = CGLGetCurrentContext();
            CGLSetCurrentContext(self.context);

            if self.texture_id != 0 {
                glDeleteTextures(1, &self.texture_id);
            }

            CGLSetCurrentContext(prev_context);
            CGLUnlockContext(self.context);

            // Destroy the CGL context
            CGLDestroyContext(self.context);
        }
        log::debug!("[Syphon] Server '{}' destroyed", self.name);
    }
}

// ============================================================================
// Global Syphon Manager
// ============================================================================

/// Thread-safe global Syphon server instance
static SYPHON_SERVER: Mutex<Option<SyphonServer>> = Mutex::new(None);

/// Initialize the global Syphon server
pub fn init_syphon_server(name: &str) -> Result<(), String> {
    let mut server_guard = SYPHON_SERVER
        .lock()
        .map_err(|e| format!("Failed to lock Syphon mutex: {}", e))?;

    if server_guard.is_some() {
        return Err("Syphon server already initialized".to_string());
    }

    let server = SyphonServer::new(name)?;
    *server_guard = Some(server);
    Ok(())
}

/// Shutdown the global Syphon server
pub fn shutdown_syphon_server() -> Result<(), String> {
    let mut server_guard = SYPHON_SERVER
        .lock()
        .map_err(|e| format!("Failed to lock Syphon mutex: {}", e))?;

    if let Some(mut server) = server_guard.take() {
        server.stop();
    }
    Ok(())
}

/// Publish a frame to the global Syphon server
pub fn publish_syphon_frame(data: &[u8], width: u32, height: u32) -> Result<(), String> {
    let mut server_guard = SYPHON_SERVER
        .lock()
        .map_err(|e| format!("Failed to lock Syphon mutex: {}", e))?;

    match server_guard.as_mut() {
        Some(server) => server.publish_frame(data, width, height),
        None => Err("Syphon server not initialized".to_string()),
    }
}

/// Check if the global Syphon server has clients
pub fn syphon_has_clients() -> bool {
    SYPHON_SERVER
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|s| s.has_clients()))
        .unwrap_or(false)
}

/// Check if a Syphon server is active
pub fn is_syphon_active() -> bool {
    SYPHON_SERVER
        .lock()
        .ok()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nsrect_layout() {
        // Verify struct layout matches what Objective-C expects
        assert_eq!(std::mem::size_of::<NSRect>(), 32);
        assert_eq!(std::mem::size_of::<NSPoint>(), 16);
        assert_eq!(std::mem::size_of::<NSSize>(), 16);
    }
}
