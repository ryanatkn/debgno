#!/bin/bash
# debgno-setup-zap.sh — Install zap (zap.fuz.dev) for dev environment provisioning
# Run after first boot: /usr/local/bin/debgno-setup-zap.sh
# Does NOT require root — installs to ~/.zap/bin/

set -euo pipefail

# zap installs to ~/.zap/bin/ — running as root would install to /root/.zap/bin/
if [ "$(id -u)" -eq 0 ]; then
    echo "Error: do not run as root. Run without sudo: /usr/local/bin/debgno-setup-zap.sh"
    exit 1
fi

# Check network connectivity
if ! curl -fsSL --head https://zap.fuz.dev > /dev/null 2>&1; then
    echo "Error: cannot reach zap.fuz.dev. Check your network connection and try again."
    exit 1
fi

echo "=== Installing zap ==="

curl -fsSL https://zap.fuz.dev/install.sh | sh

echo "=== zap installed ==="
echo ""
echo "Run your zap config to provision your dev environment:"
echo "  zap apply <your-config>.ts          # preview (dry run)"
echo "  zap apply <your-config>.ts --wetrun # execute"
