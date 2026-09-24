// Pittu (seven stones) — a 90s gali game.
// Knock the stack down with the ball, then restack the stones biggest-first
// while the fielders try to hit you. Fielders can't run with the ball, so they
// pass it around and throw from where they stand.

import { CONFETTI, Particles, Sfx, Shake, clamp01, easeOutBack, lerp, loadNumber, rand, saveNumber } from '../shared/fx';

type Phase = 'aim' | 'thrown' | 'run' | 'pittu' | 'out';
type Vec = { x: number; y: number };

type Stone = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  color: string;
  flyT: number; // >= 0 while flying from the player's hands onto the stack
  from: Vec & { z: number };
  settle: number; // time since it landed on the stack (for a little squash)
};

type Kid = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  faceX: number;
  faceY: number;
  walk: number;
  shirt: string;
  hasBall: boolean;
  holdT: number;
  windup: number; // > 0 while winding up a throw at the player
  aim: Vec;
  cooldown: number; // can't re-catch right after throwing
  throwAnim: number;
  home: Vec;
};

type Ball = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  held: 'player' | number | null; // player, fielder index, or loose
  thrower: 'player' | 'fielder' | 'pass' | null;
  passTo: number;
};

// World units: the field is FW x FH, everything else is scaled from that.
const FH = 11;
const G = 14; // gravity
const THICK = 0.21; // stone thickness
const STONE_R = [0.62, 0.56, 0.5, 0.45, 0.4, 0.35, 0.3];
const STONE_COLORS = ['#8d8779', '#a09a8b', '#7c776c', '#aaa392', '#8f897a', '#9d9684', '#b6ae9c'];
const BALL_R = 0.2;
const KID_R = 0.36;
const PLAYER_SPEED = 4.3;
const STACK_ZONE = 1.15;
const THROW_RANGE = 7.5;
const AIM_LOCK = 0.25; // fielder's aim freezes this long before release
const MIN_FLIGHT = 0.4; // no point-blank throws: every throw takes at least this long
const BEST_KEY = 'pittu.best';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const scoreEl = document.getElementById('score')!;
const bestEl = document.getElementById('best')!;
const messageEl = document.getElementById('message')!;

const fx = new Particles();
const shake = new Shake();
const sfx = new Sfx();

// ---------- state ----------

let FW = 16;
let phase: Phase = 'aim';
let round = 0;
let chances = 3;
let score = 0;
let best = loadNumber(BEST_KEY);
let phaseT = 0;
let clock = 0;
let hitstop = 0;
let slowmo = 0;
let msgUntil = 0;
let introShown = true;
let newBest = false;
let outAt = 0;

let stack: Vec = { x: 8, y: 4 };
let stones: Stone[] = [];
let stacked = 7;
let carrying = -1;
let player: Kid;
let fielders: Kid[] = [];
let ball: Ball;
let playerDown = 0; // > 0 once hit, drives the knocked-over animation

// Aiming.
let aimAngle = -Math.PI / 2;
let charging = false;
let chargeT = 0;
let drag: { start: Vec; now: Vec } | null = null;

// Input.
const keys = new Set<string>();
let pointerDown = false;
let pointerWorld: Vec | null = null;

// Layout.
let W = 0;
let H = 0;
let SC = 40; // px per world unit
let OX = 0;
let OY = 0;
let ground: HTMLCanvasElement | null = null;

// ---------- difficulty ----------

const fielderCount = () => Math.min(4, 2 + Math.floor(round / 2));
const fielderSpeed = () => Math.min(3.9, 2.5 + 0.3 * round);
const windupTime = () => Math.max(0.38, 0.7 - 0.06 * round);
const throwSpeed = () => Math.min(15, 10 + 0.8 * round);

// ---------- layout ----------

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout();
}

function layout() {
  const top = 84;
  const bottom = 64;
  SC = Math.min((W - 24) / FW, (H - top - bottom) / FH);
  OX = (W - FW * SC) / 2;
  OY = top + (H - top - bottom - FH * SC) / 2;
  ground = makeGround();
}

function pickFieldWidth() {
  const aspect = (W - 24) / Math.max(1, H - 148);
  FW = Math.max(8, Math.min(18, aspect * FH));
}

const sx = (x: number) => OX + x * SC;
const sy = (y: number, z = 0) => OY + (y - z) * SC;
const toWorld = (px: number, py: number): Vec => ({ x: (px - OX) / SC, y: (py - OY) / SC });

// A dusty 90s gali: packed mud, a brick wall at the back, chalk lines.
function makeGround(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a1f14';
  g.fillRect(0, 0, W, H);

  // Brick wall behind the field.
  const wallH = Math.max(OY, 20);
  const bw = Math.max(26, SC * 0.9);
  const bh = bw * 0.38;
  for (let row = 0; row * bh < wallH; row++) {
    for (let col = -1; col * bw < W; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      const shade = 120 + Math.floor(Math.random() * 30);
      g.fillStyle = `rgb(${shade + 40}, ${shade * 0.4}, ${shade * 0.3})`;
      g.fillRect(x + 1, wallH - (row + 1) * bh + 1, bw - 2, bh - 2);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, wallH - 6, W, 6);

  // Mud field.
  const fx0 = OX;
  const fy0 = OY;
  const fw = FW * SC;
  const fh = FH * SC;
  g.fillStyle = '#8a5a34';
  g.fillRect(fx0, fy0, fw, fh);
  const specks = ['#7a4e2c', '#96643c', '#6e4527', '#a8744a'];
  const n = Math.floor((fw * fh) / 60);
  for (let i = 0; i < n; i++) {
    g.fillStyle = specks[i % specks.length];
    const s = 1 + Math.random() * 3;
    g.fillRect(fx0 + Math.random() * fw, fy0 + Math.random() * fh, s, s);
  }
  // Pebbles and grass tufts near the edges.
  for (let i = 0; i < 40; i++) {
    const edge = Math.random() < 0.5;
    const x = fx0 + (edge ? (Math.random() < 0.5 ? rand(0, SC) : fw - rand(0, SC)) : rand(0, fw));
    const y = fy0 + (edge ? rand(0, fh) : fh - rand(0, SC * 0.8));
    g.strokeStyle = '#5f7a2e';
    g.lineWidth = 2;
    for (let b = -2; b <= 2; b++) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + b * 3, y - rand(5, 11));
      g.stroke();
    }
  }
  // Tree shade in one corner.
  const shadeG = g.createRadialGradient(fx0 + fw * 0.9, fy0 + fh * 0.15, 0, fx0 + fw * 0.9, fy0 + fh * 0.15, fh * 0.5);
  shadeG.addColorStop(0, 'rgba(20, 30, 10, 0.35)');
  shadeG.addColorStop(1, 'rgba(20, 30, 10, 0)');
  g.fillStyle = shadeG;
  g.fillRect(fx0, fy0, fw, fh);
  // Edge vignette.
  g.strokeStyle = 'rgba(40, 20, 10, 0.6)';
  g.lineWidth = 6;
  g.strokeRect(fx0 + 3, fy0 + 3, fw - 6, fh - 6);

  // Chalk: stack circle and throw line.
  g.strokeStyle = 'rgba(255, 252, 240, 0.7)';
  g.lineWidth = 3;
  g.setLineDash([]);
  g.beginPath();
  g.ellipse(fx0 + stack.x * SC, fy0 + stack.y * SC, STACK_ZONE * SC, STACK_ZONE * SC * 0.8, 0, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([14, 10]);
  g.beginPath();
  g.moveTo(fx0 + SC, fy0 + throwLineY() * SC);
  g.lineTo(fx0 + fw - SC, fy0 + throwLineY() * SC);
  g.stroke();
  g.setLineDash([]);
  return c;
}

