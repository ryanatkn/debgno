import {DOWNLOAD_FILES, type FileHashes} from './config.ts';

export interface PreseedConfig {
	base_url: string;
	hashes: FileHashes;
}

const generate_late_command = (config: PreseedConfig): string => {
	// Collect unique parent directories that need to be created.
	const dirs = [
		...new Set(
			DOWNLOAD_FILES.map((f) => f.dest.replace(/\/[^/]+$/, '')).filter(
				(d) => d !== '/target/tmp' && d !== '/target/usr/local/bin',
			),
		),
	];
	const mkdirs = dirs.map((d) => `    mkdir -p ${d};`).join(' \\\n');

	// Generate wget + sha256sum for each file.
	const downloads = DOWNLOAD_FILES.map(
		(f) =>
			`    wget -O ${f.dest} ${config.base_url}/${f.name} || { echo "FATAL: failed to download ${f.name}"; exit 1; }; \\\n` +
			`    echo "${config.hashes[f.name]}  ${f.dest}" | sha256sum -c - || { echo "FATAL: SHA256 mismatch for ${f.name}"; exit 1; };`,
	).join(' \\\n');

	// chmod +x for executable files.
	const executables = DOWNLOAD_FILES.filter((f) => f.executable)
		.map((f) => f.dest)
		.join(' ');

	const parts = ['    set -e;'];
	if (mkdirs) parts.push(mkdirs);
	parts.push(downloads);
	parts.push(`    chmod +x ${executables};`);
	parts.push('    in-target /tmp/post-install.sh');
	return parts.join(' \\\n');
};

export const generate_preseed = (
	config: PreseedConfig,
): string => `# preseed.cfg — Debian 13 (Trixie) minimal GNOME installer
#
# Usage: Boot netinst ISO, press 'e' at GRUB, add to linux line:
#   auto=true priority=high preseed/url=${config.base_url}/preseed.cfg
#
# Priority 'high' (not 'critical') ensures locale/timezone/keyboard prompts appear.

# --- Locale, timezone, keyboard: prompt user ---
# (left unpreseeded so installer prompts)

# --- Network ---
d-i netcfg/choose_interface select auto
# Hostname: prompt user (no default preseeded)

# --- Mirror ---
d-i mirror/country string manual
d-i mirror/http/hostname string deb.debian.org
d-i mirror/http/directory string /debian
d-i mirror/http/proxy string
d-i mirror/suite string trixie

# --- Archive areas ---
d-i apt-setup/non-free-firmware boolean true
d-i apt-setup/non-free boolean true
d-i apt-setup/contrib boolean true

# --- Account: no root, prompt for user ---
d-i passwd/root-login boolean false
# Username and password: prompt user (no defaults preseeded)

# --- Partitioning: guided, full disk, encrypted LVM ---
d-i partman-auto/method string crypto
d-i partman-lvm/device_remove_lvm boolean true
d-i partman-md/device_remove_md boolean true
d-i partman-lvm/confirm boolean true
d-i partman-lvm/confirm_nooverwrite boolean true
d-i partman-auto-lvm/guided_size string max
d-i partman-auto/choose_recipe select atomic
d-i partman-partitioning/confirm_write_new_label boolean true
d-i partman/choose_partition select finish
d-i partman/confirm boolean true
d-i partman/confirm_nooverwrite boolean true
# Disk selection: unpreseeded — auto-selects on single-disk, prompts on multi-disk

# --- Package selection: minimal ---
# Empty multiselect deselects every task (including "standard system utilities"),
# and pkgsel/include adds nothing — post-install.sh installs the explicit package
# set instead, so nothing sneaks in via tasksel.
tasksel tasksel/first multiselect
d-i pkgsel/include string
d-i pkgsel/upgrade select full-upgrade
popularity-contest popularity-contest/participate boolean false

# --- Bootloader ---
d-i grub-installer/only_debian boolean true
d-i grub-installer/bootdev string default

# --- late_command: fetch and run post-install ---
# SHA256 hashes are computed at generation time and baked in for integrity verification.
# Download manifest is defined in DOWNLOAD_FILES (src/config.ts).
d-i preseed/late_command string \\
${generate_late_command(config)}

# --- Finish ---
d-i finish-install/reboot_in_progress note
`;
