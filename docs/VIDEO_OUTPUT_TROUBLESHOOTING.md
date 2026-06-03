# Video Output Troubleshooting

Slew supports three video output backends:

| Backend | Platform | Protocol |
|---------|----------|----------|
| **Syphon** | macOS only | GPU texture sharing |
| **Spout** | Windows only | GPU texture sharing *(stub — not yet functional)* |
| **NDI** | macOS, Windows, Linux | Network video stream |

---

## Verifying Output Is Working

### Syphon (macOS)

1. Enable Syphon output in Slew's **Output** panel
2. Open a Syphon receiver app — recommended test tools:
   - **Syphon Recorder** (free) — [github.com/Syphon/Syphon-Recorder](https://github.com/Syphon/Syphon-Recorder)
   - **VDMX** (trial) — shows all Syphon sources in the Media Sources panel
   - **OBS Studio** — add a "Syphon Client" source
3. The source will appear as **"Slew"** in the receiver's source list
4. You should see the live renderer output at the configured resolution

**Quick check:** Syphon Recorder → File menu → list of sources. "Slew" should appear within a second of enabling output.

### NDI (All platforms)

1. Enable NDI output in Slew's **Output** panel
2. Open a NDI receiver:
   - **NDI Studio Monitor** (free, from NDI) — shows all NDI sources on the local network
   - **OBS Studio** — add an "NDI Source" plugin source
   - **Resolume Avenue/Arena** — NDI sources appear in the sources panel
3. The stream appears as **"Slew"** on the local network
4. NDI streams at ~29.97 fps (30000/1001) regardless of your renderer frame rate

**Quick check:** NDI Studio Monitor should list "YOURHOST (Slew)" within 5 seconds.

---

## Common Issues

### Syphon: Source not visible in receiver apps

**Framework not found**

Slew loads `Syphon.framework` dynamically at startup. If the framework is missing, Syphon output silently fails.

Check the Slew log for:
```
[Syphon] Found framework at: ...
```
or an error like:
```
Syphon.framework not found.
```

Install the framework:
```bash
# Download the latest release from https://github.com/Syphon/Syphon-Framework/releases
# Then copy to the system location:
sudo cp -r Syphon.framework /Library/Frameworks/

# Or to your user library:
cp -r Syphon.framework ~/Library/Frameworks/
```

**Architecture mismatch (Apple Silicon)**

If the log shows:
```
Failed to load Syphon.framework: mach-o ... wrong architecture
```

The framework binary doesn't match your CPU. Build a universal binary from source:

```bash
# Requires Xcode CLI tools
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# Clone and build
git clone https://github.com/Syphon/Syphon-Framework.git
cd Syphon-Framework
xcodebuild -scheme Syphon -configuration Release \
  ARCHS="arm64 x86_64" \
  ONLY_ACTIVE_ARCH=NO \
  BUILD_DIR=./build
sudo cp -r build/Release/Syphon.framework /Library/Frameworks/
```

**OpenGL context creation failure**

Rarely, CGL context creation fails on systems with unusual GPU configurations. Check the log for:
```
Failed to choose pixel format
Failed to create CGL context
```

This can happen with external GPUs or virtual machines. Try disabling GPU switching in System Settings → Battery → Graphics.

---

### NDI: Source not visible on network

**NDI SDK not installed**

The NDI feature requires the NDI SDK to be installed on the system. If missing, the log shows:
```
NDI SDK is not installed. Please install the NDI SDK from https://ndi.video/type/developer/
```

Download and install the **NDI SDK** (not just NDI Tools) from [ndi.video](https://ndi.video/type/developer/).

**Firewall blocking NDI**

NDI uses mDNS for discovery and TCP/UDP for streaming. Ports:
- **5353/UDP** — mDNS discovery
- **5960/TCP** — NDI connection
- **5961–5970/UDP** — NDI video data

On macOS, allow Slew through the firewall:
```
System Settings → Network → Firewall → Options → Add Slew
```

On Windows, allow Slew through Windows Firewall, or temporarily disable it to test.

**Receiver on different subnet**

NDI discovery is multicast and won't cross router boundaries by default. Slew and your receiver must be on the same local network subnet.

To connect across subnets, configure NDI's access manager (`ndi-access-manager`) with explicit IP addresses on both sides.

**Virtual network interfaces**

VPN software, Docker, or virtual machines can create extra network interfaces that confuse NDI discovery. Disable VPNs when testing.

---

### NDI: Source visible but video is black / corrupt

**Frame size mismatch**

Check the log for:
```
NDI frame buffer size mismatch: expected X, got Y
```

This shouldn't happen in normal use but can occur if the renderer resolution changes mid-stream. Disable and re-enable the NDI output to reinitialize.

**RGBA→BGRA conversion**

NDI receives BGRA internally. Slew converts automatically. If colors look wrong (red and blue swapped), this conversion may have been bypassed. File a bug.

---

### Syphon: Receiving black frames

**Renderer not rendering**

Verify a sketch is loaded and the renderer is active. The output panel should show a live preview.

**OpenGL error during upload**

Check the log for:
```
[Syphon] OpenGL error after texture upload: <error_code>
```

Common codes:
- `1280` (GL_INVALID_ENUM) — texture target mismatch
- `1281` (GL_INVALID_VALUE) — invalid width/height
- `1285` (GL_OUT_OF_MEMORY) — GPU memory exhausted

If you see GL_OUT_OF_MEMORY, reduce the output resolution or close other GPU-intensive apps.

---

### Spout (Windows): Output not working

Spout output is **not yet functional**. The Spout backend is a stub — it accepts frames without error but does not share them with other applications.

This is blocked on the Rust/Spout2 crate ecosystem. See `BACKLOG.md` for status.

**Workaround:** Use NDI output on Windows instead. NDI is fully functional on all platforms and works with Resolume, TouchDesigner, OBS, and most VJ software.

---

## Platform-Specific Notes

### macOS

- Syphon requires macOS 10.15+
- Syphon.framework must be a **Release** build — Debug builds have different symbol names
- Both arm64 and x86_64 architectures are supported; a universal binary covers both
- NDI requires the NDI SDK installed at `/usr/local/lib/libndi.dylib` or in the app bundle

### Windows

- Spout is a stub — use NDI instead
- NDI requires the NDI SDK installed (adds `Processing.NDI.Lib.x64.dll` to system32)
- Windows Defender may flag NDI's network activity; add an exception for Slew

### Linux

- Only NDI is available (no Syphon/Spout on Linux)
- NDI requires the NDI SDK `.so` to be on the library path
- Install to `/usr/local/lib/` and run `ldconfig`

---

## Reading Slew Logs

Slew logs video output activity at `debug` level. To see detailed output:

1. Launch Slew from terminal:
   ```bash
   RUST_LOG=debug ./Slew
   ```
2. Filter for video output:
   ```bash
   RUST_LOG=debug ./Slew 2>&1 | grep -E '\[(Syphon|NDI|Spout|video_out)\]'
   ```

Key log lines to look for:

| Log message | Meaning |
|-------------|---------|
| `[Syphon] Framework loaded successfully` | Syphon.framework found and loaded |
| `[Syphon] Server 'Slew' created successfully` | Syphon output active |
| `[Syphon] Frame 300 @ 1920x1080: total=X.XXms` | Periodic timing stats (every 5s) |
| `[NDI] SDK version: X.X.X` | NDI SDK present and loaded |
| `[NDI] Created sender: HOSTNAME (Slew)` | NDI output active |
| `[NDI] X frames (1920x1080)` | Periodic frame count (every 30s) |

---

## Receiver App Compatibility

### Syphon receivers (macOS)

| App | How to receive |
|-----|----------------|
| **Resolume Avenue/Arena** | Sources panel → Syphon → Slew |
| **VDMX** | Media Sources → Syphon |
| **OBS Studio** | Add Source → Syphon Client |
| **Syphon Recorder** | Auto-detects all sources |
| **Millumin** | Add a Syphon layer |

### NDI receivers (all platforms)

| App | How to receive |
|-----|----------------|
| **NDI Studio Monitor** | Auto-discovers all NDI sources |
| **Resolume Avenue/Arena** | Sources panel → NDI → Slew |
| **OBS Studio** | NDI plugin → Add NDI Source |
| **TouchDesigner** | NDI In TOP node |
| **vMix** | Add Input → NDI |

---

## Still stuck?

File an issue at the Slew GitHub repository. Include:
1. Platform and OS version
2. Slew version
3. Backend (Syphon/NDI/Spout)
4. Full log output with `RUST_LOG=debug`
5. Receiver app and version
