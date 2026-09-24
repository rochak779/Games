// Guess the Dialogue — one Bollywood dialogue a day, revealed word by word.
// Six tries to name the movie. Each miss or skip uncovers more words; the
// year shows after two misses and the actor after four. Everyone gets the
// same puzzle on the same day, so results are worth sharing.

import { Sfx } from '../shared/fx';
import { ALIASES, DIALOGUES, TITLES, type Dialogue } from './data';

const MAX_TRIES = 6;
const YEAR_AFTER = 2; // misses before the year is shown
const ACTOR_AFTER = 4;
// Share of words visible before guess 1, 2, … 6.
const REVEAL = [0.25, 0.4, 0.55, 0.7, 0.82, 0.92];
const LAUNCH = Date.UTC(2026, 8, 24); // puzzle #1
const STATE_KEY = 'dialogue.today';
const STATS_KEY = 'dialogue.stats';

type Guess = string | null; // null = skipped
type Status = 'playing' | 'won' | 'lost';
type Today = { day: number; guesses: Guess[]; status: Status };
type Stats = { played: number; won: number; streak: number; maxStreak: number; lastWinDay: number };

const $ = (id: string) => document.getElementById(id)!;
const quoteEl = $('quote');
const yearEl = $('year');
const actorEl = $('actor');
const triesEl = $('tries');
const input = $('guess') as HTMLInputElement;
const suggestEl = $('suggest');
const submitBtn = $('submit') as HTMLButtonElement;
const skipBtn = $('skip') as HTMLButtonElement;
const playEl = $('play');
const resultEl = $('result');
const logEl = $('log');
const muteBtn = $('mute') as HTMLButtonElement;

const sfx = new Sfx();

// ---------- which puzzle is today ----------

// Day number in the player's local calendar, so the puzzle flips at their midnight.
function dayNumber(d = new Date()) {
  return Math.max(0, Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - LAUNCH) / 86_400_000));
}

const day = dayNumber();
const puzzle: Dialogue = DIALOGUES[day % DIALOGUES.length];

// ---------- storage ----------

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Storage blocked; progress just won't survive a reload.
  }
}

let today = load<Today>(STATE_KEY, { day, guesses: [], status: 'playing' });
if (today.day !== day) today = { day, guesses: [], status: 'playing' };
const stats = load<Stats>(STATS_KEY, { played: 0, won: 0, streak: 0, maxStreak: 0, lastWinDay: -1 });
// A missed day breaks the streak.
if (stats.lastWinDay < day - 1) stats.streak = 0;

// ---------- reveal order ----------

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Word = { text: string; key: boolean; always: boolean };
const words: Word[] = puzzle.line.split(/\s+/).map((raw) => {
  const key = raw.startsWith('*');
  const text = key ? raw.slice(1) : raw;
  return { text, key, always: !/[\p{L}\p{N}]/u.test(text) };
});

// Plain words come out in a shuffled (but fixed-per-puzzle) order; giveaways last.
const order: number[] = (() => {
  const rnd = mulberry32(day % DIALOGUES.length + 1);
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const idx = words.map((_, i) => i).filter((i) => !words[i].always);
  return [...shuffle(idx.filter((i) => !words[i].key)), ...shuffle(idx.filter((i) => words[i].key))];
})();

function visibleSet(misses: number, done: boolean): Set<number> {
  if (done) return new Set(words.map((_, i) => i));
  const n = Math.max(1, Math.round(order.length * REVEAL[Math.min(misses, REVEAL.length - 1)]));
  return new Set(order.slice(0, n));
}

// ---------- render ----------

let shown = new Set<number>();

function render(animate: boolean) {
  const done = today.status !== 'playing';
  const misses = today.guesses.length;
  const vis = visibleSet(misses, done);

  quoteEl.replaceChildren(
    ...words.map((w, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      if (w.always || vis.has(i)) {
        span.textContent = w.text;
        if (animate && !w.always && !shown.has(i)) span.classList.add('fresh');
      } else {
        span.classList.add('hidden');
        span.textContent = w.text.replace(/[\p{L}\p{N}]/gu, '_');
      }
      return span;
    }),
  );
  shown = vis;

  yearEl.textContent = done || misses >= YEAR_AFTER ? String(puzzle.year) : '????';
  actorEl.textContent = done || misses >= ACTOR_AFTER ? puzzle.actor.toUpperCase() : '??????';

  triesEl.replaceChildren(
    ...Array.from({ length: MAX_TRIES }, (_, i) => {
      const s = document.createElement('span');
      const g = today.guesses[i];
      if (i < today.guesses.length) s.className = g === null ? 'skip' : g === puzzle.movie ? 'hit' : 'miss';
      return s;
    }),
  );

  logEl.replaceChildren(
    ...today.guesses
      .filter((g) => g !== puzzle.movie)
      .map((g) => {
        const li = document.createElement('li');
        li.className = g === null ? 'skip' : 'miss';
        li.textContent = g ?? 'SKIPPED';
        return li;
      }),
  );

  playEl.hidden = done;
  resultEl.hidden = !done;
  if (done) renderResult();

  $('num').textContent = `#${day + 1}`;
  $('streak').textContent = String(stats.streak);
  $('wins').textContent = String(stats.won);
}

