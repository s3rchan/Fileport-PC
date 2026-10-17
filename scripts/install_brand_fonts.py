"""Vendor Open Sauce Sans webfont weights for offline use in packaged Fileport.
Download only occurs during build. Running the apps requires no network access.
Pinned distribution: @fontsource/open-sauce-sans 5.3.0 (SIL OFL 1.1).
"""
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ANDROID = (ROOT / "app/src/main/assets").is_dir()
ASSETS = ROOT / ("app/src/main/assets" if ANDROID else "src")
TARGET = ASSETS / "fonts"
TARGET.mkdir(parents=True, exist_ok=True)
BASE = "https://cdn.jsdelivr.net/npm/@fontsource/open-sauce-sans@5.3.0/files/"
for weight in (400, 500, 600, 700):
    for subset in ("latin", "latin-ext"):
        name = f"open-sauce-sans-{subset}-{weight}-normal.woff"
        dest = TARGET / name
        if dest.is_file() and dest.stat().st_size > 1000:
            continue
        request = Request(BASE + name, headers={"User-Agent": "Fileport-brand-build/1.0"})
        with urlopen(request, timeout=45) as response:
            data = response.read()
        if len(data) < 1000 or not data.startswith(b"wOFF"):
            raise RuntimeError(f"Invalid WOFF font: {name}")
        dest.write_bytes(data)
        print("Bundled", name, len(data), "bytes")
