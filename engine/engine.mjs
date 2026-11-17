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
  "The slot-1 rules (shielded only by two heroes; can't melee past its own heroes) apply to whoever is in slot 1, including under Robin's No Crown.",
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

function makeHero(def, side, slot) {
  const s = def.stats;
  return {
    uid: ++UID, id: def.id, kind: "hero", side, slot, name: def.name,
    realm: def.realm, tale: def.tale, aspect: def.aspect, ranged: !!s.ranged,
    baseHealth: s.health, maxHealth: s.health, health: s.health,
    baseAtk: s.attack, baseGuard: s.guard, baseSpeed: s.speed,
    atkPerm: 0, speedPerm: 0, guardIntoAtk: 0, atkMult: 1, speedFixed: null,
    actions: def.actions.map((a) => ({ ...a })), uses: {},
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
    atkPerm: 0, speedPerm: 0, guardIntoAtk: 0, atkMult: 1, speedFixed: null,
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
  // Start-of-fight effects
  for (const side of st.sides) {
    const crown = crownCard(st, side.index);
    if (crown?.id === "robin-hood") side.noCrown = true;
  }
  applyStartingHealth(st);
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
  if (crownId) side.slots[1] = makeHero(H(crownId), i, 1);
  heroes.forEach((id, k) => { if (id) side.slots[2 + k] = makeHero(H(id), i, 2 + k); });
  const front = (lu.front || []).slice(0, 3);
  const hasKoschei = [crownId, ...heroes].includes("koschei");
  front.forEach((id, k) => { if (id && !(hasKoschei && k === 2)) side.slots[4 + k] = makeFront(F(id), i, 4 + k); });
  if (hasKoschei) side.slots[6] = makeFront(F("the-needle"), i, 6);
  side.items = (lu.items || []).filter(Boolean).slice(0, TOOL_BELT);
  side.crownUid = side.slots[1]?.uid ?? null;
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
export function ev(st, e) { (st.events ||= []).push({ r: st.round, n: st.log.length, ...e }); }
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
const isNight = (st) => st.round >= NIGHTFALL;
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

// Bond strength for a side: 1 normally, 0 if the enemy crown is Morgan, -1 if it is the Little Mermaid.
function bondFactor(st, i) {
  const foe = 1 - i;
  if (crownIs(st, foe, "morgan-le-fay")) return 0;
  if (crownIs(st, foe, "the-little-mermaid")) return -1;
  return 1;
}
function hasBond(st, c) { return bondFactor(st, c.side) !== 0; }

// ---------- derived stats ----------
export function attackOf(st, c) {
  let a = c.baseAtk + c.atkPerm + c.guardIntoAtk;
  if (c.flags.harmless) return 0;
  const f = bondFactor(st, c.side);
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
  a = a * c.atkMult;
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
    }
    if (c.id === "rhiannon") s += f * countRealm(st, c, "Cymru");
    if (c.id === "the-bride" && gothicBeast(st, c)) s += f;
  }
  if (crownIs(st, 1 - i, "the-creature") && c.kind === "hero") s -= 1;
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
// Enemy rows, closest first. The front rank shields everything. Behind it, the Crown (slot 1) is
// shielded from melee only while both hero slots (2 and 3) are filled; once one is empty the Crown
// can be struck alongside the remaining hero.
function enemyRows(st, attackerSide) {
  const foe = 1 - attackerSide;
  const front = [4, 5, 6].map((s) => at(st, foe, s)).filter(Boolean);
  const mid = [2, 3].map((s) => at(st, foe, s)).filter(Boolean);
  const back = at(st, foe, 1);
  const rows = [front];
  if (mid.length >= 2) { rows.push(mid); if (back) rows.push([back]); }
  else rows.push(back ? [...mid, back] : mid);
  return rows.filter((r) => r.length);
}
export function closestRow(st, attackerSide) { return enemyRows(st, attackerSide)[0] || []; }
// A card in slot 1 can't melee the enemy while one of its own heroes stands in front of it.
export function crownBlocked(st, c) {
  return c.kind === "hero" && c.slot === 1 && [2, 3].some((s) => at(st, c.side, s)?.kind === "hero");
}
export function meleeTargets(st, attacker) {
  if (crownBlocked(st, attacker)) return [];
  const rows = enemyRows(st, attacker.side);
  if (!rows.length) return [];
  let out = rows[0];
  if (crownIs(st, attacker.side, "bran-the-blessed") && rows[1]) out = out.concat(rows[1]);
  return out;
}
export function rangedTargets(st, attacker) {
  const foe = 1 - attacker.side;
  return cards(st, foe).filter((c) => !(c.id === "the-wolf" && hasBond(st, c) &&
    otherHeroes(st, c, (h) => isRealm(st, h, "Märchen")).length > 0));
}
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
    if (crownIs(st, s, "gretel") && ["Witch", "Beast", "Slayer"].includes(t.aspect)) amt += 2;
    if (crownIs(st, s, "the-wolf") && injured(t)) amt += 1;
    if (crownIs(st, s, "the-huntsman") && st.marks[`hunt${s}`] === t.uid) amt += 1;
    if (st.marks[`wanted${s}`] === t.uid) amt += 1;
    if (f && heroes(st, s).some((h) => h.id === "the-dragon") && t.aspect === "Slayer") amt += f;
    if (src.flags.giantSword === st.round) { amt += 3; opts = { ...opts, ignoreGuard: true }; src.flags.giantSword = -1; }
    if (opts.ranged && crownIs(st, t.side, "grendels-mother") && t.kind === "hero") amt -= 2;
  }
  if (opts.spell && src) {
    const f = bondFactor(st, src.side);
    if (f) {
      if (src.id === "merlin" && otherHeroes(st, src, (h) => isRealm(st, h, "Albion")).length) amt += f;
      if (src.id === "gwydion") amt += f * countRealm(st, src, "Cymru");
      if (src.id === "morgan-le-fay" && t.aspect === "Sovereign") amt += 2 * f;
    }
  }
  amt = Math.max(0, amt);
  if (atk && crownIs(st, t.side, "maid-marian")) amt = Math.ceil(amt / 2);
  if (atk && t.kind === "hero" && crownIs(st, t.side, "st-george") && st.sides[t.side].flags.georgeRound !== st.round) {
    st.sides[t.side].flags.georgeRound = st.round;
    const blocked = Math.min(2, amt);
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
  // Tin Soldier: takes the first attack aimed at a hero next to him.
  if (t.kind === "hero") {
    const tin = neighbours(st, t).find((n) => n.id === "the-tin-soldier" && n.flags.steadfastRound >= st.round - 1 && n.flags.steadfastUsed !== st.round);
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
    if (!noCheating(st)) {
      if (crownIs(st, side, "vasilisa-the-wise") && !st.sides[side].flags.vasilisaUsed) {
        st.sides[side].flags.vasilisaUsed = true;
        t.health = 1; log(st, `${t.name} survives on 1 Health (Vasilisa).`);
        ev(st, { t: "hit", src: uidOf(src), item: src?.item, tgt: t.uid, style: opts._style || "effect", dmg: amt, hp: 1, survived: true }); return amt;
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
  if (t.kind !== "hero") return;
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
      if (h.id === "beowulf" && t.aspect === "Beast") h.atkPerm += f;
      if (!mine) continue;
      if (h.id === "maid-marian" && isRealm(st, t, "Albion") && !h.flags.marianDone) {
        h.flags.marianDone = true; h.atkPerm += 2 * f; h.speedPerm += f;
      }
      if (h.id === "st-george") {
        if (t.aspect === "Beast" && !h.flags.georgeBeast) { h.flags.georgeBeast = true; h.guardIntoAtk += f * guardOf(st, h); if (f > 0) { h.noGuard = true; h.guardLeft = 0; log(st, `St George gives up his Guard: his Attack is now ${attackOf(st, h)}.`); } }
        if (t.aspect === "Healer" && !h.flags.georgeHealer) { h.flags.georgeHealer = true; h.atkMult = f > 0 ? 2 : 1; }
      }
      if (h.id === "grendels-mother" && t.id === "grendel") { h.atkPerm += 3 * f; h.speedFixed = 3; }
      if (h.id === "the-creature" && isRealm(st, t, "Gothic")) {
        h.flags.gothicDeaths = (h.flags.gothicDeaths || 0) + 1;
        if (h.flags.gothicDeaths === 1) h.atkPerm += 2 * f;
        if (h.flags.gothicDeaths === 2) { h.atkPerm += 2 * f; h.speedPerm += f; }
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
  const pool = cards(st, 1 - a.side).slice(), out = [];
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
  // Fate token
  const ren0 = crownIs(st, 0, "renfield"), ren1 = crownIs(st, 1, "renfield");
  if (ren0 && !ren1) st.fate = 0; else if (ren1 && !ren0) st.fate = 1; else if (st.round > 1) st.fate = 1 - st.fate;
  for (const i of [0, 1]) {
    // Galvanism: +1 action point for each of Victor's other living heroes, counted at upkeep.
    st.sides[i].ap = BASE_AP + (crownIs(st, i, "victor-frankenstein") ? heroes(st, i).filter((h) => h.id !== "victor-frankenstein").length : 0);
    st.sides[i].flags.itemApExtra = 0;
  }
  // Blodeuwedd's change at nightfall comes first
  if (st.round === NIGHTFALL) {
    for (const c of allCards(st)) if (c.id === "blodeuwedd" && !c.flags.night) {
      c.flags.night = true; c.maxHealth = c.baseHealth * 2; c.health = c.maxHealth; c.baseAtk *= 2;
      log(st, `Blodeuwedd becomes the owl: 14 Health, Attack 4, Guard 2.`);
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
  for (const c of allCards(st)) if (c.poison > 0) { const p = c.poison; c.poison = Math.floor(p / 2); applyHealthLoss(st, { name: "Poison", side: -1 }, c, p, {}); }
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
        if (fr) damage(st, crown, fr, 2, {});
        break;
      }
      case "friar-tuck": {
        const side = st.sides[i];
        side.flags.tuckReturns = side.flags.tuckReturns || 0;
        if (side.flags.tuckReturns < 3 && !isNight(st) && !noCheating(st)) {
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
    if (side.noCrown) return heroes(st, i).length === 0;
    const crown = Object.values(side.slots).find((c) => c && c.uid === side.crownUid);
    return !crown || crown.dead;
  });
  if (lost[0] && lost[1]) { st.over = true; st.winner = -1; log(st, "Both crowns fall: a draw."); ev(st, { t: "over", winner: st.winner }); }
  else if (lost[0]) { st.over = true; st.winner = 1; log(st, "Red wins."); ev(st, { t: "over", winner: st.winner }); }
  else if (lost[1]) { st.over = true; st.winner = 0; log(st, "Blue wins."); ev(st, { t: "over", winner: st.winner }); }
  else if (st.round >= MAX_ROUNDS) { st.over = true; st.winner = -1; log(st, "Round limit reached: a draw."); ev(st, { t: "over", winner: st.winner }); }
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
  "beowulf": { "Arm-wrench": { t: "enemyMelee", go: (st, a, x) => { hit(st, a, x, attackOf(st, a)); x.atkPerm -= 2; } } },
  "blodeuwedd": { "Oak, broom and meadowsweet": { t: "none", go: (st, a) => { for (const h of heroes(st, a.side)) if (h.uid !== a.uid) h.guardLeft += 2; } } },
  "bran-the-blessed": { "Cauldron of rebirth": { t: "deadFront", go: (st, a, x) => { if (noCheating(st)) return; revive(st, x, x.maxHealth); log(st, `${x.name} rises from the Cauldron.`); revived(st, x); } } },
  "dracula": { "Claw": STD,
    "Bite": { t: "enemyMelee", go: (st, a, x) => { const d = hit(st, a, x, attackOf(st, a)); heal(st, a, a, d); } },
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
  "lancelot": { "Champion's charge": { t: "enemyMelee", go: (st, a, x) => hit(st, a, x, 5) } },
  "little-john": { "Quarterstaff": { t: "enemyMelee", go: (st, a, x) => { hit(st, a, x, 4); const n = neighbours(st, x)[0]; if (n) hit(st, a, n, 1); } } },
  "maid-marian": { "Fair fight": { t: "enemyHeroMelee", go: (st, a, x) => { hit(st, a, x, 4); if (!x.dead && !x.flags.acted) stop(st, x, "Fair fight"); } } },
  "merlin": { "Hex": { t: "enemyAny", go: (st, a, x) => damage(st, a, x, 3, { spell: true, attack: true, ranged: true, ignoreGuard: true }) },
    "Enchanted sleep": { t: "enemyHero", go: (st, a, x) => stop(st, x, "Enchanted sleep") } },
  "morgan-le-fay": { "Hex": { t: "enemyAny", go: (st, a, x) => damage(st, a, x, 3, { spell: true, attack: true, ranged: true, ignoreGuard: true }) },
    "Stolen scabbard": { t: "enemyHero", go: (st, a, x) => { x.noGuard = true; x.guardLeft = 0; x.noHeal = true; log(st, `${x.name} loses its Guard and healing.`); } } },
  "red-riding-hood": { "Cake and wine": { t: "ally", go: (st, a, x) => heal(st, a, x, 4) } },
  "renfield": { "The master is at hand": { t: "none", go: (st, a) => { a.guardLeft += 2; a.flags.guardCrownRound = st.round; } },
    "Betrayal": { t: "enemyMelee", go: (st, a, x) => { hit(st, a, x, 6, { ignoreGuard: true }); a.guardLeft = 0; a.noGuard = true; a.health = Math.min(a.health, 1); log(st, "Renfield's betrayal leaves him on 1 Health."); } } },
  "rhiannon": { "The unhurried pace": { t: "enemyHero", go: (st, a, x) => { x.flags.speedOneRound = st.round; } } },
  "robin-hood": { "Split the Arrow": { t: "enemyAny", go: (st, a, x) => { const other = cards(st, 1 - a.side).filter((c) => c.uid !== x.uid); const y = other.length ? other[st.rng.int(other.length)] : null; hit(st, a, x, 2, { ranged: true }); if (y && !y.dead) hit(st, a, y, 2, { ranged: true }); } } },
  "rumpelstiltskin": { "Straw into gold": { t: "none", go: (st, a) => { const side = st.sides[a.side]; const it = side.usedItems.pop(); if (it) { side.items.push(it); log(st, `Rumpelstiltskin spins back ${itemName(st, it)}.`); } } } },
  "sheriff-of-nottingham": { "Wanted": { t: "enemyAny", go: (st, a, x) => { st.marks[`wanted${a.side}`] = x.uid; log(st, `${x.name} is Wanted.`); } },
    "Break their spirit": { t: "enemyHeroMelee", go: (st, a, x) => { hit(st, a, x, attackOf(st, a)); x.noGuard = true; x.guardLeft = 0; } } },
  "st-george": { "Lance Charge": { t: "enemyMelee", go: (st, a, x) => hit(st, a, x, 3, { ignoreGuard: true }) },
    "Shield Brother": { t: "adjacentAllyHero", go: (st, a, x) => { x.flags.shieldRound = st.round; } } },
  "the-bride": { "Strike": { t: "enemyAny", go: (st, a, x) => hit(st, a, x, attackOf(st, a), { ranged: true }) },
    "Completion": { t: "none", go: (st, a) => heroes(st, a.side).forEach((h) => heal(st, a, h, 99)) } },
  "the-creature": { "Rampage": { t: "enemyMelee", go: (st, a, x) => { const ns = neighbours(st, x); hit(st, a, x, 3); ns.forEach((n) => hit(st, a, n, 3)); } },
    "The Pyre": { t: "none", go: (st, a) => { cards(st, 1 - a.side).forEach((c) => damage(st, a, c, 6, { attack: true })); damage(st, null, a, 8, { trueDamage: true }); } } },
  "the-dragon": { "Fire Breath": { t: "none", go: (st, a) => { for (const x of fireTargets(st, a)) hit(st, a, x, 2, { ranged: true }); } },
    "Tail Sweep": { t: "enemyMelee", go: (st, a, x) => { const n = neighbours(st, x)[0]; hit(st, a, x, 2); if (n) hit(st, a, n, 2); } } },
  "the-huntsman": { "Stones in the belly": { t: "enemyAny", go: (st, a, x) => { hit(st, a, x, attackOf(st, a), { ranged: true }); if (!x.dead) x.speedFixed = 1; } } },
  "the-little-mermaid": { "Sea magic": { t: "enemyAny", go: (st, a, x) => { damage(st, a, x, attackOf(st, a), { spell: true, attack: true, ranged: true }); applyHealthLoss(st, { name: "The knives", side: -1 }, a, 1, {}); } },
    "Saved from the wreck": { t: "none", go: (st, a) => heroes(st, a.side).forEach((h) => heal(st, a, h, 4)) } },
  "the-princess": { "Mend": { t: "none", go: (st, a) => neighbours(st, a).forEach((n) => heal(st, a, n, 1)) },
    "Girdle Leash": { t: "enemyBeast", go: (st, a, x) => { (a.flags.leashed ||= []).push(x.uid); stop(st, x, "Girdle Leash"); } } },
  "the-snow-queen": { "Shard of the mirror": { t: "enemyHero", go: (st, a, x) => { x.flags.shardRound = st.round; } } },
  "the-tin-soldier": { "Steadfast stand": { t: "none", go: (st, a) => { a.guardLeft += 2; a.flags.steadfastRound = st.round; } } },
  "the-wolf": { "Swallow whole": { t: "enemyWolf", go: (st, a, x) => {
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
  if (a.flags.shardRound === st.round) {
    const own = neighbours(st, a)[0];
    if (own) { log(st, `${a.name}'s attack turns on ${own.name} (Shard of the mirror).`); target = own; }
  }
  const d = damage(st, a, target, amount, { attack: true, ...opts });
  if (a.id === "lancelot" && crownIs(st, a.side, "lancelot") && a.flags.chipRound !== st.round) {
    const ec = crownCard(st, 1 - a.side);
    if (ec) { a.flags.chipRound = st.round; applyHealthLoss(st, a, ec, 1, {}); }
  }
  return d;
}

function standardAttack(st, a, x) {
  if (a.id === "zmey-gorynych" && crownIs(st, a.side, "zmey-gorynych")) {
    const per = 1 + Math.max(0, bondFactor(st, a.side)) * countRealm(st, a, "Rus'");
    for (let k = 0; k < 3; k++) {
      const pool = meleeTargets(st, a);
      if (!pool.length) break;
      hit(st, a, st.rng.pick(pool), per);
    }
    return;
  }
  hit(st, a, x, attackOf(st, a), { ranged: a.ranged });
}

// Targets for an action, for the planner and the UI.
export function targetsFor(st, a, act) {
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
    case "enemyHero": return act.name === "Enchanted sleep" ? eh.filter((c) => canBeStopped(st, c)) : eh;
    case "enemyHeroMelee": { const m = meleeTargets(st, a).filter((c) => c.kind === "hero"); return m.length ? m : []; }
    case "enemyHeroNotCrown": return eh.filter((c) => c.uid !== st.sides[foe].crownUid);
    case "enemyHero23": return eh.filter((c) => c.slot === 2 || c.slot === 3);
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
  a.actions.forEach((act, index) => {
    if (act.usesPerFight && (a.uses[act.name] || 0) >= act.usesPerFight) return;
    if (act.ap > 4) return;
    const targets = targetsFor(st, a, act);
    if (!targets.length) return;
    out.push({ index, action: act, targets });
  });
  return out;
}

// Items are free to use, except against Koschei, whose Crown makes them cost 1 action point.
export function itemCost(st, i) { return crownIs(st, 1 - i, "koschei") ? 1 : 0; }

export const ITEM_TARGETS = {
  "dragons-blood": "allyHero", "draught-of-the-cauldron": "deadHero", "gingerbread": "allyHero", "golden-apple": "allyHero",
  "mead-of-heorot": "none", "mead-of-poetry": "none", "poisoned-apple": "enemyHero", "skull-lantern": "enemyHero",
  "spindle": "enemyHero", "the-giants-sword": "allyHero", "water-of-life": "allyHero",
};
export function itemTargets(st, i, id) {
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
  const opposite = () => at(st, foe, c.slot) || st.rng.pick(closestRow(st, c.side));
  const a = attackOf(st, c);
  switch (c.id) {
    case "berserker": { const x = opposite(); if (!x) return; const n = neighbours(st, x)[0]; damage(st, c, x, a, { attack: true }); if (n) damage(st, c, n, a, { attack: true }); return; }
    case "crossbowman": {
      const hs = heroes(st, foe).filter((h) => h.slot === 2 || h.slot === 3).sort((p, q) => p.health - q.health);
      const x = hs[0] || opposite(); if (x) damage(st, c, x, a, { attack: true, ranged: true }); return;
    }
    case "longbowman": {
      const x = crownCard(st, foe) || at(st, foe, 1) || st.rng.pick(closestRow(st, c.side));
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
      if (!a || used.has(a.uid)) continue;
      const act = a.actions[o.index]; if (!act) continue;
      if (act.ap > ap) continue;
      ap -= act.ap; used.add(a.uid);
      ords.push({ side: i, actor: a, index: o.index, target: o.target, target2: o.target2 });
    }
    if (crownIs(st, i, "the-huntsman") && plan.hunt) st.marks[`hunt${i}`] = plan.hunt;
    // Front rank acts automatically
    for (const c of cards(st, i).filter((c) => c.kind === "front")) ords.push({ side: i, actor: c, auto: true });
  }
  // Rumpelstiltskin's guess
  for (const i of [0, 1]) {
    const pick = plans[i]?.rumpel;
    const rum = crownCard(st, i);
    if (!pick || !rum || rum.id !== "rumpelstiltskin" || !crownActive(st, i)) continue;
    st.sides[i].flags.rumpelPicked = st.sides[i].flags.rumpelPicked || [];
    if (st.sides[i].flags.rumpelPicked.includes(pick)) continue;
    st.sides[i].flags.rumpelPicked.push(pick);
    const o = ords.find((x) => x.actor && x.actor.uid === pick && !x.auto);
    const tgt = heroes(st, 1 - i).find((h) => h.uid === pick);
    const guessed = () => ev(st, { t: "act", uid: rum.uid, side: i, name: "Guess the name", tgt: uidOf(tgt) });
    if (o) { o.cancelled = true; log(st, `Rumpelstiltskin guesses ${tgt?.name}'s name: its action is cancelled.`); guessed(); applyHealthLoss(st, rum, tgt, 2, {}); }
    else { log(st, `Rumpelstiltskin guesses wrong.`); guessed(); applyHealthLoss(st, { name: "A wrong guess", side: -1 }, rum, 2, {}); }
  }
  for (const c of allCards(st)) c.flags.acted = false;
  ev(st, { t: "phase", name: "resolve" });
  // Resolve items, then cards in Speed order (recomputed each step)
  for (const o of ords.filter((o) => o.item)) {
    const tgt = o.item === "draught-of-the-cauldron"
      ? st.sides[o.side].grave.find((c) => c.uid === o.target)
      : (o.target ? findCard(st, o.target) : null);
    if (ITEM_TARGETS[o.item] !== "none" && !tgt) continue; // no valid target: the item isn't spent
    useItem(st, o.side, o.item, tgt);
  }
  let pending = ords.filter((o) => !o.item);
  while (pending.length && !st.over) {
    pending = pending.filter((o) => o.actor && !o.actor.dead && !o.actor.removed);
    if (!pending.length) break;
    pending.sort((p, q) => speedOf(st, q.actor) - speedOf(st, p.actor) ||
      (p.side === st.fate ? -1 : 0) - (q.side === st.fate ? -1 : 0) || p.actor.slot - q.actor.slot);
    const o = pending.shift();
    const a = o.actor;
    st.acting = a.uid;
    if (o.cancelled || a.stopNow) { a.flags.acted = true; ev(st, { t: "skip", uid: a.uid, why: o.cancelled ? "cancelled" : "stopped" }); continue; }
    a.flags.acted = true;
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
        const v = valueOf(st, a, o.action, x);
        if (v <= 0) continue;
        const t2 = null;
        cand.push({ a, index: o.index, ap: o.action.ap, x, t2, v: (v / Math.max(1, o.action.ap)) * (1 + noise * (rng.next() - 0.5)) });
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
    const picked = st.sides[i].flags.rumpelPicked || [];
    const fresh = eh.filter((h) => !picked.includes(h.uid));
    if (fresh.length && rng.next() < 0.5) plan.rumpel = rng.pick(fresh).uid;
    plan.hunt = (ec && eh.find((h) => h.uid === ec.uid)) ? ec.uid : rng.pick(eh).uid;
  }
  return plan;
}

function valueOf(st, a, act, x) {
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
      if (a.id === "zmey-gorynych" && crownIs(st, a.side, "zmey-gorynych")) return 3 * (1 + countRealm(st, a, "Rus'"));
      return dmgValue(attackOf(st, a), x);
    case "Pestle": return dmgValue(5, x);
    case "Skull fire": return dmgValue(3, x);
    case "Mortar ride": return x ? (x.kind === "hero" ? 10 + x.health / 2 : 4 + x.health / 2) : 0;
    case "Excalibur": return dmgValue(5 + (x?.guardLeft || 0), x);
    case "Champion's charge": return dmgValue(5, x);
    case "Lance Charge": return dmgValue(3 + (x?.guardLeft || 0), x);
    case "Split the Arrow": return dmgValue(2, x) + (cards(st, 1 - a.side).length > 1 ? 1.5 : 0);
    case "Fair fight": return dmgValue(4, x) + (x && !x.flags.acted ? attackOf(st, x) : 0);
    case "Arm-wrench": return dmgValue(attackOf(st, a), x) + 4;
    case "Bite": return dmgValue(attackOf(st, a), x) * 1.4;
    case "Hex": return dmgValue(3 + 1, x);
    case "Sea magic": return a.health > 3 ? dmgValue(attackOf(st, a), x) - 0.5 : 0;
    case "Strike": case "Stones in the belly": return dmgValue(attackOf(st, a), x) + (name === "Stones in the belly" ? 2 : 0);
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
    case "Completion": return isNight(st) ? 0 : heroes(st, a.side).reduce((s, h) => s + missing(h), 0) - 6;
    case "Heads grow back": return isNight(st) ? 0 : Math.min(missing(a), 6) - 1;
    case "Mend": return isNight(st) ? 0 : neighbours(st, a).reduce((s, n) => s + Math.min(missing(n), 1), 0);
    case "Blood transfusion": return isNight(st) ? 0 : heroes(st, a.side).some((h) => h.uid !== a.uid && missing(h) >= 3) && a.health > 5 ? 2 : 0;
    case "Reanimate": case "Cauldron of rebirth": return x ? 8 : 0;
    case "Straw into gold": return st.sides[a.side].usedItems.length ? 3 : 0;
    case "Gnaw": return 0;
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
