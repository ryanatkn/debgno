import type {DebgnoConfig} from './config.ts';
import {
	PACKAGES,
	STAGING_DIR,
	POST_INSTALL_LOG,
	POST_INSTALL_MARKER,
	MOZILLA_KEY_PATH,
	FIREFOX_POLICIES_PATH,
} from './config.ts';

const format_install_packages = (packages: Array<string>): string =>
	packages.map((p) => `    ${p}`).join(' \\\n');

export const generate_post_install = (config: DebgnoConfig): string => `#!/bin/bash
# post-install.sh — Base system setup for Debian 13 minimal GNOME
# Runs inside the target system via preseed late_command (in-target)

set -eu
export DEBIAN_FRONTEND=noninteractive

# Log all output (simple redirect — process substitution breaks in chroot)
exec > ${POST_INSTALL_LOG} 2>&1

# Show progress on the console (installer screen) while logging full output to file.
# Falls back silently if /dev/console is unavailable.
progress() { echo "debgno: $1" > /dev/console 2>/dev/null || true; echo "=== $1 ==="; }

progress "post-install.sh starting"

# Disable CD-ROM apt source (not accessible inside chroot)
sed -i '/^deb cdrom:/d' /etc/apt/sources.list

# --- 3a. Base packages — Minimal GNOME ---

progress "Installing packages..."

apt-get update

apt-get install -y --no-install-recommends \\
${format_install_packages(PACKAGES)}

progress "Base packages installed"

# --- 3b. Mozilla APT repo + Firefox ---
# Separated so a Mozilla repo failure doesn't block the desktop install.

progress "Installing Firefox..."

(
    # Re-enable set -e (bash disables it inside || context)
    set -e

    # Create keyrings directory
    install -d -m 0755 /etc/apt/keyrings

    # Fetch Mozilla signing key and verify integrity
    wget -q https://packages.mozilla.org/apt/repo-signing-key.gpg -O /tmp/mozilla-key.gpg
    cp /tmp/mozilla-key.gpg ${MOZILLA_KEY_PATH}

    EXPECTED_HASH="${config.mozilla_key_hash}"
    ACTUAL_HASH=$(sha256sum ${MOZILLA_KEY_PATH} | cut -d' ' -f1)
    if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
        echo "ERROR: Mozilla signing key SHA-256 mismatch!"
        echo "  Expected: $EXPECTED_HASH"
        echo "  Got:      $ACTUAL_HASH"
        echo "  The key may have been rotated — update MOZILLA_KEY_HASH in src/config.ts"
        exit 1
    fi
    rm -f /tmp/mozilla-key.gpg

    # Install APT source and pin (fetched by late_command to ${STAGING_DIR}/)
    cp ${STAGING_DIR}/mozilla.sources /etc/apt/sources.list.d/mozilla.sources
    cp ${STAGING_DIR}/mozilla-pin /etc/apt/preferences.d/mozilla

    apt-get update
    apt-get install -y firefox

    echo "=== Firefox installed ==="

    # --- 3c. Firefox policies ---

    mkdir -p /etc/firefox/policies
    cp ${STAGING_DIR}/policies.json ${FIREFOX_POLICIES_PATH}

    echo "=== Firefox policies installed ==="
) || progress "WARNING: Firefox installation failed. Install manually after boot."

# --- 3d. GRUB timeout ---

cat > /etc/default/grub.d/boot-speed.cfg << 'EOF'
GRUB_TIMEOUT=${config.grub_timeout}
EOF

update-grub

progress "GRUB timeout configured"

# --- 3e. Swap (zram) ---
# systemd-zram-generator creates compressed in-memory swap on boot.
# Default: min(50% RAM, 4GiB). Complements the disk swap from LVM for hibernate.

progress "zram swap configured"

# --- 3f. Firewall (deny inbound by default) ---

cat > /etc/nftables.conf << 'EOF'
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        # Drop invalid packets (malformed, out-of-window, etc.)
        ct state invalid drop

        # Allow established/related connections (responses to outbound requests)
        ct state established,related accept

        # Allow loopback (required for desktop apps talking to each other)
        iif "lo" accept

        # Allow ICMP/ICMPv6 (ping, path MTU discovery)
        meta l4proto icmp accept
        meta l4proto ipv6-icmp accept

        # Everything else is dropped by policy
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }
}
EOF

systemctl enable nftables

progress "Firewall configured (deny inbound)"

# --- 3g. DNS-over-TLS (system-wide encrypted DNS) ---
# Encrypts all system DNS queries (apt, curl, wget) via Cloudflare.
# Opportunistic: encrypts when available, falls back to plaintext on restrictive networks.

mkdir -p /etc/systemd/resolved.conf.d
mkdir -p /etc/NetworkManager/conf.d

cat > /etc/systemd/resolved.conf.d/dot.conf << 'EOF'
[Resolve]
DNS=1.1.1.1#cloudflare-dns.com 1.0.0.1#cloudflare-dns.com 2606:4700:4700::1111#cloudflare-dns.com 2606:4700:4700::1001#cloudflare-dns.com
DNSOverTLS=opportunistic
EOF

cat > /etc/NetworkManager/conf.d/dns.conf << 'EOF'
[main]
dns=systemd-resolved
EOF

ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf

systemctl enable systemd-resolved

progress "DNS-over-TLS configured (opportunistic)"

# --- 3h. First-boot check service ---

cat > /etc/systemd/system/post-install-check.service << 'EOF'
[Unit]
Description=Verify post-install completed successfully
After=graphical.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'if [ ! -f ${POST_INSTALL_MARKER} ]; then wall "WARNING: post-install.sh did not complete successfully. Check ${POST_INSTALL_LOG}"; fi'
ExecStartPost=/bin/systemctl disable post-install-check.service

[Install]
WantedBy=graphical.target
EOF

systemctl enable post-install-check.service

progress "First-boot check service installed"

# --- 3i. GNOME defaults ---

mkdir -p /etc/dconf/db/local.d
cat > /etc/dconf/db/local.d/00-debgno << 'EOF'
[org/gnome/desktop/peripherals/touchpad]
disable-while-typing=false
EOF

mkdir -p /etc/dconf/profile
cat > /etc/dconf/profile/user << 'EOF'
user-db:user
system-db:local
EOF

dconf update

progress "GNOME defaults configured"

# --- 3j. Cleanup ---

apt-get clean
rm -rf /tmp/post-install.sh ${STAGING_DIR}

touch ${POST_INSTALL_MARKER}

progress "post-install.sh complete"
`;
