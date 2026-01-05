#!/bin/bash
#
# Slew Packaging Script
#
# This script prepares and builds distributable packages for Slew.
# It handles framework dependencies, code signing, and bundle creation.
#
# Usage:
#   ./scripts/package.sh [options]
#
# Options:
#   --release         Build release version (default)
#   --debug           Build debug version with dev tools
#   --no-ndi          Build without NDI support
#   --sign            Code sign the app (requires signing identity)
#   --notarize        Notarize the app for distribution (requires credentials)
#   --dmg             Create DMG installer (macOS only)
#   --clean           Clean build artifacts before building
#   --check           Only check prerequisites, don't build
#   --help            Show this help message
#
# Environment Variables:
#   APPLE_SIGNING_IDENTITY    Apple Developer signing identity
#   APPLE_ID                  Apple ID for notarization
#   APPLE_TEAM_ID             Apple Team ID for notarization
#   APPLE_PASSWORD            App-specific password for notarization
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_DIR="$PROJECT_ROOT/src-tauri"
FRAMEWORKS_DIR="$TAURI_DIR/frameworks"
TARGET_DIR="$TAURI_DIR/target"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Default options
BUILD_TYPE="release"
INCLUDE_NDI=true
DO_SIGN=false
DO_NOTARIZE=false
CREATE_DMG=false
DO_CLEAN=false
CHECK_ONLY=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --release)
            BUILD_TYPE="release"
            shift
            ;;
        --debug)
            BUILD_TYPE="debug"
            shift
            ;;
        --no-ndi)
            INCLUDE_NDI=false
            shift
            ;;
        --sign)
            DO_SIGN=true
            shift
            ;;
        --notarize)
            DO_NOTARIZE=true
            DO_SIGN=true  # Notarization requires signing
            shift
            ;;
        --dmg)
            CREATE_DMG=true
            shift
            ;;
        --clean)
            DO_CLEAN=true
            shift
            ;;
        --check)
            CHECK_ONLY=true
            shift
            ;;
        --help|-h)
            head -40 "$0" | tail -35
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "╔════════════════════════════════════════════════════════════╗"
echo "║                 Slew Packaging Script                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Detect platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*)
            PLATFORM="macos"
            BUNDLE_EXT=".app"
            ;;
        Linux*)
            PLATFORM="linux"
            BUNDLE_EXT=""
            ;;
        CYGWIN*|MINGW*|MSYS*)
            PLATFORM="windows"
            BUNDLE_EXT=".exe"
            ;;
        *)
            PLATFORM="unknown"
            ;;
    esac
}

detect_platform

echo -e "${CYAN}Build Configuration:${NC}"
echo "  Platform: $PLATFORM"
echo "  Build Type: $BUILD_TYPE"
echo "  Include NDI: $INCLUDE_NDI"
echo "  Code Sign: $DO_SIGN"
echo "  Notarize: $DO_NOTARIZE"
echo "  Create DMG: $CREATE_DMG"
echo ""

