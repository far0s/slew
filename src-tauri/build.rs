fn main() {
    // On macOS, link system frameworks needed for video output
    #[cfg(target_os = "macos")]
    {
        // Link OpenGL framework for CGL and GL functions used by Syphon integration
        // Note: Syphon.framework itself is loaded dynamically at runtime via dlopen
        // (see src/syphon.rs) so we don't link it here
        println!("cargo:rustc-link-lib=framework=OpenGL");

        // Re-run if frameworks directory changes
        println!("cargo:rerun-if-changed=frameworks/");

        // Add rpath for NDI SDK library location on macOS
        // The NDI SDK installs libndi.dylib to this location, and grafton-ndi
        // links with @rpath/libndi.dylib, so we need to add this to the rpath
        #[cfg(feature = "ndi")]
        {
            println!("cargo:rustc-link-arg=-Wl,-rpath,/Library/NDI SDK for Apple/lib/macOS");
        }
    }

    // On Linux, add rpath for NDI SDK
    #[cfg(target_os = "linux")]
    #[cfg(feature = "ndi")]
    {
        println!(
            "cargo:rustc-link-arg=-Wl,-rpath,/usr/share/NDI SDK for Linux/lib/x86_64-linux-gnu"
        );
    }

    tauri_build::build()
}
