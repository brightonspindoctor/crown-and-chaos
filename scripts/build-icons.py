# Renders the app icons from the artwork in game/icons/: icon-source.jpg if it is there (the current wolf-and-crown
# artwork), otherwise icon.svg. The source should be square with no transparency.
# To change the icon, replace icon-source.jpg and run: python3 scripts/build-icons.py
# Needs Pillow (and cairosvg for an SVG source).
import pathlib
from PIL import Image
icons = pathlib.Path(__file__).resolve().parent.parent / "game" / "icons"
sizes = [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]
png = icons / "icon-source.jpg"
if png.exists():
    src = Image.open(png).convert("RGB")
    for name, size in sizes:
        src.resize((size, size), Image.LANCZOS).save(icons / name, optimize=True); print("wrote", name)
else:
    import cairosvg
    svg = (icons / "icon.svg").read_bytes()
    for name, size in sizes:
        cairosvg.svg2png(bytestring=svg, write_to=str(icons / name), output_width=size, output_height=size); print("wrote", name)
