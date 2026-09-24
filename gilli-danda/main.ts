// Gilli Danda — a 90s maidan game, seen side-on.
// Tap once to flick the gilli up off the pit, tap again to smack it with the
// danda. Distance is counted in dandas. A fielder catching it means you're out;
// three missed swings and you're out too.

import { CONFETTI, Particles, Sfx, Shake, clamp01, easeOutQuad, lerp, loadNumber, rand, saveNumber } from '../shared/fx';

type Phase = 'ready' | 'flick' | 'popped' | 'flying' | 'measure' | 'return' | 'out';

type Fielder = {
  x: number;
  jump: number;
  vy: number;
  target: number;
  home: number;
  run: number; // run-cycle phase
  speed: number;
  react: number;
  state: 'idle' | 'run' | 'catch' | 'dropped' | 'cheer';
  stateT: number;
  shirt: string;
};

// World units are metres; y is up, x=0 is the batter.
const G = 9.8;
const PIT_X = 0.45; // where the gilli rests
const BATTER_X = -0.2;
const DANDA_LEN = 0.8;
const ZONE_H = 0.95; // height of the danda at contact
const REACH = 0.5; // how far above/below ZONE_H still connects
const DANDA_M = 0.8; // one danda length, for scoring
const CATCH_H = 2.35;
const CATCH_R = 0.75;
const DROP_CHANCE = 0.25;
const POP_SLOWMO = 0.55; // bullet time while the gilli is in the air near you
const FLICK_TIME = 0.16;
const SWING_TIME = 0.34;
const SWING_CONTACT = 0.07;
const MAP_RANGE = 200; // dandas shown on the mini-map
const BEST_KEY = 'gillidanda.best';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const scoreEl = document.getElementById('score')!;
const bestEl = document.getElementById('best')!;
const messageEl = document.getElementById('message')!;

const fx = new Particles();
const shake = new Shake();
const sfx = new Sfx();

// ---------- state ----------

let phase: Phase = 'ready';
let phaseT = 0;
let clock = 0;
let score = 0;
let best = loadNumber(BEST_KEY);
let hits = 0;
let strikes = 0;
let lastDist = 0;
let newBest = false;
let outAt = 0;
let msgUntil = 0;
let hitstop = 0;
let slowmo = 0; // seconds of dramatic slow motion left

const gilli = { x: PIT_X, y: 0.1, vx: 0, vy: 0, rot: -0.25, vr: 0, grounded: true, bounces: 0 };
let trail: { x: number; y: number }[] = [];
let swingT = -1; // time since the swing started, -1 if not swinging
let swingHit = false;
let flickQuality = 0;
let fielders: Fielder[] = [];
let catcher = -1;
let hitLabel = '';

// Camera.
let camX = 0;
let zoom = 1;
let returnFrom = 0;

// Layout.
let W = 0;
let H = 0;
let S = 60; // px per metre at zoom 1
let GROUND = 0;

// ---------- layout ----------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S = Math.min(W / 11, H / 7.5);
  GROUND = H * 0.8;
}

const K = () => S * zoom;
const X = (x: number) => W * 0.3 + (x - camX) * K();
const Y = (y: number) => GROUND - y * K();

// Deterministic pseudo-random for the scenery, so it doesn't flicker.
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- difficulty ----------

const level = () => Math.floor(hits / 3);
const fielderCount = () => Math.min(5, 2 + level());

function placeFielders() {
  const n = fielderCount();
  const shirts = ['#ff3fa4', '#ff8c2b', '#8b5cf6', '#e63946', '#19d3c5'];
  const spots: number[] = [];
  let tries = 0;
  while (spots.length < n && tries++ < 200) {
    const x = rand(24, 36 + 22 * n);
    if (spots.every((s) => Math.abs(s - x) > 11)) spots.push(x);
  }
  spots.sort((a, b) => a - b);
  fielders = spots.map((home, i) => {
    const prev = fielders[i];
    return {
      x: prev ? prev.x : home + 30,
      jump: 0,
      vy: 0,
      target: home,
      home,
      run: 0,
      speed: 4.0 + 0.2 * level() + rand(-0.3, 0.3),
      react: 0,
      state: 'idle',
      stateT: 0,
      shirt: shirts[i % shirts.length],
    };
  });
}

// ---------- flow ----------

function setMessage(html: string, seconds = 0) {
  messageEl.innerHTML = html;
  msgUntil = seconds ? clock + seconds : 0;
}

function bump(el: HTMLElement) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function newGame() {
  score = 0;
  hits = 0;
  strikes = 0;
  lastDist = 0;
  newBest = false;
  catcher = -1;
  fielders = [];
  placeFielders();
  for (const f of fielders) f.x = f.home;
  resetGilli();
  phase = 'ready';
  phaseT = 0;
  camX = 0;
  zoom = 1;
}

function resetGilli() {
  Object.assign(gilli, { x: PIT_X, y: 0.1, vx: 0, vy: 0, rot: -0.25, vr: 0, grounded: true, bounces: 0 });
  trail = [];
  swingT = -1;
  swingHit = false;
}

