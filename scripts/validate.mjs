// Checks the card data and the art manifest. Run with: node scripts/validate.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const errors = [];
const warnings = [];

const readDir = (dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: `${dir}/${f}`, data: JSON.parse(readFileSync(join(root, dir, f), "utf8")) }));

const manifest = JSON.parse(readFileSync(join(root, "art/manifest.json"), "utf8"));
const art = new Map(manifest.images.map((i) => [i.id, i]));

const ASPECTS = ["Guardian", "Slayer", "Healer", "Trickster", "Witch", "Beast", "Sovereign"];
const REALMS = ["Albion", "Cymru", "Rus'", "Norse", "Geatland", "Märchen", "Eventyr", "Gothic"];

for (const { file, data: h } of readDir("cards/heroes")) {
  if (!file.endsWith(`/${h.id}.json`)) errors.push(`${file}: file name doesn't match id "${h.id}"`);
  if (!REALMS.includes(h.realm)) errors.push(`${file}: unknown realm "${h.realm}"`);
  if (!ASPECTS.includes(h.aspect)) errors.push(`${file}: unknown aspect "${h.aspect}"`);
  if (h.vulnerableTo && !ASPECTS.includes(h.vulnerableTo)) errors.push(`${file}: unknown vulnerability "${h.vulnerableTo}"`);
  if (h.status === "sketch") continue;
  for (const k of ["health", "attack", "guard", "speed"]) {
    if (typeof h.stats?.[k] !== "number") errors.push(`${file}: missing stat ${k}`);
  }
  if (typeof h.renown !== "number") errors.push(`${file}: missing renown`);
  if (h.renown > 50) errors.push(`${file}: renown ${h.renown} is over the 50 budget`);
  for (const a of h.actions ?? []) {
    if (a.ap > 4) errors.push(`${file}: action "${a.name}" costs more than 4 AP`);
  }
  if (!h.art) warnings.push(`${file}: no art assigned`);
  else if (!art.has(h.art)) errors.push(`${file}: art "${h.art}" is not in the manifest`);
}

for (const i of manifest.images) {
  if (i.status === "open") continue;
  for (const k of ["artist", "title", "licence"]) if (!i[k]) errors.push(`art ${i.id}: missing ${k}`);
  if (!i.source?.name) errors.push(`art ${i.id}: missing source name`);
  if (i.artistDied && i.artistDied > new Date().getFullYear() - 71) {
    errors.push(`art ${i.id}: artist died ${i.artistDied}, which may still be in UK copyright`);
  }
  if (i.status === "to-confirm") warnings.push(`art ${i.id}: rights not yet confirmed; don't ship it`);
}


// Crops: every downloaded image needs one crop set per card that uses it, cut to the right shape.
const SHAPES = { window: 544 / 320, full: 600 / 840, board: 16 / 10 };
const MIN_WIDTH = { window: 544, full: 600, board: 1280 };
const users = new Map();
for (const { data: h } of readDir("cards/heroes")) if (h.art) users.set(h.art, [...(users.get(h.art) ?? []), h.id]);
for (const i of manifest.images) {
  if (!i.size) continue;
  const [W, H] = i.size;
  const wanted = i.use === "board" ? ["board"] : [...new Set([...(i.cards ?? []), ...(users.get(i.id) ?? [])])];
  for (const key of wanted) if (!i.crops?.[key]) errors.push(`art ${i.id}: no crop for "${key}"`);
  for (const [key, set] of Object.entries(i.crops ?? {})) {
    for (const [shape, [x, y, w, h]] of Object.entries(set)) {
      if (!SHAPES[shape]) { errors.push(`art ${i.id}: unknown crop shape "${shape}"`); continue; }
      if (x < 0 || y < 0 || x + w > 1.0005 || y + h > 1.0005) errors.push(`art ${i.id}: ${key} ${shape} crop runs off the image`);
      const ratio = (w * W) / (h * H);
      if (Math.abs(ratio / SHAPES[shape] - 1) > 0.02) errors.push(`art ${i.id}: ${key} ${shape} crop is the wrong shape (${ratio.toFixed(2)})`);
      if (w * W < MIN_WIDTH[shape]) warnings.push(`art ${i.id}: ${key} ${shape} crop is only ${Math.round(w * W)}px wide; find a larger scan`);
    }
  }
}

const fronts = readDir("cards/front-rank");
const items = readDir("cards/items");
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
console.log(`${readDir("cards/heroes").length} heroes, ${fronts.length} front-rank cards, ${items.length} items, ${manifest.images.length} images checked.`);
process.exit(errors.length ? 1 : 0);