function renderResult() {
  const won = today.status === 'won';
  const pct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  resultEl.innerHTML = `
    <h2>${won ? (today.guesses.length === 1 ? 'EK NUMBER!' : 'SAHI JAWAB!') : 'ARRE YAAR!'}</h2>
    <p class="answer">${escapeHtml(puzzle.movie.toUpperCase())}<br /><small>${puzzle.year} · ${escapeHtml(puzzle.actor.toUpperCase())}</small></p>
    <button id="share" class="btn primary" type="button">SHARE RESULT</button>
    <div class="stat-row">
      <div><b>${stats.played}</b>PLAYED</div>
      <div><b>${pct}%</b>WON</div>
      <div><b>${stats.streak}</b>STREAK</div>
      <div><b>${stats.maxStreak}</b>BEST</div>
    </div>
    <p id="next">NEXT DIALOGUE IN <b id="countdown">--:--:--</b></p>`;
  $('share').addEventListener('click', share);
  tickCountdown();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function tickCountdown() {
  const el = document.getElementById('countdown');
  if (!el) return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
  if (s === 0) return location.reload();
  const pad = (n: number) => String(n).padStart(2, '0');
  el.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
setInterval(tickCountdown, 1000);

// ---------- playing ----------

function record(g: Guess) {
  if (today.status !== 'playing') return;
  sfx.ensure();
  today.guesses.push(g);

  if (g === puzzle.movie) {
    today.status = 'won';
    stats.played++;
    stats.won++;
    stats.streak = stats.lastWinDay === day - 1 ? stats.streak + 1 : 1;
    stats.lastWinDay = day;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    sfx.jingle([523, 659, 784, 1047, 1319]);
  } else if (today.guesses.length >= MAX_TRIES) {
    today.status = 'lost';
    stats.played++;
    stats.streak = 0;
    sfx.tone(220, 0.5, 0.12, 'sawtooth', 90);
  } else if (g === null) {
    sfx.tone(660, 0.08, 0.06, 'square', 880);
  } else {
    sfx.tone(180, 0.22, 0.1, 'square', 120);
  }

  save(STATE_KEY, today);
  save(STATS_KEY, stats);
  input.value = '';
  closeSuggest();
  submitBtn.disabled = true;
  render(true);
}

function share() {
  const squares = today.guesses.map((g) => (g === null ? '⬛' : g === puzzle.movie ? '🟩' : '🟥')).join('');
  const score = today.status === 'won' ? today.guesses.length : 'X';
  const url = new URL('.', location.href).href;
  const text = `🎬 Guess the Dialogue #${day + 1} — ${score}/${MAX_TRIES}\n${squares}\n${url}`;
  const btn = $('share');
  const done = (msg: string) => {
    btn.textContent = msg;
    setTimeout(() => (btn.textContent = 'SHARE RESULT'), 2000);
  };
  // Native share sheet on phones; clipboard everywhere else.
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    navigator.share({ text }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(text).then(
    () => done('COPIED!'),
    () => done('COPY FAILED'),
  );
}

// ---------- autocomplete ----------

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const index = TITLES.map((title) => ({ title, keys: [norm(title), ...(ALIASES[title] ?? []).map(norm)] }));

let matches: string[] = [];
let active = -1;

function search(q: string): string[] {
  const n = norm(q);
  if (!n) return [];
  const tried = new Set(today.guesses);
  const scored: [number, string][] = [];
  for (const { title, keys } of index) {
    if (tried.has(title)) continue;
    let best = Infinity;
    for (const k of keys) {
      if (k === n) best = Math.min(best, 0);
      else if (k.startsWith(n)) best = Math.min(best, 1);
      else if (k.includes(' ' + n)) best = Math.min(best, 2);
      else if (k.includes(n)) best = Math.min(best, 3);
    }
    if (best < Infinity) scored.push([best, title]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).slice(0, 8).map(([, t]) => t);
}

function showSuggest() {
  suggestEl.replaceChildren(
    ...matches.map((t, i) => {
      const li = document.createElement('li');
      li.id = `opt-${i}`;
      li.role = 'option';
      li.textContent = t;
      li.setAttribute('aria-selected', String(i === active));
      // pointerdown, not click, so the input doesn't blur first.
      li.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        choose(i);
      });
      return li;
    }),
  );
  const open = matches.length > 0;
  suggestEl.hidden = !open;
  input.setAttribute('aria-expanded', String(open));
  if (active >= 0) {
    input.setAttribute('aria-activedescendant', `opt-${active}`);
    document.getElementById(`opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}

function closeSuggest() {
  matches = [];
  active = -1;
  showSuggest();
}

function choose(i: number) {
  input.value = matches[i];
  closeSuggest();
  submitBtn.disabled = false;
  input.focus();
}

// A guess only counts if it's exactly a title from the list.
const valid = () => TITLES.includes(input.value) && !today.guesses.includes(input.value);

input.addEventListener('input', () => {
  matches = search(input.value);
  active = matches.length ? 0 : -1;
  submitBtn.disabled = !valid();
  showSuggest();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!matches.length) return;
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
    showSuggest();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (matches.length && active >= 0) choose(active);
    else if (valid()) record(input.value);
  } else if (e.key === 'Escape') {
    closeSuggest();
  }
});

input.addEventListener('blur', () => setTimeout(closeSuggest, 100));

submitBtn.addEventListener('click', () => valid() && record(input.value));
skipBtn.addEventListener('click', () => record(null));

muteBtn.addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  muteBtn.textContent = sfx.muted ? 'SOUND OFF' : 'SOUND ON';
});

render(false);
