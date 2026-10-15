# FPTP/1 — Fileport Transfer Protocol (experimental)

This specification describes the **implementation preview**, not a security-audited standard.
FPTP/1 currently runs as a length-prefixed JSON stream over raw local TCP, **not TLS**.
All messages and file payloads *after handshake* use authenticated encryption.
Peers must never transfer files before mutual authenticated approval.

## Discovery and transport

- Windows listens on TCP port 38477.
- Android discovers it by mDNS `_fileport._tcp.local.` or UDP broadcast at 38476; manual private LAN IPv4 is a fallback.
- mDNS and UDP announcements include the **public key fingerprint** (not a room code or session key). They are untrusted.
- Each TCP frame is a 4-byte unsigned big-endian length and UTF-8 JSON, limited to 196,608 bytes.
- Native transports exchange `keepalive` JSON frames at four-second intervals and close stale sockets on timeout.

## Mutual handshake

1. Each peer has a persistent non-extractable ECDSA P-256 private key stored by WebCrypto IndexedDB.
2. Each connection generates a new ephemeral ECDH P-256 key pair and a 24-byte random nonce.
3. Both send `hello`: version, identity public JWK, SHA-256 fingerprint, nonce, ephemeral public coordinates, display name, and ECDSA-SHA256 signature over the hello parameters.
4. Both validate fingerprint, signature, distinct identity and elliptic curve coordinates.
5. Peers form a canonical transcript sorted by identity fingerprint. They derive a 64-byte key material with HKDF-SHA256 using ECDH shared secret, transcript hash as salt and a fixed FPTP context string as info. The first/second halves become opposite-direction AES-256-GCM keys.
6. Each encrypted `sealed` packet has an authenticated monotonically increasing sequence number used as the 96-bit GCM IV and transcript-bound associated data.
7. New peers compare the same six-digit transcript fingerprint on both physical devices and **both** explicitly approve. Known peers may auto-approve only if the saved public key matches the verified signed identity.

**Important:** The six-digit display code is an out-of-band human check, not a password. This custom protocol is not equivalent to an audited TLS 1.3 design; it requires an independent security audit before sensitive or untrusted-network use. Unauthenticated LAN peers can still cause denial of service.

## Authenticated packets

- `approve`, `reject`: required control messages inside AES-GCM.
- `ping`, `pong`: liveness probe.
- `text`: UTF-8 message up to 2,000 characters.
- `file-start`: 128-bit random/stable transfer ID, sanitized name, MIME, size (<= 1 GiB).
- `file-ready`: receiving device's verified *local* partial-file byte offset.
- `file-chunk`: Base64-encoded binary payload up to 32 KiB with exact offset.
- `file-ack`: durable (synced-to-disk) offset after up to 256 KiB.
- `file-end`: sender's streaming SHA-256 of the full file.
- `file-complete`: only after receiver SHA-256 verification and successful publish to Downloads.
- `file-error`: bounded failure string.

Offset, checksum, size and path are checked again in the native writer. Incomplete files remain staged locally for resumption. A transfer resumes by repeating `file-start` with the same ID and selecting the same local source file after an app restart.

## Not implemented / limitations

- No peer-to-peer relay across different networks.
- Bluetooth LE advertises *discovery hints only*; Wi-Fi Direct transport is not implemented.
- Android foreground service to ensure screen-off file transfers is not implemented.
- The WebView/UI process must remain available to encrypt/decrypt file chunks.
- Protocol version negotiation and independent security review remain future work.