// Ring around the raised tip: smallest = best flick.
const flickRing = () => Math.abs(Math.sin(clock * 3.2));

function tap() {
  sfx.ensure();
  if (phase === 'out') {
    if (performance.now() - outAt > 800) {
      newGame();
      setMessage('');
    }
    return;
  }
  if (phase === 'ready') {
    flickQuality = 1 - flickRing();
    phase = 'flick';
    phaseT = 0;
    setMessage('');
    return;
  }
  if (phase === 'popped' && swingT < 0) {
    swingT = 0;
    sfx.noise(0.12, 0.25, 2500);
  }
}

function popGilli() {
  const vy = 5.6 + 2.6 * flickQuality;
  Object.assign(gilli, { vx: 0.25, vy, vr: rand(10, 16) * (Math.random() < 0.5 ? -1 : 1), grounded: false, y: 0.12 });
  phase = 'popped';
  phaseT = 0;
  sfx.tone(700, 0.05, 0.12, 'square', 400);
  fx.burst(X(PIT_X), Y(0.05), { count: 6, speed: [40, 120], size: [2, 3], life: [0.2, 0.4], colors: ['#d8b48a', '#fff1d0'], angle: [Math.PI, Math.PI * 2], drag: 4 });
  if (flickQuality > 0.8) fx.burst(X(PIT_X), Y(0.2), { count: 8, speed: [60, 140], size: [2, 3], life: [0.2, 0.35], colors: ['#6bff6b', '#fff7d6'], shape: 'square' });
}

function tryContact() {
  const off = (gilli.y - ZONE_H) / REACH;
  if (Math.abs(off) > 1 || gilli.x > BATTER_X + 0.25 + DANDA_LEN + 0.15) return;
  // Hitting under the gilli lofts it; hitting over it drives it into the ground.
  const perfect = Math.abs(off) < 0.12;
  const q = perfect ? 1 : 1 - Math.pow(Math.abs(off), 1.4);
  const speed = 15 + 23 * q;
  const angle = ((perfect ? 24 : 24 + off * 30) * Math.PI) / 180;
  gilli.vx = Math.cos(angle) * speed;
  gilli.vy = Math.sin(angle) * speed;
  gilli.vr = 25 + speed;
  swingHit = true;
  phase = 'flying';
  phaseT = 0;
  hitLabel = perfect ? 'DHAMAKA!' : q > 0.75 ? 'ACHHA SHOT!' : off > 0 ? 'UPAR GAYA...' : 'NEECHE...';

  hitstop = perfect ? 0.1 : 0.06;
  shake.kick(4 + 8 * q);
  sfx.noise(0.08, 0.9, 5000);
  sfx.tone(perfect ? 1200 : 900, 0.12, 0.15, 'square', 300);
  const px = X(gilli.x);
  const py = Y(gilli.y);
  fx.ring(px, py, K() * 1.4, 'rgba(255, 247, 214, 0.9)', 0.3);
  fx.burst(px, py, { count: perfect ? 26 : 14, speed: [120, 320], size: [2, 4], life: [0.2, 0.45], colors: perfect ? ['#ffd23f', '#fff7d6', '#ff3fa4'] : ['#fff7d6', '#ffd23f'], shape: 'square', drag: 3 });
  for (const f of fielders) {
    f.react = 0.45 + rand(0, 0.15);
    f.state = 'run';
    f.target = f.x;
  }
  setMessage(`<span class="big">${hitLabel}</span>`, 1.1);
}

function strike() {
  strikes += 1;
  sfx.tone(260, 0.3, 0.12, 'square', 130);
  shake.kick(3);
  if (strikes >= 3) {
    endGame('3 STRIKES', 'TEEN BAAR CHOOK GAYE');
  } else {
    setMessage(`<span class="big">MISS!</span><span class="sub">STRIKE ${strikes} OF 3</span>`, 1.3);
    phase = 'ready';
    phaseT = 0;
    resetGilli();
  }
}

function landed() {
  phase = 'measure';
  phaseT = 0;
  lastDist = Math.max(0, Math.round((gilli.x - PIT_X) / DANDA_M));
}

function scoreHit() {
  score += lastDist;
  hits += 1;
  bump(scoreEl);
  if (score > best) {
    best = score;
    newBest = true;
    saveNumber(BEST_KEY, best);
  }
  const big = lastDist >= 100;
  if (big) {
    sfx.jingle([659, 784, 988, 1319]);
    for (let i = 0; i < 4; i++) {
      fx.burst(rand(0, W), -10, { count: 18, speed: [40, 200], size: [5, 9], life: [1.6, 2.4], colors: CONFETTI, gravity: 260, drag: 1.5, shape: 'square', angle: [0, Math.PI] });
    }
  } else sfx.tone(520 + Math.min(600, lastDist * 5), 0.15, 0.1, 'square');
  const extra = hits % 3 === 0 && fielderCount() < 5 ? '\nEK AUR FIELDER AAYA!' : '';
  setMessage(`<span class="big">${big ? 'CHHAKKA! ' : ''}+${lastDist}</span><span class="sub">DANDAS${extra}</span>`, 1.6);
}

