// Crown & Chaos rules engine.
// Shared by the simulator (Node) and the playable page (browser). No dependencies.
//
// Board: each side has slots 1–6. Slot 1 is the Crown, slots 2–3 are heroes,
// slots 4–6 are the front rank. A round is: upkeep, plan, resolve (Speed order).
//
// Where the design doc leaves a detail open, the engine makes a choice and lists it
// in ASSUMPTIONS so it can be checked against playtesting.

export const NIGHTFALL_ROUND = 8;
export const ASSUMPTIONS = [
  "Items resolve before any card acts that round.",
  "Opposite slots face each other: 4 faces 4, 5 faces 5, 6 faces 6.",
  "Slot 1 counts as next to slots 2 and 3; front-rank slots are next to their row neighbours.",
  "Baba Yaga's Mortar ride is simplified: she kills the closest enemy card that isn't the Crown and stays in slot 1.",
  "Koschei's Whirlwind swaps the target with the other hero in slots 2–3 (never the Crown).",
  "A Thrall made by Dracula's Turn has 3 Health and the victim's Attack, and attacks the card opposite.",
  "Merlin's Enchanted sleep stops the hero for this round only, because no hero can be stopped two rounds running.",
  "Fights that pass round 20 are draws.",
  "Mirrored shield and Nobody are not Speed dependent: if chosen (and not stopped or cancelled), they are up before anyone acts that round.",
  "Mirrored shield reflects the attack's damage before Guard; the attacker's own Guard then applies.",
  "The wooden horse hides only from the enemy's view; the computer opponent plans blind against hidden cards in round 1.",
  "Men of Ithaca counts every Hellas hero fielded at the start, Odysseus included; Villagers are placed at upkeep.",
  "The Labyrinth stops Ranged attacks and random ranged effects (Fire Breath, Split the Arrow, Crossbows) reaching heroes in slots 2–3; Spells still reach them.",
  "Hurl the boulder slows the hero it hits in the next round, since Polyphemus (Speed 1) usually acts last.",
  "Royal decree: a second decree before the first runs out doesn't stack.",
  "Hold court (every Crown but Baba Yaga; none under Robin's No Crown): 1 AP and the Crown's action. Resolves before Speed order, like Mirrored shield. +1 Guard that round, ranged and magic Crowns included (Growl and Dread can cancel it; St George's Bond never converts it; Blodeuwedd can't take it). +1 AP next round, never more than one; Galvanism's +1 adds on top. Stopped or cancelled, it's lost; Royal decree makes it cost 2.",
  "Attack from Bonds (flat bonuses and Attack gained when a card dies) counts only for melee attacks: never for ranged attacks or spells, including a melee hero's ranged action such as Axe throw. The same goes for the Dragon's Bond damage against Slayers. Crown passives are unaffected; Merlin's and Morgan's Bonds add to their Spells against certain Aspects.",
  "Charge moves (Dig the pit, Deep breath): the hero is busy this round and next; the strike goes off at its Speed next round. Stopped, cancelled or killed first, the charge is lost.",
  "A charged strike deals 6, less the target's Guard (a Sigurd Crown's Gram's edge still ignores Guard); it ignores reach, since the target was chosen when the charge began.",
  "Andvari's curse: if Poison, nightfall or a dead card killed Fafnir, a random enemy hero gets the 3 Poison.",
  "Shape-shifter: if Loki has no other hero, he still survives on 1 Health and stays the Crown.",
  "Unbound: Loki returns at the second upkeep after his death (once per fight); if Van Helsing's Crown is out, he doesn't. He takes the Crown back only if he wore it earlier in the fight.",
  "Crown thief does nothing against a No Crown side (Robin Hood) or when the Crown already has the most Health.",
  "The slot-1 rules (shielded from melee, and unable to melee, only while both its hero slots are filled) apply to whoever is in slot 1, including under Robin's No Crown.",
  "Only the standard Attack can be turned on your own heroes, and only from slot 1.",
  "Front-rank cards in front of the Crown don't stop it attacking; only heroes in slots 2–3 do.",
];

const NIGHTFALL = 8;
// Action points each round, and how many items a line-up can bring into a fight.
export const BASE_AP = 4, TOOL_BELT = 2;
const MAX_ROUNDS = 20;
const FRONT_SPEED = 2;

