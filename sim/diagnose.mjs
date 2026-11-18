// Tells a weak hero from a badly played one.
// 1. Power at equal cost: every hero is priced the same (Baba Yaga keeps her solo cost), so the win rate shows the kit, not the price.
// 2. How the bot plays each hero, at real prices: how often it acts while alive, and how often it uses each action.
// Run with: node sim/diagnose.mjs [fights] [seed]  → writes sim/diagnose.json
import { writeFileSync } from "node:fs";
import { loadData } from "../engine/load-data.mjs";
import { botFight, makeRng } from "../engine/engine.mjs";

const FIGHTS = Number(process.argv[2] || 60000);
const SEED = Number(process.argv[3] || 7);
const EQUAL = 15;

function lineups(data, rng) {
  const heroIds = Object.keys(data.heroes);
  const frontIds = Object.keys(data.front).filter((id) => id !== "the-needle");
  const itemIds = Object.keys(data.items);
  const R = (id) => data.heroes[id].renown;
  return function randomLineup() {
    for (;;) {
      let hs = [], budget = 50;
      const want = rng.next() < 0.85 ? 3 : 2;
      for (const id of rng.shuffle(heroIds)) {
        if (hs.length >= want) break;
        if (hs.includes(id)) continue;
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
  };
}

function run(data, seed, watch) {
  const rng = makeRng(seed);
  const pick = lineups(data, rng);
  const t = {}; // id -> { any:[w,n], crown:[w,n], sup:[w,n], alive, acted, uses:{name:n} }
  const T = (id) => (t[id] ||= { any: [0, 0], crown: [0, 0], sup: [0, 0], alive: 0, acted: 0, uses: {} });
  for (let k = 0; k < FIGHTS; k++) {
    const a = pick(), b = pick();
    const st = botFight(data, [a, b], seed * 1000003 + k);
    [a, b].forEach((lu, side) => {
      const score = st.winner === -1 ? 0.5 : st.winner === side ? 1 : 0;
      for (const id of [lu.crown, ...lu.heroes]) {
        const x = T(id); x.any[0] += score; x.any[1]++;
        const slot = id === lu.crown ? x.crown : x.sup; slot[0] += score; slot[1]++;
      }
    });
    if (!watch) continue;
    // Which card is which, and when each hero died
    const byUid = {}, died = {};
    for (const s of st.sides) for (const c of [...Object.values(s.slots), ...s.grave]) if (c && c.kind === "hero") byUid[c.uid] = c.id;
    for (const e of st.events) if (e.t === "death" && byUid[e.uid] && died[e.uid] == null) died[e.uid] = e.r;
    for (const uid in byUid) T(byUid[uid]).alive += (died[uid] ?? st.round);
    const seen = new Set();
    for (const e of st.events) {
      if (e.t !== "act" || e.auto || !byUid[e.uid] || !e.name) continue;
      const key = `${e.r}:${e.uid}`; if (seen.has(key)) continue; seen.add(key);
      const x = T(byUid[e.uid]); x.acted++; x.uses[e.name] = (x.uses[e.name] || 0) + 1;
    }
  }
  return t;
}

const real = loadData();
const equal = loadData();
for (const h of Object.values(equal.heroes)) if (h.id !== "baba-yaga") h.renown = EQUAL;

const t0 = Date.now();
const atCost = run(real, SEED, true);
const atEqual = run(equal, SEED + 1, false);
const pc = ([w, n]) => (n ? Math.round(1000 * w / n) / 10 : null);
const out = Object.values(real.heroes).map((h) => {
  const a = atCost[h.id] || {}, e = atEqual[h.id] || {};
  const total = a.acted || 0;
  return {
    id: h.id, name: h.name, realm: h.realm, aspect: h.aspect, renown: h.renown,
    health: h.stats.health, attack: h.stats.attack, ranged: !!h.stats.ranged, guard: h.stats.guard, speed: h.stats.speed,
    crown: h.crownPassive ? `${h.crownPassive.name}: ${h.crownPassive.text}` : "", bond: h.bond ? `${h.bond.name}: ${h.bond.text}` : "",
    actions: h.actions.map((x) => `${x.name} (${x.ap} AP${x.usesPerFight ? `, ${x.usesPerFight}/fight` : ""})`).join("; "),
    win: pc(a.any || [0, 0]), winCrown: pc(a.crown || [0, 0]), winSup: pc(a.sup || [0, 0]), fights: (a.any || [0, 0])[1],
    equalWin: pc(e.any || [0, 0]), equalCrown: pc(e.crown || [0, 0]), equalSup: pc(e.sup || [0, 0]),
    actRate: a.alive ? Math.round(1000 * total / a.alive) / 10 : null,
    special: total ? Math.round(1000 * (total - (a.uses?.Attack || 0)) / total) / 10 : null,
    uses: Object.fromEntries(Object.entries(a.uses || {}).map(([k, v]) => [k, Math.round(1000 * v / Math.max(1, (a.any || [0, 1])[1])) / 1000])),
  };
});
writeFileSync(new URL("./diagnose.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`${FIGHTS} fights at real cost + ${FIGHTS} at equal cost (${EQUAL}) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
