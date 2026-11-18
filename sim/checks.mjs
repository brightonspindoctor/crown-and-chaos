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

{ // Guard resets each round and Blodeuwedd takes her heroes' Guard in the crown
  const st = game(lu("blodeuwedd", ["bran-the-blessed", "gwydion"]), lu("the-dragon"));
  const b = card(st, 0, "blodeuwedd");
  ok("Blodeuwedd crown Guard is 5 with Bran and Gwydion", b.guardLeft === 5, b.guardLeft);
  ok("Bran is left with no Guard", card(st, 0, "bran-the-blessed").guardLeft === 0);
  E.playRound(st, [{ orders: [order(st, 0, "blodeuwedd", "Oak, broom and meadowsweet")] }, { orders: [] }]);
  ok("Guard doesn't build up next round", b.guardLeft === 5, b.guardLeft);
  while (st.round < 8 && !st.over) E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("At nightfall she has Attack 4", E.attackOf(st, b) === 4, E.attackOf(st, b));
  ok("At nightfall she is on 13 of 14 Health", b.health === 13 && b.maxHealth === 14, [b.health, b.maxHealth]);
  ok("Her printed Guard is 0, so nightfall leaves her on the borrowed 5", b.guardLeft === 5, b.guardLeft);
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
  ok("Arthur's Guard bond is reversed (1 - 1 = 0)", E.guardOf(st, a) === 0, E.guardOf(st, a));
  const st2 = game(lu("king-arthur", ["bran-the-blessed", "renfield"]), lu("the-dragon"));
  st2.round = 1;
  ok("Arthur's Round Table is off in round 1", E.attackOf(st2, card(st2, 0, "renfield")) === 2, E.attackOf(st2, card(st2, 0, "renfield")));
  st2.round = 8;
  ok("Arthur's Round Table is off from nightfall", E.attackOf(st2, card(st2, 0, "renfield")) === 2, E.attackOf(st2, card(st2, 0, "renfield")));
  st2.round = 3;
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
{ // Slot-1 rules
  const st = game(lu("lancelot", ["merlin", "guinevere"]), lu("the-dragon", ["the-wolf"]));
  const l = card(st, 0, "lancelot");
  ok("A melee crown behind its heroes has no enemy targets", E.meleeTargets(st, l).length === 0);
  ok("It can attack its own heroes", E.targetsFor(st, l, l.actions[0]).every((t) => t.side === 0) && E.targetsFor(st, l, l.actions[0]).length === 2);
  const w = card(st, 1, "the-wolf");
  ok("A crown with only one hero in front can be melee attacked", E.meleeTargets(st, card(st, 0, "merlin")).some((t) => t.id === "the-dragon"));
  ok("A crown behind two heroes can't be", !E.meleeTargets(st, w).some((t) => t.id === "lancelot"));
  const st2 = game(lu("dracula"), lu("merlin"));
  const d = card(st2, 0, "dracula");
  ok("Dracula's Claw has targets", E.targetsFor(st2, d, d.actions.find((a) => a.name === "Claw")).length === 1);
}
{ // Poison halves each round
  const st = game(lu("merlin"), lu("the-dragon", [], [], []));
  const d = card(st, 1, "the-dragon"); d.poison = 4; const h0 = d.health;
  for (let k = 0; k < 4; k++) E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("Poison 4 deals 4, 2, 1 and stops", h0 - d.health === 7 && d.poison === 0, [h0 - d.health, d.poison]);
}

// ---------- Hellas ----------
{ // Perseus: Gorgon's bane counts Beasts on both sides; Mirrored shield reflects the first attack
  const st = game(lu("perseus", ["polyphemus"]), lu("the-minotaur"));
  const p = card(st, 0, "perseus");
  ok("Perseus has 2 + 2 Beasts = Attack 4", E.attackOf(st, p) === 4, E.attackOf(st, p));
  const st2 = game(lu("perseus"), lu("the-wolf"));
  const p2 = card(st2, 0, "perseus"), w = card(st2, 1, "the-wolf"), w0 = w.health, p0 = p2.health;
  E.playRound(st2, [{ orders: [order(st2, 0, "perseus", "Mirrored shield")] }, { orders: [order(st2, 1, "the-wolf", "Attack", p2)] }]);
  ok("The Wolf's bite bounces back off the shield", p2.health === p0 && w.health === w0 - 4, [p2.health, w.health, w0]);
}
{ // Winged sandals: +1 Speed to your heroes in round 1 only
  const st = game(lu("perseus", ["circe"]), lu("merlin"));
  const c = card(st, 0, "circe");
  ok("Circe is Speed 4 in round 1 under Perseus", E.speedOf(st, c) === 4, E.speedOf(st, c));
  E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("and Speed 3 after", E.speedOf(st, c) === 3, E.speedOf(st, c));
}
{ // Medusa: Serpent hair poisons two enemies; Stony gaze slows melee attackers
  const st = game(lu("medusa"), lu("merlin", [], ["knight", "knight"]));
  E.playRound(st, [{ orders: [order(st, 0, "medusa", "Serpent hair")] }, { orders: [] }]);
  ok("Serpent hair poisoned two cards", st.log.filter((l) => l.includes("serpents bite")).length === 2);
  const st2 = game(lu("medusa"), lu("st-george"));
  const g = card(st2, 1, "st-george"), s0 = E.speedOf(st2, g);
  E.playRound(st2, [{ orders: [] }, { orders: [order(st2, 1, "st-george", "Attack", card(st2, 0, "medusa"))] }]);
  ok("St George loses 1 Speed for hitting Medusa", E.speedOf(st2, g) === s0 - 1, [s0, E.speedOf(st2, g)]);
}
{ // Odysseus: the wooden horse hides his side in round 1; Men of Ithaca fills empty front slots; Nobody
  const st = game(lu("odysseus", ["circe"]), lu("merlin"));
  ok("Circe is hidden in round 1", E.isHidden(st, card(st, 0, "circe")) && !E.isHidden(st, card(st, 0, "odysseus")));
  ok("Two Hellas heroes fill two empty front slots with Villagers", E.cards(st, 0).filter((c) => c.id === "villager").length === 2);
  E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("Nothing is hidden in round 2", !E.isHidden(st, card(st, 0, "circe")));
  const st2 = game(lu("odysseus"), lu("robin-hood"));
  const o = card(st2, 0, "odysseus"), r = card(st2, 1, "robin-hood"), o0 = o.health, r0 = r.health;
  E.playRound(st2, [{ orders: [order(st2, 0, "odysseus", "Nobody")] }, { orders: [order(st2, 1, "robin-hood", "Attack", o)] }]);
  ok("Nobody: Robin's arrow misses even though Robin is faster, and Robin takes 1", o.health === o0 && st2.log.some((l) => l.includes("Odysseus deals 1 to Red Robin Hood")), [o.health, r.health]);
}
{ // Polyphemus: Crown buffs the front rank; Bond turns against Tricksters; the boulder slows
  const st = game(lu("polyphemus", ["circe"], ["knight"]), lu("merlin"));
  const k = card(st, 0, "knight");
  ok("Shepherd of the cave: Knight on 4 Health and 2 Guard", k.health === 4 && k.guardLeft === 2, [k.health, k.guardLeft]);
  ok("Son of Poseidon: Attack 5 with Circe", E.attackOf(st, card(st, 0, "polyphemus")) === 5);
  const st2 = game(lu("polyphemus", ["circe"]), lu("robin-hood"));
  ok("Attack 3 against an enemy Trickster", E.attackOf(st2, card(st2, 0, "polyphemus")) === 3);
  const st3 = game(lu("polyphemus"), lu("merlin"));
  const m = card(st3, 1, "merlin");
  E.playRound(st3, [{ orders: [order(st3, 0, "polyphemus", "Hurl the boulder", m)] }, { orders: [] }]);
  ok("The boulder slows Merlin next round", E.speedOf(st3, m) === 2, E.speedOf(st3, m));
}
{ // Circe: swine when holding the Fate token; Guests of Aiaia
  const st = game(lu("circe", ["perseus"]), lu("merlin", [], ["knight", "knight"]), 3);
  for (let k = 0; k < 2; k++) {
    const kn = card(st, 1, "knight");
    ok(`Round ${st.round}: enemy Knights are ${st.fate === 0 ? "swine (0 Attack)" : "normal"}`, (E.attackOf(st, kn) === 0) === (st.fate === 0));
    E.playRound(st, [{ orders: [] }, { orders: [] }]);
  }
  ok("Guests of Aiaia: Perseus has 2 Guard", E.guardOf(st, card(st, 0, "perseus")) === 2);
}
{ // King Minos: tribute heals, Lord of the Labyrinth heals Beasts 3, Royal decree raises costs
  const st = game(lu("king-minos", ["the-minotaur"]), lu("merlin", [], ["villager"]));
  const mn = card(st, 0, "king-minos"), mt = card(st, 0, "the-minotaur");
  mn.health -= 4; mt.health -= 5;
  E.kill(st, card(st, 1, "villager"), mt);
  ok("Minos heals 1 and the Minotaur heals 1 + 3", mn.maxHealth - mn.health === 3 && mt.maxHealth - mt.health === 1, [mn.health, mt.health]);
  const st2 = game(lu("king-minos"), lu("merlin"));
  E.playRound(st2, [{ orders: [order(st2, 0, "king-minos", "Royal decree")] }, { orders: [] }]);
  const me = card(st2, 1, "merlin"), hex = me.actions.find((a) => a.name === "Hex");
  ok("Next round Merlin's Hex costs 3", E.apCost(st2, me, hex) === 3, E.apCost(st2, me, hex));
  E.playRound(st2, [{ orders: [] }, { orders: [] }]);
  ok("and 2 again the round after", E.apCost(st2, me, hex) === 2);
}
{ // The Minotaur: the Labyrinth blocks Ranged attacks on slots 2–3 but not Spells
  const st = game(lu("the-minotaur", ["circe", "perseus"]), lu("robin-hood", ["merlin"]));
  const rb = card(st, 1, "robin-hood"), mer = card(st, 1, "merlin");
  const shots = E.targetsFor(st, rb, rb.actions[0]).map((c) => c.id);
  ok("Robin can only shoot the Minotaur", shots.length === 1 && shots[0] === "the-minotaur", shots);
  const hexes = E.targetsFor(st, mer, mer.actions.find((a) => a.name === "Hex")).map((c) => c.id);
  ok("Merlin's Hex still reaches Circe", hexes.includes("circe"), hexes);
}
{ // Hoplite phalanx
  const st = game(lu("the-dragon", [], ["hoplite", "hoplite", "hoplite"]), lu("merlin"));
  const g = E.cards(st, 0).filter((c) => c.id === "hoplite").sort((a, b) => a.slot - b.slot).map((c) => c.guardLeft);
  ok("Hoplites have Guard 2, 3, 2", g.join() === "2,3,2", g);
}
console.log(fails ? `${fails} check(s) failed` : "All checks passed");
process.exit(fails ? 1 : 0);
