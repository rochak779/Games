import { COW_LEAVING_TICKS, Coord, Cow, Direction, GRID_SIZE, GameState } from '../game/state';
import { Particles, Shake, clamp01, easeOutBack, lerp, reducedMotion } from '../../shared/fx';

export const CELL_PX = 24;
export const BORDER_PX = 30;
export const BOARD_PX = GRID_SIZE * CELL_PX + 2 * BORDER_PX;
// Draw at 2x so the board stays crisp on retina screens and when scaled up.
const RENDER_SCALE = 2;

const COLORS = {
  road: '#37373e',
  gridDot: 'rgba(255, 255, 255, 0.1)',
};

const FACADE_COLORS = [
  '#a85a44',
  '#c99a4b',
  '#7d9aa8',
  '#b8b09a',
  '#9c6b7c',
  '#8a9a6b',
];

const SIGN_COLORS = ['#e4572e', '#f3a712', '#2e86ab', '#5aa05a', '#c34a8a'];

const ACTOR_COLORS = {
  kurta: '#efe7d8',
  cap: '#fbfbf8',
  capCrease: '#c9c6bd',
  face: '#b97a4e',
  outline: 'rgba(0, 0, 0, 0.38)',
  shadow: 'rgba(0, 0, 0, 0.32)',
  rope: '#9a7440',
  tinA: '#d3d9de',
  tinB: '#c2cad1',
  tinRim: '#78828a',
  tinHandle: '#565f66',
};

// Dabbawalas paint colour codes on each tiffin lid so it reaches the right desk.
const LID_CODES = ['#e4572e', '#2e86ab', '#5aa05a', '#f3a712', '#c34a8a'];

const COW_COLORS = {
  hide: '#f0ebe0',
  hump: '#e2d9c6',
  patch: '#7a6150',
  head: '#ebe4d6',
  horn: '#c9b58a',
  muzzle: '#e8a8a0',
  tail: '#cfc6b4',
  marigoldA: '#f39c12',
  marigoldB: '#e8590c',
};

const CRUMB_COLORS = ['#a8591e', '#d07c33', '#e0ba80', '#ffd23f'];
const CRASH_COLORS = ['#d3d9de', '#78828a', '#efe7d8', '#e4572e'];

const FACING_ANGLE: Record<Direction, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

type Facing = 'up' | 'down' | 'left' | 'right';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  facing: Facing,
  rng: () => number,
): void {
  const base = FACADE_COLORS[Math.floor(rng() * FACADE_COLORS.length)];
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(base, 0.78);
  if (facing === 'down') {
    ctx.fillRect(x, y + h - 4, w, 4);
  } else if (facing === 'up') {
    ctx.fillRect(x, y, w, 4);
  } else if (facing === 'right') {
    ctx.fillRect(x + w - 4, y, 4, h);
  } else {
    ctx.fillRect(x, y, 4, h);
  }

  const along = facing === 'down' || facing === 'up' ? w : h;
  const step = 20;
  for (let p = 8; p + 10 <= along - 6; p += step) {
    if (rng() < 0.22) {
      continue;
    }
    const lit = rng() < 0.32;
    ctx.fillStyle = lit ? '#f2cf6b' : 'rgba(20, 20, 26, 0.85)';
    let wx: number;
    let wy: number;
    const ww = 9;
    const wh = 13;
    if (facing === 'down' || facing === 'up') {
      wx = x + p;
      wy = y + Math.max(5, h / 2 - wh / 2);
    } else {
      wx = x + Math.max(5, w / 2 - ww / 2);
      wy = y + p;
    }
    ctx.fillRect(wx, wy, ww, wh);
  }

  if (rng() < 0.55) {
    const stripeA = '#e8e2d0';
    const stripeB = '#b34a3a';
    const depth = 9;
    for (let p = 8; p + 18 <= along; p += 11) {
      ctx.fillStyle = stripeA;
      if (facing === 'down') {
        ctx.fillRect(x + p, y + h - 13, 5, depth);
        ctx.fillStyle = stripeB;
        ctx.fillRect(x + p + 5, y + h - 13, 5, depth);
      } else if (facing === 'up') {
        ctx.fillRect(x + p, y + 4, 5, depth);
        ctx.fillStyle = stripeB;
        ctx.fillRect(x + p + 5, y + 4, 5, depth);
      } else if (facing === 'right') {
        ctx.fillRect(x + w - 13, y + p, depth, 5);
        ctx.fillStyle = stripeB;
        ctx.fillRect(x + w - 13, y + p + 5, depth, 5);
      } else {
        ctx.fillRect(x + 4, y + p, depth, 5);
        ctx.fillStyle = stripeB;
        ctx.fillRect(x + 4, y + p + 5, depth, 5);
      }
    }
  }

  if (rng() < 0.45) {
    ctx.fillStyle = SIGN_COLORS[Math.floor(rng() * SIGN_COLORS.length)];
    const bw = Math.min(46, along / 2);
    if (facing === 'down') {
      ctx.fillRect(x + (w - bw) / 2, y + h - 16, bw, 7);
    } else if (facing === 'up') {
      ctx.fillRect(x + (w - bw) / 2, y + 9, bw, 7);
    } else if (facing === 'right') {
      ctx.fillRect(x + w - 16, y + (h - bw) / 2, 7, bw);
    } else {
      ctx.fillRect(x + 9, y + (h - bw) / 2, 7, bw);
    }
  }
}

function drawFacadeStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alongLen: number,
  facing: Facing,
  rng: () => number,
): void {
  const depth = BORDER_PX;
  let p = 0;
  while (p < alongLen) {
    const bw = 38 + Math.floor(rng() * 42);
    const end = Math.min(p + bw, alongLen);
    if (facing === 'down' || facing === 'up') {
      drawBuilding(ctx, x + p, y, end - p, depth, facing, rng);
    } else {
      drawBuilding(ctx, x, y + p, depth, end - p, facing, rng);
    }
    p = end + 2;
  }
}

function paintStreet(baseCtx: CanvasRenderingContext2D, width: number, height: number): void {
  const rng = mulberry32(20260822);

  baseCtx.fillStyle = COLORS.road;
  baseCtx.fillRect(0, 0, width, height);

  for (let i = 0; i < 500; i++) {
    baseCtx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
    baseCtx.fillRect(rng() * width, rng() * height, 2, 2);
  }

  for (let i = 0; i < 6; i++) {
    baseCtx.fillStyle = 'rgba(0,0,0,0.05)';
    baseCtx.beginPath();
    baseCtx.ellipse(
      BORDER_PX + rng() * (width - 2 * BORDER_PX),
      BORDER_PX + rng() * (height - 2 * BORDER_PX),
      30 + rng() * 50,
      20 + rng() * 40,
      rng() * Math.PI,
      0,
      Math.PI * 2,
    );
    baseCtx.fill();
  }

  const manholes: Array<[number, number]> = [
    [width * 0.3, height * 0.35],
    [width * 0.68, height * 0.62],
    [width * 0.52, height * 0.82],
  ];
  for (const [mx, my] of manholes) {
    baseCtx.fillStyle = '#2c2c31';
    baseCtx.beginPath();
    baseCtx.arc(mx, my, 8, 0, Math.PI * 2);
    baseCtx.fill();
    baseCtx.strokeStyle = '#222226';
    baseCtx.lineWidth = 2;
    baseCtx.stroke();
    baseCtx.strokeStyle = 'rgba(255,255,255,0.12)';
    baseCtx.lineWidth = 1;
    baseCtx.beginPath();
    baseCtx.arc(mx, my, 4, 0, Math.PI);
    baseCtx.stroke();
  }

  const zebraY = height - BORDER_PX - 64;
  baseCtx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let zx = BORDER_PX + 6; zx < width - BORDER_PX - 10; zx += 26) {
    baseCtx.fillRect(zx, zebraY, 15, 48);
  }

  baseCtx.fillStyle = 'rgba(0,0,0,0.25)';
  baseCtx.fillRect(BORDER_PX + 40, height - BORDER_PX - 6, 90, 4);

  const innerW = width - 2 * BORDER_PX;
  const innerH = height - 2 * BORDER_PX;
  drawFacadeStrip(baseCtx, BORDER_PX - 4, 0, innerW + 8, 'down', rng);
  drawFacadeStrip(baseCtx, BORDER_PX - 4, height - BORDER_PX + 4, innerW + 8, 'up', rng);
  drawFacadeStrip(baseCtx, 0, BORDER_PX - 4, innerH + 8, 'right', rng);
  drawFacadeStrip(baseCtx, width - BORDER_PX + 4, BORDER_PX - 4, innerH + 8, 'left', rng);

  baseCtx.fillStyle = COLORS.gridDot;
  for (let gx = 1; gx < GRID_SIZE; gx++) {
    for (let gy = 1; gy < GRID_SIZE; gy++) {
      baseCtx.fillRect(
        BORDER_PX + gx * CELL_PX - 1,
        BORDER_PX + gy * CELL_PX - 1,
        2,
        2,
      );
    }
  }
}

