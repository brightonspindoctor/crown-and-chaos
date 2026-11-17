# Crops every card's painting and every battle board for the playable game (game/img/),
# using the crops stored in art/manifest.json. Run with: python3 scripts/crop-game-art.py
import json, glob, os
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
root = os.path.join(os.path.dirname(__file__), "..")
man = {e["id"]: e for e in json.load(open(f"{root}/art/manifest.json"))["images"]}
os.makedirs(f"{root}/game/img", exist_ok=True)
def source(art):
    return Image.open(glob.glob(f"{root}/art/images/{art}.*")[0]).convert("RGB")
def cut(im, box):
    W, H = im.size; x, y, w, h = box
    return im.crop((int(x * W), int(y * H), int((x + w) * W), int((y + h) * H)))
n = 0
for f in sorted(g for d in ("heroes", "front-rank", "items") for g in glob.glob(f"{root}/cards/{d}/*.json")):
    c = json.load(open(f))
    if c.get("status") == "sketch" or not c.get("art"): continue
    e = man[c["art"]]; crop = e["crops"].get(c["id"]) or e["crops"][c["art"]]
    im = cut(source(c["art"]), crop["window"]); im.thumbnail((520, 520))
    im.save(f"{root}/game/img/{c['id']}.jpg", quality=78, optimize=True); n += 1
for e in man.values():
    if e["use"] != "board" or e["status"] != "cleared" or "fallback" in e["id"]: continue
    if not glob.glob(f"{root}/art/images/{e['id']}.*"): print("no image yet for", e["id"]); continue
    im = cut(source(e["id"]), e["crops"]["board"]["board"]); im.thumbnail((1400, 1400))
    im.save(f"{root}/game/img/{e['id']}.jpg", quality=68, optimize=True); n += 1
print(n, "images written")
# Variant artworks: one image per painting and card (game/img/v/<variant>--<card>.jpg), for the Library and packs.
os.makedirs(f"{root}/game/img/v", exist_ok=True)
cards = {json.load(open(f))["id"] for d in ("heroes", "front-rank", "items") for f in glob.glob(f"{root}/cards/{d}/*.json")}
v = 0
for e in man.values():
    if e["use"] != "variant" or e["status"] != "cleared" or not glob.glob(f"{root}/art/images/{e['id']}.*"): continue
    for card, crop in e.get("crops", {}).items():
        if card not in cards: continue
        im = cut(source(e["id"]), crop["window"]); im.thumbnail((520, 520))
        im.save(f"{root}/game/img/v/{e['id']}--{card}.jpg", quality=78, optimize=True); v += 1
print(v, "variant images written")
