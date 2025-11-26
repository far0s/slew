#!/bin/bash
#
# NDI SDK Installer for sebcat-vj
#
# This script helps install the NDI SDK required for NDI video output.
# The NDI SDK must be downloaded manually from NewTek's website due to
# licensing requirements, but this script will guide you through the
# process and verify the installation.
#
# Usage:
#   ./scripts/install-ndi.sh
#
# Options:
#   --check          Only check if NDI SDK is installed
#   --help           Show this help message
#
# Supported Platforms:
#   - macOS (Intel and Apple Silicon)
#   - Linux (x86_64)
#   - Windows (via WSL or Git Bash)
#

set -e

# Configuration
NDI_DOWNLOAD_URL="https://ndi.video/for-developers/ndi-sdk/download/"
NDI_VERSION="6"

# Expected installation paths by platform
NDI_MACOS_PATH="/Library/NDI SDK for Apple"
NDI_LINUX_PATH="/usr/share/NDI SDK for Linux"
NDI_WINDOWS_PATH="/c/Program Files/NDI/NDI ${NDI_VERSION} SDK"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Parse command line arguments
CHECK_ONLY=false
for arg in "$@"; do
    case $arg in
        --check)
            CHECK_ONLY=true
            shift
            ;;
        --help|-h)
            echo "NDI SDK Installer for sebcat-vj"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --check    Only check if NDI SDK is installed"
            echo "  --help     Show this help message"
            echo ""
            echo "This script guides you through installing the NDI SDK,"
            echo "which is required for NDI video output functionality."
            exit 0
            ;;
    esac
done

echo "╔════════════════════════════════════════════════════════════╗"
echo "║            NDI SDK Installer for sebcat-vj                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Detect operating system
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            OS="macos"
            NDI_SDK_PATH="$NDI_MACOS_PATH"
            NDI_HEADER_PATH="$NDI_SDK_PATH/include"
            NDI_LIB_PATH="$NDI_SDK_PATH/lib"
            ;;
        Linux*)
            OS="linux"
            # Check for custom path via environment variable
            if [[ -n "$NDI_SDK_DIR" ]]; then
                NDI_SDK_PATH="$NDI_SDK_DIR"
            else
                NDI_SDK_PATH="$NDI_LINUX_PATH"
            fi
            NDI_HEADER_PATH="$NDI_SDK_PATH/include"
            NDI_LIB_PATH="$NDI_SDK_PATH/lib/x86_64-linux-gnu"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS="windows"
            # Check for custom path via environment variable
            if [[ -n "$NDI_SDK_DIR" ]]; then
                NDI_SDK_PATH="$NDI_SDK_DIR"
            else
                NDI_SDK_PATH="$NDI_WINDOWS_PATH"
            fi
            NDI_HEADER_PATH="$NDI_SDK_PATH/Include"
            NDI_LIB_PATH="$NDI_SDK_PATH/Lib/x64"
            ;;
        *)
            OS="unknown"
            ;;
    esac
}

