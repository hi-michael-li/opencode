#!/usr/bin/env bash
set -e

# Default values
REPO="hi-michael-li/opencode"
VERSION="${VERSION:-v1.0.105-trajectory}"
INSTALL_DIR="${OPENCODE_INSTALL_DIR:-$HOME/.opencode/bin}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    echo -e "${GREEN}==>${NC} $1"
}

warn() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

error() {
    echo -e "${RED}Error:${NC} $1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    local os arch
    
    case "$(uname -s)" in
        Darwin*)
            os="darwin"
            ;;
        Linux*)
            os="linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            os="windows"
            ;;
        *)
            error "Unsupported operating system: $(uname -s)"
            ;;
    esac
    
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x64"
            ;;
        arm64|aarch64)
            arch="arm64"
            ;;
        *)
            error "Unsupported architecture: $(uname -m)"
            ;;
    esac
    
    echo "${os}-${arch}"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --help)
            echo "Usage: install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --version VERSION       Install specific version (default: v1.0.105-trajectory)"
            echo "  --install-dir DIR       Installation directory (default: ~/.opencode/bin)"
            echo "  --help                  Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  VERSION                 Version to install"
            echo "  OPENCODE_INSTALL_DIR    Installation directory"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Detect platform
PLATFORM=$(detect_platform)
info "Detected platform: $PLATFORM"

# Determine file extension
if [[ "$PLATFORM" == linux-* ]]; then
    EXT="tar.gz"
else
    EXT="zip"
fi

# Construct download URL
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/opencode-${PLATFORM}.${EXT}"
info "Installing version: $VERSION"

# Create temporary directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

info "Downloading opencode..."
if ! curl -fsSL "$DOWNLOAD_URL" -o "$TMP_DIR/opencode.${EXT}"; then
    error "Failed to download from $DOWNLOAD_URL"
fi

info "Extracting binary..."
if [[ "$EXT" == "zip" ]]; then
    if ! command -v unzip &> /dev/null; then
        error "unzip is required but not installed"
    fi
    unzip -q -o "$TMP_DIR/opencode.${EXT}" -d "$TMP_DIR"
else
    tar -xzf "$TMP_DIR/opencode.${EXT}" -C "$TMP_DIR"
fi

# Create install directory
info "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

# Move binary and make executable
if [[ "$PLATFORM" == windows-* ]]; then
    mv "$TMP_DIR/opencode.exe" "$INSTALL_DIR/"
    BINARY_PATH="$INSTALL_DIR/opencode.exe"
else
    mv "$TMP_DIR/opencode" "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/opencode"
    BINARY_PATH="$INSTALL_DIR/opencode"
fi

info "Successfully installed opencode to $BINARY_PATH"

# Check if install directory is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    warn "Install directory is not in your PATH"
    echo ""
    echo "Add the following to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo ""
else
    info "opencode is ready to use!"
fi

# Verify installation
if "$BINARY_PATH" --version &> /dev/null; then
    INSTALLED_VERSION=$("$BINARY_PATH" --version)
    info "Installed version: $INSTALLED_VERSION"
else
    warn "Could not verify installation"
fi
