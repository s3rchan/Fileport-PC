# Fileport PC 1.7 — LAN-initiated pairing / connecting

- Open Fileport on both devices and keep them on the same Wi-Fi / LAN.
- First setup: press **Start** on PC, select your Android phone from the live list.
- PC sends a signed local LAN connection request; Android initiates FPTP TCP to PC.
- Both devices show the same six-digit verification code and BOTH users must approve.
- After pairing: press **Connect** on PC; for 60 seconds it sends requests to the paired Android phone.
- Android shows a permission dialog; the **Automatically connect** checkbox remembers permission **for that one paired PC only**.
- Bluetooth was removed. Transfers and chats remain on encrypted FPTP TCP, without hosted servers.
- Firewall: Windows inbound TCP 38477 and UDP 38478; Android UDP 38479. Client-isolation/VPN can prevent discovery.

## Build

Upload this project's **contents**, including `.github/workflows/build-windows.yml`, to the GitHub repository and run its Windows workflow. The file is source code, not an EXE.

## Security scope

UDP advertisements are not trusted. Each connection request is signed by the PC's persistent ECDSA identity; Android checks the signature and the exact stored public-key fingerprint for previously paired PCs. The six-digit code is mandatory for first pairing. These changes were statically checked; production security review and device-to-device testing are still required. FPTP/1 is a custom crypto protocol, not independently audited TLS.