const throwLineY = () => FH - 1.9;

// ---------- setup ----------

function makeKid(x: number, y: number, shirt: string): Kid {
  return { x, y, vx: 0, vy: 0, faceX: 0, faceY: 1, walk: 0, shirt, hasBall: false, holdT: 0, windup: 0, aim: { x, y }, cooldown: 0, throwAnim: 0, home: { x, y } };
}

function buildStack() {
  stones = STONE_R.map((r, i) => ({
    x: stack.x + rand(-0.04, 0.04),
    y: stack.y + rand(-0.03, 0.03),
    z: i * THICK,
    vx: 0,
    vy: 0,
    vz: 0,
    r,
    color: STONE_COLORS[i],
    flyT: -1,
    from: { x: 0, y: 0, z: 0 },
    settle: 9,
  }));
  stacked = 7;
  carrying = -1;
}

function fielderHomes(n: number): Vec[] {
  const out: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const spread = Math.min(2.8, (FW - 3) / Math.max(1, n));
    out.push({ x: stack.x + (k - (n - 1) / 2) * spread, y: Math.max(1.1, stack.y - 2.3 + (k % 2) * 0.7) });
  }
  return out;
}

function newGame() {
  pickFieldWidth();
  stack = { x: FW / 2, y: FH * 0.4 };
  layout();
  round = 0;
  score = 0;
  newBest = false;
  playerDown = 0;
  player = makeKid(FW / 2, FH - 1.1, '#19d3c5');
  newRound();
}

function newRound() {
  chances = 3;
  buildStack();
  const homes = fielderHomes(fielderCount());
  const shirts = ['#ff3fa4', '#ff8c2b', '#8b5cf6', '#e63946'];
  // Keep existing fielders (they walked back during the celebration), add new ones.
  fielders = homes.map((h, k) => {
    const f = fielders[k] ?? makeKid(h.x, -1, shirts[k % shirts.length]);
    f.home = h;
    f.hasBall = false;
    f.windup = 0;
    return f;
  });
  resetThrow();
}

function resetThrow() {
  phase = 'aim';
  phaseT = 0;
  aimAngle = -Math.PI / 2;
  charging = false;
  drag = null;
  // A new spot on the throw line every chance, so aiming matters.
  player.x = FW / 2 + rand(-0.3, 0.3) * (FW - 2);
  player.y = FH - 1.1;
  player.vx = player.vy = 0;
  player.faceX = 0;
  player.faceY = -1;
  ball = { x: player.x, y: player.y, z: 0.9, vx: 0, vy: 0, vz: 0, held: 'player', thrower: null, passTo: -1 };
  for (const f of fielders) f.hasBall = false;
}

// ---------- messages ----------

function setMessage(html: string, seconds = 0) {
  messageEl.innerHTML = html;
  msgUntil = seconds ? clock + seconds : 0;
}