# Check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    echo ""

    local has_errors=false

    # Check Node.js
    if command -v node &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Node.js $(node --version)"
    else
        echo -e "  ${RED}✗${NC} Node.js not found"
        has_errors=true
    fi

    # Check npm
    if command -v npm &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} npm $(npm --version)"
    else
        echo -e "  ${RED}✗${NC} npm not found"
        has_errors=true
    fi

    # Check Rust
    if command -v rustc &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Rust $(rustc --version | cut -d' ' -f2)"
    else
        echo -e "  ${RED}✗${NC} Rust not found"
        has_errors=true
    fi

    # Check Cargo
    if command -v cargo &>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Cargo $(cargo --version | cut -d' ' -f2)"
    else
        echo -e "  ${RED}✗${NC} Cargo not found"
        has_errors=true
    fi

    # Check Tauri CLI
    if npm list @tauri-apps/cli &>/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Tauri CLI installed"
    else
        echo -e "  ${RED}✗${NC} Tauri CLI not found (run: npm install)"
        has_errors=true
    fi

    # Platform-specific checks
    if [[ "$PLATFORM" == "macos" ]]; then
        # Check Xcode
        if xcode-select -p &>/dev/null; then
            echo -e "  ${GREEN}✓${NC} Xcode Command Line Tools"
        else
            echo -e "  ${RED}✗${NC} Xcode Command Line Tools not found"
            has_errors=true
        fi

        # Check Syphon.framework
        if [[ -d "$FRAMEWORKS_DIR/Syphon.framework" ]]; then
            local syphon_arch=$(lipo -info "$FRAMEWORKS_DIR/Syphon.framework/Syphon" 2>/dev/null | tail -1)
            echo -e "  ${GREEN}✓${NC} Syphon.framework ($syphon_arch)"
        else
            echo -e "  ${YELLOW}!${NC} Syphon.framework not found (run: ./scripts/install-syphon.sh)"
        fi

        # Check NDI SDK (if NDI is enabled)
        if [[ "$INCLUDE_NDI" == "true" ]]; then
            if [[ -d "/Library/NDI SDK for Apple" ]]; then
                echo -e "  ${GREEN}✓${NC} NDI SDK installed"
            else
                echo -e "  ${YELLOW}!${NC} NDI SDK not found (run: ./scripts/install-ndi.sh)"
                echo "     Building without NDI will be possible with --no-ndi"
            fi
        fi

        # Check code signing identity (if signing enabled)
        if [[ "$DO_SIGN" == "true" ]]; then
            if [[ -n "$APPLE_SIGNING_IDENTITY" ]]; then
                echo -e "  ${GREEN}✓${NC} Signing identity: $APPLE_SIGNING_IDENTITY"
            else
                # Try to find any valid identity
                local identity=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1)
                if [[ -n "$identity" ]]; then
                    echo -e "  ${GREEN}✓${NC} Found signing identity"
                else
                    echo -e "  ${RED}✗${NC} No signing identity found"
                    echo "     Set APPLE_SIGNING_IDENTITY or install a Developer ID certificate"
                    has_errors=true
                fi
            fi
        fi

        # Check notarization credentials (if notarizing)
        if [[ "$DO_NOTARIZE" == "true" ]]; then
            if [[ -n "$APPLE_ID" && -n "$APPLE_TEAM_ID" && -n "$APPLE_PASSWORD" ]]; then
                echo -e "  ${GREEN}✓${NC} Notarization credentials configured"
            else
                echo -e "  ${RED}✗${NC} Notarization credentials missing"
                echo "     Set APPLE_ID, APPLE_TEAM_ID, and APPLE_PASSWORD"
                has_errors=true
            fi
        fi
    fi

    echo ""

    if [[ "$has_errors" == "true" ]]; then
        echo -e "${RED}Prerequisites check failed${NC}"
        return 1
    else
        echo -e "${GREEN}All prerequisites satisfied${NC}"
        return 0
    fi
}

# Clean build artifacts
clean_build() {
    echo -e "${BLUE}Cleaning build artifacts...${NC}"

    # Clean frontend
    if [[ -d "$PROJECT_ROOT/dist" ]]; then
        rm -rf "$PROJECT_ROOT/dist"
        echo "  Removed dist/"
    fi

    # Clean Rust target (release only to preserve dev builds)
    if [[ "$BUILD_TYPE" == "release" && -d "$TARGET_DIR/release" ]]; then
        rm -rf "$TARGET_DIR/release"
        echo "  Removed target/release/"
    fi

    # Clean bundle output
    if [[ -d "$TARGET_DIR/release/bundle" ]]; then
        rm -rf "$TARGET_DIR/release/bundle"
        echo "  Removed target/release/bundle/"
    fi

    echo ""
}

# Install dependencies
install_dependencies() {
    echo -e "${BLUE}Installing dependencies...${NC}"

    cd "$PROJECT_ROOT"

    # Install npm dependencies
    if [[ ! -d "node_modules" ]] || [[ "package.json" -nt "node_modules" ]]; then
        echo "  Installing npm packages..."
        npm install
    else
        echo "  npm packages up to date"
    fi

    echo ""
}

