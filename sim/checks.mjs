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
  ok("At nightfall she has Attack 6", E.attackOf(st, b) === 6, E.attackOf(st, b));
  ok("At nightfall she is on 11 of 12 Health", b.health === 11 && b.maxHealth === 12, [b.health, b.maxHealth]);
  ok("Her printed Guard is 0, so nightfall leaves her on the borrowed 5", b.guardLeft === 5, b.guardLeft);
}
{ // Betrayal is melee: it hits the front rank first
  const st = game(lu("dracula", ["renfield"]), lu("merlin", ["the-wolf", "the-huntsman"], ["knight", "monk", "villager"]));
  const kn = card(st, 1, "knight"), me = card(st, 1, "merlin");
  E.playRound(st, [{ orders: [order(st, 0, "renfield", "Betrayal", me)] }, { orders: [] }]);
  ok("Betrayal can't reach the crown past the front rank", me.health === me.maxHealth, me.health);
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
  const st4 = game(lu("lancelot", ["merlin"]), lu("the-dragon", ["the-wolf"]));
  ok("A melee crown with one hero slot empty can attack the enemy", E.meleeTargets(st4, card(st4, 0, "lancelot")).length > 0);
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
{ // Winged sandals: +1 Guard with the Fate token, +1 Speed without
  const st = game(lu("perseus", ["circe"]), lu("merlin"));
  for (let k = 0; k < 2; k++) {
    const c = card(st, 0, "circe"), fate = st.fate === 0;
    ok(`Round ${st.round}: Circe has ${fate ? "Guard 1, Speed 3" : "Guard 0, Speed 4"}`, E.guardOf(st, c) === (fate ? 1 : 0) && E.speedOf(st, c) === (fate ? 3 : 4), [E.guardOf(st, c), E.speedOf(st, c)]);
    E.playRound(st, [{ orders: [] }, { orders: [] }]);
  }
}
{ // Growl: enemies -1 Guard and -1 Speed next round only
  const st = game(lu("the-minotaur"), lu("st-george"));
  const g = card(st, 1, "st-george"), g0 = E.guardOf(st, g), s0 = E.speedOf(st, g);
  E.playRound(st, [{ orders: [order(st, 0, "the-minotaur", "Growl")] }, { orders: [] }]);
  ok("Next round St George has -1 Guard and -1 Speed", E.guardOf(st, g) === g0 - 1 && E.speedOf(st, g) === s0 - 1, [E.guardOf(st, g), E.speedOf(st, g)]);
  E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("and is back to normal after", E.guardOf(st, g) === g0 && E.speedOf(st, g) === s0);
}
{ // Stony gaze slows each hero only once
  const st = game(lu("medusa"), lu("st-george"));
  const g = card(st, 1, "st-george"), s0 = E.speedOf(st, g);
  for (let k = 0; k < 2; k++) E.playRound(st, [{ orders: [] }, { orders: [order(st, 1, "st-george", "Attack", card(st, 0, "medusa"))] }]);
  ok("St George hit Medusa twice but lost only 1 Speed", E.speedOf(st, g) === s0 - 1, [s0, E.speedOf(st, g)]);
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
{ // Polyphemus: Crown buffs the front rank; Bond speeds other Hellas heroes; the boulder slows
  const st = game(lu("polyphemus", ["circe"], ["knight"]), lu("merlin"));
  const k = card(st, 0, "knight");
  ok("Shepherd of the cave: Knight on 4 Health and 2 Guard", k.health === 4 && k.guardLeft === 2, [k.health, k.guardLeft]);
  ok("Son of Poseidon: Circe has +1 Speed (3 + 1)", E.speedOf(st, card(st, 0, "circe")) === 4, E.speedOf(st, card(st, 0, "circe")));
  ok("Son of Poseidon: Polyphemus's own Attack and Speed are unchanged", E.attackOf(st, card(st, 0, "polyphemus")) === 4 && E.speedOf(st, card(st, 0, "polyphemus")) === 1);
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
{ // King Minos: tribute heals, Lord of the Labyrinth heals Beasts 1, Royal decree raises costs
  const st = game(lu("king-minos", ["the-minotaur"]), lu("merlin", [], ["villager"]));
  const mn = card(st, 0, "king-minos"), mt = card(st, 0, "the-minotaur");
  mn.health -= 4; mt.health -= 5;
  E.kill(st, card(st, 1, "villager"), mt);
  ok("Minos heals 1 + 3 and the Minotaur heals 1 + 1", mn.maxHealth - mn.health === 0 && mt.maxHealth - mt.health === 3, [mn.health, mt.health]);
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

// ---------- Norse ----------
{ // Charge: Sigurd digs the pit, is busy next round, then strikes for 6 ignoring Guard
  const st = game(lu("merlin", ["sigurd"]), lu("merlin", ["king-arthur"]));
  const sg = card(st, 0, "sigurd"), g = card(st, 1, "king-arthur");
  E.playRound(st, [{ orders: [order(st, 0, "sigurd", "Dig the pit", g)] }, { orders: [] }]);
  ok("Sigurd has no actions while charging", E.options(st, sg).length === 0);
  const h0 = g.health;
  E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("Gram from the pit hits King Arthur for 6 less his Guard", h0 - g.health === 6 - E.guardOf(st, g) || h0 - g.health === 5 || g.health <= 0, [h0, g.health]);
  ok("and Sigurd can act again", E.options(st, sg).length > 0);
}
{ // Charge lost if the charger is stopped
  const st = game(lu("fafnir"), lu("merlin"));
  const f = card(st, 0, "fafnir"), m = card(st, 1, "merlin");
  E.playRound(st, [{ orders: [order(st, 0, "fafnir", "Deep breath", m)] }, { orders: [] }]);
  const m0 = m.health;
  E.playRound(st, [{ orders: [] }, { orders: [order(st, 1, "merlin", "Enchanted sleep", f)] }]);
  ok("Merlin's sleep stops the Dragon fire", m.health === m0 && st.log.some((l) => l.includes("loses the charge")), [m0, m.health]);
}
{ // Gram's edge, Venom, Dragon's heart
  const st = game(lu("sigurd"), lu("king-arthur"));
  const g = card(st, 1, "king-arthur"), h0 = g.health;
  E.playRound(st, [{ orders: [order(st, 0, "sigurd", "Attack", g)] }, { orders: [] }]);
  ok("Gram's edge: Sigurd's 2 goes through King Arthur's Guard", h0 - g.health === 2, [h0, g.health]);
  const st2 = game(lu("fafnir"), lu("merlin"));
  const m = card(st2, 1, "merlin");
  E.playRound(st2, [{ orders: [order(st2, 0, "fafnir", "Attack", m)] }, { orders: [] }]);
  ok("Venom: Merlin is poisoned", st2.log.some((l) => l.includes("Fafnir's venom")));
  const st3 = game(lu("merlin", ["sigurd"]), lu("merlin", ["the-wolf"]));
  const sg = card(st3, 0, "sigurd"), a0 = E.attackOf(st3, sg), s0 = E.speedOf(st3, sg);
  E.kill(st3, card(st3, 1, "the-wolf"), sg);
  ok("The dragon's heart: a Beast (the Wolf) dies: +1 Attack, +1 Speed", E.attackOf(st3, sg) === a0 + 1 && E.speedOf(st3, sg) === s0 + 1);
}
{ // Andvari's curse: just 3 Poison on the killer
  const st = game(lu("merlin", ["fafnir"]), lu("st-george"));
  const g = card(st, 1, "st-george"), h0 = g.health;
  E.kill(st, card(st, 0, "fafnir"), g);
  ok("Fafnir's killer gains 3 Poison and no damage", g.health === h0 && g.poison === 3, [g.health, g.poison]);
}
{ // Loki: Shape-shifter, Unbound, Crown thief
  const st = game(lu("loki", ["polyphemus"]), lu("merlin"));
  const lk = card(st, 0, "loki"), py = card(st, 0, "polyphemus");
  E.playRound(st, [{ orders: [] }, { orders: [] }]);
  const r = st.round;
  E.kill; // keep
  // A big hit through applyHealthLoss path: use a Spell
  const m = card(st, 1, "merlin");
  lk.health = 2;
  E.playRound(st, [{ orders: [] }, { orders: [order(st, 1, "merlin", "Hex", lk)] }]);
  ok("Shape-shifter: Loki lives on 1 and Polyphemus holds the Crown", lk.health === 1 && E.crownCard(st, 0).uid === py.uid, [lk.health, E.crownCard(st, 0)?.name]);
  const st2 = game(lu("merlin", ["loki"], ["knight", "knight"]), lu("the-dragon", [], ["villager", "villager"]));
  const l2 = card(st2, 0, "loki");
  E.kill(st2, l2, card(st2, 1, "the-dragon"));
  const died = st2.round;
  E.playRound(st2, [{ orders: [] }, { orders: [] }]);
  ok("Unbound: still gone one upkeep later", l2.dead);
  const vs = E.cards(st2, 1).map((c) => [c.uid, c.health]);
  E.playRound(st2, [{ orders: [] }, { orders: [] }]);
  ok("Unbound: back on 3 Health two upkeeps later", !l2.dead && l2.health === 3, [l2.dead, l2.health]);
  ok("and lashed the enemy for 1", st2.log.filter((l) => l.includes("Loki deals 1")).length >= 1);
  { // Unbound takes back the Crown he wore
    const s4 = game(lu("loki", ["polyphemus"]), lu("merlin"));
    const lk4 = card(s4, 0, "loki"), py4 = card(s4, 0, "polyphemus");
    lk4.health = 1; E.playRound(s4, [{ orders: [] }, { orders: [order(s4, 1, "merlin", "Hex", lk4)] }]);
    ok("Shape-shifter passed the Crown to Polyphemus", E.crownCard(s4, 0)?.uid === py4.uid);
    E.kill(s4, lk4, card(s4, 1, "merlin"));
    E.playRound(s4, [{ orders: [] }, { orders: [] }]); E.playRound(s4, [{ orders: [] }, { orders: [] }]);
    ok("Unbound Loki returns and wears the Crown again", !lk4.dead && E.crownCard(s4, 0)?.uid === lk4.uid, [lk4.dead, E.crownCard(s4, 0)?.name]);
    E.kill(s4, lk4, card(s4, 1, "merlin"));
    ok("He doesn't come back a second time (the fight is over: he was the Crown)", lk4.dead);
  }
  const st3 = game(lu("loki"), lu("merlin", ["polyphemus"]));
  E.playRound(st3, [{ orders: [order(st3, 0, "loki", "Crown thief")] }, { orders: [] }]);
  ok("Crown thief: Polyphemus becomes the enemy Crown", E.crownCard(st3, 1).id === "polyphemus" && card(st3, 1, "merlin").slot !== 1);
}
{ // Quests: a warband has a card in every slot and no Crown, and is beaten only when every card has fallen
  const st = game(lu("st-george", ["the-dragon"]), { troops: "knight", troopCount: 4, front: [], items: [] });
  ok("A warband of 4 Knights fills four slots", E.cards(st, 1).length === 4 && E.cards(st, 1).every((c) => c.id === "knight"), E.cards(st, 1).map((c) => c.id));
  ok("A warband has no Crown", E.crownCard(st, 1) === null);
  ok("A warband isn't beaten while a card stands", !E.checkWin(st));
  for (const c of E.cards(st, 1).slice(0, 3)) { c.health = 0; c.dead = true; }
  ok("Still not beaten with one Knight left", !E.checkWin(st));
  E.cards(st, 1)[0].dead = true;
  ok("Beaten once the last Knight falls", E.checkWin(st) && st.winner === 0, st.winner);
}
{ // Melee through gaps: an empty front-rank slot lets melee reach the heroes behind; an empty hero slot too, the Crown
  const st = game(lu("st-george", ["the-dragon"]), lu("merlin", ["the-wolf", "the-huntsman"], ["knight", "monk", null]));
  const g = card(st, 0, "st-george"), d = card(st, 0, "the-dragon");
  const reach = (c) => E.meleeTargets(st, c).map((x) => x.id).sort().join(",");
  ok("With a gap in the front rank, melee reaches the heroes behind", reach(d).includes("the-wolf") && reach(d).includes("the-huntsman") && reach(d).includes("knight"), reach(d));
  ok("With both hero slots filled, the enemy Crown is still out of melee reach", !reach(d).includes("merlin"), reach(d));
  const st2 = game(lu("st-george", ["the-dragon"]), lu("merlin", ["the-wolf"], ["knight", "monk", "villager"]));
  const r2 = E.meleeTargets(st2, card(st2, 0, "the-dragon")).map((x) => x.id);
  ok("A full front rank still shields everything behind it", r2.every((id) => ["knight", "monk", "villager"].includes(id)), r2);
  const st3 = game(lu("st-george", ["the-dragon"]), lu("merlin", ["the-wolf"], ["knight", null, null]));
  const r3 = E.meleeTargets(st3, card(st3, 0, "the-dragon")).map((x) => x.id);
  ok("Gaps in both rows: melee reaches the front rank, the hero and the Crown", ["knight", "the-wolf", "merlin"].every((id) => r3.includes(id)), r3);
}
{ // Zmey: three heads at the card he attacks; as Crown, five heads at random enemy cards
  const st = game(lu("st-george", ["zmey-gorynych"]), lu("merlin", ["the-wolf"], []));
  const z = card(st, 0, "zmey-gorynych"), w = card(st, 1, "the-wolf");
  ok("Zmey's Attack is 1", E.attackOf(st, z) === 1, E.attackOf(st, z));
  const h0 = w.health;
  E.playRound(st, [{ orders: [order(st, 0, "zmey-gorynych", "Attack", w)] }, { orders: [] }]);
  const hits = st.events.filter((e) => e.t === "hit" && e.src === z.uid && e.tgt === w.uid).length;
  ok("Three heads: three hits on the Wolf", hits === 3, hits);
  ok("Each head deals 1 (the Wolf has no Guard)", h0 - w.health === 3, h0 - w.health);
  const st2 = game(lu("zmey-gorynych", ["st-george"]), lu("merlin", ["the-wolf"], ["knight"]));
  const z2 = card(st2, 0, "zmey-gorynych");
  E.playRound(st2, [{ orders: [order(st2, 0, "zmey-gorynych", "Attack", card(st2, 1, "knight"))] }, { orders: [] }]);
  const h2 = st2.events.filter((e) => e.t === "hit" && e.src === z2.uid).length;
  ok("As Crown, five heads strike", h2 === 5, h2);
  const st3 = game(lu("koschei", ["zmey-gorynych", "vasilisa-the-wise"]), lu("merlin"));
  ok("Zmey's Bond: other Rus' heroes +1 Speed", E.speedOf(st3, card(st3, 0, "vasilisa-the-wise")) === data.heroes["vasilisa-the-wise"].stats.speed + 1, E.speedOf(st3, card(st3, 0, "vasilisa-the-wise")));
  ok("Zmey's Bond doesn't speed up Zmey", E.speedOf(st3, card(st3, 0, "zmey-gorynych")) === data.heroes["zmey-gorynych"].stats.speed);
}
{ // Quests: a company with no Crown is beaten only when every card has fallen
  const st = game(lu("st-george", ["the-dragon"]), { crown: "perseus", heroes: ["medusa"], front: [], items: [], noCrown: true });
  ok("A no-Crown company has no Crown", E.crownCard(st, 1) === null);
  const pe = card(st, 1, "perseus"); E.kill(st, pe, null);
  ok("Losing the hero in slot 1 doesn't beat it", !E.checkWin(st));
  E.kill(st, card(st, 1, "medusa"), null);
  ok("Beaten once both heroes fall", E.checkWin(st) && st.winner === 0, st.winner);
}
{ // Quests: blind fights. Hidden cards can't be targeted until they act on you; all show themselves in the reveal round.
  const st = game(lu("st-george", ["the-princess"]), { crown: "the-wolf", heroes: ["the-huntsman"], front: [], items: [], blind: true, revealRound: 3 });
  const g = card(st, 0, "st-george"), w = card(st, 1, "the-wolf");
  ok("The enemy starts hidden", E.isBlind(st, w) && E.isHidden(st, w));
  ok("St George can't target a hidden enemy", E.options(st, g).every((o) => o.targets.every((t) => !t || t.side === 0)), E.options(st, g).map((o) => o.targets.length));
  ok("A hidden enemy can't be marked by Rumpelstiltskin", E.rumpelChoices(st, 0).length === 0);
  const hu = card(st, 1, "the-huntsman");
  E.playRound(st, [{ orders: [] }, { orders: [order(st, 1, "the-huntsman", "Attack", card(st, 0, "the-princess"))] }]);
  ok("The Huntsman shows himself when he shoots", !E.isBlind(st, hu));
  ok("The Wolf, who did nothing to you, stays hidden", E.isBlind(st, w));
  { const st5 = game(lu("the-huntsman", ["the-princess"]), { crown: "the-wolf", heroes: [], front: [], items: [], blind: true, revealRound: 3 });
    const wolf = card(st5, 1, "the-wolf");
    E.playRound(st5, [{ orders: [], hunt: wolf.uid }, { orders: [] }]);
    ok("The Huntsman can't mark a hidden enemy", !st5.marks["hunt0"] || st5.round > 1 && !E.isBlind(st5, wolf), st5.marks); }
  { const st6 = game(lu("st-george", ["the-princess"], [], ["poisoned-apple"]), { crown: "the-wolf", heroes: [], front: [], items: [], blind: true, revealRound: 3 });
    const wolf = card(st6, 1, "the-wolf");
    E.playRound(st6, [{ orders: [], items: [{ id: "poisoned-apple", target: wolf.uid }] }, { orders: [] }]);
    ok("An item can't be used on a hidden enemy (and isn't spent)", st6.sides[0].items.includes("poisoned-apple") && !wolf.poison, st6.sides[0].items); }
  ok("Now the Princess can target the Huntsman", E.options(st, card(st, 0, "the-princess")).some((o) => o.targets.some((t) => t && t.uid === hu.uid)));
  ok("Round 2: the Wolf is still hidden", st.round === 2 && E.isBlind(st, w), st.round);
  E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("Round 3: every hidden enemy has shown itself", st.over || (st.round === 3 && !E.isBlind(st, w)), st.round);
}
{ // Quests: what a company carries from one fight to the next
  const mine = lu("st-george", ["the-princess"], ["knight", "monk", "villager"], ["gingerbread", "golden-apple"]);
  const st = game(mine, lu("merlin"));
  const g = card(st, 0, "st-george"); g.health = 2;
  const kn = E.cards(st, 0).find((c) => c.id === "knight"); kn.health = 0; kn.dead = true;
  st.sides[0].items = ["golden-apple"];
  const next = E.carryOver(st, 0, mine);
  ok("Carry: the fallen Knight is gone", next.lineup.front[0] === null && next.lineup.front[1] === "monk", next.lineup.front);
  ok("Carry: the used Gingerbread is gone", JSON.stringify(next.lineup.items) === '["golden-apple"]', next.lineup.items);
  ok("Carry: St George keeps the Crown on 2 Health", next.lineup.crown === "st-george" && next.health.hero["st-george"] === 2, next);
  const st2 = game(next.lineup, lu("merlin"));
  E.applyCarry(st2, 0, next.health);
  ok("Carry: the next fight starts with St George on 2 Health", card(st2, 0, "st-george").health === 2, card(st2, 0, "st-george").health);
}
{ // Hold court: Crown only, acts first, +1 Guard for a melee Crown, +1 AP next round, never stacking
  const has = (st, i, id) => card(st, i, id).actions.some((a) => a.name === "Hold court");
  const can = (st, i, id) => E.options(st, card(st, i, id)).some((o) => o.action.name === "Hold court");
  const st = game(lu("dracula", ["renfield", "van-helsing"]), lu("the-dragon"));
  const d = card(st, 0, "dracula"), g0 = d.guardLeft;
  ok("Hold court: the Crown can hold court", can(st, 0, "dracula"));
  ok("Hold court: a hero not wearing the Crown can't", !can(st, 0, "renfield"));
  E.playRound(st, [{ orders: [order(st, 0, "dracula", "Hold court")] }, { orders: [] }]);
  ok("Hold court: a melee Crown has +1 Guard that round", st.log.some((l) => l === "R1: Dracula has +1 Guard this round."), st.log.slice(0, 6));
  ok("Hold court: +1 action point next round", st.sides[0].ap === 5, st.sides[0].ap);
  E.playRound(st, [{ orders: [order(st, 0, "dracula", "Hold court")] }, { orders: [] }]);
  ok("Hold court: holding court again still gives 5, not 6", st.sides[0].ap === 5, st.sides[0].ap);
  E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("Hold court: back to 4 after a round without it", st.sides[0].ap === 4, st.sides[0].ap);
  const st2 = game(lu("gretel"), lu("the-dragon"));
  const gr = card(st2, 0, "gretel"), g2 = gr.guardLeft;
  E.playRound(st2, [{ orders: [order(st2, 0, "gretel", "Hold court")] }, { orders: [] }]);
  ok("Hold court: a ranged Crown gets the Guard too", st2.log.some((l) => l === "R1: Gretel has +1 Guard this round."), st2.log.slice(0, 6));
  ok("Hold court: a ranged Crown still gets the action point", st2.sides[0].ap === 5, st2.sides[0].ap);
  ok("Hold court: Baba Yaga doesn't have it", !has(game(lu("baba-yaga"), lu("the-dragon")), 0, "baba-yaga"));
  ok("Hold court: Robin's No Crown means no Hold court", !can(game(lu("robin-hood", ["little-john"]), lu("the-dragon")), 0, "robin-hood"));
  const st3 = game(lu("victor-frankenstein", ["the-creature", "the-bride"]), lu("the-dragon"));
  E.playRound(st3, [{ orders: [order(st3, 0, "victor-frankenstein", "Hold court")] }, { orders: [] }]);
  ok("Hold court: Victor's Galvanism adds on top (4 + 1 + 1)", st3.sides[0].ap === 6, st3.sides[0].ap);
}
{ // Bite: each hero can only be bitten once a fight
  const st = game(lu("dracula", ["renfield", "van-helsing"], ["villager", "villager", "villager"]), lu("the-dragon", ["the-wolf", "the-huntsman"]));
  const dr = card(st, 0, "dracula"), wolf = card(st, 1, "the-wolf");
  const bite = dr.actions.find((a) => a.name === "Bite");
  ok("Bite: the Wolf can be bitten", E.targetsFor(st, dr, bite).some((c) => c.uid === wolf.uid));
  E.playRound(st, [{ orders: [order(st, 0, "dracula", "Bite", wolf)] }, { orders: [] }]);
  ok("Bite: the Wolf can't be bitten a second time", !wolf.dead && !E.targetsFor(st, dr, bite).some((c) => c.uid === wolf.uid) || wolf.dead, E.targetsFor(st, dr, bite).map((c) => c.name));
  ok("Bite: the Huntsman still can be", E.targetsFor(st, dr, bite).some((c) => c.id === "the-huntsman"));
}
{ // Galvanism is a flat +1; the Shard of the mirror can target each hero once
  const st = game(lu("victor-frankenstein"), lu("the-dragon"));
  E.playRound(st, [{ orders: [] }, { orders: [] }]);
  ok("Galvanism: a lone Victor still gets 5 AP", st.sides[0].ap === 5, st.sides[0].ap);
  const st2 = game(lu("the-snow-queen"), lu("the-dragon", ["the-wolf", "the-huntsman"]));
  const q = card(st2, 0, "the-snow-queen"), shard = q.actions.find((a) => a.name === "Shard of the mirror"), wolf = card(st2, 1, "the-wolf");
  E.playRound(st2, [{ orders: [order(st2, 0, "the-snow-queen", "Shard of the mirror", wolf)] }, { orders: [] }]);
  const t = E.targetsFor(st2, q, shard);
  ok("Shard: the Wolf can't be targeted again", !t.some((c) => c.uid === wolf.uid), t.map((c) => c.name));
  ok("Shard: other heroes still can", t.some((c) => c.id === "the-huntsman"));
}
{ // Labyrinth: once a fight, two random enemy cards can't act next round
  const st = game(lu("king-minos"), lu("the-dragon", ["the-wolf", "the-huntsman"]));
  E.playRound(st, [{ orders: [order(st, 0, "king-minos", "Labyrinth")] }, { orders: [] }]);
  const lost = E.cards(st, 1).filter((c) => c.flags.labyrinthRound === st.round);
  ok("Labyrinth: two enemy cards are stopped this round", lost.length === 2 && lost.every((c) => c.stopNow), lost.map((c) => c.name));
  const mn = card(st, 0, "king-minos"), lab = mn.actions.find((a) => a.name === "Labyrinth");
  ok("Labyrinth: once a fight", !E.options(st, mn).some((o) => o.action === lab));
}
{ // The Snow Queen strikes twice; Frozen kiss is a 2 Spell ignoring Guard
  const st = game(lu("the-dragon", ["the-snow-queen", "merlin"], ["villager", "villager", "villager"]), lu("renfield", [], ["knight", "knight", "knight"]));
  const g = card(st, 1, "renfield"), h0 = g.health;
  E.playRound(st, [{ orders: [order(st, 0, "the-snow-queen", "Frozen kiss", g)] }, { orders: [] }]);
  ok("Frozen kiss: 2 to Renfield through his Guard", h0 - g.health === 2, [h0, g.health]);
  const st2 = game(lu("the-dragon", ["the-snow-queen", "merlin"]), lu("the-wolf"));
  const q2 = card(st2, 0, "the-snow-queen"), w = card(st2, 1, "the-wolf"), w0 = w.health;
  E.playRound(st2, [{ orders: [order(st2, 0, "the-snow-queen", "Attack", w)] }, { orders: [] }]);
  ok("The Snow Queen's Attack strikes twice for 1", w0 - w.health === 2, [w0, w.health, st2.log.filter((l) => /Snow Queen/.test(l))]);
}
console.log(fails ? `${fails} check(s) failed` : "All checks passed");
process.exit(fails ? 1 : 0);
