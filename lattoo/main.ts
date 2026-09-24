// Lattoo — a 90s courtyard spinning-top game.
// Hold to wind the string, release while the needle is in the green, then keep
// the top inside the chalk circle until it wobbles over.

import {
  CONFETTI,
  Particles,
  Sfx,
  Shake,
  clamp01,
  easeInQuad,
  easeOutBounce,
  easeOutQuad,
  lerp,
  loadNumber,
  rand,
  saveNumber,
} from '../shared/fx';

type Phase = 'ready' | 'winding' | 'throwing' | 'spinning' | 'falling' | 'over';
type Vec = { x: number; y: number };
type RGB = [number, number, number];

const MAX_RPM = 1800;
const FALL_RPM = 160;
const SWEET = 0.85; // meter position that gives a perfect throw
const WIND_TIME = 0.9; // seconds of holding for a full wind
const PULL_TIME = 0.18; // throw: the top is yanked up first...
const THROW_TIME = 0.5; // ...then flung down, landing at this time
const FALL_TIME = 1.0;
const FALL_LEAN = 1.1; // lean at which the body rests on the floor
const STEER_ACCEL = 1.6;
const BEST_KEY = 'lattoo.best';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const timeEl = document.getElementById('time')!;
const bestEl = document.getElementById('best')!;
const messageEl = document.getElementById('message')!;

const fx = new Particles();
const shake = new Shake();
const sfx = new Sfx();

// ---------- state ----------

let phase: Phase = 'ready';
let holdTime = 0;
let holdStart = 0;
let fullyWound = false;
let quality = 0;
let throwT = 0;
let rpm = 0;
let spinPhase = 0;
let precession = 0;
let tilt = 0;
let driftAngle = 0;
let pos: Vec = { x: 0, y: 0 };
let vel: Vec = { x: 0, y: 0 };
let landing: Vec = { x: 0, y: 0 };
let releaseKnob: Vec = { x: 0, y: 0 };
let squashT = 99;
let trail: Vec[] = [];
let trailAcc = 0;
let outFlash = 0;
let elapsed = 0;
let lastWholeSecond = 0;
let fallT = 0;
let fallFrom = 0;
let fallDir = 1;
let fallHit = false;
let overAt = 0;
let overMessage = '';
let newBest = false;
let ratingUntil = 0;
let clock = 0;
let best = loadNumber(BEST_KEY);

const keys = new Set<string>();
let pointerDown = false;
let pointerWorld: Vec | null = null;

// ---------- layout ----------

let W = 0;
let H = 0;
let R = 0; // chalk circle radius in px
let CX = 0;
let CY = 0;
let TOP = 0; // top height in px
let floor: HTMLCanvasElement | null = null;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  R = Math.min(W * 0.4, H * 0.42);
  CX = W / 2;
  CY = H * 0.6;
  TOP = R * 0.55;
  floor = makeFloor(W, H);
}

function toScreen(p: Vec): Vec {
  return { x: CX + p.x * R, y: CY + p.y * R * 0.5 };
}

function toWorld(sx: number, sy: number): Vec {
  return { x: (sx - CX) / R, y: (sy - CY) / (R * 0.5) };
}

// A 90s red-oxide courtyard floor, drawn once per resize.
function makeFloor(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a2e22';
  g.fillRect(0, 0, w, h);
  const chips = ['#6a251b', '#8c3a2b', '#5a1e16', '#9a4a36'];
  const count = Math.floor((w * h) / 140);
  for (let i = 0; i < count; i++) {
    g.fillStyle = chips[i % chips.length];
    const s = 1 + Math.random() * 3.5;
    g.fillRect(Math.random() * w, Math.random() * h, s, s * (0.6 + Math.random() * 0.6));
  }
  g.strokeStyle = 'rgba(30, 8, 4, 0.35)';
  g.lineWidth = 1;
  const tile = Math.max(80, Math.round(Math.min(w, h) / 6));
  for (let x = 0; x < w; x += tile) {
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, h);
    g.stroke();
  }
  for (let y = 0; y < h; y += tile) {
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(w, y + 0.5);
    g.stroke();
  }
  // Soft window light across the floor.
  const light = g.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, Math.max(w, h) * 0.8);
  light.addColorStop(0, 'rgba(255, 190, 120, 0.18)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
  g.fillStyle = light;
  g.fillRect(0, 0, w, h);
  return c;
}

