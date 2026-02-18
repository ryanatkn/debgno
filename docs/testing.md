# Testing

## Prerequisites

- QEMU/KVM with OVMF (UEFI firmware)
- Debian 13 (Trixie) **stable** netinst ISO — download from https://www.debian.org/distrib/netinst
  - **Do NOT use the testing/weekly ISO** — testing is now Forky (Debian 14) which will cause package conflicts
- For NVIDIA testing: real hardware or GPU passthrough

## Testing Strategy

Install uses `--no-install-recommends` so every package is an explicit choice. Testing verifies both that everything works **and** that nothing unwanted snuck in.

1. **QEMU test** — run installer, verify boot, run package audit
2. **Fix missing functionality** — if something is broken (e.g., Nautilus can't browse network, no trash support), identify which missing recommend is needed, add it explicitly to the plan, re-test
3. **Fix unwanted packages** — if the audit finds unexpected packages, investigate why they were pulled in and whether they can be avoided
4. **Repeat** until the package list is clean and the desktop is functional
5. **Hardware test** — real machines (ThinkPad, NVIDIA desktop/laptop)

## Base Install (QEMU/KVM)

Test the preseed and post-install script in a VM first.

### Setup

```bash
# Create VM disk (20G sparse, only uses space as needed)
qemu-img create -f qcow2 debian-test.qcow2 20G

# Copy writable UEFI vars (each VM needs its own copy)
cp /usr/share/OVMF/OVMF_VARS.fd OVMF_VARS.fd

# Serve project files locally (keep running in a separate terminal)
python3 -m http.server 8000

# Boot installer with SSH port forwarding (host:2222 → guest:22)
qemu-system-x86_64 \
    -enable-kvm \
    -m 4G \
    -cpu host \
    -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE.fd \
    -drive if=pflash,format=raw,file=OVMF_VARS.fd \
    -drive file=debian-test.qcow2,format=qcow2 \
    -cdrom debian-13.3.0-amd64-netinst.iso \
    -nic user,hostfwd=tcp::2222-:22
```

> **Note:** The pflash approach (vs `-bios`) is required for UEFI variable persistence, which GRUB EFI installation needs. The OVMF_VARS.fd copy is per-VM and writable. SSH forwarding enables `ssh -p 2222 user@localhost` for copy-paste access to the guest.

At the GRUB menu: select Install, press `e`, append to the `linux` line:

```
auto=true priority=high preseed/url=http://10.0.2.2:8000/distro/preseed-local.cfg
```

Then `Ctrl+X` to boot. The installer prompts for locale, timezone, keyboard,
hostname, username, password, and LUKS passphrase — everything else is preseeded.

### Local Testing (without pushing to GitHub)

The setup above uses `preseed-local.cfg`, which rewrites all GitHub raw URLs to
`http://10.0.2.2:8000/` (QEMU's address for the host). The HTTP server serves
files directly from the project directory, so edits are picked up immediately.

`preseed-local.cfg` is generated automatically by `gro gen` alongside the production
`preseed.cfg`. Both share the same SHA256 hashes since the downloaded files are identical.

### SSH Access (optional)

SSH is not installed by default. To enable copy-paste access from the host:

```bash
# In the VM
sudo apt install openssh-server

# The firewall blocks inbound by default — add SSH rule
sudo nft add rule inet filter input tcp dport 22 accept

# From the host
ssh -p 2222 user@localhost
```

### Checklist

- [ ] Installer boots in UEFI mode
- [ ] Preseed URL is accepted
- [ ] Prompted for: locale, timezone, keyboard, hostname, username, password, LUKS passphrase
- [ ] Installation completes without errors
- [ ] System boots to GDM login screen
- [ ] GNOME Wayland session available (check gear icon at login)
- [ ] Desktop loads successfully

### Verify Packages

```bash
# Should be installed
dpkg -l | grep -E '^ii.*(gdm3|gnome-session|gnome-shell|nautilus|gnome-console|gnome-text-editor)'

# Audio stack should be installed
dpkg -l | grep -E '^ii.*(pipewire|pipewire-pulse|wireplumber)'

# Wayland integration
dpkg -l | grep -E '^ii.*(xdg-desktop-portal-gnome|switcheroo-control)'

# Security packages should be installed
dpkg -l | grep -E '^ii.*nftables'

# Should NOT be installed
dpkg -l | grep -E '^ii.*(gnome-software|snapd|flatpak|gnome-calendar|gnome-weather)'
```

### Package Audit

Every package on the system should be intentional. Run the full audit after install to catch anything unwanted that was pulled in as a dependency.

#### Step 1: Capture full package list

```bash
# All installed packages, sorted by name
dpkg-query -W -f='${Package}\n' | sort > /tmp/installed-packages.txt
wc -l /tmp/installed-packages.txt
```

#### Step 2: Check for known unwanted packages

```bash
# Blocklist — these should NEVER be present
dpkg -l 2>/dev/null | grep -E '^ii' | grep -E \
  'gnome-software|gnome-calendar|gnome-weather|gnome-maps|gnome-contacts|gnome-music|gnome-photos|gnome-remote-desktop|gnome-user-share|rygel|totem|shotwell|cheese|orca|evolution|tracker-miner-fs|flatpak|snapd|ubuntu-' \
  && echo "FAIL: unwanted packages found" || echo "PASS: no unwanted packages"
```

#### Step 3: Review GNOME-related packages

```bash
# Show all GNOME packages — review each one
dpkg -l | grep -E '^ii' | grep -i gnome
```

Checklist for this output:
- [ ] No gnome-software or gnome-packagekit
- [ ] No gnome-remote-desktop
- [ ] No gnome-calendar, gnome-weather, gnome-maps, gnome-contacts
- [ ] No gnome-music, gnome-photos, totem/showtime
- [ ] No orca (screen reader — large dependency tree)
- [ ] No evolution (email client)
- [ ] No tracker-miner-fs (file indexer — CPU/battery hog)
- [ ] No rygel (media server)
- [ ] No gnome-user-share (WebDAV sharing)
- [ ] No cheese (webcam)
- [ ] Every gnome-* package present is accounted for in the plan

#### Step 4: Review all non-library packages

```bash
# Non-lib packages are the user-facing ones — easier to audit
dpkg-query -W -f='${Package}\n' | grep -v '^lib' | sort
```

- [ ] Review this list — every entry should be either a base system package, an explicit install from the plan, or a necessary dependency of one

#### Step 5: Check for listening services

```bash
# Nothing unexpected should be listening
ss -tlnp
```

- [ ] Only expected services (GDM, possibly NetworkManager's DNS) are listening
- [ ] No remote desktop, file sharing, or media server ports

#### Step 6: Save audit snapshot

```bash
# Save for comparison after future changes
cp /tmp/installed-packages.txt ~/package-audit-$(date +%Y%m%d).txt
```

### Verify Audio

```bash
# PipeWire should be running
systemctl --user status pipewire pipewire-pulse wireplumber

# Test audio output (if speakers/headphones connected)
speaker-test -c 2 -t wav -l 1
```

### Verify Firefox

```bash
# Check version (should be mainline, not ESR)
firefox --version

# Check policies are applied
# Open Firefox, navigate to about:policies
# Should show: DisableTelemetry, DisablePocket, DNSOverHTTPS, etc.
```

### Verify Security

```bash
# nftables installed
dpkg -l | grep -E '^ii.*nftables'

# Mozilla signing key integrity
sha256sum /etc/apt/keyrings/packages.mozilla.org.asc
# Should match: 3ecc63922b7795eb23fdc449ff9396f9114cb3cf186d6f5b53ad4cc3ebfbb11f
```

### Verify Encryption

```bash
# Should show LUKS volume
lsblk -f | grep crypto_LUKS
```

### Functional Smoke Tests

These catch missing recommends that `--no-install-recommends` may have skipped. If any fail, identify the missing package, add it explicitly to the plan.

**Nautilus:**
- [ ] Open file manager
- [ ] Trash works (delete a file, check Trash in sidebar)
- [ ] USB drive mounts when plugged in
- [ ] Can browse network locations (sidebar > Other Locations) — may need `gvfs-backends`
- [ ] Thumbnails appear for images

**GNOME Settings:**
- [ ] Opens without errors
- [ ] Wi-Fi panel shows networks (if WiFi hardware present)
- [ ] Display settings work (resolution, scaling)
- [ ] Power panel shows power mode selector (power-profiles-daemon)
- [ ] Users panel loads

**Screen sharing (Wayland portals):**
- [ ] Open Firefox, go to a WebRTC test page (e.g., `https://webrtc.github.io/samples/src/content/getusermedia/gum/`)
- [ ] Camera/mic permission prompt appears
- [ ] Screen sharing prompt works (portal dialog, not just a blank selector)

**General desktop:**
- [ ] Notifications work (try `notify-send "test"` from terminal — may need `libnotify-bin`)
- [ ] Screenshot works (Print Screen key)
- [ ] Night Light toggle works in Settings > Display
- [ ] Suspend and resume work (close lid or `systemctl suspend`)
- [ ] Logout and re-login work
- [ ] GNOME text editor opens files

### Automated Verification

Run `verify.sh` (installed to `/usr/local/bin/` during install):

```bash
sudo verify.sh
```

Should report all passed, 0 failed.

### Post-Install Check Verification

- [ ] `/var/lib/post-install-complete` exists
- [ ] `/var/log/post-install.log` exists and shows no errors
- [ ] `systemctl status post-install-check.service` shows inactive (ran and disabled itself)

## NVIDIA Testing (Real Hardware)

Requires actual NVIDIA GPU. Cannot be fully tested in VM without GPU passthrough.

### After Base Install

1. Boot into the base system (uses nouveau)
2. Verify desktop works with nouveau
3. Run NVIDIA setup:
   ```bash
   sudo /usr/local/bin/setup-nvidia.sh
   ```
4. Reboot

### Checklist

- [ ] setup-nvidia.sh completes without errors
- [ ] System reboots successfully
- [ ] GDM offers "GNOME on Wayland" session (not just Xorg)
- [ ] NVIDIA driver loaded:
  ```bash
  nvidia-smi
  lsmod | grep nvidia
  ```
- [ ] Nouveau blacklisted:
  ```bash
  lsmod | grep nouveau  # should return nothing
  ```
- [ ] Suspend/resume works (close lid or `systemctl suspend`)
- [ ] Graphics performance reasonable (no obvious stuttering)

### Troubleshooting

If GDM only offers Xorg:

```bash
# Check kernel params
cat /proc/cmdline | grep nvidia-drm

# Should show:
# nvidia-drm.modeset=1 nvidia-drm.fbdev=1

# Check PreserveVideoMemoryAllocations
cat /proc/driver/nvidia/params | grep PreserveVideoMemoryAllocations

# Should show:
# PreserveVideoMemoryAllocations: 1

# Check systemd services
systemctl status nvidia-suspend nvidia-hibernate nvidia-resume
```

## Hardware Matrix

| GPU | Expected Result |
|-----|-----------------|
| Intel (integrated) | Works with base install (mesa) |
| AMD (integrated/discrete) | Works with base install (mesa/amdgpu) |
| NVIDIA (nouveau) | Works with base install, no acceleration |
| NVIDIA (proprietary) | Requires setup-nvidia.sh, full Wayland support |

### Target Test Machines

| Machine | GPU | Driver | Notes |
|---------|-----|--------|-------|
| ThinkPad L14 (2023) | Ryzen 5 PRO 7530U + Radeon 520 | mesa/amdgpu | All-AMD, no proprietary needed |
| NVIDIA desktop | NVIDIA discrete | nvidia-driver via setup-nvidia.sh | Tests pure NVIDIA Wayland path |
| NVIDIA laptop | Intel iGPU + NVIDIA dGPU | mesa (Intel) + nvidia-driver | Hybrid/Optimus — tests switcheroo offload |
