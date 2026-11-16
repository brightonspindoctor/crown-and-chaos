import { loadData } from "../engine/load-data.mjs";
import { botFight, makeRng } from "../engine/engine.mjs";
const data = loadData();
const ids = Object.keys(data.heroes);
const rng = makeRng(7);
let n = 0, rounds = 0, res = { 0: 0, 1: 0, "-1": 0 };
for (let k = 0; k < 3000; k++) {
  const pick = () => { const s = rng.shuffle(ids).slice(0, 3); return { crown: s[0], heroes: s.slice(1), front: ["knight", "villager", "crossbowman"], items: ["gingerbread"] }; };
  const st = botFight(data, [pick(), pick()], k + 1);
  n++; rounds += st.round; res[st.winner]++;
}
console.log(n, "fights, avg rounds", (rounds / n).toFixed(1), res);
const st = botFight(data, [{ crown: "king-arthur", heroes: ["lancelot", "merlin"], front: ["knight", "knight", "longbowman"], items: [] }, { crown: "dracula", heroes: ["renfield", "van-helsing"], front: ["villager", "berserker", "monk"], items: ["skull-lantern"] }], 3);
console.log(st.log.slice(0, 40).join("\n"));