// ---------- audio ----------

let hum: OscillatorNode | null = null;
let humGain: GainNode | null = null;

function ensureAudio() {
  sfx.ensure();
  const a = sfx.ctx;
  if (!a || hum) return;
  hum = a.createOscillator();
  hum.type = 'sawtooth';
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  humGain = a.createGain();
  humGain.gain.value = 0;
  hum.connect(lp).connect(humGain).connect(a.destination);
  hum.start();
}

function updateHum() {
  const a = sfx.ctx;
  if (!a || !hum || !humGain) return;
  const spinning = phase === 'spinning' || (phase === 'throwing' && throwT > PULL_TIME);
  const rattle = 0.65 + 0.35 * Math.abs(Math.sin(precession * 2));
  const target = spinning && !sfx.muted ? 0.05 * rattle : 0;
  humGain.gain.setTargetAtTime(target, a.currentTime, 0.03);
  hum.frequency.setTargetAtTime(40 + rpm * 0.09, a.currentTime, 0.05);
}

// ---------- game flow ----------

function meterValue(t: number): number {
  const u = (t * 1.3) % 2;
  return u < 1 ? u : 2 - u;
}

function press() {
  ensureAudio();
  if (phase === 'ready' || (phase === 'over' && performance.now() - overAt > 600)) {
    phase = 'winding';
    holdStart = performance.now();
    holdTime = 0;
    fullyWound = false;
    newBest = false;
    trail = [];
    setMessage('');
  }
}

function release() {
  if (phase !== 'winding') return;
  holdTime = (performance.now() - holdStart) / 1000;
  const wind = Math.min(1, holdTime / WIND_TIME);
  const m = meterValue(holdTime);
  const accuracy = clamp01(1 - Math.abs(m - SWEET) / 0.6);
  quality = Math.max(0.2, accuracy) * (0.35 + 0.65 * wind);

  const perfect = wind >= 1 && Math.abs(m - SWEET) < 0.07;
  if (perfect) quality = 1;

  rpm = 250 + 1550 * quality;
  precession = Math.random() * Math.PI * 2;
  driftAngle = Math.random() * Math.PI * 2;
  const scatter = 0.05 + 0.25 * (1 - quality);
  const a = Math.random() * Math.PI * 2;
  landing = { x: Math.cos(a) * scatter, y: Math.sin(a) * scatter };
  const push = 0.15 + 0.5 * (1 - quality);
  const b = Math.random() * Math.PI * 2;
  vel = { x: Math.cos(b) * push, y: Math.sin(b) * push };
  elapsed = 0;
  lastWholeSecond = 0;
  throwT = 0;
  phase = 'throwing';
  sfx.noise(0.12, 0.25, 2500); // string whoosh

  const rating = perfect ? 'PERFECT THROW!' : quality > 0.7 ? 'ACHHA! NICE ONE' : quality > 0.45 ? 'THEEK HAI...' : 'WEAK THROW :(';
  setMessage(`<span class="big">${rating}</span>`);
  ratingUntil = performance.now() + 1400;
  if (perfect) sfx.jingle([784, 1047, 1319]);
}

function land() {
  pos = { ...landing };
  phase = 'spinning';
  squashT = 0;
  const p = toScreen(pos);
  sfx.noise(0.09, 0.5, 1500);
  shake.kick(4 + 6 * quality);
  fx.ring(p.x, p.y, TOP * 0.9, 'rgba(255, 240, 220, 0.8)');
  fx.burst(p.x, p.y, {
    count: 18,
    speed: [60, 220],
    size: [2, 5],
    life: [0.3, 0.7],
    colors: ['#c98b6b', '#e0b89a', '#a0604a'],
    squashY: 0.4,
    drag: 5,
  });
}

