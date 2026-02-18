# src/

TypeScript source for all generated installer files. The single entry point is `distro.gen.ts`.

## Adding a Generated File

1. Create a generator function in the appropriate module (or a new module)
2. Add the file to `DOWNLOAD_FILES` in `config.ts` if it's fetched during install
3. Add the generator call to the `contents` map in `distro.gen.ts`
4. Run `gro gen` to generate, `gro gen --check` to verify

## Adding a Package

1. Add to `PACKAGES` in `config.ts`
2. Run `gro gen` — the package is automatically included in both `post-install.sh`
   (install) and `verify.sh` (verification)

## Hash Flow

`distro.gen.ts` generates all file contents first, computes SHA256 hashes of every file
in `DOWNLOAD_FILES`, then passes those hashes to `generate_preseed()` which bakes them
into the late_command. This means preseed.cfg always reflects the exact content of the
files it will download.

## Shell Generation Pattern

Generator functions return shell scripts as TypeScript template literals. TypeScript `${}`
interpolation fills in values at generation time (config values, package lists, paths), so
the resulting shell scripts contain only literal values — no runtime variable expansion
needed for config.

This means `<< 'EOF'` heredocs in the output work correctly: TypeScript has already
substituted values before the shell sees the script.

## Shell Strictness

- **Chroot scripts** (`post-install.sh`): Use `set -eu` only. `pipefail` triggers
  Debian bug #969949 with ucf in the installer chroot.
- **Post-boot scripts** (`setup-nvidia.sh`, `setup-tx.sh`): Use `set -euo pipefail`.
  These run on the fully installed system where bash works normally.

## Modules

| Module            | Exports                                                                                                      | Config                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `config.ts`       | Constants, types, `PACKAGES`, `UNWANTED_PACKAGES`, `VERIFY_EXTRA_PACKAGES`, `DOWNLOAD_FILES`, `DebgnoConfig` | —                                            |
| `distro.gen.ts`   | `gen` (Gro entry point)                                                                                      | Orchestrates all generators, computes hashes |
| `preseed.ts`      | `generate_preseed(PreseedConfig)`                                                                            | `{base_url, hashes}`                         |
| `post_install.ts` | `generate_post_install(DebgnoConfig)`                                                                        | `{mozilla_key_hash, grub_timeout}`           |
| `verify.ts`       | `generate_verify(DebgnoConfig)`                                                                              | `{mozilla_key_hash, grub_timeout}`           |
| `setup.ts`        | `generate_setup_nvidia()`, `generate_setup_tx()`                                                             | No config (standalone)                       |
| `mozilla.ts`      | `generate_mozilla_sources()`, `generate_mozilla_pin()`, `generate_policies_json()`                           | No config (standalone)                       |
