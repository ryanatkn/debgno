# test/

QEMU/KVM test artifacts for local installs. Both files are gitignored.

## Files

### `OVMF_VARS.fd`

Writable copy of the OVMF UEFI variable store. Created by copying the system template:

```sh
cp /usr/share/OVMF/OVMF_VARS.fd test/OVMF_VARS.fd
```

QEMU writes UEFI variables (boot entries, Secure Boot state) here during the VM lifecycle. The read-only firmware code comes from `/usr/share/OVMF/OVMF_CODE.fd` (not copied, referenced directly).

### `debian-test.qcow2`

Virtual disk image for the test VM. Created with:

```sh
qemu-img create -f qcow2 test/debian-test.qcow2 20G
```

Thin-provisioned — starts small on disk and grows as the install writes data.

## Running a test install

```sh
# Serve project files (separate terminal)
python3 -m http.server 8000

# Boot the VM
qemu-system-x86_64 \
  -enable-kvm -m 4096 -smp 2 \
  -drive if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE.fd \
  -drive if=pflash,format=raw,file=test/OVMF_VARS.fd \
  -drive file=test/debian-test.qcow2,format=qcow2 \
  -cdrom /path/to/debian-trixie-amd64-netinst.iso \
  -boot d
```

At the GRUB prompt, append:

```
auto=true priority=high preseed/url=http://10.0.2.2:8000/distro/preseed-local.cfg
```

## Resetting

Delete both files and recreate them to start fresh.
