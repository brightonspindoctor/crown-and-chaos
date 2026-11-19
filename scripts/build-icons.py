# Renders the app icons from the artwork in game/icons/: icon-source.jpg if it is there (the crowned-wolf artwork),
# otherwise icon.svg. The source should be square with no transparency.
# To change the icon, replace icon-source.jpg and run: python3 scripts/build-icons.py
# For a round artwork like the wolf, the dark corners outside the circle are filled with the background red so the
# icon fills the whole slot when Android masks it to a circle or squircle, and when iOS rounds the corners.
# Needs Pillow (and cairosvg for an SVG source).
import pathlib
from PIL import Image, ImageDraw, ImageFilter
icons = pathlib.Path(__file__).resolve().parent.parent / "game" / "icons"
jpg = icons / "icon-source.jpg"

def full_bleed(src):
    w = src.size[0]
    px = [src.getpixel((x, y)) for x in range(int(w * .056), int(w * .088)) for y in range(int(w * .45), int(w * .49))]
    r, g, b = [sum(c) // len(c) for c in zip(*px)]
    bg = Image.new("RGB", (w, w), (r, g, b))
    vign = Image.new("L", (w, w), 0); ImageDraw.Draw(vign).ellipse((-w * .2, -w * .2, w * 1.2, w * 1.2), fill=255)
    bg = Image.composite(bg, Image.new("RGB", (w, w), (int(r * .45), int(g * .45), int(b * .45))), vign.filter(ImageFilter.GaussianBlur(w / 10)))
    m = Image.new("L", (w, w), 0); ImageDraw.Draw(m).ellipse((6, 6, w - 7, w - 7), fill=255)
    return Image.composite(src, bg, m.filter(ImageFilter.GaussianBlur(2)))

if jpg.exists():
    src = Image.open(jpg).convert("RGB"); full = full_bleed(src)
    out = [("icon-512.png", src, 512), ("icon-192.png", src, 192), ("favicon-32.png", src, 32),
           ("icon-maskable-512.png", full, 512), ("icon-maskable-192.png", full, 192), ("apple-touch-icon.png", full, 180)]
    for name, im, size in out:
        im.resize((size, size), Image.LANCZOS).save(icons / name, optimize=True); print("wrote", name)
else:
    import cairosvg
    svg = (icons / "icon.svg").read_bytes()
    for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180), ("favicon-32.png", 32), ("icon-maskable-512.png", 512), ("icon-maskable-192.png", 192)]:
        cairosvg.svg2png(bytestring=svg, write_to=str(icons / name), output_width=size, output_height=size); print("wrote", name)
