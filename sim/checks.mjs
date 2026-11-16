// Small rule checks. Run with: node sim/checks.mjs
import { loadData } from "../engine/load-data.mjs";
import * as E from "../engine/engine.mjs";
const data = loadData();
let fails = 0;
const ok = (name, cond, got) => { if (!cond) fails++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : " — got " + JSON.stringify(got)}`); };
const game = (a, b, seed = 5) => E.createGame(data, [a, b], { seed });
const lu = (crown, heroes = [], front = [], items = []) => ({ crown, heroes, front, items });
const card = (st, i, id) => E.cards(st, i).find((c) => c.id === id);
const order = (st, i, id, name, tgt) => { const c = card(st, i, id); return { uid: c.uid, index: c.actions.findIndex((a) => a.name === name), target: tgt ? tgt.uid : null }; };

{ // Guard resets each round and Blodeuwedd takes Cymru Guard in the crown
  const st = game(lu("blodeuwedd", ["bran-the-blessed", "gwydion"]), lu("the-dragon"));
  const b = card(st, 0, "blodeuwedd");
  ok("Blodeuwedd crown Guard is 6 with Bran and Gwydion", b.guardLeft === 6, b.guardLeft);
  ok("Bran is left with no Guard", card(st, 0, "bran-the-blessed").guardLeft === 0);
  E.playRound(st, [{ orders: [order(st, 0, "blodeuwedd", "Oak, broom and meadowsweet")] }, { orders: [] }]);
  ok("Guard doesn't build up next round", b.guardLeft === 6, b.guardLeft);
  while (st.round < 8 && !st.over) E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("At nightfall she has Attack 4", E.attackOf(st, b) === 4, E.attackOf(st, b));
  ok("At nightfall she is on 13 of 14 Health", b.health === 13 && b.maxHealth === 14, [b.health, b.maxHealth]);
  ok("Her own Guard doubles to 2 (7 with borrowed)", b.guardLeft === 7, b.guardLeft);
}
{ // Betrayal is melee: it hits the front rank first
  const st = game(lu("dracula", ["renfield"]), lu("merlin", [], ["knight"]));
  const kn = card(st, 1, "knight"), me = card(st, 1, "merlin");
  E.playRound(st, [{ orders: [order(st, 0, "renfield", "Betrayal", me)] }, { orders: [] }]);
  ok("Betrayal can't reach the crown past the front rank", me.health === 7, me.health);
  const st2 = game(lu("dracula", ["renfield"]), lu("merlin", [], ["knight"]));
  E.playRound(st2, [{ orders: [order(st2, 0, "renfield", "Betrayal", card(st2, 1, "knight"))] }, { orders: [] }]);
  ok("Betrayal kills the Knight and leaves Renfield on 1", card(st2, 1, "knight") === undefined && card(st2, 0, "renfield").health === 1);
}
{ // Renfield's bond and Van Helsing's healing cut
  const st = game(lu("van-helsing", ["renfield", "dracula"]), lu("the-princess"));
  ok("Renfield has +2 Attack with two other Gothic heroes", E.attackOf(st, card(st, 0, "renfield")) === 4);
  const d = card(st, 0, "dracula"); d.health = 5;
  ok("Healing is cut by 1 under Van Helsing", E.heal(st, d, d, 3, { flat: true }) === 2);
}
{ // Little Mermaid reverses bonds; Arthur spreads them
  const st = game(lu("the-little-mermaid"), lu("lancelot", ["king-arthur", "the-sheriff"].filter((x) => data.heroes[x])));
  const a = card(st, 1, "king-arthur");
  ok("Arthur's Guard bond is reversed (2 - 1 = 1)", E.guardOf(st, a) === 1, E.guardOf(st, a));
  const st2 = game(lu("king-arthur", ["bran-the-blessed", "renfield"]), lu("the-dragon"));
  ok("Under Arthur, Bran counts every hero as Cymru (+2) and Albion (+1)", E.guardOf(st2, card(st2, 0, "bran-the-blessed")) === 3, E.guardOf(st2, card(st2, 0, "bran-the-blessed")));
  ok("Under Arthur, Renfield counts every hero as Gothic", E.attackOf(st2, card(st2, 0, "renfield")) === 4);
}
{ // Sheriff's tax, no stopping two rounds running, Robin's No Crown
  const st = game(lu("sheriff-of-nottingham"), lu("merlin", [], [], ["gingerbread"]));
  ok("The Sheriff takes the opponent's only item", st.sides[0].items.length === 1 && st.sides[1].items.length === 0);
  const st2 = game(lu("the-princess", ["merlin"]), lu("the-dragon", ["the-wolf"]));
  const w = card(st2, 1, "the-wolf");
  E.playRound(st2, [{ orders: [order(st2, 0, "the-princess", "Girdle Leash", w)] }, { orders: [] }]);
  E.playRound(st2, [{ orders: [order(st2, 0, "the-princess", "Girdle Leash", w)] }, { orders: [] }]);
  ok("A hero can't be stopped two rounds running", w.stopNow === false || w.stoppedRound !== 2, [w.stopNow, w.stoppedRound]);
  const st3 = game(lu("robin-hood", ["little-john"]), lu("the-dragon"));
  E.kill(st3, card(st3, 0, "robin-hood"), null); E.checkWin(st3);
  ok("With No Crown, losing Robin doesn't lose the fight", !st3.over);
}
console.log(fails ? `${fails} check(s) failed` : "All checks passed");
process.exit(fails ? 1 : 0);
