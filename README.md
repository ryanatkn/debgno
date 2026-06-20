# debgno

> minimal Debian 13 desktop with GNOME and Wayland

Debgno automates a minimal Linux desktop with Debian 13 and GNOME.
It installs individual packages instead of meta-packages like `gnome-core`,
so every package on the system is an explicit choice.
Start with a clean desktop and add what you need, instead of removing what you don't.

> ⚠️ This project was generated with LLMs, readers and users beware.
> But it's maintained by a human who cares about code quality,
> see the [discussions](https://github.com/ryanatkn/debgno/discussions).

## Features

- GNOME desktop (no gnome-software, no calendar/weather/maps apps)
- Wayland session
- Mainline Firefox from Mozilla APT (not ESR)
- Full-disk encryption (LUKS)
- Firewall enabled (nftables, default deny-inbound)

Under the hood it's a preseed config and post-install scripts — no custom ISO yet, just automation on top of the standard Debian netinst installer.

Works on Intel, AMD, and NVIDIA hardware. NVIDIA's open kernel module driver (Turing or newer) is an optional post-install step.

## Requirements

- UEFI system (BIOS not supported)
- Secure Boot disabled if using NVIDIA (Intel/AMD work with Secure Boot enabled)
- NVIDIA only: the optional accelerated driver needs a Turing-or-newer GPU (RTX 20-series / GTX 16-series and up); older cards run on nouveau from the base install
- Network connection during install
- ~20GB disk minimum

## Before You Start

- **Back up** anything on the target disk — it will be wiped
- **Disable Secure Boot** if installing NVIDIA later (ThinkPad: F1 at boot → Security → Secure Boot → Disabled). Intel/AMD work with Secure Boot enabled.
- Have your **WiFi name and password** ready (the installer prompts for WiFi if no Ethernet is connected)

## Usage

1. Download the [Debian 13 (Trixie) netinst ISO](https://www.debian.org/distrib/netinst)

2. Write to USB:

   ```bash
   # Identify your USB device (check carefully — dd will wipe the target)
   lsblk
   # Write the ISO (replace /dev/sdX with your USB device)
   sudo dd if=debian-13.3.0-amd64-netinst.iso of=/dev/sdX bs=4M status=progress && sync
   ```

3. Boot from USB and press `e` to edit GRUB, add to the linux line:

   ```
   auto=true priority=high preseed/url=https://raw.githubusercontent.com/ryanatkn/debgno/main/distro/preseed.cfg
   ```

4. Press `Ctrl+X` to boot
5. Answer prompts for locale, timezone, keyboard, WiFi (if no Ethernet), hostname, username, password, and LUKS passphrase
6. Wait for the install to complete (~15 minutes depending on network speed)

## After Install

**Verify the install** (optional):

```bash
sudo debgno-verify.sh
```

Base install works immediately on Intel/AMD GPUs.

**For NVIDIA GPUs**, run after first boot:

```bash
sudo debgno-setup-nvidia.sh
```

This installs NVIDIA's open kernel module driver, which needs a **Turing or newer GPU** (RTX 20-series / GTX 16-series and up — every RTX card qualifies). Check yours with `lspci -nn | grep -iE 'vga|3d'`; pre-Turing cards (GTX 10-series Pascal and older) aren't supported by the open module and would need the proprietary driver instead.

Then reboot. GDM will offer Wayland session with NVIDIA acceleration.

If the system hangs after reboot (known issue on some hardware — see script header for details),
recover and re-run with: `sudo debgno-setup-nvidia.sh --late-modeset`

**Hybrid laptops (Intel + NVIDIA):** The script works the same way. After reboot, the Intel iGPU renders the desktop and NVIDIA activates on demand. Right-click an app in GNOME to "Launch with Discrete GPU."

**For dev environment setup** (install [zap](https://zap.fuz.dev)):

```bash
debgno-setup-zap.sh
```

Then run your own zap config to provision your environment.

## What's Installed

### GNOME Desktop (minimal)

- gdm3, gnome-session (pulls gnome-shell)
- gnome-control-center (settings)
- nautilus (file manager)
- gnome-console (terminal)
- gnome-text-editor
- gnome-keyring (secrets)
- gnome-disk-utility
- gnome-tweaks
- xdg-desktop-portal-gnome (screen sharing, file dialogs)
- switcheroo-control (hybrid GPU support)
- power-profiles-daemon (power mode in Settings)

### Audio

- pipewire, pipewire-pulse, pipewire-alsa, wireplumber

### Firefox

- Mainline Firefox from Mozilla APT (not ESR)
- uBlock Origin (auto-installed via policy)
- AI/ML features disabled, telemetry disabled, HTTPS-only
- DNS over HTTPS (Cloudflare), tracking protection locked on
- See ./docs/security.md for full policy list

### Security

- nftables (firewall, default deny-inbound policy — add rules as needed)
- Updates are manual — run `sudo apt update && sudo apt upgrade` regularly, or enable automatic security updates with `sudo apt install unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`

### Not Installed (by design)

- gnome-software
- gnome-calendar, gnome-weather, gnome-maps, gnome-contacts
- evince (PDF), loupe (images)
- flatpak, snapd
- games, office suite

## Customization

**Add Flatpak later:**

```bash
sudo apt install flatpak
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

**Firefox policies:** Edit `src/mozilla.ts` then run `gro gen`

## Development

All installer files in `distro/` are generated from TypeScript source in `src/`. The single entry point is `src/distro.gen.ts`.

```bash
npm install          # install dependencies (first time)
gro gen              # regenerate all files
gro gen --check      # verify files match source (CI-friendly)
```

See ./docs/testing.md for QEMU testing setup, checklists, and package audit procedures.

## Files

| File                            | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `src/distro.gen.ts`             | Single source of truth — generates all installer files       |
| `distro/preseed.cfg`            | Generated: installer automation with SHA256 verification     |
| `distro/post-install.sh`        | Generated: base system setup (GNOME, Firefox, audio, config) |
| `distro/debgno-setup-nvidia.sh` | Generated: optional NVIDIA driver + Wayland config           |
| `distro/debgno-setup-zap.sh`    | Generated: optional [zap](https://zap.fuz.dev) install       |
| `distro/debgno-verify.sh`       | Generated: automated post-install verification               |

## License

[MIT](LICENSE)
