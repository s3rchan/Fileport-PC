"""Build every Windows icon from the new Fileport logo.
The original PNG is kept in src/branding/logo.png. No legacy icon assets are
needed in Git: running `npm run dev` or `npm run build` recreates the icons.

Taskbar fix: remove alpha padding and scale the image to *fill* the icon square,
including small 16/24/32 px Windows icon sizes. The artwork is unchanged.
"""
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"src/branding/logo.png"
if not SOURCE.is_file():
    raise FileNotFoundError(f"Missing official Fileport logo: {SOURCE}")
art=Image.open(SOURCE).convert("RGBA")
mask=art.getchannel("A").point(lambda a: 255 if a > 32 else 0)
bbox=mask.getbbox()
if bbox is None:
    raise RuntimeError("Official Fileport icon contains no visible pixels")
art=art.crop(bbox)
# The official vertical mark is slightly narrower than a square. Filling the
# icon gives it a visibly larger footprint in the Windows taskbar and Start.
icon=art.resize((512,512),Image.Resampling.LANCZOS)
output=ROOT/"src-tauri/icons"
output.mkdir(parents=True,exist_ok=True)
icon.save(output/"icon.png",optimize=True)
icon.save(output/"icon.ico",format="ICO",
          sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("Created full-size Windows and taskbar icons from Newdesign/logo.png")
