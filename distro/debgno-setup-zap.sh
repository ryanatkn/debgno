#!/bin/bash
# debgno-setup-zap.sh — Build zap (https://github.com/fuzdev/zap) from source for dev environment provisioning
# Run after first boot: /usr/local/bin/debgno-setup-zap.sh [source-dir]
# Does NOT require root — clones fuz + zap side by side into source-dir
# (default ~/dev) and installs the binary to ~/.zap/bin/

set -euo pipefail

# zap installs to ~/.zap/bin/ — running as root would install to /root/.zap/bin/
if [ "$(id -u)" -eq 0 ]; then
    echo "Error: do not run as root. Run without sudo: /usr/local/bin/debgno-setup-zap.sh"
    exit 1
fi

SRC_DIR="${1:-$HOME/dev}"

# zap builds from source with a Rust toolchain (rustup installs the pinned one),
# which links with the system C compiler
for tool in git cc cargo; do
    if ! command -v "$tool" > /dev/null 2>&1; then
        echo "Error: $tool not found."
        echo "zap builds from source: install git and a C toolchain"
        echo "(sudo apt install git build-essential), then Rust via rustup (https://rustup.rs),"
        echo "then re-run. Full instructions: https://github.com/fuzdev/zap/blob/main/docs/install.md"
        exit 1
    fi
done

# Check network connectivity
if ! curl -fsSL --head https://github.com > /dev/null 2>&1; then
    echo "Error: cannot reach github.com. Check your network connection and try again."
    exit 1
fi

echo "=== Building zap from source in $SRC_DIR ==="

# zap depends on crates from the sibling fuz repo, resolved by relative path
mkdir -p "$SRC_DIR"
for repo in fuz zap; do
    if [ -e "$SRC_DIR/$repo/.git" ]; then
        echo "Using existing checkout (not updated): $SRC_DIR/$repo"
    else
        git clone "https://github.com/fuzdev/$repo" "$SRC_DIR/$repo"
    fi
done

(cd "$SRC_DIR/zap" && cargo xtask install)

echo "=== zap installed to ~/.zap/bin/zap ==="
echo ""
echo "Add ~/.zap/bin to your PATH, then build fgro (Gro's runtime, which evaluates zap configs):"
echo "  https://github.com/fuzdev/zap/blob/main/docs/install.md#getting-fgro"
echo ""
echo "Run your zap config to provision your dev environment:"
echo "  zap apply <your-config>.ts          # preview (dry run)"
echo "  zap apply <your-config>.ts --wetrun # execute"
