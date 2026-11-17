// Builds game/index.html: the playable prototype (tutorial, first pack, collection, line-up, fights, shop),
// with the engine, every reviewed card and the painting credits inlined. Images are read from game/img/.
// Run with: python3 scripts/crop-game-art.py && node scripts/build-game.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadData } from "../engine/load-data.mjs";
const root = new URL("..", import.meta.url).pathname;
const data = loadData();
delete data.front["the-needle"].renown;
const manifest = JSON.parse(readFileSync(root + "art/manifest.json", "utf8")).images;
const byId = Object.fromEntries(manifest.map((e) => [e.id, e]));
const credit = (e) => ({ artist: e.artist, title: e.title, date: e.date });
const art = {};
for (const c of [...Object.values(data.heroes), ...Object.values(data.front), ...Object.values(data.items)]) {
  if (c.art && byId[c.art]) art[c.id] = credit(byId[c.art]);
}
// Battle boards: one per tale. A tale whose board has no image yet borrows another board from its realm.
const boards = {}, realmBoard = {};
const realmOf = (tale) => Object.values(data.heroes).find((h) => h.tale === tale)?.realm;
for (const e of manifest) {
  if (e.use !== "board" || e.id.includes("fallback") || !existsSync(`${root}game/img/${e.id}.jpg`)) continue;
  const name = e.id === "board-st-george" ? "The Field at Silene" : e.board;
  for (const t of e.tales) { boards[t] = { id: e.id, name, ...credit(e) }; realmBoard[realmOf(t)] ??= boards[t]; }
}
for (const h of Object.values(data.heroes)) boards[h.tale] ??= realmBoard[h.realm] || boards["St George and the Dragon"];
const engine = readFileSync(root + "engine/engine.mjs", "utf8").replace(/^export /gm, "");
const json = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
const html = readFileSync(root + "game/template.html", "utf8")
  .replace("/*DATA*/", () => json(data)).replace("/*ART*/", () => json(art)).replace("/*BOARDS*/", () => json(boards))
  .replace("/*ENGINE*/", () => engine);
writeFileSync(root + "game/index.html", html);
console.log(`game/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