# Build the application
build_app() {
    echo -e "${BLUE}Building application...${NC}"
    echo ""

    cd "$PROJECT_ROOT"

    # Determine build arguments
    local build_args=""

    if [[ "$BUILD_TYPE" == "debug" ]]; then
        build_args="$build_args --debug"
    fi

    # Set cargo features
    local cargo_features=""
    if [[ "$INCLUDE_NDI" == "false" ]]; then
        cargo_features="--no-default-features"
    fi

    # Build with Tauri
    echo "  Running: npm run tauri build $build_args"

    if [[ -n "$cargo_features" ]]; then
        # Pass cargo features through environment
        TAURI_BUILD_FLAGS="$cargo_features" npm run tauri -- build $build_args
    else
        npm run tauri -- build $build_args
    fi

    echo ""
    echo -e "${GREEN}Build completed${NC}"
}

# Code sign the application (macOS)
sign_app() {
    if [[ "$PLATFORM" != "macos" ]]; then
        echo -e "${YELLOW}Code signing is only supported on macOS${NC}"
        return 0
    fi

    echo -e "${BLUE}Code signing application...${NC}"

    local app_path="$TARGET_DIR/release/bundle/macos/Slew.app"

    if [[ ! -d "$app_path" ]]; then
        echo -e "${RED}App bundle not found at: $app_path${NC}"
        return 1
    fi

    # Determine signing identity
    local identity="$APPLE_SIGNING_IDENTITY"
    if [[ -z "$identity" ]]; then
        identity=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    fi

    if [[ -z "$identity" ]]; then
        echo -e "${RED}No signing identity found${NC}"
        return 1
    fi

    echo "  Signing identity: $identity"

    # Sign the app bundle
    codesign --force --deep --sign "$identity" \
        --options runtime \
        --entitlements "$TAURI_DIR/entitlements.plist" \
        "$app_path"

    # Verify signature
    echo "  Verifying signature..."
    codesign --verify --verbose "$app_path"

    echo ""
    echo -e "${GREEN}Code signing completed${NC}"
}

# Notarize the application (macOS)
notarize_app() {
    if [[ "$PLATFORM" != "macos" ]]; then
        echo -e "${YELLOW}Notarization is only supported on macOS${NC}"
        return 0
    fi

    echo -e "${BLUE}Notarizing application...${NC}"

    local app_path="$TARGET_DIR/release/bundle/macos/Slew.app"
    local zip_path="$TARGET_DIR/release/bundle/macos/Slew-notarize.zip"

    # Create ZIP for notarization
    echo "  Creating ZIP archive..."
    ditto -c -k --keepParent "$app_path" "$zip_path"

    # Submit for notarization
    echo "  Submitting for notarization..."
    xcrun notarytool submit "$zip_path" \
        --apple-id "$APPLE_ID" \
        --team-id "$APPLE_TEAM_ID" \
        --password "$APPLE_PASSWORD" \
        --wait

    # Staple the notarization ticket
    echo "  Stapling notarization ticket..."
    xcrun stapler staple "$app_path"

    # Clean up
    rm -f "$zip_path"

    echo ""
    echo -e "${GREEN}Notarization completed${NC}"
}

# Create DMG installer (macOS)
create_dmg() {
    if [[ "$PLATFORM" != "macos" ]]; then
        echo -e "${YELLOW}DMG creation is only supported on macOS${NC}"
        return 0
    fi

    echo -e "${BLUE}Creating DMG installer...${NC}"

    local bundle_dir="$TARGET_DIR/release/bundle"
    local dmg_path="$bundle_dir/dmg/Slew_$(cat "$PROJECT_ROOT/package.json" | grep '"version"' | sed 's/.*: "\(.*\)".*/\1/')_$(uname -m).dmg"

    if [[ -f "$dmg_path" ]]; then
        echo -e "  ${GREEN}✓${NC} DMG already created at: $dmg_path"
    else
        echo -e "  ${YELLOW}!${NC} DMG not found (Tauri should create it during build)"
    fi

    echo ""
}

