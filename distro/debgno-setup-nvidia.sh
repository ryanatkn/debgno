#!/bin/bash
# debgno-setup-nvidia.sh — Optional NVIDIA proprietary driver + Wayland configuration
# Run manually after first boot: sudo /usr/local/bin/debgno-setup-nvidia.sh

set -euo pipefail

# --- 4a. Check prerequisites ---

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: must run as root (sudo /usr/local/bin/debgno-setup-nvidia.sh)"
    exit 1
fi

if ! wget -q --spider https://deb.debian.org 2>/dev/null; then
    echo "Error: no network connection. Connect via Settings > Wi-Fi, then re-run this script."
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "=== Installing NVIDIA proprietary driver ==="

# --- 4b. Install NVIDIA packages ---
# Intentionally no --no-install-recommends: NVIDIA recommends (nvidia-settings,
# nvidia-persistenced, etc.) are useful for a desktop setup.

apt-get update
apt-get install -y \
    nvidia-driver \
    nvidia-driver-libs \
    nvidia-suspend-common

echo "=== NVIDIA packages installed ==="

# --- 4c. Configure GRUB for kernel modesetting ---

cat > /etc/default/grub.d/nvidia-modeset.cfg << 'EOF'
GRUB_CMDLINE_LINUX="$GRUB_CMDLINE_LINUX nvidia-drm.modeset=1 nvidia-drm.fbdev=1"
EOF

update-grub

echo "=== GRUB configured ==="

# --- 4d. Configure kernel modules ---

cat > /etc/modprobe.d/nvidia-power.conf << 'EOF'
options nvidia NVreg_PreserveVideoMemoryAllocations=1
EOF

cat > /etc/modprobe.d/blacklist-nouveau.conf << 'EOF'
blacklist nouveau
options nouveau modeset=0
EOF

echo "=== Kernel modules configured ==="

# --- 4e. Enable systemd services (required for GDM Wayland) ---

systemctl enable nvidia-suspend.service
systemctl enable nvidia-hibernate.service
systemctl enable nvidia-resume.service

echo "=== Systemd services enabled ==="

# --- 4f. Rebuild initramfs ---

update-initramfs -u

echo "=== debgno-setup-nvidia.sh complete ==="
echo "NVIDIA setup complete. Reboot to use Wayland with NVIDIA."
