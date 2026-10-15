# Fileport PC v1.5.0 — FPTP/1

Fileport connects Windows and Android on the **same local network** without
Render, public rooms, WebRTC, a browser-hosted site, or cloud uploads.

## Build

Requirements: Node.js, Rust with a current MSVC toolchain and WebView2 on Windows.
From this source directory run `npm install`, then `npm run build`.
The resulting desktop installer is under `src-tauri/target/release/bundle/`.

## Network

- PC listens on TCP **38477** for bounded length-prefixed FPTP/1 frames.
- PC advertises its public device ID through mDNS `_fileport._tcp.local.`
  and a legacy-compatible UDP broadcast on port **38476**.
- Android browses mDNS, listens for UDP discovery, and has a manual LAN IP fallback.
- The listener replaces stale sockets on reconnect; idle sockets time out. Both
  applications send heartbeat frames. The TCP listener is NOT a public internet server.
- Inbound TCP 38477 and UDP 5353 / 38476 may require a **Private network**
  Windows Firewall rule. Router client isolation will still block local connections.

## FPTP/1 security

The transport is raw TCP but **no chat or file content is sent in plaintext**.
Both peers sign ephemeral P-256 ECDH parameters with their persistent ECDSA
identity. HKDF derives directional AES-256-GCM keys; an encrypted control
exchange requires mutual approval. Users compare matching 6-digit codes for
new pairings; saved identities are checked on every reconnect. Per-frame
sequence numbers and authenticated ciphertext reject tampering/replay.
**This is an experimental custom application-layer secure transport, NOT TLS.**
No independent security audit has been performed. Its security must not be
assumed equivalent to an audited TLS 1.3 implementation.

## File transfer

Files up to 1 GiB are divided into 32 KiB encrypted frames. Receivers write to
partial files on disk and acknowledge only synced offsets at 256 KiB windows.
The sender retains a stable transfer ID, and the recipient resumes from its
saved offset after reconnection. Before a file is published, both sides check
its streaming SHA-256 digest. Android uses a pending MediaStore download; PC
stages the partial file in the application data directory.
Resumption after an app restart requires selecting the same source file again.

## Compatibility and limitations

- **Upgrade both devices**: FPTP/1 cannot talk to older WebRTC versions.
- Application/package identifiers and IndexedDB names are intentionally
  retained to preserve previously saved trusted keys during an in-place upgrade.
- BLE remains an experimental *discovery hint*. Wi-Fi Direct transport and
  cross-network connections are not implemented.
- Background reliability with a sleeping phone requires additional Android
  foreground-service work. Active transfer protection is best-effort.
- The new protocol has unit/integration simulations but has **not** been
  compiled and run as Windows/Android binaries in this environment.

## Test procedure

1. Keep both devices on private Wi-Fi; install both new versions without
   clearing app data. Ensure Windows listener can accept inbound port 38477.
2. Scan on Android. If discovery fails, enter the PC's IPv4 LAN address.
3. Confirm the same six-digit security code on BOTH devices for a new pairing.
4. Exchange a short message and a small file. Compare its SHA-256 digest.
5. Send a larger file; disable and re-enable Wi-Fi mid-transfer and verify
   that the file resumes rather than restarts and matches SHA-256.
6. Repeat with a trusted device and confirm reauthentication without code entry.

## Protocol wire format (FPTP/1, experimental)

Each TCP frame is a 4-byte unsigned big-endian byte length followed by UTF-8
JSON (maximum 192 KiB). Until the handshake completes, only a signed `hello`
frame or a `keepalive` is permitted. A `hello` carries a persistent ECDSA
P-256 public key fingerprint, a 24-byte random nonce, the ephemeral ECDH
P-256 public point, and an ECDSA signature. Both sides derive directional
AES-256-GCM keys using HKDF-SHA-256 over the shared ephemeral secret.

Subsequent frames are `{v:1,t:"sealed",seq,body}` with a monotonic per-direction
sequence counter and AES-GCM ciphertext encoded in Base64. Associated data
contains the ordered handshake transcript. Inside encrypted frames, packet
types are `approve`, `reject`, `ping`, `pong`, `text`, `file-start`,
`file-ready`, `file-chunk`, `file-ack`, `file-end`, `file-complete`, `file-error`.

**Threat-model notes:** mDNS and broadcast identities are hints, not proof.
Any LAN peer may attempt to exhaust connection slots or block discovery.
The first-pairing short code authenticates the new identity only when users
compare it on both devices and approve. The custom crypto framing has not
been formally analyzed. For sensitive production deployment, replace the
transport with a security-audited TLS 1.3/Noise protocol implementation.

## Developer checks

On a computer with Node.js, open the PC project and run `npm test`. This
exercises mutual approval, encrypted messaging, sender/receiver byte equality,
and unaligned interruption + transfer resume using mocked native transports.
These tests do **not** replace actual Tauri, Android or network tests.
The on-wire format is documented in `FPTP_PROTOCOL_v1.md`.

## Offline manual updates
Select the new signed .exe installer from Settings. Both the running app and installer must have matching valid Authenticode publisher certificates. Unsigned developer builds cannot self-update. No website, update server or background download is used.


## v1.6: Chat drag-and-drop
Drop one or more files directly onto the conversation panel. Fileport verifies the active trusted connection, validates file sizes and sends through FPTP. Dragging files elsewhere never navigates away from the application.


## Automated Windows EXE build (GitHub Actions)

The repository includes `.github/workflows/build-windows.yml`. Upload the **contents** of this project directory to the root of a GitHub repository (the `.github` folder must be included). Open **Actions → Build Fileport Windows EXE → Run workflow**. Once completed, download the `Fileport-Windows-Installer` artifact; it contains the NSIS installer `.exe`. The workflow also runs `npm test`. Pushing a tag like `pc-v1.6.0` starts the same workflow.

The output is an **unsigned** Windows installer unless code signing is configured separately. The in-app manual updater may reject unsigned installers; do not claim that the resulting EXE is accepted by the updater without configuring publisher signing and verifying it on Windows. This build workflow has not been executed on GitHub Actions in this environment.
