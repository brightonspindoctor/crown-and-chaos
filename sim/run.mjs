// Plays many bot-vs-bot fights between random legal line-ups and reports what wins too often.
// Run with: node sim/run.mjs [fights] [seed]
import { writeFileSync } from "node:fs";
import { loadData } from "../engine/load-data.mjs";
import { botFight, makeRng, ASSUMPTIONS } from "../engine/engine.mjs";

const FIGHTS = Number(process.argv[2] || 60000);
const SEED = Number(process.argv[3] || 1);
const BUDGET = 50;
const data = loadData();
const rng = makeRng(SEED);
const heroIds = Object.keys(data.heroes);
const frontIds = Object.keys(data.front).filter((id) => id !== "the-needle");
const itemIds = Object.keys(data.items);
const R = (id) => data.heroes[id].renown;

export function randomLineup() {
  for (;;) {
    let hs = [];
    let budget = BUDGET;
    const want = rng.next() < 0.85 ? 3 : 2;
    for (const id of rng.shuffle(heroIds)) {
      if (hs.length >= want) break;
      if (hs.includes(id)) continue;
      // Grendel and his Mother come as a pair.
      const pair = id === "grendel" ? "grendels-mother" : id === "grendels-mother" ? "grendel" : null;
      const add = pair ? [id, pair] : [id];
      if (pair && hs.includes(pair)) continue;
      const cost = add.reduce((s, x) => s + R(x), 0);
      if (hs.length + add.length > 3 || cost > budget - 3) continue;
      hs.push(...add); budget -= cost;
    }
    if (!hs.length) continue;
    hs = rng.shuffle(hs);
    if (hs.includes("baba-yaga")) hs = ["baba-yaga", ...hs.filter((h) => h !== "baba-yaga")];
    const front = [];
    for (let k = 0; k < 3; k++) {
      const ok = frontIds.filter((id) => data.front[id].renown <= budget - (2 - k));
      const id = ok.length ? rng.pick(ok) : "villager";
      front.push(id); budget -= data.front[id].renown;
    }
    const items = [];
    for (let k = 0; k < 2; k++) {
      const ok = itemIds.filter((id) => data.items[id].renown <= budget);
      if (!ok.length || rng.next() < 0.2) break;
      const id = rng.pick(ok); items.push(id); budget -= data.items[id].renown;
    }
    return { crown: hs[0], heroes: hs.slice(1), front, items };
  }
}

const tally = () => ({ w: 0, l: 0, d: 0 });
const add = (map, key, r) => { const t = map.get(key) || tally(); t[r]++; map.set(key, t); };
const crown = new Map(), support = new Map(), hero = new Map(), pair = new Map(), trio = new Map(), item = new Map(), frontT = new Map();
let rounds = 0, draws = 0, night = 0;
const lens = new Map();

function record(lu, r) {
  add(crown, lu.crown, r);
  const all = [lu.crown, ...lu.heroes];
  for (const h of all) add(hero, h, r);
  for (const h of lu.heroes) add(support, h, r);
  for (const h of lu.heroes) add(pair, `${lu.crown} (crown) + ${h}`, r);
  if (all.length === 3) add(trio, `${lu.crown} (crown) + ${lu.heroes.slice().sort().join(" + ")}`, r);
  for (const i of new Set(lu.items)) add(item, i, r);
  for (const f of new Set(lu.front)) add(frontT, f, r);
}

const t0 = Date.now();
for (let k = 0; k < FIGHTS; k++) {
  const a = randomLineup(), b = randomLineup();
  const st = botFight(data, [a, b], SEED * 1000003 + k);
  rounds += st.round; lens.set(st.round, (lens.get(st.round) || 0) + 1);
  if (st.round >= 8) night++;
  if (st.winner === -1) { draws++; record(a, "d"); record(b, "d"); }
  else { record(st.winner === 0 ? a : b, "w"); record(st.winner === 0 ? b : a, "l"); }
}

const rate = (t) => (t.w + t.d / 2) / (t.w + t.l + t.d);
const rows = (map, min) => [...map].map(([k, t]) => ({ k, n: t.w + t.l + t.d, r: rate(t) })).filter((x) => x.n >= min).sort((p, q) => q.r - p.r);
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const table = (title, list) => [`### ${title}`, "", "| | Win rate | Fights |", "|---|---|---|", ...list.map((x) => `| ${x.k} | ${pct(x.r)} | ${x.n} |`), ""].join("\n");

const C = rows(crown, 200), H = rows(hero, 200), P = rows(pair, 150), T = rows(trio, 40);
const out = [
  "# Simulator results", "",
  `${FIGHTS} bot-vs-bot fights between random legal line-ups (50 Renown), seed ${SEED}.`,
  `Average fight: ${(rounds / FIGHTS).toFixed(1)} rounds. Draws: ${pct(draws / FIGHTS)}. Fights reaching Nightfall (round 8): ${pct(night / FIGHTS)}.`, "",
  "The bots are simple: each round they pick the actions worth most per action point. They don't plan ahead or read the opponent, so treat these as flags to playtest, not verdicts. A draw counts as half a win.", "",
  table("Heroes as the Crown, best first", C),
  table("Heroes in slots 2–3 (not the Crown), best first", rows(support, 200)),
  table("Heroes in any slot, best first", H),
  table("Strongest Crown + partner pairs", P.slice(0, 25)),
  table("Weakest Crown + partner pairs", P.slice(-12)),
  table("Strongest three-hero line-ups seen at least 40 times", T.slice(0, 15)),
  table("Items", rows(item, 200)),
  table("Front-rank cards", rows(frontT, 200)),
  "### Engine assumptions", "", ...ASSUMPTIONS.map((a) => `- ${a}`), "",
].join("\n");
writeFileSync(new URL("./results.md", import.meta.url), out);
console.log(`${FIGHTS} fights in ${((Date.now() - t0) / 1000).toFixed(1)}s. Avg rounds ${(rounds / FIGHTS).toFixed(1)}, draws ${pct(draws / FIGHTS)}, nightfall ${pct(night / FIGHTS)}`);
console.log("Crowns:", C.slice(0, 8).map((x) => `${x.k} ${pct(x.r)}`).join(", "));
console.log("Worst crowns:", C.slice(-6).map((x) => `${x.k} ${pct(x.r)}`).join(", "));
console.log("Heroes:", H.slice(0, 8).map((x) => `${x.k} ${pct(x.r)}`).join(", "));
console.log("Worst heroes:", H.slice(-6).map((x) => `${x.k} ${pct(x.r)}`).join(", "));
console.log("Pairs:", P.slice(0, 10).map((x) => `${x.k} ${pct(x.r)} (${x.n})`).join("\n  "));
console.log("Trios:", T.slice(0, 8).map((x) => `${x.k} ${pct(x.r)} (${x.n})`).join("\n  "));
