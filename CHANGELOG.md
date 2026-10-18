# Fileport PC — Changelog

The historical version-specific README files were consolidated here on 18 October 2026. These entries describe past source milestones, not a guarantee that each historical binary was publicly released.

## v1.9.3 — 18 October 2026 (development build)

- Added Music tab with **Music Share** file picker and explicit Android accept/decline before any music file bytes are sent.
- Reused authenticated encrypted FPTP file transfers, with Android native MediaPlayer reading the verified local Downloads URI.
- Added two-device Play/Stop controls using a shared LAN command with a 1.6-second playback lead time.
- Added regression coverage for consent gating, verified file readiness and player control.
- Playback sync is approximate; real Windows/Android latency tests remain necessary.

## v1.9.2 — 18 October 2026 (source build)

- Fixed the Windows taskbar icon aspect ratio: the official 150 × 168 mark now fits proportionally inside a transparent square without forced stretching.
- Committed pre-generated `src-tauri/icons/icon.png` and `src-tauri/icons/icon.ico`, restoring out-of-the-box Rust/Tauri builds without Pillow.
- Replaced the obsolete dependency lock with a current Tauri `package-lock.json` and switched Windows CI to `npm ci`.
- Added a source-asset workflow to regenerate Windows icons and dependency lock when brand artwork, generator or package manifest changes.

## v1.9.1 — 18 October 2026 (source build)

- Removed the unused legacy Yakın/WebRTC website and signaling server, including `public/` and `server.js`.
- Removed old WebRTC/screen-cast/deployment notes, duplicate root Windows workflow and obsolete `ws` package lock.
- Unified Fileport UI branding with the approved Newdesign logos. Dropped unused old logos.
- Generated full-size Windows icons with explicit 16–256 px resolutions to improve taskbar and pinned-shortcut visibility.
- Kept native app identity and trusted-device storage keys unchanged for backward compatibility.
- Corrected README and version display; introduced checked three-part build version policy.

## v1.9.0 (source)

- New clean Fileport interface, navy sidebar and white content, preserving the approved palette.
- Devices, History, Chat, Settings and About pages; refreshed Fileport branding and typography.
- First-launch English with language selection in Settings.
- Moved Windows updates to online GitHub Releases and corrected the former repository URL.
- Improved LAN request scheduling, discovery and reconnect handling.

## v1.8.x — GitHub Release updater

- Added Windows GitHub Releases update checks and validated NSIS downloads with size/hash and version restrictions.
- Legacy local/manual EXE update mechanism subsequently removed.
- Published source note `README_version1.8.md` contained now-obsolete repository and updater references; do not use those instructions.

## v1.7.x — PC-led LAN pairing

- PC sends a signed LAN request to Android, which connects via local FPTP TCP.
- Mandatory matching six-digit first-time pairing approval on both devices.
- Optional automatic reconnect for individually trusted computers.
- Discovery: PC UDP 38478, Android UDP 38479; FPTP TCP 38477.
- Added stand-alone LAN test fixtures.

## v1.5.x–v1.6.x — FPTP/1 transport

- Switched from the earlier WebRTC room-code design to local TCP with application-level encrypted FPTP/1 frames.
- Authenticated ephemeral P-256 ECDH, AES-256-GCM and six-digit first pairing codes.
- Chunked transfers, persisted partial files, offsets and SHA-256 checks; attempts to resume after reconnect.
- Custom encryption has **not** been independently audited.

## Historical compatibility

For safe upgrades, package identifier `com.yakin.flow.pc` and persisted `yakin-flow-*` identity and history storage keys are deliberately retained. Changing their names requires a tested data migration and Windows installer-upgrade procedure.
