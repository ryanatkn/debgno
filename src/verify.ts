import type { DebgnoConfig } from './config.ts';
import {
	PACKAGES,
	VERIFY_EXTRA_PACKAGES,
	UNWANTED_PACKAGES,
	POST_INSTALL_LOG,
	POST_INSTALL_MARKER,
	MOZILLA_KEY_PATH,
	FIREFOX_POLICIES_PATH
} from './config.ts';

const format_verify_packages = (packages: Array<string>): string =>
	packages.map((p) => `    ${p}`).join(' \\\n');

export const generate_verify = (config: DebgnoConfig): string => `#!/bin/bash
# debgno-verify.sh — Automated post-install verification
# Run after install to check packages, configs, and services.
# Usage: sudo debgno-verify.sh

set -u

PASS=0
FAIL=0
WARN=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  WARN: $1"; WARN=$((WARN + 1)); }

check_installed() {
    dpkg -l "$1" 2>/dev/null | grep -q '^ii' && pass "$1 installed" || fail "$1 not installed"
}

check_not_installed() {
    dpkg -l "$1" 2>/dev/null | grep -q '^ii' && fail "$1 should not be installed" || pass "$1 not installed"
}

# --- Required packages ---

echo "=== Required Packages ==="

for pkg in \\
${format_verify_packages([...PACKAGES, ...VERIFY_EXTRA_PACKAGES])}; do
    check_installed "$pkg"
done

# --- Firefox ---

echo "=== Firefox ==="

if command -v firefox &>/dev/null; then
    VERSION=$(firefox --version 2>/dev/null)
    if echo "$VERSION" | grep -q "Mozilla Firefox"; then
        pass "Firefox installed: $VERSION"
    else
        fail "Firefox version unexpected: $VERSION"
    fi
    # Check it's mainline, not ESR
    if echo "$VERSION" | grep -qi "esr"; then
        fail "Firefox is ESR (should be mainline)"
    else
        pass "Firefox is mainline (not ESR)"
    fi
else
    fail "Firefox not installed"
fi

# Firefox policies
if [ -f ${FIREFOX_POLICIES_PATH} ]; then
    pass "Firefox policies file exists"
else
    fail "Firefox policies file missing"
fi

# Mozilla signing key
if [ -f ${MOZILLA_KEY_PATH} ]; then
    EXPECTED_HASH="${config.mozilla_key_hash}"
    ACTUAL_HASH=$(sha256sum ${MOZILLA_KEY_PATH} | cut -d' ' -f1)
    if [ "$ACTUAL_HASH" = "$EXPECTED_HASH" ]; then
        pass "Mozilla signing key integrity OK"
    else
        fail "Mozilla signing key hash mismatch"
    fi
else
    fail "Mozilla signing key not found"
fi

# --- Unwanted packages ---

echo "=== Unwanted Packages ==="

for pkg in \\
${format_verify_packages(UNWANTED_PACKAGES)}; do
    check_not_installed "$pkg"
done

# --- Configs ---

echo "=== Configuration ==="

# Firewall
if systemctl is-enabled nftables &>/dev/null; then
    pass "nftables service enabled"
else
    fail "nftables service not enabled"
fi

if nft list ruleset 2>/dev/null | grep -q 'policy drop'; then
    pass "Firewall policy is deny-inbound"
else
    fail "Firewall policy not set to drop"
fi

# DNS-over-TLS
if systemctl is-enabled systemd-resolved &>/dev/null; then
    pass "systemd-resolved enabled"
else
    fail "systemd-resolved not enabled"
fi

if [ -L /etc/resolv.conf ] && readlink /etc/resolv.conf | grep -q 'stub-resolv.conf'; then
    pass "resolv.conf linked to systemd-resolved"
else
    fail "resolv.conf not linked to systemd-resolved"
fi

if [ -f /etc/systemd/resolved.conf.d/dot.conf ]; then
    if grep -q 'DNSOverTLS=opportunistic' /etc/systemd/resolved.conf.d/dot.conf; then
        pass "DNS-over-TLS configured (opportunistic)"
    else
        fail "DNS-over-TLS config unexpected"
    fi
else
    fail "DNS-over-TLS config missing"
fi

# GRUB timeout
if [ -f /etc/default/grub.d/boot-speed.cfg ]; then
    if grep -q 'GRUB_TIMEOUT=${config.grub_timeout}' /etc/default/grub.d/boot-speed.cfg; then
        pass "GRUB timeout set to ${config.grub_timeout}"
    else
        warn "GRUB timeout config exists but value unexpected"
    fi
else
    fail "GRUB boot-speed.cfg missing"
fi

# zram swap
if [ -f /etc/systemd/zram-generator.conf ]; then
    pass "zram-generator config exists"
else
    fail "zram-generator config missing"
fi

if grep -q zram /proc/swaps 2>/dev/null; then
    pass "zram swap active"
else
    warn "zram swap not active (check 'swapon --show' / 'zramctl')"
fi

# Post-install completion marker
if [ -f ${POST_INSTALL_MARKER} ]; then
    pass "Post-install completion marker exists"
else
    fail "Post-install completion marker missing"
fi

# Post-install log
if [ -f ${POST_INSTALL_LOG} ]; then
    if grep -q "post-install.sh complete" ${POST_INSTALL_LOG}; then
        pass "Post-install log shows completion"
    else
        warn "Post-install log exists but may show errors"
    fi
else
    fail "Post-install log missing"
fi

# --- Services ---

echo "=== Services ==="

# GDM enabled
if systemctl is-enabled gdm3 &>/dev/null; then
    pass "GDM enabled"
else
    fail "GDM not enabled"
fi

# NetworkManager enabled
if systemctl is-enabled NetworkManager &>/dev/null; then
    pass "NetworkManager enabled"
else
    fail "NetworkManager not enabled"
fi

# --- Listening services ---

echo "=== Network ==="

UNEXPECTED=$(ss -tlnp 2>/dev/null | grep LISTEN | grep -v -E '(gdm|NetworkManager|systemd-resolve)' || true)
if [ -z "$UNEXPECTED" ]; then
    pass "No unexpected listening services"
else
    warn "Unexpected listeners: $UNEXPECTED"
fi

# WiFi firmware check (troubleshooting aid, not a pass/fail)
if ip link show 2>/dev/null | grep -qE 'wlan|wlp'; then
    pass "WiFi interface detected"
else
    if lspci 2>/dev/null | grep -qi 'network\\|wireless'; then
        warn "WiFi hardware detected but no WiFi interface — may need firmware (e.g., firmware-iwlwifi, firmware-realtek)"
    fi
fi

# --- UEFI ---

echo "=== Boot ==="

if [ -d /sys/firmware/efi ]; then
    pass "Booted in UEFI mode"
else
    fail "Not booted in UEFI mode"
fi

# --- Summary ---

echo ""
echo "=== Summary ==="
echo "  $PASS passed, $FAIL failed, $WARN warnings"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
`;