function bump(el: HTMLElement) {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function introMessage() {
  setMessage(
    '<span class="big">PITTU!</span>' +
      '<span class="sub">KNOCK DOWN THE 7 STONES\nRESTACK THEM BIG → SMALL\nDON\'T GET HIT BY THE BALL</span>' +
      '\n<span class="blink">DRAG BACK &amp; RELEASE TO THROW</span>',
  );
}

// ---------- player throw ----------

const pingPong = (t: number) => {
  const u = (t * 1.1) % 2;
  return u < 1 ? u : 2 - u;
};

function currentPower(): number {
  if (drag) return clamp01(Math.hypot(drag.start.x - drag.now.x, drag.start.y - drag.now.y) / 3);
  if (charging) return pingPong(chargeT);
  return 0.5;
}

function currentAim(): number {
  if (drag && Math.hypot(drag.start.x - drag.now.x, drag.start.y - drag.now.y) > 0.2) {
    return clampAim(Math.atan2(drag.start.y - drag.now.y, drag.start.x - drag.now.x));
  }
  return aimAngle;
}

// Only allow throwing forwards.
function clampAim(a: number): number {
  if (a > 0) a = a > Math.PI / 2 ? -Math.PI + 0.15 : -0.15;
  return Math.max(-Math.PI + 0.15, Math.min(-0.15, a));
}

function playerThrow(angle: number, power: number) {
  const speed = 7 + 10 * power;
  ball.held = null;
  ball.thrower = 'player';
  ball.x = player.x + Math.cos(angle) * 0.3;
  ball.y = player.y + Math.sin(angle) * 0.3;
  ball.z = 0.9;
  ball.vx = Math.cos(angle) * speed;
  ball.vy = Math.sin(angle) * speed;
  ball.vz = 2.2;
  player.throwAnim = 0.3;
  player.faceX = Math.cos(angle);
  player.faceY = Math.sin(angle);
  phase = 'thrown';
  phaseT = 0;
  sfx.noise(0.15, 0.3, 3000);
  hideIntro();
}

function hideIntro() {
  if (introShown) {
    introShown = false;
    setMessage('');
  }
}

// ---------- knock & stacking ----------

function knockStack() {
  const dir = Math.atan2(ball.vy, ball.vx);
  const power = Math.hypot(ball.vx, ball.vy);
  for (let i = 0; i < stones.length; i++) {
    const s = stones[i];
    const a = dir + rand(-1.2, 1.2);
    const sp = (2.5 + rand(0, 3.5)) * (0.6 + power / 16);
    s.vx = Math.cos(a) * sp;
    s.vy = Math.sin(a) * sp;
    s.vz = 2 + rand(0, 3.5) + i * 0.35;
  }
  stacked = 0;
  // Ball deflects off the stack and loses most of its speed.
  ball.vx = -ball.vx * 0.25 + rand(-1, 1);
  ball.vy = -ball.vy * 0.25 + rand(-1, 1);
  ball.vz = Math.abs(ball.vz) + 2;
  ball.thrower = null;

  phase = 'run';
  phaseT = 0;
  hitstop = 0.09;
  slowmo = 0.55;
  shake.kick(12);
  sfx.noise(0.25, 0.8, 1800);
  sfx.tone(140, 0.3, 0.2, 'triangle', 60);
  const px = sx(stack.x);
  const py = sy(stack.y);
  fx.ring(px, py, SC * 2.2, 'rgba(255, 245, 220, 0.9)', 0.5);
  fx.burst(px, py - SC * 0.4, { count: 30, speed: [120, 360], size: [2, 6], life: [0.4, 0.9], colors: ['#d8b48a', '#b88a5e', '#fff1d0'], drag: 4, squashY: 0.6 });
  fx.burst(px, py - SC * 0.6, { count: 12, speed: [150, 300], size: [3, 5], life: [0.3, 0.5], colors: ['#fff7d6', '#ffd23f'], shape: 'square', drag: 3 });
  setMessage('<span class="big">BHAAGO!</span><span class="sub">RESTACK THEM, BIGGEST FIRST</span>', 1.4);
}

// Index of the next stone the stack needs, accounting for one mid-flight.
function nextStone(): number {
  const flying = stones.some((s) => s.flyT >= 0);
  return stacked + (flying ? 1 : 0);
}

function deliverStone() {
  const i = carrying;
  const s = stones[i];
  carrying = -1;
  s.flyT = 0;
  s.from = { x: player.x, y: player.y, z: 1.35 };
  sfx.tone(520, 0.08, 0.08, 'square', 780);
}

function stoneLanded(i: number) {
  const s = stones[i];
  s.flyT = -1;
  s.x = stack.x + rand(-0.05, 0.05);
  s.y = stack.y + rand(-0.04, 0.04);
  s.z = i * THICK;
  s.vx = s.vy = s.vz = 0;
  s.settle = 0;
  stacked = i + 1;
  sfx.noise(0.05, 0.5, 5000);
  sfx.tone(300 + i * 70, 0.1, 0.12, 'square');
  shake.kick(3);
  const px = sx(s.x);
  const py = sy(s.y, s.z);
  fx.burst(px, py, { count: 8, speed: [60, 140], size: [2, 4], life: [0.2, 0.45], colors: ['#d8b48a', '#fff1d0'], drag: 5, squashY: 0.5 });
  if (stacked === 7) winRound();
}

function winRound() {
  score += 1;
  bump(scoreEl);
  if (score > best) {
    best = score;
    newBest = true;
    saveNumber(BEST_KEY, best);
  }
  phase = 'pittu';
  phaseT = 0;
  for (const f of fielders) {
    f.hasBall = false;
    f.windup = 0;
  }
  ball.held = null;
  ball.thrower = null;
  sfx.jingle([523, 659, 784, 1047, 1319]);
  shake.kick(6);
  for (let i = 0; i < 5; i++) {
    fx.burst(rand(0, W), -10, { count: 22, speed: [40, 220], size: [5, 9], life: [1.8, 2.8], colors: CONFETTI, gravity: 260, drag: 1.5, shape: 'square', angle: [0, Math.PI] });
  }
  fx.burst(sx(stack.x), sy(stack.y, 1.3), { count: 26, speed: [150, 320], size: [3, 6], life: [0.6, 1.1], colors: CONFETTI, shape: 'square', gravity: 300 });
  setMessage(`<span class="big">PITTU!!!</span><span class="sub">ROUND ${round + 1} CLEARED</span>`, 2.2);
}

function playerHit() {
  phase = 'out';
  phaseT = 0;
  playerDown = 0.001;
  const k = 1 / Math.max(0.01, Math.hypot(ball.vx, ball.vy));
  player.vx = ball.vx * k * 5;
  player.vy = ball.vy * k * 5;
  ball.vx *= -0.3;
  ball.vy *= -0.3;
  ball.vz = 4;
  ball.thrower = null;
  if (carrying >= 0) {
    const s = stones[carrying];
    s.x = player.x;
    s.y = player.y;
    s.z = 1.3;
    s.vx = rand(-2, 2);
    s.vy = rand(-2, 2);
    s.vz = 3;
    carrying = -1;
  }
  hitstop = 0.12;
  slowmo = 0.6;
  shake.kick(14);
  sfx.noise(0.2, 0.7, 2500);
  sfx.tone(600, 0.5, 0.15, 'square', 90);
  fx.burst(sx(player.x), sy(player.y, 0.8), { count: 16, speed: [100, 260], size: [3, 6], life: [0.4, 0.8], colors: ['#ffd23f', '#fff7d6'], shape: 'square', drag: 3 });
  gameOver('HIT BY THE BALL');
}

function gameOver(reason: string) {
  phase = 'out';
  outAt = performance.now();
  if (newBest) sfx.jingle();
  setMessage(
    `<span class="big">OUT!</span>` +
      `<span class="sub">${reason}\n${score} PITTU${score === 1 ? '' : 'S'}${newBest ? ' · NEW BEST!' : ''}</span>` +
      `\n<span class="blink">PRESS TO PLAY AGAIN</span>`,
  );
}

// ---------- fielder AI ----------

function fielderThrow(f: Kid) {
  const target = f.aim;
  const dx = target.x - f.x;
  const dy = target.y - f.y;
  const dist = Math.max(0.5, Math.hypot(dx, dy));
  const speed = Math.min(throwSpeed(), dist / MIN_FLIGHT);
  const t = dist / speed;
  ball.held = null;
  ball.thrower = 'fielder';
  ball.passTo = -1;
  ball.x = f.x;
  ball.y = f.y;
  ball.z = 1.0;
  ball.vx = (dx / dist) * speed;
  ball.vy = (dy / dist) * speed;
  ball.vz = (0.5 - 1.0 + 0.5 * G * t * t) / t; // arrives at knee height
  f.hasBall = false;
  f.cooldown = 0.4;
  f.throwAnim = 0.3;
  sfx.noise(0.12, 0.35, 3500);
}

function fielderPass(from: Kid, to: number) {
  const r = fielders[to];
  const dx = r.x - from.x;
  const dy = r.y - from.y;
  const dist = Math.max(0.5, Math.hypot(dx, dy));
  const t = Math.max(0.35, dist / 9);
  ball.held = null;
  ball.thrower = 'pass';
  ball.passTo = to;
  ball.x = from.x;
  ball.y = from.y;
  ball.z = 1.0;
  ball.vx = dx / t;
  ball.vy = dy / t;
  ball.vz = 0.5 * G * t;
  from.hasBall = false;
  from.cooldown = 0.4;
  from.throwAnim = 0.25;
  sfx.noise(0.08, 0.2, 3000);
}

function predictPlayer(from: Kid): Vec {
  const d = Math.hypot(player.x - from.x, player.y - from.y);
  const t = Math.max(MIN_FLIGHT, d / throwSpeed());
  return { x: player.x + player.vx * t * 0.6, y: player.y + player.vy * t * 0.6 };
}

function updateFielders(dt: number) {
  const active = phase === 'run' && phaseT > 0.7;
  const speed = fielderSpeed();
  const ballLoose = ball.held === null && ball.thrower !== 'pass' && ball.thrower !== 'fielder';

  // Who chases a loose ball: the nearest fielder.
  let chaser = -1;
  if (active && ballLoose) {
    let bestD = Infinity;
    fielders.forEach((f, k) => {
      const d = Math.hypot(f.x - ball.x, f.y - ball.y);
      if (d < bestD) {
        bestD = d;
        chaser = k;
      }
    });
  }

  fielders.forEach((f, k) => {
    f.cooldown = Math.max(0, f.cooldown - dt);
    f.throwAnim = Math.max(0, f.throwAnim - dt);
    let target: Vec | null = null;

    if (!active) {
      target = f.home;
    } else if (f.hasBall) {
      f.holdT += dt;
      faceTowards(f, player.x, player.y);
      if (f.windup > 0) {
        f.windup -= dt;
        if (f.windup > AIM_LOCK) f.aim = predictPlayer(f); // aim locks just before release
        if (f.windup <= 0) fielderThrow(f);
      } else if (f.holdT > 0.3) {
        const d = Math.hypot(player.x - f.x, player.y - f.y);
        if (d < THROW_RANGE) {
          f.windup = windupTime();
          f.aim = predictPlayer(f);
          sfx.tone(990, 0.06, 0.06, 'square');
        } else {
          // Too far: pass to whoever is closest to the player.
          let to = -1;
          let bestD = d - 1.5;
          fielders.forEach((o, j) => {
            if (j === k) return;
            const od = Math.hypot(player.x - o.x, player.y - o.y);
            if (od < bestD) {
              bestD = od;
              to = j;
            }
          });
          if (to >= 0) fielderPass(f, to);
          else f.holdT = 0;
        }
      }
    } else if (ball.passTo === k && ball.thrower === 'pass') {
      faceTowards(f, ball.x, ball.y);
    } else if (k === chaser) {
      target = { x: ball.x, y: ball.y };
    } else {
      // Circle the player at a distance, spread out by index.
      const a = (k / fielders.length) * Math.PI * 2 + clock * 0.25;
      target = { x: player.x + Math.cos(a) * 3.4, y: player.y + Math.sin(a) * 2.6 };
    }

    if (target && !f.hasBall) moveKid(f, target, speed, dt);
    else slowKid(f, dt);

    // Catch the ball.
    if (active && !f.hasBall && ball.held === null && f.cooldown === 0 && ball.thrower !== 'fielder' && ball.z < 1.7) {
      if (Math.hypot(ball.x - f.x, ball.y - f.y) < KID_R + BALL_R + 0.15) {
        ball.held = k;
        ball.thrower = null;
        ball.passTo = -1;
        f.hasBall = true;
        f.holdT = 0;
        f.windup = 0;
        sfx.tone(260, 0.05, 0.08, 'triangle');
      }
    }
  });

  // Keep kids from overlapping.
  const all = [player, ...fielders];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = KID_R * 2;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
  }
}

