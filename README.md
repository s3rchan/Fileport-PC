# Fileport PC

**Fileport** connects your Windows PC directly to your Android phone for local file sharing and chat. It uses the same reachable Wi-Fi / LAN, not a cloud server.

**Source version:** v1.9.4 (development build; a source build is not automatically a published Release).

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
- **Music Share (PC → Android):** Choose music on the PC, request phone consent before transfer, send over the authenticated encrypted channel, then press Play on either device to start both players approximately together.

## Installation and pairing

1. Install the Windows NSIS installer from the **Releases** page. Unsigned builds can show a Windows SmartScreen warning.
2. Open Fileport on both devices using the same reachable private Wi-Fi / LAN.
3. On the PC choose **Start** or **Connect**, then select the phone.
4. Approve the signed request on the phone. For first pairing, **verify the matching six-digit code on both devices**.
5. Share messages and files. PC initiates reconnection; Android can remember explicit auto-connect approval for a trusted PC.

**Network ports:** PC TCP `38477`, PC discovery UDP `38478`, Android request UDP `38479`. Firewall or router client isolation can prevent discovery/connection. Local transfers need no internet. Only update checks/downloads need internet.

## Build from source

Requires Windows 10/11 (x64), Node.js 22, Rust/MSVC + WebView2. Python 3 with Pillow is needed only if regenerating icons; build-time font bundling uses Python in CI.

```powershell
python scripts/install_brand_fonts.py
npm ci
npm test
npm run build -- --bundles nsis
```

The authoritative brand artwork is `src/branding/logo.png` (original 150 × 168 aspect ratio). The generated Windows binaries `src-tauri/icons/icon.png` and `src-tauri/icons/icon.ico` **are committed to this repository**, so `cargo build`, `cargo test`, `tauri dev` and `npm run build` do not need Pillow just for icons. You only need Python 3 with Pillow to **regenerate** the images after changing the official logo: `npm run icons`.

The icon generator crops only actual transparent edges, scales proportionally into a 512 × 512 transparent canvas with narrow padding, and exports 16, 24, 32, 48, 64, 128 and 256 px Windows icon sizes. It never stretches the artwork. Taskbar, Windows Explorer and pinned shortcuts may display cached icons until you unpin/re-pin or clear the Windows icon cache.

### Version policy (starting with v1.9.1)

- **Regular new version:** increase the last number, e.g. `1.9.1 → 1.9.2`.
- **Major update in our release workflow:** increase the middle number, resetting the last one to zero, e.g. `1.9.2 → 1.10.0`.
- The first number is reserved for a future platform-generation change.
- Do not publish another source revision under the same release tag.
- **Re-running an unchanged CI commit is not a new product version.**

Run `python scripts/bump_version.py patch` or `python scripts/bump_version.py minor` **before committing a new product build**. The script synchronizes `package.json`, Tauri and Rust versions, the About screen and README. CI checks consistency with `--check`. Write the corresponding `CHANGELOG.md` entry before publication.

The previous root `package-lock.json` was for a different WebRTC/`ws` project and was intentionally deleted; CI resolves the current Tauri dependencies using `npm install --no-package-lock`. Current Tauri dependencies are frozen in the npm lockfile.

## Release publishing

Normal pushes to `main` build the Windows EXE and upload **Fileport-Windows-Installer** to Actions artifacts. Artifacts are test builds, not published application updates.

Tag a tested commit as `pc-v1.9.1` (matching the Tauri version), or manually dispatch the workflow with the release option, to publish to GitHub Releases. The online updater points only at `s3rchan/Fileport-PC`.

## Compatibility and migration

The native identifier `com.yakin.flow.pc` and IndexedDB/localStorage keys beginning with `yakin-flow-` are **intentionally retained for upgrade compatibility**. Renaming them without a tested migration can orphan the ECDSA private identity and saved trusted-device list, and can break in-place Windows updates. They are not used in the visible Fileport branding or network protocol.

Old WebRTC website/server sources, obsolete deployment/reflect-screen instructions, duplicate root workflow and unused logos are removed. See [CHANGELOG.md](CHANGELOG.md) for historical release notes and [FPTP_PROTOCOL_v1.md](FPTP_PROTOCOL_v1.md) for the protocol.

## Privacy and security

FPTP/1 is a custom encrypted application protocol, **not an independently audited security implementation**. Verify first-time pairing codes and approve only trusted devices. Current Windows installers are unsigned unless an Authenticode signing certificate is provided. Real PC/Android transfer and update tests remain essential before public Release distribution.

© 2026 Fileport.


## Music Share (v1.9.3 development)

Open **Music** in the Windows sidebar and click **Music Share**. Select an MP3, M4A, WAV, OGG or FLAC audio file up to 150 MB. The Android app displays the file name and size and must approve before the PC sends any file content. Once the file is saved to Android Downloads and both decoders report readiness, either device can press **Play on both** or **Stop**. Playback uses a shared command over the existing authenticated FPTP/1 connection and a 1.6-second scheduling lead time; it is **approximate**, not sample-accurate synchronized audio.

No music is streamed before approval. To use this feature, upgrade **both** Windows (v1.9.3+) and Android (v3.0.2+) clients. Keep the applications open and both devices connected while listening. Unsupported codecs may be rejected by the operating system.
