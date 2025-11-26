# Frameworks Directory

This directory contains native frameworks required for sebcat-vj.

## Syphon.framework

The Syphon framework is required for video output on macOS. It enables sharing rendered frames with other applications like Resolume Arena, VDMX, and OBS.

### Quick Install

Run the install script from the project root:

```bash
./scripts/install-syphon.sh
```

**On Apple Silicon (M1/M2/M3):** The script will automatically build Syphon from source as a universal binary since the official SDK only provides x86_64 binaries. This requires Xcode (not just Command Line Tools).

**On Intel Macs:** The script downloads the pre-built SDK v5.

### Requirements

#### Intel Macs

- macOS 10.15+
- Internet connection (to download SDK)

#### Apple Silicon Macs

- macOS 11.0+
- **Xcode** (full app from App Store, not just Command Line Tools)
- Git

To verify Xcode is properly selected:

```bash
xcode-select -p
# Should output: /Applications/Xcode.app/Contents/Developer

# If it shows /Library/Developer/CommandLineTools, run:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### Manual Installation

#### Option A: Build from Source (Recommended for Apple Silicon)

```bash
# Clone Syphon repository
git clone https://github.com/Syphon/Syphon-Framework.git /tmp/Syphon-Framework
cd /tmp/Syphon-Framework

# Build universal binary
xcodebuild \
  -project Syphon.xcodeproj \
  -scheme Syphon \
  -configuration Release \
  -destination 'generic/platform=macOS' \
  ARCHS="arm64 x86_64" \
  ONLY_ACTIVE_ARCH=NO \
  build

# Find and copy the built framework
# (Location varies by Xcode version)
find ~/Library/Developer/Xcode/DerivedData -name "Syphon.framework" -type d

# Copy to sebcat-vj
cp -R /path/to/built/Syphon.framework sebcat-vj/src-tauri/frameworks/
```

#### Option B: Download Pre-built SDK (Intel only)

1. Download from: https://github.com/Syphon/Syphon-Framework/releases
2. Extract the archive
3. Copy `Syphon.framework` to this directory

### Directory Structure

After installation, your directory should look like:

```
frameworks/
├── README.md
└── Syphon.framework/
    ├── Headers/
    ├── Resources/
    ├── Syphon          (binary)
    └── Versions/
```

### Verification

Check the framework architecture:

```bash
lipo -info src-tauri/frameworks/Syphon.framework/Syphon

# Expected output for universal binary:
# Architectures in the fat file: ... are: x86_64 arm64

# x86_64 only (Intel or pre-built SDK):
# Non-fat file: ... is architecture: x86_64
```

When the app starts, you should see in the terminal:

```
[Syphon] Found framework at: .../frameworks/Syphon.framework/Syphon
[Syphon] Framework loaded successfully
```

The Syphon backend should show as "Ready" in the Video Output panel.

### Git

This framework is excluded from git via `.gitignore`. Each developer needs to run the install script after cloning the repository.

### Troubleshooting

#### "Syphon.framework not found"

Run the install script:

```bash
./scripts/install-syphon.sh
```

#### "SyphonOpenGLServer class not found"

The framework file exists but may be corrupted or incompatible:

```bash
# Clean reinstall
./scripts/install-syphon.sh --clean
```

#### "xcodebuild: error: ... requires Xcode"

You have Command Line Tools selected instead of Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

If Xcode isn't installed, install it from the App Store first.

#### "dlopen failed" or "image not found" on Apple Silicon

The framework is x86_64 only but you're on arm64:

```bash
# Check architecture
lipo -info src-tauri/frameworks/Syphon.framework/Syphon

# If x86_64 only, rebuild from source:
./scripts/install-syphon.sh --force-build
```

#### "Failed to create CGL context"

This may occur on systems without proper GPU support:

- Ensure you're not running in a VM without GPU passthrough
- Try on a machine with discrete or integrated graphics
- Check that OpenGL is available: `glxinfo | grep "OpenGL"`

#### Build errors about missing framework

- Ensure the framework directory is named exactly `Syphon.framework`
- Check permissions: `chmod -R 755 Syphon.framework`
- Verify the framework binary exists: `ls -la Syphon.framework/Syphon`

#### Syphon works but receivers don't see output

- Ensure the Renderer window is visible (not minimized)
- Check that "Enable" is toggled on in the Video panel
- Verify frame count is incrementing in the Video panel
- Restart Resolume/VDMX after enabling Syphon

### Running on Apple Silicon with x86_64 Framework

If you can't build from source, you can run the entire app under Rosetta 2:

1. Find the app in Finder
2. Right-click → Get Info
3. Check "Open using Rosetta"

However, this is not recommended for performance reasons. Building a universal framework is preferred.

### Technical Notes

- Syphon uses IOSurface for zero-copy GPU texture sharing
- sebcat-vj uses `SyphonOpenGLServer` with a CGL context
- Frame data is uploaded to an OpenGL texture rectangle, then published
- The implementation is in `src-tauri/src/syphon.rs`

### License

Syphon is distributed under a BSD license. See the Syphon project for details:
https://github.com/Syphon/Syphon-Framework