function caught(k: number) {
  catcher = k;
  const f = fielders[k];
  f.state = 'catch';
  f.stateT = 0;
  gilli.vx = 0;
  gilli.vy = 0;
  gilli.vr = 0;
  gilli.grounded = true;
  slowmo = 0.8;
  shake.kick(6);
  sfx.tone(180, 0.5, 0.18, 'sawtooth', 90);
  fx.burst(X(f.x), Y(2), { count: 16, speed: [80, 220], size: [3, 5], life: [0.4, 0.8], colors: ['#ff3b3b', '#fff7d6'], shape: 'square' });
  endGame('PAKAD LIYA!', 'CAUGHT OUT');
}

function dropped(k: number) {
  const f = fielders[k];
  f.state = 'dropped';
  f.stateT = 0;
  gilli.vx *= 0.35;
  gilli.vy = Math.abs(gilli.vy) * 0.3 + 2;
  gilli.vr *= -0.6;
  sfx.tone(400, 0.2, 0.1, 'square', 800);
  fx.burst(X(gilli.x), Y(gilli.y), { count: 10, speed: [60, 160], size: [2, 4], life: [0.3, 0.6], colors: ['#fff7d6', '#6bff6b'], shape: 'square' });
  setMessage('<span class="big">CHHOOT GAYA!</span><span class="sub">DROPPED IT</span>', 1.2);
}

function endGame(title: string, sub: string) {
  phase = 'out';
  phaseT = 0;
  outAt = performance.now();
  if (newBest) sfx.jingle();
  setMessage(
    `<span class="big">OUT! ${title}</span>` +
      `<span class="sub">${sub}\n${score} DANDAS${newBest ? ' · NEW BEST!' : ''}</span>` +
      `\n<span class="blink">TAP TO PLAY AGAIN</span>`,
  );
}

// ---------- update ----------

function landingX(): number {
  const t = (gilli.vy + Math.sqrt(gilli.vy * gilli.vy + 2 * G * Math.max(0, gilli.y))) / G;
  return gilli.x + gilli.vx * t;
}

function updateGilli(dt: number) {
  if (gilli.grounded) return;
  gilli.vy -= G * dt;
  gilli.x += gilli.vx * dt;
  gilli.y += gilli.vy * dt;
  gilli.rot += gilli.vr * dt;
  if (phase === 'flying') {
    trail.push({ x: gilli.x, y: gilli.y });
    if (trail.length > 14) trail.shift();
  }
  if (gilli.y <= 0) {
    gilli.y = 0;
    const hard = Math.abs(gilli.vy) > 2;
    if (hard) {
      gilli.vy = -gilli.vy * 0.3;
      gilli.vx *= 0.55;
      gilli.vr *= 0.5;
      gilli.bounces += 1;
      sfx.noise(0.06, 0.4, 1500);
      fx.burst(X(gilli.x), Y(0), { count: 10, speed: [40, 160], size: [2, 5], life: [0.3, 0.7], colors: ['#d8b48a', '#b88a5e', '#fff1d0'], angle: [Math.PI, Math.PI * 2], drag: 4 });
      if (gilli.bounces === 1 && phase === 'flying') shake.kick(3);
    } else {
      // Sliding to a stop.
      gilli.vy = 0;
      gilli.vx *= Math.exp(-6 * dt);
      gilli.vr *= Math.exp(-8 * dt);
      gilli.rot = lerp(gilli.rot, Math.round(gilli.rot / Math.PI) * Math.PI, 0.2);
      if (Math.abs(gilli.vx) < 0.15) {
        gilli.vx = 0;
        gilli.grounded = true;
        if (phase === 'popped') strike();
        else if (phase === 'flying') landed();
      }
    }
  }
}

function updateFielders(dt: number) {
  const flying = phase === 'flying' && !gilli.grounded;
  const land = flying ? landingX() : 0;
  fielders.forEach((f, k) => {
    f.stateT += dt;
    if (f.state === 'catch' || f.state === 'cheer') {
      // Celebration hops.
      f.vy -= G * dt;
      f.jump = Math.max(0, f.jump + f.vy * dt);
      if (f.jump === 0 && f.stateT > 0.3) f.vy = 3;
      return;
    }
    if (f.state === 'dropped' && f.stateT < 0.8) return;

    let goal = f.home;
    let speed = 9; // jog back to position between turns
    if (flying) {
      f.react -= dt;
      if (f.react <= 0 && f.state !== 'dropped') {
        // Run to where it'll come down, as far as legs allow.
        goal = land;
        speed = f.speed;
      } else goal = f.x;
    } else if (phase === 'measure') {
      goal = f.x;
    }
    const d = goal - f.x;
    const step = Math.sign(d) * Math.min(Math.abs(d), speed * dt);
    f.x += step;
    const moving = Math.abs(step) > 0.001;
    f.run = moving ? f.run + (Math.abs(step) / dt) * dt * 2.2 : 0;
    if (!moving && f.state === 'run') f.state = 'idle';
    if (moving && f.state !== 'dropped') f.state = 'run';

    // Jump for a high one that's nearly overhead.
    if (flying && f.jump === 0 && Math.abs(gilli.x - f.x) < 1.5 && gilli.y > 1.9 && gilli.y < CATCH_H + 0.6 && gilli.vy < 0) f.vy = 3.2;
    f.vy -= G * dt;
    f.jump = Math.max(0, f.jump + f.vy * dt);
    if (f.jump === 0) f.vy = 0;

    // Catch attempt.
    if (flying && f.state !== 'dropped' && Math.abs(gilli.x - f.x) < CATCH_R && gilli.y < CATCH_H + f.jump && gilli.y > 0.3) {
      if (Math.random() < DROP_CHANCE) dropped(k);
      else caught(k);
    }
    // Slow-mo drama when a catch looks likely.
    if (flying && slowmo <= 0 && Math.abs(land - f.x) < 2.5 && Math.abs(gilli.x - f.x) < 6 && gilli.vy < 0) slowmo = 0.5;
  });
}

