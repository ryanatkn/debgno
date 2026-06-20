#!/bin/bash
# debgno-setup-nvidia.sh — Optional NVIDIA open kernel module driver + Wayland configuration
# Run manually after first boot: sudo /usr/local/bin/debgno-setup-nvidia.sh
#
# KNOWN ISSUE: On some hardware (confirmed: RTX 3060 + driver 550.x + kernel 6.12),
# nvidia-drm.modeset=1 as a kernel parameter causes the system to hang during early
# boot — after LUKS decrypt, before the display manager starts. This is an NVIDIA
# driver timing bug where KMS initializes before the GPU firmware is ready.
#
# If the system hangs after reboot:
#   1. From GRUB, press 'e', change 'ro quiet' to 'rw init=/bin/bash', Ctrl+X
#   2. Enter LUKS passphrase
#   3. Run: apt purge 'nvidia-*' && update-initramfs -u && sync && reboot -f
#   4. Re-run this script with --late-modeset to use the systemd workaround
#
# The --late-modeset flag skips the GRUB kernel parameter and instead creates a
# systemd service that reloads nvidia-drm with modeset=1 late in boot. This is
# safer but non-standard. Use it only if the default approach hangs.
#
# Full documentation: ~/dev/setup/linux/README.md "NVIDIA Drivers"

set -euo pipefail

LATE_MODESET=false
for arg in "$@"; do
    case "$arg" in
        --late-modeset) LATE_MODESET=true ;;
        --help|-h)
            echo "Usage: sudo /usr/local/bin/debgno-setup-nvidia.sh [--late-modeset]"
            echo ""
            echo "Options:"
            echo "  --late-modeset  Use systemd service for nvidia-drm.modeset=1 instead of"
            echo "                  GRUB kernel parameter. Use this if the system hangs on boot"
            echo "                  after a normal install (NVIDIA driver timing bug)."
            exit 0
            ;;
        *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
    esac
done

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

echo "=== Installing NVIDIA open kernel module driver ==="

# --- 4b. Install kernel headers + NVIDIA packages ---
# Headers are required for DKMS to build the nvidia kernel module.
#
# nvidia-open-kernel-dkms builds NVIDIA's official open-source GPU kernel modules
# (github.com/NVIDIA/open-gpu-kernel-modules) instead of the proprietary module. It
# satisfies nvidia-driver's kernel-module dependency via the nvidia-open-kernel-*
# alternative, so the proprietary nvidia-kernel-dkms is never pulled in. The userspace
# driver (nvidia-driver) is identical either way. The open module auto-pulls
# firmware-nvidia-gsp from non-free-firmware (enabled during the debgno install).
#
# Requires a Turing or newer GPU (RTX 20-series / GTX 16-series and up). Pre-Turing
# cards (GTX 10-series Pascal and older) are NOT supported by the open module — those
# need the proprietary nvidia-kernel-dkms instead.
#
# Intentionally no --no-install-recommends: NVIDIA recommends (nvidia-settings,
# nvidia-persistenced, etc.) are useful for a desktop setup.

apt-get update
apt-get install -y \
    linux-headers-$(uname -r) \
    nvidia-driver \
    nvidia-open-kernel-dkms \
    nvidia-vaapi-driver \
    vainfo \
    nvtop

echo "=== NVIDIA packages installed ==="

# --- 4c. Configure nvidia-drm.modeset=1 ---

if [ "$LATE_MODESET" = true ]; then
    echo "=== Using late-modeset workaround (systemd service) ==="

    # Remove GRUB param if present from a previous attempt
    rm -f /etc/default/grub.d/nvidia-modeset.cfg
    # Remove modprobe.d config if present (gets baked into initramfs, same hang)
    rm -f /etc/modprobe.d/nvidia-drm-modeset.conf

    cat > /etc/systemd/system/nvidia-modeset-fix.service << 'UNIT'
[Unit]
Description=Reload nvidia-drm with modeset=1
Before=display-manager.service
After=systemd-modules-load.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c "modprobe -r nvidia-drm; modprobe nvidia-drm modeset=1"

[Install]
WantedBy=graphical.target
UNIT
    systemctl enable nvidia-modeset-fix.service

    update-grub
else
    cat > /etc/default/grub.d/nvidia-modeset.cfg << 'EOF'
