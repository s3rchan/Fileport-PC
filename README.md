# Fileport PC

**Fileport** connects your Windows PC directly to your Android phone for local file sharing and chat. It uses the same reachable Wi-Fi / LAN, not a cloud server.

**Source version:** v1.9.1 (development build; a source build is not automatically a published Release).

**Android companion:** [Fileport Android](https://github.com/s3rchan/Fileport-Android)  
**Windows downloads:** [Official GitHub Releases](https://github.com/s3rchan/Fileport-PC/releases)  
**Build artifacts:** [GitHub Actions](https://github.com/s3rchan/Fileport-PC/actions)

## Features

- PC-initiated LAN discovery and signed connection requests.
- Six-digit verification on both devices during first-time pairing, with saved trusted device records.
- Direct encrypted FPTP/1 file transfers, text chat, and resumable partial downloads.
- Device and connection history stored locally.
- Built-in online update checks through the official GitHub Releases repository.
- English and Turkish language settings, About screen, and official Fileport branding.

## Installation and pairing

1. Install the Windows NSIS installer from the **Releases** page. Unsigned builds can show a Windows SmartScreen warning.
2. Open Fileport on both devices using the same reachable private Wi-Fi / LAN.
3. On the PC choose **Start** or **Connect**, then select the phone.
4. Approve the signed request on the phone. For first pairing, **verify the matching six-digit code on both devices**.
5. Share messages and files. PC initiates reconnection; Android can remember explicit auto-connect approval for a trusted PC.

**Network ports:** PC TCP `38477`, PC discovery UDP `38478`, Android request UDP `38479`. Firewall or router client isolation can prevent discovery/connection. Local transfers need no internet. Only update checks/downloads need internet.

## Build from source

Requires Windows 10/11 (x64), Node.js 22, Rust/MSVC + WebView2 and Python 3 with Pillow.

```powershell
python -m pip install Pillow==11.3.0
python scripts/install_brand_fonts.py
npm install --no-package-lock
npm test
npm run build -- --bundles nsis
```

The build and dev npm scripts first generate the Windows icon from `src/branding/logo.png`. This eliminates checked-in old binary icons and gives the taskbar/Start a full-size multi-resolution icon. On Windows, an older pinned shortcut may still have a cached icon: unpin and re-pin after installing the new EXE.

`npm run dev` runs the same icon generation before opening Tauri.

### Version policy (starting with v1.9.1)

- **Regular new version:** increase the last number, e.g. `1.9.1 → 1.9.2`.
- **Major update in our release workflow:** increase the middle number, resetting the last one to zero, e.g. `1.9.2 → 1.10.0`.
- The first number is reserved for a future platform-generation change.
- Do not publish another source revision under the same release tag.
- **Re-running an unchanged CI commit is not a new product version.**

Run `python scripts/bump_version.py patch` or `python scripts/bump_version.py minor` **before committing a new product build**. The script synchronizes `package.json`, Tauri and Rust versions, the About screen and README. CI checks consistency with `--check`. Write the corresponding `CHANGELOG.md` entry before publication.

The previous root `package-lock.json` was for a different WebRTC/`ws` project and was intentionally deleted; CI resolves the current Tauri dependencies using `npm install --no-package-lock`. A correct Tauri lockfile can be committed once generated and tested.

## Release publishing

Normal pushes to `main` build the Windows EXE and upload **Fileport-Windows-Installer** to Actions artifacts. Artifacts are test builds, not published application updates.

Tag a tested commit as `pc-v1.9.1` (matching the Tauri version), or manually dispatch the workflow with the release option, to publish to GitHub Releases. The online updater points only at `s3rchan/Fileport-PC`.

## Compatibility and migration

The native identifier `com.yakin.flow.pc` and IndexedDB/localStorage keys beginning with `yakin-flow-` are **intentionally retained for upgrade compatibility**. Renaming them without a tested migration can orphan the ECDSA private identity and saved trusted-device list, and can break in-place Windows updates. They are not used in the visible Fileport branding or network protocol.

Old WebRTC website/server sources, obsolete deployment/reflect-screen instructions, duplicate root workflow and unused logos are removed. See [CHANGELOG.md](CHANGELOG.md) for historical release notes and [FPTP_PROTOCOL_v1.md](FPTP_PROTOCOL_v1.md) for the protocol.

## Privacy and security

FPTP/1 is a custom encrypted application protocol, **not an independently audited security implementation**. Verify first-time pairing codes and approve only trusted devices. Current Windows installers are unsigned unless an Authenticode signing certificate is provided. Real PC/Android transfer and update tests remain essential before public Release distribution.

© 2026 Fileport.
