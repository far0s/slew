# Automated GitHub Releases

Task document for setting up GitHub Actions to automatically build and publish releases.

---

## Goal

When a version tag (e.g., `v0.5.0`) is pushed to the repository, GitHub Actions should:

1. Build the app for all platforms (macOS, Windows, Linux)
2. Create a GitHub Release with the tag name
3. Upload built artifacts to the release

---

## Approach: Use `tauri-action`

Tauri provides an official GitHub Action (`tauri-apps/tauri-action@v0`) that handles:

- Building the app for the target platform
- Creating GitHub releases
- Uploading artifacts automatically
- Version extraction from `tauri.conf.json`

This significantly simplifies our workflow compared to manual setup.

**Reference**: https://v2.tauri.app/distribute/pipelines/github/

---

## Platforms & Artifacts

| Platform              | Runner           | Target                 | Artifacts           |
| --------------------- | ---------------- | ---------------------- | ------------------- |
| macOS (Apple Silicon) | `macos-latest`   | `aarch64-apple-darwin` | `.app`, `.dmg`      |
| macOS (Intel)         | `macos-latest`   | `x86_64-apple-darwin`  | `.app`, `.dmg`      |
| Windows               | `windows-latest` | default                | `.exe` (NSIS)       |
| Linux                 | `ubuntu-22.04`   | default                | `.AppImage`, `.deb` |

### Notes

- macOS builds both architectures on the same runner using different targets
- Building without NDI (`--no-default-features`) to avoid SDK dependency in CI
- **Syphon.framework** needs special handling on macOS (must run `install-syphon.sh`)

---

## Implementation Plan

### Phase 1: Create Workflow File

- [x] Research tauri-action approach
- [ ] Create `.github/workflows/release.yml`
- [ ] Configure for all platforms
- [ ] Add Syphon installation step for macOS
- [ ] Build with `--no-default-features` (no NDI)

### Phase 2: Test & Verify

- [ ] Push workflow to a feature branch
- [ ] Add `workflow_dispatch` trigger for manual testing
- [ ] Create test tag to verify full flow
- [ ] Verify all platform artifacts are uploaded

### Phase 3: README Updates

- [ ] Add "Download" section with release badge
- [ ] Add installation instructions per platform
- [ ] Document Gatekeeper workaround for unsigned macOS builds
- [ ] Add "Building from Source" section

---

## Workflow File

```yaml
name: Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch: # Manual trigger for testing

jobs:
  publish-tauri:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: "macos-latest"
            args: "--target aarch64-apple-darwin -- --no-default-features"
            rust_targets: "aarch64-apple-darwin"
          - platform: "macos-latest"
            args: "--target x86_64-apple-darwin -- --no-default-features"
            rust_targets: "x86_64-apple-darwin"
          - platform: "ubuntu-22.04"
            args: "-- --no-default-features"
            rust_targets: ""
          - platform: "windows-latest"
            args: "-- --no-default-features"
            rust_targets: ""

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      # Linux dependencies
      - name: Install dependencies (Ubuntu)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libappindicator3-dev \
            librsvg2-dev \
            patchelf \
            libasound2-dev \
            libhidapi-dev

      # macOS: Install Syphon framework
      - name: Install Syphon (macOS)
        if: startsWith(matrix.platform, 'macos')
        run: |
          # The script handles both Intel and Apple Silicon
          ./scripts/install-syphon.sh --clean

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "lts/*"
          cache: "npm"

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.rust_targets }}

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: "./src-tauri -> target"

      - name: Install frontend dependencies
        run: npm ci

      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: v__VERSION__
          releaseName: "v__VERSION__"
          releaseBody: |
            ## Download

            Choose the appropriate installer for your platform:

            | Platform | File |
            |----------|------|
            | macOS (Apple Silicon) | `.dmg` (aarch64) |
            | macOS (Intel) | `.dmg` (x86_64) |
            | Windows | `.exe` |
            | Linux | `.AppImage` or `.deb` |

            ### macOS Note

            This app is not signed. On first launch, you may see a warning. To open:
            1. Right-click the app and select "Open"
            2. Click "Open" in the dialog

            Or run: `xattr -cr /Applications/sebcat-vj.app`
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

---

## Key Implementation Notes

### Passing Cargo flags

The `--no-default-features` flag is a Cargo flag, not a Tauri CLI flag. To pass it through:

- Use `-- --no-default-features` after Tauri CLI args
- The `--` separator tells Tauri CLI to forward remaining args to Cargo
- Each matrix entry includes this in the `args` field

### Ubuntu dependencies

The `hidapi` crate requires `libudev-dev` in addition to the standard Tauri dependencies:

```bash
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libasound2-dev \
  libhidapi-dev \
  libudev-dev  # Required for hidapi crate