function buildVadaPavSprite(size: number, scale: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = size * scale;
  sprite.height = size * scale;
  const ctx = sprite.getContext('2d');
  if (!ctx) {
    throw new Error('Offscreen 2D context unavailable');
  }
  ctx.scale(scale, scale);

  const glow = ctx.createRadialGradient(size / 2, size / 2, 3, size / 2, size / 2, size / 2);
  glow.addColorStop(0, 'rgba(255, 176, 92, 0.28)');
  glow.addColorStop(1, 'rgba(255, 176, 92, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(size / 2, size - 6, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e0ba80';
  ctx.beginPath();
  ctx.ellipse(size / 2 + 2, size / 2 + 3, 9, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120, 78, 30, 0.55)';
  ctx.beginPath();
  ctx.ellipse(size / 2 + 2, size / 2 + 3, 9, 5.5, 0, Math.PI * 0.95, Math.PI * 1.75);
  ctx.fill();

  ctx.fillStyle = '#a8591e';
  ctx.beginPath();
  ctx.arc(size / 2 - 1, size / 2 - 2, 7.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d07c33';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(size / 2 - 1, size / 2 - 2, 6, Math.PI * 0.95, Math.PI * 1.65);
  ctx.stroke();

  ctx.fillStyle = '#7c3d12';
  for (const [dx, dy] of [[-3, 1], [2, -3], [3, 3], [-1, 4]]) {
    ctx.fillRect(size / 2 - 1 + dx, size / 2 - 2 + dy, 1.6, 1.6);
  }

  return sprite;
}

export interface DrawFrame {
  state: GameState;
  // Snake as it was before the latest tick; segments glide from here.
  prevSnake: Coord[];
  alpha: number;
  now: number;
  flashCell?: Coord | null;
  // Darken the lane so the message on top is readable.
  dim: boolean;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  bornAt: number;
}

const FLOATER_MS = 750;
const FOOD_POP_MS = 260;
const COW_FADE_MS = 450;

const cellCenter = (c: Coord) => ({
  x: BORDER_PX + (c.x + 0.5) * CELL_PX,
  y: BORDER_PX + (c.y + 0.5) * CELL_PX,
});

function createRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context unavailable');
  }
  const ctx = context;
  canvas.width = BOARD_PX * RENDER_SCALE;
  canvas.height = BOARD_PX * RENDER_SCALE;

  const street = document.createElement('canvas');
  street.width = canvas.width;
  street.height = canvas.height;
  const streetCtx = street.getContext('2d');
  if (!streetCtx) {
    throw new Error('Offscreen 2D context unavailable');
  }
  streetCtx.scale(RENDER_SCALE, RENDER_SCALE);
  paintStreet(streetCtx, BOARD_PX, BOARD_PX);

  const foodSprite = buildVadaPavSprite(CELL_PX, RENDER_SCALE);
  const particles = new Particles();
  const shake = new Shake();
  let floaters: Floater[] = [];
  let foodKey = '';
  let foodBornAt = 0;
  let cowKey = '';
  let cowBornAt = 0;

  function drawShadow(x: number, y: number, rx: number, ry: number): void {
    ctx.fillStyle = ACTOR_COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 2.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTiffin(x: number, y: number, index: number): void {
    drawShadow(x, y, 8.5, 8.5);
    ctx.fillStyle = index % 2 === 0 ? ACTOR_COLORS.tinA : ACTOR_COLORS.tinB;
    ctx.strokeStyle = ACTOR_COLORS.tinRim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = LID_CODES[index % LID_CODES.length];
    ctx.fillRect(x - 3, y + 2, 6, 2);
    ctx.strokeStyle = ACTOR_COLORS.tinHandle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 1);
    ctx.lineTo(x + 7, y - 1);
    ctx.stroke();
  }

  // Top-down dabbawala in a Gandhi topi, drawn facing right then rotated.
  function drawDabbawala(x: number, y: number, facing: Direction): void {
    drawShadow(x, y, 9, 10);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(FACING_ANGLE[facing]);
    ctx.strokeStyle = ACTOR_COLORS.outline;
    ctx.lineWidth = 1;

    ctx.fillStyle = ACTOR_COLORS.kurta;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 7, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = ACTOR_COLORS.face;
    ctx.beginPath();
    ctx.arc(1.5, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(7.6, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = ACTOR_COLORS.cap;
    ctx.beginPath();
    ctx.ellipse(-0.5, 0, 5.8, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ACTOR_COLORS.capCrease;
    ctx.beginPath();
    ctx.moveTo(-5.5, 0);
    ctx.lineTo(4.5, 0);
    ctx.stroke();
    ctx.restore();
  }

  // Top-down zebu cow with a marigold garland, drawn facing right then rotated.
  function drawCow(cow: Cow): void {
    const [headCell, rumpCell] = cow.cells;
    const a = cellCenter(headCell);
    const b = cellCenter(rumpCell);
    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.fillStyle = ACTOR_COLORS.shadow;
    ctx.rotate(Math.atan2(a.y - b.y, a.x - b.x));
    ctx.beginPath();
    ctx.ellipse(2, 3, 21, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COW_COLORS.tail;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.quadraticCurveTo(-22, 1, -23, 5);
    ctx.stroke();

    ctx.strokeStyle = ACTOR_COLORS.outline;
    ctx.lineWidth = 1;
    ctx.fillStyle = COW_COLORS.hide;
    ctx.beginPath();
    ctx.ellipse(-4, 0, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COW_COLORS.patch;
    for (const [px, py, rx, ry] of [[-10, -4, 4, 3], [-1, 4.5, 3.5, 2.5], [-14, 4, 2.5, 2]]) {
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = COW_COLORS.hump;
    ctx.beginPath();
    ctx.ellipse(6, 0, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 7; i++) {
      const t = -1 + (2 * i) / 6;
      ctx.fillStyle = i % 2 === 0 ? COW_COLORS.marigoldA : COW_COLORS.marigoldB;
      ctx.beginPath();
      ctx.arc(10 - 1.5 * t * t, t * 6.5, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = COW_COLORS.horn;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(13, -3);
    ctx.lineTo(10.5, -8.5);
    ctx.moveTo(13, 3);
    ctx.lineTo(10.5, 8.5);
    ctx.stroke();

    ctx.strokeStyle = ACTOR_COLORS.outline;
    ctx.lineWidth = 1;
    ctx.fillStyle = COW_COLORS.head;
    ctx.beginPath();
    ctx.ellipse(15.5, 0, 6, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COW_COLORS.muzzle;
    ctx.beginPath();
    ctx.ellipse(20.5, 0, 2.2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function cowOpacity(cow: Cow, frame: DrawFrame): number {
    const key = cow.cells.map((c) => `${c.x},${c.y}`).join('|');
    if (key !== cowKey) {
      cowKey = key;
      cowBornAt = frame.now;
    }
    const fadeIn = reducedMotion ? 1 : clamp01((frame.now - cowBornAt) / COW_FADE_MS);
    const leaving =
      frame.state.status === 'playing' && cow.ticksLeft <= COW_LEAVING_TICKS;
    const blink = leaving && Math.floor(frame.now / 130) % 2 === 1 ? 0.35 : 1;
    return fadeIn * blink;
  }

  function drawFood(frame: DrawFrame): void {
    const { food } = frame.state;
    if (food.x < 0) {
      return;
    }
    const key = `${food.x},${food.y}`;
    if (key !== foodKey) {
      foodKey = key;
      foodBornAt = frame.now;
    }
    const pop = reducedMotion ? 1 : easeOutBack(clamp01((frame.now - foodBornAt) / FOOD_POP_MS));
    const bob = reducedMotion ? 1 : 1 + 0.06 * Math.sin(frame.now / 170);
    const size = CELL_PX * pop * bob;
    const c = cellCenter(food);
    ctx.drawImage(foodSprite, c.x - size / 2, c.y - size / 2, size, size);
  }

  function drawSnake(frame: DrawFrame): void {
    const { snake, direction } = frame.state;
    const prev = frame.prevSnake;
    const t = frame.state.status === 'playing' ? frame.alpha : 1;
    const points = snake.map((cur, i) => {
      const from = prev.length > 0 ? prev[Math.min(i, prev.length - 1)] : cur;
      return cellCenter({ x: lerp(from.x, cur.x, t), y: lerp(from.y, cur.y, t) });
    });

    ctx.strokeStyle = ACTOR_COLORS.rope;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    for (let i = points.length - 1; i >= 1; i--) {
      drawTiffin(points[i].x, points[i].y, i);
    }
    drawDabbawala(points[0].x, points[0].y, direction);
  }

  function drawFloaters(now: number): void {
    floaters = floaters.filter((f) => now - f.bornAt < FLOATER_MS);
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    for (const f of floaters) {
      const k = (now - f.bornAt) / FLOATER_MS;
      const y = f.y - 22 * k;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = '#2a0f3d';
      ctx.fillText(f.text, f.x + 1.5, y + 1.5);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }

  function draw(frame: DrawFrame): void {
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.clearRect(0, 0, BOARD_PX, BOARD_PX);
    ctx.save();
    shake.apply(ctx);
    ctx.drawImage(street, 0, 0, BOARD_PX, BOARD_PX);

    const { cow } = frame.state;
    if (cow) {
      ctx.globalAlpha = cowOpacity(cow, frame);
      drawCow(cow);
      ctx.globalAlpha = 1;
    }
    drawFood(frame);
    drawSnake(frame);

    if (frame.flashCell) {
      const c = cellCenter(frame.flashCell);
      const x = c.x - CELL_PX / 2;
      const y = c.y - CELL_PX / 2;
      ctx.fillStyle = 'rgba(255, 64, 44, 0.55)';
      ctx.fillRect(x, y, CELL_PX, CELL_PX);
      ctx.strokeStyle = 'rgba(255, 96, 72, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, CELL_PX - 2, CELL_PX - 2);
    }

    particles.draw(ctx);
    drawFloaters(frame.now);
    ctx.restore();

    if (frame.dim) {
      ctx.fillStyle = 'rgba(16, 6, 28, 0.6)';
      ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
    }
  }

  return {
    draw,
    update(dt: number): void {
      particles.update(dt);
      shake.update(dt);
    },
    eat(c: Coord, text: string, now: number): void {
      const p = cellCenter(c);
      if (!reducedMotion) {
        particles.burst(p.x, p.y, {
          count: 14,
          speed: [40, 150],
          size: [1.5, 3],
          life: [0.25, 0.55],
          colors: CRUMB_COLORS,
          drag: 4,
          shape: 'square',
        });
      }
      floaters.push({ x: p.x, y: p.y - 6, text, bornAt: now });
    },
    cowArrives(cow: Cow): void {
      const a = cellCenter(cow.cells[0]);
      const b = cellCenter(cow.cells[1]);
      if (!reducedMotion) {
        particles.ring((a.x + b.x) / 2, (a.y + b.y) / 2 + 4, 26, '#fff7d6', 0.5);
      }
    },
    crash(c: Coord): void {
      const p = cellCenter(c);
      shake.kick(9);
      if (!reducedMotion) {
        particles.burst(p.x, p.y, {
          count: 22,
          speed: [60, 200],
          size: [2, 4],
          life: [0.35, 0.8],
          colors: CRASH_COLORS,
          drag: 3,
          shape: 'square',
        });
      }
    },
    reset(): void {
      particles.clear();
      floaters = [];
    },
  };
}

export { createRenderer };
