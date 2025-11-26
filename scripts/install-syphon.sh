#!/bin/bash
#
# Syphon Framework Installer for sebcat-vj
#
# This script downloads and installs the Syphon framework required
# for video output on macOS.
#
# On Apple Silicon (arm64), it builds Syphon from source as a universal binary
# since the official SDK only provides x86_64 binaries.
#
# Usage:
#   ./scripts/install-syphon.sh
#
# Options:
#   --force-build    Force building from source even on Intel Macs
#   --clean          Remove existing framework before installing
#
# The framework will be installed to src-tauri/frameworks/Syphon.framework
#

set -e

# Configuration
SYPHON_VERSION="5"
SYPHON_SDK_URL="https://github.com/Syphon/Syphon-Framework/releases/download/5/Syphon.SDK.5.zip"
SYPHON_REPO_URL="https://github.com/Syphon/Syphon-Framework.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
FRAMEWORKS_DIR="$PROJECT_ROOT/src-tauri/frameworks"
TEMP_DIR=$(mktemp -d)

# Parse command line arguments
FORCE_BUILD=false
CLEAN_INSTALL=false
for arg in "$@"; do
    case $arg in
        --force-build)
            FORCE_BUILD=true
            shift
            ;;
        --clean)
            CLEAN_INSTALL=true
            shift
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Syphon Framework Installer for sebcat-vj          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}Error: This script only runs on macOS${NC}"
    exit 1
fi

# Detect architecture
ARCH=$(uname -m)
IS_ARM64=false
if [[ "$ARCH" == "arm64" ]]; then
    IS_ARM64=true
fi

echo -e "${CYAN}System Information:${NC}"
echo "  Architecture: $ARCH"
echo "  macOS Version: $(sw_vers -productVersion)"
echo ""

# Determine if we need to build from source
NEEDS_BUILD=false
if [[ "$FORCE_BUILD" == "true" ]]; then
    NEEDS_BUILD=true
    echo -e "${YELLOW}Force build requested - will build from source${NC}"
elif [[ "$IS_ARM64" == "true" ]]; then
    NEEDS_BUILD=true
    echo -e "${YELLOW}Apple Silicon detected - will build from source${NC}"
    echo -e "${YELLOW}(Official SDK only provides x86_64 binaries)${NC}"
fi
echo ""

# Check if framework already exists
if [[ -d "$FRAMEWORKS_DIR/Syphon.framework" ]]; then
    if [[ "$CLEAN_INSTALL" == "true" ]]; then
        echo "Removing existing framework (--clean)..."
        rm -rf "$FRAMEWORKS_DIR/Syphon.framework"
    else
        # Check existing framework architecture
        EXISTING_ARCH=$(lipo -info "$FRAMEWORKS_DIR/Syphon.framework/Syphon" 2>/dev/null || echo "unknown")
        echo -e "${YELLOW}Syphon.framework already exists at:${NC}"
        echo "  $FRAMEWORKS_DIR/Syphon.framework"
        echo "  Architecture: $EXISTING_ARCH"
        echo ""

        # Check if existing framework matches our needs
        if [[ "$IS_ARM64" == "true" && "$EXISTING_ARCH" != *"arm64"* ]]; then
            echo -e "${YELLOW}⚠ Existing framework is x86_64 only but you're on Apple Silicon${NC}"
            read -p "Rebuild with arm64 support? (Y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Nn]$ ]]; then
                echo "Installation cancelled."
                exit 0
            fi
            rm -rf "$FRAMEWORKS_DIR/Syphon.framework"
        else
            read -p "Do you want to reinstall? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo "Installation cancelled."
                exit 0
            fi
            rm -rf "$FRAMEWORKS_DIR/Syphon.framework"
        fi
    fi
fi

# Create frameworks directory if needed
mkdir -p "$FRAMEWORKS_DIR"