function endRound(reason: string, out: boolean) {
  phase = 'falling';
  fallT = 0;
  fallHit = false;
  fallFrom = tilt * Math.cos(precession);
  fallDir = fallFrom >= 0 ? 1 : -1;
  newBest = elapsed > best;
  if (newBest) {
    best = elapsed;
    saveNumber(BEST_KEY, best);
  }
  if (out) {
    outFlash = 1;
    sfx.tone(220, 0.35, 0.12, 'square', 110);
  }
  overMessage =
    `<span class="big">${reason}</span>` +
    `<span class="sub">SPUN FOR ${elapsed.toFixed(1)}s${newBest ? '\nNEW BEST!' : ''}</span>` +
    `\n<span class="blink">HOLD TO GO AGAIN</span>`;
}

function update(dt: number) {
  clock += dt;
  fx.update(dt);
  shake.update(dt);
  squashT += dt;
  outFlash = Math.max(0, outFlash - dt * 1.2);

  if (phase === 'winding') {
    // Wall-clock, so dropped frames can't skew the throw timing.
    holdTime = (performance.now() - holdStart) / 1000;
    if (!fullyWound && holdTime >= WIND_TIME) {
      fullyWound = true;
      sfx.tone(880, 0.08, 0.08);
      const k = handPose().knob;
      fx.burst(k.x, k.y, { count: 10, speed: [80, 160], size: [2, 3], life: [0.2, 0.4], colors: ['#fff7d6', '#19d3c5'], shape: 'square' });
    }
  }

  if (phase === 'throwing' || phase === 'spinning' || phase === 'falling' || phase === 'over') {
    spinPhase += (rpm / 60) * Math.PI * 2 * dt;
  }

  if (phase === 'throwing') {
    if (throwT < PULL_TIME && throwT + dt >= PULL_TIME) releaseKnob = throwPose(PULL_TIME).knob;
    throwT += dt;
    if (throwT >= THROW_TIME) land();
  }

  if (phase === 'spinning') updateSpin(dt);

  if (phase === 'falling' || phase === 'over') {
    fallT += dt;
    rpm = Math.max(0, rpm - 500 * dt);
    if (!fallHit && fallT > 0.2) {
      // Body hits the floor on the first bounce.
      fallHit = true;
      const p = toScreen(pos);
      sfx.noise(0.14, 0.6, 900);
      shake.kick(8);
      fx.burst(p.x - fallDir * TOP * 0.35, p.y, {
        count: 22,
        speed: [40, 200],
        size: [2, 6],
        life: [0.4, 0.9],
        colors: ['#c98b6b', '#e0b89a', '#a0604a'],
        squashY: 0.4,
        drag: 4,
      });
    }
    if (phase === 'falling' && fallT >= FALL_TIME) {
      phase = 'over';
      overAt = performance.now();
      setMessage(overMessage);
      if (newBest) celebrate();
    }
  }

  if (ratingUntil && performance.now() > ratingUntil && phase === 'spinning') {
    ratingUntil = 0;
    setMessage('');
  }

  const shown = phase === 'ready' ? 0 : elapsed;
  timeEl.textContent = shown.toFixed(1);
  bestEl.textContent = best.toFixed(1);
  if (phase === 'spinning' && Math.floor(elapsed) > lastWholeSecond) {
    lastWholeSecond = Math.floor(elapsed);
    bump(timeEl);
  }
  updateHum();
}

