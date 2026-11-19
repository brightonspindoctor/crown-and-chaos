// Plays whole quests (three fights, damage carried over) with random legal companies, bot against bot.
// Run with: node sim/quest.mjs [quests] [seed]
import { loadData } from "../engine/load-data.mjs";
import * as E from "../engine/engine.mjs";
const N = Number(process.argv[2] || 5000), SEED = Number(process.argv[3] || 3);
const data = loadData(), rng = E.makeRng(SEED);
const heroIds = Object.keys(data.heroes).filter((id) => !["baba-yaga", "grendel", "grendels-mother"].includes(id));
const frontIds = ["knight", "crossbowman", "longbowman", "leshy", "monk", "berserker"], itemIds = Object.keys(data.items);
function company() {
  for (;;) {
    let b = 50; const hs = [];
    for (const id of rng.shuffle(heroIds)) { if (hs.length >= 3) break; if (data.heroes[id].renown <= b - 9) { hs.push(id); b -= data.heroes[id].renown; } }
    if (hs.length < 2) continue;
    const front = [0, 1, 2].map((k) => { const ok = frontIds.filter((id) => data.front[id].renown <= b - (2 - k)); const id = ok.length ? rng.pick(ok) : "villager"; b -= data.front[id].renown; return id; });
    const items = []; for (let k = 0; k < 2; k++) { const ok = itemIds.filter((id) => data.items[id].renown <= b); if (!ok.length) break; const id = rng.pick(ok); items.push(id); b -= data.items[id].renown; }
    return { crown: hs[0], heroes: hs.slice(1), front, items };
  }
}
const stage = [0, 0, 0, 0], byTroop = {}, byFinal = {}, rounds = [0, 0, 0], fought = [0, 0, 0];
let baba = [0, 0], finals = 0, draws = 0, unseen = 0;
for (let q = 0; q < N; q++) {
  const plan = E.questPlan(data, rng);
  let lu = company(), carry = null, reached = 0;
  for (let f = 0; f < 3; f++) {
    const st = E.createGame(data, [lu, plan.fights[f].lineup], { rng: E.makeRng(SEED * 7919 + q * 3 + f), ...E.QUEST_RULES });
    if (carry) E.applyCarry(st, 0, carry);
    while (!st.over) E.playRound(st, [E.botPlan(st, 0, rng), E.botPlan(st, 1, rng)]);
    rounds[f] += st.round; fought[f]++; if (f === 2) { finals = (finals || 0) + 1; if (st.winner === -1) draws = (draws || 0) + 1; if (E.crownCard(st, 1) && E.isBlind(st, E.crownCard(st, 1))) unseen = (unseen || 0) + 1; }
    if (st.winner !== 0) break;
    reached = f + 1;
    const next = E.carryOver(st, 0, lu); lu = next.lineup; carry = next.health;
  }
  stage[reached]++;
  const t = plan.fights[0].lineup.troops; byTroop[t] = byTroop[t] || [0, 0]; byTroop[t][1]++; if (reached >= 1) byTroop[t][0]++;
  const fc = plan.fights[2].lineup.crown; if (reached >= 2) { byFinal[fc] = byFinal[fc] || [0, 0]; byFinal[fc][1]++; if (reached === 3) byFinal[fc][0]++; }
}
const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;
console.log(`${N} quests. Lost fight 1: ${pct(stage[0], N)}, lost fight 2: ${pct(stage[1], N)}, lost the final: ${pct(stage[2], N)}, quest won: ${pct(stage[3], N)}`);
console.log("Average rounds per fight:", rounds.map((r, i) => (r / fought[i]).toFixed(1)).join(" / "));
console.log("Fight 1 won, by troop:", Object.entries(byTroop).map(([k, v]) => `${k} ${pct(v[0], v[1])}`).join(", "));
console.log("Final won, by enemy Crown:", Object.entries(byFinal).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).map(([k, v]) => `${k} ${pct(v[0], v[1])} (${v[1]})`).join(", "));
console.log(`Finals: ${finals}, draws ${pct(draws, finals)}, enemy Crown never revealed ${pct(unseen, finals)}`);