GRUB_CMDLINE_LINUX="$GRUB_CMDLINE_LINUX nvidia-drm.modeset=1 nvidia-drm.fbdev=1"
EOF
    update-grub
fi

echo "=== Modeset configured ==="

# --- 4d. Configure kernel modules ---

# Preserve VRAM on suspend/resume (prevents GPU state corruption on wake).
# The nvidia-driver package creates /etc/modprobe.d/nvidia-options.conf with this
# commented out — uncomment it rather than creating a separate file.
if [ -f /etc/modprobe.d/nvidia-options.conf ]; then
    sed -i 's/^#options nvidia-current NVreg_PreserveVideoMemoryAllocations=1/options nvidia-current NVreg_PreserveVideoMemoryAllocations=1/' /etc/modprobe.d/nvidia-options.conf
else
    # Fallback if the package file doesn't exist
    echo 'options nvidia NVreg_PreserveVideoMemoryAllocations=1' > /etc/modprobe.d/nvidia-power.conf
fi

# Nouveau blacklist is managed by the nvidia-driver package via alternatives
# (nvidia-blacklists-nouveau.conf). Verify it's in place rather than creating a duplicate.
if ! grep -q 'blacklist nouveau' /etc/modprobe.d/nvidia-blacklists-nouveau.conf 2>/dev/null; then
    echo "WARNING: nvidia-blacklists-nouveau.conf not found — creating fallback"
    cat > /etc/modprobe.d/blacklist-nouveau.conf << 'EOF'
blacklist nouveau
options nouveau modeset=0
EOF
fi

echo "=== Kernel modules configured ==="

# --- 4e. Enable systemd services (required for GDM Wayland + suspend) ---

systemctl enable nvidia-suspend.service
systemctl enable nvidia-hibernate.service
systemctl enable nvidia-resume.service

echo "=== Systemd services enabled ==="

# --- 4f. Chromium hardware acceleration ---
# Native Wayland + VA-API video decode via nvidia-vaapi-driver.
# Note: chrome://flags/#ignore-gpu-blocklist should also be enabled in the browser.

if [ -d /etc/chromium.d ]; then
    cat > /etc/chromium.d/gpu-accel << 'EOF'
# Native Wayland (avoid XWayland overhead)
export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --ozone-platform=wayland"

# Hardware video decode via VA-API on NVIDIA
export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --enable-features=VaapiVideoDecodeLinuxGL"
EOF
    echo "=== Chromium GPU acceleration configured ==="
else
    echo "=== Chromium not installed, skipping GPU config ==="
fi

# --- 4g. Pre-reboot safety checks ---

echo ""
echo "=== Pre-reboot checks ==="

CHECKS_OK=true

# Nouveau blacklisted (by the package's nvidia-blacklists-nouveau.conf or our fallback)
if grep -rqs 'blacklist nouveau' /etc/modprobe.d/; then
    echo "  [OK] Nouveau blacklisted"
else
    echo "  [FAIL] Nouveau not blacklisted"
    CHECKS_OK=false
fi

# DKMS module built
if dkms status 2>/dev/null | grep -q 'nvidia.*installed'; then
    echo "  [OK] NVIDIA DKMS module installed"
else
    echo "  [FAIL] NVIDIA DKMS module not found"
    CHECKS_OK=false
fi

# Suspend services
for svc in nvidia-suspend nvidia-hibernate nvidia-resume; do
    if systemctl is-enabled "$svc" > /dev/null 2>&1; then
        echo "  [OK] $svc enabled"
    else
        echo "  [FAIL] $svc not enabled"
        CHECKS_OK=false
    fi
done

# Rebuild initramfs
update-initramfs -u

echo ""

if [ "$CHECKS_OK" = true ]; then
    echo "=== debgno-setup-nvidia.sh complete ==="
    echo "All checks passed. Reboot to use Wayland with NVIDIA."
    if [ "$LATE_MODESET" = false ]; then
        echo ""
        echo "If the system hangs after reboot, see the recovery instructions at the"
        echo "top of this script, or re-run with: sudo debgno-setup-nvidia.sh --late-modeset"
    fi
else
    echo "=== WARNING: Some checks failed — review output above before rebooting ==="
fi