function updateSpin(dt: number) {
  elapsed += dt;
  const s = rpm / MAX_RPM;
  rpm -= (35 + 0.035 * rpm) * dt;

  // Wobble grows sharply as the top slows down.
  tilt = 0.03 + 0.6 * Math.pow(clamp01(1 - (rpm - FALL_RPM) / 700), 3);
  precession += (2 + 10 * (1 - s)) * dt;

  // Random drift that gets worse as it slows, plus player steering.
  driftAngle += (Math.random() - 0.5) * 5 * dt;
  const jitter = 0.25 + 1.6 * (1 - s) ** 2;
  let ax = Math.cos(driftAngle) * jitter;
  let ay = Math.sin(driftAngle) * jitter;

  let sx = 0;
  let sy = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) sx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) sx += 1;
  if (keys.has('ArrowUp') || keys.has('w')) sy -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) sy += 1;
  if (pointerDown && pointerWorld) {
    const dx = pointerWorld.x - pos.x;
    const dy = pointerWorld.y - pos.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) {
      const k = Math.min(1, d * 4) / d;
      sx += dx * k;
      sy += dy * k;
    }
  }
  const sl = Math.hypot(sx, sy);
  if (sl > 0) {
    ax += (sx / Math.max(1, sl)) * STEER_ACCEL;
    ay += (sy / Math.max(1, sl)) * STEER_ACCEL;
  }

  vel.x += ax * dt;
  vel.y += ay * dt;
  const damp = Math.exp(-1.2 * dt);
  vel.x *= damp;
  vel.y *= damp;
  const sp = Math.hypot(vel.x, vel.y);
  if (sp > 0.9) {
    vel.x *= 0.9 / sp;
    vel.y *= 0.9 / sp;
  }
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;

  // Scratch trail left by the nail.
  trailAcc += dt;
  if (trailAcc > 0.03) {
    trailAcc = 0;
    trail.push({ ...pos });
    if (trail.length > 70) trail.shift();
  }

  // Sparks off the nail at high speed, dust puffs when it's wobbling.
  const p = toScreen(pos);
  if (rpm > 1000 && Math.random() < ((rpm - 1000) / 800) * 0.6) {
    fx.burst(p.x, p.y, { count: 1, speed: [80, 220], size: [1.5, 2.5], life: [0.15, 0.3], colors: ['#ffe27a', '#fff7d6'], angle: [Math.PI, Math.PI * 2], gravity: 500, drag: 1 });
  }
  if (tilt > 0.25 && Math.random() < tilt * 0.25) {
    fx.burst(p.x, p.y, { count: 2, speed: [20, 70], size: [2, 4], life: [0.3, 0.6], colors: ['#c98b6b', '#e0b89a'], squashY: 0.4, drag: 4 });
  }

  if (Math.hypot(pos.x, pos.y) > 1) endRound('BAHAR! OUT OF THE CIRCLE', true);
  else if (rpm <= FALL_RPM) endRound('GIR GAYA!', false);
}

function celebrate() {
  sfx.jingle();
  for (let i = 0; i < 6; i++) {
    fx.burst(rand(0, W), -10, {
      count: 20,
      speed: [40, 200],
      size: [5, 9],
      life: [1.6, 2.6],
      colors: CONFETTI,
      gravity: 260,
      drag: 1.5,
      shape: 'square',
      angle: [0, Math.PI],
    });
  }
}

// ---------- poses ----------

// Where the string hangs from (just off the top of the screen).
function anchor(): Vec {
  return { x: CX, y: -20 };
}

// The top dangling from the string: swaying in 'ready', shivering while winding.
function handPose(): { knob: Vec; tip: Vec; lean: number } {
  const a0 = anchor();
  const wind = phase === 'winding' ? Math.min(1, holdTime / WIND_TIME) : 0;
  const tipY = CY - R * 0.62 - wind * TOP * 0.15;
  const len = tipY - TOP * 0.9 - a0.y;
  const ang = phase === 'winding' ? 0.025 * wind * Math.sin(clock * 45) : 0.12 * Math.sin(clock * 1.8);
  const knob = { x: a0.x + Math.sin(ang) * len, y: a0.y + Math.cos(ang) * len };
  const tip = { x: knob.x + Math.sin(ang) * TOP * 0.9, y: knob.y + Math.cos(ang) * TOP * 0.9 };
  return { knob, tip, lean: -ang };
}

// Throw: yank up during PULL_TIME, then accelerate down to the landing spot.
function throwPose(t: number): { knob: Vec; tip: Vec } {
  const startTip = { x: CX, y: CY - R * 0.62 - TOP * 0.15 };
  const pulledTip = { x: CX, y: startTip.y - TOP * 0.35 };
  let tip: Vec;
  if (t < PULL_TIME) {
    const u = easeOutQuad(t / PULL_TIME);
    tip = { x: lerp(startTip.x, pulledTip.x, u), y: lerp(startTip.y, pulledTip.y, u) };
  } else {
    const u = easeInQuad(clamp01((t - PULL_TIME) / (THROW_TIME - PULL_TIME)));
    const land = toScreen(landing);
    tip = { x: lerp(pulledTip.x, land.x, u), y: lerp(pulledTip.y, land.y, u) };
  }
  return { tip, knob: { x: tip.x, y: tip.y - TOP * 0.9 } };
}