# Print build summary
print_summary() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}                      Build Summary${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local bundle_dir="$TARGET_DIR/release/bundle"

    if [[ "$PLATFORM" == "macos" ]]; then
        local app_path="$bundle_dir/macos/Slew.app"
        local dmg_path=$(find "$bundle_dir/dmg" -name "*.dmg" 2>/dev/null | head -1)

        if [[ -d "$app_path" ]]; then
            local app_size=$(du -sh "$app_path" | cut -f1)
            echo -e "  ${GREEN}✓${NC} App Bundle: $app_path"
            echo "    Size: $app_size"

            # Check if signed
            if codesign --verify "$app_path" 2>/dev/null; then
                echo -e "    ${GREEN}✓${NC} Code signed"
            else
                echo -e "    ${YELLOW}!${NC} Not code signed"
            fi
        fi

        if [[ -n "$dmg_path" && -f "$dmg_path" ]]; then
            local dmg_size=$(du -sh "$dmg_path" | cut -f1)
            echo -e "  ${GREEN}✓${NC} DMG Installer: $dmg_path"
            echo "    Size: $dmg_size"
        fi

    elif [[ "$PLATFORM" == "linux" ]]; then
        local appimage_path=$(find "$bundle_dir/appimage" -name "*.AppImage" 2>/dev/null | head -1)
        local deb_path=$(find "$bundle_dir/deb" -name "*.deb" 2>/dev/null | head -1)

        if [[ -n "$appimage_path" && -f "$appimage_path" ]]; then
            echo -e "  ${GREEN}✓${NC} AppImage: $appimage_path"
        fi

        if [[ -n "$deb_path" && -f "$deb_path" ]]; then
            echo -e "  ${GREEN}✓${NC} Debian Package: $deb_path"
        fi

    elif [[ "$PLATFORM" == "windows" ]]; then
        local msi_path=$(find "$bundle_dir/msi" -name "*.msi" 2>/dev/null | head -1)
        local nsis_path=$(find "$bundle_dir/nsis" -name "*.exe" 2>/dev/null | head -1)

        if [[ -n "$msi_path" && -f "$msi_path" ]]; then
            echo -e "  ${GREEN}✓${NC} MSI Installer: $msi_path"
        fi

        if [[ -n "$nsis_path" && -f "$nsis_path" ]]; then
            echo -e "  ${GREEN}✓${NC} NSIS Installer: $nsis_path"
        fi
    fi

    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo ""

    if [[ "$DO_SIGN" == "false" && "$PLATFORM" == "macos" ]]; then
        echo "  • Code sign for distribution: ./scripts/package.sh --sign"
    fi

    if [[ "$DO_NOTARIZE" == "false" && "$DO_SIGN" == "true" && "$PLATFORM" == "macos" ]]; then
        echo "  • Notarize for Gatekeeper: ./scripts/package.sh --notarize"
    fi

    echo "  • Test the app thoroughly before distribution"
    echo "  • Update version number in package.json and Cargo.toml for releases"
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Main execution
main() {
    # Check prerequisites
    if ! check_prerequisites; then
        exit 1
    fi

    if [[ "$CHECK_ONLY" == "true" ]]; then
        exit 0
    fi

    # Clean if requested
    if [[ "$DO_CLEAN" == "true" ]]; then
        clean_build
    fi

    # Install dependencies
    install_dependencies

    # Build the app
    build_app

    # Code sign if requested
    if [[ "$DO_SIGN" == "true" ]]; then
        sign_app
    fi

    # Notarize if requested
    if [[ "$DO_NOTARIZE" == "true" ]]; then
        notarize_app
    fi

    # Create DMG if requested
    if [[ "$CREATE_DMG" == "true" ]]; then
        create_dmg
    fi

    # Print summary
    print_summary
}

main "$@"
