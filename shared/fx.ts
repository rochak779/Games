// Small shared toolkit for the 90s games: particles, screen shake, easing,
// synth sound effects and best-score storage.

export const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const easeInQuad = (t: number) => t * t;
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
export const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
export const easeOutBounce = (t: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

// ---------- particles ----------

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  shape: 'dot' | 'square' | 'ring';
  spin: number;
  angle: number;
};

export type BurstOptions = {
  count: number;
  speed: [number, number];
  size: [number, number];
  life: [number, number];
  colors: string[];
  gravity?: number;
  drag?: number;
  shape?: Particle['shape'];
  angle?: [number, number]; // radians, default full circle
  squashY?: number; // flatten velocity on y, for ground-level dust
};

export class Particles {
  private list: Particle[] = [];

  burst(x: number, y: number, o: BurstOptions) {
    const [a0, a1] = o.angle ?? [0, Math.PI * 2];
    for (let i = 0; i < o.count; i++) {
      const a = rand(a0, a1);
      const s = rand(o.speed[0], o.speed[1]);
      const life = rand(o.life[0], o.life[1]);
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * (o.squashY ?? 1),
        life,
        max: life,
        size: rand(o.size[0], o.size[1]),
        color: o.colors[Math.floor(Math.random() * o.colors.length)],
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 2,
        shape: o.shape ?? 'dot',
        spin: rand(-10, 10),
        angle: rand(0, Math.PI * 2),
      });
    }
    if (this.list.length > 600) this.list.splice(0, this.list.length - 600);
  }

  // An expanding ground ring (landing shockwave).
  ring(x: number, y: number, size: number, color: string, life = 0.45) {
    this.list.push({ x, y, vx: 0, vy: 0, life, max: life, size, color, gravity: 0, drag: 0, shape: 'ring', spin: 0, angle: 0 });
  }

  update(dt: number) {
    for (const p of this.list) {
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      if (p.shape === 'ring') {
        const k = 1 - t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t + 1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * (0.3 + k), p.size * (0.3 + k) * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.list = [];
  }
}

// ---------- screen shake ----------

export class Shake {
  private amount = 0;

  kick(px: number) {
    if (!reducedMotion) this.amount = Math.max(this.amount, px);
  }

  update(dt: number) {
    this.amount *= Math.exp(-9 * dt);
    if (this.amount < 0.1) this.amount = 0;
  }

  apply(ctx: CanvasRenderingContext2D) {
    if (this.amount) ctx.translate(rand(-1, 1) * this.amount, rand(-1, 1) * this.amount);
  }
}

// ---------- sound ----------

export class Sfx {
  ctx: AudioContext | null = null;
  muted = false;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  noise(duration: number, gain: number, lowpass = 4000) {
    const a = this.ctx;
    if (!a || this.muted) return;
    const len = Math.max(1, Math.floor(a.sampleRate * duration));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = a.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }

  tone(freq: number, duration: number, gain = 0.15, type: OscillatorType = 'square', slideTo?: number, delay = 0) {
    const a = this.ctx;
    if (!a || this.muted) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    const g = a.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + duration + 0.02);
  }

  // A short rising arcade jingle.
  jingle(notes = [523, 659, 784, 1047]) {
    notes.forEach((n, i) => this.tone(n, 0.14, 0.08, 'square', undefined, i * 0.09));
  }
}

// ---------- storage ----------

export function loadNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

export function saveNumber(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // Storage blocked; the score just won't persist.
  }
}

export const CONFETTI = ['#ff3fa4', '#ffd23f', '#19d3c5', '#6bff6b', '#fff7d6', '#e63946'];
