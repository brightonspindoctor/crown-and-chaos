// ---------- animation and sound ----------
// Plays a round back from the engine's event stream, so every change on the board is shown with
// its cause: a melee card lunges and thumps, a ranged card shoots, magic sends a beam, items fly
// in and burst. Sounds are synthesised here with Web Audio: there are no sound files to license.
// Shared by the playtest table (play/index.html) and the prototype (game/index.html). Each page makes
// its own player with makeFX(adapter); the adapter says where the page's cards are. See the bottom of
// this file for the adapter's fields.

const PREFS = (() => {
  const read = (k, d) => { try { const v = localStorage.getItem("cf-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem("cf-" + k, JSON.stringify(v)); } catch {} };
  return { read, write };
})();
const reducedMotion = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();

// ---------- sound ----------
const SND = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = PREFS.read("muted", false);
  function ready() {
    if (muted) return null;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.55;
        const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch { return null; }
  }
  // A shaped tone: type, start and end pitch, length, volume, delay.
  function tone(type, f0, f1, dur, vol = 0.5, at = 0, filter) {
    const c = ready(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.015, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = c.createBiquadFilter(); f.type = filter[0]; f.frequency.value = filter[1]; node.connect(f); node = f; }
    node.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  // Filtered noise: filter type, start and end frequency, length, volume, delay.
  function noise(type, f0, f1, dur, vol = 0.4, at = 0, q = 1) {
    const c = ready(); if (!c) return;
    const t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const notes = (type, freqs, step, dur, vol, at = 0) => freqs.forEach((f, k) => tone(type, f, f * 1.001, dur, vol, at + k * step));
  const S = {
    thump() { tone("sine", 150, 42, 0.22, 0.9); noise("lowpass", 900, 120, 0.09, 0.55); },
    claw() { noise("bandpass", 4200, 900, 0.16, 0.5, 0, 2); noise("bandpass", 3800, 800, 0.14, 0.4, 0.05, 2); tone("sine", 120, 50, 0.15, 0.5); },
    draw() { noise("bandpass", 600, 1400, 0.12, 0.12, 0, 3); },
    arrow() { noise("bandpass", 1600, 5200, 0.3, 0.22, 0, 4); },
    thunk() { tone("triangle", 240, 90, 0.09, 0.6); noise("lowpass", 2500, 300, 0.05, 0.4); },
    bolt() { noise("bandpass", 900, 2600, 0.18, 0.25, 0, 3); },
    beam() { tone("sawtooth", 260, 820, 0.38, 0.16, 0, ["lowpass", 1800]); tone("sine", 620, 1860, 0.38, 0.18); tone("sine", 930, 2790, 0.3, 0.08, 0.04); },
    zap() { noise("highpass", 3000, 7000, 0.12, 0.3); tone("square", 900, 160, 0.14, 0.12, 0, ["lowpass", 2400]); },
    wave() { noise("lowpass", 400, 2200, 0.45, 0.35, 0, 0.7); tone("sine", 220, 440, 0.4, 0.12); },
    splash() { noise("lowpass", 3000, 300, 0.35, 0.45); },
    spark() { noise("highpass", 5000, 2000, 0.08, 0.2); },
    heal() { notes("sine", [1047, 1319, 1568], 0.07, 0.35, 0.16); notes("sine", [2093], 0.0, 0.5, 0.05, 0.2); },
    clang() { [523, 1187, 1690, 2410, 3130].forEach((f, k) => tone("sine", f, f * 0.995, 0.7 - k * 0.1, 0.18 / (k + 1) + 0.04)); noise("bandpass", 3000, 2000, 0.05, 0.25, 0, 2); },
    ping() { tone("sine", 1568, 1560, 0.45, 0.22); tone("sine", 2349, 2340, 0.35, 0.1, 0.02); },
    shing() { noise("highpass", 4000, 9000, 0.3, 0.18); tone("sine", 2637, 2600, 0.5, 0.12, 0.05); },
    death() { tone("sawtooth", 220, 48, 0.75, 0.25, 0, ["lowpass", 900]); noise("lowpass", 700, 80, 0.4, 0.45); tone("sine", 90, 40, 0.5, 0.6, 0.05); },
    rattle() { for (let k = 0; k < 7; k++) noise("highpass", 3500, 3000, 0.035, 0.28, k * 0.045 + Math.random() * 0.02, 3); },
    frost() { for (let k = 0; k < 6; k++) noise("highpass", 7000, 5000, 0.03, 0.2, k * 0.04 + Math.random() * 0.02, 2); tone("sine", 2000, 3200, 0.5, 0.06); },
    bubble() { for (let k = 0; k < 5; k++) { const f = 280 + Math.random() * 420; tone("sine", f, f * 1.8, 0.07, 0.22, k * 0.06); } },
    whoosh() { noise("bandpass", 500, 1900, 0.32, 0.22, 0, 1.5); },
    pop() { tone("sine", 520, 1250, 0.07, 0.35); },
    card() { noise("bandpass", 1200, 3200, 0.16, 0.15, 0, 2); tone("sine", 880, 1320, 0.1, 0.08, 0.06); },
    revive() { notes("triangle", [523, 659, 784, 1047], 0.09, 0.4, 0.2); },
    summon() { noise("lowpass", 300, 2600, 0.5, 0.3); notes("triangle", [392, 587], 0.12, 0.35, 0.15, 0.2); },
    miss() { noise("bandpass", 2600, 500, 0.2, 0.22, 0, 2); },
    dud() { tone("triangle", 180, 120, 0.14, 0.25); },
    tick() { tone("sine", 1400, 1400, 0.04, 0.12); },
    night() { tone("sine", 55, 52, 1.6, 0.45); tone("sine", 58, 55, 1.6, 0.35); noise("lowpass", 200, 80, 1.4, 0.2); },
    win() { notes("triangle", [392, 523, 659, 784], 0.13, 0.5, 0.25); notes("triangle", [1047], 0, 0.9, 0.18, 0.55); },
    lose() { notes("triangle", [392, 349, 311, 262], 0.18, 0.55, 0.22); },
  };
  return {
    play(name) { try { S[name]?.(); } catch {} },
    get muted() { return muted; },
    setMuted(v) { muted = v; PREFS.write("muted", v); if (!v) ready(); },
    unlock() { ready(); },
  };
})();

// ---------- animation ----------
function makeFX(A) {
  let ownSpeed = PREFS.read("speed", "normal");   // normal | fast | off, when the page has no speed setting of its own
  const speedNow = () => (A.speed ? A.speed() : ownSpeed);
  let skip = false;
  const layer = document.createElement("div"); layer.className = "fx-layer"; layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  const live = document.createElement("div"); live.className = "fx-live"; live.setAttribute("aria-live", "polite");
  document.body.appendChild(live);
  const k = () => (speedNow() === "fast" ? 0.45 : 1);
  const D = (ms) => Math.max(1, ms * k());
  const wait = (ms) => (skip ? Promise.resolve() : new Promise((r) => setTimeout(r, D(ms))));
  const anim = (el, frames, ms, opts = {}) => {
    if (skip || !el) return Promise.resolve();
    const a = el.animate(frames, { duration: D(ms), easing: "ease-out", fill: "forwards", ...opts });
    return a.finished.catch(() => {});
  };
  const cardEl = (uid) => uid == null ? null : A.cardEl(uid);
  const slotEl = (side, slot) => A.slotEl(side, slot);
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  const card = (uid) => (uid == null ? null : A.card(uid));
  let itemPos = null, nightShown = false, raised = null, actor = null;

  function spawn(cls, x, y, html = "") {
    const d = document.createElement("div"); d.className = "fx " + cls; d.innerHTML = html;
    d.style.left = x + "px"; d.style.top = y + "px"; layer.appendChild(d); return d;
  }
  async function floatText(at, text, cls) {
    if (skip || !at) return;
    const p = centre(at), d = spawn("fx-text " + cls, p.x, p.y - 6, text);
    await anim(d, [{ transform: "translate(-50%,-50%) scale(.6)", opacity: 0 }, { transform: "translate(-50%,-90%) scale(1.15)", opacity: 1, offset: 0.2 },
      { transform: "translate(-50%,-160%) scale(1)", opacity: 1, offset: 0.7 }, { transform: "translate(-50%,-210%) scale(.95)", opacity: 0 }], 1000);
    d.remove();
  }
  function say(text) { if (A.announce !== false) live.textContent = text; }
  function setHp(uid, hp) {
    const el = cardEl(uid); if (!el) return;
    const s = el.querySelector(".hp"); if (!s) return;
    if (A.setHp) A.setHp(s, hp, el); else s.textContent = `${hp}/${el.dataset.max || "?"}`;
    s.classList.remove("hp-pop"); void s.offsetWidth; s.classList.add("hp-pop");
  }
  async function shake(el, strong) {
    if (!el) return;
    const m = strong ? 9 : 5;
    el.classList.add("fx-hurt");
    await anim(el, [{ transform: "translateX(0)" }, { transform: `translateX(${-m}px) rotate(-1.5deg)` }, { transform: `translateX(${m}px) rotate(1.5deg)` },
      { transform: `translateX(${-m / 2}px)` }, { transform: "translateX(0)" }], 320, { fill: "none" });
    el.classList.remove("fx-hurt");
  }
  async function glow(el, cls, ms = 600) {
    if (!el || skip) return;
    el.classList.add(cls); await wait(ms); el.classList.remove(cls);
  }
  function burst(p, color, n = 10, spread = 46, shape = "dot") {
    if (skip || !p) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = spread * (0.5 + Math.random() * 0.7);
      const d = spawn("fx-p fx-" + shape, p.x, p.y); d.style.background = color;
      anim(d, [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r + (shape === "drop" ? 18 : 0)}px)) scale(.3)`, opacity: 0 }],
        500 + Math.random() * 300).then(() => d.remove());
    }
  }
  // Small lights travel from one point to another (heals, buffs, item effects).
  async function motes(from, to, color, n = 6) {
    if (skip || !from || !to) return;
    const ps = [];
    for (let i = 0; i < n; i++) {
      const d = spawn("fx-p fx-dot", from.x, from.y); d.style.background = color; d.style.boxShadow = `0 0 8px ${color}`;
      const mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 80, my = Math.min(from.y, to.y) - 30 - Math.random() * 40;
      const frames = [];
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * mx + t * t * to.x, y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * my + t * t * to.y;
        frames.push({ transform: `translate(${x - from.x - 3}px, ${y - from.y - 3}px)`, opacity: t > 0.9 ? 0.2 : 1 });
      }
      ps.push(anim(d, frames, 520, { delay: D(i * 45), easing: "ease-in-out" }).then(() => d.remove()));
    }
    await Promise.all(ps);
  }

  // ---------- attacks ----------
  async function lunge(a, b, impact, beast) {
    if (!a || !b || reducedMotion || skip) { await glow(a, "fx-strike", 160); await impact(); return; }
    const pa = centre(a), pb = centre(b), dx = (pb.x - pa.x) * 0.7, dy = (pb.y - pa.y) * 0.7;
    a.classList.add("fx-front");
    await anim(a, [{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${-dx * 0.08}px,${-dy * 0.08}px) scale(1.04)`, offset: 0.35 },
      { transform: `translate(${dx}px,${dy}px) scale(1.1) rotate(${dx > 0 ? 4 : -4}deg)` }], 300, { easing: "cubic-bezier(.55,0,.9,.55)" });
    SND.play(beast ? "claw" : "thump");
    if (beast) slash(pb);
    const imp = impact();
    await anim(a, [{ transform: `translate(${dx}px,${dy}px) scale(1.1)` }, { transform: "translate(0,0) scale(1)" }], 320, { easing: "cubic-bezier(.2,.8,.3,1)" });
    a.classList.remove("fx-front"); a.getAnimations().forEach((x) => x.cancel());
    await imp;
  }
  function slash(p) {
    if (skip) return;
    for (let i = 0; i < 3; i++) {
      const d = spawn("fx-slash", p.x + (i - 1) * 12, p.y);
      anim(d, [{ transform: "translate(-50%,-50%) rotate(35deg) scaleY(0)", opacity: 1 }, { transform: "translate(-50%,-50%) rotate(35deg) scaleY(1)", opacity: 1, offset: 0.4 },
        { transform: "translate(-50%,-50%) rotate(35deg) scaleY(1)", opacity: 0 }], 420, { delay: D(i * 40) }).then(() => d.remove());
    }
  }
  async function shoot(from, b, kind) {
    const pb = centre(b);
    if (!from || reducedMotion || skip) return;
    const dist = Math.hypot(pb.x - from.x, pb.y - from.y), bolt = kind === "bolt";
    SND.play("draw"); await wait(90); SND.play(bolt ? "bolt" : "arrow");
    const d = spawn("fx-arrow" + (bolt ? " fx-bolt" : ""), from.x, from.y,
      `<svg viewBox="0 0 44 10" width="${bolt ? 30 : 44}" height="10"><line x1="2" y1="5" x2="34" y2="5" stroke="#6b4a20" stroke-width="${bolt ? 3 : 2}"/><path d="M34 1 L44 5 L34 9 Z" fill="#c9cfd6"/>${bolt ? "" : '<path d="M2 5 L-3 1 M2 5 L-3 9 M6 5 L1 1 M6 5 L1 9" stroke="#b33" stroke-width="1.5"/>'}</svg>`);
    const lift = bolt ? 0 : Math.min(70, dist * 0.22), frames = [];
    for (let t = 0; t <= 1.0001; t += 0.08) {
      const x = from.x + (pb.x - from.x) * t, y = from.y + (pb.y - from.y) * t - lift * 4 * t * (1 - t);
      const dydt = (pb.y - from.y) - lift * 4 * (1 - 2 * t), ang = Math.atan2(dydt, pb.x - from.x) * 180 / Math.PI;
      frames.push({ transform: `translate(${x - from.x}px, ${y - from.y}px) translate(-50%,-50%) rotate(${ang}deg)` });
    }
    await anim(d, frames, Math.max(260, dist * (bolt ? 0.55 : 0.8)), { easing: "linear" });
    d.remove(); SND.play("thunk");
  }
  async function beam(from, b, color, kind) {
    const pb = centre(b);
    if (!from || skip) return;
    SND.play(kind === "wave" ? "wave" : "beam");
    const dist = Math.hypot(pb.x - from.x, pb.y - from.y), ang = Math.atan2(pb.y - from.y, pb.x - from.x) * 180 / Math.PI;
    const d = spawn("fx-beam" + (kind === "wave" ? " fx-wave" : ""), from.x, from.y);
    d.style.width = dist + "px"; d.style.setProperty("--c", color); d.style.transform = `translateY(-50%) rotate(${ang}deg)`;
    const orb = spawn("fx-orb", from.x, from.y); orb.style.setProperty("--c", color);
    await anim(d, [{ clipPath: "inset(0 100% 0 0)", opacity: 1 }, { clipPath: "inset(0 0 0 0)", opacity: 1 }], 220, { easing: "ease-in" });
    SND.play(kind === "wave" ? "splash" : "zap"); burst(pb, color, 12, 40);
    await anim(d, [{ opacity: 1, filter: "brightness(1.6)" }, { opacity: 0.85, filter: "brightness(1)" }, { opacity: 0 }], 360);
    d.remove(); orb.remove();
  }

  // Where a hit comes from: a card, or the item being used.
  function sourcePoint(e) {
    if (e.item && itemPos) return itemPos;
    const el = cardEl(e.src); return el ? centre(el) : null;
  }
  function hitStyle(e) {
    const s = card(e.src);
    if (e.item === "skull-lantern") return "flame";
    if (e.style === "spell") return s?.id === "the-little-mermaid" ? "wave" : "beam";
    if (e.style === "ranged") return s?.aspect === "Witch" ? "beam" : s?.id === "crossbowman" ? "bolt" : "arrow";
    return e.style;
  }
  async function impact(e, tgtEl, opts = {}) {
    const p = tgtEl ? centre(tgtEl) : null;
    if (e.shielded) { SND.play("clang"); shieldPop(p); await floatText(tgtEl, "Shielded", "fx-guard"); return; }
    if (e.dmg === 0) { SND.play("clang"); shieldPop(p); await floatText(tgtEl, e.saved ? `St George blocks ${e.saved}` : "Blocked", "fx-guard"); return; }
    if (!opts.silent) SND.play(e.style === "poison" ? "bubble" : e.style === "night" ? "dud" : "thump");
    if (e.guarded) { SND.play("clang"); floatText(tgtEl, `−${e.guarded} Guard`, "fx-guard fx-small"); }
    if (e.saved) floatText(tgtEl, `St George blocks ${e.saved}`, "fx-guard fx-small");
    setHp(e.tgt, e.hp);
    burst(p, e.style === "poison" ? "#5fae3a" : "#e04a2f", e.dmg >= 5 ? 14 : 8, 36);
    const sh = shake(tgtEl, e.dmg >= 5);
    await Promise.all([sh, floatText(tgtEl, `−${e.dmg}`, "fx-dmg" + (e.dmg >= 5 ? " fx-big" : "")),
      e.survived ? floatText(tgtEl, "Survives!", "fx-gold fx-small") : null]);
  }
  function shieldPop(p) {
    if (!p || skip) return;
    const d = spawn("fx-shield", p.x, p.y, '<svg viewBox="0 0 24 28" width="44" height="52"><path d="M12 1 L23 5 V13 C23 20 18 25 12 27 C6 25 1 20 1 13 V5 Z" fill="rgba(90,140,200,.35)" stroke="#9cc4f0" stroke-width="2"/></svg>');
    anim(d, [{ transform: "translate(-50%,-50%) scale(.4)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.15)", opacity: 1, offset: 0.3 },
      { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], 700).then(() => d.remove());
  }
  async function onHit(e) {
    const t = cardEl(e.tgt), style = hitStyle(e), from = sourcePoint(e), srcEl = e.item ? null : cardEl(e.src);
    say(`${card(e.src)?.name || (e.item ? A.itemName?.(e.item) || "" : "")} hits ${card(e.tgt)?.name} for ${e.dmg}`);
    if (style === "melee" && srcEl && t && srcEl !== t) {
      const beast = card(e.src)?.aspect === "Beast" || card(e.src)?.id === "mere-beast";
      return lunge(srcEl, t, () => impact(e, t, { silent: true }), beast);
    }
    if ((style === "arrow" || style === "bolt") && from && t) { await shoot(from, t, style); return impact(e, t, { silent: true }); }
    if ((style === "beam" || style === "wave") && from && t) { await beam(from, t, style === "wave" ? "#4fc3c8" : "#a77bff", style); return impact(e, t, { silent: true }); }
    if (style === "flame" && from && t) { await beam(from, t, "#7dff6a", "beam"); return impact(e, t, { silent: true }); }
    if (style === "poison") { bubbles(t); return impact(e, t); }
    if (style === "night") { if (!nightShown) { nightShown = true; await nightfall(); } return impact(e, t); }
    if (style === "effect" && srcEl && t && srcEl !== t) { await motes(centre(srcEl), centre(t), "#ff7a5c", 4); SND.play("spark"); }
    return impact(e, t);
  }
  function bubbles(t) {
    if (!t || skip) return;
    const p = centre(t);
    for (let i = 0; i < 7; i++) {
      const d = spawn("fx-p fx-bubble", p.x + (Math.random() - 0.5) * p.w * 0.6, p.y + p.h * 0.3);
      anim(d, [{ transform: "translate(-50%,-50%) scale(.4)", opacity: 0.9 }, { transform: `translate(-50%, ${-40 - Math.random() * 40}px) scale(1.2)`, opacity: 0 }],
        700 + Math.random() * 300, { delay: D(i * 60) }).then(() => d.remove());
    }
  }
  async function nightfall() {
    SND.play("night"); say("Nightfall");
    const board = A.boardEl(); if (!board) return;
    board.classList.add("fx-night"); await wait(900);
  }

  // ---------- items ----------
  const ITEM_FX = {
    "golden-apple": { color: "#ffd24a", shape: "dot", sound: "heal" }, "gingerbread": { color: "#b06a2c", shape: "crumb", sound: "pop" },
    "water-of-life": { color: "#6fd0ff", shape: "drop", sound: "splash" }, "mead-of-heorot": { color: "#f2b941", shape: "dot", sound: "heal" },
    "mead-of-poetry": { color: "#ffe28a", shape: "dot", sound: "ping" }, "poisoned-apple": { color: "#4f8f2a", shape: "drop", sound: "bubble" },
    "skull-lantern": { color: "#7dff6a", shape: "dot", sound: "zap" }, "spindle": { color: "#e8dcc0", shape: "thread", sound: "rattle" },
    "the-giants-sword": { color: "#d8dee6", shape: "dot", sound: "shing" }, "dragons-blood": { color: "#c3261e", shape: "drop", sound: "clang" },
    "draught-of-the-cauldron": { color: "#9be3a8", shape: "dot", sound: "revive" },
  };
  let itemCard = null;
  // Load the item paintings early so they are ready when an item flies in.
  try { for (const src of A.itemImages ? A.itemImages() : []) { const im = new Image(); im.src = src; } } catch {}
  function clearItem() { if (itemCard) { const c = itemCard; itemCard = null; anim(c, [{ opacity: 1 }, { opacity: 0 }], 200).then(() => c.remove()); } itemPos = null; }
  async function onItem(e) {
    clearItem(); actor = null;
    const board = A.boardEl(); if (!board) return;
    const br = board.getBoundingClientRect(), mid = A.midEl ? A.midEl() : null;
    const cx = br.left + br.width / 2, cy = mid ? centre(mid).y : br.top + br.height / 2;
    const fx = ITEM_FX[e.item] || { color: "#fff", shape: "dot", sound: "pop" };
    say(`${A.sideName(e.side)} uses ${e.name}`);
    if (skip) return;
    const bg = A.itemArt ? A.itemArt(e.item) : "";
    const c = spawn("fx-item fx-item-" + (e.side ? "red" : "blue"), cx, cy, `<div class="fx-item-art" style="${bg}"></div><div class="fx-item-name">${esc(e.name)}</div>`);
    itemCard = c;
    const fromY = e.side ? -br.height * 0.6 : br.height * 0.6;
    SND.play("card");
    await anim(c, [{ transform: `translate(-50%, calc(-50% + ${fromY}px)) rotateY(90deg) scale(.6)`, opacity: 0 },
      { transform: "translate(-50%,-50%) rotateY(0) scale(1.08)", opacity: 1, offset: 0.7 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1 }], 520, { easing: "cubic-bezier(.2,.8,.3,1)" });
    c.classList.add("fx-glint"); await wait(380);
    itemPos = { x: cx, y: cy };
    const t = cardEl(e.tgt);
    if (t) {
      const pt = centre(t);
      // Effects that land on a card: the item flies to it and bursts there.
      if (e.item !== "skull-lantern") {
        SND.play("whoosh");
        await anim(c, [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${pt.x - cx}px), calc(-50% + ${pt.y - cy}px)) scale(.35)`, opacity: 0.9 }], 380, { easing: "ease-in" });
        c.remove(); itemCard = null; itemPos = pt;
        SND.play(fx.sound); burst(pt, fx.color, 16, 50, fx.shape);
        if (e.item === "spindle") spindle(pt);
        if (e.item === "the-giants-sword") swordDrop(pt);
      }
    } else {
      // No target: the item bursts where it is (Mead of Poetry, Mead of Heorot, the Cauldron).
      SND.play(fx.sound); burst(itemPos, fx.color, 20, 70, fx.shape);
      if (e.item === "mead-of-poetry") floatTextAt(itemPos, "+2 action points", "fx-gold");
      await anim(c, [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(1.25)", opacity: 0 }], 500);
      c.remove(); itemCard = null;
    }
  }
  function floatTextAt(p, text, cls) {
    const d = spawn("fx-text " + cls, p.x, p.y, text);
    anim(d, [{ transform: "translate(-50%,-50%)", opacity: 0 }, { transform: "translate(-50%,-120%)", opacity: 1, offset: 0.25 }, { transform: "translate(-50%,-220%)", opacity: 0 }], 1100).then(() => d.remove());
  }
  function spindle(p) {
    const d = spawn("fx-text fx-sleep", p.x + 20, p.y - 10, "z z z");
    anim(d, [{ transform: "translate(-50%,-50%)", opacity: 0 }, { transform: "translate(-20%,-140%)", opacity: 1, offset: 0.4 }, { transform: "translate(10%,-220%)", opacity: 0 }], 1200).then(() => d.remove());
  }
  function swordDrop(p) {
    const d = spawn("fx-sword", p.x, p.y, '<svg viewBox="0 0 12 60" width="14" height="64"><path d="M6 0 L9 40 H3 Z" fill="#dfe5ec" stroke="#8a95a3"/><rect x="0" y="40" width="12" height="3" fill="#b8913e"/><rect x="4.5" y="43" width="3" height="12" fill="#5a3c22"/></svg>');
    anim(d, [{ transform: "translate(-50%,-180%) rotate(180deg)", opacity: 0 }, { transform: "translate(-50%,-60%) rotate(180deg)", opacity: 1, offset: 0.5 }, { transform: "translate(-50%,-60%) rotate(180deg)", opacity: 0 }], 900).then(() => d.remove());
  }

  // ---------- everything else ----------
  async function onAct(e) {
    clearItem();
    if (raised) raised.classList.remove("fx-acting");
    const el = cardEl(e.uid); if (!el) return;
    raised = el; el.classList.add("fx-acting"); actor = e.uid;
    say(`${card(e.uid)?.name}: ${e.name}`);
    if (A.actTags !== false && (!e.auto || speedNow() !== "fast")) {
      const tag = spawn("fx-tag" + (e.auto ? " fx-tag-auto" : ""), 0, 0, esc(e.auto ? card(e.uid)?.name || e.name : e.name));
      const p = centre(el); tag.style.left = p.x + "px"; tag.style.top = (p.y - p.h / 2 - 4) + "px";
      anim(tag, [{ transform: "translate(-50%,-80%)", opacity: 0 }, { transform: "translate(-50%,-100%)", opacity: 1, offset: 0.15 }, { transform: "translate(-50%,-100%)", opacity: 1, offset: 0.8 }, { transform: "translate(-50%,-120%)", opacity: 0 }], e.auto ? 900 : 1400).then(() => tag.remove());
    }
    SND.play("tick");
    await wait(e.auto ? 140 : 320);
  }
  async function onHeal(e) {
    const t = cardEl(e.tgt), from = e.item ? itemPos : (e.src != null && e.src !== e.tgt ? (cardEl(e.src) ? centre(cardEl(e.src)) : null) : null);
    say(`${card(e.tgt)?.name} heals ${e.amt}`);
    if (from && t) await motes(from, centre(t), "#8ee08a", 6);
    SND.play("heal"); setHp(e.tgt, e.hp);
    if (t) burst(centre(t), "#a8f0a0", 8, 30);
    await Promise.all([glow(t, "fx-healed", 500), floatText(t, `+${e.amt}`, "fx-heal")]);
  }
  async function onDeath(e) {
    const el = cardEl(e.uid); if (!el) return;
    say(`${card(e.uid)?.name} falls`);
    SND.play("death");
    if (raised === el) raised = null;
    el.classList.remove("fx-acting");
    burst(centre(el), "#5b4a3a", 18, 60);
    await anim(el, [{ filter: "grayscale(0) brightness(1)", transform: "rotate(0) translateY(0)", opacity: 1 },
      { filter: "grayscale(1) brightness(1.6)", transform: "rotate(-3deg) translateY(-4px)", opacity: 1, offset: 0.2 },
      { filter: "grayscale(1) brightness(.6)", transform: "rotate(6deg) translateY(10px) scale(.92)", opacity: 0.28 }], 700, { easing: "ease-in" });
    el.classList.add("fx-fallen");
  }
  async function onRevive(e, summon) {
    const el = slotEl(e.side, e.slot); if (!el) return;
    say(`${e.name} ${summon ? "appears" : "rises"}`);
    SND.play(summon ? "summon" : "revive");
    const p = centre(el);
    if (!skip) {
      const col = spawn("fx-pillar" + (summon ? " fx-smoke" : ""), p.x, p.y);
      anim(col, [{ transform: "translate(-50%,-50%) scaleY(0)", opacity: 0 }, { transform: "translate(-50%,-50%) scaleY(1)", opacity: 1, offset: 0.4 }, { transform: "translate(-50%,-50%) scaleY(1)", opacity: 0 }], 900).then(() => col.remove());
    }
    burst(p, summon ? "#bfb5a5" : "#fff3c0", 14, 50);
    el.getAnimations().forEach((a) => a.cancel());
    el.classList.remove("fx-fallen");
    if (A.fillSlot) A.fillSlot(el, e);
    await anim(el, [{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.06)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }], 500);
    await floatText(el, summon ? "Summoned" : "Revived", "fx-gold fx-small");
  }
  async function onSwap(e) {
    const a = cardEl(e.a), b = cardEl(e.b); if (!a || !b) return;
    say("The Dragon swaps places to save its Crown");
    SND.play("whoosh");
    const pa = centre(a), pb = centre(b);
    await Promise.all([
      anim(a, [{ transform: "translate(0,0)" }, { transform: `translate(${pb.x - pa.x}px,${pb.y - pa.y}px)` }], 520, { easing: "ease-in-out" }),
      anim(b, [{ transform: "translate(0,0)" }, { transform: `translate(${pa.x - pb.x}px,${pa.y - pb.y}px)` }], 520, { easing: "ease-in-out" }),
    ]);
    await floatText(b, "Swaps in!", "fx-gold");
  }
  async function onRedirect(e) {
    const to = cardEl(e.to), from = cardEl(e.from); if (!to || !from) return;
    say(`${card(e.to)?.name} takes the blow meant for ${card(e.from)?.name}`);
    SND.play("whoosh");
    if (!reducedMotion && !skip) {
      const pt = centre(to), pf = centre(from), dx = (pf.x - pt.x) * 0.45, dy = (pf.y - pt.y) * 0.45;
      to.classList.add("fx-front");
      await anim(to, [{ transform: "translate(0,0)" }, { transform: `translate(${dx}px,${dy}px) scale(1.06)` }], 220, { easing: "ease-out" });
      floatText(to, "Intercepts!", "fx-gold fx-small");
      await wait(160);
      anim(to, [{ transform: `translate(${dx}px,${dy}px) scale(1.06)` }, { transform: "translate(0,0)" }], 320).then(() => { to.classList.remove("fx-front"); to.getAnimations().forEach((x) => x.cancel()); });
    } else await floatText(to, "Intercepts!", "fx-gold fx-small");
  }
  async function onMiss(e) {
    const t = cardEl(e.tgt), s = cardEl(e.src);
    say(`${card(e.src)?.name} misses`);
    SND.play("miss");
    if (t && !reducedMotion) anim(t, [{ transform: "translateX(0)" }, { transform: "translateX(18px)", offset: 0.4 }, { transform: "translateX(0)" }], 500, { fill: "none" });
    if (s) glow(s, "fx-strike", 200);
    await floatText(t, "Miss!", "fx-miss");
  }
  // Status effects show their cause: a beam or lights from the card acting, or from the item.
  async function status(e, text, cls, sound, extra, cause) {
    const t = cardEl(e.tgt ?? e.uid);
    const srcUid = e.src ?? actor, srcEl = srcUid != null && srcUid !== (e.tgt ?? e.uid) ? cardEl(srcUid) : null;
    const from = e.item ? null : srcEl ? centre(srcEl) : null;
    if (cause && from && t) {
      if (cause === "beam") await beam(from, t, cls.includes("frost") ? "#bfe6ff" : "#c9b8ff", "beam");
      else await motes(from, centre(t), cause, 5);
    }
    SND.play(sound);
    if (extra) extra(t);
    await floatText(t, text, cls);
  }
  async function onGuardUp(e) {
    const s = e.src ?? actor;
    const t = cardEl(e.tgt), from = e.item ? itemPos : (s != null && s !== e.tgt && cardEl(s) ? centre(cardEl(s)) : null);
    if (from && t) await motes(from, centre(t), "#8fb8ee", 4);
    SND.play("ping"); if (t) shieldPop(centre(t));
    await floatText(t, `+${e.amt} Guard`, "fx-guard");
  }
  async function onOver(e) {
    clearItem(); if (raised) raised.classList.remove("fx-acting");
    SND.play(e.winner < 0 ? "lose" : "win");
    say(e.winner < 0 ? "A draw" : `${A.sideName(e.winner)} wins`);
    await wait(700);
  }
  async function onPhase(e) {
    actor = null;
    const mid = A.midEl ? A.midEl() : null; if (!mid) return;
    const text = e.name === "upkeep" ? "End of round: poison, Nightfall and Crown passives" : "Items first, then cards in Speed order";
    mid.textContent = text; mid.classList.remove("fx-phase"); void mid.offsetWidth; mid.classList.add("fx-phase");
    await wait(e.name === "upkeep" ? 250 : 350);
  }

  const HANDLERS = {
    phase: onPhase, act: onAct, item: onItem, hit: onHit, heal: onHeal, death: onDeath,
    revive: (e) => onRevive(e, false), appear: (e) => onRevive(e, true), swap: onSwap, redirect: onRedirect, miss: onMiss,
    stop: (e) => status(e, "Stopped", "fx-stop", "rattle", (t) => t && t.classList.add("fx-stopped"), "beam"),
    freeze: (e) => status(e, "Frozen", "fx-frost", "frost", (t) => t && t.classList.add("fx-frozen"), "beam"),
    skip: (e) => status(e, e.why === "frozen" ? "Frozen: skips" : e.why === "cancelled" ? "Cancelled" : "Stopped: skips", "fx-stop fx-small", "dud"),
    wasted: (e) => status(e, "Wasted: no target", "fx-stop fx-small", "dud"),
    guardUp: onGuardUp,
    attackUp: (e) => status(e, `+${e.amt} Attack`, "fx-gold", "shing", null, "#ffd45c"),
    poison: (e) => status(e, `+${e.amt} Poison`, "fx-poison", "bubble", bubbles, "#8fd14f"),
    hp: (e) => e.delta > 0 ? onHeal({ ...e, amt: e.delta }) : impact({ ...e, dmg: -e.delta, style: "effect" }, cardEl(e.tgt)),
    over: onOver,
  };

  async function play(events) {
    skip = speedNow() === "off";
    nightShown = !!A.boardEl()?.classList.contains("fx-night");
    raised = null; itemPos = null; actor = null;
    const board = A.boardEl();
    if (board && !skip) board.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    // Pause briefly between steps so each cause and effect can be read.
    const gap = { act: 0, hit: 120, heal: 80, death: 160, item: 120, phase: 0 };
    for (const e of events) {
      const h = HANDLERS[e.t];
      if (h) { try { await h(e); } catch (err) { console.warn("fx", e, err); } }
      await wait(gap[e.t] ?? 60);
    }
    clearItem();
    if (raised) raised.classList.remove("fx-acting");
    layer.replaceChildren();
    skip = false;
  }
  return {
    play,
    skipNow() { skip = true; layer.replaceChildren(); },
    get skipping() { return skip; },
    get speed() { return speedNow(); },
    setSpeed(v) { ownSpeed = v; PREFS.write("speed", v); },
  };
}
// The adapter a page passes to makeFX:
//   cardEl(uid), slotEl(side, slot), boardEl(), midEl()?   where the page's elements are
//   card(uid)                                                 the engine's card (name, id, aspect)
//   sideName(i)                                               "Blue"/"Red", or "You"/"The enemy"
//   setHp(el, hp, cardEl)?                                    writes a health number (default "hp/max")
//   itemArt(id)? itemImages()?                                CSS for an item's painting, and files to preload
//   fillSlot(el, event)?                                      draws a revived card into an empty slot
//   speed()?                                                  "normal" | "fast" | "off" if the page owns the setting
//   announce, actTags                                         false to leave announcements or action tags to the page