// ---------- drawing ----------

const BANDS: RGB[] = [
  [255, 63, 164],
  [255, 210, 63],
  [25, 211, 197],
  [230, 57, 70],
];
const AVG: RGB = BANDS.reduce<RGB>((acc, c) => [acc[0] + c[0] / 4, acc[1] + c[1] / 4, acc[2] + c[2] / 4], [0, 0, 0]);

function mix(a: RGB, b: RGB, t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function bodyPath(h: number) {
  ctx.beginPath();
  ctx.moveTo(-h * 0.03, -h * 0.12);
  ctx.bezierCurveTo(-h * 0.25, -h * 0.3, -h * 0.36, -h * 0.62, -h * 0.3, -h * 0.78);
  ctx.quadraticCurveTo(0, -h * 0.86, h * 0.3, -h * 0.78);
  ctx.bezierCurveTo(h * 0.36, -h * 0.62, h * 0.25, -h * 0.3, h * 0.03, -h * 0.12);
  ctx.closePath();
}

function drawShadow(x: number, y: number, h: number, lean: number, lift = 0) {
  ctx.save();
  ctx.fillStyle = `rgba(30, 10, 5, ${0.4 * (1 - lift * 0.6)})`;
  ctx.beginPath();
  const k = 1 - lift * 0.45;
  ctx.ellipse(x + Math.sin(lean) * h * 0.45, y, h * (0.28 + Math.abs(Math.sin(lean)) * 0.25) * k, h * 0.07 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawString(from: Vec, to: Vec, slack: number) {
  ctx.save();
  ctx.strokeStyle = '#f7f1e3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  const mx = (from.x + to.x) / 2 + slack;
  const my = (from.y + to.y) / 2;
  ctx.quadraticCurveTo(mx, my, to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

type TopLook = { lean: number; spin: number; blur: number; coils: number; squash?: number };

function drawTop(x: number, y: number, h: number, look: TopLook) {
  const { lean, spin, blur, coils } = look;
  const squash = look.squash ?? 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.scale(1 + squash * 0.6, 1 - squash);

  // Iron nail (the "kil").
  const nail = ctx.createLinearGradient(-h * 0.03, 0, h * 0.03, 0);
  nail.addColorStop(0, '#555');
  nail.addColorStop(0.5, '#ddd');
  nail.addColorStop(1, '#444');
  ctx.fillStyle = nail;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-h * 0.028, -h * 0.05);
  ctx.lineTo(-h * 0.028, -h * 0.15);
  ctx.lineTo(h * 0.028, -h * 0.15);
  ctx.lineTo(h * 0.028, -h * 0.05);
  ctx.closePath();
  ctx.fill();

  // Painted wooden body: bands wrapped on a cylinder so rotation reads as 3D.
  ctx.save();
  bodyPath(h);
  ctx.clip();
  const r = h * 0.36;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + spin;
    const a1 = ((i + 1) / n) * Math.PI * 2 + spin;
    if (Math.cos((a0 + a1) / 2) <= 0) continue;
    const x0 = r * Math.sin(a0);
    const x1 = r * Math.sin(a1);
    ctx.fillStyle = mix(BANDS[i % BANDS.length], AVG, blur);
    ctx.fillRect(Math.min(x0, x1) - 0.5, -h, Math.abs(x1 - x0) + 1, h);
  }
  const shade = ctx.createLinearGradient(-r, 0, r, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.45)');
  shade.addColorStop(0.3, 'rgba(255,255,255,0.2)');
  shade.addColorStop(0.65, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(-r, -h, r * 2, h);
  // String grooves, and the wound string on top of them.
  for (let i = 0; i < 7; i++) {
    const gy = -h * (0.3 + i * 0.055);
    ctx.fillStyle = i < coils ? '#f7f1e3' : 'rgba(40,10,20,0.35)';
    ctx.fillRect(-r, gy, r * 2, i < coils ? h * 0.022 : h * 0.01);
  }
  ctx.restore();

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2a0f3d';
  bodyPath(h);
  ctx.stroke();

  // Crown and knob.
  ctx.fillStyle = mix([255, 210, 63], AVG, blur * 0.5);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.8, h * 0.29, h * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#b5552f';
  ctx.fillRect(-h * 0.06, -h * 0.9, h * 0.12, h * 0.1);
  ctx.strokeRect(-h * 0.06, -h * 0.9, h * 0.12, h * 0.1);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.9, h * 0.06, h * 0.02, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#d9774a';
  ctx.fill();
  ctx.stroke();

  // Speed streaks wrapping the body.
  if (blur > 0.25) {
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = spin * 0.13 + i * 2.1;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(blur - 0.25) * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -h * (0.45 + i * 0.12), h * (0.42 - i * 0.03), h * 0.08, 0, a, a + 1.3);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawChalkCircle() {
  ctx.save();
  ctx.lineCap = 'round';
  const red = outFlash > 0 && Math.floor(outFlash * 10) % 2 === 0;
  for (let pass = 0; pass < 3; pass++) {
    ctx.strokeStyle = red ? `rgba(255, 70, 90, ${0.9 - pass * 0.2})` : `rgba(255, 255, 250, ${0.55 - pass * 0.12})`;
    ctx.lineWidth = Math.max(2, R * 0.018) - pass;
    ctx.beginPath();
    ctx.ellipse(CX + pass * 1.5, CY - pass, R, R * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrail() {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  for (let i = 1; i < trail.length; i++) {
    const a = toScreen(trail[i - 1]);
    const b = toScreen(trail[i]);
    ctx.strokeStyle = `rgba(35, 10, 5, ${(i / trail.length) * 0.45})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMeter(t: number) {
  const w = Math.min(R * 1.4, W - 32);
  const h = 22;
  const x = CX - w / 2;
  const y = Math.min(CY + R * 0.5 + 36, H - 130);
  const wind = Math.min(1, t / WIND_TIME);
  const m = meterValue(t);
  const inGreen = Math.abs(m - SWEET) < 0.07;

  ctx.save();
  ctx.fillStyle = '#2a0f3d';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#e63946');
  grad.addColorStop(0.55, '#ffd23f');
  grad.addColorStop(1, '#ffd23f');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  const pulse = 0.75 + 0.25 * Math.sin(clock * 12);
  ctx.fillStyle = `rgba(107, 255, 107, ${pulse})`;
  if (inGreen && wind >= 1) {
    ctx.shadowColor = '#6bff6b';
    ctx.shadowBlur = 18;
  }
  ctx.fillRect(x + w * (SWEET - 0.07), y, w * 0.14, h);
  ctx.shadowBlur = 0;

  // Needle.
  const nx = x + w * m;
  ctx.fillStyle = inGreen ? '#6bff6b' : '#fff7d6';
  ctx.fillRect(nx - 3, y - 10, 6, h + 20);
  ctx.strokeStyle = '#2a0f3d';
  ctx.lineWidth = 2;
  ctx.strokeRect(nx - 3, y - 10, 6, h + 20);

  // Wind bar.
  ctx.fillStyle = '#2a0f3d';
  ctx.fillRect(x - 4, y + h + 12, w + 8, 12);
  ctx.fillStyle = wind >= 1 ? (Math.floor(clock * 8) % 2 ? '#19d3c5' : '#6bfff0') : '#ff3fa4';
  ctx.fillRect(x, y + h + 14, w * wind, 8);

  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillStyle = '#fff7d6';
  ctx.textAlign = 'center';
  ctx.fillText(wind >= 1 ? 'FULLY WOUND - RELEASE IN GREEN!' : 'WINDING STRING...', CX, y + h + 44);
  ctx.restore();
}

function draw() {
  ctx.save();
  shake.apply(ctx);
  if (floor) ctx.drawImage(floor, 0, 0, W, H);
  drawChalkCircle();
  drawTrail();

  // Colours smear together at speed, but never fully to grey.
  const blur = 0.7 * clamp01((rpm - 200) / 900);

  if (phase === 'ready' || phase === 'winding') {
    const wind = phase === 'winding' ? Math.min(1, holdTime / WIND_TIME) : 0;
    const pose = handPose();
    drawShadow(CX, CY, TOP, 0, 1);
    drawString(anchor(), pose.knob, 0);
    // Winding turns the top backwards, one groove at a time.
    drawTop(pose.tip.x, pose.tip.y, TOP, { lean: pose.lean, spin: 0.3 - wind * 7, blur: 0, coils: Math.round(wind * 7) });
    if (phase === 'winding') drawMeter(holdTime);
  } else if (phase === 'throwing') {
    const pose = throwPose(throwT);
    const land = toScreen(landing);
    const drop = clamp01((throwT - PULL_TIME) / (THROW_TIME - PULL_TIME));
    drawShadow(land.x, land.y, TOP, 0, 1 - drop);
    if (throwT < PULL_TIME) {
      drawString(anchor(), pose.knob, 0);
    } else {
      // Released string whips back up to the hand.
      const u = easeOutQuad(clamp01((throwT - PULL_TIME) / 0.25));
      const end = { x: lerp(releaseKnob.x, CX, u), y: lerp(releaseKnob.y, -20, u) };
      if (u < 1) drawString(anchor(), end, Math.sin(throwT * 60) * 30 * (1 - u));
    }
    const coils = throwT < PULL_TIME ? 7 : Math.round(7 * (1 - drop));
    drawTop(pose.tip.x, pose.tip.y, TOP, { lean: 0, spin: spinPhase, blur, coils });
  } else {
    const p = toScreen(pos);
    let lean = tilt * Math.cos(precession);
    let tipX = p.x;
    let tipY = p.y;
    if (phase === 'spinning') {
      // Tiny hops as the wobble rattles the nail.
      tipY -= Math.abs(Math.sin(precession * 2)) * tilt * TOP * 0.08;
    } else {
      const t = clamp01(fallT / 0.55);
      lean = lerp(fallFrom, fallDir * FALL_LEAN, easeOutBounce(t));
      if (fallT > 0.55) lean += fallDir * 0.12 * Math.sin((fallT - 0.55) * 14) * Math.exp(-(fallT - 0.55) * 4);
      tipX -= fallDir * TOP * 0.3 * easeOutQuad(t);
    }
    const s = squashT < 0.5 ? 0.22 * Math.exp(-squashT * 10) * Math.cos(squashT * 32) : 0;
    drawShadow(tipX, p.y, TOP, lean);
    drawTop(tipX, tipY, TOP, { lean, spin: spinPhase, blur, coils: 0, squash: s });

    if (phase === 'spinning' && rpm < 500) {
      ctx.save();
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = Math.floor(clock * 5) % 2 ? '#ff3fa4' : '#fff7d6';
      ctx.fillText('WOBBLING!', p.x, p.y - TOP * 1.1);
      ctx.restore();
    }
  }

  fx.draw(ctx);
  ctx.restore();
}

// ---------- helpers ----------

function setMessage(html: string) {
  messageEl.innerHTML = html;
}

function bump(el: HTMLElement) {
  el.classList.remove('bump');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('bump');
}

// ---------- input ----------

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
  if (e.key === ' ' && !e.repeat) press();
  if (e.key === 'm' || e.key === 'M') sfx.muted = !sfx.muted;
  keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') release();
  keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
});

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointerDown = true;
  pointerWorld = toWorld(e.clientX, e.clientY);
  press();
});

canvas.addEventListener('pointermove', (e) => {
  if (pointerDown) pointerWorld = toWorld(e.clientX, e.clientY);
});

const pointerUp = () => {
  pointerDown = false;
  pointerWorld = null;
  release();
};
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);

window.addEventListener('blur', () => {
  keys.clear();
  pointerUp();
});

// ---------- boot ----------

window.addEventListener('resize', resize);
resize();
setMessage('<span class="big">GHUMA KE DIKHAO!</span><span class="blink">HOLD SPACE OR PRESS TO WIND</span>');

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
