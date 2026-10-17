"""Install the approved Open Sauce Sans TTFs for offline Fileport builds.
Use verified v1.478 fonts from the original typeface author's repository.
The SHA-256 hashes come from the four original fonts supplied for Fileport.
"""
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib

ROOT = Path(__file__).resolve().parents[1]
ANDROID = (ROOT / "app/src/main/assets").is_dir()
ASSETS = ROOT / ("app/src/main/assets" if ANDROID else "src")
TARGET = ASSETS / "fonts"
TARGET.mkdir(parents=True, exist_ok=True)
BASE = "https://raw.githubusercontent.com/marcologous/Open-Sauce-Fonts/master/fonts/ttf/"
CHECKSUMS = {
    "Regular": "047fe1d567fae0d3ef516359574f2e89f80e703c98508ac34d914bd154e5e87b",
    "Medium": "afb340900182f0c611fe426d42e504a4ebdff08d5b7e02f60be2c77f64067c9f",
    "SemiBold": "9fbced4ee2764ed6272f636d8370f759260e0978e838b96c9bb0865b8f94e4f8",
    "Bold": "88b1a940fbd39cd12314e21da36306c7a352eefd1b3d04f1fdc63840cc939a70",
}
for weight, expected in CHECKSUMS.items():
    name = f"OpenSauceSans-{weight}.ttf"
    dest = TARGET / name
    if dest.is_file():
        data = dest.read_bytes()
    else:
        request = Request(BASE + name, headers={"User-Agent": "Fileport-brand-build/1.0"})
        with urlopen(request, timeout=45) as response:
            data = response.read()
    if len(data) < 1000 or hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError(f"Font integrity check failed for {name}; build stopped")
    if not dest.is_file():
        dest.write_bytes(data)
    print("Verified Open Sauce Sans", weight)
# License from the author's public SIL OFL 1.1 distribution.
license_file = TARGET / "OFL.txt"
if not license_file.exists():
    url = "https://raw.githubusercontent.com/marcologous/Open-Sauce-Fonts/master/Open%20Sauce%20Sans%20OFL.txt"
    with urlopen(Request(url, headers={"User-Agent": "Fileport-brand-build/1.0"}), timeout=45) as response:
        license_file.write_bytes(response.read())
