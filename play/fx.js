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
  let ctx = null, master = null, musicBus = null, noiseBuf = null;
  let muted = PREFS.read("muted", false);           // sound effects off
  let sfxVol = PREFS.read("sfxVol", 0.8);           // 0..1
  let musicOn = PREFS.read("music", true);
  let musicVol = PREFS.read("musicVol", 0.4);       // 0..1
  function ensure() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
        master = ctx.createGain(); master.gain.value = 0.55 * sfxVol; master.connect(comp);
        musicBus = ctx.createGain(); musicBus.gain.value = 0.3 * musicVol; musicBus.connect(comp);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch { return null; }
  }
  function ready() { return muted ? null : ensure(); }
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
  // A brass-like horn note: a filtered sawtooth with a sine underneath.
  const horn = (f, at, dur, vol = 0.18) => { tone("sawtooth", f * 0.985, f, dur, vol, at, ["lowpass", 1500]); tone("sine", f, f, dur, vol * 0.7, at); };
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
    fire() { noise("lowpass", 260, 1500, 0.75, 0.55, 0, 0.8); noise("bandpass", 900, 450, 0.65, 0.25, 0.05, 1); tone("sawtooth", 70, 48, 0.7, 0.12, 0, ["lowpass", 260]);
      for (let k = 0; k < 9; k++) noise("highpass", 4200, 3000, 0.02, 0.2, 0.05 + k * 0.07 + Math.random() * 0.03, 2); },
    ignite() { noise("lowpass", 2600, 180, 0.45, 0.5); tone("sine", 95, 38, 0.32, 0.5); for (let k = 0; k < 5; k++) noise("highpass", 5000, 3500, 0.02, 0.18, 0.1 + k * 0.08, 2); },
    thunder() { noise("lowpass", 7000, 300, 0.12, 0.65); for (let k = 0; k < 5; k++) noise("highpass", 6000, 2000, 0.03, 0.3, k * 0.035, 1); noise("lowpass", 420, 55, 1.0, 0.5, 0.08); tone("sine", 60, 34, 0.9, 0.5, 0.05); },
    holy() { notes("sine", [523, 659, 784, 1047], 0, 1.0, 0.11); noise("highpass", 4000, 9000, 0.3, 0.16); tone("sine", 2637, 2600, 0.6, 0.1, 0.05); },
    swoosh() { noise("bandpass", 300, 2800, 0.24, 0.38, 0, 1.2); },
    crunch() { noise("bandpass", 1800, 600, 0.12, 0.55, 0, 1.5); tone("square", 140, 60, 0.1, 0.2, 0, ["lowpass", 800]); noise("bandpass", 1500, 500, 0.1, 0.4, 0.08, 1.5); },
    stone() { tone("triangle", 190, 70, 0.13, 0.65); noise("lowpass", 1600, 200, 0.12, 0.55); },
    wind() { noise("bandpass", 380, 1700, 0.85, 0.38, 0, 3); noise("bandpass", 1700, 480, 0.65, 0.26, 0.3, 3); },
    smash() { tone("sine", 115, 30, 0.38, 1); noise("lowpass", 1300, 70, 0.34, 0.75); },
    night() { tone("sine", 55, 52, 1.6, 0.45); tone("sine", 58, 55, 1.6, 0.35); noise("lowpass", 200, 80, 1.4, 0.2); },
    // Results and the call to battle: war drums, a horn, and a fanfare, a stalemate or a lament.
    battle() {
      [0, 0.2, 0.4].forEach((at, k) => { tone("sine", 120, 42, 0.32, k === 2 ? 1 : 0.75, at); noise("lowpass", 800, 90, 0.16, 0.45, at); });
      horn(294, 0.62, 0.32); horn(440, 0.92, 0.32); horn(587, 1.22, 0.9);
      noise("highpass", 5000, 8000, 0.5, 0.06, 1.22);
    },
    win() {
      tone("sine", 110, 40, 0.4, 0.9); noise("lowpass", 900, 90, 0.2, 0.45);
      [587, 740, 880].forEach((f, k) => horn(f, 0.08 + k * 0.13, 0.26));
      [587, 740, 880, 1175].forEach((f) => horn(f, 0.5, 1.4, 0.11));
      notes("sine", [2349, 2794, 3520], 0.09, 0.6, 0.07, 0.55);
      tone("sine", 120, 45, 0.45, 0.8, 0.5); noise("highpass", 5000, 9000, 0.8, 0.08, 0.5);
    },
    tie() { // a drawn fight (not the bowstring "draw" above)
      tone("sine", 100, 50, 0.4, 0.6); noise("lowpass", 600, 90, 0.18, 0.35);
      horn(440, 0.1, 0.38); horn(392, 0.5, 1.3, 0.14); horn(587, 0.5, 1.3, 0.1);
      tone("sine", 196, 196, 1.6, 0.12, 0.5);
    },
    lose() {
      tone("sine", 73, 73, 2.2, 0.28); tone("sine", 110, 109, 2.2, 0.1);
      [294, 262, 233, 220].forEach((f, k) => horn(f, 0.1 + k * 0.32, k === 3 ? 1.4 : 0.36, 0.15));
      tone("sine", 90, 35, 0.7, 0.9, 1.15); noise("lowpass", 500, 60, 0.5, 0.4, 1.15);
    },
  };
  // ---------- music ----------
  // A quiet, endless tune made on the spot: a low drone under a plucked, lute-like line that wanders
  // through D minor, C and B flat. Synthesised like the sound effects, so there is nothing to license.
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CHORDS = [[50, 57, 62, 65, 69], [48, 55, 60, 64, 67], [46, 53, 58, 62, 65], [48, 55, 60, 64, 67]];
  const LINES = [[0, 2, 3, 4, 3, 2, 1, 2], [0, 1, 2, 4, 2, 3, 1, 0], [0, 2, 4, 3, 2, 1, 2, 3]];
  let mTimer = null, nextT = 0, mStep = 0, line = LINES[0];
  function pluck(f, t, dur, vol) {
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function pad(f, t, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 1.2); g.gain.setValueAtTime(vol, t + dur - 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function schedule() {
    const eighth = 60 / 84 / 2;
    while (nextT < ctx.currentTime + 0.8) {
      const bar = Math.floor(mStep / 8) % 4, i = mStep % 8, ch = CHORDS[bar];
      if (i === 0) {
        if (bar === 0) line = LINES[Math.floor(Math.random() * LINES.length)];
        pad(mtof(ch[0] - 12), nextT, eighth * 8.4, 0.22); pad(mtof(ch[1] - 12), nextT, eighth * 8.4, 0.12);
      }
      if (Math.random() < 0.88) pluck(mtof(ch[line[i]] + (i === 4 && Math.random() < 0.3 ? 12 : 0)), nextT, 0.9, i % 4 === 0 ? 0.16 : 0.11);
      nextT += eighth; mStep += 1;
    }
  }
  function startMusic() {
    if (!musicOn || mTimer) return;
    const c = ensure(); if (!c) return;
    nextT = c.currentTime + 0.15; mStep = 0; mTimer = setInterval(schedule, 150); schedule();
  }
  function stopMusic() { clearInterval(mTimer); mTimer = null; }
  return {
    play(name) { try { S[name]?.(); } catch {} },
    get muted() { return muted; },
    setMuted(v) { muted = v; PREFS.write("muted", v); if (!v) ready(); },
    get volume() { return sfxVol; },
    setVolume(v) { sfxVol = Math.max(0, Math.min(1, v)); PREFS.write("sfxVol", sfxVol); if (master) master.gain.value = 0.55 * sfxVol; },
    get music() { return musicOn; },
    setMusic(v) { musicOn = v; PREFS.write("music", v); if (v) startMusic(); else stopMusic(); },
    get musicVolume() { return musicVol; },
    setMusicVolume(v) { musicVol = Math.max(0, Math.min(1, v)); PREFS.write("musicVol", musicVol); if (musicBus) musicBus.gain.value = 0.3 * musicVol; },
    startMusic,
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

  // ---------- themed effects: fire, water, ice, lightning, holy light, wind, stone, rope ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  // One particle that drifts from p by (dx, dy), changing size and fading.
  function puff(cls, p, dx, dy, ms, o = {}) {
    if (skip || !p) return Promise.resolve();
    const d = spawn(cls, p.x, p.y); if (o.color) d.style.setProperty("--c", o.color);
    return anim(d, [{ transform: `translate(-50%,-50%) scale(${o.s0 ?? 0.5}) rotate(${o.r0 || 0}deg)`, opacity: o.o0 ?? 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${o.s1 ?? 1.3}) rotate(${o.r1 || 0}deg)`, opacity: 0 }],
      ms, { delay: D(o.delay || 0), easing: o.ease || "ease-out" }).then(() => d.remove());
  }
  // A stream of particles from one point to another: fire, the Skull Lantern's green fire, ice shards.
  async function stream(from, to, kind, ms = 520) {
    if (!from || !to || skip) return;
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const fire = kind !== "ice", cls = { fire: "fx-flame", green: "fx-flame fx-green", ice: "fx-shard" }[kind], n = fire ? 46 : 28;
    if (fire) { const g = spawn("fx-glow" + (kind === "green" ? " fx-green" : ""), from.x, from.y); anim(g, [{ transform: "translate(-50%,-50%) scale(.4)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.3)", opacity: 0.9, offset: 0.3 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], ms + 200).then(() => g.remove()); }
    for (let i = 0; i < n; i++) {
      const spread = Math.min(34, len * 0.16) * (fire ? 1.2 : 1), j = rnd(-1, 1) * spread;
      // fire widens into a cone as it travels; each flame grows, turns and fades
      puff(cls, from, dx + nx * j, dy + ny * j, rnd(340, 500), { delay: (i / n) * ms * 0.75, s0: fire ? 0.5 : 0.35, s1: fire ? rnd(2.2, 3.4) : 0.9,
        o0: 1, ease: "cubic-bezier(.3,.6,.5,1)", r0: rnd(-40, 40), r1: fire ? rnd(-140, 140) : rnd(-30, 30) });
      if (fire && i % 4 === 0) puff("fx-p fx-smoke", { x: from.x + dx * 0.6, y: from.y + dy * 0.6 }, dx * 0.35 + rnd(-10, 10), dy * 0.35 - rnd(20, 50), rnd(700, 950), { delay: (i / n) * ms * 0.75 + 150, s0: 0.8, s1: 3, o0: 0.5 });
    }
    await wait(ms);
  }
  // Effects that wrap a card: flames licking up it, frost crystals, a splash of water.
  function engulf(el, kind) {
    if (!el || skip) return;
    const r = el.getBoundingClientRect(), p = centre(el);
    if (kind === "fire" || kind === "green") {
      const cls = kind === "green" ? "fx-flame fx-green" : "fx-flame";
      const g = spawn("fx-glow fx-big" + (kind === "green" ? " fx-green" : ""), p.x, p.y + r.height * 0.15);
      anim(g, [{ transform: "translate(-50%,-50%) scale(.5)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.2)", opacity: 1, offset: 0.25 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], 950).then(() => g.remove());
      for (let i = 0; i < 22; i++) {
        const q = { x: r.left + r.width * rnd(0.04, 0.96), y: r.bottom - r.height * rnd(0.0, 0.35) };
        puff(cls, q, rnd(-8, 8), -r.height * rnd(0.5, 0.95), rnd(520, 820), { delay: rnd(0, 320), s0: 0.8, s1: rnd(2, 3.2), r0: rnd(-15, 15), r1: rnd(-30, 30) });
      }
      for (let i = 0; i < 5; i++) puff("fx-p fx-smoke", { x: r.left + r.width * rnd(0.2, 0.8), y: r.top + r.height * 0.3 }, rnd(-15, 15), -rnd(50, 90), rnd(900, 1200), { delay: rnd(200, 500), s0: 1, s1: 3.5, o0: 0.45 });
      embers(p, kind === "green" ? "#b6ff7a" : "#ffb347");
      el.classList.add("fx-scorch"); setTimeout(() => el.classList.remove("fx-scorch"), D(900));
    } else if (kind === "ice") {
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; puff("fx-shard", p, Math.cos(a) * r.width * 0.6, Math.sin(a) * r.height * 0.55, 620, { s0: 1.2, s1: 0.4, r0: a * 57 + 90, r1: a * 57 + 90 }); }
      el.classList.add("fx-iced"); setTimeout(() => el.classList.remove("fx-iced"), D(850));
    } else if (kind === "water") {
      for (let i = 0; i < 16; i++) puff("fx-droplet", { x: p.x + rnd(-r.width * 0.32, r.width * 0.32), y: p.y + r.height * 0.2 }, rnd(-34, 34), -rnd(30, 80), 640, { s0: 1, s1: 0.5, ease: "cubic-bezier(.2,.8,.6,1)" });
      ring(p, "#7fe0ff", 1.3);
    }
  }
  function embers(p, color) {
    if (!p || skip) return;
    for (let i = 0; i < 10; i++) puff("fx-p fx-dot fx-glowdot", { x: p.x + rnd(-p.w * 0.4, p.w * 0.4), y: p.y + rnd(0, p.h * 0.3) }, rnd(-22, 22), -rnd(50, 110), rnd(800, 1200), { delay: rnd(100, 400), s0: 1, s1: 0.3, color });
  }
  // An expanding shockwave ring.
  function ring(p, color, size = 1) {
    if (!p || skip) return;
    const d = spawn("fx-ring", p.x, p.y); d.style.setProperty("--c", color);
    anim(d, [{ transform: "translate(-50%,-50%) scale(.2)", opacity: 1 }, { transform: `translate(-50%,-50%) scale(${2.2 * size})`, opacity: 0 }], 520, { easing: "cubic-bezier(.2,.7,.4,1)" }).then(() => d.remove());
  }
  // Shakes the whole board for a heavy blow.
  function quake(n = 6) {
    const b = A.boardEl(); if (!b || skip || reducedMotion) return;
    anim(b, [{ transform: "translate(0,0)" }, { transform: `translate(${-n}px,${n / 2}px)` }, { transform: `translate(${n}px,${-n / 2}px)` },
      { transform: `translate(${-n / 2}px,0)` }, { transform: "translate(0,0)" }], 280, { fill: "none" });
  }
  // A brief flash over the whole screen.
  function flash(color, op = 0.3) {
    if (skip || reducedMotion) return;
    const d = spawn("fx-flash", 0, 0); d.style.background = color;
    anim(d, [{ opacity: op }, { opacity: 0 }], 280).then(() => d.remove());
  }
  // A forked lightning bolt between two points.
  async function lightning(from, to) {
    if (!from || !to || skip) return;
    SND.play("thunder");
    const pts = [], n = 9;
    for (let i = 0; i <= n; i++) { const t = i / n, j = i === 0 || i === n ? 0 : rnd(-20, 20); pts.push([(from.x + (to.x - from.x) * t + j).toFixed(1), (from.y + (to.y - from.y) * t + (i % n ? rnd(-10, 10) : 0)).toFixed(1)]); }
    const line = pts.map((q) => q.join(",")).join(" ");
    const d = spawn("fx-boltsvg", 0, 0, `<svg width="${innerWidth}" height="${innerHeight}"><polyline points="${line}" fill="none" stroke="#9fd0ff" stroke-width="10" stroke-opacity=".4" stroke-linejoin="round"/><polyline points="${line}" fill="none" stroke="#fffde8" stroke-width="3" stroke-linejoin="round"/></svg>`);
    flash("#dff0ff", 0.35);
    await anim(d, [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }, { opacity: 0 }], 440, { easing: "linear" });
    d.remove(); burst(to, "#cfe8ff", 14, 44); ring(to, "#bfe0ff", 0.9);
  }
  // A thrown object (a stone, a golden arrow) on an arc, with an optional sparkling trail.
  async function throwAt(from, to, html, o = {}) {
    if (!from || !to || skip) return;
    const d = spawn("fx-thrown", from.x, from.y, html), dist = Math.hypot(to.x - from.x, to.y - from.y), lift = o.lift ?? Math.min(80, dist * 0.28), frames = [];
    for (let t = 0; t <= 1.0001; t += 0.08) {
      const x = (to.x - from.x) * t, y = (to.y - from.y) * t - lift * 4 * t * (1 - t);
      const ang = o.aim ? Math.atan2((to.y - from.y) - lift * 4 * (1 - 2 * t), to.x - from.x) * 180 / Math.PI : (o.spin || 0) * t;
      frames.push({ transform: `translate(${x}px, ${y}px) translate(-50%,-50%) rotate(${ang}deg)` });
    }
    const iv = o.trail ? setInterval(() => { const r = d.getBoundingClientRect(); puff("fx-p fx-dot fx-glowdot", { x: r.left + r.width / 2, y: r.top + r.height / 2 }, rnd(-6, 6), rnd(-6, 6), 420, { s0: 1, s1: 0.2, color: o.trail }); }, 28) : null;
    await anim(d, frames, Math.max(300, dist * (o.speed || 0.7)), { easing: "linear" });
    if (iv) clearInterval(iv);
    d.remove();
  }
  // A sweeping crescent: tail sweeps, quarterstaffs, axes, rampages.
  function sweep(p, color = "#ffffff") {
    if (!p || skip) return;
    const d = spawn("fx-sweep", p.x, p.y, `<svg viewBox="-60 -60 120 120" width="140" height="140"><path d="M-50 20 A54 54 0 0 1 42 -34" pathLength="1" stroke="${color}"/></svg>`);
    anim(d.querySelector("path"), [{ strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.55 }, { strokeDashoffset: 0, opacity: 0 }], 400);
    setTimeout(() => d.remove(), D(440));
  }
  // One bright sword streak across the target.
  function blade(p) {
    if (!p || skip) return;
    const d = spawn("fx-blade", p.x, p.y);
    anim(d, [{ transform: "translate(-50%,-50%) rotate(-35deg) scaleX(0)", opacity: 1 }, { transform: "translate(-50%,-50%) rotate(-35deg) scaleX(1)", opacity: 1, offset: 0.45 },
      { transform: "translate(-50%,-50%) rotate(-35deg) scaleX(1.1)", opacity: 0 }], 300).then(() => d.remove());
  }
  // A glowing, turning circle of runes.
  function runes(p, color) {
    if (!p || skip) return;
    const d = spawn("fx-runes", p.x, p.y, `<svg viewBox="-50 -50 100 100" width="84" height="84"><circle r="44"/><circle r="34" stroke-dasharray="4 6"/><path d="M0 -44 L38 22 L-38 22 Z M0 44 L-38 -22 L38 -22 Z"/></svg>`); d.style.setProperty("--c", color);
    anim(d, [{ transform: "translate(-50%,-50%) scale(.3) rotate(0deg)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1) rotate(90deg)", opacity: 1, offset: 0.4 },
      { transform: "translate(-50%,-50%) scale(1.15) rotate(200deg)", opacity: 0 }], 950).then(() => d.remove());
  }
  // A shaft of golden light falls on a card, with a starburst (Excalibur).
  function holyLight(el) {
    if (!el || skip) return;
    const p = centre(el), d = spawn("fx-holy", p.x, p.y + p.h / 2);
    anim(d, [{ transform: "translate(-50%,-100%) scaleY(0)", opacity: 0 }, { transform: "translate(-50%,-100%) scaleY(1)", opacity: 1, offset: 0.3 }, { transform: "translate(-50%,-100%) scaleY(1)", opacity: 0 }], 800).then(() => d.remove());
    const x = spawn("fx-cross", p.x, p.y);
    anim(x, [{ transform: "translate(-50%,-50%) scale(.2) rotate(0)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(1.5) rotate(45deg)", opacity: 0 }], 650).then(() => x.remove());
  }
  // A whirlwind spinning over a card (Koschei).
  function whirl(el) {
    if (!el || skip) return;
    const p = centre(el); SND.play("wind");
    for (let i = 0; i < 4; i++) {
      const d = spawn("fx-whirl", p.x, p.y);
      anim(d, [{ transform: `translate(-50%,-50%) scale(${0.35 + i * 0.22}) rotate(0deg)`, opacity: 0.95 }, { transform: `translate(-50%,-62%) scale(${1 + i * 0.3}) rotate(${600 + i * 90}deg)`, opacity: 0 }],
        850, { delay: D(i * 70), easing: "ease-in" }).then(() => d.remove());
    }
    for (let i = 0; i < 10; i++) puff("fx-p fx-leaf", p, rnd(-60, 60), -rnd(20, 80), rnd(600, 900), { delay: rnd(0, 300), s0: 1, s1: 0.6, r0: 0, r1: rnd(300, 720) });
  }
  // Jaws snap shut on a card, then drops of blood.
  function bite(p) {
    if (!p || skip) return;
    for (const top of [true, false]) {
      const teeth = top ? "M0 0 H60 L54 14 L48 2 L42 14 L36 2 L30 14 L24 2 L18 14 L12 2 L6 14 Z" : "M0 16 H60 L54 2 L48 14 L42 2 L36 14 L30 2 L24 14 L18 2 L12 14 L6 2 Z";
      const d = spawn("fx-jaw", p.x, p.y, `<svg viewBox="0 0 60 16" width="66" height="18"><path d="${teeth}" fill="#f4efe2" stroke="#6b1010" stroke-width="1"/></svg>`);
      anim(d, [{ transform: `translate(-50%, ${top ? -190 : 90}%)`, opacity: 0.2 }, { transform: `translate(-50%, ${top ? -62 : -38}%)`, opacity: 1, offset: 0.5 },
        { transform: `translate(-50%, ${top ? -62 : -38}%)`, opacity: 0 }], 440, { easing: "cubic-bezier(.6,0,.9,.5)" }).then(() => d.remove());
    }
    setTimeout(() => burst(p, "#9e0d0d", 12, 36, "drop"), D(220));
  }
  // Ash and cinders rising from a card that falls.
  function ash(el) {
    if (!el || skip) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 16; i++) puff("fx-p fx-ash", { x: r.left + rnd(0.1, 0.9) * r.width, y: r.top + rnd(0.3, 0.95) * r.height }, rnd(-22, 22), -rnd(40, 100), rnd(800, 1250), { delay: rnd(0, 260), s0: 1, s1: 0.4, r1: rnd(-180, 180) });
  }
  // A golden cord loops round a card and pulls tight (Girdle Leash).
  function rope(el) {
    if (!el || skip) return;
    const p = centre(el);
    const d = spawn("fx-rope", p.x, p.y, `<svg viewBox="-60 -70 120 140" width="${p.w * 1.3}" height="${p.h * 1.15}"><ellipse rx="54" ry="18" cy="-24" pathLength="1"/><ellipse rx="54" ry="18" cy="20" pathLength="1"/></svg>`);
    d.querySelectorAll("ellipse").forEach((e, i) => anim(e, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], 440, { delay: D(i * 130) }));
    anim(d, [{ transform: "translate(-50%,-50%) scale(1.18)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(.94)", opacity: 1, offset: 0.65 }, { transform: "translate(-50%,-50%) scale(.94)", opacity: 0 }], 1200).then(() => d.remove());
  }
  // A drifting violet mist with "z z z" (Enchanted sleep).
  function sleepMist(el) {
    if (!el || skip) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 9; i++) puff("fx-p fx-mist", { x: r.left + rnd(0.1, 0.9) * r.width, y: r.top + rnd(0.4, 0.9) * r.height }, rnd(-20, 20), -rnd(10, 40), rnd(900, 1300), { delay: rnd(0, 300), s0: 0.8, s1: 2.4, o0: 0.8 });
    spindle(centre(el));
  }
  // The moon rises and stars come out over the board when night falls.
  function nightSky() {
    const b = A.boardEl(); if (!b || skip) return;
    const r = b.getBoundingClientRect();
    const m = spawn("fx-moon", r.right - 54, r.top + 44);
    anim(m, [{ transform: "translate(-50%,-10%)", opacity: 0 }, { transform: "translate(-50%,-50%)", opacity: 1, offset: 0.45 }, { transform: "translate(-50%,-50%)", opacity: 0 }], 2400).then(() => m.remove());
    for (let i = 0; i < 18; i++) puff("fx-p fx-star", { x: r.left + rnd(0.05, 0.95) * r.width, y: r.top + rnd(0.03, 0.45) * r.height }, 0, 0, rnd(1300, 2100), { delay: rnd(0, 600), s0: 0.4, s1: 1.3 });
  }
  // Shadow wisps rising from a card hurt by the dark.
  function shadows(el) {
    if (!el || skip) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 9; i++) puff("fx-p fx-shadow", { x: r.left + rnd(0.15, 0.85) * r.width, y: r.bottom - 6 }, rnd(-12, 12), -r.height * rnd(0.5, 0.95), rnd(700, 1050), { delay: rnd(0, 220), s0: 0.6, s1: 2.2 });
  }
  // Green crosses rising from a healed card.
  function sparkles(el, color) {
    if (!el || skip) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 9; i++) puff("fx-plus", { x: r.left + rnd(0.15, 0.85) * r.width, y: r.top + rnd(0.5, 0.95) * r.height }, rnd(-6, 6), -rnd(30, 64), rnd(700, 950), { delay: rnd(0, 260), s0: 0.6, s1: 1.15, color });
  }
  // Green drops running down a poisoned card.
  function drips(el) {
    if (!el || skip) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 7; i++) puff("fx-p fx-drop fx-glowdot", { x: r.left + rnd(0.15, 0.85) * r.width, y: r.top + r.height * 0.2 }, 0, r.height * rnd(0.4, 0.7), rnd(700, 1000), { delay: rnd(0, 300), s0: 1, s1: 0.7, color: "#7fd04a", ease: "ease-in" });
  }

  // ---------- attacks ----------
  async function lunge(a, b, impact, beast, reach = 0.7) {
    if (!a || !b || reducedMotion || skip) { await glow(a, "fx-strike", 160); await impact(); return; }
    const pa = centre(a), pb = centre(b), dx = (pb.x - pa.x) * reach, dy = (pb.y - pa.y) * reach;
    a.classList.add("fx-front");
    await anim(a, [{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${-dx * 0.08}px,${-dy * 0.08}px) scale(1.04)`, offset: 0.35 },
      { transform: `translate(${dx}px,${dy}px) scale(1.1) rotate(${dx > 0 ? 4 : -4}deg)` }], 300, { easing: "cubic-bezier(.55,0,.9,.55)" });
    SND.play(beast ? "claw" : "thump");
    if (beast === true) slash(pb); else if (beast !== "none") blade(pb);
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
    burst(p, opts.color || (e.style === "poison" ? "#5fae3a" : "#e04a2f"), e.dmg >= 5 ? 14 : 8, 36);
    if (e.dmg >= 5) { quake(e.dmg >= 7 ? 9 : 6); ring(p, opts.color || "#ff7a5c", 1); }
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
  // Which effect an attack gets: by the action being taken, then by who is acting. Anything else uses the hit's style.
  const ACTION_FX = {
    "Fire Breath": "fire", "Skull fire": "fire", "The Pyre": "pyre", "Into the oven": "oven",
    "Hex": "hex", "Sea magic": "wave", "Drag under": "drown", "Excalibur": "holy", "Strike": "lightning",
    "Lance Charge": "charge", "Champion's charge": "charge", "Betrayal": "charge",
    "Pestle": "smash", "Arm-wrench": "smash", "Break their spirit": "smash",
    "Bite": "bite", "Claw": "claws", "Tail Sweep": "sweep", "Rampage": "sweep", "Quarterstaff": "sweep",
    "Whirlwind": "whirl", "Split the Arrow": "goldarrow", "Stones in the belly": "stone",
  };
  const CARD_FX = { "berserker": "sweep", "the-snow-queen": "ice", "gwydion": "hex", "the-bride": "lightning", "baba-yaga": "fire" };
  let actNow = null, pyreLit = false, lastBite = null;
  function themeOf(e) {
    if (e.item === "skull-lantern") return "lantern";
    if (e.item || e.style === "poison" || e.style === "night" || reducedMotion) return null;
    if (!actNow || actNow.uid !== e.src) return null;
    return ACTION_FX[actNow.name] || (e.style !== "effect" ? CARD_FX[actNow.id] : null) || null;
  }
  const GOLD_ARROW = `<svg viewBox="0 0 48 12" width="50" height="12"><line x1="2" y1="6" x2="36" y2="6" stroke="#ffe08a" stroke-width="2.5"/><path d="M36 1 L48 6 L36 11 Z" fill="#fff6c8"/><path d="M2 6 L-3 1 M2 6 L-3 11 M7 6 L2 1 M7 6 L2 11" stroke="#ffd45c" stroke-width="1.6"/></svg>`;
  const STONE = `<svg viewBox="0 0 20 16" width="20" height="16"><path d="M3 5 L9 1 L17 3 L19 10 L12 15 L4 13 Z" fill="#8a8580" stroke="#4a4540" stroke-width="1.2"/><path d="M7 5 L11 4" stroke="#b5b0aa"/></svg>`;
  async function themedHit(theme, e, t, from, srcEl) {
    const tp = centre(t), melee = srcEl && srcEl !== t;
    switch (theme) {
      case "fire": case "lantern": {
        const green = theme === "lantern";
        if (from) { SND.play("fire"); await stream(from, tp, green ? "green" : "fire"); }
        SND.play("ignite"); engulf(t, green ? "green" : "fire");
        return impact(e, t, { silent: true, color: green ? "#7dff6a" : "#ff8a2a" });
      }
      case "pyre": {
        if (!pyreLit) { pyreLit = true; SND.play("fire"); flash("#ff8a2a", 0.3); quake(9); if (srcEl) { ring(centre(srcEl), "#ff7a1a", 3); engulf(srcEl, "fire"); } await wait(250); }
        engulf(t, "fire"); return impact(e, t, { silent: true, color: "#ff8a2a" });
      }
      case "oven": if (melee) return lunge(srcEl, t, async () => { SND.play("ignite"); engulf(t, "fire"); await impact(e, t, { silent: true, color: "#ff8a2a" }); });
        break;
      case "hex": {
        const c = actNow?.id === "gwydion" ? "#7be08a" : actNow?.id === "morgan-le-fay" ? "#d36bff" : "#9a86ff";
        if (from) { runes(from, c); await wait(180); await beam(from, t, c, "beam"); }
        runes(tp, c); return impact(e, t, { silent: true, color: c });
      }
      case "ice": if (from) { SND.play("frost"); await stream(from, tp, "ice", 420); engulf(t, "ice"); return impact(e, t, { silent: true, color: "#bfe6ff" }); }
        break;
      case "wave": if (from) { await beam(from, t, "#4fc3c8", "wave"); engulf(t, "water"); return impact(e, t, { silent: true, color: "#7fe0ff" }); }
        break;
      case "drown": if (melee) return lunge(srcEl, t, async () => { SND.play("splash"); engulf(t, "water"); await impact(e, t, { silent: true, color: "#7fe0ff" }); }, true);
        break;
      case "lightning": if (from) { await lightning(from, tp); return impact(e, t, { silent: true, color: "#cfe8ff" }); }
        break;
      case "goldarrow": if (from) { SND.play("draw"); await wait(90); SND.play("arrow"); await throwAt(from, tp, GOLD_ARROW, { aim: true, trail: "#ffd45c", speed: 0.6 }); SND.play("thunk"); ring(tp, "#ffd45c", 0.8); return impact(e, t, { silent: true, color: "#ffd45c" }); }
        break;
      case "stone": if (from) { SND.play("whoosh"); await throwAt(from, tp, STONE, { spin: 720, lift: 50 }); SND.play("stone"); return impact(e, t, { silent: true, color: "#a59c90" }); }
        break;
      case "holy": if (melee) return lunge(srcEl, t, async () => { SND.play("holy"); holyLight(t); ring(tp, "#ffe08a", 1.4); await impact(e, t, { silent: true, color: "#ffe08a" }); }, false, 0.8);
        break;
      case "charge": if (melee) return lunge(srcEl, t, async () => { ring(tp, "#e8d6b0", 1.1); quake(6); await impact(e, t, { silent: true }); }, false, 0.88);
        break;
      case "smash": if (melee) return lunge(srcEl, t, async () => { SND.play("smash"); ring(tp, "#c9a77a", 1.3); quake(8); burst(tp, "#8a6a4a", 10, 50); await impact(e, t, { silent: true }); }, "none");
        break;
      case "bite": if (melee) return lunge(srcEl, t, async () => { SND.play("crunch"); bite(tp); lastBite = tp; await impact(e, t, { silent: true, color: "#b01010" }); }, "none");
        break;
      case "claws": if (melee) return lunge(srcEl, t, () => impact(e, t, { silent: true, color: "#b01010" }), true);
        break;
      case "sweep": if (melee) return lunge(srcEl, t, async () => { SND.play("swoosh"); sweep(tp, srcEl && card(e.src)?.aspect === "Beast" ? "#ffcf9a" : "#ffffff"); await impact(e, t, { silent: true }); }, "none");
        break;
      case "whirl": whirl(t); if (!reducedMotion) anim(t, [{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], 650, { fill: "none", easing: "ease-in-out" }); await wait(450); return impact(e, t, { silent: true, color: "#dfe8f0" });
    }
    return null;
  }
  async function onHit(e) {
    const t = cardEl(e.tgt), style = hitStyle(e), from = sourcePoint(e), srcEl = e.item ? null : cardEl(e.src);
    say(`${card(e.src)?.name || (e.item ? A.itemName?.(e.item) || "" : "")} hits ${card(e.tgt)?.name} for ${e.dmg}`);
    const theme = t ? themeOf(e) : null;
    if (theme) { const done = await themedHit(theme, e, t, from, srcEl).then((v) => v === null ? null : true); if (done) return; }
    if (style === "melee" && srcEl && t && srcEl !== t) {
      const beast = card(e.src)?.aspect === "Beast" || card(e.src)?.id === "mere-beast";
      return lunge(srcEl, t, () => impact(e, t, { silent: true }), beast);
    }
    if ((style === "arrow" || style === "bolt") && from && t) { await shoot(from, t, style); return impact(e, t, { silent: true }); }
    if ((style === "beam" || style === "wave") && from && t) { await beam(from, t, style === "wave" ? "#4fc3c8" : "#a77bff", style); return impact(e, t, { silent: true }); }
    if (style === "flame" && from && t) { await stream(from, centre(t), "green"); engulf(t, "green"); return impact(e, t, { silent: true, color: "#7dff6a" }); }
    if (style === "poison") { bubbles(t); return impact(e, t); }
    if (style === "night") { if (!nightShown) { nightShown = true; await nightfall(); } shadows(t); return impact(e, t, { color: "#4a3a6a" }); }
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
    board.classList.add("fx-night"); nightSky(); await wait(1000);
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
    actNow = { uid: e.uid, name: e.name, id: card(e.uid)?.id }; pyreLit = false; lastBite = null;
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
    if (lastBite && t && actNow && e.tgt === actNow.uid) { await motes(lastBite, centre(t), "#c41818", 8); lastBite = null; }
    else if (from && t) await motes(from, centre(t), "#8ee08a", 6);
    SND.play("heal"); setHp(e.tgt, e.hp);
    if (t) { burst(centre(t), "#a8f0a0", 8, 30); sparkles(t, "#8ee08a"); if (card(e.src)?.id === "monk") ring(centre(t), "#ffe08a", 0.8); }
    await Promise.all([glow(t, "fx-healed", 500), floatText(t, `+${e.amt}`, "fx-heal")]);
  }
  async function onDeath(e) {
    const el = cardEl(e.uid); if (!el) return;
    say(`${card(e.uid)?.name} falls`);
    SND.play("death");
    if (raised === el) raised = null;
    el.classList.remove("fx-acting");
    burst(centre(el), "#5b4a3a", 18, 60); ash(el);
    if (card(e.uid)?.kind === "hero") quake(5);
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
  async function onStop(e) {
    const t = cardEl(e.tgt ?? e.uid), name = !e.item && actNow ? actNow.name : null, src = actNow ? cardEl(actNow.uid) : null;
    if (t && name === "Girdle Leash") {
      if (src && src !== t) await motes(centre(src), centre(t), "#ffd45c", 7);
      SND.play("rattle"); rope(t); t.classList.add("fx-stopped");
      return floatText(t, "Leashed", "fx-gold");
    }
    if (t && name === "Enchanted sleep") {
      if (src && src !== t) await beam(centre(src), t, "#b9a2ff", "beam");
      SND.play("frost"); sleepMist(t); t.classList.add("fx-stopped");
      return floatText(t, "Asleep", "fx-frost");
    }
    return status(e, "Stopped", "fx-stop", "rattle", (x) => x && x.classList.add("fx-stopped"), "beam");
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
    // A page that knows whose side the player is on plays the result sound itself, when it shows the result.
    if (A.resultSounds !== false) SND.play(e.winner < 0 ? "tie" : "win");
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
    stop: onStop,
    freeze: (e) => status(e, "Frozen", "fx-frost", "frost", (t) => { if (t) { t.classList.add("fx-frozen"); engulf(t, "ice"); } }, "beam"),
    skip: (e) => status(e, e.why === "frozen" ? "Frozen: skips" : e.why === "cancelled" ? "Cancelled" : "Stopped: skips", "fx-stop fx-small", "dud"),
    wasted: (e) => status(e, "Wasted: no target", "fx-stop fx-small", "dud"),
    guardUp: onGuardUp,
    attackUp: (e) => status(e, `+${e.amt} Attack`, "fx-gold", "shing", null, "#ffd45c"),
    poison: (e) => status(e, `+${e.amt} Poison`, "fx-poison", "bubble", (t) => { bubbles(t); drips(t); }, "#8fd14f"),
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
