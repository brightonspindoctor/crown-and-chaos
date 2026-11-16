// Builds play/index.html: the playable page, with the engine and the card data inlined.
// Run with: node scripts/build-play.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { loadData } from "../engine/load-data.mjs";
const root = new URL("..", import.meta.url).pathname;
const data = loadData();
const slim = {
  heroes: Object.fromEntries(Object.entries(data.heroes).map(([id, h]) => [id, {
    id, name: h.name, realm: h.realm, tale: h.tale, aspect: h.aspect, stats: h.stats, renown: h.renown,
    crownPassive: h.crownPassive, bond: h.bond, actions: h.actions, rules: h.rules || [] }])),
  front: data.front, items: data.items,
};
const engine = readFileSync(root + "engine/engine.mjs", "utf8").replace(/^export /gm, "");
const html = readFileSync(root + "play/template.html", "utf8")
  .replace("/*DATA*/", () => JSON.stringify(slim).replace(/</g, "\\u003c"))
  .replace("/*ENGINE*/", () => engine);
writeFileSync(root + "play/index.html", html);
console.log(`play/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
