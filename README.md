# sebcat-vj 🎛️

A modular VJ application built with Tauri, React, and Three.js. Create real-time visuals with hardware control, audio reactivity, and professional video output.

---

## Download

[![Latest Release](https://img.shields.io/github/v/release/far0s/sebcat-vj?style=flat-square)](https://github.com/far0s/sebcat-vj/releases/latest)

Download the latest version for your platform from [Releases](https://github.com/far0s/sebcat-vj/releases/latest):

| Platform              | File                             |
| --------------------- | -------------------------------- |
| macOS (Apple Silicon) | `sebcat-vj_x.x.x_aarch64.dmg`    |
| macOS (Intel)         | `sebcat-vj_x.x.x_x64.dmg`        |
| Windows               | `sebcat-vj_x.x.x_x64-setup.exe`  |
| Linux                 | `sebcat-vj_x.x.x_amd64.AppImage` |

### macOS Installation Note

The app is not code-signed. On first launch, macOS may show a security warning.

**To open the app:**

1. Right-click the app in Finder
2. Select "Open" from the context menu
3. Click "Open" in the security dialog

**Or run in Terminal:**

```bash
xattr -cr /Applications/sebcat-vj.app
```

---

## Features

- **Dual-Window Architecture**: Separate high-performance renderer and control UI
- **8 Slot System**: Load multiple visual sketches with independent parameters
- **Hardware Control**: MIDI (Akai Midimix), OSC, HID macropads
- **Audio Reactivity**: FFT analysis, beat detection, audio-to-parameter mapping
- **Video Output**: Syphon (macOS) and NDI for integration with VJ software
- **Modulation Engine**: LFOs with BPM sync and audio modulation
- **Hot-Plug Detection**: Automatic device reconnection

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **Rust** 1.70+
- **Xcode Command Line Tools** (macOS): `xcode-select --install`

### Install & Run

```bash
# Clone the repo
git clone https://github.com/far0s/sebcat-vj.git
cd sebcat-vj

# Install dependencies
npm install

# Install Syphon framework (macOS)
./scripts/install-syphon.sh

# Start development
npm run tauri dev
```

### Without NDI (No SDK Required)

```bash
npm run tauri:no-ndi
```

---

## Hardware Support (not mandatory, this is Seb's setup)

| Device         | Type | Features                         |
| -------------- | ---- | -------------------------------- |
| Akai Midimix   | MIDI | 8 faders, 24 knobs, LED feedback |
| DOIO Megalodon | HID  | 16 keys, 3 encoders              |
| Any OSC device | OSC  | Port 9000, customizable mappings |

---

## Documentation

| Document                                     | Description                        |
| -------------------------------------------- | ---------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and code conventions |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)       | Feature status and recent changes  |
| [docs/BACKLOG.md](docs/BACKLOG.md)           | Prioritized work items             |
| [docs/PACKAGING.md](docs/PACKAGING.md)       | Build and distribution guide       |
| [docs/CONTROLLERS.md](docs/CONTROLLERS.md)   | Hardware controller reference      |

---

## IDE Setup

### Zed

[Zed](https://zed.dev/) works out of the box with built-in support for Rust, TypeScript, and language servers.

### VS Code

- [VS Code](https://code.visualstudio.com/)
- [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **3D Rendering**: Three.js via react-three-fiber
- **Backend**: Tauri v2 (Rust)
- **Video Output**: Syphon, NDI

---

## License

MIT