# Check if NDI SDK is installed
check_ndi_installed() {
    local header_found=false
    local lib_found=false

    # Check for header file
    if [[ -f "$NDI_HEADER_PATH/Processing.NDI.Lib.h" ]] || \
       [[ -f "$NDI_HEADER_PATH/Processing.NDI.lib.h" ]]; then
        header_found=true
    fi

    # Check for library (platform-specific)
    case "$OS" in
        macos)
            if [[ -f "$NDI_LIB_PATH/libndi.dylib" ]] || \
               [[ -d "$NDI_LIB_PATH/macOS" ]]; then
                lib_found=true
            fi
            ;;
        linux)
            if [[ -f "$NDI_LIB_PATH/libndi.so" ]] || \
               [[ -f "$NDI_SDK_PATH/lib/x86_64-linux-gnu/libndi.so"* ]]; then
                lib_found=true
            fi
            ;;
        windows)
            if [[ -f "$NDI_LIB_PATH/Processing.NDI.Lib.x64.lib" ]]; then
                lib_found=true
            fi
            ;;
    esac

    if [[ "$header_found" == "true" && "$lib_found" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

# Print installation status
print_status() {
    detect_os

    echo -e "${CYAN}System Information:${NC}"
    echo "  Operating System: $OS"
    if [[ "$OS" == "macos" ]]; then
        echo "  Architecture: $(uname -m)"
        echo "  macOS Version: $(sw_vers -productVersion)"
    elif [[ "$OS" == "linux" ]]; then
        echo "  Architecture: $(uname -m)"
        if [[ -f /etc/os-release ]]; then
            echo "  Distribution: $(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)"
        fi
    fi
    echo ""
    echo -e "${CYAN}Expected NDI SDK Location:${NC}"
    echo "  $NDI_SDK_PATH"
    echo ""

    if check_ndi_installed; then
        echo -e "${GREEN}✓ NDI SDK is installed!${NC}"
        echo ""
        echo "SDK Contents:"
        ls -la "$NDI_SDK_PATH" 2>/dev/null || echo "  (unable to list contents)"
        echo ""

        # Try to get version info
        if [[ -f "$NDI_SDK_PATH/Version.txt" ]]; then
            echo "SDK Version: $(cat "$NDI_SDK_PATH/Version.txt")"
        fi

        return 0
    else
        echo -e "${RED}✗ NDI SDK is NOT installed${NC}"
        echo ""

        # Show what's missing
        if [[ ! -d "$NDI_SDK_PATH" ]]; then
            echo "  - SDK directory not found"
        else
            if [[ ! -f "$NDI_HEADER_PATH/Processing.NDI.Lib.h" ]] && \
               [[ ! -f "$NDI_HEADER_PATH/Processing.NDI.lib.h" ]]; then
                echo "  - Header files not found in $NDI_HEADER_PATH"
            fi
            echo "  - Library files may be missing"
        fi
        echo ""
        return 1
    fi
}

# Print installation instructions
print_instructions() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}                    Installation Instructions${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}The NDI SDK requires manual download due to licensing.${NC}"
    echo ""
    echo -e "${BLUE}Step 1: Download the NDI SDK${NC}"
    echo ""
    echo "  1. Visit: ${CYAN}${NDI_DOWNLOAD_URL}${NC}"
    echo "  2. Create a free account or sign in"
    echo "  3. Download the NDI SDK for your platform:"

    case "$OS" in
        macos)
            echo "     → ${BOLD}NDI SDK for Apple${NC}"
            echo ""
            echo -e "${BLUE}Step 2: Install the SDK${NC}"
            echo ""
            echo "  1. Open the downloaded .pkg installer"
            echo "  2. Follow the installation wizard"
            echo "  3. The SDK will be installed to:"
            echo "     ${CYAN}/Library/NDI SDK for Apple${NC}"
            ;;
        linux)
            echo "     → ${BOLD}NDI SDK for Linux${NC}"
            echo ""
            echo -e "${BLUE}Step 2: Install the SDK${NC}"
            echo ""
            echo "  1. Extract the downloaded archive:"
            echo "     ${CYAN}tar -xzf NDI_SDK_Linux.tar.gz${NC}"
            echo ""
            echo "  2. Move to the expected location:"
            echo "     ${CYAN}sudo mv 'NDI SDK for Linux' /usr/share/${NC}"
            echo ""
            echo "  3. Or set NDI_SDK_DIR to your preferred location:"
            echo "     ${CYAN}export NDI_SDK_DIR=/path/to/ndi-sdk${NC}"
            echo ""
            echo "  4. Install runtime libraries (optional, for running):"
            echo "     ${CYAN}sudo apt install libndi5${NC}  # Ubuntu/Debian"
            echo "     or download NDI Tools from ndi.video"
            ;;
        windows)
            echo "     → ${BOLD}NDI SDK for Windows${NC}"
            echo ""
            echo -e "${BLUE}Step 2: Install the SDK${NC}"
            echo ""
            echo "  1. Run the downloaded installer (.exe)"
            echo "  2. Follow the installation wizard"
            echo "  3. Default installation path:"
            echo "     ${CYAN}C:\\Program Files\\NDI\\NDI ${NDI_VERSION} SDK${NC}"
            echo ""
            echo "  4. Make sure to also install NDI Tools for the runtime"
            ;;
        *)
            echo "     → Choose the SDK for your operating system"
            ;;
    esac

    echo ""
    echo -e "${BLUE}Step 3: Verify Installation${NC}"
    echo ""
    echo "  Run this script again to verify:"
    echo "  ${CYAN}./scripts/install-ndi.sh --check${NC}"
    echo ""
    echo -e "${BLUE}Step 4: Build with NDI Support${NC}"
    echo ""
    echo "  Once the SDK is installed, build sebcat-vj with NDI:"
    echo "  ${CYAN}cd src-tauri && cargo build --features ndi${NC}"
    echo ""
    echo "  Or for development:"
    echo "  ${CYAN}npm run tauri dev -- -- --features ndi${NC}"
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Print success message with next steps
print_success() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}                    NDI SDK Ready!${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Platform-specific runtime instructions
    case "$OS" in
        macos)
            echo -e "${YELLOW}⚠️  IMPORTANT: macOS Runtime Configuration${NC}"
            echo ""
            echo "The NDI library must be discoverable at runtime. You have two options:"
            echo ""
            echo -e "${BOLD}Option 1: Set DYLD_LIBRARY_PATH (recommended for development)${NC}"
            echo ""
            echo "  Add this to your ~/.zshrc or ~/.bash_profile:"
            echo ""
            echo "  ${CYAN}export DYLD_LIBRARY_PATH=\"/Library/NDI SDK for Apple/lib/macOS:\$DYLD_LIBRARY_PATH\"${NC}"
            echo ""
            echo "  Then restart your terminal or run: ${CYAN}source ~/.zshrc${NC}"
            echo ""
            echo -e "${BOLD}Option 2: Use the provided launch script${NC}"
            echo ""
            echo "  ${CYAN}npm run tauri:ndi${NC}"
            echo ""
            echo "  This script sets the library path automatically."
            echo ""
            ;;
        linux)
            echo -e "${YELLOW}⚠️  IMPORTANT: Linux Runtime Configuration${NC}"
            echo ""
            echo "The NDI library must be discoverable at runtime. Add to ~/.bashrc:"
            echo ""
            echo "  ${CYAN}export LD_LIBRARY_PATH=\"/usr/share/NDI SDK for Linux/lib/x86_64-linux-gnu:\$LD_LIBRARY_PATH\"${NC}"
            echo ""
            echo "Or install the NDI runtime package if available for your distribution."
            echo ""
            ;;
        windows)
            echo "The NDI SDK installer should have added the runtime to your PATH."
            echo "If not, add this to your system PATH:"
            echo ""
            echo "  ${CYAN}C:\\Program Files\\NDI\\NDI 6 SDK\\Bin\\x64${NC}"
            echo ""
            ;;
    esac

    echo -e "${BOLD}Build Commands:${NC}"
    echo ""
    echo "  Build with NDI support:"
    echo "  ${CYAN}cd src-tauri && cargo build --features ndi${NC}"
    echo ""
    echo "  Development (with NDI):"
    echo "  ${CYAN}npm run tauri:ndi${NC}"
    echo ""
    echo -e "${BOLD}Testing NDI Output:${NC}"
    echo ""
    echo "  1. Start the app with NDI feature enabled"
    echo "  2. Enable NDI in the Video tab (Debug Panel)"
    echo "  3. Open one of these to receive the stream:"
    echo "     - NDI Monitor (part of NDI Tools)"
    echo "     - OBS Studio with NDI plugin"
    echo "     - Resolume Arena/Avenue"
    echo "     - Any NDI-compatible software"
    echo ""
    echo "  The source will appear as 'sebcat-vj' on your network."
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Offer to open download page
open_download_page() {
    echo ""
    read -p "Would you like to open the NDI download page now? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo "Opening ${NDI_DOWNLOAD_URL}..."
        case "$OS" in
            macos)
                open "$NDI_DOWNLOAD_URL"
                ;;
            linux)
                if command -v xdg-open &>/dev/null; then
                    xdg-open "$NDI_DOWNLOAD_URL"
                elif command -v gnome-open &>/dev/null; then
                    gnome-open "$NDI_DOWNLOAD_URL"
                else
                    echo "Please open this URL in your browser:"
                    echo "  $NDI_DOWNLOAD_URL"
                fi
                ;;
            windows)
                start "$NDI_DOWNLOAD_URL" 2>/dev/null || \
                explorer "$NDI_DOWNLOAD_URL" 2>/dev/null || \
                echo "Please open this URL in your browser: $NDI_DOWNLOAD_URL"
                ;;
            *)
                echo "Please open this URL in your browser:"
                echo "  $NDI_DOWNLOAD_URL"
                ;;
        esac
        echo ""
        echo "After installing the SDK, run this script again to verify:"
        echo "  ${CYAN}./scripts/install-ndi.sh --check${NC}"
    fi
}

# Main execution
detect_os

if [[ "$OS" == "unknown" ]]; then
    echo -e "${RED}Error: Unsupported operating system${NC}"
    echo "NDI SDK is available for macOS, Linux, and Windows."
    exit 1
fi

if print_status; then
    # SDK is installed
    if [[ "$CHECK_ONLY" == "false" ]]; then
        print_success
    fi
    exit 0
else
    # SDK is not installed
    if [[ "$CHECK_ONLY" == "true" ]]; then
        echo "Run without --check for installation instructions."
        exit 1
    fi

    print_instructions
    open_download_page
    exit 1
fi
