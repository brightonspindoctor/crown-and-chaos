// Builds tutorial/index.html: the scripted tutorial fight, with the engine, the cards it uses
// and their painting credits inlined. Images are read from tutorial/img/ by relative path.
// Run with: node scripts/build-tutorial.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { loadData } from "../engine/load-data.mjs";
const root = new URL("..", import.meta.url).pathname;
const data = loadData();
const HEROES = ["the-princess", "st-george", "the-dragon"];
const FRONT = ["villager", "longbowman", "knight", "berserker"];
const ITEMS = ["gingerbread"];
const pick = (src, ids) => Object.fromEntries(ids.map((id) => [id, src[id]]));
const slim = { heroes: pick(data.heroes, HEROES), front: pick(data.front, FRONT), items: pick(data.items, ITEMS) };
const manifest = JSON.parse(readFileSync(root + "art/manifest.json", "utf8")).images;
const credit = (id) => { const e = manifest.find((x) => x.id === id); return { artist: e.artist, title: e.title, date: e.date }; };
const art = Object.fromEntries([...HEROES, ...FRONT, ...ITEMS].map((id) => [id, credit(id)]));
art.board = credit("board-st-george");
const engine = readFileSync(root + "engine/engine.mjs", "utf8").replace(/^export /gm, "");
const json = (x) => JSON.stringify(x).replace(/</g, "\\u003c");
const html = readFileSync(root + "tutorial/template.html", "utf8")
  .replace("/*DATA*/", () => json(slim)).replace("/*ART*/", () => json(art)).replace("/*ENGINE*/", () => engine);
writeFileSync(root + "tutorial/index.html", html);
console.log(`tutorial/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