```

### Windows bundle targets

The `tauri.conf.json` must have `"targets": "all"` (not just `["app", "dmg"]`) to generate Windows and Linux bundles:

```json
"bundle": {
  "active": true,
  "targets": "all",
  ...
}
```

### Syphon in CI

The `install-syphon.sh` script should work on GitHub macOS runners because:

1. `macos-latest` runners have Xcode pre-installed
2. The script detects architecture and builds from source on Apple Silicon
3. The script downloads pre-built binaries on Intel

**Potential issue**: The script has interactive prompts for reinstallation. We use `--clean` flag to avoid this.

### Updater signatures

If you see "No artifacts were found" on Windows, ensure `uploadUpdaterSignatures: false` is set in the tauri-action config. Without signing keys configured, `.sig` files won't be generated, and the action may fail looking for them.

---

## GitHub Token Permissions

The workflow uses `GITHUB_TOKEN` which is automatically provided. Ensure the repository has:

- Settings → Actions → Workflow permissions → "Read and write permissions" enabled

---

## Release Flow

1. Update version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
2. Update `CHANGELOG.md`
3. Commit changes
4. Create and push tag: `git tag v0.5.0 && git push origin v0.5.0`
5. GitHub Actions builds all platforms
6. Draft release is created with all artifacts
7. Review and publish the release

---

## Open Questions

1. **Universal macOS binary**: Should we create a universal binary (arm64 + x86_64)? Currently building separate binaries for each architecture.

2. **Release notes automation**: Should we auto-generate release notes from commits, or manually write them?

3. **Version validation**: Should the workflow verify that the tag version matches the versions in config files?

---

## Testing Strategy

1. Create workflow file on a feature branch
2. Use `workflow_dispatch` to manually trigger
3. Verify each platform builds successfully
4. Create a test tag (e.g., `v0.0.0-test.1`)
5. Verify release is created with all artifacts
6. Delete test release and tag
7. Merge workflow to main

---

## README Updates Plan

Add the following sections to README:

### Download Section

```markdown
## Download

[![Latest Release](https://img.shields.io/github/v/release/username/sebcat-vj)](https://github.com/username/sebcat-vj/releases/latest)

Download the latest version for your platform:

| Platform              | Download                               |
| --------------------- | -------------------------------------- |
| macOS (Apple Silicon) | [sebcat-vj_x.x.x_aarch64.dmg](link)    |
| macOS (Intel)         | [sebcat-vj_x.x.x_x64.dmg](link)        |
| Windows               | [sebcat-vj_x.x.x_x64-setup.exe](link)  |
| Linux                 | [sebcat-vj_x.x.x_amd64.AppImage](link) |

### macOS Installation

The app is not code-signed. On first launch:

1. Right-click the app in Finder
2. Select "Open" from the context menu
3. Click "Open" in the security dialog

Alternatively, run in Terminal:
\`\`\`bash
xattr -cr /Applications/sebcat-vj.app
\`\`\`
```

---

## Progress

- [x] Research tauri-action and Tauri CI/CD docs
- [x] Create task document with implementation plan
- [x] Create `.github/workflows/release.yml`
- [x] Update README with download instructions
- [ ] Push to repo and test workflow with manual dispatch
- [ ] Create test release to verify full flow
- [ ] Archive task document to `docs/finished/`

---

## References

- [Tauri GitHub Actions Guide](https://v2.tauri.app/distribute/pipelines/github/)
- [tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release)
- Current packaging scripts: `scripts/package.sh`, `scripts/install-syphon.sh`
