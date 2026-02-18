#!/bin/bash
# setup-tx.sh — Install tx (trillionx.dev) for dev environment provisioning
# Run after first boot: /usr/local/bin/setup-tx.sh
# Does NOT require root — installs to ~/.tx/bin/

set -euo pipefail

# tx installs to ~/.tx/bin/ — running as root would install to /root/.tx/bin/
if [ "$(id -u)" -eq 0 ]; then
    echo "Error: do not run as root. Run without sudo: /usr/local/bin/setup-tx.sh"
    exit 1
fi

# Check network connectivity
if ! curl -fsSL --head https://trillionx.dev > /dev/null 2>&1; then
    echo "Error: cannot reach trillionx.dev. Check your network connection and try again."
    exit 1
fi

echo "=== Installing tx ==="

curl -fsSL https://trillionx.dev/install.sh | sh

echo "=== tx installed ==="
echo ""
echo "Next steps — set up your dev environment:"
echo "  git clone https://github.com/ryanatkn/setup.git ~/dev/setup"
echo "  cd ~/dev/setup"
echo "  tx apply setup_tx/tx.ts          # preview (dry run)"
echo "  tx apply setup_tx/tx.ts --wetrun # execute"
