// Reads the card JSON files into the shape the engine uses. Node only.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = new URL("..", import.meta.url).pathname;
const dir = (d) => Object.fromEntries(readdirSync(join(root, d)).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(root, d, f), "utf8"))).map((c) => [c.id, c]));
export function loadData() {
  const heroes = Object.fromEntries(Object.entries(dir("cards/heroes")).filter(([, h]) => h.status !== "sketch"));
  return { heroes, front: dir("cards/front-rank"), items: dir("cards/items") };
}
