export const BASE_URL = 'https://raw.githubusercontent.com/ryanatkn/debgno/main/distro';
export const LOCAL_URL = 'http://10.0.2.2:8000/distro';
export const MOZILLA_KEY_HASH = '3ecc63922b7795eb23fdc449ff9396f9114cb3cf186d6f5b53ad4cc3ebfbb11f';
export const GRUB_TIMEOUT = 3;

// Packages explicitly installed during post-install.
export const PACKAGES = [
	'gdm3',
	'gnome-session',
	'gnome-control-center',
	'nautilus',
	'gnome-console',
	'gnome-keyring',
	'gnome-disk-utility',
	'gnome-tweaks',
	'network-manager',
	'pipewire',
	'pipewire-pulse',
	'pipewire-alsa',
	'wireplumber',
	'xdg-desktop-portal-gnome',
	'switcheroo-control',
	'gnome-text-editor',
	'power-profiles-daemon',
	'systemd-zram-generator',
	'nftables',
	'systemd-resolved',
	'git',
	'curl',
	'wget',
	'ca-certificates',
	'openssh-client',
];

// Expected dependencies not explicitly installed but verified.
export const VERIFY_EXTRA_PACKAGES = ['gnome-shell'];

// Packages that should never be present.
export const UNWANTED_PACKAGES = [
	'gnome-software',
	'gnome-packagekit',
	'gnome-calendar',
	'gnome-weather',
	'gnome-maps',
	'gnome-contacts',
	'gnome-music',
	'gnome-photos',
	'totem',
	'shotwell',
	'cheese',
	'gnome-remote-desktop',
	'gnome-user-share',
	'rygel',
	'orca',
	'evolution',
	'tracker-miner-fs',
	'flatpak',
	'snapd',
];

// Staging directory for files fetched by late_command (used by post-install.sh, cleaned up after).
export const STAGING_DIR = '/tmp/debgno';

// Paths shared between post-install and verify.
export const POST_INSTALL_LOG = '/var/log/post-install.log';
export const POST_INSTALL_MARKER = '/var/lib/post-install-complete';
export const MOZILLA_KEY_PATH = '/etc/apt/keyrings/packages.mozilla.org.asc';
export const FIREFOX_POLICIES_PATH = '/etc/firefox/policies/policies.json';

// Files downloaded during install via late_command.
// Each is wget'd, SHA256-verified, and placed at dest on /target.
export interface DownloadFile {
	name: string;
	dest: string;
	executable: boolean;
}

export const DOWNLOAD_FILES: Array<DownloadFile> = [
	{name: 'post-install.sh', dest: '/target/tmp/post-install.sh', executable: true},
	{
		name: 'debgno-setup-nvidia.sh',
		dest: '/target/usr/local/bin/debgno-setup-nvidia.sh',
		executable: true,
	},
	{name: 'debgno-setup-tx.sh', dest: '/target/usr/local/bin/debgno-setup-tx.sh', executable: true},
	{name: 'debgno-verify.sh', dest: '/target/usr/local/bin/debgno-verify.sh', executable: true},
	{name: 'mozilla.sources', dest: `/target${STAGING_DIR}/mozilla.sources`, executable: false},
	{name: 'mozilla-pin', dest: `/target${STAGING_DIR}/mozilla-pin`, executable: false},
	{name: 'policies.json', dest: `/target${STAGING_DIR}/policies.json`, executable: false},
];

export type FileHashes = Record<string, string>;

export interface DebgnoConfig {
	mozilla_key_hash: string;
	grub_timeout: number;
}