function updateCamera(dt: number) {
  let tx = 0;
  let tz = 1;
  if (phase === 'flying' || phase === 'measure' || (phase === 'out' && catcher >= 0) || (phase === 'out' && gilli.x > 5)) {
    const focus = phase === 'out' && catcher >= 0 ? fielders[catcher].x : gilli.x;
    tx = Math.max(0, focus - (W * 0.15) / K());
    tz = clamp01((H * 0.55) / ((gilli.y + 2.4) * S));
    tz = Math.max(0.35, Math.min(1, tz));
  }
  if (phase === 'return') {
    const t = easeOutQuad(clamp01(phaseT / 0.9));
    camX = lerp(returnFrom, 0, t);
    zoom = lerp(zoom, 1, 1 - Math.exp(-6 * dt));
    return;
  }
  const s = 1 - Math.exp(-5 * dt);
  camX += (tx - camX) * s;
  zoom += (tz - zoom) * s;
}

function update(dt: number) {
  clock += dt;
  phaseT += dt;
  fx.update(dt);
  shake.update(dt);
  if (msgUntil && clock > msgUntil) setMessage('');

  if (phase === 'flick' && phaseT >= FLICK_TIME * 0.5 && gilli.grounded) popGilli();
  if (swingT >= 0) {
    const before = swingT;
    swingT += dt;
    if (phase === 'popped' && !swingHit && before < SWING_CONTACT && swingT >= SWING_CONTACT) tryContact();
  }

  updateGilli(dt);
  updateFielders(dt);

  if (phase === 'measure' && phaseT > 0.9 && phaseT - dt <= 0.9) scoreHit();
  if (phase === 'measure' && phaseT > 2.2) {
    phase = 'return';
    phaseT = 0;
    returnFrom = camX;
    placeFielders();
  }
  if (phase === 'return' && phaseT > 1.0) {
    resetGilli();
    phase = 'ready';
    phaseT = 0;
  }

  updateCamera(dt);
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

// ---------- drawing: scenery ----------

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#2b1055');
  g.addColorStop(0.55, '#b83b7e');
  g.addColorStop(0.85, '#ff8f5a');
  g.addColorStop(1, '#ffc27a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GROUND);

  // Striped retro sun, drifting slowly with the camera.
  const sx = W * 0.72 - Math.min(camX * 3, W * 0.35);
  const sy = GROUND - H * 0.2;
  const r = Math.min(W, H) * 0.16;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.clip();
  const sg = ctx.createLinearGradient(0, sy - r, 0, sy + r);
  sg.addColorStop(0, '#ffe27a');
  sg.addColorStop(1, '#ff5f6d');
  ctx.fillStyle = sg;
  ctx.fillRect(0, sy - r, W * 2, r * 2);
  ctx.fillStyle = '#b83b7e';
  for (let i = 0; i < 6; i++) ctx.fillRect(0, sy + r * 0.1 + i * r * 0.16, W * 2, 2 + i * 1.5);
  ctx.restore();
}

// Rooftops: far layer (silhouettes with water tanks and TV antennas).
function drawSkyline(depth: number, color: string, windowColor: string | null, baseH: number) {
  const unit = S * 0.42;
  const offset = camX * K() * depth;
  const first = Math.floor((offset - W) / unit / 5) - 1;
  const last = Math.floor((offset + W * 2) / unit / 5) + 1;
  ctx.fillStyle = color;
  for (let i = first; i <= last; i++) {
    const seed = i + depth * 1000;
    const w = (3 + hash(seed) * 3) * unit;
    const h = (baseH + hash(seed + 1) * baseH) * unit;
    const x = i * 5 * unit - offset;
    const y = GROUND - h;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    // Black water tank.
    if (hash(seed + 2) > 0.45) {
      const tw = unit * 0.9;
      ctx.fillRect(x + w * 0.2, y - unit * 0.7, tw, unit * 0.7);
      ctx.fillRect(x + w * 0.2 + tw * 0.15, y - unit * 0.85, tw * 0.7, unit * 0.2);
    }
    // TV antenna.
    if (hash(seed + 3) > 0.4) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      const ax = x + w * 0.7;
      ctx.beginPath();
      ctx.moveTo(ax, y);
      ctx.lineTo(ax, y - unit * 1.4);
      for (let b = 0; b < 3; b++) {
        const by = y - unit * (0.7 + b * 0.25);
        const half = unit * (0.5 - b * 0.12);
        ctx.moveTo(ax - half, by);
        ctx.lineTo(ax + half, by);
      }
      ctx.stroke();
    }
    if (windowColor) {
      ctx.fillStyle = windowColor;
      for (let wy = y + unit * 0.5; wy < GROUND - unit * 0.6; wy += unit * 0.9) {
        for (let wx = x + unit * 0.4; wx < x + w - unit * 0.5; wx += unit * 0.9) {
          if (hash(wx * 0.13 + wy * 0.71) > 0.55) ctx.fillRect(wx, wy, unit * 0.35, unit * 0.4);
        }
      }
    }
  }
}

