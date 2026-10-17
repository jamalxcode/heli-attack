/* Heli Attack - a modern retro side-scrolling helicopter shooter.
   Single file, no dependencies. Canvas 2D + Web Audio. */
'use strict';
(function () {
  // ---------------------------------------------------------------- constants
  const W = 800, H = 450, TOP = 40, CW = 10, RAMP = 24, NEUTRAL_FLOOR = 410;
  const STEP = 1 / 60, TAU = Math.PI * 2;
  const FONT = '"Press Start 2P", monospace';

  const STAGES = [
    { name: 'HILLS', len: 380, sky: ['#070b26', '#3a1d5c'], fill: ['#1f7f49', '#05200f'], edge: '#6dffb0', mount: '#1b1745' },
    { name: 'CAVERNS', len: 380, sky: ['#05040c', '#24102e'], fill: ['#8f4d1d', '#260f04'], edge: '#ffa04a', mount: '#1a0d22' },
    { name: 'METEOR STORM', len: 360, sky: ['#14030c', '#5c1530'], fill: ['#7c2b5e', '#1d0518'], edge: '#ff5fb4', mount: '#2c0b22' },
    { name: 'CITY', len: 400, sky: ['#020617', '#0e2c4e'], fill: ['#2a3d62', '#091022'], edge: '#5fd0ff', mount: '#0b1a34' },
    { name: 'TUNNELS', len: 380, sky: ['#010d0d', '#06302c'], fill: ['#148073', '#022320'], edge: '#4dfff0', mount: '#04221e' },
    { name: 'FORTRESS', len: 420, sky: ['#0e0a02', '#3d2c08'], fill: ['#6d6553', '#1a1812'], edge: '#ffd84a', mount: '#241b08' },
  ];

  const DIFFS = [
    { name: 'EASY', drain: 1.5, fuelGain: 24, fire: 0.6, enemy: 0.7, lives: 5 },
    { name: 'NORMAL', drain: 2.0, fuelGain: 19, fire: 1.0, enemy: 1.0, lives: 3 },
    { name: 'HARD', drain: 2.6, fuelGain: 16, fire: 1.5, enemy: 1.35, lives: 3 },
  ];

  // Points (relative to heli centre, unrotated) checked against terrain.
  const HITPTS = [[21, 3], [12, -6], [-27, -2], [-29, -10], [-9, 11], [16, 10], [0, -12], [-12, -12], [14, -12]];

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ---------------------------------------------------------------- canvas
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let dpr = 1, scale = 1, offX = 0, offY = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    scale = Math.min(cw / W, ch / H);
    offX = (cw - W * scale) / 2;
    offY = (ch - H * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  const glowCache = {};
  function glow(color) {
    let c = glowCache[color];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowCache[color] = c;
    return c;
  }
  function drawGlow(color, x, y, r, a) {
    ctx.globalAlpha = a == null ? 1 : a;
    ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // ---------------------------------------------------------------- sound
  const Sound = (function () {
    let ac = null, master = null, noiseBuf = null, engine = null;
    let muted = store.get('heliattack.muted', false);
    const VOL = 0.5;

    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.connect(ac.destination);
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(comp);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    function env(g, t, vol, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    function tone(type, f0, f1, dur, vol, delay) {
      if (!ac) return;
      const t = ac.currentTime + (delay || 0);
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      env(g, t, vol, dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol, f0, f1, delay, type) {
      if (!ac) return;
      const t = ac.currentTime + (delay || 0);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; s.loop = true;
      f.type = type || 'lowpass'; f.Q.value = 0.9;
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      env(g, t, vol, dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.05);
    }
    function seq(notes, type, len, vol) {
      notes.forEach((n, i) => { if (n) tone(type, n, n, len * 0.95, vol, i * len); });
    }
    function engineOn() {
      if (!ac) return;
      if (!engine) {
        const o1 = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter();
        const amp = ac.createGain(), vol = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
        o1.type = 'sawtooth'; o1.frequency.value = 46;
        o2.type = 'square'; o2.frequency.value = 93;
        f.type = 'lowpass'; f.frequency.value = 340;
        amp.gain.value = 0.55; lfo.type = 'square'; lfo.frequency.value = 15; lg.gain.value = 0.45;
        vol.gain.value = 0;
        lfo.connect(lg); lg.connect(amp.gain);
        o1.connect(f); o2.connect(f); f.connect(amp); amp.connect(vol); vol.connect(master);
        o1.start(); o2.start(); lfo.start();
        engine = { o1, o2, lfo, vol };
      }
      engine.vol.gain.setTargetAtTime(0.07, ac.currentTime, 0.1);
    }
    function engineOff() { if (engine) engine.vol.gain.setTargetAtTime(0, ac.currentTime, 0.08); }
    function enginePitch(k) {
      if (!engine) return;
      const t = ac.currentTime;
      engine.o1.frequency.setTargetAtTime(46 * k, t, 0.15);
      engine.o2.frequency.setTargetAtTime(93 * k, t, 0.15);
      engine.lfo.frequency.setTargetAtTime(15 * k, t, 0.15);
    }
    return {
      init, engineOn, engineOff, enginePitch,
      get muted() { return muted; },
      toggleMute() {
        muted = !muted;
        store.set('heliattack.muted', muted);
        if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.02);
      },
      shoot() { tone('square', 1100, 300, 0.07, 0.07); },
      bomb() { tone('sine', 1500, 380, 0.7, 0.05); },
      explode(size) {
        const s = size || 1;
        noise(0.35 + 0.3 * s, 0.35 + 0.15 * s, 2600, 70);
        tone('sine', 140, 30, 0.3 + 0.25 * s, 0.3 + 0.15 * s);
      },
      spark() { noise(0.05, 0.08, 6000, 2000, 0, 'highpass'); },
      fuel() { seq([523, 659, 784, 1046], 'square', 0.05, 0.08); },
      alarm() { tone('square', 1250, 1250, 0.07, 0.06); tone('square', 950, 950, 0.07, 0.06, 0.1); },
      launch() { noise(0.6, 0.12, 300, 3500, 0, 'bandpass'); },
      shell() { tone('triangle', 300, 120, 0.15, 0.08); },
      pickup() { seq([784, 988, 1175, 1568, 1976], 'triangle', 0.06, 0.12); },
      extra() { seq([659, 0, 659, 880, 1175, 1318], 'square', 0.08, 0.08); },
      stage() { seq([392, 523, 659, 784], 'triangle', 0.09, 0.12); },
      start() { seq([262, 330, 392, 523, 0, 392, 523, 659, 784], 'square', 0.09, 0.07); },
      gameOver() { seq([392, 370, 349, 330, 0, 262], 'triangle', 0.22, 0.13); },
      mission() { seq([523, 659, 784, 1046, 0, 784, 1046, 1318, 1568], 'square', 0.11, 0.08); },
      click() { tone('square', 660, 660, 0.04, 0.05); },
    };
  })();

  // ---------------------------------------------------------------- input
  const keys = {};
  let pressed = {};
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    G.usingTouch = false;
    Sound.init();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') pause(); });
  const isPressed = (...codes) => codes.some((c) => pressed[c]);

  const touch = { stick: null, fireId: null, bombId: null };
  const FIRE_BTN = { x: W - 78, y: H - 82, r: 48 };
  const BOMB_BTN = { x: W - 190, y: H - 56, r: 36 };
  const PAUSE_BTN = { x: 380, y: 0, w: 40, h: TOP };
  function toGame(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.init();
    const p = toGame(e);
    if (e.pointerType === 'touch') G.usingTouch = true;
    if (G.state === 'playing' && !G.paused) {
      if (p.x >= PAUSE_BTN.x && p.x <= PAUSE_BTN.x + PAUSE_BTN.w && p.y <= PAUSE_BTN.h) { pause(); return; }
      if (e.pointerType !== 'touch') return;
      if (p.x < W * 0.45) {
        touch.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      } else if (Math.hypot(p.x - BOMB_BTN.x, p.y - BOMB_BTN.y) < BOMB_BTN.r + 14) {
        touch.bombId = e.pointerId;
      } else {
        touch.fireId = e.pointerId;
      }
      return;
    }
    for (const b of G.ui) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { Sound.click(); b.action(); return; }
    }
    if (G.state === 'gameover' && G.goT > 1.2) toTitle();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (touch.stick && touch.stick.id === e.pointerId) {
      const p = toGame(e);
      touch.stick.x = p.x; touch.stick.y = p.y;
    }
  });
  function endPointer(e) {
    if (touch.stick && touch.stick.id === e.pointerId) touch.stick = null;
    if (touch.fireId === e.pointerId) touch.fireId = null;
    if (touch.bombId === e.pointerId) touch.bombId = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  let padPrev = {};
  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  function padButtons(p) {
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    return { a: b(0), b: b(1) || b(2), start: b(9) || b(8), up: b(12), down: b(13), left: b(14), right: b(15) };
  }

  function readInput() {
    let x = 0, y = 0, fire = false, bomb = false;
    if (keys.ArrowLeft || keys.KeyA) x -= 1;
    if (keys.ArrowRight || keys.KeyD) x += 1;
    if (keys.ArrowUp || keys.KeyW) y -= 1;
    if (keys.ArrowDown || keys.KeyS) y += 1;
    fire = !!(keys.Space || keys.KeyZ || keys.KeyJ);
    bomb = !!(keys.KeyX || keys.KeyK || keys.KeyB);
    const pad = readPad();
    if (pad) {
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.abs(ax) > 0.25) x += ax;
      if (Math.abs(ay) > 0.25) y += ay;
      const pb = padButtons(pad);
      if (pb.left) x -= 1; if (pb.right) x += 1; if (pb.up) y -= 1; if (pb.down) y += 1;
      fire = fire || pb.a;
      bomb = bomb || pb.b;
    }
    if (touch.stick) {
      let dx = (touch.stick.x - touch.stick.ox) / 38, dy = (touch.stick.y - touch.stick.oy) / 38;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      if (l > 0.15) { x += dx; y += dy; }
    }
    if (touch.fireId != null) fire = true;
    if (touch.bombId != null) bomb = true;
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), fire, bomb };
  }

  // ---------------------------------------------------------------- world generation
  function walk(n, out, start, min, max, accel, r) {
    let v = start, vel = 0;
    for (let i = 0; i < n; i++) {
      vel += (r() - 0.5) * accel;
      vel *= 0.92;
      v += vel;
      if (v < min) { v = min; vel = Math.abs(vel) * 0.6; }
      if (v > max) { v = max; vel = -Math.abs(vel) * 0.6; }
      out[i] = v;
    }
  }
  function pickT(table, x) {
    let acc = 0;
    for (const [t, w] of table) { acc += w; if (x < acc) return t; }
    return table[table.length - 1][0];
  }
  function scatter(objs, n, r, minGap, maxGap, table) {
    for (let c = RAMP + 8; c < n - RAMP - 8; c += Math.floor(minGap + r() * (maxGap - minGap))) objs.push({ type: pickT(table, r()), c });
  }

  const GEN = [
    function hills(n, fl, ce, bl, objs, r) {
      walk(n, fl, 400, 290, 428, 3.2, r);
      ce.fill(TOP);
      scatter(objs, n, r, 16, 30, [['missile', 0.5], ['fuel', 0.32], ['radar', 0.18]]);
    },
    function caverns(n, fl, ce, bl, objs, r) {
      walk(n, fl, 390, 270, 428, 3.5, r);
      walk(n, ce, 120, TOP + 10, 210, 3.5, r);
      for (let i = 0; i < n; i++) {
        if (fl[i] - ce[i] < 170) { const m = (fl[i] + ce[i]) / 2; fl[i] = Math.min(428, m + 85); ce[i] = fl[i] - 170; }
        ce[i] = Math.max(TOP, ce[i]);
      }
      scatter(objs, n, r, 20, 34, [['fuel', 0.45], ['missile', 0.35], ['radar', 0.2]]);
    },
    function meteors(n, fl, ce, bl, objs, r) {
      walk(n, fl, 405, 340, 428, 2.5, r);
      ce.fill(TOP);
      scatter(objs, n, r, 22, 38, [['fuel', 0.5], ['missile', 0.3], ['radar', 0.2]]);
    },
    function city(n, fl, ce, bl, objs, r) {
      ce.fill(TOP);
      let i = 0;
      while (i < n) {
        const bw = Math.floor(3 + r() * 5), h = 230 + r() * 185;
        for (let k = 0; k < bw && i < n; k++, i++) { fl[i] = h; bl[i] = true; }
        if (bw >= 3 && r() < 0.7) objs.push({ type: pickT([['tank', 0.45], ['fuel', 0.3], ['missile', 0.15], ['radar', 0.1]], r()), c: i - Math.ceil(bw / 2) });
        const gap = Math.floor(r() * 3);
        for (let k = 0; k < gap && i < n; k++, i++) { fl[i] = 428; bl[i] = true; }
      }
    },
    function tunnels(n, fl, ce, bl, objs, r) {
      let i = 0, center = 240;
      while (i < n) {
        const sl = Math.floor(6 + r() * 9);
        center = clamp(center + (r() - 0.5) * 110, TOP + 95, 340);
        const gap = 125 + r() * 50;
        const f = Math.min(428, center + gap / 2), c = Math.max(TOP, center - gap / 2);
        for (let k = 0; k < sl && i < n; k++, i++) { fl[i] = f; ce[i] = c; bl[i] = true; }
        if (r() < 0.55) objs.push({ type: pickT([['fuel', 0.5], ['tank', 0.25], ['radar', 0.25]], r()), c: i - Math.ceil(sl / 2) });
      }
    },
    function fortress(n, fl, ce, bl, objs, r) {
      fl.fill(410); ce.fill(TOP);
      let i = RAMP + 10;
      while (i < n - 80) {
        const k = r();
        if (k < 0.35) {
          const bw = Math.floor(3 + r() * 3), h = 300 + r() * 50;
          for (let j = 0; j < bw; j++) { fl[i + j] = h; bl[i + j] = true; }
          objs.push({ type: 'tank', c: i + Math.floor(bw / 2) });
          i += bw + Math.floor(4 + r() * 4);
        } else if (k < 0.6) {
          const bw = Math.floor(8 + r() * 8), h = 150 + r() * 50;
          for (let j = 0; j < bw; j++) { ce[i + j] = h; bl[i + j] = true; }
          objs.push({ type: r() < 0.5 ? 'fuel' : 'tank', c: i + Math.floor(bw / 2) });
          i += bw + Math.floor(3 + r() * 3);
        } else {
          objs.push({ type: pickT([['missile', 0.45], ['fuel', 0.3], ['tank', 0.25]], r()), c: i });
          i += Math.floor(5 + r() * 5);
        }
      }
      objs.push({ type: 'core', c: n - 50 });
    },
  ];

  function buildWorld(loop) {
    const rng = mulberry32(0x5eed + loop * 7919);
    const w = { floor: [], ceil: [], blocky: [], stageOf: [], starts: [], ends: [], specs: [] };
    STAGES.forEach((st, s) => {
      const n = st.len;
      const fl = new Array(n).fill(NEUTRAL_FLOOR), ce = new Array(n).fill(TOP), bl = new Array(n).fill(false);
      const objs = [];
      GEN[s](n, fl, ce, bl, objs, rng);
      for (let i = 0; i < n; i++) {
        let t = 1;
        if (i < RAMP) t = i / RAMP;
        else if (i > n - 1 - RAMP) t = (n - 1 - i) / RAMP;
        if (t < 1) {
          t = t * t * (3 - 2 * t);
          fl[i] = lerp(NEUTRAL_FLOOR, fl[i], t);
          ce[i] = lerp(TOP, ce[i], t);
          bl[i] = false;
        }
      }
      const base = w.floor.length;
      w.starts[s] = base * CW;
      for (let i = 0; i < n; i++) { w.floor.push(fl[i]); w.ceil.push(ce[i]); w.blocky.push(bl[i]); w.stageOf.push(s); }
      w.ends[s] = (base + n) * CW;
      for (const o of objs) {
        if (o.c < RAMP + 6 || o.c > n - RAMP - 6) continue;
        const y = Math.min(fl[o.c - 1], fl[o.c], fl[o.c + 1]);
        w.specs.push({ type: o.type, x: (base + o.c) * CW + CW / 2, y });
      }
    });
    for (let i = 0; i < 90; i++) { w.floor.push(NEUTRAL_FLOOR); w.ceil.push(TOP); w.blocky.push(false); w.stageOf.push(STAGES.length - 1); }
    w.specs.sort((a, b) => a.x - b.x);
    return w;
  }

  function terrainAt(arr, x) {
    const w = G.world, c = x / CW, i = Math.floor(c);
    if (i < 0) return arr[0];
    if (i >= arr.length - 1) return arr[arr.length - 1];
    if (w.blocky[i]) return arr[i];
    return lerp(arr[i], arr[i + 1], c - i);
  }
  const floorAt = (x) => terrainAt(G.world.floor, x);
  const ceilAt = (x) => terrainAt(G.world.ceil, x);
  function solidAt(x, y) {
    if (y > floorAt(x)) return true;
    const c = ceilAt(x);
    return c > TOP + 0.5 && y < c;
  }
  function stageAt(x) {
    const w = G.world;
    let s = 0;
    while (s < STAGES.length - 1 && x >= w.starts[s + 1]) s++;
    return s;
  }

  // ---------------------------------------------------------------- game state
  const G = {
    state: 'title', paused: false, ui: [], usingTouch: matchMedia('(pointer: coarse)').matches,
    diff: clamp(store.get('heliattack.diff', 1), 0, 2), scores: store.get('heliattack.scores', []),
    score: 0, lives: 3, loop: 0, nextLife: 10000, stage: 0, camX: 0, time: 0,
    world: null, specIdx: 0, p: null,
    bullets: [], bombs: [], objs: [], enemies: [], shots: [], parts: [], rings: [], popups: [],
    banner: null, shake: 0, flash: 0, spawnT: 1, alarmT: 0, deathT: 0, goT: 0, coreHeld: false, newHi: false,
    scroll: 100, drain: 2, fuelGain: 19, fireRate: 1, enemy: 1,
  };
  G.world = buildWorld(0);
  const STARS = Array.from({ length: 90 }, () => ({ x: rand(0, W), y: rand(TOP, H - 60), z: rand(0.05, 0.5), tw: rand(0, TAU) }));

  function hiScore() { return Math.max(G.score, G.scores[0] || 0); }

  function applyDifficulty() {
    const d = DIFFS[G.diff], L = G.loop;
    G.scroll = 100 * (1 + 0.08 * L);
    G.drain = d.drain * (1 + 0.1 * L);
    G.fuelGain = d.fuelGain;
    G.fireRate = d.fire * (1 + 0.2 * L);
    G.enemy = d.enemy * (1 + 0.2 * L);
  }

  function newPlayer(x, y) {
    return { x, y, vx: 0, vy: 0, tilt: 0, rotor: 0, fuel: 100, fireCool: 0, bombCool: 0, invuln: 2, dead: false };
  }

  function startGame() {
    Sound.init();
    G.score = 0; G.loop = 0; G.nextLife = 10000;
    G.lives = DIFFS[G.diff].lives;
    G.paused = false;
    applyDifficulty();
    G.world = buildWorld(0);
    respawn(0);
    Sound.start();
    if (G.usingTouch) tryFullscreen();
  }

  function respawn(stage) {
    const w = G.world;
    G.state = 'playing';
    G.stage = stage;
    G.camX = w.starts[stage];
    G.p = newPlayer(G.camX + 120, 220);
    G.bullets = []; G.bombs = []; G.objs = []; G.enemies = []; G.shots = []; G.popups = [];
    G.coreHeld = false;
    G.spawnT = 2;
    G.specIdx = 0;
    while (G.specIdx < w.specs.length && w.specs[G.specIdx].x < w.starts[stage]) G.specIdx++;
    showBanner('STAGE ' + (stage + 1), STAGES[stage].name);
    Sound.engineOn();
  }

  function showBanner(title, sub, dur) { G.banner = { title, sub, t: 0, dur: dur || 2.2 }; }

  function addScore(n, x, y, label) {
    G.score += n;
    if (x != null) G.popups.push({ x, y, text: label || String(n), life: 1, color: '#fff' });
    if (G.score >= G.nextLife) {
      G.lives++;
      G.nextLife += G.nextLife === 10000 ? 40000 : 50000;
      Sound.extra();
      G.popups.push({ x: G.p.x, y: G.p.y - 20, text: '1UP', life: 1.4, color: '#7dff9a' });
    }
  }

  function pause() {
    if (G.state !== 'playing' || G.paused) return;
    G.paused = true;
    touch.stick = null; touch.fireId = null; touch.bombId = null;
    Sound.engineOff();
  }
  function resume() {
    G.paused = false;
    if (!G.p.dead) Sound.engineOn();
  }
  function toTitle() {
    G.state = 'title'; G.paused = false;
    Sound.engineOff();
    G.world = buildWorld(0);
    G.camX = 0;
    G.objs = []; G.enemies = []; G.shots = []; G.bullets = []; G.bombs = []; G.popups = [];
  }

  function gameOver() {
    G.state = 'gameover';
    G.goT = 0;
    Sound.engineOff();
    Sound.gameOver();
    G.newHi = G.score > 0 && G.score > (G.scores[0] || 0);
    if (G.score > 0) {
      G.scores.push(G.score);
      G.scores.sort((a, b) => b - a);
      G.scores = G.scores.slice(0, 5);
      store.set('heliattack.scores', G.scores);
    }
  }

  function tryFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen().then(() => {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  }

  // ---------------------------------------------------------------- effects
  function burst(x, y, n, colors, spd, life, size, grav) {
    for (let i = 0; i < n && G.parts.length < 1000; i++) {
      const a = rand(0, TAU), s = rand(0.15, 1) * spd;
      G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1) * life, max: life, size: rand(0.5, 1) * size, color: colors[i % colors.length], grav: grav || 0, glow: true });
    }
  }
  function debris(x, y, n, color) {
    for (let i = 0; i < n && G.parts.length < 1000; i++) {
      G.parts.push({ x, y, vx: rand(-140, 140) + G.scroll * 0.3, vy: rand(-220, -40), life: rand(0.6, 1.2), max: 1.2, size: rand(1.5, 3.5), color, grav: 420, glow: false, rot: rand(0, TAU) });
    }
  }
  function explosion(x, y, big) {
    burst(x, y, big ? 60 : 26, ['#fff3b0', '#ffb347', '#ff6a2b', '#ff3b3b'], big ? 260 : 150, big ? 0.9 : 0.6, big ? 16 : 10, 0);
    debris(x, y, big ? 16 : 7, '#8a7f70');
    G.rings.push({ x, y, r: 4, max: big ? 80 : 38, life: 0.4, t: 0 });
    G.shake = Math.max(G.shake, big ? 14 : 5);
    if (big) G.flash = 0.5;
    Sound.explode(big ? 2 : 1);
  }
  function spark(x, y, color) {
    burst(x, y, 6, [color || '#ffe9a8'], 90, 0.25, 5, 0);
  }

  // ---------------------------------------------------------------- objects
  function makeObj(s) {
    const o = { type: s.type, x: s.x, y: s.y, alive: true, t: Math.random() * 10 };
    switch (s.type) {
      case 'fuel': o.w = 22; o.h = 26; break;
      case 'missile': o.w = 10; o.h = 30; o.state = 0; o.vy = 0; o.trigger = rand(70, 260); break;
      case 'tank': o.w = 28; o.h = 16; o.cool = rand(1, 3); o.aim = -Math.PI / 2; break;
      case 'radar': o.w = 24; o.h = 28; o.pts = [100, 200, 300][irand(0, 2)]; break;
      case 'core': o.w = 24; o.h = 24; break;
    }
    return o;
  }
  const box = (o) => ({ l: o.x - o.w / 2, r: o.x + o.w / 2, t: o.y - o.h, b: o.y });
  const inBox = (bx, x, y, pad) => x > bx.l - pad && x < bx.r + pad && y > bx.t - pad && y < bx.b + pad;

  function destroyObj(o, viaBomb) {
    if (!o.alive || o.type === 'core') return;
    o.alive = false;
    const cx = o.x, cy = o.y - o.h / 2;
    explosion(cx, cy, false);
    switch (o.type) {
      case 'fuel':
        G.p.fuel = Math.min(100, G.p.fuel + G.fuelGain);
        Sound.fuel();
        addScore(150, cx, cy - 16, 'FUEL +150');
        break;
      case 'missile': addScore(o.state ? 80 : 50, cx, cy - 10); break;
      case 'tank': addScore(100, cx, cy - 10); break;
      case 'radar': addScore(o.pts, cx, cy - 10); break;
    }
    if (viaBomb) G.shake = Math.max(G.shake, 6);
  }

  function killPlayer() {
    const p = G.p;
    if (p.dead) return;
    p.dead = true;
    G.deathT = 2.4;
    explosion(p.x, p.y, true);
    debris(p.x, p.y, 12, '#2a9be0');
    Sound.engineOff();
  }

  function spawnEnemy() {
    const x = G.camX + W + 40, cy = Math.max(ceilAt(x), TOP), fy = floorAt(x);
    if (fy - cy < 80) return;
    switch (G.stage) {
      case 1: case 3:
        G.enemies.push({ type: 'ufo', x, by: rand(cy + 30, fy - 30), y: 0, vx: -rand(30, 70), t: rand(0, TAU), amp: rand(12, 34), r: 12 });
        break;
      case 2:
        G.enemies.push({ type: 'meteor', x: x + rand(0, 80), y: rand(TOP + 5, fy - 70), vx: -rand(170, 260) * Math.sqrt(G.enemy), vy: rand(20, 70), r: rand(7, 12), rot: rand(0, TAU), t: 0 });
        break;
      case 5:
        G.enemies.push({ type: 'dart', x, y: rand(cy + 20, fy - 20), vx: -rand(170, 230), r: 10, t: 0 });
        break;
    }
  }
  function spawnDelay() {
    switch (G.stage) {
      case 1: return rand(0.9, 1.7) / G.enemy;
      case 2: return rand(0.3, 0.7) / G.enemy;
      case 3: return rand(3, 5.5) / G.enemy;
      case 5: return rand(1.4, 2.6) / G.enemy;
      default: return 1;
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    G.time += dt;
    updateEffects(dt);
    if (G.state === 'title') {
      G.camX += 70 * dt;
      if (G.camX > G.world.ends[STAGES.length - 1] - W) G.camX = 0;
      return;
    }
    if (G.state === 'gameover') { G.goT += dt; return; }
    if (G.paused) return;

    const w = G.world, p = G.p;
    G.camX += G.scroll * dt;

    while (G.specIdx < w.specs.length && w.specs[G.specIdx].x < G.camX + W + 60) G.objs.push(makeObj(w.specs[G.specIdx++]));

    if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }

    updatePlayer(dt);
    updateBullets(dt);
    updateBombs(dt);
    updateObjects(dt);
    updateEnemies(dt);
    updateShots(dt);

    if (!p.dead) {
      const s = stageAt(p.x);
      if (s !== G.stage) { G.stage = s; G.spawnT = 2; showBanner('STAGE ' + (s + 1), STAGES[s].name); Sound.stage(); }
      const inside = p.x > w.starts[G.stage] + RAMP * CW + 100 && p.x < w.ends[G.stage] - RAMP * CW - 150;
      G.spawnT -= dt;
      if (inside && G.spawnT <= 0) { spawnEnemy(); G.spawnT = spawnDelay(); }
      if (p.x >= w.ends[STAGES.length - 1] + 120) finishMission();
    } else {
      G.deathT -= dt;
      if (G.deathT <= 0) {
        G.lives--;
        if (G.lives <= 0) gameOver();
        else respawn(G.stage);
      }
    }
  }

  function finishMission() {
    if (G.coreHeld) {
      const bonus = 5000 * (G.loop + 1);
      addScore(bonus);
      G.loop++;
      applyDifficulty();
      G.world = buildWorld(G.loop);
      respawn(0);
      showBanner('MISSION COMPLETE', 'BONUS ' + bonus, 3.2);
      Sound.mission();
    } else {
      respawn(STAGES.length - 1);
      showBanner('DATA CORE MISSED', 'GRAB IT THIS TIME', 3);
    }
  }

  function updatePlayer(dt) {
    const p = G.p;
    if (p.dead) return;
    const inp = readInput();
    p.invuln = Math.max(0, p.invuln - dt);
    if (p.fuel > 0) {
      p.fuel -= G.drain * dt;
      if (p.fuel <= 0) {
        p.fuel = 0;
        Sound.engineOff();
        G.popups.push({ x: p.x, y: p.y - 24, text: 'OUT OF FUEL', life: 1.6, color: '#ff5050' });
      }
      const k = Math.min(1, dt * 10);
      p.vx += (inp.x * 170 - p.vx) * k;
      p.vy += (inp.y * 175 - p.vy) * k;
      Sound.enginePitch(1 + inp.x * 0.08 - inp.y * 0.1);
      if (p.fuel < 25) {
        G.alarmT -= dt;
        if (G.alarmT <= 0) { Sound.alarm(); G.alarmT = 0.9; }
      }
    } else {
      p.vx *= 0.98;
      p.vy += 230 * dt;
    }
    p.x += (G.scroll + p.vx) * dt;
    p.y += p.vy * dt;
    let sx = p.x - G.camX;
    if (sx < 30) { sx = 30; p.vx = Math.max(0, p.vx); }
    if (sx > W * 0.62) { sx = W * 0.62; p.vx = Math.min(0, p.vx); }
    p.x = G.camX + sx;
    if (p.y < TOP + 14) { p.y = TOP + 14; p.vy = Math.max(0, p.vy); }
    if (p.y > H - 6) p.y = H - 6;
    p.tilt = lerp(p.tilt, p.vx * 0.0013 + p.vy * 0.0009, Math.min(1, dt * 8));
    p.rotor += dt * (p.fuel > 0 ? 42 : 12);

    p.fireCool -= dt;
    if (inp.fire && p.fireCool <= 0 && G.bullets.length < 6) {
      const c = Math.cos(p.tilt), s = Math.sin(p.tilt);
      G.bullets.push({ x: p.x + 22 * c - 4 * s, y: p.y + 22 * s + 4 * c, vx: G.scroll + 560, vy: 560 * Math.sin(p.tilt) * 0.5 });
      p.fireCool = 0.13;
      Sound.shoot();
    }
    p.bombCool -= dt;
    if (inp.bomb && p.bombCool <= 0 && G.bombs.length < 2) {
      G.bombs.push({ x: p.x + 2, y: p.y + 12, vx: G.scroll + p.vx * 0.5 + 40, vy: 50 + Math.max(0, p.vy) * 0.5 });
      p.bombCool = 0.35;
      Sound.bomb();
    }

    // terrain collision
    const c = Math.cos(p.tilt), s = Math.sin(p.tilt);
    for (const [hx, hy] of HITPTS) {
      if (solidAt(p.x + hx * c - hy * s, p.y + hx * s + hy * c)) { killPlayer(); return; }
    }
    // object collision
    const pb = { l: p.x - 20, r: p.x + 18, t: p.y - 9, b: p.y + 10 };
    for (const o of G.objs) {
      if (!o.alive) continue;
      const b = box(o);
      if (b.r < pb.l || b.l > pb.r || b.b < pb.t || b.t > pb.b) continue;
      if (o.type === 'core') {
        o.alive = false; G.coreHeld = true;
        Sound.pickup();
        addScore(1000, o.x, o.y - 30, 'DATA CORE +1000');
        showBanner('CORE SECURED', 'ESCAPE TO THE RIGHT', 2.2);
        continue;
      }
      if (p.invuln > 0) continue;
      destroyObj(o);
      killPlayer();
      return;
    }
  }

  function updateBullets(dt) {
    const camR = G.camX + W + 20;
    G.bullets = G.bullets.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x > camR || b.y < TOP || b.y > H) return false;
      if (solidAt(b.x, b.y)) { spark(b.x, b.y, G.world && STAGES[G.stage].edge); return false; }
      for (const o of G.objs) {
        if (o.alive && o.type !== 'core' && inBox(box(o), b.x, b.y, 3)) { destroyObj(o); return false; }
      }
      for (const e of G.enemies) {
        if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) {
          if (e.type === 'meteor') { spark(b.x, b.y, '#ffb347'); Sound.spark(); return false; }
          e.dead = true;
          explosion(e.x, e.y, false);
          addScore(e.type === 'dart' ? 150 : 100, e.x, e.y - 12);
          return false;
        }
      }
      return true;
    });
  }

  function bombBlast(x, y) {
    explosion(x, y, false);
    for (const o of G.objs) {
      if (o.alive && o.type !== 'core' && inBox(box(o), x, y, 22)) destroyObj(o, true);
    }
    for (const e of G.enemies) {
      if (!e.dead && e.type !== 'meteor' && Math.hypot(e.x - x, e.y - y) < e.r + 22) {
        e.dead = true; explosion(e.x, e.y, false); addScore(e.type === 'dart' ? 150 : 100, e.x, e.y - 12);
      }
    }
  }

  function updateBombs(dt) {
    G.bombs = G.bombs.filter((b) => {
      b.vy += 380 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > H + 10) return false;
      if (Math.random() < 0.6) G.parts.push({ x: b.x - 3, y: b.y - 2, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 3, color: '#ff9d3b', grav: 0, glow: true });
      if (solidAt(b.x, b.y + 3)) { bombBlast(b.x, b.y); return false; }
      for (const o of G.objs) {
        if (o.alive && o.type !== 'core' && inBox(box(o), b.x, b.y, 2)) { bombBlast(b.x, b.y); return false; }
      }
      for (const e of G.enemies) {
        if (!e.dead && e.type !== 'meteor' && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) { bombBlast(b.x, b.y); return false; }
      }
      return true;
    });
  }

  function updateObjects(dt) {
    const p = G.p;
    for (const o of G.objs) {
      if (!o.alive) continue;
      o.t += dt;
      if (o.type === 'missile') {
        if (o.state === 0 && !p.dead && o.x - p.x < o.trigger && o.x < G.camX + W - 20) {
          o.state = 1; o.vy = -30;
          Sound.launch();
        }
        if (o.state === 1) {
          o.vy = Math.max(o.vy - 300 * dt * G.enemy, -240 * Math.sqrt(G.enemy));
          o.y += o.vy * dt;
          G.parts.push({ x: o.x + rand(-2, 2), y: o.y + 2, vx: rand(-20, 20), vy: rand(40, 90), life: 0.35, max: 0.35, size: rand(3, 6), color: Math.random() < 0.5 ? '#ffd27a' : '#ff6a2b', grav: 0, glow: true });
          const c = ceilAt(o.x);
          if (c > TOP + 0.5 && o.y - o.h < c) { o.alive = false; explosion(o.x, o.y - o.h, false); }
          else if (o.y < TOP - 10) o.alive = false;
        }
      } else if (o.type === 'tank') {
        const sx = o.x - G.camX;
        if (!p.dead) o.aim = Math.atan2(p.y - (o.y - 14), p.x + G.scroll * 0.8 - o.x);
        if (sx > 40 && sx < W - 20 && !p.dead) {
          o.cool -= dt;
          if (o.cool <= 0) {
            const t = 1.1, g = 160;
            const sx0 = o.x, sy0 = o.y - 16;
            const tx = p.x + G.scroll * t, ty = p.y;
            const vx = clamp((tx - sx0) / t, -300, 300), vy = (ty - sy0) / t - 0.5 * g * t;
            G.shots.push({ x: sx0, y: sy0, vx, vy, g });
            o.cool = rand(1.8, 3.2) / G.fireRate;
            Sound.shell();
          }
        }
      }
    }
    G.objs = G.objs.filter((o) => o.alive && o.x > G.camX - 60);
  }

  function updateEnemies(dt) {
    const p = G.p;
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.t += dt;
      if (e.type === 'ufo') {
        e.x += e.vx * dt;
        e.y = e.by + Math.sin(e.t * 3) * e.amp;
        e.y = clamp(e.y, Math.max(ceilAt(e.x), TOP) + 14, floorAt(e.x) - 14);
      } else if (e.type === 'meteor') {
        e.x += e.vx * dt; e.y += e.vy * dt; e.rot += dt * 4;
        if (Math.random() < 0.7) G.parts.push({ x: e.x + rand(-3, 3), y: e.y + rand(-3, 3), vx: rand(10, 40), vy: rand(-20, 0), life: 0.4, max: 0.4, size: e.r * 0.9, color: Math.random() < 0.5 ? '#ff7b2b' : '#ffcf5a', grav: 0, glow: true });
        if (solidAt(e.x, e.y + e.r * 0.5)) { e.dead = true; explosion(e.x, e.y, false); }
      } else if (e.type === 'dart') {
        e.x += e.vx * dt;
        if (!p.dead && e.x - p.x > 40) e.y += clamp(p.y - e.y, -1, 1) * 60 * dt;
        if (solidAt(e.x, e.y)) { e.dead = true; explosion(e.x, e.y, false); }
      }
      if (!p.dead && p.invuln <= 0 && Math.abs(e.x - p.x) < e.r + 16 && Math.abs(e.y - p.y) < e.r + 8) {
        e.dead = true;
        explosion(e.x, e.y, false);
        killPlayer();
      }
    }
    G.enemies = G.enemies.filter((e) => !e.dead && e.x > G.camX - 60);
  }

  function updateShots(dt) {
    const p = G.p;
    G.shots = G.shots.filter((s) => {
      s.vy += s.g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < G.camX - 20 || s.x > G.camX + W + 20 || s.y > H || s.y < TOP - 40) return false;
      if (solidAt(s.x, s.y)) { spark(s.x, s.y, '#ff6060'); return false; }
      if (!p.dead && p.invuln <= 0 && Math.abs(s.x - p.x) < 18 && Math.abs(s.y - p.y) < 10) { killPlayer(); return false; }
      return true;
    });
  }

  function updateEffects(dt) {
    for (const q of G.parts) {
      q.life -= dt;
      q.vy += q.grav * dt;
      q.vx *= 0.97; q.vy *= q.grav ? 1 : 0.97;
      q.x += q.vx * dt; q.y += q.vy * dt;
    }
    G.parts = G.parts.filter((q) => q.life > 0);
    for (const r of G.rings) { r.t += dt; }
    G.rings = G.rings.filter((r) => r.t < r.life);
    for (const u of G.popups) { u.life -= dt; u.y -= 30 * dt; }
    G.popups = G.popups.filter((u) => u.life > 0);
    G.shake = Math.max(0, G.shake - dt * 30);
    G.flash = Math.max(0, G.flash - dt * 1.5);
  }

  // ---------------------------------------------------------------- menu / edge input
  function handleEdges() {
    const pad = readPad();
    const pb = pad ? padButtons(pad) : {};
    const padEdge = (k) => pb[k] && !padPrev[k];
    const confirm = isPressed('Enter', 'NumpadEnter', 'Space') || padEdge('a') || padEdge('start');
    if (isPressed('KeyM')) Sound.toggleMute();
    if (G.state === 'title') {
      if (isPressed('ArrowLeft', 'KeyA') || padEdge('left')) { G.diff = (G.diff + 2) % 3; store.set('heliattack.diff', G.diff); Sound.click(); }
      if (isPressed('ArrowRight', 'KeyD') || padEdge('right')) { G.diff = (G.diff + 1) % 3; store.set('heliattack.diff', G.diff); Sound.click(); }
      if (confirm) startGame();
    } else if (G.state === 'playing') {
      if (G.paused) {
        if (isPressed('KeyP', 'Escape', 'Enter') || padEdge('start')) resume();
        else if (isPressed('KeyQ')) toTitle();
      } else if (isPressed('KeyP', 'Escape') || padEdge('start')) pause();
    } else if (G.state === 'gameover') {
      if (G.goT > 1.2 && confirm) toTitle();
    }
    padPrev = pb;
    pressed = {};
  }

  // ---------------------------------------------------------------- rendering
  const skyGrad = {}, fillGrad = {}, ceilGrad = {};
  function getGrad(cache, s, y0, y1, c0, c1) {
    if (!cache[s]) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      cache[s] = g;
    }
    return cache[s];
  }

  function drawSky() {
    const w = G.world, cx = G.camX + W / 2, s = stageAt(cx);
    const t = s > 0 ? clamp((cx - w.starts[s]) / 300, 0, 1) : 1;
    if (t < 1) {
      ctx.fillStyle = getGrad(skyGrad, s - 1, TOP, H, STAGES[s - 1].sky[0], STAGES[s - 1].sky[1]);
      ctx.fillRect(0, TOP, W, H - TOP);
      ctx.globalAlpha = t;
    }
    ctx.fillStyle = getGrad(skyGrad, s, TOP, H, STAGES[s].sky[0], STAGES[s].sky[1]);
    ctx.fillRect(0, TOP, W, H - TOP);
    ctx.globalAlpha = 1;

    for (const st of STARS) {
      const x = (((st.x - G.camX * st.z * 0.3) % W) + W) % W;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(G.time * 2 + st.tw);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, st.y, st.z * 4, st.z * 4);
    }
    ctx.globalAlpha = 1;

    // far mountains / skyline
    const theme = STAGES[s];
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.32 : 0.16, base = layer ? 360 : 320;
      ctx.fillStyle = theme.mount;
      ctx.globalAlpha = layer ? 0.9 : 0.6;
      ctx.beginPath();
      ctx.moveTo(0, H);
      if (theme.name === 'CITY' && layer === 1) {
        for (let sx = -40; sx <= W + 40; sx += 4) {
          const wx = sx + G.camX * par, bi = Math.floor(wx / 36);
          ctx.lineTo(sx, base - 30 - hash(bi, 7) * 120);
        }
      } else {
        for (let sx = 0; sx <= W + 16; sx += 16) {
          const wx = sx + G.camX * par + layer * 1000;
          ctx.lineTo(sx, base - (Math.sin(wx * 0.004) * 45 + Math.sin(wx * 0.011 + 1) * 24 + Math.sin(wx * 0.027 + 2) * 9 + 50));
        }
      }
      ctx.lineTo(W + 16, H);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function edgePts(arr, a, b) {
    const pts = [], bl = G.world.blocky;
    for (let i = a; i <= b; i++) {
      const x = i * CW - G.camX;
      if (bl[i] && i < b) pts.push(x, arr[i], x + CW, arr[i]);
      else pts.push(x, arr[i]);
    }
    return pts;
  }
  function tracePts(pts) { for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }

  function drawTerrain() {
    const w = G.world, n = w.floor.length;
    const i0 = Math.max(0, Math.floor(G.camX / CW) - 1), i1 = Math.min(n - 1, Math.ceil((G.camX + W) / CW) + 1);
    let a = i0;
    while (a <= i1) {
      const s = w.stageOf[a];
      let b = a;
      while (b + 1 <= i1 && w.stageOf[b + 1] === s) b++;
      drawRun(a, Math.min(b + 1, i1), s);
      a = b + 1;
    }
  }

  function drawRun(a, b, s) {
    const w = G.world, theme = STAGES[s];
    // floor
    const fp = edgePts(w.floor, a, b);
    ctx.beginPath();
    ctx.moveTo(fp[0], H);
    tracePts(fp);
    ctx.lineTo(fp[fp.length - 2], H);
    ctx.closePath();
    ctx.fillStyle = getGrad(fillGrad, s, 230, H, theme.fill[0], theme.fill[1]);
    ctx.fill();
    if (theme.name === 'CITY') {
      for (let i = a; i < b; i++) {
        if (!w.blocky[i] || w.floor[i] > 420) continue;
        const x = i * CW - G.camX;
        for (let k = 0, y = w.floor[i] + 10; y < H - 4; k++, y += 13) {
          if (hash(i, k) < 0.38) {
            ctx.fillStyle = hash(k, i) < 0.5 ? 'rgba(255,215,106,.75)' : 'rgba(140,220,255,.5)';
            ctx.fillRect(x + 3, y, 4, 5);
          }
        }
      }
    }
    // inner strata line
    ctx.save();
    ctx.translate(0, 14);
    ctx.beginPath(); ctx.moveTo(fp[0], fp[1]); tracePts(fp);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 10; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(fp[0], fp[1]); tracePts(fp);
    ctx.strokeStyle = theme.edge; ctx.globalAlpha = 0.22; ctx.lineWidth = 7; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.stroke();

    // ceiling
    let hasCeil = false;
    for (let i = a; i <= b; i++) if (w.ceil[i] > TOP + 0.5) { hasCeil = true; break; }
    if (!hasCeil) return;
    const cp = edgePts(w.ceil, a, b);
    ctx.beginPath();
    ctx.moveTo(cp[0], TOP - 2);
    tracePts(cp);
    ctx.lineTo(cp[cp.length - 2], TOP - 2);
    ctx.closePath();
    ctx.fillStyle = getGrad(ceilGrad, s, TOP, 230, theme.fill[1], theme.fill[0]);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(cp[0], cp[1]); tracePts(cp);
    ctx.strokeStyle = theme.edge; ctx.globalAlpha = 0.22; ctx.lineWidth = 7; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawObj(o) {
    const x = o.x - G.camX, y = o.y;
    if (x < -40 || x > W + 40) return;
    ctx.save();
    ctx.translate(x, y);
    switch (o.type) {
      case 'fuel': {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow('rgba(255,70,110,.5)', 0, -13, 22, 0.45 + 0.2 * Math.sin(o.t * 5));
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(-11, 0, 11, 0);
        g.addColorStop(0, '#9b1230'); g.addColorStop(0.45, '#ff5d7c'); g.addColorStop(1, '#8a0f28');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-11, -26, 22, 26, 4) : ctx.rect(-11, -26, 22, 26); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-11, -18, 22, 9);
        text('FUEL', 0, -13, 5, '#c0143a', 'center');
        ctx.fillStyle = '#ddd'; ctx.fillRect(-4, -29, 8, 3);
        break;
      }
      case 'missile': {
        if (o.state) {
          ctx.globalCompositeOperation = 'lighter';
          drawGlow('rgba(255,140,40,.8)', 0, 4, 16 + Math.random() * 6);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = '#d8dee8';
        ctx.fillRect(-4, -26, 8, 24);
        ctx.fillStyle = '#ff3b4a';
        ctx.beginPath(); ctx.moveTo(-4, -26); ctx.lineTo(0, -34); ctx.lineTo(4, -26); ctx.fill();
        ctx.fillStyle = '#7a8496';
        ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-9, 0); ctx.lineTo(-4, -2); ctx.moveTo(4, -8); ctx.lineTo(9, 0); ctx.lineTo(4, -2); ctx.fill();
        ctx.fillStyle = '#ff3b4a'; ctx.fillRect(-4, -18, 8, 3);
        if (!o.state) { ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-8, -1, 16, 3); }
        break;
      }
      case 'tank': {
        ctx.fillStyle = '#4b5a2a';
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-12, -6); ctx.lineTo(12, -6); ctx.lineTo(14, 0); ctx.fill();
        ctx.fillStyle = '#7d8f45';
        ctx.fillRect(-11, -11, 22, 6);
        ctx.save();
        ctx.translate(0, -13);
        ctx.rotate(clamp(o.aim, -Math.PI + 0.2, -0.2));
        ctx.fillStyle = '#cfd8a0'; ctx.fillRect(0, -1.5, 15, 3);
        ctx.restore();
        ctx.fillStyle = '#9fb35a';
        ctx.beginPath(); ctx.arc(0, -13, 5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#222';
        for (let k = -10; k <= 10; k += 5) { ctx.beginPath(); ctx.arc(k, -2, 2, 0, TAU); ctx.fill(); }
        break;
      }
      case 'radar': {
        ctx.fillStyle = '#5a6577'; ctx.fillRect(-2, -18, 4, 18);
        ctx.fillStyle = '#3a4250'; ctx.fillRect(-9, -3, 18, 3);
        const sx = Math.cos(o.t * 2.5);
        ctx.fillStyle = '#c7d3e6';
        ctx.beginPath(); ctx.ellipse(0, -22, Math.max(1.5, Math.abs(sx) * 12), 6, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#7a8aa3'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(sx * 8, -28); ctx.stroke();
        if (Math.sin(o.t * 6) > 0) { ctx.globalCompositeOperation = 'lighter'; drawGlow('rgba(255,60,60,.9)', 0, -30, 7); ctx.globalCompositeOperation = 'source-over'; }
        break;
      }
      case 'core': {
        const pul = 0.6 + 0.4 * Math.sin(o.t * 5);
        ctx.fillStyle = '#3a4250'; ctx.fillRect(-14, -4, 28, 4);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow('rgba(80,255,240,.8)', 0, -14, 30 * pul + 10);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#bffcff';
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + o.t; ctx.lineTo(Math.cos(a) * 9, -14 + Math.sin(a) * 9); }
        ctx.fill();
        text('CORE', 0, -36 - 3 * Math.sin(o.t * 4), 7, '#7ffff2', 'center');
        break;
      }
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const x = e.x - G.camX, y = e.y;
    ctx.save();
    ctx.translate(x, y);
    if (e.type === 'ufo') {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow('rgba(150,120,255,.6)', 0, 0, 26, 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#9ff6ff';
      ctx.beginPath(); ctx.ellipse(0, -3, 6, 5, 0, Math.PI, 0); ctx.fill();
      const g = ctx.createLinearGradient(0, -3, 0, 5);
      g.addColorStop(0, '#d6dcff'); g.addColorStop(1, '#5a5f9a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 1, 15, 5, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 4; k++) {
        const lx = -10 + k * 6.6, on = Math.floor(e.t * 8 + k) % 4 === 0;
        ctx.fillStyle = on ? '#ffef6a' : '#5a4f7a';
        ctx.fillRect(lx - 1, 0, 2.5, 2.5);
      }
    } else if (e.type === 'meteor') {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow('rgba(255,120,40,.8)', 0, 0, e.r * 2.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.rotate(e.rot);
      ctx.fillStyle = '#5c4033';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8, rr = e.r * (0.8 + 0.2 * hash(k, e.r * 10)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.fill();
      ctx.fillStyle = '#3b2820';
      ctx.beginPath(); ctx.arc(e.r * 0.3, -e.r * 0.2, e.r * 0.25, 0, TAU); ctx.fill();
    } else if (e.type === 'dart') {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow('rgba(255,90,60,.8)', 12, 0, 10 + Math.random() * 4);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ff4757';
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, -7); ctx.lineTo(6, 0); ctx.lineTo(10, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd1d6'; ctx.fillRect(-4, -1.5, 8, 3);
    }
    ctx.restore();
  }

  function drawHeli(x, y, tilt, rotor, sc, carry) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(sc, sc);
    if (carry) {
      ctx.strokeStyle = 'rgba(200,255,250,.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 24); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow('rgba(80,255,240,.8)', 0, 28, 14);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#bffcff'; ctx.fillRect(-4, 24, 8, 8);
    }
    // tail boom and fin
    ctx.fillStyle = '#1e6fa8';
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-27, -3); ctx.lineTo(-27, 0); ctx.lineTo(-8, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b8fd6';
    ctx.beginPath(); ctx.moveTo(-22, -3); ctx.lineTo(-28, -11); ctx.lineTo(-31, -11); ctx.lineTo(-28, 0); ctx.closePath(); ctx.fill();
    const tr = Math.sin(rotor * 1.7) * 6;
    ctx.strokeStyle = 'rgba(220,240,255,.75)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-28, -5 - tr); ctx.lineTo(-28, -5 + tr); ctx.stroke();
    // skids
    ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, 11); ctx.lineTo(14, 11); ctx.quadraticCurveTo(18, 11, 19, 8);
    ctx.moveTo(-4, 6); ctx.lineTo(-5, 11); ctx.moveTo(8, 6); ctx.lineTo(9, 11);
    ctx.stroke();
    // body
    const g = ctx.createLinearGradient(0, -9, 0, 9);
    g.addColorStop(0, '#8fe6ff'); g.addColorStop(0.5, '#2a9be0'); g.addColorStop(1, '#123f66');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(2, 0, 14, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(205,250,255,.9)';
    ctx.beginPath(); ctx.ellipse(9, -2, 6, 4.5, -0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(8, -5, 3, 1.5);
    ctx.fillStyle = '#c8ccd8'; ctx.fillRect(12, 4, 9, 2);
    ctx.fillStyle = '#ffd34a'; ctx.fillRect(-6, -1, 6, 2);
    // mast + rotor
    ctx.fillStyle = '#456'; ctx.fillRect(0, -11, 3, 4);
    ctx.fillStyle = 'rgba(200,230,255,.18)';
    ctx.beginPath(); ctx.ellipse(1.5, -12, 25, 2.2, 0, 0, TAU); ctx.fill();
    const c = Math.cos(rotor);
    ctx.strokeStyle = 'rgba(235,245,255,.9)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(1.5 - 25 * c, -12); ctx.lineTo(1.5 + 25 * c, -12); ctx.stroke();
    if (Math.sin(G.time * 8) > 0.3) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(-30, -12, 2.5, 2.5); }
    ctx.restore();
  }

  function drawWorld() {
    drawSky();
    drawTerrain();
    for (const o of G.objs) if (o.alive) drawObj(o);
    for (const e of G.enemies) drawEnemy(e);

    ctx.globalCompositeOperation = 'lighter';
    for (const s of G.shots) drawGlow('rgba(255,60,60,.9)', s.x - G.camX, s.y, 9);
    for (const b of G.bullets) {
      const x = b.x - G.camX;
      ctx.strokeStyle = '#fff5b0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 12, b.y - b.vy * 0.02); ctx.lineTo(x, b.y); ctx.stroke();
      drawGlow('rgba(255,230,90,.8)', x, b.y, 7);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const b of G.bombs) {
      const x = b.x - G.camX;
      ctx.save(); ctx.translate(x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx - G.scroll + 1));
      ctx.fillStyle = '#2c3340'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.fillRect(-7, -2, 2, 4);
      ctx.restore();
    }

    const p = G.p;
    if (p && !p.dead && G.state !== 'title' && !(p.invuln > 0 && Math.floor(G.time * 12) % 2)) {
      drawHeli(p.x - G.camX, p.y, p.tilt, p.rotor, 1, G.coreHeld);
    }
    if (G.state === 'title') drawHeli(160, 200 + Math.sin(G.time * 2) * 18, Math.sin(G.time * 2 + 1) * 0.06, G.time * 42, 1.6, false);

    // particles
    for (const q of G.parts) {
      const x = q.x - G.camX, a = clamp(q.life / q.max, 0, 1);
      if (q.glow) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(q.color, x, q.y, q.size * (0.6 + a), a);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = q.color;
        ctx.fillRect(x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        ctx.globalAlpha = 1;
      }
    }
    for (const r of G.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = 'rgba(255,220,150,' + (1 - k) * 0.8 + ')';
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(r.x - G.camX, r.y, lerp(r.r, r.max, k), 0, TAU); ctx.stroke();
    }
    for (const u of G.popups) {
      ctx.globalAlpha = clamp(u.life * 2, 0, 1);
      text(u.text, u.x - G.camX, u.y, 8, u.color, 'center');
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    const g = ctx.createLinearGradient(0, 0, 0, TOP);
    g.addColorStop(0, '#0d1024'); g.addColorStop(1, '#05060f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = 'rgba(120,160,255,.35)';
    ctx.fillRect(0, TOP - 1, W, 1);

    text('SCORE', 12, 12, 7, '#7fa2ff');
    text(String(G.score).padStart(6, '0'), 12, 28, 11, '#fff');
    text('HI', 128, 12, 7, '#ff8fb0');
    text(String(hiScore()).padStart(6, '0'), 128, 28, 11, '#fff');

    // lives
    const lives = G.state === 'title' ? 0 : Math.max(0, G.lives - (G.p && G.p.dead ? 1 : 0));
    for (let i = 0; i < Math.min(lives, 5); i++) drawHeli(252 + i * 22, 24, 0, 0, 0.42, false);
    if (lives > 5) text('+' + (lives - 5), 362, 24, 7, '#fff');

    // pause button
    if (G.state === 'playing') {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillRect(PAUSE_BTN.x + 14, 13, 4, 14); ctx.fillRect(PAUSE_BTN.x + 22, 13, 4, 14);
    }

    // stage progress
    const sx = 432, sw = 36;
    STAGES.forEach((st, i) => {
      const cur = G.state !== 'title' && i === G.stage, done = G.state !== 'title' && i < G.stage;
      ctx.fillStyle = cur ? st.edge : done ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.1)';
      ctx.fillRect(sx + i * (sw + 3), 20, sw, 10);
      if (cur && G.p) {
        const w = G.world, t = clamp((G.p.x - w.starts[i]) / (w.ends[i] - w.starts[i]), 0, 1);
        ctx.fillStyle = '#fff'; ctx.fillRect(sx + i * (sw + 3) + t * (sw - 3), 18, 3, 14);
      }
    });
    text(G.state === 'title' ? 'MISSION' : 'STAGE ' + (G.stage + 1) + ' ' + STAGES[G.stage].name, sx, 10, 6, '#aab', 'left');

    // fuel
    const fx = 676, fw = 112;
    const fuel = G.p && G.state !== 'title' ? G.p.fuel : 100;
    const low = fuel < 25;
    text('FUEL', fx, 10, 6, low && Math.floor(G.time * 4) % 2 ? '#ff4050' : '#9fffb8');
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(fx, 18, fw, 12);
    const fg = ctx.createLinearGradient(fx, 0, fx + fw, 0);
    fg.addColorStop(0, '#ff3b4a'); fg.addColorStop(0.3, '#ffd34a'); fg.addColorStop(1, '#4dff88');
    ctx.fillStyle = fg; ctx.fillRect(fx, 18, fw * fuel / 100, 12);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(fx + 0.5, 18.5, fw - 1, 11);
  }

  function uiButton(x, y, w, h, label, action, opts) {
    const o = opts || {};
    ctx.fillStyle = o.fill || 'rgba(20,30,70,.75)';
    ctx.strokeStyle = o.stroke || '#6d8dff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    text(label, x + w / 2, y + h / 2 + 1, o.size || 11, o.color || '#fff', 'center');
    G.ui.push({ x, y, w, h, action });
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, TOP, W, H - TOP);
    ctx.save();
    ctx.shadowColor = '#ff7a2b'; ctx.shadowBlur = 24;
    const g = ctx.createLinearGradient(0, 80, 0, 130);
    g.addColorStop(0, '#fff3a0'); g.addColorStop(0.5, '#ffb52b'); g.addColorStop(1, '#ff4f2b');
    ctx.font = '46px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = g;
    ctx.fillText('HELI ATTACK', W / 2 + 60, 108);
    ctx.restore();
    text('FLY . BOMB . REFUEL . GRAB THE CORE', W / 2 + 60, 148, 8, '#9fd8ff', 'center');

    const bx = 380;
    uiButton(bx, 182, 200, 44, 'START', startGame, { fill: 'rgba(255,120,40,.85)', stroke: '#ffd34a', size: 14 });
    uiButton(bx, 238, 200, 34, '< ' + DIFFS[G.diff].name + ' >', () => { G.diff = (G.diff + 1) % 3; store.set('heliattack.diff', G.diff); }, { size: 9 });
    uiButton(bx, 282, 200, 30, 'SOUND: ' + (Sound.muted ? 'OFF' : 'ON'), () => Sound.toggleMute(), { size: 8 });

    text('TOP SCORES', 660, 192, 8, '#ff8fb0', 'center');
    for (let i = 0; i < 5; i++) {
      const s = G.scores[i];
      text((i + 1) + '. ' + (s != null ? String(s).padStart(6, '0') : '------'), 660, 214 + i * 18, 8, i === 0 ? '#ffd34a' : '#dde', 'center');
    }

    const help = G.usingTouch
      ? ['LEFT THUMB: FLY', 'RIGHT THUMB: FIRE   BOMB BUTTON: BOMB']
      : ['ARROWS / WASD: FLY    SPACE / Z: FIRE    X: BOMB', 'P: PAUSE    M: MUTE    GAMEPAD SUPPORTED'];
    help.forEach((h, i) => text(h, W / 2, 352 + i * 18, 8, '#cfd6ff', 'center'));
    if (Math.floor(G.time * 2) % 2 === 0) text(G.usingTouch ? 'TAP START' : 'PRESS ENTER', W / 2, 408, 10, '#fff', 'center');
    text('SHOOT FUEL TANKS TO REFUEL', W / 2, 430, 7, '#ff8fa0', 'center');
  }

  function drawBanner() {
    const b = G.banner;
    if (!b) return;
    const a = Math.min(1, b.t * 4, (b.dur - b.t) * 3);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 150, W, 70);
    ctx.save();
    ctx.shadowColor = STAGES[G.stage].edge; ctx.shadowBlur = 16;
    text(b.title, W / 2, 175, 20, '#fff', 'center');
    ctx.restore();
    text(b.sub, W / 2, 202, 10, STAGES[G.stage].edge, 'center');
    ctx.globalAlpha = 1;
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(0,0,10,.6)';
    ctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, 130, 24, '#fff', 'center');
    uiButton(W / 2 - 110, 175, 220, 44, 'RESUME', resume, { fill: 'rgba(255,120,40,.85)', stroke: '#ffd34a', size: 12 });
    uiButton(W / 2 - 110, 232, 220, 36, 'SOUND: ' + (Sound.muted ? 'OFF' : 'ON'), () => Sound.toggleMute(), { size: 9 });
    uiButton(W / 2 - 110, 280, 220, 36, 'QUIT', toTitle, { size: 9 });
    if (!G.usingTouch) text('P: RESUME   M: MUTE   Q: QUIT', W / 2, 345, 8, '#aab', 'center');
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, TOP, W, H - TOP);
    ctx.save();
    ctx.shadowColor = '#ff3b4a'; ctx.shadowBlur = 20;
    text('GAME OVER', W / 2, 160, 30, '#ff5a6a', 'center');
    ctx.restore();
    text('SCORE ' + G.score, W / 2, 215, 14, '#fff', 'center');
    if (G.newHi && Math.floor(G.time * 3) % 2 === 0) text('NEW HIGH SCORE!', W / 2, 250, 12, '#ffd34a', 'center');
    if (G.goT > 1.2) {
      uiButton(W / 2 - 100, 290, 200, 40, 'CONTINUE', toTitle, { size: 11 });
    }
  }

  function drawTouchControls() {
    if (!G.usingTouch || G.state !== 'playing' || G.paused) return;
    const st = touch.stick;
    ctx.globalAlpha = 0.5;
    if (st) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(st.ox, st.oy, 40, 0, TAU); ctx.stroke();
      let dx = st.x - st.ox, dy = st.y - st.oy;
      const l = Math.hypot(dx, dy);
      if (l > 40) { dx *= 40 / l; dy *= 40 / l; }
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(st.ox + dx, st.oy + dy, 16, 0, TAU); ctx.fill();
    } else {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(90, H - 80, 40, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(90, H - 80, 14, 0, TAU); ctx.fill();
    }
    const btn = (b, label, on, color) => {
      ctx.globalAlpha = on ? 0.6 : 0.3;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9;
      text(label, b.x, b.y + 1, b.r > 40 ? 10 : 8, '#fff', 'center');
    };
    btn(FIRE_BTN, 'FIRE', touch.fireId != null, '#ff6a2b');
    btn(BOMB_BTN, 'BOMB', touch.bombId != null, '#4d7dff');
    ctx.globalAlpha = 1;
  }

  function render() {
    G.ui = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    ctx.save();
    if (G.shake > 0) ctx.translate(rand(-G.shake, G.shake), rand(-G.shake, G.shake));
    drawWorld();
    ctx.restore();
    if (G.flash > 0) { ctx.fillStyle = 'rgba(255,240,220,' + G.flash * 0.6 + ')'; ctx.fillRect(0, 0, W, H); }

    drawHUD();
    if (G.state === 'title') drawTitle();
    else if (G.state === 'gameover') drawGameOver();
    else {
      drawBanner();
      drawTouchControls();
      if (G.paused) drawPause();
    }
    ctx.restore();

    if (window.innerHeight > window.innerWidth && G.usingTouch) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const y = Math.max(30, offY / 2);
      ctx.font = '12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd34a';
      ctx.fillText('ROTATE YOUR PHONE', window.innerWidth / 2, y);
      ctx.font = '9px ' + FONT; ctx.fillStyle = '#aab';
      ctx.fillText('LANDSCAPE PLAYS BEST', window.innerWidth / 2, y + 20);
    }
  }

  // ---------------------------------------------------------------- main loop
  let last = performance.now(), acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    handleEdges();
    let n = 0;
    while (acc >= STEP && n < 5) { update(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test hook
  window.__heli = G;
})();
