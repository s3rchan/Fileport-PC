"""Generate Fileport launcher/installer icons from the approved anchor SVG.
Run: python scripts/generate_brand_icons.py  (requires Pillow).
The SVG is the version-controlled design source; all outputs are reproducible.
"""
from __future__ import annotations
from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
IS_ANDROID = (ROOT / "app" / "src" / "main" / "assets").is_dir()
ASSET_DIR = ROOT / ("app/src/main/assets" if IS_ANDROID else "src")
svg = (ASSET_DIR / "fileport-brand-icon.svg").read_text(encoding="utf-8")
match = re.search(r'<path[^>]+d="([^"]+)"', svg)
if match is None:
    raise RuntimeError("Fileport anchor path was not found")
shapes = [
    [(int(x), int(y) + 7) for x, y in re.findall(r"(\d+),(\d+)", part)]
    for part in match.group(1).split("Z") if part.strip()
]
if len(shapes) != 2:
    raise RuntimeError("Expected anchor silhouette and inner ring hole")

SIZE = 1024  # Draw at 2x, then downsample for smoother launcher icons.
scale = SIZE / 512
grad = Image.new("RGBA", (SIZE, SIZE))
pixels = grad.load()
left, right = (6, 55, 231), (54, 140, 255)
for x in range(SIZE):
    ratio = x / (SIZE - 1)
    rgb = tuple(round(a + (b - a) * ratio) for a, b in zip(left, right))
    for y in range(SIZE):
        pixels[x, y] = (*rgb, 255)
rounded = Image.new("L", (SIZE, SIZE))
r = ImageDraw.Draw(rounded)
r.rounded_rectangle((0, 7 * scale, SIZE - 1, (498 + 7) * scale - 1), radius=62 * scale, fill=255)
grad.putalpha(rounded)
draw = ImageDraw.Draw(grad)
coords = lambda points: [(round(x * scale), round(y * scale)) for x, y in points]
draw.polygon(coords(shapes[0]), fill="white")
# Transparent ring interior must expose the original blue gradient.
hole = Image.new("L", (SIZE, SIZE))
ImageDraw.Draw(hole).polygon(coords(shapes[1]), fill=255)
grad.paste(Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), mask=hole)
# Repaint the blue gradient through that hole, respecting the rounded shape.
grad.paste(Image.composite(grad, Image.new("RGBA", (SIZE, SIZE)), hole), (0, 0)) if False else None
gradient_ring = Image.new("RGBA", (SIZE, SIZE))
gradient_ring.putdata([(*tuple(round(a + (b - a) * (x / (SIZE - 1))) for a, b in zip(left, right)), 255) for y in range(SIZE) for x in range(SIZE)])
grad.paste(gradient_ring, (0, 0), hole)
base = grad.resize((512, 512), Image.Resampling.LANCZOS)

if IS_ANDROID:
    folders = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    base.save(ASSET_DIR / "app-icon.png")
    base.save(ASSET_DIR / "fileport-icon.png")
    res = ROOT / "app/src/main/res"
    for density, n in folders.items():
        folder = res / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        item = base.resize((n, n), Image.Resampling.LANCZOS)
        item.save(folder / "ic_launcher.png")
        mask = Image.new("L", (n, n))
        ImageDraw.Draw(mask).ellipse((0, 0, n - 1, n - 1), fill=255)
        item.putalpha(ImageChops.multiply(item.getchannel("A"), mask))
        item.save(folder / "ic_launcher_round.png")
    base.save(res / "mipmap-xxxhdpi/ic_launcher_512.png")
else:
    icons = ROOT / "src-tauri/icons"
    icons.mkdir(parents=True, exist_ok=True)
    base.save(icons / "icon.png")
    base.save(icons / "icon.ico", format="ICO", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("Generated official Fileport anchor icons")
