import {createHash} from 'node:crypto';

import type {Gen} from '@fuzdev/gro';

import {BASE_URL, LOCAL_URL, MOZILLA_KEY_HASH, GRUB_TIMEOUT, DOWNLOAD_FILES} from './config.ts';
import {generate_mozilla_sources, generate_mozilla_pin, generate_policies_json} from './mozilla.ts';
import {generate_setup_nvidia, generate_setup_tx} from './setup.ts';
import {generate_post_install} from './post_install.ts';
import {generate_verify} from './verify.ts';
import {generate_preseed} from './preseed.ts';

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const config = {mozilla_key_hash: MOZILLA_KEY_HASH, grub_timeout: GRUB_TIMEOUT};

export const gen: Gen = () => {
	// Generate all file contents.
	const contents: Record<string, string> = {
		'post-install.sh': generate_post_install(config),
		'setup-nvidia.sh': generate_setup_nvidia(),
		'setup-tx.sh': generate_setup_tx(),
		'verify.sh': generate_verify(config),
		'mozilla.sources': generate_mozilla_sources(),
		'mozilla-pin': generate_mozilla_pin(),
		'policies.json': generate_policies_json(),
	};

	// Compute SHA256 hashes for files in the download manifest.
	const hashes = Object.fromEntries(DOWNLOAD_FILES.map((f) => [f.name, sha256(contents[f.name])]));

	const preseed = generate_preseed({base_url: BASE_URL, hashes});
	const preseed_local = generate_preseed({base_url: LOCAL_URL, hashes});

	return [
		{filename: '../distro/preseed.cfg', content: preseed, format: false},
		{filename: '../distro/preseed-local.cfg', content: preseed_local, format: false},
		...Object.entries(contents).map(([name, content]) => ({
			filename: `../distro/${name}`,
			content,
			format: false,
		})),
	];
};
