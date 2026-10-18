"""Generate Fileport Windows icons from Newdesign/logo.png, preserving its artwork.
The image is sourced from the approved Newdesign.zip and stored in the repository.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src" / "branding"
source = ASSETS / "logo.png"
if not source.is_file():
    raise FileNotFoundError("Missing approved brand icon src/branding/logo.png")
art = Image.open(source).convert("RGBA")
art.thumbnail((500, 500), Image.Resampling.LANCZOS)
image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
image.alpha_composite(art, ((512-art.width)//2, (512-art.height)//2))
icons = ROOT / "src-tauri" / "icons"
icons.mkdir(parents=True, exist_ok=True)
image.save(icons / "icon.png", optimize=True)
image.save(icons / "icon.ico", format="ICO",
           sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("Fileport Windows icon generated from approved Newdesign/logo.png")
