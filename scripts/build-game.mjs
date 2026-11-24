// Builds game/index.html: the playable prototype (tutorial, first pack, collection, line-up, fights, shop),
// with the engine, every reviewed card, the painting credits and the animation player (play/fx.js) inlined. Images are read from game/img/.
// Run with: python3 scripts/crop-game-art.py && node scripts/build-game.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadData, loadLore } from "../engine/load-data.mjs";
const root = new URL("..", import.meta.url).pathname;
const data = loadData();
delete data.front["the-needle"].renown;
const manifest = JSON.parse(readFileSync(root + "art/manifest.json", "utf8")).images;
const byId = Object.fromEntries(manifest.map((e) => [e.id, e]));
const credit = (e) => ({ artist: e.artist, title: e.title, date: e.date, from: e.source?.original || e.source?.name || "", url: e.source?.url || "" });
const art = {};
for (const c of [...Object.values(data.heroes), ...Object.values(data.front), ...Object.values(data.items)]) {
  if (c.art && byId[c.art]) art[c.id] = credit(byId[c.art]);
}
// Summoned cards (such as Gwydion's Tree Warrior) have no card file, only an art entry and a cropped image.
for (const e of manifest) {
  if (e.use !== "card" || e.status !== "cleared") continue;
  for (const card of e.cards || []) if (!art[card] && existsSync(`${root}game/img/${card}.jpg`)) art[card] = credit(e);
}
// Variant artworks, by card: every cleared painting with a crop for that card (images from scripts/crop-game-art.py).
// Numbered from 2, since the card's own painting is number 1.
const variants = {};
for (const e of manifest) {
  if (e.use !== "variant" || e.status !== "cleared") continue;
  for (const card of Object.keys(e.crops || {})) {
    if (!existsSync(`${root}game/img/v/${e.id}--${card}.jpg`)) continue;
    (variants[card] ??= []).push({ key: `${e.id}--${card}`, card, n: variants[card].length + 2, ...credit(e) });
  }
}
// Lore cards, by hero.
const lore = loadLore();
// Battle boards: one per tale. A tale whose board has no image yet borrows another board from its realm.
const boards = {}, realmBoard = {};
const realmOf = (tale) => Object.values(data.heroes).find((h) => h.tale === tale)?.realm;
for (const e of manifest) {
  if (e.use !== "board" || e.id.includes("fallback") || !existsSync(`${root}game/img/${e.id}.jpg`)) continue;
  const name = e.id === "board-st-george" ? "The Field at Silene" : e.board;
  for (const t of e.tales) { boards[t] = { id: e.id, name, ...credit(e) }; realmBoard[realmOf(t)] ??= boards[t]; }
}
for (const h of Object.values(data.heroes)) boards[h.tale] ??= realmBoard[h.realm] || boards["St George and the Dragon"];
// A build stamp (date and commit) so logged fights can be tied to a version of the game.
let build = new Date().toISOString().slice(0, 10);
try { build += "-" + (await import("node:child_process")).execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(); } catch (e) {}
const engine = readFileSync(root + "engine/engine.mjs", "utf8").replace(/^export /gm, "");
const json = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
const html = readFileSync(root + "game/template.html", "utf8")
  .replace("/*DATA*/", () => json(data)).replace("/*ART*/", () => json(art)).replace("/*BOARDS*/", () => json(boards))
  .replace("/*VARIANTS*/", () => json(variants)).replace("/*LORE*/", () => json(lore))
  .replace("/*BUILD*/\"dev\"", () => JSON.stringify(build))
  .replace("/*ENGINE*/", () => engine)
  .replace("/*FXCSS*/", () => readFileSync(root + "play/fx.css", "utf8"))
  .replace("/*FX*/", () => readFileSync(root + "play/fx.js", "utf8"));
writeFileSync(root + "game/index.html", html);
console.log(`game/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
