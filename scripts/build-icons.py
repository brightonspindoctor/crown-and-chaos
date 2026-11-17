# Renders the app icons from game/icons/icon.svg (a 512 x 512 square, no transparency).
# To change the icon, replace icon.svg and run: python3 scripts/build-icons.py && node scripts/build-game.mjs
# Needs cairosvg (pip install cairosvg).
import pathlib, cairosvg
icons = pathlib.Path(__file__).resolve().parent.parent / "game" / "icons"
svg = (icons / "icon.svg").read_bytes()
for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]:
    cairosvg.svg2png(bytestring=svg, write_to=str(icons / name), output_width=size, output_height=size)
    print("wrote", name)