function faceTowards(k: Kid, x: number, y: number) {
  const d = Math.hypot(x - k.x, y - k.y);
  if (d > 0.01) {
    k.faceX = (x - k.x) / d;
    k.faceY = (y - k.y) / d;
  }
}

function moveKid(k: Kid, target: Vec, speed: number, dt: number) {
  const dx = target.x - k.x;
  const dy = target.y - k.y;
  const d = Math.hypot(dx, dy);
  const want = d > 0.25 ? speed : 0;
  const vx = d > 0.001 ? (dx / d) * want : 0;
  const vy = d > 0.001 ? (dy / d) * want : 0;
  steerKid(k, vx, vy, dt);
}

function slowKid(k: Kid, dt: number) {
  steerKid(k, 0, 0, dt);
}

function steerKid(k: Kid, vx: number, vy: number, dt: number) {
  const s = 1 - Math.exp(-12 * dt);
  k.vx += (vx - k.vx) * s;
  k.vy += (vy - k.vy) * s;
  k.x = Math.max(0.4, Math.min(FW - 0.4, k.x + k.vx * dt));
  k.y = Math.max(0.5, Math.min(FH - 0.4, k.y + k.vy * dt));
  const sp = Math.hypot(k.vx, k.vy);
  if (sp > 0.3) {
    k.faceX = k.vx / sp;
    k.faceY = k.vy / sp;
    const before = Math.floor(k.walk / Math.PI);
    k.walk += sp * dt * 3.2;
    // Little dust kick on every step.
    if (Math.floor(k.walk / Math.PI) !== before && sp > 2) {
      fx.burst(sx(k.x), sy(k.y), { count: 2, speed: [10, 40], size: [2, 3.5], life: [0.25, 0.45], colors: ['#b88a5e', '#d8b48a'], drag: 4, squashY: 0.4 });
    }
  } else {
    k.walk = 0;
  }
}

