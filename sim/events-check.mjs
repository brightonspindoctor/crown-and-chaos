// Checks that the event stream tells the true story of each fight, so animations never show
// something the rules didn't do. Run with: node sim/events-check.mjs
import { loadData } from "../engine/load-data.mjs";
import { createGame, playRound, botPlan, makeRng, allCards } from "../engine/engine.mjs";

const data = loadData();
const heroIds = Object.keys(data.heroes);
const frontIds = Object.keys(data.front).filter((f) => f !== "the-needle");
const itemIds = Object.keys(data.items);
const KNOWN = new Set(["phase", "act", "item", "hit", "heal", "miss", "redirect", "death", "revive", "swap",
  "stop", "freeze", "skip", "wasted", "guardUp", "attackUp", "poison", "over", "hp", "appear", "debuff"]);
// The log line each kind of event must follow.
const PAIRS = {
  hit: (e) => (e.dmg > 0 && !e.survived ? / deals \d+ to / : null),
  stop: () => / is stopped /,
  revive: () => / back on | rises | reanimates | uses /,
  act: (e) => (e.auto ? null : / uses | guesses /),
  item: () => /(Blue|Red) uses /,
  freeze: () => / is frozen\./,
  over: () => / wins\.| a draw\.|Round limit/,
};
const rng = makeRng(11);
const counts = {};
let fights = 0, rounds = 0;
const fail = (msg) => { console.error("FAIL", msg); process.exit(1); };

for (let k = 0; k < 1500; k++) {
  const pick = () => {
    const h = rng.shuffle(heroIds).slice(0, 3);
    return { crown: h[0], heroes: h.slice(1), front: [0, 1, 2].map(() => rng.pick(frontIds)), items: rng.shuffle(itemIds).slice(0, 3) };
  };
  const st = createGame(data, [pick(), pick()], { seed: k + 1 });
  fights++;
  while (!st.over) {
    const from = (st.events || []).length;
    playRound(st, [botPlan(st, 0), botPlan(st, 1)]);
    rounds++;
    const evs = st.events.slice(from);
    const lastHp = new Map();
    for (const e of evs) {
      if (!KNOWN.has(e.t)) fail(`unknown event type ${e.t}`);
      counts[e.t] = (counts[e.t] || 0) + 1;
      if (e.t === "hit" && (e.dmg < 0 || e.hp == null)) fail(`bad hit ${JSON.stringify(e)}`);
      if (e.t === "heal" && !(e.amt > 0)) fail(`bad heal ${JSON.stringify(e)}`);
      if ("hp" in e && e.tgt != null) lastHp.set(e.tgt, e.hp);
      if (e.t === "revive" || e.t === "appear") lastHp.set(e.uid, e.hp);
      if (e.t === "death") lastHp.set(e.uid, 0);
      // An event explains the log line just before it, so a page can show it with that line.
      const line = st.log[e.n - 1] || "", want = PAIRS[e.t]?.(e);
      if (want && !want.test(line)) fail(`fight ${k + 1}: ${e.t} event after the line "${line}"\n${JSON.stringify(e)}`);
    }
    // Every living card whose health was reported must have that health now. Upkeep can change
    // health only through hit and heal, which are reported too.
    for (const c of allCards(st)) {
      if (lastHp.has(c.uid) && lastHp.get(c.uid) !== c.health) {
        // Edits that set health directly (a revive with a bonus) are reported in their own event.
        fail(`fight ${k + 1} round ${st.round}: ${c.name} shows ${lastHp.get(c.uid)} but has ${c.health}\n` +
          evs.filter((e) => e.tgt === c.uid || e.uid === c.uid).map((e) => JSON.stringify(e)).join("\n"));
      }
    }
    if (st.over && !evs.some((e) => e.t === "over")) fail(`fight ${k + 1}: no "over" event`);
  }
}
console.log(`${fights} fights, ${rounds} rounds: events match the state.`);
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", "));
