# Security Overview

## Threat Model

This is a desktop installer that fetches scripts from GitHub and runs them as root.
The primary threats are transport-level tampering and unnecessary attack surface.

## Protections

### SHA256 Integrity Verification

All files downloaded during install are verified against hashes computed at generation
time and baked into `preseed.cfg`. If any hash doesn't match, the install aborts.

Catches:
- Man-in-the-middle tampering
- Partial or corrupted downloads
- CDN serving stale cached content

Does NOT protect against source compromise (if the GitHub account is compromised,
`gro gen` would produce valid hashes for malicious content).

### HTTPS Transport

All downloads use HTTPS (GitHub raw URLs). The Debian installer's CA bundle
validates the TLS chain.

### Firewall (nftables)

Default deny-inbound policy, enabled at install time:

```
table inet filter {
    chain input {
        policy drop;
        ct state invalid drop;
        ct state established,related accept;
        iif "lo" accept;
        meta l4proto icmp accept;
        meta l4proto ipv6-icmp accept;
    }
    chain forward { policy drop; }
    chain output { policy accept; }
}
```

- **Inbound**: Drops everything except responses to outbound connections, loopback, and ICMP
- **Forward**: Drops everything (not a router)
- **Outbound**: Allows everything (no restriction on what the user connects to)

To allow inbound SSH later: `nft add rule inet filter input tcp dport 22 accept`

### Full-Disk Encryption (LUKS)

The installer configures guided encrypted LVM. All data at rest is encrypted.
Strength depends on the user's passphrase choice.

### Manual Updates

System updates are manual (`apt update && apt upgrade`). Automatic updates were
considered but add dpkg lock contention and unexpected library changes during
development. The user is responsible for applying security patches regularly.

To re-enable automatic security updates later:

```bash
sudo apt install unattended-upgrades
cat <<'EOF' | sudo tee /etc/apt/apt.conf.d/20auto-upgrades
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
```

To include Mozilla Firefox in automatic updates, add to
`/etc/apt/apt.conf.d/50unattended-upgrades`:

```
Unattended-Upgrade::Allowed-Origins {
    "packages.mozilla.org:mozilla";
};
```

### Minimal Attack Surface

No gnome-software, no flatpak/snap, no remote desktop, no file sharing, no media
server. Every installed package is an explicit choice. `debgno-verify.sh` checks for
unexpected listening services.

### Firefox Hardening

Policies enforced via `/etc/firefox/policies/policies.json`:
- Telemetry disabled
- HTTPS-only mode
- DNS over HTTPS (Cloudflare, locked)
- Tracking protection with cryptomining + fingerprinting (locked)
- Pocket, Firefox Accounts, sponsored suggestions disabled
- AI/ML features off by default but user-changeable (none locked): `AIControls` umbrella ("Block AI enhancements") set to blocked, with `GenerativeAI` and `browser.ml.enable` also default-off
- Picture-in-Picture disabled
- Search suggestions disabled
- Breached password alerts disabled (avoids cloud password checks)
- Default search engine set to DuckDuckGo; Google, Amazon, Bing, eBay, and Perplexity removed (DuckDuckGo and Wikipedia kept)
- uBlock Origin auto-installed via extension policy
- New tab page: search and shortcuts (3 rows) on by default; weather, widgets (lists/timer), and "Support Firefox" messages off by default — all user-toggleable. Sponsored shortcuts/stories and recommended stories (Pocket) stay locked off. Recent activity limited to bookmarks (4 rows), no visited pages or downloads

### DNS-over-TLS (System-Wide)

All system DNS queries (`apt`, `curl`, `wget`) are encrypted via `systemd-resolved`
configured with DNS-over-TLS (Cloudflare 1.1.1.1 / 1.0.0.1). This complements
Firefox's DNS-over-HTTPS — both use Cloudflare as the upstream resolver.

Mode is **opportunistic**: encrypts when available, falls back to plaintext on
restrictive networks (hotels, corporate WiFi that block port 853). This means DNS
privacy is best-effort, not guaranteed — a network that actively blocks DoT will
cause a silent fallback. Strict mode (`DNSOverTLS=yes`) would guarantee encryption
but break DNS entirely on those networks.

To switch to strict mode: edit `/etc/systemd/resolved.conf.d/dot.conf` and change
`DNSOverTLS=opportunistic` to `DNSOverTLS=yes`, then `systemctl restart systemd-resolved`.

### Mozilla Signing Key Verification

The Mozilla APT signing key is verified by SHA256 hash during install
(`post-install.sh`) and again during verification (`debgno-verify.sh`). The hash is
defined once in `src/config.ts` and shared across both scripts.

Pinning the hash means key rotation is an expected maintenance event: when Mozilla
rotates the signing key, the Firefox section of `post-install.sh` fails soft (the
install completes without a browser) and `debgno-verify.sh` fails hard — update
`MOZILLA_KEY_HASH` in `src/config.ts` and run `gro gen` to recover.

## Known Limitations

### Bootstrap Problem

The preseed.cfg itself has no integrity check — the user types the URL at the GRUB
prompt. HTTPS is the only protection for this initial fetch. Everything downstream
is hash-verified, but if the preseed is tampered with, those hashes belong to the
attacker.

Mitigation: A future custom ISO would bake the preseed into the boot media,
eliminating the network fetch for the preseed itself.

### GitHub as Single Trust Anchor

If the GitHub account is compromised, an attacker could push malicious scripts and
`gro gen` would produce valid SHA256 hashes. The hashes protect transport integrity,
not source authenticity. GPG signing would add a second factor but introduces
significant key management complexity.

### Firefox Failure is Soft

If the Mozilla APT section fails in `post-install.sh`, the install continues with
a warning rather than aborting. This is intentional (a browser failure shouldn't
block the desktop install) but means that specific failure path is non-fatal.

### No Secure Boot with NVIDIA

NVIDIA kernel modules are unsigned. Secure Boot must be disabled for the proprietary
driver. Intel/AMD systems can keep Secure Boot enabled.

### mDNS Blocked

The default firewall blocks mDNS (port 5353 UDP), which means no auto-discovered
printers or Chromecast devices. Add a rule if needed:
`nft add rule inet filter input udp dport 5353 accept`

### No GRUB Password

The GRUB bootloader is not password-protected. Anyone with physical access can edit
boot parameters (e.g., `init=/bin/sh` for a root shell). LUKS encryption protects
data at rest, but the boot chain itself is unprotected. Adding a GRUB password is
possible but adds friction to every boot and recovery scenario.

### zap Installer

The optional dev environment script (`debgno-setup-zap.sh`) installs [zap](https://zap.fuz.dev)
via its standard installer. The zap installer verifies its own binary hash after download.
This is the standard vendor-trust model (like `apt` trusting Debian's repos) and is
user-initiated — not part of the base install. This requires trusting zap.fuz.dev to run arbitrary code.

### WiFi Firmware

The installer enables `non-free-firmware`, so the Debian installer should detect WiFi
hardware and pull in the appropriate firmware package during base install. If WiFi
doesn't work after first boot, check `dmesg | grep firmware` to identify the missing
firmware package (common ones: `firmware-iwlwifi` for Intel, `firmware-realtek` for
Realtek).

## Out of Scope

These were considered but are beyond the goals of a minimal installer:

- **Kernel sysctl hardening** (rp_filter, disable ICMP redirects, restrict dmesg)
- **Auto-reboot for kernel updates** (disruptive for desktop use)
- **AppArmor/SELinux** (mandatory access control)
- **Outbound firewall restrictions** (breaks too many legitimate desktop apps)
