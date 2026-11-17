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

const heroIds = new Set(readDir("cards/heroes").map((x) => x.data.id));
for (const { file, data: l } of readDir("cards/lore")) {
  if (!file.endsWith(`/${l.hero}.json`)) errors.push(`${file}: file name doesn't match hero "${l.hero}"`);
  if (!heroIds.has(l.hero)) errors.push(`${file}: no hero "${l.hero}"`);
  if (!Array.isArray(l.cards) || l.cards.length > 3) errors.push(`${file}: a hero has at most 3 lore cards`);
  for (const c of l.cards ?? []) {
    if (c.id !== `${l.hero}-${c.n}`) errors.push(`${file}: lore id "${c.id}" should be "${l.hero}-${c.n}"`);
    for (const k of ["title", "text"]) if (!c[k]) errors.push(`${file}: lore ${c.id} missing ${k}`);
    if (!c.source?.work || !c.source?.url) errors.push(`${file}: lore ${c.id} must name its public-domain source`);
  }
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

// Tales: Bonds match tale names exactly, so flag names that differ only in case or a bracketed note.
const taleKey = (t) => (t ?? "").toLowerCase().replace(/\s*\(.*?\)\s*/g, "").replace(/^the /, "").trim();
const taleNames = new Map();
for (const { data: h } of readDir("cards/heroes")) {
  const k = taleKey(h.tale), seen = taleNames.get(k);
  if (seen && seen !== h.tale) errors.push(`hero ${h.id}: tale "${h.tale}" looks like "${seen}"; use one spelling so they share Bonds`);
  else taleNames.set(k, h.tale);
}

// Boards: every tale needs a board, chosen by the Crown hero's tale.
const boardTales = new Map();
for (const b of manifest.images.filter((i) => i.use === "board")) for (const t of b.tales ?? []) boardTales.set(t, b);
for (const { data: h } of readDir("cards/heroes")) {
  const b = boardTales.get(h.tale);
  if (!b) warnings.push(`hero ${h.id}: no board for the tale "${h.tale}"`);
  else if (b.status === "open") warnings.push(`hero ${h.id}: the board for "${h.tale}" has no art yet`);
}

const fronts = readDir("cards/front-rank");
const items = readDir("cards/items");
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
console.log(`${readDir("cards/heroes").length} heroes, ${fronts.length} front-rank cards, ${items.length} items, ${manifest.images.length} images checked.`);
process.exit(errors.length ? 1 : 0);