// ---------- player ----------

function updatePlayer(dt: number) {
  player.throwAnim = Math.max(0, player.throwAnim - dt);
  if (phase === 'out') {
    playerDown += dt;
    const s = Math.exp(-5 * dt);
    player.vx *= s;
    player.vy *= s;
    player.x = Math.max(0.4, Math.min(FW - 0.4, player.x + player.vx * dt));
    player.y = Math.max(0.5, Math.min(FH - 0.4, player.y + player.vy * dt));
    return;
  }
  if (phase === 'pittu') {
    moveKid(player, { x: FW / 2, y: FH - 1.1 }, PLAYER_SPEED * 0.8, dt);
    return;
  }
  if (phase !== 'run') {
    slowKid(player, dt);
    player.faceX = Math.cos(currentAim()) * 0.5;
    player.faceY = -1;
    return;
  }

  let mx = 0;
  let my = 0;
  if (keys.has('ArrowLeft') || keys.has('a')) mx -= 1;
  if (keys.has('ArrowRight') || keys.has('d')) mx += 1;
  if (keys.has('ArrowUp') || keys.has('w')) my -= 1;
  if (keys.has('ArrowDown') || keys.has('s')) my += 1;
  if (pointerDown && pointerWorld) {
    const dx = pointerWorld.x - player.x;
    const dy = pointerWorld.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.25) {
      mx += dx / d;
      my += dy / d;
    }
  }
  const len = Math.hypot(mx, my);
  const speed = PLAYER_SPEED * (carrying >= 0 ? 0.88 : 1);
  steerKid(player, len ? (mx / len) * speed : 0, len ? (my / len) * speed : 0, dt);

  // Pick up the next stone, or drop it onto the stack.
  const next = nextStone();
  if (carrying < 0 && next < 7) {
    const s = stones[next];
    if (s.flyT < 0 && s.z < 0.05 && Math.hypot(s.x - player.x, s.y - player.y) < KID_R + s.r) {
      carrying = next;
      sfx.tone(440, 0.07, 0.08, 'square', 660);
      fx.burst(sx(s.x), sy(s.y), { count: 6, speed: [40, 90], size: [2, 3], life: [0.2, 0.4], colors: ['#fff7d6'], shape: 'square' });
    }
  }
  if (carrying >= 0 && Math.hypot(player.x - stack.x, player.y - stack.y) < STACK_ZONE) deliverStone();
}

// ---------- physics ----------

function updateBall(dt: number) {
  if (ball.held === 'player') {
    const bob = phase === 'aim' ? Math.sin(clock * 3) * 0.05 : 0;
    ball.x = player.x + 0.3;
    ball.y = player.y - 0.05;
    ball.z = 0.85 + bob;
    return;
  }
  if (typeof ball.held === 'number') {
    const f = fielders[ball.held];
    const up = f.windup > 0 ? 1.45 : 0.85;
    ball.x = f.x + f.faceX * 0.25;
    ball.y = f.y + 0.01;
    ball.z = up;
    return;
  }

  ball.vz -= G * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  if (ball.z <= 0) {
    ball.z = 0;
    if (ball.vz < -2) {
      ball.vz = -ball.vz * 0.45;
      fx.burst(sx(ball.x), sy(ball.y), { count: 3, speed: [20, 60], size: [2, 3], life: [0.2, 0.4], colors: ['#d8b48a'], squashY: 0.4, drag: 4 });
    } else ball.vz = 0;
    // A fielder's throw or a pass that hits the ground is just a loose ball.
    if (ball.thrower === 'fielder' || ball.thrower === 'pass') {
      ball.thrower = null;
      ball.passTo = -1;
    }
  }
  if (ball.z === 0) {
    const sp = Math.hypot(ball.vx, ball.vy);
    const ns = Math.max(0, sp - 5 * dt);
    if (sp > 0) {
      ball.vx *= ns / sp;
      ball.vy *= ns / sp;
    }
  }
  bounceWalls(ball, BALL_R, 0.6);

  // Hits.
  if (ball.thrower === 'player' && stacked === 7 && ball.z < 7 * THICK + 0.25) {
    if (Math.hypot(ball.x - stack.x, ball.y - stack.y) < STONE_R[0] + BALL_R) knockStack();
  }
  if (ball.thrower === 'fielder' && phase === 'run' && ball.z < 1.3) {
    if (Math.hypot(ball.x - player.x, ball.y - player.y) < KID_R + BALL_R) playerHit();
  }
}

function bounceWalls(o: { x: number; y: number; vx: number; vy: number }, r: number, e: number) {
  if (o.x < r) {
    o.x = r;
    o.vx = Math.abs(o.vx) * e;
  } else if (o.x > FW - r) {
    o.x = FW - r;
    o.vx = -Math.abs(o.vx) * e;
  }
  if (o.y < r) {
    o.y = r;
    o.vy = Math.abs(o.vy) * e;
  } else if (o.y > FH - r) {
    o.y = FH - r;
    o.vy = -Math.abs(o.vy) * e;
  }
}

