"""Generate Fileport Windows icons from the ORIGINAL approved logo.
The 150x168 brand artwork is intentionally NOT stretched into a square.
Icon binaries are committed; this script is optional for Rust/Tauri builds.

Run manually after updating src/branding/logo.png:
    python -m pip install Pillow==11.3.0
    python scripts/generate_brand_icons.py
"""
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"src/branding/logo.png"
DEST=ROOT/"src-tauri/icons"
if not SOURCE.is_file():
    raise FileNotFoundError(f"Missing official Fileport logo: {SOURCE}")
art=Image.open(SOURCE).convert("RGBA")
box=art.getchannel("A").getbbox()
if not box:
    raise RuntimeError("The official Fileport logo contains no visible pixels")
art=art.crop(box)
# Preserve the source aspect ratio and use a minimal vertical margin.
SIZE=512
MARGIN=12
max_size=SIZE-2*MARGIN
scale=min(max_size/art.width,max_size/art.height)
new_size=(round(art.width*scale),round(art.height*scale))
art=art.resize(new_size,Image.Resampling.LANCZOS)
icon=Image.new("RGBA",(SIZE,SIZE),(0,0,0,0))
icon.alpha_composite(art,((SIZE-art.width)//2,(SIZE-art.height)//2))
DEST.mkdir(parents=True,exist_ok=True)
icon.save(DEST/"icon.png",optimize=True)
icon.save(DEST/"icon.ico",format="ICO",
          sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print(f"Fileport icon: preserved {box[2]-box[0]}x{box[3]-box[1]} ratio; "
      f"drawn {art.width}x{art.height} into {SIZE}x{SIZE} without distortion")
