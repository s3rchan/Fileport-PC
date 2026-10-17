# Fileport — Windows PC

**Fileport** is a desktop application for direct file transfers and messaging between a Windows PC and an Android phone over the same Wi-Fi or local area network (LAN).

**Current Windows version:** v1.8.0 · **Android app:** [Fileport Android repository](https://github.com/s3rchan/Fileport-Android)

[**Download the Windows installer — GitHub Releases**](https://github.com/s3rchan/Fileport-PC/releases/latest)

> **Note:** This repository is no longer the original room-code-based "Yakın" WebRTC project. Fileport is a standalone Windows application for local networks and does not require numbered rooms, a web signaling server, or TURN.

## Features

- **PC-initiated pairing:** Windows discovers Fileport Android devices on the same local network and sends connection requests.
- **Phone approval:** Android accepts or rejects incoming requests. Automatic reconnection may be enabled for trusted computers.
- **Six-digit verification:** During first-time pairing, compare and approve the six-digit security code on both devices.
- **Direct file transfers and chat:** Communicate over a local FPTP/1 connection.
- **Local device and transfer history:** History stays on the device; transferred files are not stored in chat history.
- **Reconnection:** The PC can send a new connection request to a previously trusted device.
- **Update options:** Check GitHub Releases for updates or choose an installer manually using the offline update option.
- **English and Turkish interface.**

## Requirements

- Windows 10 or 11 (x64).
- The Fileport Android app installed on your phone.
- Both devices connected to the same reachable Wi-Fi/LAN.
- Windows Firewall configured to allow Fileport's local network communication.

Local transfers do **not** require internet access. Checking GitHub for updates and downloading them **does** require internet access.

## Installation and first connection

1. Open [GitHub Releases](https://github.com/s3rchan/Fileport-PC/releases).
2. Download the latest `Fileport_*_x64-setup.exe` installer.
3. Install and launch Fileport on Windows.
4. Open Fileport on your Android phone.
5. On the PC, select the phone through the **Start / Connect** flow.
6. Approve the incoming request on the phone. During initial pairing, compare the six-digit code on both devices and confirm.
7. Once connected, use chat and file sharing.

> **Windows SmartScreen:** Publishing an installer on GitHub Releases does not automatically establish a trusted publisher reputation or replace Authenticode signing. Download installers only from the official Releases page.

## GitHub Releases and updates

Windows releases use tags in the format `pc-vX.Y.Z` (for example, `pc-v1.8.0`).

- [Windows releases](https://github.com/s3rchan/Fileport-PC/releases)
- [Windows GitHub Actions](https://github.com/s3rchan/Fileport-PC/actions)
- [Android releases](https://github.com/s3rchan/Fileport-Android/releases)

In Fileport PC, open **Settings → GitHub updates (Windows)** to check for a newer version and download its installer. The **Offline update** option is also available.

**Repository rename compatibility:** The v1.8.0 updater source still references the former repository path `s3rchan/Fileport-PC-v1.6`. It may continue to work through GitHub's redirects, but the next Windows release should update the URLs to `s3rchan/Fileport-PC` and test the complete flow on a real Windows machine. Update behavior in the current build is not guaranteed.

### Automated Windows builds

Open **Actions → Build Fileport Windows EXE → Run workflow**.

- A regular push to `main` runs CI tests, builds the NSIS installer, and makes it available under **Artifacts → Fileport-Windows-Installer**.
- A manual run with **Publish installer to GitHub Releases** selected also publishes the resulting installer to the `pc-vX.Y.Z` release matching the app version.
- Pushing a `pc-v*` tag triggers a version check and publication to the associated Release.

**A successful GitHub Actions build does not guarantee compatibility** with every device or network. Windows–Android pairing and transfers should also be tested on physical devices.

## Development

Fileport uses **Tauri 2 / Rust** for the native Windows application and **HTML, CSS, and JavaScript** for the interface.

Local development requires Node.js, Rust, and the necessary Windows build tools.

```bash
npm install
npm test
npm run build -- --bundles nsis
```

Protocol, LAN connection, and updater tests are in `tests/`. See [FPTP_PROTOCOL_v1.md](FPTP_PROTOCOL_v1.md) for protocol details.

## Security and privacy

Fileport is designed for direct communication over a local network. FPTP/1 is an experimental encrypted application protocol that **has not undergone an independent third-party security audit**. Always compare the pairing codes and approve requests only from devices you recognize.

## Fileport brand identity

The approved visual identity for upcoming releases:

| Element | Standard |
| --- | --- |
| Primary blue | `#0637E7` |
| Light blue | `#368CFF` |
| Navy | `#01224F` |
| Light background | `#CFE1F4` |
| White | `#FFFFFF` |
| Font | **Open Sauce** |
| Logo | **White anchor symbol and Fileport wordmark on blue** |

> The new brand identity will be introduced gradually in future versions. Its documentation here does not mean the current v1.8.0 EXE already uses the new logo, colors, or typography.

---

**Fileport — direct connection, file sharing, and chat between Windows and Android.**