function updateStones(dt: number) {
  stones.forEach((s, i) => {
    s.settle += dt;
    if (i === carrying) {
      s.x = player.x;
      s.y = player.y;
      s.z = 1.35;
      return;
    }
    if (s.flyT >= 0) {
      s.flyT += dt / 0.28;
      const t = Math.min(1, s.flyT);
      s.x = lerp(s.from.x, stack.x, t);
      s.y = lerp(s.from.y, stack.y, t);
      s.z = lerp(s.from.z, i * THICK, t) + Math.sin(t * Math.PI) * 1.1;
      if (t >= 1) stoneLanded(i);
      return;
    }
    if (i < stacked) return; // resting on the stack
    s.vz -= G * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.z <= 0) {
      s.z = 0;
      if (s.vz < -2.5) {
        s.vz = -s.vz * 0.35;
        sfx.noise(0.04, 0.25, 3000);
        fx.burst(sx(s.x), sy(s.y), { count: 4, speed: [30, 90], size: [2, 4], life: [0.25, 0.5], colors: ['#d8b48a', '#b88a5e'], squashY: 0.4, drag: 4 });
      } else s.vz = 0;
    }
    if (s.z === 0) {
      const sp = Math.hypot(s.vx, s.vy);
      const ns = Math.max(0, sp - 8 * dt);
      if (sp > 0) {
        s.vx *= ns / sp;
        s.vy *= ns / sp;
      }
    }
    bounceWalls(s, s.r, 0.5);
  });
}

// ---------- main update ----------