// ---------- random numbers (seedable, so fights can be replayed) ----------
export function makeRng(seed = Date.now()) {
  let s = (Math.imul(seed >>> 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let k = 0; k < 8; k++) next(); // warm up, so small seeds don't give lopsided first rolls
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

// ---------- setting up a fight ----------
let UID = 0;
// Hold court: every Crown's own action (Baba Yaga excepted; with Robin's No Crown there is no Crown to use it).
export const HOLD_COURT = { name: "Hold court", ap: 1, court: true,
  text: "Crown only. Acts first, before Speed order. +1 Guard this round and +1 action point next round." };
const isCourt = (st, c, act) => act && act.court && c.kind === "hero" && !st.sides[c.side].noCrown && st.sides[c.side].crownUid === c.uid && c.id !== "baba-yaga";

function makeHero(def, side, slot) {
  const s = def.stats;
  return {
    uid: ++UID, id: def.id, kind: "hero", side, slot, name: def.name,
    realm: def.realm, tale: def.tale, aspect: def.aspect, ranged: !!s.ranged, tags: def.tags || [],
    baseHealth: s.health, maxHealth: s.health, health: s.health,
    baseAtk: s.attack, baseGuard: s.guard, baseSpeed: s.speed,
    atkPerm: 0, atkBond: 0, speedPerm: 0, guardIntoAtk: 0, atkMult: 1, speedFixed: null,
    actions: def.actions.map((a) => ({ ...a })).concat(def.id === "baba-yaga" ? [] : [{ ...HOLD_COURT }]), uses: {},
    guardLeft: 0, roundGuard: 0, poison: 0, dead: false, removed: false,
    noGuard: false, noHeal: false, stoppedRound: -9, stopNow: false,
    flags: {},
  };
}

function makeFront(def, side, slot) {
  return {
    uid: ++UID, id: def.id, kind: "front", side, slot, name: def.name,
    realm: def.realm || null, tale: def.tale || null, aspect: null, ranged: false,
    baseHealth: def.health, maxHealth: def.health, health: def.health,
    baseAtk: def.attack, baseGuard: def.guard, baseSpeed: def.speed ?? FRONT_SPEED,
    atkPerm: 0, atkBond: 0, speedPerm: 0, guardIntoAtk: 0, atkMult: 1, speedFixed: null,
    auto: def.auto, actions: [], uses: {},
    guardLeft: 0, roundGuard: 0, poison: 0, dead: false, removed: false,
    noGuard: false, noHeal: false, stoppedRound: -9, stopNow: false,
    flags: {},
  };
}

// lineup: { crown, heroes: [id, id], front: [id, id, id], items: [id...] }
export function createGame(data, lineups, opts = {}) {
  const rng = opts.rng || makeRng(opts.seed);
  const st = {
    data, rng, round: 0, fate: rng.int(2), log: [], over: false, winner: null,
    sides: [0, 1].map((i) => ({ index: i, slots: {}, items: [], usedItems: [], grave: [], swallowed: [],
      noCrown: false, crownUid: null, ap: BASE_AP, flags: {} })),
    marks: {},
  };
  lineups.forEach((lu, i) => setupSide(st, i, lu));
  // Morgan le Fay as Crown starts with the Fate token (an enemy Renfield keeps it instead; two Morgans leave it to chance).
  const morgan = [0, 1].filter((i) => lineups[i]?.crown === "morgan-le-fay");
  const renfield = [0, 1].filter((i) => lineups[i]?.crown === "renfield");
  if (morgan.length === 1 && !renfield.includes(1 - morgan[0])) st.fate = morgan[0];
  // Quests: one side may hold the Fate token all fight, and night may never fall.
  if (opts.fate != null) { st.fixedFate = opts.fate; st.fate = opts.fate; }
  if (opts.noNight) st.noNight = true;
  if (opts.maxRounds) st.maxRounds = opts.maxRounds;
  // Start-of-fight effects
  for (const side of st.sides) {
    const crown = crownCard(st, side.index);
    if (crown?.id === "robin-hood") side.noCrown = true;
  }
  applyStartingHealth(st);
  // Men of Ithaca: one Villager per Hellas hero fielded, if Odysseus is fielded.
  for (const side of st.sides) {
    if (heroes(st, side.index).some((h) => h.id === "odysseus"))
      side.flags.ithacaLeft = heroes(st, side.index).filter((h) => h.realm === "Hellas").length;
  }
  for (const side of st.sides) {
    const crown = crownCard(st, side.index);
    if (crown && crownActive(st, side.index) && crown.id === "sheriff-of-nottingham") {
      const foe = st.sides[1 - side.index];
      if (foe.items.length) {
        const i = rng.int(foe.items.length);
        const [taken] = foe.items.splice(i, 1);
        side.items.push(taken);
        log(st, `${sideName(side.index)} taxed: the Sheriff of Nottingham takes ${itemName(st, taken)} from ${sideName(foe.index)}.`);
      }
    }
  }
  if (opts.noUpkeep !== true) upkeep(st);
  return st;
}

function setupSide(st, i, lu) {
  const side = st.sides[i];
  const H = (id) => st.data.heroes[id];
  const F = (id) => st.data.front[id];
  let crownId = lu.crown;
  const heroes = (lu.heroes || []).slice(0, 2);
  if ([crownId, ...heroes].includes("baba-yaga") && crownId !== "baba-yaga") {
    heroes[heroes.indexOf("baba-yaga")] = crownId;
    crownId = "baba-yaga";
  }
  // A warband (quests): the same front-rank card in every slot, and no Crown.
  if (lu.troops) {
    for (let k = 1; k <= (lu.troopCount || 6); k++) side.slots[k] = makeFront(F(lu.troops), i, k);
    side.troops = true; side.allMustFall = true; side.noCrown = true; side.crownUid = null;
    return;
  }
  if (crownId) side.slots[1] = makeHero(H(crownId), i, 1);
  heroes.forEach((id, k) => { if (id) side.slots[2 + k] = makeHero(H(id), i, 2 + k); });
  const front = (lu.front || []).slice(0, 3);
  const hasKoschei = [crownId, ...heroes].includes("koschei");
  front.forEach((id, k) => { if (id && !(hasKoschei && k === 2)) side.slots[4 + k] = makeFront(F(id), i, 4 + k); });
  if (hasKoschei) side.slots[6] = makeFront(F("the-needle"), i, 6);
  side.items = (lu.items || []).filter(Boolean).slice(0, TOOL_BELT);
  side.crownUid = side.slots[1]?.uid ?? null;
  // A blind fight (quests): this side's cards are hidden from the other side, and can't be targeted, until each
  // one first acts on a card of the other side.
  if (lu.blind) side.blind = true;
  // A company with no Crown (quests): no Crown passive, and it is beaten only when every card has fallen.
  if (lu.noCrown) { side.noCrown = true; side.allMustFall = true; }
  if (lu.ap != null) side.baseAp = lu.ap;
  if (lu.revealRound != null) side.revealRound = lu.revealRound;
  side.startUids = Object.values(side.slots).map((c) => c.uid);
}

// ---------- small helpers ----------
const sideName = (i) => (i === 0 ? "Blue" : "Red");
const itemName = (st, id) => st.data.items[id]?.name || id;
// st.onLog, if set, is called after every log line, so a page can record the fight step by step.
export function log(st, msg) { st.log.push(`R${st.round}: ${msg}`); if (st.onLog) st.onLog(msg); }
// Events: a structured record of what happened, in order, so a screen can animate it.
// Every event has t (its type) and r (the round). Card references are uids.
// Each event carries n, the number of log lines written before it. An event explains the log line just
// before it, except phase, skip and a front-rank card's act, which open what follows.
export function ev(st, e) {
  (st.events ||= []).push({ r: st.round, n: st.log.length, ...e });
  // A hidden card shows itself the first time it acts on a card of the other side.
  if (e.t === "reveal" || !(st.sides[0].blind || st.sides[1].blind)) return;
  const srcUid = e.src ?? (e.t === "act" ? e.uid : null);
  const src = srcUid != null ? findCard(st, srcUid) : null;
  if (!src || !st.sides[src.side].blind || src.flags.seen) return;
  const tg = [e.tgt, ...(e.tgts || [])].filter((u) => u != null).map((u) => findCard(st, u)).filter(Boolean);
  if (tg.some((t) => t.side !== src.side)) { src.flags.seen = true; log(st, `${src.name} is revealed.`); ev(st, { t: "reveal", uid: src.uid }); }
}
const uidOf = (c) => (c && c.uid != null ? c.uid : null);
const styleOf = (opts) => opts.spell ? "spell" : opts.ranged ? "ranged" : opts.attack ? "melee" : "effect";
// Gains in Guard and Poison, and some changes to Health, are made in many places, so they are found
// by comparing before and after. A health change no event explains gets an "hp" event; a card that
// appears from nowhere (a summon) gets an "appear" event.
function snapStats(st) {
  const m = new Map(allCards(st).map((c) => [c.uid, { g: c.guardLeft, p: c.poison, h: c.health }]));
  m.idx = (st.events || []).length;
  return m;
}
function diffStats(st, before, src) {
  const since = (st.events || []).slice(before.idx);
  for (const c of allCards(st)) {
    const b = before.get(c.uid);
    if (!b) {
      if (!since.some((e) => e.t === "revive" && e.uid === c.uid)) ev(st, { t: "appear", uid: c.uid, side: c.side, slot: c.slot, name: c.name, hp: c.health });
      continue;
    }
    if (c.guardLeft > b.g) ev(st, { t: "guardUp", src: uidOf(src), item: src?.item, tgt: c.uid, amt: c.guardLeft - b.g });
    if (c.poison > b.p) ev(st, { t: "poison", src: uidOf(src), item: src?.item, tgt: c.uid, amt: c.poison - b.p });
    let shown = b.h;
    for (const e of since) if ((e.tgt === c.uid || e.uid === c.uid) && "hp" in e) shown = e.hp;
    if (c.health !== shown) ev(st, { t: "hp", src: uidOf(src), item: src?.item, tgt: c.uid, delta: c.health - shown, hp: c.health });
  }
}


export function cards(st, i) { return Object.values(st.sides[i].slots).filter((c) => c && !c.dead && !c.removed); }
export function heroes(st, i) { return cards(st, i).filter((c) => c.kind === "hero"); }
export function allCards(st) { return [...cards(st, 0), ...cards(st, 1)]; }
function at(st, i, slot) { const c = st.sides[i].slots[slot]; return c && !c.dead && !c.removed ? c : null; }
export function crownCard(st, i) {
  const side = st.sides[i];
  if (side.noCrown) return null;
  return Object.values(side.slots).find((c) => c && c.uid === side.crownUid && !c.dead) || null;
}
function crownActive(st, i) { return !st.sides[i].noCrown; }
function crownIs(st, i, id) { const c = crownCard(st, i); return !!c && c.id === id && crownActive(st, i); }
function anyCrown(st, id) { return crownIs(st, 0, id) || crownIs(st, 1, id); }
const isNight = (st) => !st.noNight && st.round >= NIGHTFALL;
const injured = (c) => c.health < c.maxHealth;

function neighbours(st, c) {
  const i = c.side, s = c.slot;
  const map = { 1: [2, 3], 2: [1, 3], 3: [1, 2], 4: [5], 5: [4, 6], 6: [5] };
  return (map[s] || []).map((x) => at(st, i, x)).filter(Boolean);
}

// For bonds: realm/tale checks bend under King Arthur's crown.
// The Round Table works from round 3 until nightfall.
function arthur(st, i) { return crownIs(st, i, "king-arthur") && st.round >= 3 && !isNight(st); }
function isRealm(st, c, realm) { return c.realm === realm || (arthur(st, c.side) && c.kind === "hero"); }
function isTale(st, c, tale) { return c.tale === tale || (arthur(st, c.side) && c.kind === "hero"); }
function otherHeroes(st, c, pred = () => true) { return heroes(st, c.side).filter((h) => h.uid !== c.uid && pred(h)); }
function countRealm(st, c, realm) { return otherHeroes(st, c, (h) => isRealm(st, h, realm)).length; }

// Bond strength for a side: 1 normally, 0 if the enemy crown is Morgan and she holds the Fate token,
// -1 if it is the Little Mermaid.
function bondFactor(st, i) {
  const foe = 1 - i;
  if (crownIs(st, foe, "morgan-le-fay") && st.fate === foe) return 0;
  if (crownIs(st, foe, "the-little-mermaid")) return -1;
  return 1;
}
function hasBond(st, c) { return bondFactor(st, c.side) !== 0; }

// ---------- derived stats ----------
// Attack from Bonds counts only for melee attacks (a ranged hero's Bond Attack never applies, nor does a melee
// hero's on a ranged action such as Beowulf's Axe throw). opts.melee overrides the default, which is the card's own kind.
export function attackOf(st, c, opts = {}) {
  const melee = opts.melee ?? !c.ranged;
  let a = c.baseAtk + c.atkPerm + (melee ? (c.atkBond || 0) + c.guardIntoAtk : 0);
  if (c.flags.harmless) return 0;
  const f = melee ? bondFactor(st, c.side) : 0;
  if (c.kind === "hero" && f) {
    if (["renfield", "van-helsing"].includes(c.id)) a += f * countRealm(st, c, "Gothic");
    if (c.id === "rumpelstiltskin") a += f * countRealm(st, c, "Märchen");
    if (c.id === "the-huntsman") a += f * Math.min(2, countRealm(st, c, "Märchen"));
    if (c.id === "the-tin-soldier") a += f * countRealm(st, c, "Eventyr");
    if (c.id === "lancelot") {
      const mine = heroes(st, c.side);
      if (mine.some((h) => h.aspect === "Sovereign") && !mine.some((h) => h.aspect === "Healer")) a += f * 2;
    }
  }
  if (c.id === "the-bride" && crownIs(st, c.side, "the-bride") && gothicBeast(st, c)) a += 1;
  if (c.kind === "hero" && f) {
    // Gorgon's bane: +1 Attack for each Beast on the board, either side.
    if (c.id === "perseus") a += f * allCards(st).filter((x) => x.kind === "hero" && x.aspect === "Beast").length;
  }
  if (melee) a = a * c.atkMult;
  // Transfigure: Attack becomes 1. Aiaia: front-rank swine have 0 Attack.
  if (c.flags.transfigUntil >= st.round) a = Math.min(a, 1);
  if (c.flags.swineRound === st.round) a = 0;
  return Math.max(0, a);
}
function gothicBeast(st, c) { return otherHeroes(st, c, (h) => h.aspect === "Beast" && isRealm(st, h, "Gothic")).length > 0; }

export function guardOf(st, c) {
  if (c.noGuard) return 0;
  let g = c.baseGuard;
  if (c.id === "blodeuwedd" && c.flags.night) g = c.baseGuard * 2;
  const i = c.side;
  // bonds from cards on this side
  for (const src of heroes(st, i)) {
    const f = bondFactor(st, i);
    if (!f) break;
    if (src.id === "king-arthur" && c.kind === "hero" && isRealm(st, c, "Albion")) g += f;
    if (src.id === "sheriff-of-nottingham" && isRealm(st, c, "Albion")) g += f;
    if (src.id === "blodeuwedd" && c.kind === "hero" && isRealm(st, c, "Cymru")) g += f;
  }
  const f = bondFactor(st, i);
  if (c.kind === "hero" && f) {
    if (c.id === "bran-the-blessed") g += f * countRealm(st, c, "Cymru");
    if (c.id === "friar-tuck") g += f * countRealm(st, c, "Albion");
    if (c.id === "the-snow-queen") g += f * countRealm(st, c, "Eventyr");
  }
  if (crownIs(st, i, "little-john") && c.kind === "hero" && c.realm === "Albion") g += 1;
  if (crownIs(st, i, "merlin") && c.kind === "front") g += 1;
  if (c.id === "the-bride" && crownIs(st, i, "the-bride") && gothicBeast(st, c)) g += 1;
  // Gwydion's Bond: your front rank has +1 Guard for each of your Cymru heroes that has died.
  if (c.kind === "front" && f && heroes(st, i).some((h) => h.id === "gwydion"))
    g += f * st.sides[i].grave.filter((d) => d.kind === "hero" && isRealm(st, d, "Cymru")).length;
  if (f) {
    // Gorgon sisters: Medusa has +1 Guard for each of your Hellas heroes that has died.
    if (c.id === "medusa") g += f * st.sides[i].grave.filter((d) => d.kind === "hero" && isRealm(st, d, "Hellas")).length;
    // Guests of Aiaia: Circe gives your other Hellas heroes +1 Guard.
    if (c.kind === "hero" && c.id !== "circe" && isRealm(st, c, "Hellas") && heroes(st, i).some((h) => h.id === "circe")) g += f;
  }
  if (c.kind === "front" && crownIs(st, i, "polyphemus")) g += 1;
  // Winged sandals: your heroes have +1 Guard in rounds you hold the Fate token.
  if (c.kind === "hero" && st.fate === i && crownIs(st, i, "perseus")) g += 1;
  // Hold court: +1 Guard for the round (added before the Guard-lowering effects below, which can cancel it).
  if (c.flags.courtGuardRound === st.round) g += 1;
  // Growl: -1 Guard to every enemy card in the round after the Minotaur growls.
  if (st.sides[i].flags.growlRound === st.round) g -= 1;
  // Phalanx: a Hoplite has +1 Guard for each Hoplite next to it.
  if (c.id === "hoplite") g += neighbours(st, c).filter((n) => n.id === "hoplite").length;
  // Dread: the Creature as Crown takes 1 Guard from every enemy hero.
  if (crownIs(st, 1 - i, "the-creature") && c.kind === "hero") g -= 1;
  return Math.max(0, g);
}

export function speedOf(st, c) {
  if (c.flags.speedOneRound === st.round) return 1;
  if (c.speedFixed != null) return c.speedFixed;
  let s = c.baseSpeed + c.speedPerm;
  const i = c.side, f = bondFactor(st, i);
  if (f) {
    for (const src of heroes(st, i)) {
      if (src.id === "robin-hood" && src.uid !== c.uid && c.kind === "hero" && isRealm(st, c, "Albion")) s += f;
      if (src.id === "baba-yaga" && src.uid !== c.uid && c.kind === "hero") s -= f;
      // Zmey's Bond: your other Rus' heroes have +1 Speed.
      if (src.id === "zmey-gorynych" && src.uid !== c.uid && c.kind === "hero" && isRealm(st, c, "Rus'")) s += f;
      // Polyphemus's Bond: your other Hellas heroes have +1 Speed.
      if (src.id === "polyphemus" && src.uid !== c.uid && c.kind === "hero" && isRealm(st, c, "Hellas")) s += f;
      // Merlin's Bond: your Sovereigns have +1 Speed.
      if (src.id === "merlin" && src.uid !== c.uid && c.kind === "hero" && c.aspect === "Sovereign") s += f;
    }
    if (c.id === "rhiannon") s += f * countRealm(st, c, "Cymru");
    if (c.id === "the-bride" && gothicBeast(st, c)) s += f;
  }
  if (crownIs(st, 1 - i, "the-creature") && c.kind === "hero") s -= 1;
  // Morgan's Bond: every Sovereign on the board, hers and the enemy's, has -1 Speed (two Morgans still make -1).
  if (c.kind === "hero" && c.aspect === "Sovereign") {
    const fm = [0, 1].filter((j) => heroes(st, j).some((h) => h.id === "morgan-le-fay")).map((j) => bondFactor(st, j)).find((x) => x);
    if (fm) s -= fm;
  }
  // Winged sandals: your heroes have +1 Speed in rounds you don't hold the Fate token.
  if (c.kind === "hero" && st.fate !== i && crownIs(st, i, "perseus")) s += 1;
  // Growl: -1 Speed to every enemy card in the round after the Minotaur growls.
  if (st.sides[i].flags.growlRound === st.round) s -= 1;
  // Hurl the boulder: -1 Speed in the round after the hit.
  if (c.flags.slowRound === st.round) s -= 1;
  // The Wolf's Shortcut: +1 Speed to your heroes for 3 rounds.
  if (c.kind === "hero" && (st.sides[i].flags.shortcutUntil || 0) >= st.round) s += 1;
  // Hard frost: in rounds when the Snow Queen's side holds the Fate token, every enemy card has -2 Speed.
  if (crownIs(st, 1 - i, "the-snow-queen") && st.fate === 1 - i) s -= 2;
  return Math.max(1, s);
}

// Health bonuses from bonds are set once, at the start of the fight.
function applyStartingHealth(st) {
  for (const i of [0, 1]) {
    const f = bondFactor(st, i);
    for (const c of cards(st, i)) {
      let bonus = 0;
      if (f && c.kind === "hero") {
        for (const src of heroes(st, i)) {
          if (src.id === "lancelot" && isRealm(st, c, "Albion")) bonus += f;
          if (src.id === "baba-yaga" && src.uid !== c.uid) bonus -= 2 * f;
        }
        if (c.id === "koschei") bonus += f * countRealm(st, c, "Rus'");
        if (c.id === "gretel") bonus += f * countRealm(st, c, "Märchen");
      }
      if (c.kind === "hero" && crownIs(st, i, "guinevere")) bonus += 1;
      if (c.kind === "front" && crownIs(st, i, "polyphemus")) bonus += 2;
      if (bonus) {
        c.maxHealth = Math.max(1, c.maxHealth + bonus);
        c.health = Math.max(1, Math.min(c.maxHealth, c.health + bonus));
      }
    }
  }
}

// ---------- healing ----------
export function heal(st, src, target, amount, opts = {}) {
  if (!target || target.dead || target.removed) return 0;
  if (isNight(st) && !opts.ignoreNight) return 0;
  if (target.noHeal) return 0;
  if (target.flags.noHealRound === st.round) return 0;
  let amt = amount;
  if (src && !opts.flat) {
    const i = src.side, f = bondFactor(st, i);
    if (f) {
      const guin = heroes(st, i).find((h) => h.id === "guinevere");
      if (guin) amt += f * heroes(st, i).filter((h) => isRealm(st, h, "Albion")).length;
      if (src.id === "the-princess") amt += f * countRealm(st, src, "Albion");
      if (src.id === "vasilisa-the-wise" && countRealm(st, src, "Rus'") > 0) amt += f;
    }
  }
  if (crownIs(st, 0, "van-helsing")) amt -= 1;
  if (crownIs(st, 1, "van-helsing")) amt -= 1;
  amt = Math.max(0, amt);
  const cap = target.id === "baba-yaga" ? Math.max(target.maxHealth, target.health) : target.maxHealth;
  const before = target.health;
  target.health = Math.min(cap, target.health + amt);
  const gain = target.health - before;
  if (gain > 0) log(st, `${src?.name || "Healing"} heals ${sideName(target.side)} ${target.name} for ${gain}.`);
  if (gain > 0) ev(st, { t: "heal", src: uidOf(src), item: src?.item, tgt: target.uid, amt: gain, hp: target.health });
  return gain;
}

// ---------- targeting ----------
// Closest enemy row: front rank, then heroes in 2–3, then the Crown.
// Enemy rows, closest first, as melee reaches them. A full row shields the rows behind it; a gap in a row lets
// melee through to the row behind as well. So with an empty front-rank slot the heroes in slots 2 and 3 can be
// struck alongside the front rank, and with an empty hero slot too, so can the Crown in slot 1.
function enemyRows(st, attackerSide) {
  const foe = 1 - attackerSide, back = at(st, foe, 1);
  const layers = [[4, 5, 6].map((s) => at(st, foe, s)).filter(Boolean), [2, 3].map((s) => at(st, foe, s)).filter(Boolean), back ? [back] : []];
  const full = [3, 2, 1], rows = [];
  let cur = [];
  layers.forEach((layer, i) => {
    cur = cur.concat(layer);
    if (layer.length >= full[i] || i === layers.length - 1) { if (cur.length) rows.push(cur); cur = []; }
  });
  return rows;
}
export function closestRow(st, attackerSide) { return enemyRows(st, attackerSide)[0] || []; }
// A card in slot 1 can't melee the enemy while both of its hero slots (2 and 3) hold a hero: the same condition
// that shields it from enemy melee. Once either slot is empty it fights, and can be fought, in the open.
export function crownBlocked(st, c) {
  return c.kind === "hero" && c.slot === 1 && [2, 3].every((s) => at(st, c.side, s)?.kind === "hero");
}
export function meleeTargets(st, attacker) {
  if (crownBlocked(st, attacker)) return [];
  const rows = enemyRows(st, attacker.side);
  if (!rows.length) return [];
  let out = rows[0];
  if (crownIs(st, attacker.side, "bran-the-blessed") && rows[1]) out = out.concat(rows[1]);
  return out;
}
export function rangedTargets(st, attacker, opts = {}) {
  const foe = 1 - attacker.side;
  return cards(st, foe).filter((c) => !(c.id === "the-wolf" && hasBond(st, c) &&
    otherHeroes(st, c, (h) => isRealm(st, h, "Märchen")).length > 0) && (opts.spell || !inLabyrinth(st, c)));
}
// The Labyrinth: enemy Ranged attacks can't reach the Minotaur's side's heroes in slots 2 and 3.
export function inLabyrinth(st, c) { return c.kind === "hero" && (c.slot === 2 || c.slot === 3) && crownIs(st, c.side, "the-minotaur"); }
// The wooden horse: in round 1, every card under an Odysseus Crown except Odysseus is hidden from the enemy.
export function isHidden(st, c) { return isBlind(st, c) || (!!c && st.round === 1 && c.id !== "odysseus" && crownIs(st, c.side, "odysseus")); }
// A card on a blind side that hasn't yet shown itself: the other side can't see it or target it.
export function isBlind(st, c) { return !!c && !!st.sides[c.side]?.blind && !c.flags.seen; }
const visibleTo = (st, side, list) => list.filter((c) => !c || c.side === side || !isBlind(st, c));
// Royal decree makes every action cost 1 more action point.
export function apCost(st, c, act) { return act.ap + (st.sides[c.side].flags.decreeRound === st.round ? 1 : 0); }
function reachable(st, attacker, ranged) { return ranged ? rangedTargets(st, attacker) : meleeTargets(st, attacker); }

// ---------- damage ----------
// opts: { attack: bool, ranged: bool, spell: bool, ignoreGuard: bool, noRedirect: bool }
export function damage(st, src, target, amount, opts = {}) {
  if (!target || target.dead || target.removed) return 0;
  let t = target;
  const atk = !!opts.attack;
  const tSide = t.side;
  // Redirects (attacks only)
  if (atk && !opts.noRedirect) t = redirect(st, src, t, opts);
  if (!t) return 0;
  if (t !== target) ev(st, { t: "redirect", src: uidOf(src), from: target.uid, to: t.uid });
  const style = styleOf(opts);
  // Nobody: the first attack aimed at Odysseus this round misses, and the attacker takes 1.
  if (atk && t.flags.nobodyRound === st.round) {
    t.flags.nobodyRound = -1;
    log(st, `${src ? src.name + "'s" : "The"} attack on Odysseus misses: "Nobody" is there.`);
    ev(st, { t: "miss", src: uidOf(src), tgt: t.uid, style });
    if (src && src.uid != null && !src.dead) applyHealthLoss(st, t, src, 1, {});
    return 0;
  }
  // Mirrored shield: the first attack aimed at Perseus this round goes back to the attacker.
  if (atk && t.flags.reflectRound === st.round && src && src.uid != null && !src.dead) {
    t.flags.reflectRound = -1;
    log(st, `Perseus's mirrored shield turns ${src.name}'s attack back on it.`);
    ev(st, { t: "redirect", src: uidOf(src), from: t.uid, to: src.uid });
    return damage(st, t, src, amount, {});
  }
  // Stony gaze: a melee attack on a Medusa Crown costs the attacking hero 1 Speed for the fight.
  if (atk && !opts.ranged && !opts.spell && t.id === "medusa" && crownIs(st, t.side, "medusa") && src?.kind === "hero" && src.side !== t.side && !src.flags.gazed) {
    src.flags.gazed = true; src.speedPerm -= 1; log(st, `${src.name} meets Medusa's gaze and slows (-1 Speed).`);
    ev(st, { t: "debuff", kind: "gaze", src: t.uid, tgt: src.uid, text: "−1 Speed" });
  }
  // Misses and immunities
  if (atk && t.id === "rhiannon" && crownIs(st, t.side, "rhiannon") && src && speedOf(st, src) < speedOf(st, t) &&
      t.flags.missRound !== st.round) {
    t.flags.missRound = st.round;
    log(st, `${src.name}'s attack on Rhiannon misses.`);
    ev(st, { t: "miss", src: uidOf(src), tgt: t.uid, style });
    return 0;
  }
  if (t.flags.shieldRound === st.round) { log(st, `${t.name} is shielded and takes no damage.`); ev(st, { t: "hit", src: uidOf(src), item: src?.item, tgt: t.uid, style, dmg: 0, shielded: true, hp: t.health }); return 0; }
  let amt = amount, saved = 0, guarded = 0;
  if (atk && src) {
    const s = src.side, f = bondFactor(st, s);
    if (crownIs(st, s, "gretel") && ["Witch", "Beast", "Slayer"].includes(t.aspect)) amt += 1;
    if (crownIs(st, s, "the-wolf") && injured(t)) amt += 1;
    if (crownIs(st, s, "the-huntsman") && st.marks[`hunt${s}`] === t.uid) amt += 1;
    if (st.marks[`wanted${s}`] === t.uid) amt += 1;
    // Bonds help melee only: the Dragon's +1 against Slayers doesn't add to ranged attacks or spells (Fire Breath).
    if (f && !opts.ranged && !opts.spell && heroes(st, s).some((h) => h.id === "the-dragon") && t.aspect === "Slayer") amt += f;
    if (src.flags.giantSword === st.round) { amt += 3; opts = { ...opts, ignoreGuard: true }; src.flags.giantSword = -1; }
    if (opts.ranged && crownIs(st, t.side, "grendels-mother") && t.kind === "hero") amt -= 2;
  }
  if (opts.spell && src) {
    const f = bondFactor(st, src.side);
    if (f) {
      // Merlin's Bond: his Spells deal +1 to Beasts, Witches and Tricksters.
      if (src.id === "merlin" && ["Beast", "Witch", "Trickster"].includes(t.aspect)) amt += f;
      // Morgan's Bond: her Spells deal +1 to Sovereigns, Guardians and Slayers.
      if (src.id === "morgan-le-fay" && ["Sovereign", "Guardian", "Slayer"].includes(t.aspect)) amt += f;
    }
  }
  amt = Math.max(0, amt);
  if (atk && crownIs(st, t.side, "maid-marian") && st.fate === t.side) amt = Math.ceil(amt / 2);
  if (atk && t.kind === "hero" && crownIs(st, t.side, "st-george") && t.flags.georgeRound !== st.round) {
    t.flags.georgeRound = st.round;
    const blocked = Math.min(1, amt);
    amt -= blocked; saved = blocked;
    if (blocked) log(st, `St George blocks ${blocked} damage to ${t.name}.`);
  }
  const ignoreGuard = opts.ignoreGuard || (atk && src && crownIs(st, src.side, "beowulf"));
  if (!ignoreGuard && t.guardLeft > 0 && !opts.trueDamage) {
    const g = Math.min(t.guardLeft, amt);
    t.guardLeft -= g; amt -= g; guarded = g;
    if (amt <= 0 && g > 0) log(st, `${sideName(t.side)} ${t.name}'s Guard blocks ${src ? src.name + "'s hit" : "the damage"}.`);
  }
  if (amt <= 0) { ev(st, { t: "hit", src: uidOf(src), item: src?.item, tgt: t.uid, style, dmg: 0, guarded, saved, hp: t.health }); return 0; }
  return applyHealthLoss(st, src, t, amt, { ...opts, _style: style, _guarded: guarded, _saved: saved });
}

function redirect(st, src, t, opts) {
  const side = t.side;
  // The Renfield guard: takes the next hit aimed at your crown.
  const crown = crownCard(st, side);
  if (crown && t.uid === crown.uid) {
    const ren = heroes(st, side).find((h) => h.flags.guardCrownRound === st.round && h.uid !== t.uid);
    if (ren) { ren.flags.guardCrownRound = -1; log(st, `${ren.name} takes the hit meant for the crown.`); return ren; }
  }
  // Tin Soldier: takes the first attack aimed at any other of your heroes.
  if (t.kind === "hero") {
    const tin = heroes(st, side).find((n) => n.uid !== t.uid && n.id === "the-tin-soldier" && n.flags.steadfastRound >= st.round - 1 && n.flags.steadfastUsed !== st.round);
    if (tin) { tin.flags.steadfastUsed = st.round; log(st, `The Tin Soldier steps in front of ${t.name}.`); return tin; }
  }
  // Little John's bond: first attack each round on another Albion hero.
  if (t.kind === "hero" && isRealm(st, t, "Albion") && t.id !== "little-john") {
    const lj = heroes(st, side).find((h) => h.id === "little-john");
    if (lj && hasBond(st, lj) && bondFactor(st, side) > 0 && st.sides[side].flags.johnRound !== st.round) {
      st.sides[side].flags.johnRound = st.round;
      log(st, `Little John takes the blow meant for ${t.name}.`);
      return lj;
    }
  }
  // Leshy: the first attack each round aimed at another card of yours.
  const leshy = cards(st, side).find((c) => c.id === "leshy" && c.uid !== t.uid);
  if (leshy && st.sides[side].flags.leshyRound !== st.round) {
    st.sides[side].flags.leshyRound = st.round;
    log(st, `The Leshy takes the attack meant for ${t.name}.`);
    return leshy;
  }
  return t;
}

const noCheating = (st) => anyCrown(st, "van-helsing");

function applyHealthLoss(st, src, t, amt, opts = {}) {
  const side = t.side;
  // Koschei's hidden death
  if (t.id === "koschei" && !opts.nightfall) {
    const needle = cards(st, side).find((c) => c.id === "the-needle");
    if (needle && t.health - amt < 1) amt = t.health - 1;
  }
  if (t.health - amt <= 0 && t.kind === "hero") {
    // The Dragon's crown: he swaps in and takes the hit (once).
    const dragon = crownCard(st, side);
    if (dragon && dragon.id === "the-dragon" && dragon.uid !== t.uid && !st.sides[side].flags.dragonSwapped && !opts.nightfall) {
      st.sides[side].flags.dragonSwapped = true;
      const s1 = dragon.slot, s2 = t.slot;
      st.sides[side].slots[s1] = t; st.sides[side].slots[s2] = dragon;
      t.slot = s1; dragon.slot = s2;
      st.sides[side].crownUid = t.uid;
      log(st, `The Dragon swaps in to save ${t.name}, who becomes the Crown.`);
      ev(st, { t: "swap", a: t.uid, b: dragon.uid, side });
      return applyHealthLoss(st, src, dragon, amt, opts);
    }
    // Shape-shifter: a Loki Crown survives his first death on 1 Health and hands the Crown to his highest-Health hero.
    if (t.id === "loki" && crownIs(st, side, "loki")) t.flags.woreCrown = true;
    if (t.id === "loki" && crownIs(st, side, "loki") && !st.sides[side].flags.lokiShifted && !opts.nightfall && !noCheating(st)) {
      st.sides[side].flags.lokiShifted = true;
      t.health = 1;
      log(st, `Loki shifts his shape and slips away on 1 Health.`);
      ev(st, { t: "hit", src: uidOf(src), item: src?.item, tgt: t.uid, style: opts._style || "effect", dmg: amt, hp: 1, survived: true });
      const heir = heroes(st, side).filter((h) => h.uid !== t.uid).sort((p, q) => q.health - p.health)[0];
      if (heir) { swapCrown(st, side, heir); log(st, `${heir.name} is left holding the Crown.`); }
      return amt;
    }
    if (!noCheating(st)) {
      if (crownIs(st, side, "vasilisa-the-wise") && !st.sides[side].flags.vasilisaUsed) {
        st.sides[side].flags.vasilisaUsed = true;
        t.health = 2; log(st, `${t.name} survives on 2 Health (Vasilisa).`);
        ev(st, { t: "hit", src: uidOf(src), item: src?.item, tgt: t.uid, style: opts._style || "effect", dmg: amt, hp: 2, survived: true });
        const back = st.sides[side].grave.find((c) => c.kind === "front" && !at(st, side, c.slot));
        if (back) { revive(st, back, 1); log(st, `The doll also brings ${back.name} back on 1 Health.`); revived(st, back); }
        return amt;
      }
      if (t.id === "red-riding-hood" && hasBond(st, t) && !t.flags.survived &&
          otherHeroes(st, t, (h) => h.aspect === "Slayer").length) {
        t.flags.survived = true;
        t.health = 3; log(st, `Red Riding Hood survives on 3 Health.`);
        ev(st, { t: "hit", src: uidOf(src), item: src?.item, tgt: t.uid, style: opts._style || "effect", dmg: amt, hp: 3, survived: true }); return amt;
      }
    }
  }
  t.health -= amt;
  log(st, `${src ? src.name : "Nightfall"} deals ${amt} to ${sideName(side)} ${t.name}${t.health <= 0 ? " — it dies" : ""}.`);
  ev(st, { t: "hit", src: uidOf(src), item: src?.item, tgt: t.uid, dmg: amt, hp: Math.max(0, t.health),
    style: opts._style || (opts.nightfall ? "night" : src?.name === "Poison" ? "poison" : "effect"),
    guarded: opts._guarded || 0, saved: opts._saved || 0 });
  if (src && opts.attack && src.kind === "hero" && crownIs(st, src.side, "dracula")) heal(st, null, src, 1, { flat: true });
  if (t.health <= 0) kill(st, t, src);
  return amt;
}

// The Crown moves: the old Crown and the new one swap slots, and the new one becomes the Crown.
function swapCrown(st, side, heir) {
  const s = st.sides[side], old = crownCard(st, side);
  if (old && old.id === "loki") old.flags.woreCrown = true;
  if (!old || !heir || old.uid === heir.uid) return false;
  const s1 = old.slot, s2 = heir.slot;
  s.slots[s1] = heir; s.slots[s2] = old; heir.slot = s1; old.slot = s2;
  s.crownUid = heir.uid;
  ev(st, { t: "swap", a: heir.uid, b: old.uid, side });
  return true;
}

export function kill(st, t, src) {
  if (t.dead) return;
  t.dead = true; t.health = 0;
  ev(st, { t: "death", uid: t.uid, side: t.side, slot: t.slot });
  const side = st.sides[t.side];
  side.grave.push(t);
  onDeath(st, t, src);
}

function onDeath(st, t, src) {
  const i = t.side;
  if (t.kind === "front") {
    const s = 1 - i;
    // Athenian tribute: each enemy front-rank death heals your heroes 1.
    const minos = crownIs(st, s, "king-minos") ? crownCard(st, s) : null;
    if (minos) for (const h of heroes(st, s)) heal(st, minos, h, 1);
    // Lord of the Labyrinth: each enemy front-rank death heals your Beast heroes 3.
    const lord = heroes(st, s).find((h) => h.id === "king-minos");
    if (lord && bondFactor(st, s) > 0) for (const h of heroes(st, s)) if (h.aspect === "Beast") heal(st, lord, h, 3);
    return;
  }
  if (t.kind !== "hero") return;
  // Andvari's curse: Fafnir's killer gains 3 Poison.
  if (t.id === "fafnir" && bondFactor(st, i) > 0) {
    let k = src && src.uid != null && src.side === 1 - i && !src.dead ? src : null;
    if (!k) { const hs = heroes(st, 1 - i); k = hs.length ? st.rng.pick(hs) : null; }
    if (k) {
      log(st, `Andvari's curse falls on ${k.name}.`);
      ev(st, { t: "debuff", kind: "curse", src: t.uid, tgt: k.uid, text: "Andvari's curse" });
      k.poison += 3;
    }
  }
  // Unbound: Loki comes back two upkeeps later (not as a fallen Crown: that fight is over).
  if (t.id === "loki" && bondFactor(st, i) > 0 && !t.flags.unboundUsed && st.sides[i].crownUid !== t.uid) {
    t.flags.unboundUsed = true; t.flags.returnRound = st.round + 2;
    log(st, `Loki is bound, but not for long.`);
  }
  // Fed on tribute: when the Minotaur kills an enemy hero, your other Hellas heroes heal 1.
  if (src && src.id === "the-minotaur" && src.side !== i && !src.dead && bondFactor(st, src.side) > 0)
    for (const h of heroes(st, src.side)) if (h.uid !== src.uid && isRealm(st, h, "Hellas")) heal(st, src, h, 1);
  // Released from the Wolf
  if (t.id === "the-wolf") {
    for (const s of st.sides) {
      for (const v of s.swallowed.filter((x) => x.by === t.uid)) {
        if (noCheating(st)) continue;
        const slot = v.card.slot;
        if (!at(st, v.card.side, slot)) {
          v.card.removed = false; v.card.health = 1; st.sides[v.card.side].slots[slot] = v.card;
          log(st, `${v.card.name} comes back out of the Wolf on 1 Health.`);
        }
      }
      s.swallowed = s.swallowed.filter((x) => x.by !== t.uid);
    }
  }
  // Bonds that react to deaths, on both sides
  for (const side of [0, 1]) {
    const f = bondFactor(st, side);
    if (!f) continue;
    for (const h of heroes(st, side)) {
      const mine = side === i;
      if (h.id === "beowulf" && t.aspect === "Beast") h.atkBond += f;
      // The dragon's heart: any Beast's death gives Sigurd +1 Attack and +1 Speed.
      if (h.id === "sigurd" && t.aspect === "Beast") { h.atkBond += f; h.speedPerm += f; log(st, `Sigurd tastes the dragon's heart: +1 Attack, +1 Speed.`); }
      if (!mine) continue;
      if (h.id === "maid-marian" && isRealm(st, t, "Albion") && !h.flags.marianDone) {
        h.flags.marianDone = true; h.atkBond += 2 * f; h.speedPerm += f;
      }
      if (h.id === "st-george") {
        if (t.aspect === "Beast" && !h.flags.georgeBeast) { h.flags.georgeBeast = true; h.guardIntoAtk += f * Math.max(0, guardOf(st, h) - (h.flags.courtGuardRound === st.round ? 1 : 0)); if (f > 0) { h.noGuard = true; h.guardLeft = 0; log(st, `St George gives up his Guard: his Attack is now ${attackOf(st, h)}.`); } }
        if (t.aspect === "Healer" && !h.flags.georgeHealer) { h.flags.georgeHealer = true; h.atkMult = f > 0 ? 2 : 1; }
      }
      if (h.id === "grendels-mother" && t.id === "grendel") { h.atkBond += 3 * f; h.speedFixed = 3; }
      if (h.id === "the-creature" && isRealm(st, t, "Gothic")) {
        h.flags.gothicDeaths = (h.flags.gothicDeaths || 0) + 1;
        if (h.flags.gothicDeaths === 1) h.atkBond += 2 * f;
        if (h.flags.gothicDeaths === 2) { h.atkBond += 2 * f; h.speedPerm += f; }
      }
      if (h.id === "dracula" && isRealm(st, t, "Gothic")) heal(st, h, h, 4 * f > 0 ? 4 : 0, { flat: true });
    }
    if (side === i && t.id === "the-little-mermaid") {
      for (const h of heroes(st, side)) if (isRealm(st, h, "Eventyr")) heal(st, t, h, 3);
    }
  }
}

// ---------- stopping a card from acting ----------
function stop(st, target, why) {
  if (!target || target.dead) return false;
  if (crownIs(st, target.side, "the-tin-soldier") && target.kind === "hero") { log(st, `${target.name} can't be stopped (Tin Soldier).`); return false; }
  if (target.stoppedRound === st.round - 1) { log(st, `${target.name} was stopped last round, so it can't be stopped again.`); return false; }
  target.stopNow = true; target.stoppedRound = st.round;
  log(st, `${target.name} is stopped (${why}).`);
  ev(st, { t: "stop", tgt: target.uid, why });
  return true;
}

// Fire Breath: two different enemy cards, chosen at random when it resolves (one if only one is left).
function fireTargets(st, a) {
  const pool = cards(st, 1 - a.side).filter((c) => !inLabyrinth(st, c)), out = [];
  while (out.length < 2 && pool.length) out.push(pool.splice(st.rng.int(pool.length), 1)[0]);
  return out;
}

// A card stopped last round can't be stopped again this round, so it isn't offered as a target.
export function canBeStopped(st, c) { return c.stoppedRound !== st.round - 1; }

// ---------- upkeep ----------
export function upkeep(st) {
  ev(st, { t: "phase", name: "upkeep" });
  const upkeepBefore = snapStats(st);
  st.round += 1;
  st.marks = {};
  // A blind side can't hide for ever: from its reveal round, every card still hidden shows itself.
  for (const side of st.sides) if (side.blind && side.revealRound != null && st.round >= side.revealRound)
    for (const c of cards(st, side.index)) if (!c.flags.seen) { c.flags.seen = true; log(st, `${c.name} is revealed.`); ev(st, { t: "reveal", uid: c.uid }); }
  // Fate token
  const ren0 = crownIs(st, 0, "renfield"), ren1 = crownIs(st, 1, "renfield");
  if (st.fixedFate != null) st.fate = st.fixedFate;
  else if (ren0 && !ren1) st.fate = 0; else if (ren1 && !ren0) st.fate = 1; else if (st.round > 1) st.fate = 1 - st.fate;
  for (const i of [0, 1]) {
    // Galvanism: a flat +1 action point while Victor wears the Crown.
    st.sides[i].ap = (st.sides[i].baseAp ?? BASE_AP) + (crownIs(st, i, "victor-frankenstein") ? 1 : 0);
    // Hold court last round: +1 action point (never more than one).
    if (st.sides[i].flags.courtApRound === st.round) st.sides[i].ap += 1;
    st.sides[i].flags.itemApExtra = 0;
  }
  // Blodeuwedd's change at nightfall comes first
  if (st.round === NIGHTFALL && !st.noNight) {
    for (const c of allCards(st)) if (c.id === "blodeuwedd" && !c.flags.night) {
      c.flags.night = true; c.maxHealth = c.baseHealth * 2; c.health = c.maxHealth; c.baseAtk *= 2;
      log(st, `Blodeuwedd becomes the owl: 14 Health, Attack 4.`);
    }
  }
  // Guard refreshes
  for (const c of allCards(st)) { c.guardLeft = guardOf(st, c); c.stopNow = false; }
  // Nightfall damage and Poison (ignore Guard)
  if (isNight(st)) {
    const n = st.round - NIGHTFALL + 1;
    for (const c of allCards(st)) applyHealthLoss(st, null, c, n, { nightfall: true });
  }
  // Poison halves after each tick (rounded down), so it ends after it deals 1.
  // Steadfast: Poison doesn't work on heroes under a Tin Soldier Crown.
  for (const c of allCards(st)) if (c.poison > 0 && c.kind === "hero" && crownIs(st, c.side, "the-tin-soldier")) c.poison = 0;
  for (const c of allCards(st)) if (c.poison > 0) { const p = c.poison; c.poison = Math.floor(p / 2); applyHealthLoss(st, { name: "Poison", side: -1 }, c, p, {}); }
  // Unbound: Loki breaks free and lashes every enemy card for 1.
  for (const i of [0, 1]) {
    for (const c of st.sides[i].grave.slice()) {
      if (c.id !== "loki" || c.flags.returnRound !== st.round || noCheating(st) || at(st, i, c.slot)) continue;
      c.flags.returnRound = null; c.flags.unbound = true;
      revive(st, c, 3); log(st, `Loki breaks his bonds and returns on 3 Health.`); revived(st, c);
      // He takes back a Crown he wore earlier in the fight.
      if (c.flags.woreCrown && crownCard(st, i) && crownCard(st, i).uid !== c.uid && !st.sides[i].noCrown) { swapCrown(st, i, c); log(st, `Loki takes the Crown back.`); }
      for (const x of cards(st, 1 - i)) applyHealthLoss(st, c, x, 1, {});
    }
  }
  // Crown passives at upkeep
  for (const i of [0, 1]) {
    const crown = crownCard(st, i);
    if (!crown || !crownActive(st, i)) continue;
    const foe = 1 - i;
    switch (crown.id) {
      case "blodeuwedd": {
        for (const h of heroes(st, i)) if (h.uid !== crown.uid) { crown.guardLeft += h.guardLeft; h.guardLeft = 0; }
        break;
      }
      case "the-princess": { const c = st.rng.pick(cards(st, i)); heal(st, crown, c, 1); break; }
      case "red-riding-hood": {
        const c = cards(st, i).filter(injured).sort((a, b) => (b.maxHealth - b.health) - (a.maxHealth - a.health))[0];
        if (c) heal(st, crown, c, 2);
        break;
      }
      case "grendel": {
        const fr = cards(st, foe).filter((c) => c.kind === "front").sort((a, b) => a.health - b.health)[0];
        if (fr) damage(st, crown, fr, 1, {});
        break;
      }
      case "circe": {
        if (st.fate !== i) break;
        const fr = cards(st, foe).filter((c) => c.kind === "front");
        for (const c of fr) c.flags.swineRound = st.round;
        if (fr.length) { log(st, `Circe turns ${sideName(foe)}'s front rank into swine: 0 Attack this round.`); ev(st, { t: "debuff", kind: "swine", src: crown.uid, tgts: fr.map((c) => c.uid), text: "Swine: 0 Attack" }); }
        break;
      }
      case "friar-tuck": {
        const side = st.sides[i];
        side.flags.tuckReturns = side.flags.tuckReturns || 0;
        if (side.flags.tuckReturns < 2 && !isNight(st) && !noCheating(st)) {
          const dead = side.grave.find((c) => c.kind === "front" && !at(st, i, c.slot));
          if (dead) { revive(st, dead, 1); side.flags.tuckReturns++; log(st, `Friar Tuck brings ${dead.name} back on 1 Health.`); revived(st, dead); }
        }
        break;
      }
    }
  }
  // Bonds at upkeep
  for (const i of [0, 1]) {
    const f = bondFactor(st, i);
    if (!f) continue;
    for (const h of heroes(st, i)) {
      if (h.id === "victor-frankenstein") {
        for (const c of heroes(st, i)) if (c.uid === h.uid || isRealm(st, c, "Gothic")) heal(st, h, c, 2 * f > 0 ? 2 : 0, { flat: f < 0 });
      }
      if (h.id === "grendel" && heroes(st, i).some((x) => x.id === "grendels-mother")) heal(st, h, h, f > 0 ? 1 : 0);
    }
  }
  // Men of Ithaca: Villagers fill empty front-rank slots while uses last.
  for (const i of [0, 1]) {
    const side = st.sides[i];
    if (!(side.flags.ithacaLeft > 0) || !heroes(st, i).some((h) => h.id === "odysseus") || bondFactor(st, i) <= 0) continue;
    for (const slot of [4, 5, 6]) {
      if (side.flags.ithacaLeft <= 0 || at(st, i, slot)) continue;
      const v = makeFront(st.data.front.villager, i, slot);
      if (crownIs(st, i, "polyphemus")) { v.maxHealth += 2; v.health += 2; }
      v.guardLeft = guardOf(st, v);
      side.slots[slot] = v; side.flags.ithacaLeft--;
      log(st, `A man of Ithaca steps into ${sideName(i)}'s front rank.`);
    }
  }
  diffStats(st, upkeepBefore, null);
  checkWin(st);
}

function revive(st, c, health) {
  const side = st.sides[c.side];
  c.dead = false; c.removed = false; c.health = health;
  side.grave = side.grave.filter((x) => x.uid !== c.uid);
  side.slots[c.slot] = c;
  if (crownIs(st, c.side, "gwydion")) { c.maxHealth += 2; c.health += 2; c.atkPerm += 1; }
}
// The revive event goes after the log line that explains it.
const revived = (st, c) => ev(st, { t: "revive", uid: c.uid, side: c.side, slot: c.slot, name: c.name, hp: c.health });

// ---------- win check ----------
export function checkWin(st) {
  if (st.over) return true;
  const lost = [0, 1].map((i) => {
    const side = st.sides[i];
    if (side.allMustFall) return cards(st, i).length === 0;
    if (side.noCrown) return heroes(st, i).length === 0;
    const crown = Object.values(side.slots).find((c) => c && c.uid === side.crownUid);
    return !crown || crown.dead;
  });
  if (lost[0] && lost[1]) { st.over = true; st.winner = -1; log(st, "Both crowns fall: a draw."); ev(st, { t: "over", winner: st.winner }); }
  else if (lost[0]) { st.over = true; st.winner = 1; log(st, "Red wins."); ev(st, { t: "over", winner: st.winner }); }
  else if (lost[1]) { st.over = true; st.winner = 0; log(st, "Blue wins."); ev(st, { t: "over", winner: st.winner }); }
  else if (st.round >= (st.maxRounds || MAX_ROUNDS)) { st.over = true; st.winner = -1; log(st, "Round limit reached: a draw."); ev(st, { t: "over", winner: st.winner }); }
  return st.over;
}

// ---------- actions ----------
// Each action has a target type the planner/UI uses and a resolver.
// Target types: none, self, enemyMelee, enemyAny, enemyHero, enemyHeroMelee, enemyHeroNotCrown, enemyFront,
// ally, allyHero, allyHeroOther, adjacentAllyHero, enemyAny2
const STD = { type: "attack" };
export const ACTIONS = {
  "baba-yaga": { "Pestle": { t: "enemyMelee", go: (st, a, x) => hit(st, a, x, 5) },
    "Skull fire": { t: "enemyAny", go: (st, a, x) => hit(st, a, x, 3, { ranged: true }) },
    "Mortar ride": { t: "enemyNotCrown", go: (st, a, x) => { log(st, `Baba Yaga rides her mortar onto ${x.name}.`); kill(st, x, a); a.health += 2; } } },
  "beowulf": { "Arm-wrench": { t: "enemyMelee", go: (st, a, x) => { hit(st, a, x, attackOf(st, a)); x.atkPerm -= 2; } },
    "Axe throw": { t: "enemyAny", go: (st, a, x) => hit(st, a, x, attackOf(st, a, { melee: false }), { ranged: true }) } },
  "blodeuwedd": { "Oak, broom and meadowsweet": { t: "none", go: (st, a) => { for (const h of heroes(st, a.side)) if (h.uid !== a.uid) h.guardLeft += 2; } } },
  "bran-the-blessed": { "Cauldron of rebirth": { t: "deadFront", go: (st, a, x) => { if (noCheating(st)) return; revive(st, x, x.maxHealth); log(st, `${x.name} rises from the Cauldron.`); revived(st, x); } } },
  "dracula": { "Claw": STD,
    "Bite": { t: "enemyHero23", go: (st, a, x) => { x.flags.bitten = true; const d = hit(st, a, x, attackOf(st, a)); heal(st, a, a, d); } },
    "Turn": { t: "enemyWeakNotCrown", go: (st, a, x) => {
      kill(st, x, a);
      const slot = [4, 5, 6].find((s) => !at(st, a.side, s));
      if (slot) {
        const th = makeFront({ id: "thrall", name: `Thrall ${x.name}`, health: 3, attack: x.baseAtk, guard: 0, auto: "Attacks the card opposite." }, a.side, slot);
        st.sides[a.side].slots[slot] = th;
        if (crownIs(st, a.side, "gwydion")) { th.maxHealth += 2; th.health += 2; th.atkPerm += 1; }
        log(st, `${x.name} rises as a Thrall for Dracula.`);
      }
    } } },
  "friar-tuck": { "Ale and bread": { t: "none", go: (st, a) => heroes(st, a.side).forEach((h) => heal(st, a, h, 2)) } },
  "grendel": { "Devour": { t: "enemyFrontWeak2", go: (st, a, x) => { kill(st, x, a); heal(st, a, a, 2); } } },
  "grendels-mother": { "Drag under": { t: "enemyHero23", go: (st, a, x) => hit(st, a, x, attackOf(st, a)) } },
  "gretel": { "Into the oven": { t: "enemyMelee", go: (st, a, x) => { hit(st, a, x, 4); if (!x.dead && x.aspect === "Witch" && x.health <= 6) { kill(st, x, a); log(st, `${x.name} goes into the oven.`); } } } },
  "guinevere": { "Queen's mercy": { t: "allyHero", go: (st, a, x) => heal(st, a, x, 3) } },
  "gwydion": { "Battle of the trees": { t: "emptyFront", go: (st, a) => {
      const slot = [4, 5, 6].find((s) => !at(st, a.side, s)); if (!slot) return;
      const tw = makeFront({ id: "tree-warrior", name: "Tree Warrior", health: 2, attack: 2, guard: 0, auto: "Attacks the card opposite." }, a.side, slot);
      st.sides[a.side].slots[slot] = tw;
      if (crownIs(st, a.side, "gwydion")) { tw.maxHealth += 2; tw.health += 2; tw.atkPerm += 1; }
      log(st, `Gwydion calls a Tree Warrior out of the forest.`);
    } },
    "Shape-shift": { t: "enemyFront", go: (st, a, x) => { x.flags.harmless = true; log(st, `${x.name} becomes a harmless animal.`); } } },
  "king-arthur": { "Excalibur": { t: "enemyMelee", go: (st, a, x) => hit(st, a, x, 5, { ignoreGuard: true }) } },
  "koschei": { "Whirlwind": { t: "enemyHeroNotCrown", go: (st, a, x) => {
    damage(st, a, x, 3, { attack: true });
    if (!x.dead && !crownIs(st, x.side, "the-tin-soldier")) {
      const other = x.slot === 2 ? 3 : 2; const side = st.sides[x.side]; const y = side.slots[other];
      side.slots[other] = x; side.slots[x.slot] = y && !y.dead ? y : null; if (y && !y.dead) y.slot = x.slot; x.slot = other;
    }
  } } },
  "lancelot": { "Champion's charge": { t: "enemyMelee", go: (st, a, x) => { hit(st, a, x, 5); const ec = crownCard(st, 1 - a.side); if (ec && !ec.dead && ec.uid !== x.uid) applyHealthLoss(st, a, ec, 1, {}); } } },
  "little-john": { "Quarterstaff": { t: "enemyMelee", go: (st, a, x) => { hit(st, a, x, 4); const n = neighbours(st, x)[0]; if (n) hit(st, a, n, 1); } } },
  "perseus": { "Mirrored shield": { t: "none", go: (st, a) => log(st, "Perseus holds up his mirrored shield.") },
    "Medusa's head": { t: "enemyHero", go: (st, a, x) => { if (stop(st, x, "turned to stone")) { x.guardLeft += 2; log(st, `${x.name} is stone: +2 Guard this round.`); } } } },
  "medusa": { "Serpent hair": { t: "none", go: (st, a) => {
      for (const x of fireTargets(st, a)) { x.poison += 2; log(st, `Medusa's serpents bite ${x.name}: 2 Poison.`); }
    } },
    "Petrify": { t: "enemyHero", go: (st, a, x) => stop(st, x, "Petrify") } },
  "odysseus": { "Nobody": { t: "none", go: (st, a) => log(st, `"My name is Nobody," says Odysseus.`) } },
  "polyphemus": { "Hurl the boulder": { t: "enemyAny", go: (st, a, x) => { hit(st, a, x, 4, { ranged: true }); if (!x.dead && x.kind === "hero") { x.flags.slowRound = st.round + 1; log(st, `${x.name} is slowed next round.`); ev(st, { t: "debuff", kind: "slow", src: a.uid, tgt: x.uid, text: "−1 Speed next round" }); } } } },
  "circe": { "Hex": { t: "enemySpell", go: (st, a, x) => damage(st, a, x, 2, { spell: true, attack: true, ranged: true, ignoreGuard: true }) },
    "Transfigure": { t: "enemyHero", go: (st, a, x) => { x.flags.transfigUntil = st.round + 1; log(st, `Circe transfigures ${x.name}: Attack 1 this round and next.`); ev(st, { t: "debuff", kind: "transfig", src: a.uid, tgt: x.uid, text: "Attack 1" }); } } },
  "king-minos": { "Royal decree": { t: "none", go: (st, a) => { const fs = st.sides[1 - a.side].flags; if (fs.decreeRound === st.round + 1) return; fs.decreeRound = st.round + 1; log(st, `King Minos decrees: next round, every ${sideName(1 - a.side)} action costs 1 more action point.`); ev(st, { t: "debuff", kind: "decree", src: a.uid, side: 1 - a.side, text: "Next round: +1 AP per action" }); } } },
  "the-minotaur": { "Growl": { t: "none", go: (st, a) => { st.sides[1 - a.side].flags.growlRound = st.round + 1; log(st, `The Minotaur growls: next round, every ${sideName(1 - a.side)} card has -1 Guard and -1 Speed.`); ev(st, { t: "debuff", kind: "growl", src: a.uid, tgts: cards(st, 1 - a.side).map((c) => c.uid), text: "−1 Guard, −1 Speed" }); } },
    "Gore": { t: "enemyMelee", go: (st, a, x) => hit(st, a, x, 5, { ignoreGuard: true }) } },
  "sigurd": { "Dig the pit": { t: "enemyHero", go: (st, a, x) => charge(st, a, x, "Gram from the pit", false) } },
  "fafnir": { "Deep breath": { t: "enemyAny", go: (st, a, x) => charge(st, a, x, "Dragon fire", true) } },
  "loki": { "Mistletoe": { t: "enemyAny", go: (st, a, x) => hit(st, a, x, 3, { ranged: true, ignoreGuard: true }) },
    "Crown thief": { t: "none", go: (st, a) => {
      const foe = 1 - a.side, old = crownCard(st, foe);
      if (!old || st.sides[foe].noCrown) { log(st, `Loki finds no Crown to steal.`); return; }
      const heir = heroes(st, foe).filter((h) => h.uid !== old.uid).sort((p, q) => q.health - p.health)[0];
      if (!heir || heir.health <= old.health) { log(st, `Loki's trick fails: ${old.name} already has the most Health.`); return; }
      swapCrown(st, foe, heir); log(st, `Loki slips the Crown from ${old.name} to ${heir.name}.`);
    } } },
  "maid-marian": { "Fair fight": { t: "enemyHeroMelee", go: (st, a, x) => { hit(st, a, x, 4); if (!x.dead && !x.flags.acted) stop(st, x, "Fair fight"); } } },
  "merlin": { "Hex": { t: "enemySpell", go: (st, a, x) => damage(st, a, x, 2, { spell: true, attack: true, ranged: true, ignoreGuard: true }) },
    "Enchanted sleep": { t: "enemyHero", go: (st, a, x) => stop(st, x, "Enchanted sleep") } },
  "morgan-le-fay": { "Hex": { t: "enemySpell", go: (st, a, x) => damage(st, a, x, 2, { spell: true, attack: true, ranged: true, ignoreGuard: true }) },
    "Stolen scabbard": { t: "enemyHero", go: (st, a, x) => { x.noGuard = true; x.guardLeft = 0; x.noHeal = true; log(st, `${x.name} loses its Guard and healing.`); } } },
  "red-riding-hood": { "Cake and wine": { t: "ally", go: (st, a, x) => heal(st, a, x, 4) } },
  "renfield": { "The master is at hand": { t: "none", go: (st, a) => { a.guardLeft += 2; a.flags.guardCrownRound = st.round; } },
    "Betrayal": { t: "enemyMelee", go: (st, a, x) => { hit(st, a, x, 6, { ignoreGuard: true }); a.guardLeft = 0; a.noGuard = true; a.health = Math.min(a.health, 1); log(st, "Renfield's betrayal leaves him on 1 Health."); } } },
  "rhiannon": { "The unhurried pace": { t: "enemyHero", go: (st, a, x) => { x.flags.speedOneRound = st.round; } } },
  "robin-hood": { "Split the Arrow": { t: "enemyAny", go: (st, a, x) => { const other = cards(st, 1 - a.side).filter((c) => c.uid !== x.uid && !inLabyrinth(st, c)); const y = other.length ? other[st.rng.int(other.length)] : null; hit(st, a, x, 2, { ranged: true }); if (y && !y.dead) hit(st, a, y, 2, { ranged: true }); } } },
  "rumpelstiltskin": { "Straw into gold": { t: "none", go: (st, a) => { const side = st.sides[a.side]; const it = side.usedItems.pop(); if (it) { side.items.push(it); log(st, `Rumpelstiltskin spins back ${itemName(st, it)}.`); } } } },
  "sheriff-of-nottingham": { "Wanted": { t: "enemyAny", go: (st, a, x) => { st.marks[`wanted${a.side}`] = x.uid; log(st, `${x.name} is Wanted.`); } },
    "Break their spirit": { t: "enemyHeroMelee", go: (st, a, x) => { hit(st, a, x, attackOf(st, a)); x.noGuard = true; x.guardLeft = 0; } } },
  "st-george": { "Lance Charge": { t: "enemyMelee", go: (st, a, x) => hit(st, a, x, 3, { ignoreGuard: true }) },
    "Shield Brother": { t: "adjacentAllyHero", go: (st, a, x) => { x.flags.shieldRound = st.round; } } },
  "the-bride": { "Completion": { t: "none", go: (st, a) => heroes(st, a.side).forEach((h) => heal(st, a, h, 4)) } },
  "the-creature": { "Rampage": { t: "enemyMelee", go: (st, a, x) => { const ns = neighbours(st, x); hit(st, a, x, 3); ns.forEach((n) => hit(st, a, n, 3)); } },
    "The Pyre": { t: "none", go: (st, a) => { cards(st, 1 - a.side).forEach((c) => damage(st, a, c, 6, { attack: true })); damage(st, null, a, 8, { trueDamage: true }); } } },
  "the-dragon": { "Fire Breath": { t: "none", go: (st, a) => { for (const x of fireTargets(st, a)) hit(st, a, x, 2, { ranged: true }); } },
    "Tail Sweep": { t: "enemyMelee", go: (st, a, x) => { const n = neighbours(st, x)[0]; hit(st, a, x, 2); if (n) hit(st, a, n, 2); } } },
  "the-huntsman": { "Stones in the belly": { t: "enemyAny", go: (st, a, x) => { hit(st, a, x, attackOf(st, a, { melee: false }), { ranged: true }); if (!x.dead) x.speedFixed = 1; } } },
  "the-little-mermaid": { "Sea magic": { t: "enemySpell", go: (st, a, x) => { damage(st, a, x, attackOf(st, a, { melee: false }), { spell: true, attack: true, ranged: true }); applyHealthLoss(st, { name: "The knives", side: -1 }, a, 1, {}); } },
    "Saved from the wreck": { t: "none", go: (st, a) => heroes(st, a.side).forEach((h) => heal(st, a, h, 4)) } },
  "the-princess": { "Mend": { t: "none", go: (st, a) => neighbours(st, a).forEach((n) => heal(st, a, n, 1)) },
    "Girdle Leash": { t: "enemyBeast", go: (st, a, x) => { (a.flags.leashed ||= []).push(x.uid); stop(st, x, "Girdle Leash"); } } },
  "the-snow-queen": { "Shard of the mirror": { t: "enemyHero", go: (st, a, x) => { x.flags.shardRound = st.round; x.flags.sharded = true; } } },
  "the-tin-soldier": { "Steadfast stand": { t: "none", go: (st, a) => { a.guardLeft += 2; a.flags.steadfastRound = st.round; } } },
  "the-wolf": { "Shortcut": { t: "none", go: (st, a) => { st.sides[a.side].flags.shortcutUntil = st.round + 2; log(st, "The Wolf knows a shortcut: your heroes have +1 Speed for 3 rounds."); } },
    "Swallow whole": { t: "enemyWolf", go: (st, a, x) => {
    x.removed = true; st.sides[x.side].slots[x.slot] = null; st.sides[x.side].swallowed.push({ by: a.uid, card: x });
    log(st, `The Wolf swallows ${x.name} whole.`);
  } } },
  "van-helsing": { "Blood transfusion": { t: "none", go: (st, a) => {
    applyHealthLoss(st, { name: "Blood transfusion", side: -1 }, a, 2, {});
    const others = heroes(st, a.side).filter((h) => h.uid !== a.uid);
    if (others.length) heal(st, a, st.rng.pick(others), 3);
  } } },
  "vasilisa-the-wise": { "The doll's advice": { t: "allyHero", go: (st, a, x) => { heal(st, a, x, 3); x.guardLeft += 1; } } },
  "victor-frankenstein": { "Reanimate": { t: "deadTalemate", go: (st, a, x) => {
    if (noCheating(st)) return;
    const slot = [2, 3].find((s) => !at(st, a.side, s)); if (!slot) return;
    x.slot = slot; revive(st, x, 3); log(st, `Victor reanimates ${x.name}.`); revived(st, x);
  } } },
  "zmey-gorynych": { "Heads grow back": { t: "none", go: (st, a) => heal(st, a, a, 6) } },
};

// A standard or named attack. Returns damage dealt.
function hit(st, a, x, amount, opts = {}) {
  let target = x;
  // Gram's edge: a Sigurd Crown's attacks ignore Guard.
  if (a.id === "sigurd" && crownIs(st, a.side, "sigurd")) opts = { ...opts, ignoreGuard: true };
  if (a.flags.shardRound === st.round) {
    const own = neighbours(st, a)[0];
    if (own) { log(st, `${a.name}'s attack turns on ${own.name} (Shard of the mirror).`); target = own; }
  }
  const d = damage(st, a, target, amount, { attack: true, ...opts });
  // Venom: a Fafnir Crown's attacks also give 1 Poison.
  if (a.id === "fafnir" && crownIs(st, a.side, "fafnir") && target && !target.dead && d > 0) {
    target.poison += 1; log(st, `Fafnir's venom: ${target.name} gains 1 Poison.`); ev(st, { t: "poison", src: a.uid, tgt: target.uid, amt: 1 });
  }
  if (a.id === "lancelot" && crownIs(st, a.side, "lancelot") && a.flags.chipRound !== st.round) {
    const ec = crownCard(st, 1 - a.side);
    if (ec) { a.flags.chipRound = st.round; applyHealthLoss(st, a, ec, 1, {}); }
  }
  return d;
}

function standardAttack(st, a, x) {
  if (a.id === "zmey-gorynych") {
    // Each head strikes for his Attack. Every head is its own hit, so Guard, Vulnerable and damage bonuses
    // apply to each one.
    const per = attackOf(st, a);
    if (crownIs(st, a.side, "zmey-gorynych")) {
      // Wearing the Crown: five heads at five random enemy cards anywhere, different cards while there are enough.
      const pool = cards(st, 1 - a.side).slice(), picks = [];
      while (picks.length < 5 && pool.length) picks.push(pool.splice(st.rng.int(pool.length), 1)[0]);
      while (picks.length && picks.length < 5) picks.push(st.rng.pick(picks));
      for (const y of picks) if (!y.dead) hit(st, a, y, per);
      return;
    }
    // Three heads: three strikes at the card he attacks.
    for (let k = 0; k < 3 && !x.dead; k++) hit(st, a, x, per, { ranged: a.ranged });
    return;
  }
  hit(st, a, x, attackOf(st, a), { ranged: a.ranged });
}

const CHARGE_DMG = 6;
// Charge: the hero spends this round winding up; next round, at its Speed, it strikes for CHARGE_DMG (Guard applies).
function charge(st, a, x, name, ranged) {
  a.flags.charge = { round: st.round + 1, tgt: x.uid, name, ranged };
  log(st, `${a.name} charges ${name} at ${x.name}: ${CHARGE_DMG} damage next round.`);
  ev(st, { t: "debuff", kind: "charge", src: a.uid, tgt: x.uid, text: `${name}: 8 next round` });
}
export const isCharging = (st, c) => !!c.flags.charge && c.flags.charge.round === st.round;
// Actions that stop a hero, so a hero stopped last round isn't offered as a target.
export const STOPPERS = ["Enchanted sleep", "Petrify", "Medusa's head"];
// Targets for an action, for the planner and the UI.
export function targetsFor(st, a, act) { return visibleTo(st, a.side, targetsForAll(st, a, act)); }
function targetsForAll(st, a, act) {
  if (act.court) return isCourt(st, a, act) ? [null] : [];
  const foe = 1 - a.side;
  const spec = ACTIONS[a.id]?.[act.name];
  const type = spec?.t ?? (a.ranged || act.text.includes("Ranged") ? "enemyAny" : "enemyMelee");
  // A standard melee attack from slot 1 may also be turned on your own heroes in slots 2–3.
  if (!spec?.t && type === "enemyMelee" && a.slot === 1) {
    return meleeTargets(st, a).concat([2, 3].map((x) => at(st, a.side, x)).filter((c) => c && c.kind === "hero"));
  }
  const eh = heroes(st, foe);
  switch (type) {
    case "none": return [null];
    case "emptyFront": return [4, 5, 6].some((x) => !at(st, a.side, x)) ? [null] : [];
    case "enemyMelee": return meleeTargets(st, a);
    case "enemyAny": case "enemyAny2": return rangedTargets(st, a);
    case "enemySpell": return rangedTargets(st, a, { spell: true });
    case "enemyHero": return STOPPERS.includes(act.name) ? eh.filter((c) => canBeStopped(st, c))
      : act.name === "Shard of the mirror" ? eh.filter((c) => !c.flags.sharded) : eh; // the Shard: once per hero
    case "enemyHeroMelee": { const m = meleeTargets(st, a).filter((c) => c.kind === "hero"); return m.length ? m : []; }
    case "enemyHeroNotCrown": return eh.filter((c) => c.uid !== st.sides[foe].crownUid);
    // Bite can only bite each hero once a fight.
    case "enemyHero23": return eh.filter((c) => (c.slot === 2 || c.slot === 3) && !(act.name === "Bite" && c.flags.bitten));
    case "enemyFront": return cards(st, foe).filter((c) => c.kind === "front");
    case "enemyFrontWeak2": return cards(st, foe).filter((c) => c.kind === "front" && c.health <= 2);
    case "enemyWeakNotCrown": return cards(st, foe).filter((c) => (c.kind === "front" || c.uid !== st.sides[foe].crownUid) && c.health <= 3 && !(c.kind === "hero" && c.uid === st.sides[foe].crownUid));
    case "enemyWolf": { const fr = closestRow(st, a.side).filter((c) => c.kind === "front"); return [...fr, ...eh.filter((c) => c.health <= 3 && c.uid !== st.sides[foe].crownUid)]; }
    case "enemyNotCrown": return closestRow(st, a.side).filter((c) => c.uid !== st.sides[foe].crownUid);
    // Girdle Leash: each enemy Beast can be leashed by the same Princess only once a fight.
    case "enemyBeast": return eh.filter((c) => c.aspect === "Beast" && canBeStopped(st, c) && !(a.flags.leashed || []).includes(c.uid));
    case "ally": return cards(st, a.side);
    case "allyHero": return heroes(st, a.side);
    case "adjacentAllyHero": return neighbours(st, a).filter((c) => c.kind === "hero");
    case "deadFront": return st.sides[a.side].grave.filter((c) => c.kind === "front" && !at(st, a.side, c.slot));
    case "deadTalemate": return st.sides[a.side].grave.filter((c) => c.kind === "hero" && c.uid !== a.uid && isTale(st, c, a.tale));
    default: return [];
  }
}

// Usable actions for a hero this round: [{ index, action, targets }]
export function options(st, a) {
  const side = st.sides[a.side];
  const out = [];
  if (isCharging(st, a)) return out;
  a.actions.forEach((act, index) => {
    if (act.usesPerFight && (a.uses[act.name] || 0) >= act.usesPerFight) return;
    if (apCost(st, a, act) > st.sides[a.side].ap) return;
    const targets = targetsFor(st, a, act);
    if (!targets.length) return;
    out.push({ index, action: act, targets });
  });
  return out;
}

// Items are free to use, except against Koschei, whose Crown makes them cost 1 action point.
// Rumpelstiltskin has 3 guesses a fight. He may name the same hero again, but not two rounds running.
export const RUMPEL_GUESSES = 3;
export function rumpelChoices(st, i) {
  const fl = st.sides[i].flags;
  if ((fl.rumpelGuesses || 0) >= RUMPEL_GUESSES) return [];
  return visibleTo(st, i, heroes(st, 1 - i)).filter((h) => !(fl.rumpelLast && fl.rumpelLast.uid === h.uid && fl.rumpelLast.round === st.round - 1));
}
export function itemCost(st, i) { return crownIs(st, 1 - i, "koschei") ? 1 : 0; }

export const ITEM_TARGETS = {
  "dragons-blood": "allyHero", "draught-of-the-cauldron": "deadHero", "gingerbread": "allyHero", "golden-apple": "allyHero",
  "mead-of-heorot": "none", "mead-of-poetry": "none", "poisoned-apple": "enemyHero", "skull-lantern": "enemyHero",
  "spindle": "enemyHero", "the-giants-sword": "allyHero", "water-of-life": "allyHero",
};
export function itemTargets(st, i, id) { return visibleTo(st, i, itemTargetsAll(st, i, id)); }
function itemTargetsAll(st, i, id) {
  switch (ITEM_TARGETS[id]) {
    case "none": return [null];
    case "allyHero": return heroes(st, i);
    case "enemyHero": return id === "spindle" ? heroes(st, 1 - i).filter((c) => canBeStopped(st, c)) : heroes(st, 1 - i);
    case "deadHero": return [2, 3].some((s) => !at(st, i, s)) ? st.sides[i].grave.filter((c) => c.kind === "hero") : [];
    default: return [];
  }
}

function useItem(st, i, id, x) {
  const side = st.sides[i];
  const k = side.items.indexOf(id); if (k < 0) return;
  side.items.splice(k, 1); side.usedItems.push(id);
  const src = { name: itemName(st, id), side: i, id: "item", item: id, flags: {} };
  log(st, `${sideName(i)} uses ${itemName(st, id)}${x ? ` on ${x.name}` : ""}.`);
  ev(st, { t: "item", side: i, item: id, name: itemName(st, id), tgt: uidOf(x) });
  const before = snapStats(st), hp0 = x ? x.health : 0;
  switch (id) {
    case "dragons-blood": x.guardLeft += 3; break;
    case "draught-of-the-cauldron": { if (noCheating(st)) break; const slot = [2, 3].find((s) => !at(st, i, s)); if (slot) { x.slot = slot; revive(st, x, 1); revived(st, x); } break; }
    case "gingerbread": heal(st, src, x, 2); break;
    case "golden-apple": heal(st, src, x, 3); x.poison = 0; break;
    case "mead-of-heorot": heroes(st, i).forEach((h) => heal(st, src, h, 2)); break;
    case "poisoned-apple": x.poison += 2; break;
    case "skull-lantern": damage(st, src, x, x.aspect === "Witch" ? 4 : 2, { spell: true }); break;
    case "spindle": stop(st, x, "Spindle"); break;
    case "the-giants-sword": x.flags.giantSword = st.round; break;
    case "water-of-life": x.health = Math.max(x.health, Math.min(20, x.maxHealth));
      if (x.health > hp0) ev(st, { t: "heal", item: id, tgt: x.uid, amt: x.health - hp0, hp: x.health }); break;
  }
  if (id === "the-giants-sword") ev(st, { t: "attackUp", item: id, tgt: x.uid, amt: 3 });
  diffStats(st, before, src);
}

// ---------- front-rank automatic actions ----------
function frontAct(st, c) {
  if (c.flags.frozenRound === st.round) { log(st, `${c.name} is frozen and skips its action.`); ev(st, { t: "skip", uid: c.uid, why: "frozen" }); return; }
  const foe = 1 - c.side;
  const seen = (x) => (x && !isBlind(st, x) ? x : null);
  const near = () => { const r = visibleTo(st, c.side, closestRow(st, c.side)); return r.length ? st.rng.pick(r) : null; };
  const opposite = () => (c.slot >= 4 ? seen(at(st, foe, c.slot)) : null) || near();
  const a = attackOf(st, c);
  switch (c.id) {
    case "berserker": { const x = opposite(); if (!x) return; const n = neighbours(st, x)[0]; damage(st, c, x, a, { attack: true }); if (n) damage(st, c, n, a, { attack: true }); return; }
    case "crossbowman": {
      const hs = heroes(st, foe).filter((h) => (h.slot === 2 || h.slot === 3) && !inLabyrinth(st, h)).sort((p, q) => p.health - q.health);
      const x = visibleTo(st, c.side, hs)[0] || opposite(); if (x) damage(st, c, x, a, { attack: true, ranged: true }); return;
    }
    case "longbowman": {
      const x = seen(crownCard(st, foe)) || seen(at(st, foe, 1)) || near();
      if (x) damage(st, c, x, a, { attack: true, ranged: true }); return;
    }
    case "grandmother": {
      const behind = { 4: [2], 5: [2, 3], 6: [3] }[c.slot] || [];
      const h = behind.map((s) => at(st, c.side, s)).filter(Boolean).sort((p, q) => p.health - q.health)[0];
      if (h) heal(st, c, h, 1); return;
    }
    case "monk": { const x = cards(st, c.side).filter(injured); if (x.length) heal(st, c, st.rng.pick(x), 2); return; }
    case "leshy": case "the-needle": return;
    case "mere-beast": { const x = opposite(); if (!x) return; const d = damage(st, c, x, a, { attack: true }); if (d >= 0 && !x.dead) x.poison = Math.max(x.poison, 1); return; }
    default: { const x = opposite(); if (x && a > 0) damage(st, c, x, a, { attack: true }); }
  }
}

// ---------- a full round ----------
// plans: [planBlue, planRed]; a plan is { orders: [{ uid, index, target, target2 }], items: [{ id, target }],
//   rumpel: uid | null, hunt: uid | null }
export function playRound(st, plans) {
  if (st.over) return st;
  st.acting = null; // uid of the card acting right now, for pages that replay the round
  const ords = [];
  for (const i of [0, 1]) {
    const plan = plans[i] || { orders: [], items: [] };
    let ap = st.sides[i].ap;
    for (const it of (plan.items || []).slice(0, 1)) {
      if (it.id === "mead-of-poetry") ap += 2;
    }
    // Items first: one a round
    for (const it of (plan.items || []).slice(0, 1)) {
      const cost = itemCost(st, i);
      if (ap < cost || !st.sides[i].items.includes(it.id)) continue;
      ap -= cost;
      ords.push({ side: i, item: it.id, target: it.target, prio: 100 });
    }
    const used = new Set();
    for (const o of plan.orders || []) {
      const a = cards(st, i).find((c) => c.uid === o.uid);
      if (!a || used.has(a.uid) || isCharging(st, a)) continue;
      const act = a.actions[o.index]; if (!act) continue;
      if (act.court && !isCourt(st, a, act)) continue;
      const cost = apCost(st, a, act);
      if (cost > ap) continue;
      ap -= cost; used.add(a.uid);
      ords.push({ side: i, actor: a, index: o.index, target: o.target, target2: o.target2 });
    }
    // The Huntsman can only mark an enemy hero his side can see.
    if (crownIs(st, i, "the-huntsman") && plan.hunt && visibleTo(st, i, heroes(st, 1 - i)).some((h) => h.uid === plan.hunt)) st.marks[`hunt${i}`] = plan.hunt;
    // Front rank acts automatically
    for (const c of cards(st, i).filter((c) => c.kind === "front")) ords.push({ side: i, actor: c, auto: true });
    // Charged heroes strike automatically
    for (const c of heroes(st, i)) if (isCharging(st, c)) ords.push({ side: i, actor: c, charge: true });
  }
  // Rumpelstiltskin's guess
  for (const i of [0, 1]) {
    const pick = plans[i]?.rumpel;
    const rum = crownCard(st, i);
    if (!pick || !rum || rum.id !== "rumpelstiltskin" || !crownActive(st, i)) continue;
    if (!rumpelChoices(st, i).some((h) => h.uid === pick)) continue;
    const fl = st.sides[i].flags;
    fl.rumpelGuesses = (fl.rumpelGuesses || 0) + 1; fl.rumpelLast = { uid: pick, round: st.round };
    const o = ords.find((x) => x.actor && x.actor.uid === pick && !x.auto);
    const tgt = heroes(st, 1 - i).find((h) => h.uid === pick);
    const guessed = () => ev(st, { t: "act", uid: rum.uid, side: i, name: "Guess the name", tgt: uidOf(tgt) });
    if (o) { o.cancelled = true; log(st, `Rumpelstiltskin guesses ${tgt?.name}'s name: its action is cancelled.`); guessed(); applyHealthLoss(st, rum, tgt, 2, {}); }
    else { log(st, `Rumpelstiltskin guesses wrong.`); guessed(); applyHealthLoss(st, { name: "A wrong guess", side: -1 }, rum, 1, {}); }
  }
  for (const c of allCards(st)) c.flags.acted = false;
  ev(st, { t: "phase", name: "resolve" });
  // Resolve items, then cards in Speed order (recomputed each step)
  for (const o of ords.filter((o) => o.item)) {
    const tgt = o.item === "draught-of-the-cauldron"
      ? st.sides[o.side].grave.find((c) => c.uid === o.target)
      : (o.target ? findCard(st, o.target) : null);
    if (ITEM_TARGETS[o.item] !== "none" && !tgt) continue; // no valid target: the item isn't spent
    // ...and the target must be one the item may be used on (never, say, a hidden enemy).
    if (tgt && o.item !== "draught-of-the-cauldron" && !itemTargets(st, o.side, o.item).some((c) => c && c.uid === tgt.uid)) continue;
    useItem(st, o.side, o.item, tgt);
  }
  // Mirrored shield and Nobody aren't Speed dependent: once chosen, they're up before anyone acts.
  for (const o of ords) {
    if (o.item || o.auto || o.cancelled || !o.actor || o.actor.stopNow || o.actor.dead) continue;
    const nm = o.actor.actions[o.index]?.name;
    if (o.actor.id === "perseus" && nm === "Mirrored shield") o.actor.flags.reflectRound = st.round;
    if (o.actor.id === "odysseus" && nm === "Nobody") o.actor.flags.nobodyRound = st.round;
  }
  // Hold court isn't Speed dependent either: the Crown's Guard and next round's action point come before anyone acts.
  for (const o of ords) {
    if (o.item || o.auto || o.charge || o.cancelled || !o.actor || o.actor.stopNow || o.actor.dead || o.actor.removed) continue;
    const a = o.actor, act = a.actions[o.index];
    if (!act || !act.court) continue;
    o.done = true;
    if (!isCourt(st, a, act)) continue;
    st.acting = a.uid;
    log(st, `${sideName(a.side)} ${a.name} uses Hold court.`);
    ev(st, { t: "act", uid: a.uid, side: a.side, name: act.name, tgt: null });
    const before = snapStats(st);
    const g0 = guardOf(st, a); a.flags.courtGuardRound = st.round;
    const gain = Math.max(0, guardOf(st, a) - g0); a.guardLeft += gain;
    if (gain) log(st, `${a.name} has +1 Guard this round.`);
    st.sides[a.side].flags.courtApRound = st.round + 1;
    log(st, `${a.name} banks an action point for next round.`);
    diffStats(st, before, a);
    a.flags.acted = true;
  }
  st.acting = null;
  let pending = ords.filter((o) => !o.item);
  while (pending.length && !st.over) {
    pending = pending.filter((o) => !o.done && o.actor && !o.actor.dead && !o.actor.removed);
    if (!pending.length) break;
    pending.sort((p, q) => speedOf(st, q.actor) - speedOf(st, p.actor) ||
      (p.side === st.fate ? -1 : 0) - (q.side === st.fate ? -1 : 0) || p.actor.slot - q.actor.slot);
    const o = pending.shift();
    const a = o.actor;
    st.acting = a.uid;
    if (o.cancelled || a.stopNow) {
      a.flags.acted = true;
      if (o.charge) { log(st, `${a.name} loses the charge.`); a.flags.charge = null; }
      ev(st, { t: "skip", uid: a.uid, why: o.cancelled ? "cancelled" : "stopped" }); continue;
    }
    a.flags.acted = true;
    if (o.charge) {
      const ch = a.flags.charge; a.flags.charge = null;
      const x = findCard(st, ch.tgt);
      if (!x) { log(st, `${a.name}'s ${ch.name} is wasted: its target is gone.`); ev(st, { t: "wasted", uid: a.uid, name: ch.name }); continue; }
      log(st, `${sideName(a.side)} ${a.name} uses ${ch.name} on ${x.name} (charged).`);
      ev(st, { t: "act", uid: a.uid, side: a.side, name: ch.name, tgt: x.uid });
      const before = snapStats(st);
      damage(st, a, x, CHARGE_DMG, { attack: true, ranged: ch.ranged, ignoreGuard: a.id === "sigurd" && crownIs(st, a.side, "sigurd") });
      diffStats(st, before, a); continue;
    }
    if (o.auto) {
      ev(st, { t: "act", uid: a.uid, side: a.side, auto: true, name: a.name });
      const before = snapStats(st); frontAct(st, a); diffStats(st, before, a); continue;
    }
    const act = a.actions[o.index];
    a.uses[act.name] = (a.uses[act.name] || 0) + (act.usesPerFight ? 1 : 0);
    let x = o.target ? findCard(st, o.target) : null;
    const spec = ACTIONS[a.id]?.[act.name];
    const needsTarget = spec ? !["none", "emptyFront"].includes(spec.t) : true;
    if (spec && ["deadFront", "deadTalemate"].includes(spec.t)) x = st.sides[a.side].grave.find((c) => c.uid === o.target);
    if (needsTarget && !x) {
      // Target gone: wasted (the doc's rule), unless it's a standard melee attack with another target in reach.
      log(st, `${a.name}'s ${act.name} is wasted: its target is gone.`); ev(st, { t: "wasted", uid: a.uid, name: act.name }); continue;
    }
    if (needsTarget && x && !spec?.t?.startsWith("dead") && !["ally", "allyHero", "adjacentAllyHero"].includes(spec?.t)) {
      const legal = targetsFor(st, a, act).some((c) => c && c.uid === x.uid);
      if (!legal) { log(st, `${a.name}'s ${act.name} is wasted: ${x.name} is out of reach.`); ev(st, { t: "wasted", uid: a.uid, name: act.name }); continue; }
    }
    log(st, `${sideName(a.side)} ${a.name} uses ${act.name}${x ? ` on ${x.name}` : ""}.`);
    ev(st, { t: "act", uid: a.uid, side: a.side, name: act.name, tgt: uidOf(x), standard: !spec });
    const before = snapStats(st);
    if (spec && spec.go) spec.go(st, a, x, o.target2 ? findCard(st, o.target2) : null);
    else standardAttack(st, a, x);
    diffStats(st, before, a);
  }
  st.acting = null;
  checkWin(st);
  if (!st.over) upkeep(st);
  return st;
}

export function findCard(st, uid) {
  for (const s of st.sides) for (const c of Object.values(s.slots)) if (c && c.uid === uid && !c.dead && !c.removed) return c;
  return null;
}

// ---------- a simple bot ----------
// Scores every (hero, action, target) and picks greedily by value per action point, with a little noise.
export function botPlan(st, i, rng = st.rng, noise = 0.35) {
  const foe = 1 - i;
  const plan = { orders: [], items: [], rumpel: null, hunt: null };
  let ap = st.sides[i].ap;
  const ec = crownCard(st, foe);
  const cand = [];
  for (const a of heroes(st, i)) {
    for (const o of options(st, a)) {
      for (const x of o.targets) {
        // Hidden cards (the wooden horse) can't be judged: the bot guesses.
        const v = x && x.side === foe && isHidden(st, x) ? 1 + 3 * rng.next() : valueOf(st, a, o.action, x);
        if (v <= 0) continue;
        const t2 = null, cost = apCost(st, a, o.action);
        cand.push({ a, index: o.index, ap: cost, x, t2, v: (v / Math.max(1, cost)) * (1 + noise * (rng.next() - 0.5)) });
      }
    }
  }
  cand.sort((p, q) => q.v - p.v);
  const used = new Set();
  // Items: use when clearly useful
  const cost = itemCost(st, i);
  for (const id of st.sides[i].items.slice()) {
    const mine = heroes(st, i);
    let t = null, ok = false;
    switch (id) {
      case "gingerbread": case "golden-apple": case "water-of-life": {
        if (isNight(st)) break;
        t = mine.filter((h) => h.maxHealth - h.health >= (id === "water-of-life" ? 6 : 3)).sort((p, q) => p.health - q.health)[0]; ok = !!t; break;
      }
      case "mead-of-heorot": ok = !isNight(st) && mine.filter((h) => h.maxHealth - h.health >= 2).length >= 2; break;
      case "skull-lantern": case "poisoned-apple": { t = heroes(st, foe).sort((p, q) => p.health - q.health)[0]; ok = !!t; break; }
      case "spindle": { t = heroes(st, foe).sort((p, q) => attackOf(st, q) - attackOf(st, p))[0]; ok = !!t && st.round > 1; break; }
      case "dragons-blood": { t = crownCard(st, i); ok = !!t && t.health <= t.maxHealth / 2; break; }
      case "the-giants-sword": { t = mine.sort((p, q) => attackOf(st, q) - attackOf(st, p))[0]; ok = !!t; break; }
      case "draught-of-the-cauldron": { t = itemTargets(st, i, id)[0]; ok = !!t; break; }
      case "mead-of-poetry": ok = st.round >= 2; break;
    }
    if (ok && ap >= cost && rng.next() < 0.6) {
      plan.items.push({ id, target: t ? t.uid : null });
      ap -= cost; if (id === "mead-of-poetry") ap += 2;
      break;
    }
  }
  for (const c of cand) {
    if (used.has(c.a.uid) || c.ap > ap) continue;
    used.add(c.a.uid); ap -= c.ap;
    plan.orders.push({ uid: c.a.uid, index: c.index, target: c.x ? c.x.uid : null, target2: c.t2 ? c.t2.uid : null });
  }
  const eh = heroes(st, foe);
  if (eh.length) {
    const fresh = rumpelChoices(st, i);
    if (fresh.length && rng.next() < 0.5) plan.rumpel = rng.pick(fresh).uid;
    const seen = visibleTo(st, i, eh);
    plan.hunt = (ec && seen.find((h) => h.uid === ec.uid)) ? ec.uid : seen.length ? rng.pick(seen).uid : null;
  }
  return plan;
}

function valueOf(st, a, act, x) {
  if (act.court) {
    // Worth it when the Crown has nothing better to do: a little Guard if it can be reached, and an action point banked.
    const reach = heroes(st, 1 - a.side).some((h) => h.ranged) || cards(st, 1 - a.side).some((c) => c.id === "longbowman");
    return 0.9 + (reach ? 0.6 : 0);
  }
  const foe = 1 - a.side;
  const ec = crownCard(st, foe);
  const name = act.name;
  const dmgValue = (d, t) => {
    if (!t) return 0;
    const eff = Math.max(0, d - (t.guardLeft || 0));
    let v = Math.min(eff, t.health);
    if (eff >= t.health) v += t.kind === "hero" ? 6 : 3;
    if (ec && t.uid === ec.uid) v *= eff >= t.health ? 10 : 1.6;
    return v;
  };
  const missing = (t) => (t ? t.maxHealth - t.health : 0);
  switch (name) {
    case "Attack": case "Claw":
      if (x && x.side === a.side) return 0;
      if (a.id === "zmey-gorynych") {
        const per = attackOf(st, a);
        return crownIs(st, a.side, "zmey-gorynych") ? 5 * per * 1.2 : 3 * dmgValue(per, x);
      }
      return dmgValue(attackOf(st, a), x);
    case "Pestle": return dmgValue(5, x);
    case "Skull fire": return dmgValue(3, x);
    case "Mortar ride": return x ? (x.kind === "hero" ? 10 + x.health / 2 : 4 + x.health / 2) : 0;
    case "Excalibur": return dmgValue(5 + (x?.guardLeft || 0), x);
    case "Champion's charge": return dmgValue(5, x) + (crownCard(st, 1 - a.side) ? 1.5 : 0);
    case "Axe throw": return dmgValue(attackOf(st, a), x);
    case "Shortcut": return (st.sides[a.side].flags.shortcutUntil || 0) >= st.round ? 0 : 1.2 * heroes(st, a.side).length;
    case "Lance Charge": return dmgValue(3 + (x?.guardLeft || 0), x);
    case "Split the Arrow": return dmgValue(2, x) + (cards(st, 1 - a.side).length > 1 ? 1.5 : 0);
    case "Fair fight": return dmgValue(4, x) + (x && !x.flags.acted ? attackOf(st, x) : 0);
    case "Arm-wrench": return dmgValue(attackOf(st, a), x) + 4;
    case "Bite": return dmgValue(attackOf(st, a), x) * 1.4;
    case "Hex": return dmgValue(2 + ((a.id === "merlin" && x && ["Beast", "Witch", "Trickster"].includes(x.aspect)) || (a.id === "morgan-le-fay" && x && ["Sovereign", "Guardian", "Slayer"].includes(x.aspect)) ? 1 : 0), x);
    case "Sea magic": return a.health > 3 ? dmgValue(attackOf(st, a), x) - 0.5 : 0;
    case "Stones in the belly": return dmgValue(attackOf(st, a), x) + 2;
    case "Quarterstaff": return dmgValue(4, x) + 1;
    case "Rampage": return dmgValue(3, x) + 3 * neighbours(st, x).length * 0.8;
    case "Tail Sweep": return dmgValue(2, x) + 1.5;
    case "Fire Breath": return Math.min(2, cards(st, 1 - a.side).length) * 1.9;
    case "Into the oven": return dmgValue(4, x) + (x?.aspect === "Witch" ? 8 : 0);
    case "Betrayal": return x && ec && x.uid === ec.uid ? dmgValue(6 + (x.guardLeft || 0), x) : (a.health <= 3 ? dmgValue(6, x) : 0);
    case "Break their spirit": return x ? dmgValue(attackOf(st, a), x) + guardOf(st, x) * 3 : 0;
    case "Whirlwind": return dmgValue(3, x) + 1;
    case "The Pyre": {
      if (a.health <= 9) return 0;
      return cards(st, foe).reduce((s, c) => s + dmgValue(6, c), 0) - 6;
    }
    case "Turn": return x ? (x.kind === "hero" ? 14 : 6) : 0;
    case "Swallow whole": return x ? (x.kind === "hero" ? 12 : 4 + x.health / 2) : 0;
    case "Devour": return x ? 5 : 0;
    case "Drag under": return dmgValue(attackOf(st, a), x) + 1;
    case "Shape-shift": return x ? attackOf(st, x) * 2.5 : 0;
    case "Stolen scabbard": return x ? guardOf(st, x) * 3 + 2 : 0;
    case "Enchanted sleep": case "Girdle Leash": return x && x.stoppedRound !== st.round - 1 ? attackOf(st, x) * 1.5 + 1 : 0;
    case "The unhurried pace": return x ? Math.max(0, speedOf(st, x) - 2) : 0;
    case "Shard of the mirror": return x ? attackOf(st, x) * 1.5 : 0;
    case "Wanted": return x ? 3 + (ec && x.uid === ec.uid ? 3 : 0) : 0;
    case "Shield Brother": return x && x.health < x.maxHealth / 2 ? 4 : 0;
    case "Battle of the trees": return crownIs(st, a.side, "gwydion") ? 7 : 4.5;
    case "Steadfast stand": return 2.5;
    case "The master is at hand": return 1.5;
    case "Oak, broom and meadowsweet": return heroes(st, a.side).length > 1 ? 3 : 0;
    case "Queen's mercy": case "The doll's advice": return isNight(st) ? 0 : Math.min(missing(x), 3 + 1) * 1.1;
    case "Cake and wine": return isNight(st) ? 0 : Math.min(missing(x), 4) * 1.1;
    case "Ale and bread": return isNight(st) ? 0 : heroes(st, a.side).reduce((s, h) => s + Math.min(missing(h), 2), 0);
    case "Saved from the wreck": return isNight(st) ? 0 : heroes(st, a.side).reduce((s, h) => s + Math.min(missing(h), 4), 0) - 3;
    case "Completion": return isNight(st) ? 0 : heroes(st, a.side).reduce((s, h) => s + Math.min(missing(h), 4), 0) - 4;
    case "Heads grow back": return isNight(st) ? 0 : Math.min(missing(a), 6) - 1;
    case "Mend": return isNight(st) ? 0 : neighbours(st, a).reduce((s, n) => s + Math.min(missing(n), 1), 0);
    case "Blood transfusion": return isNight(st) ? 0 : heroes(st, a.side).some((h) => h.uid !== a.uid && missing(h) >= 3) && a.health > 5 ? 2 : 0;
    case "Reanimate": case "Cauldron of rebirth": return x ? 8 : 0;
    case "Straw into gold": return st.sides[a.side].usedItems.length ? 3 : 0;
    case "Gnaw": return 0;
    case "Mirrored shield": {
      const threat = heroes(st, foe).reduce((s, h) => s + attackOf(st, h), 0);
      return a.health <= a.maxHealth * 0.7 || (crownCard(st, a.side)?.uid === a.uid) ? Math.min(6, threat / 2) : 1;
    }
    case "Nobody": return a.health <= a.maxHealth * 0.6 ? 4 : 1;
    case "Medusa's head": return x && x.stoppedRound !== st.round - 1 ? attackOf(st, x) * 1.5 + 1 : 0;
    case "Petrify": return x && x.stoppedRound !== st.round - 1 ? attackOf(st, x) * 1.5 + 1 : 0;
    case "Serpent hair": return Math.min(2, cards(st, foe).length) * 2.6;
    case "Hurl the boulder": return dmgValue(4, x) + (x?.kind === "hero" ? 1 : 0);
    case "Transfigure": return x ? Math.max(0, attackOf(st, x) - 1) * 2 : 0;
    case "Royal decree": return st.sides[foe].flags.decreeRound === st.round + 1 ? 0 : 3 + heroes(st, foe).length;
    case "Dig the pit": case "Deep breath": return x ? dmgValue(8 + (x.guardLeft || 0), x) * 0.7 + (x.uid === crownCard(st, foe)?.uid ? 3 : 0) : 0;
    case "Mistletoe": return dmgValue(3 + (x?.guardLeft || 0), x);
    case "Crown thief": {
      const old = crownCard(st, foe); if (!old || st.sides[foe].noCrown) return 0;
      const heir = heroes(st, foe).filter((h) => h.uid !== old.uid).sort((p, q) => q.health - p.health)[0];
      return heir && heir.health > old.health ? 2.5 : 0;
    }
    case "Growl": return st.sides[foe].flags.growlRound === st.round + 1 ? 0 : 1 + 0.8 * cards(st, foe).length;
    case "Gore": return dmgValue(5 + (x?.guardLeft || 0), x);
    default: return dmgValue(attackOf(st, a), x);
  }
}

// Plays a whole fight between two bots. Returns 0, 1 or -1 (draw).
export function botFight(data, lineups, seed) {
  const rng = makeRng(seed);
  const st = createGame(data, lineups, { rng });
  while (!st.over) playRound(st, [botPlan(st, 0, rng), botPlan(st, 1, rng)]);
  return st;
}

// =====================================================================================
// Quests: three fights in a row with one company. What a side has lost (front-rank cards, items, Health)
// carries from one fight to the next.
// =====================================================================================
// How many of each front-rank card make up a warband, set so each warband is won about 9 times in 10 and costs
// a company roughly a sixth of its Health.
// No Hoplites: with no nightfall, a Phalanx can hold out until the round limit.
export const QUEST_TROOPS = { berserker: 3, knight: 3, crossbowman: 4, longbowman: 4, "geat-thane": 4, "mere-beast": 3 };
// In every quest fight the player holds the Fate token throughout and night never falls.
// A quest fight still at a stand-off after round 20 is a draw, which loses the quest.
export const QUEST_RULES = { fate: 0, noNight: true, maxRounds: 20 };
// The three foes of a quest: a warband of one front-rank card, two cheap heroes with no Crown (both must fall), and
// a final company of three
// heroes from one realm under a strong Crown (or Baba Yaga alone), with no front rank, fought blind.
export function questPlan(data, rng) {
  const H = Object.values(data.heroes), banned = ["baba-yaga", "grendel", "grendels-mother"];
  const troops = rng.pick(Object.keys(QUEST_TROOPS));
  const cheap = rng.shuffle(H.filter((h) => !banned.includes(h.id) && h.renown <= 13));
  const easy = { crown: cheap[0].id, heroes: [cheap[1].id], front: [], items: [], noCrown: true };
  let final;
  if (rng.next() < 0.2) final = { crown: "baba-yaga", heroes: [], front: [], items: [], blind: true, revealRound: 3 };
  else {
    const byRealm = {};
    // Koschei always brings the Needle, which would be hidden and so could never be destroyed; Robin Hood wears
    // no Crown, so every hidden hero would have to fall. Neither suits a blind fight.
    for (const h of H) if (!banned.includes(h.id) && h.id !== "koschei" && h.realm !== "Geatland") (byRealm[h.realm] ||= []).push(h);
    const realm = rng.pick(Object.keys(byRealm).filter((r) => byRealm[r].length >= 3));
    const top = byRealm[realm].slice().sort((a, b) => b.renown - a.renown);
    const crown = rng.pick(top.filter((h) => h.id !== "robin-hood").slice(0, 2));
    const rest = rng.shuffle(top.filter((h) => h.id !== crown.id)).slice(0, 2);
    final = { crown: crown.id, heroes: rest.map((h) => h.id), front: [], items: [], blind: true, ap: 2, revealRound: 3 };
  }
  return { fights: [{ kind: "warband", lineup: { troops, troopCount: QUEST_TROOPS[troops], front: [], items: [] } }, { kind: "easy", lineup: easy }, { kind: "final", lineup: final }] };
}
// After a fight: the company that marches on, and the Health each card carries. Only cards that started the fight
// count (summoned cards stay behind); the hero wearing the Crown at the end leads the next fight.
export function carryOver(st, i, lu) {
  const side = st.sides[i], start = new Set(side.startUids || []);
  const alive = Object.values(side.slots).filter((c) => c && !c.dead && !c.removed && start.has(c.uid));
  const hs = alive.filter((c) => c.kind === "hero").sort((a, b) => a.slot - b.slot);
  const crown = crownCard(st, i);
  const lead = crown && start.has(crown.uid) ? crown : hs[0];
  const health = { hero: {}, front: [null, null, null] };
  hs.forEach((c) => { health.hero[c.id] = c.health; });
  const front = [0, 1, 2].map((k) => { const c = alive.find((x) => x.slot === 4 + k && x.kind === "front"); if (c) health.front[k] = c.health; return c ? c.id : null; });
  const left = side.items.slice(), items = [];
  for (const id of lu.items || []) { const k = left.indexOf(id); if (k >= 0) { items.push(id); left.splice(k, 1); } }
  return { lineup: { crown: lead ? lead.id : null, heroes: hs.filter((c) => c !== lead).map((c) => c.id), front, items }, health };
}
export function applyCarry(st, i, health) {
  for (const c of Object.values(st.sides[i].slots)) {
    if (!c) continue;
    const h = c.kind === "hero" ? health.hero[c.id] : c.slot >= 4 ? health.front[c.slot - 4] : null;
    if (h == null) continue;
    c.health = Math.max(1, h);
    if (c.health > c.maxHealth) c.maxHealth = c.health;
  }
}