// Electric poles with sagging wires, and the odd kite stuck on them.
function drawPoles() {
  const spacing = 22;
  const depth = 0.8;
  const k = K();
  const first = Math.floor((camX * depth - (W * 0.3) / k - 10) / spacing);
  const last = Math.ceil((camX * depth + (W * 0.7) / k) / spacing) + 1;
  const poleH = 4.6;
  const pts: { x: number; y: number }[] = [];
  ctx.strokeStyle = '#3a1a3f';
  ctx.lineWidth = Math.max(2, k * 0.12);
  for (let i = first; i <= last; i++) {
    const wx = i * spacing + 8;
    const x = W * 0.3 + (wx - camX * depth) * k;
    const top = GROUND - poleH * k;
    ctx.beginPath();
    ctx.moveTo(x, GROUND);
    ctx.lineTo(x, top);
    ctx.moveTo(x - k * 0.8, top + k * 0.3);
    ctx.lineTo(x + k * 0.8, top + k * 0.3);
    ctx.stroke();
    pts.push({ x, y: top + k * 0.3 });
  }
  ctx.lineWidth = 1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    for (const off of [-0.6, 0.6]) {
      ctx.beginPath();
      ctx.moveTo(a.x + off * k, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, a.y + k * 1.2, b.x + off * k, b.y);
      ctx.stroke();
    }
    // A patang stuck on the wire.
    const idx = first + i;
    if (hash(idx * 3.3) > 0.7) {
      const mx = (a.x + b.x) / 2 + (hash(idx) - 0.5) * k * 6;
      const my = a.y + k * 0.9;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(0.3 + Math.sin(clock * 2 + idx) * 0.1);
      ctx.fillStyle = hash(idx * 7) > 0.5 ? '#19d3c5' : '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(0, -k * 0.35);
      ctx.lineTo(k * 0.28, 0);
      ctx.lineTo(0, k * 0.35);
      ctx.lineTo(-k * 0.28, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff7d6';
      ctx.beginPath();
      ctx.moveTo(0, k * 0.35);
      ctx.quadraticCurveTo(k * 0.3, k * 0.8, 0, k * 1.2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#3a1a3f';
    }
  }
}

function drawGround() {
  const g = ctx.createLinearGradient(0, GROUND, 0, H);
  g.addColorStop(0, '#b0784a');
  g.addColorStop(1, '#6e4527');
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = 'rgba(255, 230, 190, 0.35)';
  ctx.fillRect(0, GROUND, W, 2);

  const k = K();
  const x0 = camX - (W * 0.3) / k - 2;
  const x1 = camX + (W * 0.7) / k + 2;
  // Grass tufts and pebbles.
  for (let m = Math.floor(x0); m < x1; m++) {
    const h = hash(m);
    if (h > 0.6) {
      const x = X(m + hash(m + 9));
      ctx.strokeStyle = '#6d8a34';
      ctx.lineWidth = 2;
      for (let b = -1; b <= 1; b++) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND + 1);
        ctx.lineTo(x + b * 3, GROUND - 4 - hash(m + b) * 6);
        ctx.stroke();
      }
    } else if (h < 0.15) {
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(X(m + 0.5), GROUND + 4 + h * 40, 4, 3);
    }
  }
  // Chalk distance markers every 10 dandas.
  ctx.font = `${Math.max(8, Math.round(9 * zoom + 3))}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  const step = 10 * DANDA_M;
  for (let n = Math.max(1, Math.floor((x0 - PIT_X) / step)); PIT_X + n * step < x1; n++) {
    const x = X(PIT_X + n * step);
    ctx.fillStyle = 'rgba(255, 252, 240, 0.7)';
    ctx.fillRect(x - 1, GROUND + 2, 2, 10);
    if (n % 2 === 0 || zoom > 0.7) {
      ctx.fillStyle = 'rgba(255, 252, 240, 0.8)';
      ctx.fillText(String(n * 10), x, GROUND + 26);
    }
  }
  // The pit (gutli).
  ctx.fillStyle = '#3d2413';
  ctx.beginPath();
  ctx.ellipse(X(PIT_X), GROUND + 2, 0.22 * k, 0.05 * k + 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- drawing: actors ----------

type Pose = {
  hip: number; // hip height (m)
  lean: number; // torso lean (rad, + = forward)
  run: number; // run-cycle phase, 0 when standing
  armsUp: boolean;
  hand?: { x: number; y: number }; // for the batter: where the hands grip the danda (world, relative to feet)
};

function drawKid(x: number, lift: number, facing: 1 | -1, pose: Pose, shirt: string) {
  const k = K();
  const fx0 = X(x);
  const fy0 = Y(lift);
  // Shadow.
  ctx.fillStyle = `rgba(40, 20, 10, ${0.35 / (1 + lift)})`;
  ctx.beginPath();
  ctx.ellipse(fx0, GROUND, 0.3 * k, 0.06 * k + 1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(fx0, fy0);
  ctx.scale(facing * k, -k); // world metres, y up
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const hipY = pose.hip;
  const sw = pose.run ? Math.sin(pose.run) : 0;
  // Legs.
  ctx.strokeStyle = '#3b2a1e';
  ctx.lineWidth = 0.1;
  const leg = (dir: number) => {
    const footX = pose.run ? dir * sw * 0.32 : dir * 0.14;
    const footY = pose.run ? Math.max(0, -dir * sw) * 0.12 : 0;
    const kneeX = footX * 0.5 + (pose.run ? 0.06 : 0.05);
    const kneeY = hipY * 0.5 + footY * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(footX - 0.04, footY - 0.02, 0.14, 0.04);
  };
  leg(-1);
  leg(1);

  // Torso.
  const shX = Math.sin(pose.lean) * 0.45;
  const shY = hipY + Math.cos(pose.lean) * 0.45;
  ctx.strokeStyle = '#26315e';
  ctx.lineWidth = 0.2;
  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(shX * 0.25, hipY + 0.1);
  ctx.stroke();
  ctx.strokeStyle = shirt;
  ctx.lineWidth = 0.26;
  ctx.beginPath();
  ctx.moveTo(shX * 0.2, hipY + 0.12);
  ctx.lineTo(shX, shY);
  ctx.stroke();

  // Arms.
  ctx.strokeStyle = '#c68642';
  ctx.lineWidth = 0.07;
  const arm = (hx: number, hy: number) => {
    ctx.beginPath();
    ctx.moveTo(shX, shY - 0.03);
    ctx.lineTo((shX + hx) / 2 + 0.03, (shY + hy) / 2 - 0.06);
    ctx.lineTo(hx, hy);
    ctx.stroke();
  };
  if (pose.hand) {
    const hx = pose.hand.x * facing;
    arm(hx, pose.hand.y);
    arm(hx - 0.05, pose.hand.y - 0.04);
  } else if (pose.armsUp) {
    arm(shX + 0.12, shY + 0.5);
    arm(shX - 0.08, shY + 0.52);
  } else {
    arm(shX - sw * 0.2, shY - 0.4);
    arm(shX + sw * 0.2, shY - 0.4);
  }

  // Head.
  const hx = shX + Math.sin(pose.lean) * 0.12;
  const hy = shY + 0.2;
  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.arc(hx, hy, 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1210';
  ctx.beginPath();
  ctx.arc(hx - 0.02, hy + 0.03, 0.135, Math.PI * 0.05, Math.PI * 1.1);
  ctx.fill();
  ctx.fillRect(hx + 0.06, hy + 0.0, 0.03, 0.03);
  ctx.restore();
}

// Batter pose over the turn: crouched at the pit, flick, wind-up, swing.
function batterPose(): { pose: Pose; danda: number; hand: { x: number; y: number } } {
  const crouch: Pose = { hip: 0.48, lean: 0.55, run: 0, armsUp: false };
  const tipX = PIT_X + 0.1 - BATTER_X;
  const readyHand = { x: 0.3, y: 0.45 };
  const readyAngle = Math.atan2(0.1 - readyHand.y, tipX - readyHand.x);

  if (phase === 'ready' || phase === 'return') {
    const breathe = Math.sin(clock * 3) * 0.01;
    return { pose: { ...crouch, hip: crouch.hip + breathe }, danda: readyAngle, hand: readyHand };
  }
  if (phase === 'flick') {
    // Lift slightly, then snap down on the tip.
    const t = clamp01(phaseT / FLICK_TIME);
    const lift = t < 0.5 ? Math.sin(t * Math.PI) * 0.25 : 0;
    return { pose: crouch, danda: readyAngle + lift, hand: readyHand };
  }
  const windHand = { x: 0.05, y: 1.05 };
  const windAngle = 2.3;
  if (phase === 'popped' && swingT < 0) {
    // Rising into the wind-up.
    const t = easeOutQuad(clamp01(phaseT / 0.18));
    return {
      pose: { hip: lerp(crouch.hip, 0.58, t), lean: lerp(crouch.lean, 0.1, t), run: 0, armsUp: false },
      danda: lerp(readyAngle, windAngle, t),
      hand: { x: lerp(readyHand.x, windHand.x, t), y: lerp(readyHand.y, windHand.y, t) },
    };
  }
  if (swingT >= 0) {
    // Fast chop through horizontal at contact, then follow through.
    const t = clamp01(swingT / SWING_TIME);
    const tc = SWING_CONTACT / SWING_TIME;
    const a = t < tc ? lerp(windAngle, 0, t / tc) : lerp(0, -1.3, easeOutQuad((t - tc) / (1 - tc)));
    const hand = { x: lerp(windHand.x, 0.25, clamp01(t / tc)), y: lerp(windHand.y, ZONE_H, clamp01(t / tc)) };
    return { pose: { hip: 0.56, lean: 0.25, run: 0, armsUp: false }, danda: a, hand };
  }
  return { pose: { hip: 0.58, lean: 0.1, run: 0, armsUp: false }, danda: windAngle, hand: windHand };
}

function drawBatter() {
  const { pose, danda, hand } = batterPose();
  const sad = phase === 'out';
  const p: Pose = sad ? { hip: 0.58, lean: 0.35, run: 0, armsUp: false, hand: { x: 0.2, y: 0.5 } } : { ...pose, hand };
  drawKid(BATTER_X, 0, 1, p, '#19d3c5');

  // The danda.
  const k = K();
  const h = sad ? { x: 0.2, y: 0.5 } : hand;
  const a = sad ? -1.2 : danda;
  const hx = X(BATTER_X + h.x);
  const hy = Y(h.y);
  const ex = hx + Math.cos(a) * DANDA_LEN * k;
  const ey = hy - Math.sin(a) * DANDA_LEN * k;
  // Swing blur arc.
  if (swingT >= 0 && swingT < SWING_TIME * 0.6) {
    ctx.strokeStyle = 'rgba(255, 247, 214, 0.35)';
    ctx.lineWidth = DANDA_LEN * k * 0.5;
    ctx.beginPath();
    ctx.arc(hx, hy, DANDA_LEN * k * 0.7, -2.3, -a, false);
    ctx.stroke();
  }
  ctx.strokeStyle = '#7a4a22';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, 0.06 * k);
  ctx.beginPath();
  ctx.moveTo(hx - Math.cos(a) * 0.08 * k, hy + Math.sin(a) * 0.08 * k);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = '#b5773a';
  ctx.lineWidth = Math.max(1, 0.02 * k);
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
}

function drawGilli() {
  const k = K();
  const vis = Math.max(1, 1.6 / Math.max(0.5, zoom)); // keep it visible when zoomed out
  const len = 0.2 * k * vis;
  const thick = 0.045 * k * vis;
  // Trail.
  for (let i = 0; i < trail.length; i++) {
    const t = i / trail.length;
    ctx.fillStyle = `rgba(255, 226, 122, ${t * 0.45})`;
    ctx.beginPath();
    ctx.arc(X(trail[i].x), Y(trail[i].y), thick * 0.6 * t + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Shadow.
  ctx.fillStyle = `rgba(40, 20, 10, ${0.3 / (1 + gilli.y * 0.5)})`;
  ctx.beginPath();
  ctx.ellipse(X(gilli.x), GROUND, len * 0.5, 2 + thick * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(X(gilli.x), Y(gilli.y + 0.03));
  ctx.rotate(gilli.grounded && phase === 'ready' ? -0.25 : gilli.rot);
  ctx.fillStyle = '#d9a066';
  ctx.strokeStyle = '#5a3515';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(-len / 4, -thick, 0, -thick * 0.9);
  ctx.quadraticCurveTo(len / 4, -thick, len / 2, 0);
  ctx.quadraticCurveTo(len / 4, thick, 0, thick * 0.9);
  ctx.quadraticCurveTo(-len / 4, thick, -len / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90, 53, 21, 0.5)';
  ctx.beginPath();
  ctx.moveTo(-len * 0.3, 0);
  ctx.lineTo(len * 0.3, 0);
  ctx.stroke();
  ctx.restore();
}

function drawFlickRing() {
  if (phase !== 'ready') return;
  const k = K();
  const r = flickRing();
  const good = r < 0.2;
  const x = X(PIT_X + 0.1);
  const y = Y(0.1);
  ctx.save();
  ctx.strokeStyle = good ? '#6bff6b' : '#fff7d6';
  ctx.lineWidth = good ? 4 : 2;
  if (good) {
    ctx.shadowColor = '#6bff6b';
    ctx.shadowBlur = 12;
  }
  ctx.beginPath();
  ctx.arc(x, y, (0.12 + r * 0.5) * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Where the danda will connect, shown while the gilli is up.
function drawHitZone() {
  if (phase !== 'popped' || swingT >= 0) return;
  const k = K();
  const x = X(PIT_X);
  const inZone = Math.abs(gilli.y - ZONE_H) < REACH;
  const sweet = Math.abs(gilli.y - ZONE_H) < REACH * 0.12;
  ctx.save();
  ctx.fillStyle = sweet ? 'rgba(107, 255, 107, 0.35)' : inZone ? 'rgba(255, 210, 63, 0.25)' : 'rgba(255, 247, 214, 0.12)';
  ctx.fillRect(x - 0.35 * k, Y(ZONE_H + REACH), 0.7 * k, REACH * 2 * k);
  ctx.fillStyle = 'rgba(107, 255, 107, 0.6)';
  ctx.fillRect(x - 0.35 * k, Y(ZONE_H) - 2, 0.7 * k, 4);
  ctx.restore();
}

function drawFielders() {
  fielders.forEach((f) => {
    const armsUp = f.state === 'catch' || f.state === 'cheer' || (phase === 'flying' && Math.abs(gilli.x - f.x) < 4 && !gilli.grounded);
    const pose: Pose = { hip: 0.58, lean: f.state === 'run' ? 0.3 : 0.05, run: f.state === 'run' ? f.run : 0, armsUp };
    if (f.state === 'dropped' && f.stateT < 0.8) {
      pose.lean = -0.3;
      pose.armsUp = false;
    }
    drawKid(f.x, f.jump, -1, pose, f.shirt);
  });
  // The caught gilli in the catcher's hands.
  if (catcher >= 0) {
    const f = fielders[catcher];
    gilli.x = f.x - 0.05;
    gilli.y = f.jump + 1.55;
  }
}

function drawMeasure() {
  if (phase !== 'measure') return;
  const t = clamp01(phaseT / 0.8);
  const endX = lerp(PIT_X, gilli.x, easeOutQuad(t));
  ctx.save();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(X(PIT_X), GROUND + 36);
  ctx.lineTo(X(endX), GROUND + 36);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '14px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2a0f3d';
  const label = `${Math.round(lastDist * easeOutQuad(t))}`;
  ctx.fillText(label, X(gilli.x) + 2, Y(gilli.y) - 22);
  ctx.fillStyle = '#ffd23f';
  ctx.fillText(label, X(gilli.x), Y(gilli.y) - 24);
  ctx.restore();
}

function drawMiniMap() {
  const w = Math.min(W - 32, 520);
  const x0 = (W - w) / 2;
  const y = 78;
  const toMap = (m: number) => x0 + clamp01((m - PIT_X) / DANDA_M / MAP_RANGE) * w;
  ctx.save();
  ctx.fillStyle = 'rgba(42, 15, 61, 0.75)';
  ctx.fillRect(x0 - 6, y - 8, w + 12, 16);
  ctx.fillStyle = 'rgba(255, 247, 214, 0.4)';
  for (let d = 0; d <= MAP_RANGE; d += 20) ctx.fillRect(x0 + (d / MAP_RANGE) * w, y - 3, 1, 6);
  for (const f of fielders) {
    ctx.fillStyle = f.shirt;
    ctx.fillRect(toMap(f.x) - 3, y - 5, 6, 10);
  }
  ctx.fillStyle = '#19d3c5';
  ctx.fillRect(toMap(BATTER_X) - 2, y - 5, 4, 10);
  if (phase === 'flying' || phase === 'measure') {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(toMap(gilli.x), y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStatus() {
  ctx.save();
  const size = Math.max(9, Math.min(13, Math.round(W / 70)));
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  const y = 110;
  let text = '';
  if (phase === 'ready') text = 'TAP TO FLICK';
  else if (phase === 'popped' && swingT < 0) text = 'TAP TO HIT!';
  if (text) {
    const pulse = phase === 'popped' ? 1 : 0.6 + 0.4 * Math.sin(clock * 5);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#2a0f3d';
    ctx.fillText(text, W / 2 + 2, y + 2);
    ctx.fillStyle = phase === 'popped' ? '#6bff6b' : '#fff7d6';
    ctx.fillText(text, W / 2, y);
    ctx.globalAlpha = 1;
  }
  // Strikes.
  const sy = y + size + 12;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < strikes ? '#ff3b3b' : 'rgba(255, 247, 214, 0.3)';
    ctx.beginPath();
    ctx.arc(W / 2 + (i - 1) * 18, sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  shake.apply(ctx);
  drawSky();
  drawSkyline(0.15, '#6a2f78', 'rgba(255, 210, 120, 0.3)', 3.2);
  drawSkyline(0.35, '#3d1a4f', 'rgba(255, 190, 90, 0.45)', 2);
  drawPoles();
  drawGround();
  drawHitZone();
  drawFielders();
  drawBatter();
  drawGilli();
  drawFlickRing();
  drawMeasure();
  fx.draw(ctx);
  ctx.restore();
  drawMiniMap();
  drawStatus();
}

// ---------- input ----------

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (!e.repeat) tap();
  }
  if (e.key === 'm' || e.key === 'M') sfx.muted = !sfx.muted;
});

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tap();
});

// ---------- boot ----------

window.addEventListener('resize', resize);
resize();
newGame();
setMessage('<span class="big">GILLI DANDA!</span><span class="sub">FLICK IT UP · HIT IT FAR\nDON\'T GET CAUGHT</span>\n<span class="blink">TAP TO FLICK</span>');

// Dev-only state peek for automated playtests; stripped from production builds.
if (import.meta.env.DEV) {
  Object.assign(window, { __gilli: () => ({ phase, gilli, fielders, score, strikes, hits, swingT, lastDist }) });
}

let last = performance.now();
function frame(now: number) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (hitstop > 0) {
    hitstop -= dt;
    dt = 0;
  } else if (slowmo > 0) {
    slowmo -= dt;
    dt *= 0.3;
  } else if (phase === 'popped' || phase === 'flick') {
    dt *= POP_SLOWMO;
  }
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
