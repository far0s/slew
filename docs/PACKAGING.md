# sebcat-vj Packaging Guide

This guide covers building, packaging, and distributing sebcat-vj for macOS, Windows, and Linux.

---

## Quick Start

```bash
# Check if all prerequisites are installed
npm run package:check

# Build a release package (macOS: .app + .dmg)
npm run package

# Build without NDI (no SDK required)
npm run package:no-ndi
```

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Build Commands](#build-commands)
3. [Platform-Specific Notes](#platform-specific-notes)
4. [Code Signing](#code-signing)
5. [Notarization (macOS)](#notarization-macos)
6. [Distribution](#distribution)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### All Platforms

- **Node.js** 18+ and npm
- **Rust** 1.70+ with cargo
- **Tauri CLI** (installed via npm)

### macOS

- **Xcode Command Line Tools**: `xcode-select --install`
- **Syphon.framework**: Run `./scripts/install-syphon.sh`
- **NDI SDK** (optional): Run `./scripts/install-ndi.sh`

### Windows

- **Visual Studio Build Tools** with C++ workload
- **WebView2** runtime (usually pre-installed on Windows 10/11)
- **NDI SDK** (optional): Download from [ndi.video](https://ndi.video/for-developers/ndi-sdk/)

### Linux

- **System libraries**:

  ```bash
  # Ubuntu/Debian
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
                   librsvg2-dev libasound2-dev libhidapi-dev

  # Fedora
  sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel \
                   librsvg2-devel alsa-lib-devel hidapi-devel
  ```

- **NDI SDK** (optional): See `./scripts/install-ndi.sh`

---

## Build Commands

### Development

```bash
# Start development server (with NDI)
npm run tauri dev

# Start without NDI (no SDK required)
npm run tauri:no-ndi
```

### Production Builds

```bash
# Full release build (includes NDI if SDK installed)
npm run tauri:build

# Build without NDI support
npm run tauri:build:no-ndi

# Debug build (larger, with dev tools)
npm run tauri:build:debug
```

### Packaging Scripts

The `package.sh` script provides more control:

```bash
# Check prerequisites
./scripts/package.sh --check

# Clean build
./scripts/package.sh --clean

# Build without NDI
./scripts/package.sh --no-ndi

# Build and sign (macOS)
./scripts/package.sh --sign

# Full release with signing and DMG
./scripts/package.sh --sign --dmg

# Notarize for distribution
./scripts/package.sh --sign --notarize --dmg
```

---

## Platform-Specific Notes

### macOS

#### Output Locations

After building, you'll find:

- **App Bundle**: `src-tauri/target/release/bundle/macos/sebcat-vj.app`
- **DMG Installer**: `src-tauri/target/release/bundle/dmg/sebcat-vj_<version>_<arch>.dmg`

#### Bundled Frameworks

The following frameworks are bundled automatically:

- **Syphon.framework**: For video output to VJ software (Resolume, VDMX, etc.)

#### Architecture Support

Builds are architecture-specific by default:

- Apple Silicon (M1/M2/M3): `aarch64-apple-darwin`
- Intel: `x86_64-apple-darwin`

For universal binaries (both architectures), you'd need to build twice and use `lipo` to combine them.

#### Minimum macOS Version

The app requires **macOS 11.0 (Big Sur)** or later, configured in `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "minimumSystemVersion": "11.0"
    }
  }
}
```

### Windows

#### Output Locations

- **NSIS Installer**: `src-tauri/target/release/bundle/nsis/sebcat-vj_<version>_x64-setup.exe`
- **MSI Installer**: `src-tauri/target/release/bundle/msi/sebcat-vj_<version>_x64_en-US.msi`

#### WebView2 Runtime

The app requires WebView2, which is included in Windows 10 (version 1803+) and Windows 11. For older systems, the installer will download it automatically.

### Linux

#### Output Locations

- **AppImage**: `src-tauri/target/release/bundle/appimage/sebcat-vj_<version>_amd64.AppImage`
- **Debian Package**: `src-tauri/target/release/bundle/deb/sebcat-vj_<version>_amd64.deb`

#### AppImage Usage

```bash
chmod +x sebcat-vj_*.AppImage
./sebcat-vj_*.AppImage
```

---

## Code Signing

### macOS Code Signing

Code signing is required for:

- Distributing outside the Mac App Store
- Avoiding Gatekeeper warnings
- Accessing certain macOS features

#### Setup

1. **Get a Developer ID Certificate** from [Apple Developer](https://developer.apple.com)
2. **Install the certificate** in your Keychain
3. **Find your signing identity**:
   ```bash
   security find-identity -v -p codesigning
   ```
4. **Set environment variable** (optional):
   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   ```

#### Sign During Build

```bash
./scripts/package.sh --sign
```

Or configure in `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAMID)"
    }
  }
}
```

#### Manual Signing

```bash
codesign --force --deep --sign "Developer ID Application: Your Name (TEAMID)" \
         --options runtime \
         --entitlements src-tauri/entitlements.plist \
         src-tauri/target/release/bundle/macos/sebcat-vj.app
```

### Windows Code Signing

For Windows, you'll need an EV Code Signing certificate:

1. **Purchase a certificate** from DigiCert, Sectigo, etc.
2. **Configure in environment**:
   ```bash
   set TAURI_PRIVATE_KEY=path/to/key.pfx
   set TAURI_KEY_PASSWORD=your_password
   ```
3. **Or configure in tauri.conf.json**:
   ```json
   {
     "bundle": {
       "windows": {
         "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
         "timestampUrl": "http://timestamp.digicert.com"
       }
     }
   }
   ```

---

## Notarization (macOS)

Apple notarization is required for distributing apps outside the Mac App Store on macOS 10.15+.

### Setup

1. **Create an app-specific password** at [appleid.apple.com](https://appleid.apple.com)
2. **Get your Team ID** from [Apple Developer](https://developer.apple.com)
3. **Set environment variables**:
   ```bash
   export APPLE_ID="your@email.com"
   export APPLE_TEAM_ID="YOURTEAMID"
   export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password
   ```

### Notarize

```bash
./scripts/package.sh --sign --notarize --dmg
```

### Manual Notarization

```bash
# Create ZIP for submission
ditto -c -k --keepParent sebcat-vj.app sebcat-vj.zip

# Submit for notarization
xcrun notarytool submit sebcat-vj.zip \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_PASSWORD" \
    --wait

# Staple the ticket to the app
xcrun stapler staple sebcat-vj.app
```

---

## Distribution

### Direct Download

1. Build and sign the app
2. Create a DMG (macOS) or installer (Windows/Linux)
3. Host on your website or GitHub Releases
4. Users download and install

### GitHub Releases

1. Tag your release: `git tag 0.6.0`
2. Push the tag: `git push origin 0.6.0`
3. Create a release on GitHub
4. Upload the built artifacts

### Auto-Update (Future)

Tauri supports auto-update via the `tauri-plugin-updater`. This requires:

- A server hosting update manifests
- Code signing (required for auto-update)
- Configuration in `tauri.conf.json`

---

## Troubleshooting

### Build Fails: Missing Syphon.framework

```
Error: Syphon.framework not found
```

**Solution**: Run the installation script:

```bash
./scripts/install-syphon.sh
```

On Apple Silicon, this builds from source (requires Xcode).

### Build Fails: NDI SDK Not Found

```
Error: failed to run custom build command for `grafton-ndi`
```

**Solution**: Either install the NDI SDK or build without NDI:

```bash
npm run package:no-ndi
```

### macOS: "App is damaged" or "Can't be opened"

This happens when the app isn't properly signed or notarized.

**For development**:

```bash
xattr -cr /Applications/sebcat-vj.app
```

**For distribution**: Sign and notarize the app.

### macOS: Syphon Not Working

Ensure Syphon.framework is properly bundled:

```bash
ls -la sebcat-vj.app/Contents/Frameworks/
```

Should show `Syphon.framework`.

### Windows: WebView2 Missing

The app requires WebView2. If it's not installed:

1. Download from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
2. Or use the Evergreen Bootstrapper in your installer

### Linux: Missing Libraries

Install required dependencies:

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0 libasound2 libhidapi-libusb0

# Fedora
sudo dnf install webkit2gtk4.1 gtk3 alsa-lib hidapi
```

### Memory Issues During Build

Rust compilation can use significant memory. If builds are killed:

1. Close other applications
2. Increase swap space
3. Build with fewer codegen units:
   ```bash
   CARGO_BUILD_JOBS=2 npm run tauri:build
   ```

---

## Entitlements Reference

The `entitlements.plist` file grants the app specific permissions:

| Entitlement                                              | Purpose                             |
| -------------------------------------------------------- | ----------------------------------- |
| `com.apple.security.device.audio-input`                  | Audio capture for FFT analysis      |
| `com.apple.security.device.usb`                          | HID device access (MIDI, macropads) |
| `com.apple.security.network.client`                      | OSC input, NDI discovery            |
| `com.apple.security.network.server`                      | OSC server                          |
| `com.apple.security.cs.allow-jit`                        | WebView JavaScript JIT              |
| `com.apple.security.cs.disable-library-validation`       | Load Syphon.framework               |
| `com.apple.security.cs.allow-dyld-environment-variables` | NDI SDK library path                |

---

## Version Checklist

Before releasing a new version:

1. [ ] Update version in `package.json`
2. [ ] Update version in `src-tauri/Cargo.toml`
3. [ ] Update version in `src-tauri/tauri.conf.json`
4. [ ] Update CHANGELOG
5. [ ] Test on all target platforms
6. [ ] Build release packages
7. [ ] Sign and notarize (macOS)
8. [ ] Create GitHub release with artifacts
9. [ ] Update documentation if needed

---

## Resources

- [Tauri Bundler Documentation](https://v2.tauri.app/distribute/)
- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/code_signing_services)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows Code Signing](https://learn.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