# Function to build Syphon from source
build_from_source() {
    echo ""
    echo -e "${BLUE}Building Syphon from source...${NC}"
    echo ""

    # Check for Xcode
    if ! xcode-select -p &>/dev/null; then
        echo -e "${RED}Error: Xcode is required to build Syphon from source${NC}"
        echo ""
        echo "Please install Xcode from the App Store and run:"
        echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
        echo ""
        echo "Alternatively, if you have Xcode installed but need to select it:"
        echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    # Verify xcodebuild works
    if ! xcodebuild -version &>/dev/null; then
        echo -e "${RED}Error: xcodebuild not available${NC}"
        echo ""
        echo "You may have Command Line Tools selected instead of Xcode."
        echo "Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    echo "Xcode version: $(xcodebuild -version | head -1)"
    echo ""

    # Run first launch setup if needed
    echo "Running Xcode first launch setup..."
    xcodebuild -runFirstLaunch 2>/dev/null || true

    # Download Metal toolchain if needed (required for Syphon's Metal shaders)
    echo "Checking Metal toolchain..."
    if ! xcodebuild -downloadComponent MetalToolchain 2>&1 | grep -q "already installed"; then
        echo "Downloaded Metal toolchain"
    fi
    echo ""

    # Clone the repository
    echo "Cloning Syphon-Framework repository..."
    git clone --depth 1 "$SYPHON_REPO_URL" "$TEMP_DIR/Syphon-Framework"

    cd "$TEMP_DIR/Syphon-Framework"

    # Build for both architectures (universal binary)
    echo ""
    echo "Building universal binary (arm64 + x86_64)..."
    echo ""

    # Build Release configuration
    BUILD_OUTPUT=$(xcodebuild \
        -project Syphon.xcodeproj \
        -scheme Syphon \
        -configuration Release \
        ARCHS="arm64 x86_64" \
        ONLY_ACTIVE_ARCH=NO \
        build \
        2>&1)

    # Check for build success
    if echo "$BUILD_OUTPUT" | grep -q "BUILD SUCCEEDED"; then
        echo -e "${GREEN}Build succeeded${NC}"
    else
        echo -e "${RED}Build failed${NC}"
        echo "$BUILD_OUTPUT" | grep -E "^(error:|warning:)" | head -20
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    # Find the built framework in DerivedData
    echo ""
    echo "Locating built framework..."

    # Look for the Products/Release version (the final build output)
    FRAMEWORK_PATH=$(find ~/Library/Developer/Xcode/DerivedData -path "*/Build/Products/Release/Syphon.framework" -type d 2>/dev/null | head -1)

    if [[ -z "$FRAMEWORK_PATH" || ! -d "$FRAMEWORK_PATH" ]]; then
        echo -e "${RED}Error: Built framework not found${NC}"
        echo "Expected location: ~/Library/Developer/Xcode/DerivedData/Syphon-*/Build/Products/Release/Syphon.framework"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    echo "Found framework at: $FRAMEWORK_PATH"

    # Verify it's a universal binary
    BUILT_ARCH=$(lipo -info "$FRAMEWORK_PATH/Syphon" 2>/dev/null || echo "unknown")
    echo "Architecture: $BUILT_ARCH"

    if [[ "$BUILT_ARCH" != *"arm64"* || "$BUILT_ARCH" != *"x86_64"* ]]; then
        echo -e "${YELLOW}Warning: Framework may not be universal${NC}"
    fi

    # Copy the built framework
    echo ""
    echo "Installing built framework..."
    cp -R "$FRAMEWORK_PATH" "$FRAMEWORKS_DIR/"

    cd "$PROJECT_ROOT"
}

# Function to download pre-built SDK
download_prebuilt() {
    echo ""
    echo -e "${BLUE}Downloading pre-built Syphon SDK v${SYPHON_VERSION}...${NC}"
    echo "  URL: $SYPHON_SDK_URL"
    echo ""

    curl -L -o "$TEMP_DIR/syphon.zip" "$SYPHON_SDK_URL" --progress-bar

    if [[ ! -f "$TEMP_DIR/syphon.zip" ]]; then
        echo -e "${RED}Error: Failed to download Syphon SDK${NC}"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    # Extract the archive
    echo ""
    echo "Extracting archive..."
    unzip -q "$TEMP_DIR/syphon.zip" -d "$TEMP_DIR"

    # Find the framework in the extracted contents
    FRAMEWORK_PATH=$(find "$TEMP_DIR" -name "Syphon.framework" -type d | head -n 1)

    if [[ -z "$FRAMEWORK_PATH" ]]; then
        echo -e "${RED}Error: Syphon.framework not found in downloaded archive${NC}"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    # Copy framework to destination
    echo "Installing framework..."
    cp -R "$FRAMEWORK_PATH" "$FRAMEWORKS_DIR/"
}

# Install based on architecture needs
if [[ "$NEEDS_BUILD" == "true" ]]; then
    build_from_source
else
    download_prebuilt
fi

# Set permissions
chmod -R 755 "$FRAMEWORKS_DIR/Syphon.framework"

# Cleanup
rm -rf "$TEMP_DIR"

# Verify installation
if [[ -d "$FRAMEWORKS_DIR/Syphon.framework" ]]; then
    echo ""
    echo -e "${GREEN}✓ Syphon.framework installed successfully!${NC}"
    echo ""
    echo "Installed to:"
    echo "  $FRAMEWORKS_DIR/Syphon.framework"
    echo ""

    # Show architecture info
    INSTALLED_ARCH=$(lipo -info "$FRAMEWORKS_DIR/Syphon.framework/Syphon" 2>/dev/null || echo "unknown")
    echo "Framework architecture: $INSTALLED_ARCH"
    echo ""

    # Verify compatibility
    if [[ "$IS_ARM64" == "true" && "$INSTALLED_ARCH" != *"arm64"* ]]; then
        echo -e "${YELLOW}⚠ Warning: Framework does not include arm64 architecture${NC}"
        echo "  The app may need to run under Rosetta 2"
        echo ""
    fi

    echo "Framework contents:"
    ls -la "$FRAMEWORKS_DIR/Syphon.framework/"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Next steps:"
    echo "  1. Rebuild the app:  npm run tauri dev"
    echo "  2. Enable Syphon in the Video tab"
    echo "  3. Open Resolume Arena → Sources → Syphon → sebcat-vj"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo -e "${RED}Error: Framework installation failed${NC}"
    exit 1
fi