function update(dt: number) {
  clock += dt;
  phaseT += dt;
  fx.update(dt);
  shake.update(dt);
  if (msgUntil && clock > msgUntil) setMessage('');

  if (phase === 'aim') {
    if (charging) chargeT += dt;
    const turn = (keys.has('ArrowLeft') || keys.has('a') ? -1 : 0) + (keys.has('ArrowRight') || keys.has('d') ? 1 : 0);
    aimAngle = clampAim(aimAngle + turn * 1.2 * dt);
  }

  updatePlayer(dt);
  updateFielders(dt);
  updateBall(dt);
  updateStones(dt);

  if (phase === 'thrown') {
    const stopped = ball.z === 0 && Math.hypot(ball.vx, ball.vy) < 0.3;
    if (stopped || phaseT > 3) {
      chances -= 1;
      if (chances <= 0) {
        gameOver('3 MISSES');
      } else {
        sfx.tone(300, 0.25, 0.1, 'square', 180);
        setMessage(`<span class="big">MISS!</span><span class="sub">CHANCE ${4 - chances} OF 3</span>`, 1.3);
        resetThrow();
      }
    }
  }

  if (phase === 'pittu') {
    if (phaseT > 2.3) {
      round += 1;
      newRound();
      setMessage(`<span class="big">ROUND ${round + 1}</span><span class="sub">${fielderCount()} FIELDERS · FASTER THROWS</span>`, 1.6);
    }
  }

  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

// ---------- drawing ----------

function drawShadow(x: number, y: number, rx: number, z = 0) {
  const k = 1 / (1 + z * 0.5);
  ctx.fillStyle = `rgba(30, 12, 4, ${0.35 * k})`;
  ctx.beginPath();
  ctx.ellipse(sx(x), sy(y), rx * SC * k, rx * SC * 0.45 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawStone(s: Stone, highlight: boolean) {
  const x = sx(s.x);
  const y = sy(s.y, s.z);
  const rx = s.r * SC;
  const ry = rx * 0.5;
  const th = THICK * SC;
  const squash = s.settle < 0.3 ? 1 + Math.sin(s.settle * 30) * Math.exp(-s.settle * 12) * 0.25 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / squash, squash);
  // Side, alternating shades so each stone in the stack reads separately.
  ctx.fillStyle = STONE_R.indexOf(s.r) % 2 ? '#5c574c' : '#3f3b33';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(-rx, -th);
  ctx.ellipse(0, -th, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  // Top.
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.ellipse(0, -th, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.25, -th - ry * 0.2, rx * 0.45, ry * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 20, 10, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, -th, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (highlight) {
    const pulse = 0.5 + 0.5 * Math.sin(clock * 8);
    ctx.strokeStyle = `rgba(255, 210, 63, ${0.6 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx + 6 + pulse * 4, ry + 4 + pulse * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrow(x: number, y: number, color: string) {
  const b = Math.abs(Math.sin(clock * 5)) * 8;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#2a0f3d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 16 - b);
  ctx.lineTo(x + 9, y - 16 - b);
  ctx.lineTo(x, y - 4 - b);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawKid(k: Kid, isPlayer: boolean) {
  const s = SC;
  const moving = Math.hypot(k.vx, k.vy) > 0.3;
  const step = Math.sin(k.walk);
  const bob = moving ? Math.abs(step) * 0.06 : Math.sin(clock * 2 + k.home.x) * 0.015;
  const x = sx(k.x);
  const y = sy(k.y);
  const down = isPlayer && playerDown > 0;

  drawShadow(k.x, k.y, 0.38);
  ctx.save();
  ctx.translate(x, y);
  if (down) {
    const t = Math.min(1, playerDown / 0.35);
    ctx.rotate((k.vx >= 0 ? 1 : -1) * (Math.PI / 2) * easeOutBack(t) * 0.95);
  }
  ctx.translate(0, -bob * s);
  const facingAway = k.faceY < -0.35;
  const side = k.faceX;

  // Legs.
  ctx.fillStyle = '#3b2a1e';
  const legSwing = moving ? step * 0.12 : 0;
  ctx.fillRect(-0.14 * s, -0.4 * s + legSwing * s, 0.11 * s, 0.4 * s - legSwing * s);
  ctx.fillRect(0.03 * s, -0.4 * s - legSwing * s, 0.11 * s, 0.4 * s + legSwing * s);
  // Chappals.
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(-0.16 * s, -0.04 * s + legSwing * s * 0.3, 0.15 * s, 0.05 * s);
  ctx.fillRect(0.01 * s, -0.04 * s - legSwing * s * 0.3, 0.15 * s, 0.05 * s);
  // Shorts.
  ctx.fillStyle = '#26315e';
  ctx.fillRect(-0.2 * s, -0.55 * s, 0.4 * s, 0.2 * s);
  // Shirt.
  ctx.fillStyle = k.shirt;
  roundRect(-0.24 * s, -0.95 * s, 0.48 * s, 0.44 * s, 0.1 * s);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-0.24 * s, -0.8 * s, 0.48 * s, 0.06 * s);
  ctx.strokeStyle = '#2a0f3d';
  ctx.lineWidth = 1.5;
  roundRect(-0.24 * s, -0.95 * s, 0.48 * s, 0.44 * s, 0.1 * s);
  ctx.stroke();

  // Arms.
  ctx.strokeStyle = '#c68642';
  ctx.lineWidth = 0.09 * s;
  ctx.lineCap = 'round';
  const armSwing = moving ? step * 0.18 : 0;
  const carryingUp = isPlayer && carrying >= 0;
  const windup = k.windup > 0 || (!isPlayer && k.hasBall);
  const throwing = k.throwAnim > 0;
  const arm = (sxn: number, ex: number, ey: number) => {
    ctx.beginPath();
    ctx.moveTo(sxn * 0.22 * s, -0.88 * s);
    ctx.lineTo(ex * s, ey * s);
    ctx.stroke();
  };
  if (carryingUp) {
    arm(-1, -0.2, -1.35);
    arm(1, 0.2, -1.35);
  } else if (throwing) {
    arm(-1, -0.32, -0.6);
    arm(1, 0.1 + side * 0.4, -0.95 + k.faceY * 0.35);
  } else if (windup) {
    const shiver = k.windup > 0 ? Math.sin(clock * 50) * 0.02 : 0;
    arm(-1, -0.32, -0.62);
    arm(1, 0.3 + shiver, -1.35);
  } else if (isPlayer && phase === 'aim') {
    const pull = 0.1 + currentPower() * 0.25;
    arm(-1, -0.3, -0.62);
    arm(1, 0.3 + pull * 0.4, -0.75 + pull * 0.3);
  } else {
    arm(-1, -0.3, -0.55 + armSwing);
    arm(1, 0.3, -0.55 - armSwing);
  }

  // Head.
  const hx = side * 0.04 * s;
  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.arc(hx, -1.12 * s, 0.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1210';
  ctx.beginPath();
  if (facingAway) ctx.arc(hx, -1.12 * s, 0.205 * s, 0, Math.PI * 2);
  else ctx.arc(hx, -1.16 * s, 0.205 * s, Math.PI * 1.02, Math.PI * 1.98);
  ctx.fill();
  if (!facingAway) {
    ctx.fillStyle = '#1a1210';
    const ex = hx + side * 0.06 * s;
    if (down) {
      // Dizzy X eyes.
      ctx.fillRect(ex - 0.09 * s, -1.1 * s, 0.05 * s, 0.05 * s);
      ctx.fillRect(ex + 0.05 * s, -1.1 * s, 0.05 * s, 0.05 * s);
    } else {
      ctx.fillRect(ex - 0.08 * s, -1.12 * s, 0.035 * s, 0.05 * s);
      ctx.fillRect(ex + 0.05 * s, -1.12 * s, 0.035 * s, 0.05 * s);
    }
  }
  ctx.restore();

  // "!" over a fielder about to throw.
  if (!isPlayer && k.windup > 0) {
    ctx.save();
    ctx.font = `${Math.round(SC * 0.45)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = Math.floor(clock * 12) % 2 ? '#ff3b3b' : '#fff7d6';
    ctx.fillText('!', x, y - 1.55 * SC - Math.abs(Math.sin(clock * 10)) * 4);
    ctx.restore();
  }
  // Stars circling a knocked-out player.
  if (down) {
    for (let i = 0; i < 3; i++) {
      const a = clock * 4 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = '#ffd23f';
      ctx.font = `${Math.round(SC * 0.3)}px "Press Start 2P", monospace`;
      ctx.fillText('*', x + Math.cos(a) * SC * 0.5, y - SC * 0.5 + Math.sin(a) * SC * 0.2);
    }
  }
}

function roundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBall() {
  const x = sx(ball.x);
  const y = sy(ball.y, ball.z);
  drawShadow(ball.x, ball.y, BALL_R, ball.z);
  const speed = Math.hypot(ball.vx, ball.vy);
  // Motion trail.
  if (ball.held === null && speed > 3) {
    for (let i = 1; i <= 4; i++) {
      ctx.fillStyle = `rgba(255, 90, 90, ${0.25 - i * 0.05})`;
      ctx.beginPath();
      ctx.arc(x - ball.vx * i * 0.018 * SC, y - (ball.vy - ball.vz) * i * 0.018 * SC, BALL_R * SC * (1 - i * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.arc(x, y, BALL_R * SC, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff7d6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, BALL_R * SC * 0.65, -0.6 + clock * speed, 0.9 + clock * speed);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(x - BALL_R * SC * 0.35, y - BALL_R * SC * 0.35, BALL_R * SC * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function drawAimGuide() {
  const a = currentAim();
  const p = currentPower();
  const len = 1.5 + p * 5;
  const x0 = sx(player.x);
  const y0 = sy(player.y, 0.9);
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -clock * 30;
  ctx.strokeStyle = 'rgba(255, 247, 214, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const x1 = x0 + Math.cos(a) * len * SC;
  const y1 = y0 + Math.sin(a) * len * SC;
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff7d6';
  ctx.beginPath();
  ctx.arc(x1, y1, 5, 0, Math.PI * 2);
  ctx.fill();

  // Slingshot band while dragging.
  if (drag) {
    ctx.strokeStyle = 'rgba(255, 63, 164, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx(drag.start.x), sy(drag.start.y));
    ctx.lineTo(sx(drag.now.x), sy(drag.now.y));
    ctx.stroke();
  }

  // Power bar beside the player.
  if (drag || charging) {
    const bx = x0 + SC * 0.7;
    const by = y0 - SC * 0.2;
    const bh = SC * 1.6;
    ctx.fillStyle = '#2a0f3d';
    ctx.fillRect(bx - 3, by - bh - 3, 14, bh + 6);
    ctx.fillStyle = p > 0.75 ? '#6bff6b' : p > 0.4 ? '#ffd23f' : '#ff3fa4';
    ctx.fillRect(bx, by - bh * p, 8, bh * p);
  }
  ctx.restore();
}

function drawTelegraphs() {
  for (const f of fielders) {
    if (f.windup <= 0) continue;
    const locked = f.windup <= AIM_LOCK;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 20);
    const tx = sx(f.aim.x);
    const ty = sy(f.aim.y);
    ctx.save();
    ctx.strokeStyle = locked ? '#ff3b3b' : `rgba(255, 59, 59, ${0.35 + pulse * 0.3})`;
    ctx.lineWidth = locked ? 3 : 2;
    if (!locked) ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(sx(f.x), sy(f.y));
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    // Reticle shrinks while tracking, then snaps solid when the aim locks.
    const r = SC * (locked ? 0.55 : 0.55 + (f.windup - AIM_LOCK) * 0.8);
    if (locked) {
      ctx.fillStyle = `rgba(255, 59, 59, ${0.25 + pulse * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(tx, ty, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(tx, ty, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawStatus() {
  let text = '';
  if (phase === 'aim' || phase === 'thrown') text = `ROUND ${round + 1} · CHANCE ${4 - chances}/3`;
  else if (phase === 'run') text = `STACK ${stacked}/7`;
  if (!text) return;
  ctx.save();
  ctx.font = `${Math.max(10, Math.round(SC * 0.28))}px "Press Start 2P", monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2a0f3d';
  ctx.fillText(text, W / 2 + 2, OY - 12 + 2);
  ctx.fillStyle = '#fff7d6';
  ctx.fillText(text, W / 2, OY - 12);
  // Stack pips.
  if (phase === 'run') {
    const pw = 12;
    const x0 = W / 2 - (7 * (pw + 4)) / 2;
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i < stacked ? '#6bff6b' : 'rgba(255,247,214,0.25)';
      ctx.fillRect(x0 + i * (pw + 4), OY + 6, pw, 6);
    }
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  shake.apply(ctx);
  if (ground) ctx.drawImage(ground, 0, 0, W, H);

  // Stack zone glows when the player is bringing a stone.
  if (phase === 'run' && carrying >= 0) {
    const pulse = 0.5 + 0.5 * Math.sin(clock * 8);
    ctx.fillStyle = `rgba(107, 255, 107, ${0.1 + pulse * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(sx(stack.x), sy(stack.y), STACK_ZONE * SC, STACK_ZONE * SC * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTelegraphs();

  // Y-sorted scene.
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  const next = phase === 'run' ? nextStone() : 99;
  stones.forEach((s, i) => {
    if (i === carrying) return;
    items.push({
      y: s.y + i * 0.0001,
      draw: () => {
        drawShadow(s.x, s.y, s.r, s.z);
        drawStone(s, i === next && carrying < 0);
      },
    });
  });
  items.push({ y: player.y, draw: () => drawKid(player, true) });
  fielders.forEach((f) => items.push({ y: f.y, draw: () => drawKid(f, false) }));
  items.push({ y: ball.y + (ball.held !== null ? 0.02 : 0), draw: drawBall });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  // Carried stone above the head.
  if (carrying >= 0) drawStone(stones[carrying], false);

  // Guidance arrows.
  if (phase === 'run') {
    if (carrying >= 0) drawArrow(sx(stack.x), sy(stack.y, 1.3), '#6bff6b');
    else if (next < 7) drawArrow(sx(stones[next].x), sy(stones[next].y, 0.5), '#ffd23f');
  }
  if (phase === 'aim') drawAimGuide();

  fx.draw(ctx);
  drawStatus();
  ctx.restore();
}

// ---------- input ----------

function anyPress() {
  sfx.ensure();
  if (phase === 'out' && performance.now() - outAt > 700) {
    newGame();
    introMessage();
    introShown = true;
    return true;
  }
  return false;
}

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
  if (e.key === 'm' || e.key === 'M') sfx.muted = !sfx.muted;
  keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (e.key === ' ' && !e.repeat) {
    if (anyPress()) return;
    if (phase === 'aim') {
      charging = true;
      chargeT = 0;
      hideIntro();
    }
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  if (e.key === ' ' && charging && phase === 'aim') {
    charging = false;
    playerThrow(aimAngle, pingPong(chargeT));
  }
});

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointerDown = true;
  pointerWorld = toWorld(e.clientX, e.clientY);
  if (anyPress()) return;
  if (phase === 'aim') {
    drag = { start: pointerWorld, now: pointerWorld };
    hideIntro();
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointerDown) return;
  pointerWorld = toWorld(e.clientX, e.clientY);
  if (drag) drag.now = pointerWorld;
});

const pointerUp = () => {
  pointerDown = false;
  pointerWorld = null;
  if (drag && phase === 'aim') {
    const pulled = Math.hypot(drag.start.x - drag.now.x, drag.start.y - drag.now.y);
    const angle = currentAim();
    const power = currentPower();
    drag = null;
    if (pulled > 0.4) playerThrow(angle, power);
  }
  drag = null;
};
canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);

window.addEventListener('blur', () => {
  keys.clear();
  charging = false;
  pointerUp();
});

// ---------- boot ----------

window.addEventListener('resize', resize);
resize();
newGame();
introMessage();

// Dev-only state peek for automated playtests; stripped from production builds.
if (import.meta.env.DEV) {
  Object.assign(window, { __pittu: () => ({ phase, stones, stacked, carrying, player, fielders, ball, stack, score, round, chances, SC, OX, OY }) });
}

let last = performance.now();
function frame(now: number) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Hit-stop and slow motion on big moments.
  if (hitstop > 0) {
    hitstop -= dt;
    dt = 0;
  } else if (slowmo > 0) {
    slowmo -= dt;
    dt *= 0.3 + 0.7 * (1 - slowmo / 0.6);
  }
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
