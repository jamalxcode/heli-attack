/* Heli Attack - a modern retro side-scrolling helicopter shooter.
   Single file, no dependencies. Canvas 2D + Web Audio. */
'use strict';
(function () {
  // ---------------------------------------------------------------- constants
  const W = 800, H = 450, TOP = 40, CW = 10, RAMP = 24, NEUTRAL_FLOOR = 410;
  const STEP = 1 / 60, TAU = Math.PI * 2;
  const FONT = '"Press Start 2P", monospace';
  const SAFE_HALF = 18; // half-width (columns) of the flat zone around each checkpoint

  const STAGES = [
    { name: 'HILLS', len: 380, sky: ['#070b26', '#3a1d5c'], fill: ['#1f7f49', '#05200f'], edge: '#6dffb0', mount: '#1b1745' },
    { name: 'CAVERNS', len: 380, sky: ['#05040c', '#24102e'], fill: ['#8f4d1d', '#260f04'], edge: '#ffa04a', mount: '#1a0d22' },
    { name: 'METEOR STORM', len: 380, sky: ['#14030c', '#5c1530'], fill: ['#7c2b5e', '#1d0518'], edge: '#ff5fb4', mount: '#2c0b22' },
    { name: 'CITY', len: 400, sky: ['#020617', '#0e2c4e'], fill: ['#2a3d62', '#091022'], edge: '#5fd0ff', mount: '#0b1a34' },
    { name: 'TUNNELS', len: 400, sky: ['#010d0d', '#06302c'], fill: ['#0f5f56', '#021a18'], edge: '#4dfff0', mount: '#04221e' },
    { name: 'FORTRESS', len: 520, sky: ['#0e0a02', '#3d2c08'], fill: ['#6d6553', '#1a1812'], edge: '#ffd84a', mount: '#241b08' },
  ];

  const DIFFS = [
    { name: 'EASY', drain: 1.3, fuelGain: 25, fire: 0.6, enemy: 0.7, lives: 5 },
    { name: 'NORMAL', drain: 1.8, fuelGain: 20, fire: 0.9, enemy: 0.95, lives: 3 },
    { name: 'HARD', drain: 2.4, fuelGain: 16, fire: 1.3, enemy: 1.3, lives: 3 },
  ];
  const LEVELS = ['OFF', 'LOW', 'MED', 'HIGH'];

  // Terrain hit points (relative to heli centre, unrotated). Kept inside the
  // fuselage so grazing the rotor tips or tail fin is forgiven.
  const HITPTS = [[18, 3], [10, -5], [-24, -1], [-5, 10], [13, 10], [2, -9]];

  const POWERS = {
    S: { name: 'SPREAD', color: '#ffb347', time: 15 },
    B: { name: 'TRIPLE BOMB', color: '#6d9dff', time: 15 },
    H: { name: 'SHIELD', color: '#4dfff0', time: 0 },
  };

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const smooth = (t) => t * t * (3 - 2 * t);
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
  function track(name, title) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: 'event/' + name, title: title || name, event: true }); } catch (e) { /* analytics optional */ }
  }

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
  function additive(fn) {
    ctx.globalCompositeOperation = 'lighter';
    fn();
    ctx.globalCompositeOperation = 'source-over';
  }
  function text(str, x, y, size, color, align) {
    ctx.font = size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  // Gradients are cached in local coordinates; they follow the current transform when used.
  const gradCache = {};
  function linGrad(key, x0, y0, x1, y1, stops) {
    let g = gradCache[key];
    if (!g) {
      g = ctx.createLinearGradient(x0, y0, x1, y1);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      gradCache[key] = g;
    }
    return g;
  }

  // ---------------------------------------------------------------- sound
  const Sound = (function () {
    let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, pulse = null, engine = null;
    let muted = store.get('heliattack.muted', false);
    let sfxLevel = store.get('heliattack.sfx', 3), musicLevel = store.get('heliattack.music', 2);
    const VOL = 0.55;

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
      sfxBus = ac.createGain(); sfxBus.gain.value = sfxLevel / 3; sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = (musicLevel / 3) * 0.8; musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // 25% duty pulse wave: the classic chiptune lead
      const N = 32, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
      pulse = ac.createPeriodicWave(re, im);
    }
    function env(g, t, vol, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    function osc(at, dest, type, f0, f1, dur, vol) {
      if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      if (type === 'pulse') o.setPeriodicWave(pulse); else o.type = type;
      o.frequency.setValueAtTime(f0, at);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
      env(g, at, vol, dur);
      o.connect(g); g.connect(dest);
      o.start(at); o.stop(at + dur + 0.05);
    }
    function noiseAt(at, dest, dur, vol, f0, f1, type) {
      if (!ac) return;
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; s.loop = true;
      s.loopStart = Math.random() * 0.5;
      f.type = type || 'lowpass'; f.Q.value = 0.9;
      f.frequency.setValueAtTime(f0, at);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
      env(g, at, vol, dur);
      s.connect(f); f.connect(g); g.connect(dest);
      s.start(at, Math.random() * 0.5); s.stop(at + dur + 0.05);
    }
    const now = (d) => ac.currentTime + (d || 0);
    const tone = (type, f0, f1, dur, vol, delay) => ac && osc(now(delay), sfxBus, type, f0, f1, dur, vol);
    const noise = (dur, vol, f0, f1, delay, type) => ac && noiseAt(now(delay), sfxBus, dur, vol, f0, f1, type);
    function seq(notes, type, len, vol) { notes.forEach((n, i) => { if (n) tone(type, n, n, len * 0.95, vol, i * len); }); }

    function engineOn() {
      if (!ac) return;
      if (!engine) {
        const o1 = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter();
        const amp = ac.createGain(), vol = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
        o1.type = 'sawtooth'; o1.frequency.value = 46;
        o2.type = 'square'; o2.frequency.value = 93;
        f.type = 'lowpass'; f.frequency.value = 300;
        amp.gain.value = 0.55; lfo.type = 'square'; lfo.frequency.value = 15; lg.gain.value = 0.45;
        vol.gain.value = 0;
        lfo.connect(lg); lg.connect(amp.gain);
        o1.connect(f); o2.connect(f); f.connect(amp); amp.connect(vol); vol.connect(sfxBus);
        o1.start(); o2.start(); lfo.start();
        engine = { o1, o2, lfo, vol };
      }
      engine.vol.gain.setTargetAtTime(0.035, ac.currentTime, 0.1);
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
      init, engineOn, engineOff, enginePitch, osc, noiseAt,
      get ac() { return ac; }, get musicBus() { return musicBus; },
      get muted() { return muted; },
      get sfxLevel() { return sfxLevel; }, get musicLevel() { return musicLevel; },
      toggleMute() {
        muted = !muted;
        store.set('heliattack.muted', muted);
        if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.02);
      },
      cycleSfx() {
        sfxLevel = (sfxLevel + 1) % 4;
        store.set('heliattack.sfx', sfxLevel);
        if (sfxBus) sfxBus.gain.setTargetAtTime(sfxLevel / 3, ac.currentTime, 0.02);
      },
      cycleMusic() {
        musicLevel = (musicLevel + 1) % 4;
        store.set('heliattack.music', musicLevel);
        if (musicBus) musicBus.gain.setTargetAtTime((musicLevel / 3) * 0.8, ac.currentTime, 0.02);
      },
      shoot(quiet) { tone('square', 1100, 300, 0.06, quiet ? 0.035 : 0.06); },
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
      shell() { tone('triangle', 300, 120, 0.15, 0.07); },
      pickup() { seq([784, 988, 1175, 1568, 1976], 'triangle', 0.06, 0.12); },
      power() { seq([523, 784, 1046, 1318, 1568, 2093], 'pulse', 0.045, 0.1); },
      shieldHit() { tone('sawtooth', 900, 200, 0.3, 0.12); noise(0.2, 0.1, 5000, 800); },
      checkpoint() { seq([659, 784, 988, 1318], 'pulse', 0.07, 0.1); },
      gate() { tone('sawtooth', 220, 230, 0.12, 0.02); },
      bossHit() { tone('square', 220, 160, 0.05, 0.05); },
      siren() { for (let i = 0; i < 3; i++) { tone('sawtooth', 520, 880, 0.35, 0.08, i * 0.7); tone('sawtooth', 880, 520, 0.35, 0.08, i * 0.7 + 0.35); } },
      extra() { seq([659, 0, 659, 880, 1175, 1318], 'square', 0.08, 0.08); },
      stage() { seq([392, 523, 659, 784], 'triangle', 0.09, 0.12); },
      start() { seq([262, 330, 392, 523, 0, 392, 523, 659, 784], 'square', 0.09, 0.07); },
      gameOver() { seq([392, 370, 349, 330, 0, 262], 'triangle', 0.22, 0.13); },
      mission() { seq([523, 659, 784, 1046, 0, 784, 1046, 1318, 1568], 'square', 0.11, 0.08); },
      click() { tone('square', 660, 660, 0.04, 0.05); },
    };
  })();

  // ---------------------------------------------------------------- music
  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11], harmonic: [0, 2, 3, 5, 7, 8, 11],
  };
  const BASS = {
    drive: [1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 3],
    gallop: [1, 0, 1, 2, 0, 1, 1, 0, 1, 0, 1, 2, 0, 1, 3, 0],
    slow: [1, 0, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0, 1, 0, 0, 0],
    walk: [1, 0, 3, 0, 2, 0, 3, 0, 1, 0, 3, 0, 2, 0, 1, 0],
  };
  const TRACKS = [
    { bpm: 112, root: 57, scale: 'minor', prog: [0, 5, 3, 4], seed: 11, bass: 'slow', kick: [0, 8], arp: true },
    { bpm: 138, root: 55, scale: 'major', prog: [0, 4, 5, 3], seed: 23, bass: 'drive', kick: [0, 8], arp: true },
    { bpm: 120, root: 50, scale: 'phrygian', prog: [0, 1, 0, 6], seed: 37, bass: 'walk', kick: [0, 10], arp: false },
    { bpm: 150, root: 52, scale: 'harmonic', prog: [0, 5, 4, 4], seed: 41, bass: 'gallop', kick: [0, 6, 8, 14], arp: true },
    { bpm: 132, root: 53, scale: 'dorian', prog: [0, 3, 0, 4], seed: 53, bass: 'walk', kick: [0, 8, 11], arp: true },
    { bpm: 128, root: 49, scale: 'minor', prog: [0, 6, 5, 4], seed: 67, bass: 'drive', kick: [0, 8], arp: false },
    { bpm: 144, root: 47, scale: 'minor', prog: [0, 0, 5, 4], seed: 71, bass: 'gallop', kick: [0, 4, 8, 12], arp: true },
    { bpm: 162, root: 45, scale: 'harmonic', prog: [0, 1, 0, 4], seed: 83, bass: 'gallop', kick: [0, 3, 6, 8, 11, 14], arp: true },
  ];
  const RHYTHMS = [[0, 3, 6, 8, 10, 12, 14], [0, 2, 4, 6, 8, 11, 12], [0, 4, 6, 7, 8, 12, 14, 15], [0, 3, 4, 7, 8, 10, 12], [0, 6, 8, 12]];

  function makeMelody(tr) {
    const r = mulberry32(tr.seed), mel = new Array(128).fill(null);
    let idx = 7;
    for (let bar = 0; bar < 8; bar++) {
      if (bar >= 4 && bar !== 7 && bar !== 5) {
        for (let s = 0; s < 16; s++) mel[bar * 16 + s] = mel[(bar - 4) * 16 + s];
        continue;
      }
      const chord = tr.prog[bar % 4];
      const rh = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
      rh.forEach((s, k) => {
        if (s === 0 || s === 8) {
          const tones = [chord, chord + 2, chord + 4].map((d) => d + 7);
          idx = tones.reduce((best, t) => (Math.abs(t - idx) < Math.abs(best - idx) ? t : best), tones[0]);
          if (r() < 0.3) idx = tones[Math.floor(r() * 3)];
        } else {
          idx += [-2, -1, -1, 1, 1, 2, 3][Math.floor(r() * 7)];
        }
        idx = clamp(idx, 4, 14);
        const next = k + 1 < rh.length ? rh[k + 1] : 16;
        mel[bar * 16 + s] = { i: idx, len: Math.min(next - s, 4) };
      });
    }
    return mel;
  }
  TRACKS.forEach((t) => { t.mel = makeMelody(t); });

  const Music = (function () {
    let cur = -1, step = 0, next = 0, timer = null;
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function note(tr, idx) {
      const sc = SCALES[tr.scale];
      return tr.root + sc[((idx % 7) + 7) % 7] + 12 * Math.floor(idx / 7);
    }
    function play(stepN, t) {
      const tr = TRACKS[cur], bus = Sound.musicBus, sd = 60 / tr.bpm / 4;
      const s = stepN % 16, bar = Math.floor(stepN / 16) % 8, chord = tr.prog[bar % 4];
      const b = BASS[tr.bass][s];
      if (b) {
        const deg = b === 3 ? chord + 4 : chord;
        Sound.osc(t, bus, 'triangle', midi(note(tr, deg) - 24 + (b === 2 ? 12 : 0)), midi(note(tr, deg) - 24 + (b === 2 ? 12 : 0)), sd * 1.6, 0.22);
      }
      const m = tr.mel[bar * 16 + s];
      if (m) { const f = midi(note(tr, m.i)); Sound.osc(t, bus, 'pulse', f, f, sd * m.len * 0.9, 0.07); }
      if (tr.arp) { const f = midi(note(tr, chord + 2 * (stepN % 3)) + 12); Sound.osc(t, bus, 'square', f, f, sd * 0.6, 0.018); }
      if (tr.kick.includes(s)) Sound.osc(t, bus, 'sine', 150, 40, 0.13, 0.35);
      if (s === 4 || s === 12) Sound.noiseAt(t, bus, 0.11, 0.13, 2500, 900, 'bandpass');
      if (s % 2 === 0) Sound.noiseAt(t, bus, 0.03, 0.04, 9000, 7000, 'highpass');
    }
    function tick() {
      const ac = Sound.ac;
      if (!ac || cur < 0) return;
      const sd = 60 / TRACKS[cur].bpm / 4;
      if (next < ac.currentTime - 0.2) next = ac.currentTime + 0.05;
      while (next < ac.currentTime + 0.15) { play(step, next); next += sd; step = (step + 1) % 128; }
    }
    return {
      play(n) {
        const ac = Sound.ac;
        if (!ac) return;
        if (n === cur && timer) return;
        cur = n; step = 0; next = ac.currentTime + 0.1;
        if (!timer) timer = setInterval(tick, 25);
      },
      stop() { cur = -1; if (timer) { clearInterval(timer); timer = null; } },
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
  const BOMB_BTN = { x: W - 62, y: H - 62, r: 38 };
  const PAUSE_BTN = { x: 372, y: 0, w: 52, h: TOP + 6 };
  function toGame(e) { return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale }; }

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
      } else if (G.autofire || Math.hypot(p.x - BOMB_BTN.x, p.y - BOMB_BTN.y) < BOMB_BTN.r + 16) {
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
    if (touch.fireId != null || G.autofire) fire = true;
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
  // Overwrite arr[a..b] with value, easing into the surrounding terrain over `blend` columns.
  function stamp(arr, bl, a, b, value, blend, blocky) {
    for (let i = Math.max(0, a - blend); i <= Math.min(arr.length - 1, b + blend); i++) {
      let w = 1;
      if (i < a) w = smooth(1 - (a - i) / (blend + 1));
      else if (i > b) w = smooth(1 - (i - b) / (blend + 1));
      arr[i] = lerp(arr[i], typeof value === 'function' ? value(i) : value, w);
      if (bl) bl[i] = blocky && i >= a && i <= b;
    }
  }
  const clearObjs = (objs, a, b) => objs.filter((o) => o.c < a || o.c > b);

  const GEN = [
    function hills(n, fl, ce, bl, objs, r) {
      walk(n, fl, 400, 290, 428, 3.2, r);
      ce.fill(TOP);
      scatter(objs, n, r, 16, 30, [['missile', 0.48], ['fuel', 0.34], ['radar', 0.18]]);
    },
    function caverns(n, fl, ce, bl, objs, r) {
      walk(n, fl, 390, 270, 428, 3.5, r);
      walk(n, ce, 120, TOP + 10, 210, 3.5, r);
      for (let i = 0; i < n; i++) {
        if (fl[i] - ce[i] < 175) { const m = (fl[i] + ce[i]) / 2; fl[i] = Math.min(428, m + 88); ce[i] = fl[i] - 175; }
        ce[i] = Math.max(TOP, ce[i]);
      }
      scatter(objs, n, r, 20, 34, [['fuel', 0.45], ['missile', 0.33], ['radar', 0.22]]);
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
        const bw = Math.floor(3 + r() * 5), h = 240 + r() * 175;
        for (let k = 0; k < bw && i < n; k++, i++) { fl[i] = h; bl[i] = true; }
        if (bw >= 3 && r() < 0.65) objs.push({ type: pickT([['tank', 0.35], ['fuel', 0.37], ['missile', 0.15], ['radar', 0.13]], r()), c: i - Math.ceil(bw / 2) });
        const gap = Math.floor(r() * 3);
        for (let k = 0; k < gap && i < n; k++, i++) { fl[i] = 428; bl[i] = true; }
      }
    },
    function tunnels(n, fl, ce, bl, objs, r) {
      let i = 0, center = 240;
      while (i < n) {
        const sl = Math.floor(6 + r() * 9);
        center = clamp(center + (r() - 0.5) * 110, TOP + 95, 340);
        const gap = 130 + r() * 50;
        const f = Math.min(428, center + gap / 2), c = Math.max(TOP, center - gap / 2);
        for (let k = 0; k < sl && i < n; k++, i++) { fl[i] = f; ce[i] = c; bl[i] = true; }
        if (r() < 0.55) objs.push({ type: pickT([['fuel', 0.5], ['tank', 0.22], ['radar', 0.28]], r()), c: i - Math.ceil(sl / 2) });
      }
    },
    function fortress(n, fl, ce, bl, objs, r) {
      fl.fill(410); ce.fill(TOP);
      let i = RAMP + 10;
      while (i < n - 250) {
        const k = r();
        if (k < 0.33) {
          const bw = Math.floor(3 + r() * 3), h = 300 + r() * 50;
          for (let j = 0; j < bw; j++) { fl[i + j] = h; bl[i + j] = true; }
          objs.push({ type: r() < 0.7 ? 'tank' : 'fuel', c: i + Math.floor(bw / 2) });
          i += bw + Math.floor(5 + r() * 4);
        } else if (k < 0.58) {
          const bw = Math.floor(8 + r() * 8), h = 150 + r() * 50;
          for (let j = 0; j < bw; j++) { ce[i + j] = h; bl[i + j] = true; }
          objs.push({ type: r() < 0.65 ? 'fuel' : 'tank', c: i + Math.floor(bw / 2) });
          i += bw + Math.floor(3 + r() * 3);
        } else {
          objs.push({ type: pickT([['missile', 0.45], ['fuel', 0.35], ['tank', 0.2]], r()), c: i });
          i += Math.floor(6 + r() * 5);
        }
      }
    },
  ];

  // Hand-designed set pieces, stamped over the generated terrain at ~28% and ~72% of each stage.
  const SET_PIECES = [
    function hills(n, fl, ce, bl, objs, ev) {
      // Missile battery on a plateau
      let a = Math.floor(n * 0.26), b = a + 22;
      objs = clearObjs(objs, a - 6, b + 6);
      stamp(fl, bl, a, b, 320, 6, false);
      for (let k = 0; k < 6; k++) objs.push({ type: 'missile', c: a + 2 + k * 3.5, props: { trigger: 300 } });
      ev.push({ c: a - 40, type: 'banner', title: 'MISSILE BATTERY', sub: 'KEEP MOVING' });
      // Fuel depot in a deep valley
      a = Math.floor(n * 0.7); b = a + 18;
      objs = clearObjs(objs, a - 6, b + 6);
      stamp(fl, bl, a, b, 426, 7, false);
      for (let k = 0; k < 4; k++) objs.push({ type: 'fuel', c: a + 2 + k * 4 });
      objs.push({ type: 'radar', c: b + 4 });
      return objs;
    },
    function caverns(n, fl, ce, bl, objs, ev) {
      // Serpent passage: the cave snakes up and down
      const a = Math.floor(n * 0.24), b = a + 44;
      objs = clearObjs(objs, a - 8, b + 8);
      const mid = (i) => 235 + Math.sin((i - a) / 7) * 70;
      stamp(ce, null, a, b, (i) => mid(i) - 72, 8, false);
      stamp(fl, null, a, b, (i) => mid(i) + 72, 8, false);
      objs.push({ type: 'fuel', c: b + 10 });
      // UFO squadron
      ev.push({ c: Math.floor(n * 0.7), type: 'swarm' });
      return objs;
    },
    function meteors(n, fl, ce, bl, objs, ev) {
      ev.push({ c: Math.floor(n * 0.27), type: 'shower' });
      // Crater valley with a missile nest
      const a = Math.floor(n * 0.7), b = a + 24;
      objs = clearObjs(objs, a - 6, b + 6);
      stamp(fl, bl, a, b, (i) => 395 + Math.sin((i - a) / 3) * 20, 5, false);
      for (let k = 0; k < 5; k++) objs.push({ type: k === 2 ? 'fuel' : 'missile', c: a + 2 + k * 5, props: { trigger: 220 } });
      return objs;
    },
    function city(n, fl, ce, bl, objs, ev) {
      // Skyline climb: a staircase of towers with turrets on every step
      let a = Math.floor(n * 0.25);
      objs = clearObjs(objs, a - 2, a + 44);
      const steps = [380, 330, 280, 230, 190, 230, 300, 380];
      steps.forEach((h, k) => {
        for (let j = 0; j < 5; j++) { fl[a + k * 5 + j] = h; bl[a + k * 5 + j] = true; }
        if (k % 2 === 1) objs.push({ type: k === 3 ? 'fuel' : 'tank', c: a + k * 5 + 2 });
      });
      ev.push({ c: a - 40, type: 'banner', title: 'SKYLINE', sub: 'CLIMB!' });
      // Armoured column on a long flat roof
      a = Math.floor(n * 0.7);
      objs = clearObjs(objs, a - 2, a + 34);
      for (let j = 0; j < 32; j++) { fl[a + j] = 340; bl[a + j] = true; }
      for (let k = 0; k < 5; k++) objs.push({ type: k === 2 ? 'fuel' : 'tank', c: a + 3 + k * 6 });
      return objs;
    },
    function tunnels(n, fl, ce, bl, objs, ev) {
      // Laser gates in a straight shaft
      let a = Math.floor(n * 0.24);
      objs = clearObjs(objs, a - 4, a + 60);
      for (let j = -4; j < 60; j++) { fl[a + j] = 330; ce[a + j] = 150; bl[a + j] = true; }
      for (let k = 0; k < 4; k++) objs.push({ type: 'gate', c: a + 8 + k * 13, props: { phase: k * 0.5 } });
      objs.push({ type: 'fuel', c: a + 56 });
      ev.push({ c: a - 40, type: 'banner', title: 'LASER GATES', sub: 'TIME YOUR RUN' });
      // Zigzag run
      a = Math.floor(n * 0.7);
      objs = clearObjs(objs, a - 2, a + 50);
      for (let k = 0; k < 8; k++) {
        const c = k % 2 ? 280 : 205;
        for (let j = 0; j < 6; j++) { fl[a + k * 6 + j] = c + 78; ce[a + k * 6 + j] = c - 78; bl[a + k * 6 + j] = true; }
      }
      return objs;
    },
    function fortress(n, fl, ce, bl, objs, ev) {
      // Bunker row under a low roof
      const a = Math.floor(n * 0.2);
      objs = clearObjs(objs, a - 4, a + 40);
      for (let j = 0; j < 40; j++) { fl[a + j] = 410; ce[a + j] = 150; bl[a + j] = true; }
      for (let k = 0; k < 3; k++) {
        const c = a + 4 + k * 12;
        for (let j = 0; j < 4; j++) fl[c + j] = 340;
        objs.push({ type: k === 1 ? 'fuel' : 'tank', c: c + 2 });
      }
      // Boss arena: flat, open ground
      for (let i = n - 245; i < n; i++) { fl[i] = 410; ce[i] = TOP; bl[i] = false; }
      objs = clearObjs(objs, n - 245, n);
      ev.push({ c: n - 205, type: 'warnBoss' });
      ev.push({ c: n - 150, type: 'boss' });
      return objs;
    },
  ];

  function buildWorld(loop) {
    const rng = mulberry32(0x5eed + loop * 7919);
    const w = { floor: [], ceil: [], blocky: [], stageOf: [], starts: [], ends: [], mids: [], specs: [], events: [] };
    STAGES.forEach((st, s) => {
      const n = st.len;
      const fl = new Array(n).fill(NEUTRAL_FLOOR), ce = new Array(n).fill(TOP), bl = new Array(n).fill(false);
      let objs = [];
      const ev = [];
      GEN[s](n, fl, ce, bl, objs, rng);
      objs = SET_PIECES[s](n, fl, ce, bl, objs, ev);
      // checkpoint safe zone
      const mid = Math.floor(n * (s === 5 ? 0.42 : 0.5));
      for (let i = mid - SAFE_HALF; i <= mid + SAFE_HALF; i++) {
        const d = Math.abs(i - mid), t = d <= 10 ? 1 : smooth(1 - (d - 10) / (SAFE_HALF - 10 + 1));
        fl[i] = lerp(fl[i], 400, t);
        ce[i] = lerp(ce[i], TOP, t);
        if (t > 0.01) bl[i] = false;
      }
      objs = clearObjs(objs, mid - SAFE_HALF - 2, mid + SAFE_HALF + 2);
      for (let i = 0; i < n; i++) {
        let t = 1;
        if (i < RAMP) t = i / RAMP;
        else if (i > n - 1 - RAMP) t = (n - 1 - i) / RAMP;
        if (t < 1) {
          t = smooth(t);
          fl[i] = lerp(NEUTRAL_FLOOR, fl[i], t);
          ce[i] = lerp(TOP, ce[i], t);
          bl[i] = false;
        }
      }
      const base = w.floor.length;
      w.starts[s] = base * CW;
      w.mids[s] = (base + mid) * CW;
      for (let i = 0; i < n; i++) { w.floor.push(fl[i]); w.ceil.push(ce[i]); w.blocky.push(bl[i]); w.stageOf.push(s); }
      w.ends[s] = (base + n) * CW;
      for (const o of objs) {
        const c = Math.round(o.c);
        if (c < RAMP + 6 || c > n - RAMP - 6) continue;
        const y = Math.min(fl[c - 1], fl[c], fl[c + 1]);
        const spec = { type: o.type, x: (base + o.c) * CW + CW / 2, y, props: o.props };
        if (o.type === 'gate') spec.top = Math.max(ce[c - 1], ce[c], ce[c + 1]);
        w.specs.push(spec);
      }
      for (const e of ev) w.events.push(Object.assign({}, e, { x: (base + e.c) * CW }));
    });
    for (let i = 0; i < 90; i++) { w.floor.push(NEUTRAL_FLOOR); w.ceil.push(TOP); w.blocky.push(false); w.stageOf.push(STAGES.length - 1); }
    w.specs.sort((a, b) => a.x - b.x);
    w.events.sort((a, b) => a.x - b.x);
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
    autofire: store.get('heliattack.autofire', matchMedia('(pointer: coarse)').matches),
    score: 0, lives: 3, loop: 0, nextLife: 10000, stage: 0, camX: 0, time: 0, checkpoint: 0,
    world: null, specIdx: 0, eventIdx: 0, p: null, boss: null, showerT: 0, showerSpawn: 0,
    bullets: [], bombs: [], objs: [], enemies: [], shots: [], items: [], parts: [], rings: [], popups: [],
    banner: null, shake: 0, flash: 0, spawnT: 1, alarmT: 0, deathT: 0, goT: 0, coreHeld: false, newHi: false,
    scroll: 100, spd: 100, drain: 2, fuelGain: 19, fireRate: 1, enemy: 1,
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
    return { x, y, vx: 0, vy: 0, tilt: 0, rotor: 0, fuel: 100, fireCool: 0, bombCool: 0, invuln: 2.5, dead: false, shield: false, spreadT: 0, tripleT: 0 };
  }

  function startGame() {
    Sound.init();
    G.score = 0; G.loop = 0; G.nextLife = 10000;
    G.lives = DIFFS[G.diff].lives;
    G.paused = false;
    applyDifficulty();
    G.world = buildWorld(0);
    G.checkpoint = 0;
    respawn();
    Sound.start();
    track('start-' + DIFFS[G.diff].name.toLowerCase(), 'Game started (' + DIFFS[G.diff].name + ')');
    if (G.usingTouch && !isStandalone()) tryFullscreen();
  }

  // Respawn at the last checkpoint (a stage start or a stage midpoint).
  function respawn() {
    const w = G.world, cp = G.checkpoint;
    const stage = stageAt(cp);
    const isMid = cp === w.mids[stage];
    G.state = 'playing';
    G.stage = stage;
    G.camX = isMid ? cp - 200 : cp;
    G.p = newPlayer(G.camX + 120, 220);
    G.bullets = []; G.bombs = []; G.objs = []; G.enemies = []; G.shots = []; G.popups = []; G.items = [];
    G.coreHeld = false;
    G.boss = null; G.showerT = 0;
    G.spawnT = 2;
    G.specIdx = 0;
    while (G.specIdx < w.specs.length && w.specs[G.specIdx].x < G.camX) G.specIdx++;
    G.eventIdx = 0;
    while (G.eventIdx < w.events.length && w.events[G.eventIdx].x < G.camX + W) G.eventIdx++;
    showBanner('STAGE ' + (stage + 1), isMid ? STAGES[stage].name + ' - CHECKPOINT' : STAGES[stage].name);
    Sound.engineOn();
    Music.play(stage + 1);
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
    Music.stop();
  }
  function resume() {
    G.paused = false;
    if (!G.p.dead) Sound.engineOn();
    Music.play(G.boss ? 7 : G.stage + 1);
  }
  function toTitle() {
    G.state = 'title'; G.paused = false;
    Sound.engineOff();
    Music.play(0);
    G.world = buildWorld(0);
    G.camX = 0;
    G.objs = []; G.enemies = []; G.shots = []; G.bullets = []; G.bombs = []; G.popups = []; G.items = [];
    G.boss = null;
  }

  function gameOver() {
    G.state = 'gameover';
    G.goT = 0;
    Sound.engineOff();
    Music.stop();
    Sound.gameOver();
    G.newHi = G.score > 0 && G.score > (G.scores[0] || 0);
    if (G.score > 0) {
      G.scores.push(G.score);
      G.scores.sort((a, b) => b - a);
      G.scores = G.scores.slice(0, 5);
      store.set('heliattack.scores', G.scores);
    }
    track('gameover-stage-' + (G.stage + 1), 'Game over at stage ' + (G.stage + 1));
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
      G.parts.push({ x, y, vx: rand(-140, 140) + G.spd * 0.3, vy: rand(-220, -40), life: rand(0.6, 1.2), max: 1.2, size: rand(1.5, 3.5), color, grav: 420, glow: false });
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
  function spark(x, y, color) { burst(x, y, 6, [color || '#ffe9a8'], 90, 0.25, 5, 0); }

  // ---------------------------------------------------------------- objects
  function makeObj(s) {
    const o = { type: s.type, x: s.x, y: s.y, alive: true, t: Math.random() * 10 };
    switch (s.type) {
      case 'fuel': o.w = 22; o.h = 26; break;
      case 'missile': o.w = 10; o.h = 30; o.state = 0; o.vy = 0; o.trigger = rand(70, 260); break;
      case 'tank': o.w = 28; o.h = 16; o.cool = rand(1.5, 3.5); o.aim = -Math.PI / 2; break;
      case 'radar': o.w = 24; o.h = 28; o.pts = [100, 200, 300][irand(0, 2)]; break;
      case 'core': o.w = 24; o.h = 24; o.hard = true; break;
      case 'gate': o.w = 8; o.top = s.top; o.h = s.y - s.top; o.hard = true; o.phase = 0; break;
    }
    if (s.props) Object.assign(o, s.props);
    if (o.type === 'gate') o.t = o.phase;
    return o;
  }
  const box = (o) => ({ l: o.x - o.w / 2, r: o.x + o.w / 2, t: o.y - o.h, b: o.y });
  const inBox = (bx, x, y, pad) => x > bx.l - pad && x < bx.r + pad && y > bx.t - pad && y < bx.b + pad;
  const gateOn = (o) => (o.t % 2.2) > 1.4;
  const gateWarn = (o) => (o.t % 2.2) > 1.0 && !gateOn(o);

  function maybeDrop(x, y, chance) {
    if (Math.random() > chance) return;
    const p = G.p;
    let kinds = ['S', 'S', 'B', 'B', 'H'];
    if (p && p.shield) kinds = kinds.filter((k) => k !== 'H');
    const iy = clamp(y, Math.max(ceilAt(x), TOP) + 25, floorAt(x) - 30);
    G.items.push({ x, y: iy, by: iy, kind: kinds[irand(0, kinds.length - 1)], t: 0 });
  }

  function destroyObj(o, viaBomb) {
    if (!o.alive || o.hard) return;
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
      case 'tank': addScore(100, cx, cy - 10); maybeDrop(cx, cy - 40, 0.1); break;
      case 'radar': addScore(o.pts, cx, cy - 10); maybeDrop(cx, cy - 50, 1); break;
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
  // Damage from enemies, shots and objects. The shield absorbs one hit; terrain always kills.
  function hurtPlayer() {
    const p = G.p;
    if (p.dead || p.invuln > 0) return false;
    if (p.shield) {
      p.shield = false; p.invuln = 1.2;
      Sound.shieldHit();
      burst(p.x, p.y, 24, ['#4dfff0', '#bffcff'], 180, 0.5, 8, 0);
      return false;
    }
    killPlayer();
    return true;
  }

  function enemyKilled(e) {
    e.dead = true;
    explosion(e.x, e.y, false);
    const pts = { ufo: 100, dart: 150, hmissile: 50 }[e.type] || 100;
    addScore(pts, e.x, e.y - 12);
    if (e.type === 'ufo') maybeDrop(e.x, e.y, 0.12);
    if (e.type === 'dart') maybeDrop(e.x, e.y, 0.2);
  }

  function spawnEnemy() {
    const x = G.camX + W + 40, cy = Math.max(ceilAt(x), TOP), fy = floorAt(x);
    if (fy - cy < 80) return;
    switch (G.stage) {
      case 1: case 3:
        G.enemies.push({ type: 'ufo', x, by: rand(cy + 30, fy - 30), y: 0, vx: -rand(30, 70), t: rand(0, TAU), amp: rand(12, 34), r: 12 });
        break;
      case 2:
        G.enemies.push({ type: 'meteor', x: x + 20, y: rand(TOP + 15, fy - 70), vx: -rand(160, 230) * Math.sqrt(G.enemy), vy: rand(15, 55), r: rand(7, 12), rot: rand(0, TAU), t: 0, warn: 0.7 });
        break;
      case 5:
        G.enemies.push({ type: 'dart', x, y: rand(cy + 20, fy - 20), vx: -rand(160, 210), r: 10, t: 0 });
        break;
    }
  }
  function spawnDelay() {
    switch (G.stage) {
      case 1: return rand(1.1, 2.0) / G.enemy;
      case 2: return rand(0.5, 1.0) / G.enemy;
      case 3: return rand(3.5, 6) / G.enemy;
      case 5: return rand(1.8, 3.0) / G.enemy;
      default: return 1;
    }
  }

  function runEvent(ev) {
    switch (ev.type) {
      case 'banner': showBanner(ev.title, ev.sub, 1.8); break;
      case 'swarm': {
        showBanner('UFO SQUADRON', 'INCOMING', 1.6);
        const x = G.camX + W + 40, cy = Math.max(ceilAt(x), TOP), fy = floorAt(x), mid = (cy + fy) / 2;
        for (let k = 0; k < 7; k++) {
          const off = k - 3;
          G.enemies.push({ type: 'ufo', x: x + Math.abs(off) * 34, by: clamp(mid + off * 16, cy + 20, fy - 20), y: 0, vx: -45, t: k * 0.3, amp: 6, r: 12 });
        }
        break;
      }
      case 'shower':
        showBanner('WARNING', 'METEOR SHOWER', 2);
        Sound.siren();
        G.showerT = 5.5; G.showerSpawn = 1.2;
        break;
      case 'warnBoss':
        showBanner('WARNING', 'GUNSHIP INBOUND', 2.4);
        Sound.siren();
        break;
      case 'boss': startBoss(); break;
    }
  }

  // ---------------------------------------------------------------- boss
  function startBoss() {
    const hp = Math.round(70 * (1 + 0.3 * G.loop));
    G.boss = { x: G.camX + W + 140, y: 200, hp, max: hp, t: 0, flash: 0, cool: 2.5, mcool: 4.5, dying: 0 };
    Music.play(7);
  }
  function bossHitTest(x, y, pad) {
    const b = G.boss;
    if (!b || b.dying) return false;
    const dx = (x - b.x) / (58 + pad), dy = (y - b.y) / (22 + pad);
    return dx * dx + dy * dy < 1;
  }
  function damageBoss(n, x, y) {
    const b = G.boss;
    b.hp -= n; b.flash = 0.08;
    spark(x, y, '#fff');
    Sound.bossHit();
    if (b.hp <= 0) {
      b.dying = 2.4;
      addScore(5000, b.x, b.y - 40, 'GUNSHIP +5000');
      track('boss-defeated', 'Boss defeated');
      G.shots = []; G.enemies = G.enemies.filter((e) => e.type !== 'hmissile');
    }
  }
  function updateBoss(dt) {
    const b = G.boss, p = G.p;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    if (b.dying) {
      b.dying -= dt;
      b.y += 30 * dt;
      if (Math.random() < dt * 14) explosion(b.x + rand(-50, 50), b.y + rand(-20, 20), Math.random() < 0.2);
      if (b.dying <= 0) {
        explosion(b.x, b.y, true);
        G.objs.push(makeObj({ type: 'core', x: b.x, y: b.y + 20 }));
        G.objs[G.objs.length - 1].floating = true;
        G.boss = null;
        showBanner('GUNSHIP DOWN', 'GRAB THE DATA CORE', 2.4);
        Music.play(6);
      }
      return;
    }
    const tx = G.camX + W - 150 + Math.sin(b.t * 0.7) * 40;
    b.x = lerp(b.x, tx, Math.min(1, dt * 1.5));
    b.y = 210 + Math.sin(b.t * 1.05) * 115;
    if (p.dead) return;
    const rage = b.hp < b.max / 2 ? 1.4 : 1;
    b.cool -= dt * rage;
    if (b.cool <= 0) {
      const base = Math.atan2(p.y - b.y, p.x - (b.x - 50));
      for (let k = -2; k <= 2; k++) {
        const a = base + k * 0.22;
        G.shots.push({ x: b.x - 50, y: b.y + 6, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, g: 0 });
      }
      Sound.shell();
      b.cool = 2.4 / Math.sqrt(G.fireRate);
    }
    b.mcool -= dt * rage;
    if (b.mcool <= 0) {
      G.enemies.push({ type: 'hmissile', x: b.x - 30, y: b.y + 18, vx: -100, vy: 40, r: 7, t: 0 });
      Sound.launch();
      b.mcool = 4.2 / Math.sqrt(G.fireRate);
    }
    if (!p.dead && bossHitTest(p.x, p.y, 10)) hurtPlayer();
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
    G.spd = G.boss ? 0 : G.scroll;
    G.camX += G.spd * dt;

    while (G.specIdx < w.specs.length && w.specs[G.specIdx].x < G.camX + W + 60) G.objs.push(makeObj(w.specs[G.specIdx++]));
    while (G.eventIdx < w.events.length && w.events[G.eventIdx].x < G.camX + W) runEvent(w.events[G.eventIdx++]);

    if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }

    updatePlayer(dt);
    updateBullets(dt);
    updateBombs(dt);
    updateObjects(dt);
    updateEnemies(dt);
    updateShots(dt);
    updateItems(dt);
    if (G.boss) updateBoss(dt);

    if (G.showerT > 0) {
      G.showerT -= dt; G.showerSpawn -= dt;
      if (G.showerSpawn <= 0) {
        G.showerSpawn = rand(0.14, 0.26) / G.enemy;
        G.enemies.push({ type: 'meteor', x: G.camX + rand(W * 0.35, W + 120), y: TOP - 10, vx: -rand(60, 120), vy: rand(130, 190), r: rand(6, 10), rot: 0, t: 0, warn: 0 });
      }
    }

    if (!p.dead) {
      const s = stageAt(p.x);
      if (s !== G.stage) { G.stage = s; G.checkpoint = w.starts[s]; G.spawnT = 2; showBanner('STAGE ' + (s + 1), STAGES[s].name); Sound.stage(); Music.play(s + 1); }
      if (p.x >= w.mids[s] && G.checkpoint < w.mids[s]) {
        G.checkpoint = w.mids[s];
        Sound.checkpoint();
        G.popups.push({ x: p.x, y: p.y - 26, text: 'CHECKPOINT', life: 1.6, color: '#7dff9a' });
      }
      const inside = p.x > w.starts[G.stage] + RAMP * CW + 100 && p.x < w.ends[G.stage] - RAMP * CW - 150 && Math.abs(p.x - w.mids[G.stage]) > 260;
      G.spawnT -= dt;
      if (inside && !G.boss && G.spawnT <= 0) { spawnEnemy(); G.spawnT = spawnDelay(); }
      if (p.x >= w.ends[STAGES.length - 1] + 120) finishMission();
    } else {
      G.deathT -= dt;
      if (G.deathT <= 0) {
        G.lives--;
        if (G.lives <= 0) gameOver();
        else respawn();
      }
    }
  }

  function finishMission() {
    if (G.coreHeld) {
      const bonus = 5000 * (G.loop + 1);
      addScore(bonus);
      track('mission-complete-' + (G.loop + 1), 'Mission ' + (G.loop + 1) + ' complete');
      G.loop++;
      applyDifficulty();
      G.world = buildWorld(G.loop);
      G.checkpoint = 0;
      respawn();
      showBanner('MISSION COMPLETE', 'BONUS ' + bonus, 3.2);
      Sound.mission();
    } else {
      respawn();
      showBanner('DATA CORE MISSED', 'GRAB IT THIS TIME', 3);
    }
  }

  function updatePlayer(dt) {
    const p = G.p;
    if (p.dead) return;
    const inp = readInput();
    p.invuln = Math.max(0, p.invuln - dt);
    p.spreadT = Math.max(0, p.spreadT - dt);
    p.tripleT = Math.max(0, p.tripleT - dt);
    if (p.fuel > 0) {
      if (!G.boss) p.fuel -= G.drain * dt;
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
    p.x += (G.spd + p.vx) * dt;
    p.y += p.vy * dt;
    let sx = p.x - G.camX;
    const maxX = G.boss ? W * 0.55 : W * 0.62;
    if (sx < 30) { sx = 30; p.vx = Math.max(0, p.vx); }
    if (sx > maxX) { sx = maxX; p.vx = Math.min(0, p.vx); }
    p.x = G.camX + sx;
    if (p.y < TOP + 14) { p.y = TOP + 14; p.vy = Math.max(0, p.vy); }
    if (p.y > H - 6) p.y = H - 6;
    p.tilt = lerp(p.tilt, p.vx * 0.0013 + p.vy * 0.0009, Math.min(1, dt * 8));
    p.rotor += dt * (p.fuel > 0 ? 42 : 12);

    p.fireCool -= dt;
    const spread = p.spreadT > 0;
    if (inp.fire && p.fireCool <= 0 && G.bullets.length < (spread ? 18 : 6)) {
      const c = Math.cos(p.tilt), s = Math.sin(p.tilt);
      for (const a of spread ? [-0.17, 0, 0.17] : [0]) {
        const ang = a + p.tilt * 0.5;
        G.bullets.push({ x: p.x + 22 * c - 4 * s, y: p.y + 22 * s + 4 * c, vx: G.spd + 560 * Math.cos(ang), vy: 560 * Math.sin(ang) });
      }
      p.fireCool = 0.13;
      Sound.shoot(G.autofire);
    }
    p.bombCool -= dt;
    const triple = p.tripleT > 0;
    if (inp.bomb && p.bombCool <= 0 && G.bombs.length < (triple ? 6 : 2)) {
      for (const dx of triple ? [-45, 0, 45] : [0]) {
        G.bombs.push({ x: p.x + 2, y: p.y + 12, vx: G.spd + p.vx * 0.5 + 40 + dx, vy: 50 + Math.max(0, p.vy) * 0.5 });
      }
      p.bombCool = 0.35;
      Sound.bomb();
    }

    // terrain collision
    const c = Math.cos(p.tilt), s = Math.sin(p.tilt);
    for (const [hx, hy] of HITPTS) {
      if (solidAt(p.x + hx * c - hy * s, p.y + hx * s + hy * c)) { killPlayer(); return; }
    }
    // object collision
    const pb = { l: p.x - 18, r: p.x + 16, t: p.y - 7, b: p.y + 9 };
    for (const o of G.objs) {
      if (!o.alive) continue;
      if (o.type === 'gate') {
        if (gateOn(o) && Math.abs(p.x - o.x) < 16 && p.y > o.top && p.y < o.y) {
          if (hurtPlayer()) return;
        }
        continue;
      }
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
      if (hurtPlayer()) return;
    }
  }

  function updateBullets(dt) {
    const camR = G.camX + W + 20;
    G.bullets = G.bullets.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x > camR || b.y < TOP || b.y > H) return false;
      if (solidAt(b.x, b.y)) { spark(b.x, b.y, STAGES[G.stage].edge); return false; }
      for (const o of G.objs) {
        if (o.alive && !o.hard && inBox(box(o), b.x, b.y, 3)) { destroyObj(o); return false; }
      }
      for (const e of G.enemies) {
        if (!e.dead && !(e.warn > 0) && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) {
          if (e.type === 'meteor') { spark(b.x, b.y, '#ffb347'); Sound.spark(); return false; }
          enemyKilled(e);
          return false;
        }
      }
      if (bossHitTest(b.x, b.y, 2)) { damageBoss(1, b.x, b.y); return false; }
      return true;
    });
  }

  function bombBlast(x, y) {
    explosion(x, y, false);
    for (const o of G.objs) {
      if (o.alive && !o.hard && inBox(box(o), x, y, 22)) destroyObj(o, true);
    }
    for (const e of G.enemies) {
      if (!e.dead && e.type !== 'meteor' && Math.hypot(e.x - x, e.y - y) < e.r + 22) enemyKilled(e);
    }
    if (bossHitTest(x, y, 14)) damageBoss(4, x, y);
  }

  function updateBombs(dt) {
    G.bombs = G.bombs.filter((b) => {
      b.vy += 380 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > H + 10) return false;
      if (Math.random() < 0.6) G.parts.push({ x: b.x - 3, y: b.y - 2, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 3, color: '#ff9d3b', grav: 0, glow: true });
      if (solidAt(b.x, b.y + 3)) { bombBlast(b.x, b.y); return false; }
      for (const o of G.objs) {
        if (o.alive && !o.hard && inBox(box(o), b.x, b.y, 2)) { bombBlast(b.x, b.y); return false; }
      }
      for (const e of G.enemies) {
        if (!e.dead && e.type !== 'meteor' && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) { bombBlast(b.x, b.y); return false; }
      }
      if (bossHitTest(b.x, b.y, 4)) { bombBlast(b.x, b.y); return false; }
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
          o.vy = Math.max(o.vy - 280 * dt * G.enemy, -230 * Math.sqrt(G.enemy));
          o.y += o.vy * dt;
          G.parts.push({ x: o.x + rand(-2, 2), y: o.y + 2, vx: rand(-20, 20), vy: rand(40, 90), life: 0.35, max: 0.35, size: rand(3, 6), color: Math.random() < 0.5 ? '#ffd27a' : '#ff6a2b', grav: 0, glow: true });
          const c = ceilAt(o.x);
          if (c > TOP + 0.5 && o.y - o.h < c) { o.alive = false; explosion(o.x, o.y - o.h, false); }
          else if (o.y < TOP - 10) o.alive = false;
        }
      } else if (o.type === 'tank') {
        const sx = o.x - G.camX;
        if (!p.dead) o.aim = Math.atan2(p.y - (o.y - 14), p.x + G.spd * 0.8 - o.x);
        if (sx > 40 && sx < W - 30 && !p.dead && Math.abs(o.x - p.x) < 420 && G.shots.length < 6) {
          o.cool -= dt;
          if (o.cool <= 0) {
            const t = 1.3, g = 150;
            const sx0 = o.x, sy0 = o.y - 16;
            const tx = p.x + G.spd * t, ty = p.y;
            const vx = clamp((tx - sx0) / t, -280, 280), vy = (ty - sy0) / t - 0.5 * g * t;
            G.shots.push({ x: sx0, y: sy0, vx, vy, g });
            o.cool = rand(2.6, 4.2) / G.fireRate;
            Sound.shell();
          }
        }
      } else if (o.type === 'gate') {
        if (gateWarn(o) && Math.floor(o.t * 20) % 4 === 0 && Math.abs(o.x - p.x) < 300) Sound.gate();
      } else if (o.type === 'core' && o.floating && !p.dead) {
        // drift toward the player after the boss drops it
        o.x += (p.x - o.x) * Math.min(1, dt * 1.2);
        o.y += (p.y + 12 - o.y) * Math.min(1, dt * 1.2);
      }
    }
    G.objs = G.objs.filter((o) => o.alive && o.x > G.camX - 60);
  }

  function updateEnemies(dt) {
    const p = G.p;
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (e.warn > 0) { e.warn -= dt; e.x = G.camX + W + 20; continue; }
      e.t += dt;
      if (e.type === 'ufo') {
        e.x += e.vx * dt;
        e.y = e.by + Math.sin(e.t * 3) * e.amp;
        e.y = clamp(e.y, Math.max(ceilAt(e.x), TOP) + 14, floorAt(e.x) - 14);
      } else if (e.type === 'meteor') {
        e.x += e.vx * dt; e.y += e.vy * dt; e.rot += dt * 4;
        if (Math.random() < 0.7) G.parts.push({ x: e.x + rand(-3, 3), y: e.y + rand(-3, 3), vx: rand(10, 40), vy: rand(-20, 0), life: 0.4, max: 0.4, size: e.r * 0.9, color: Math.random() < 0.5 ? '#ff7b2b' : '#ffcf5a', grav: 0, glow: true });
        if (e.y > TOP && solidAt(e.x, e.y + e.r * 0.5)) { e.dead = true; explosion(e.x, e.y, false); }
      } else if (e.type === 'dart') {
        e.x += e.vx * dt;
        if (!p.dead && e.x - p.x > 40) e.y += clamp(p.y - e.y, -1, 1) * 55 * dt;
        if (solidAt(e.x, e.y)) { e.dead = true; explosion(e.x, e.y, false); }
      } else if (e.type === 'hmissile') {
        if (e.t < 3 && !p.dead) {
          const want = Math.atan2(p.y - e.y, p.x - e.x), cur = Math.atan2(e.vy, e.vx);
          let d = want - cur;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          const a = cur + clamp(d, -2 * dt, 2 * dt);
          e.vx = Math.cos(a) * 150; e.vy = Math.sin(a) * 150;
        }
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (Math.random() < 0.6) G.parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 4, color: '#ff9d3b', grav: 0, glow: true });
        if (solidAt(e.x, e.y) || e.t > 6) { e.dead = true; explosion(e.x, e.y, false); }
      }
      if (!p.dead && Math.abs(e.x - p.x) < e.r + 13 && Math.abs(e.y - p.y) < e.r + 6 && p.invuln <= 0) {
        e.dead = true;
        explosion(e.x, e.y, false);
        hurtPlayer();
      }
    }
    G.enemies = G.enemies.filter((e) => !e.dead && e.x > G.camX - 60 && e.y < H + 40);
  }

  function updateShots(dt) {
    const p = G.p;
    G.shots = G.shots.filter((s) => {
      s.vy += s.g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < G.camX - 20 || s.x > G.camX + W + 20 || s.y > H || s.y < TOP - 40) return false;
      if (solidAt(s.x, s.y)) { spark(s.x, s.y, '#ff6060'); return false; }
      if (!p.dead && p.invuln <= 0 && Math.abs(s.x - p.x) < 15 && Math.abs(s.y - p.y) < 8) { hurtPlayer(); return false; }
      return true;
    });
  }

  function updateItems(dt) {
    const p = G.p;
    G.items = G.items.filter((it) => {
      it.t += dt;
      it.x -= 25 * dt;
      it.y = it.by + Math.sin(it.t * 3) * 8;
      if (it.x < G.camX - 30) return false;
      if (!p.dead && Math.abs(it.x - p.x) < 24 && Math.abs(it.y - p.y) < 18) {
        const pw = POWERS[it.kind];
        if (it.kind === 'S') p.spreadT = pw.time;
        else if (it.kind === 'B') p.tripleT = pw.time;
        else p.shield = true;
        Sound.power();
        G.popups.push({ x: it.x, y: it.y - 16, text: pw.name, life: 1.3, color: pw.color });
        addScore(250);
        return false;
      }
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
  function setDiff(d) { G.diff = (d + 3) % 3; store.set('heliattack.diff', G.diff); }
  function toggleAutofire() { G.autofire = !G.autofire; store.set('heliattack.autofire', G.autofire); }

  function handleEdges() {
    const pad = readPad();
    const pb = pad ? padButtons(pad) : {};
    const padEdge = (k) => pb[k] && !padPrev[k];
    const confirm = isPressed('Enter', 'NumpadEnter', 'Space') || padEdge('a') || padEdge('start');
    if (isPressed('KeyM')) Sound.toggleMute();
    if (isPressed('KeyF')) toggleAutofire();
    if (G.state === 'title') {
      if (isPressed('ArrowLeft', 'KeyA') || padEdge('left')) { setDiff(G.diff - 1); Sound.click(); }
      if (isPressed('ArrowRight', 'KeyD') || padEdge('right')) { setDiff(G.diff + 1); Sound.click(); }
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
  function drawSky() {
    const w = G.world, cx = G.camX + W / 2, s = stageAt(cx);
    const t = s > 0 ? clamp((cx - w.starts[s]) / 300, 0, 1) : 1;
    const skyOf = (i) => linGrad('sky' + i, 0, TOP, 0, H, [[0, STAGES[i].sky[0]], [1, STAGES[i].sky[1]]]);
    if (t < 1) {
      ctx.fillStyle = skyOf(s - 1);
      ctx.fillRect(0, TOP, W, H - TOP);
      ctx.globalAlpha = t;
    }
    ctx.fillStyle = skyOf(s);
    ctx.fillRect(0, TOP, W, H - TOP);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#fff';
    for (const st of STARS) {
      const x = (((st.x - G.camX * st.z * 0.3) % W) + W) % W;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(G.time * 2 + st.tw);
      ctx.fillRect(x, st.y, st.z * 4, st.z * 4);
    }
    ctx.globalAlpha = 1;

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
  function strokeEdge(pts, color, inner) {
    if (inner) {
      ctx.save();
      ctx.translate(0, inner);
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); tracePts(pts);
      ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 10; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); tracePts(pts);
    ctx.strokeStyle = color; ctx.globalAlpha = 0.22; ctx.lineWidth = 7; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.stroke();
  }

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
    const fp = edgePts(w.floor, a, b);
    ctx.beginPath();
    ctx.moveTo(fp[0], H);
    tracePts(fp);
    ctx.lineTo(fp[fp.length - 2], H);
    ctx.closePath();
    ctx.fillStyle = linGrad('fill' + s, 0, 230, 0, H, [[0, theme.fill[0]], [1, theme.fill[1]]]);
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
    strokeEdge(fp, theme.edge, 14);

    let hasCeil = false;
    for (let i = a; i <= b; i++) if (w.ceil[i] > TOP + 0.5) { hasCeil = true; break; }
    if (!hasCeil) return;
    const cp = edgePts(w.ceil, a, b);
    ctx.beginPath();
    ctx.moveTo(cp[0], TOP - 2);
    tracePts(cp);
    ctx.lineTo(cp[cp.length - 2], TOP - 2);
    ctx.closePath();
    // ceilings are darker than the floor so they never read as sky
    ctx.fillStyle = linGrad('ceil' + s, 0, TOP, 0, 240, [[0, '#000'], [0.5, theme.fill[1]], [1, theme.fill[0]]]);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    for (let i = a; i < b; i++) {
      if (w.ceil[i] <= TOP + 0.5) continue;
      if (hash(i, 99) < 0.25) ctx.fillRect(i * CW - G.camX + 2, TOP + hash(i, 5) * (w.ceil[i] - TOP - 12), 3, 3);
    }
    ctx.restore();
    strokeEdge(cp, theme.edge, -14);
  }

  function drawBeacons() {
    const w = G.world;
    for (let s = 0; s < STAGES.length; s++) {
      const x = w.mids[s] - G.camX, y = 400;
      if (x < -30 || x > W + 30) continue;
      const done = G.checkpoint >= w.mids[s];
      ctx.fillStyle = '#9aa4b8'; ctx.fillRect(x - 1.5, y - 46, 3, 46);
      ctx.fillStyle = done ? '#4dff88' : '#ffd34a';
      ctx.beginPath(); ctx.moveTo(x + 1.5, y - 46); ctx.lineTo(x + 22, y - 40); ctx.lineTo(x + 1.5, y - 34); ctx.fill();
      additive(() => drawGlow(done ? 'rgba(80,255,140,.8)' : 'rgba(255,210,70,.8)', x, y - 48, 10 + 3 * Math.sin(G.time * 5)));
    }
  }

  function drawObj(o) {
    const x = o.x - G.camX, y = o.y;
    if (x < -40 || x > W + 40) return;
    ctx.save();
    ctx.translate(x, y);
    switch (o.type) {
      case 'fuel': {
        additive(() => drawGlow('rgba(255,70,110,.5)', 0, -13, 22, 0.45 + 0.2 * Math.sin(o.t * 5)));
        ctx.fillStyle = linGrad('fuel', -11, 0, 11, 0, [[0, '#9b1230'], [0.45, '#ff5d7c'], [1, '#8a0f28']]);
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-11, -26, 22, 26, 4) : ctx.rect(-11, -26, 22, 26); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-11, -18, 22, 9);
        text('FUEL', 0, -13, 5, '#c0143a', 'center');
        ctx.fillStyle = '#ddd'; ctx.fillRect(-4, -29, 8, 3);
        break;
      }
      case 'missile': {
        if (o.state) additive(() => drawGlow('rgba(255,140,40,.8)', 0, 4, 16 + Math.random() * 6));
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
        if (Math.sin(o.t * 6) > 0) additive(() => drawGlow('rgba(255,60,60,.9)', 0, -30, 7));
        break;
      }
      case 'core': {
        const pul = 0.6 + 0.4 * Math.sin(o.t * 5);
        if (!o.floating) { ctx.fillStyle = '#3a4250'; ctx.fillRect(-14, -4, 28, 4); }
        additive(() => drawGlow('rgba(80,255,240,.8)', 0, -14, 30 * pul + 10));
        ctx.fillStyle = '#bffcff';
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + o.t; ctx.lineTo(Math.cos(a) * 9, -14 + Math.sin(a) * 9); }
        ctx.fill();
        text('CORE', 0, -36 - 3 * Math.sin(o.t * 4), 8, '#7ffff2', 'center');
        break;
      }
      case 'gate': {
        const h = o.y - o.top, on = gateOn(o), warn = gateWarn(o);
        ctx.fillStyle = '#39424f';
        ctx.fillRect(-7, -10, 14, 10); ctx.fillRect(-7, -h, 14, 10);
        ctx.fillStyle = on ? '#ff3b6a' : warn ? '#ffd34a' : '#4b5566';
        ctx.fillRect(-4, -12, 8, 3); ctx.fillRect(-4, -h + 9, 8, 3);
        if (on) {
          additive(() => {
            ctx.globalAlpha = 0.35; ctx.fillStyle = '#ff3b6a'; ctx.fillRect(-6, -h + 10, 12, h - 20);
            ctx.globalAlpha = 1; ctx.fillStyle = '#ffd0dc'; ctx.fillRect(-1.5, -h + 10, 3, h - 20);
          });
        } else if (warn && Math.floor(o.t * 20) % 2) {
          ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffd34a'; ctx.fillRect(-0.5, -h + 10, 1, h - 20); ctx.globalAlpha = 1;
        }
        break;
      }
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    if (e.warn > 0) {
      if (Math.floor(e.warn * 10) % 2) text('!', W - 14, e.y, 16, '#ff4050', 'center');
      return;
    }
    const x = e.x - G.camX, y = e.y;
    ctx.save();
    ctx.translate(x, y);
    if (e.type === 'ufo') {
      additive(() => drawGlow('rgba(150,120,255,.6)', 0, 0, 26, 0.6));
      ctx.fillStyle = '#9ff6ff';
      ctx.beginPath(); ctx.ellipse(0, -3, 6, 5, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = linGrad('ufo', 0, -3, 0, 5, [[0, '#d6dcff'], [1, '#5a5f9a']]);
      ctx.beginPath(); ctx.ellipse(0, 1, 15, 5, 0, 0, TAU); ctx.fill();
      for (let k = 0; k < 4; k++) {
        const lx = -10 + k * 6.6, on = Math.floor(e.t * 8 + k) % 4 === 0;
        ctx.fillStyle = on ? '#ffef6a' : '#5a4f7a';
        ctx.fillRect(lx - 1, 0, 2.5, 2.5);
      }
    } else if (e.type === 'meteor') {
      additive(() => drawGlow('rgba(255,120,40,.8)', 0, 0, e.r * 2.6));
      ctx.rotate(e.rot);
      ctx.fillStyle = '#5c4033';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8, rr = e.r * (0.8 + 0.2 * hash(k, e.r * 10)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.fill();
      ctx.fillStyle = '#3b2820';
      ctx.beginPath(); ctx.arc(e.r * 0.3, -e.r * 0.2, e.r * 0.25, 0, TAU); ctx.fill();
    } else if (e.type === 'dart') {
      additive(() => drawGlow('rgba(255,90,60,.8)', 12, 0, 10 + Math.random() * 4));
      ctx.fillStyle = '#ff4757';
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, -7); ctx.lineTo(6, 0); ctx.lineTo(10, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd1d6'; ctx.fillRect(-4, -1.5, 8, 3);
    } else if (e.type === 'hmissile') {
      ctx.rotate(Math.atan2(e.vy, e.vx));
      additive(() => drawGlow('rgba(255,120,40,.9)', -9, 0, 9));
      ctx.fillStyle = '#e8e2d0'; ctx.fillRect(-8, -2.5, 14, 5);
      ctx.fillStyle = '#ff3b4a'; ctx.beginPath(); ctx.moveTo(6, -2.5); ctx.lineTo(11, 0); ctx.lineTo(6, 2.5); ctx.fill();
    }
    ctx.restore();
  }

  function drawItem(it) {
    const x = it.x - G.camX, pw = POWERS[it.kind];
    additive(() => drawGlow(pw.color, x, it.y, 22 + 4 * Math.sin(it.t * 6), 0.7));
    ctx.fillStyle = 'rgba(10,14,30,.85)';
    ctx.strokeStyle = pw.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, it.y, 11, 0, TAU); ctx.fill(); ctx.stroke();
    text(it.kind, x + 1, it.y + 1, 10, pw.color, 'center');
  }

  function drawBoss() {
    const b = G.boss;
    if (!b) return;
    const x = b.x - G.camX, y = b.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(b.t * 1.05) * 0.05 + (b.dying ? 0.25 : 0));
    // rotors
    const rc = Math.cos(b.t * 30);
    ctx.fillStyle = 'rgba(200,220,255,.15)';
    ctx.beginPath(); ctx.ellipse(-30, -30, 40, 3, 0, 0, TAU); ctx.ellipse(30, -30, 40, 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(230,240,255,.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-30 - 40 * rc, -30); ctx.lineTo(-30 + 40 * rc, -30); ctx.moveTo(30 + 40 * rc, -30); ctx.lineTo(30 - 40 * rc, -30); ctx.stroke();
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(-32, -29, 4, 8); ctx.fillRect(28, -29, 4, 8);
    // hull
    ctx.fillStyle = linGrad('boss', 0, -22, 0, 24, [[0, '#b8bccb'], [0.45, '#6b2230'], [1, '#2a0d14']]);
    ctx.beginPath(); ctx.ellipse(0, 0, 62, 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2d36'; ctx.fillRect(40, -6, 34, 10);
    ctx.fillStyle = '#ffd34a'; ctx.fillRect(66, -12, 8, 22);
    // cockpit (faces left)
    ctx.fillStyle = 'rgba(255,90,90,.9)';
    ctx.beginPath(); ctx.ellipse(-44, -4, 12, 8, 0.2, 0, TAU); ctx.fill();
    // gun pods
    ctx.fillStyle = '#20232b'; ctx.fillRect(-64, 6, 22, 6); ctx.fillRect(-40, 16, 26, 6);
    // weak point
    additive(() => drawGlow('rgba(255,80,60,.9)', 6, 4, 14 + 4 * Math.sin(b.t * 8)));
    if (b.flash > 0) { ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, 62, 22, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
  }

  function drawHeli(x, y, tilt, rotor, sc, carry, shield) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(sc, sc);
    if (carry) {
      ctx.strokeStyle = 'rgba(200,255,250,.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 24); ctx.stroke();
      additive(() => drawGlow('rgba(80,255,240,.8)', 0, 28, 14));
      ctx.fillStyle = '#bffcff'; ctx.fillRect(-4, 24, 8, 8);
    }
    ctx.fillStyle = '#1e6fa8';
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-27, -3); ctx.lineTo(-27, 0); ctx.lineTo(-8, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2b8fd6';
    ctx.beginPath(); ctx.moveTo(-22, -3); ctx.lineTo(-28, -11); ctx.lineTo(-31, -11); ctx.lineTo(-28, 0); ctx.closePath(); ctx.fill();
    const tr = Math.sin(rotor * 1.7) * 6;
    ctx.strokeStyle = 'rgba(220,240,255,.75)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-28, -5 - tr); ctx.lineTo(-28, -5 + tr); ctx.stroke();
    ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-10, 11); ctx.lineTo(14, 11); ctx.quadraticCurveTo(18, 11, 19, 8);
    ctx.moveTo(-4, 6); ctx.lineTo(-5, 11); ctx.moveTo(8, 6); ctx.lineTo(9, 11);
    ctx.stroke();
    ctx.fillStyle = linGrad('heli', 0, -9, 0, 9, [[0, '#8fe6ff'], [0.5, '#2a9be0'], [1, '#123f66']]);
    ctx.beginPath(); ctx.ellipse(2, 0, 14, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(205,250,255,.9)';
    ctx.beginPath(); ctx.ellipse(9, -2, 6, 4.5, -0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(8, -5, 3, 1.5);
    ctx.fillStyle = '#c8ccd8'; ctx.fillRect(12, 4, 9, 2);
    ctx.fillStyle = '#ffd34a'; ctx.fillRect(-6, -1, 6, 2);
    ctx.fillStyle = '#456'; ctx.fillRect(0, -11, 3, 4);
    ctx.fillStyle = 'rgba(200,230,255,.18)';
    ctx.beginPath(); ctx.ellipse(1.5, -12, 25, 2.2, 0, 0, TAU); ctx.fill();
    const c = Math.cos(rotor);
    ctx.strokeStyle = 'rgba(235,245,255,.9)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(1.5 - 25 * c, -12); ctx.lineTo(1.5 + 25 * c, -12); ctx.stroke();
    if (Math.sin(G.time * 8) > 0.3) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(-30, -12, 2.5, 2.5); }
    if (shield) {
      ctx.strokeStyle = 'rgba(77,255,240,' + (0.55 + 0.25 * Math.sin(G.time * 6)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(-4, -1, 36, 22, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(77,255,240,.08)'; ctx.fill();
    }
    ctx.restore();
  }

  function drawWorld() {
    drawSky();
    drawTerrain();
    drawBeacons();
    for (const o of G.objs) if (o.alive) drawObj(o);
    for (const e of G.enemies) drawEnemy(e);
    drawBoss();
    for (const it of G.items) drawItem(it);

    additive(() => {
      for (const s of G.shots) drawGlow('rgba(255,60,60,.9)', s.x - G.camX, s.y, 9);
      for (const b of G.bullets) {
        const x = b.x - G.camX;
        ctx.strokeStyle = '#fff5b0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 12, b.y - b.vy * 0.02); ctx.lineTo(x, b.y); ctx.stroke();
        drawGlow('rgba(255,230,90,.8)', x, b.y, 7);
      }
    });
    for (const b of G.bombs) {
      const x = b.x - G.camX;
      ctx.save(); ctx.translate(x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx - G.spd + 1));
      ctx.fillStyle = '#2c3340'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.fillRect(-7, -2, 2, 4);
      ctx.restore();
    }

    const p = G.p;
    if (p && !p.dead && G.state !== 'title' && !(p.invuln > 0 && Math.floor(G.time * 12) % 2)) {
      drawHeli(p.x - G.camX, p.y, p.tilt, p.rotor, 1, G.coreHeld, p.shield);
    }
    if (G.state === 'title') drawHeli(160, 200 + Math.sin(G.time * 2) * 18, Math.sin(G.time * 2 + 1) * 0.06, G.time * 42, 1.6, false, false);

    for (const q of G.parts) {
      const x = q.x - G.camX, a = clamp(q.life / q.max, 0, 1);
      if (q.glow) {
        additive(() => drawGlow(q.color, x, q.y, q.size * (0.6 + a), a));
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
      text(u.text, u.x - G.camX, u.y, 10, u.color, 'center');
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    ctx.fillStyle = linGrad('hud', 0, 0, 0, TOP, [[0, '#0d1024'], [1, '#05060f']]);
    ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = 'rgba(120,160,255,.35)';
    ctx.fillRect(0, TOP - 1, W, 1);

    text('SCORE', 10, 11, 8, '#7fa2ff');
    text(String(G.score).padStart(6, '0'), 10, 28, 13, '#fff');
    text('HI', 112, 11, 8, '#ff8fb0');
    text(String(hiScore()).padStart(6, '0'), 112, 28, 13, '#fff');

    const lives = G.state === 'title' ? 0 : Math.max(0, G.lives - (G.p && G.p.dead ? 1 : 0));
    for (let i = 0; i < Math.min(lives, 5); i++) drawHeli(230 + i * 26, 24, 0, 0, 0.5, false, false);
    if (lives > 5) text('+' + (lives - 5), 356, 24, 8, '#fff');

    if (G.state === 'playing') {
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillRect(PAUSE_BTN.x + 18, 12, 5, 17); ctx.fillRect(PAUSE_BTN.x + 28, 12, 5, 17);
    }

    const sx = 432, sw = 36;
    STAGES.forEach((st, i) => {
      const cur = G.state !== 'title' && i === G.stage, done = G.state !== 'title' && i < G.stage;
      ctx.fillStyle = cur ? st.edge : done ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.1)';
      ctx.fillRect(sx + i * (sw + 3), 22, sw, 10);
      if (cur && G.p) {
        const w = G.world, t = clamp((G.p.x - w.starts[i]) / (w.ends[i] - w.starts[i]), 0, 1);
        const m = (w.mids[i] - w.starts[i]) / (w.ends[i] - w.starts[i]);
        ctx.fillStyle = G.checkpoint >= w.mids[i] ? '#2fbf62' : 'rgba(0,0,0,.5)';
        ctx.fillRect(sx + i * (sw + 3) + m * sw - 1, 22, 2, 10);
        ctx.fillStyle = '#fff'; ctx.fillRect(sx + i * (sw + 3) + t * (sw - 3), 20, 3, 14);
      }
    });
    text(G.state === 'title' ? 'MISSION' : (G.stage + 1) + '-' + STAGES[G.stage].name, sx, 11, 8, '#cfd3ea', 'left');

    const fx = 676, fw = 114;
    const fuel = G.p && G.state !== 'title' ? G.p.fuel : 100;
    const low = fuel < 25;
    text('FUEL', fx, 11, 8, low && Math.floor(G.time * 4) % 2 ? '#ff4050' : '#9fffb8');
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(fx, 21, fw, 12);
    ctx.fillStyle = linGrad('fuelbar', fx, 0, fx + fw, 0, [[0, '#ff3b4a'], [0.3, '#ffd34a'], [1, '#4dff88']]);
    ctx.fillRect(fx, 21, fw * fuel / 100, 12);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(fx + 0.5, 21.5, fw - 1, 11);

    // active power-ups, just below the HUD
    if (G.state === 'playing' && G.p && !G.p.dead) {
      const p = G.p, list = [];
      if (p.spreadT > 0) list.push(['S', Math.ceil(p.spreadT)]);
      if (p.tripleT > 0) list.push(['B', Math.ceil(p.tripleT)]);
      if (p.shield) list.push(['H', '']);
      list.forEach(([k, t], i) => {
        const x = 12 + i * 70, pw = POWERS[k];
        ctx.fillStyle = 'rgba(5,8,20,.6)'; ctx.fillRect(x - 4, TOP + 6, 64, 18);
        text(k + ' ' + t, x, TOP + 16, 9, pw.color);
      });
    }
    // boss health
    if (G.boss && !G.boss.dying) {
      const b = G.boss, bw = 300, bx = (W - bw) / 2;
      text('GUNSHIP', W / 2, TOP + 12, 8, '#ff8fa0', 'center');
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(bx, TOP + 20, bw, 7);
      ctx.fillStyle = '#ff3b4a'; ctx.fillRect(bx, TOP + 20, bw * b.hp / b.max, 7);
    }
  }

  function uiButton(x, y, w, h, label, action, opts) {
    const o = opts || {};
    ctx.fillStyle = o.fill || 'rgba(20,30,70,.8)';
    ctx.strokeStyle = o.stroke || '#6d8dff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    text(label, x + w / 2, y + h / 2 + 1, o.size || 11, o.color || '#fff', 'center');
    G.ui.push({ x, y, w, h, action });
  }
  function settingsButtons(x, y, w) {
    uiButton(x, y, w, 30, 'AUTO-FIRE: ' + (G.autofire ? 'ON' : 'OFF'), toggleAutofire, { size: 9 });
    const half = (w - 8) / 2;
    uiButton(x, y + 38, half, 30, 'MUSIC ' + LEVELS[Sound.musicLevel], () => { Sound.cycleMusic(); }, { size: 8 });
    uiButton(x + half + 8, y + 38, half, 30, 'SFX ' + LEVELS[Sound.sfxLevel], () => { Sound.cycleSfx(); }, { size: 8 });
  }

  function drawTitle() {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, TOP, W, H - TOP);
    ctx.save();
    ctx.shadowColor = '#ff7a2b'; ctx.shadowBlur = 24;
    ctx.font = '46px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = linGrad('logo', 0, 80, 0, 130, [[0, '#fff3a0'], [0.5, '#ffb52b'], [1, '#ff4f2b']]);
    ctx.fillText('HELI ATTACK', W / 2 + 60, 96);
    ctx.restore();
    text('FLY . BOMB . REFUEL . GRAB THE CORE', W / 2 + 60, 134, 9, '#9fd8ff', 'center');

    const bx = 370, bw = 220;
    uiButton(bx, 158, bw, 42, 'START', startGame, { fill: 'rgba(255,120,40,.85)', stroke: '#ffd34a', size: 15 });
    uiButton(bx, 208, bw, 30, '< ' + DIFFS[G.diff].name + ' >', () => setDiff(G.diff + 1), { size: 10 });
    settingsButtons(bx, 246, bw);
    if (Sound.muted) text('MUTED (PRESS M)', bx + bw / 2, 324, 8, '#ff8fa0', 'center');

    text('TOP SCORES', 690, 170, 9, '#ff8fb0', 'center');
    for (let i = 0; i < 5; i++) {
      const s = G.scores[i];
      text((i + 1) + '. ' + (s != null ? String(s).padStart(6, '0') : '------'), 690, 194 + i * 20, 9, i === 0 ? '#ffd34a' : '#dde', 'center');
    }
    if (installPrompt && !isStandalone()) {
      uiButton(615, 300, 150, 30, 'INSTALL APP', () => { installPrompt.prompt(); installPrompt = null; }, { size: 8, stroke: '#4dff88' });
    }

    const help = G.usingTouch
      ? [G.autofire ? 'LEFT THUMB: FLY   RIGHT THUMB: BOMB' : 'LEFT: FLY   RIGHT: HOLD FIRE   BUTTON: BOMB']
      : ['ARROWS/WASD FLY  SPACE/Z FIRE  X BOMB', 'P PAUSE  M MUTE  F AUTO-FIRE  GAMEPAD OK'];
    help.forEach((h, i) => text(h, W / 2, 352 + i * 18, 9, '#cfd6ff', 'center'));
    if (Math.floor(G.time * 2) % 2 === 0) text(G.usingTouch ? 'TAP START' : 'PRESS ENTER', W / 2, 400, 11, '#fff', 'center');
    const tip = isIOS && !isStandalone() ? 'FULL SCREEN: SHARE > ADD TO HOME SCREEN' : 'SHOOT FUEL TANKS TO REFUEL';
    text(tip, W / 2, 430, 8, '#ff8fa0', 'center');
  }

  function drawBanner() {
    const b = G.banner;
    if (!b) return;
    const a = Math.min(1, b.t * 4, (b.dur - b.t) * 3);
    const col = b.title === 'WARNING' ? '#ff4050' : STAGES[G.stage].edge;
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 150, W, 72);
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    text(b.title, W / 2, 175, 22, b.title === 'WARNING' && Math.floor(b.t * 6) % 2 ? col : '#fff', 'center');
    ctx.restore();
    text(b.sub, W / 2, 205, 12, col, 'center');
    ctx.globalAlpha = 1;
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(0,0,10,.65)';
    ctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, 110, 26, '#fff', 'center');
    const x = W / 2 - 120, w = 240;
    uiButton(x, 150, w, 44, 'RESUME', resume, { fill: 'rgba(255,120,40,.85)', stroke: '#ffd34a', size: 13 });
    settingsButtons(x, 204, w);
    uiButton(x, 290, w, 32, 'QUIT', toTitle, { size: 10 });
    if (!G.usingTouch) text('P RESUME   M MUTE   F AUTO-FIRE   Q QUIT', W / 2, 350, 9, '#aab', 'center');
  }

  function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, TOP, W, H - TOP);
    ctx.save();
    ctx.shadowColor = '#ff3b4a'; ctx.shadowBlur = 20;
    text('GAME OVER', W / 2, 160, 30, '#ff5a6a', 'center');
    ctx.restore();
    text('SCORE ' + G.score, W / 2, 215, 15, '#fff', 'center');
    if (G.newHi && Math.floor(G.time * 3) % 2 === 0) text('NEW HIGH SCORE!', W / 2, 250, 13, '#ffd34a', 'center');
    if (G.goT > 1.2) uiButton(W / 2 - 100, 290, 200, 42, 'CONTINUE', toTitle, { size: 12 });
  }

  function drawTouchControls() {
    if (!G.usingTouch || G.state !== 'playing' || G.paused) return;
    const st = touch.stick;
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
    if (st) {
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(st.ox, st.oy, 40, 0, TAU); ctx.stroke();
      let dx = st.x - st.ox, dy = st.y - st.oy;
      const l = Math.hypot(dx, dy);
      if (l > 40) { dx *= 40 / l; dy *= 40 / l; }
      ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(st.ox + dx, st.oy + dy, 15, 0, TAU); ctx.fill();
    } else if (G.time % 6 < 3 || G.p.invuln > 0) {
      ctx.globalAlpha = 0.15;
      ctx.beginPath(); ctx.arc(80, H - 80, 40, 0, TAU); ctx.stroke();
    }
    if (G.autofire) {
      ctx.globalAlpha = touch.bombId != null ? 0.3 : 0.12;
      ctx.beginPath(); ctx.arc(BOMB_BTN.x, BOMB_BTN.y, BOMB_BTN.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = touch.bombId != null ? 0.6 : 0.3;
      text('TAP=BOMB', BOMB_BTN.x, BOMB_BTN.y, 7, '#fff', 'center');
    } else {
      ctx.globalAlpha = touch.bombId != null ? 0.45 : 0.18;
      ctx.beginPath(); ctx.arc(BOMB_BTN.x, BOMB_BTN.y, BOMB_BTN.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.5;
      text('BOMB', BOMB_BTN.x, BOMB_BTN.y, 8, '#fff', 'center');
    }
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
      ctx.font = '13px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd34a';
      ctx.fillText('ROTATE YOUR PHONE', window.innerWidth / 2, y);
      ctx.font = '10px ' + FONT; ctx.fillStyle = '#aab';
      ctx.fillText('LANDSCAPE PLAYS BEST', window.innerWidth / 2, y + 22);
    }
  }

  // ---------------------------------------------------------------- main loop
  let last = performance.now(), acc = 0, musicStarted = false;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    handleEdges();
    if (!musicStarted && Sound.ac && G.state === 'title') { musicStarted = true; Music.play(0); }
    let n = 0;
    while (acc >= STEP && n < 5) { update(STEP); acc -= STEP; n++; }
    if (n === 5) acc = 0;
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // test hook
  window.__heli = G;
})();
