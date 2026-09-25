import { attachKeyboard } from './input/keyboard';
import { attachSwipe } from './input/swipe';
import { startFixedLoop } from './game/loop';
import { createInitialState, queueDirection, tick } from './game/logic';
import { FOOD_POINTS } from './game/state';
import type { Coord, GameState } from './game/state';
import { createRenderer } from './render/canvas';
import { Sfx, loadNumber, saveNumber } from '../shared/fx';

const BEST_KEY = 'gallisnake.best';
const RESTART_LOCKOUT_MS = 500;
const DEATH_FLASH_MS = 420;
const RESUME_GRACE_MS = 900;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const scoreEl = document.getElementById('score')!;
const highscoreEl = document.getElementById('best')!;
const messageEl = document.getElementById('message')!;
const toastEl = document.getElementById('toast')!;

const renderer = createRenderer(canvas);
const sfx = new Sfx();

let state: GameState = createInitialState();
let prevSnake: Coord[] = state.snake;
let highScore = loadNumber(BEST_KEY);
let gameOverAt = 0;
let flashUntil = 0;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;
let veilActive = false;
let autoPaused = false;
let celebratedBest = false;
let shownSpeedLevel = state.tickIntervalMs;
let hudScore = '';
let hudBest = '';
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let lastFrameAt = performance.now();

function showMessage(title: string, lines: string[] = [], prompt = ''): void {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  messageEl.innerHTML =
    `<span class="big">${esc(title)}</span>` +
    lines.map((l) => `<span class="sub">${esc(l)}</span>`).join('') +
    (prompt ? `<span class="sub blink">${esc(prompt)}</span>` : '');
  messageEl.classList.remove('hidden');
}

function hideMessage(): void {
  messageEl.classList.add('hidden');
}

function showToast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1100);
}

function bump(el: HTMLElement): void {
  el.classList.remove('bump');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('bump');
}

function syncHud(): void {
  const scoreText = String(state.score);
  const bestText = String(Math.max(highScore, state.score));
  if (scoreText !== hudScore) {
    scoreEl.textContent = scoreText;
    if (hudScore !== '' && state.score > 0) {
      bump(scoreEl);
    }
    hudScore = scoreText;
  }
  if (bestText !== hudBest) {
    highscoreEl.textContent = bestText;
    hudBest = bestText;
  }
  highscoreEl.classList.toggle('live-best', state.status === 'playing' && state.score > highScore);
}

function clearResumeTimer(): void {
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = undefined;
  }
  veilActive = false;
}

function beginRun(): void {
  clearResumeTimer();
  autoPaused = false;
  celebratedBest = false;
  state = { ...createInitialState(), status: 'playing' };
  prevSnake = state.snake;
  shownSpeedLevel = state.tickIntervalMs;
  renderer.reset();
  hideMessage();
  syncHud();
  sfx.tone(392, 0.08, 0.07, 'square', 587);
}

function resumeGame(): void {
  clearResumeTimer();
  autoPaused = false;
  state = { ...state, status: 'playing' };
  hideMessage();
}

function pauseGame(fromAuto: boolean): void {
  if (state.status !== 'playing') {
    return;
  }
  state = { ...state, status: 'paused' };
  autoPaused = fromAuto;
  if (!fromAuto) {
    showMessage('PAUSED', [], 'PRESS ANY KEY OR TAP');
  }
}

function startResumeVeil(): void {
  veilActive = true;
  showMessage('GET READY…');
  resumeTimer = setTimeout(() => {
    veilActive = false;
    resumeGame();
  }, RESUME_GRACE_MS);
}

function handleAnyInput(): void {
  sfx.ensure();
  if (veilActive) {
    return;
  }
  if (state.status === 'idle') {
    beginRun();
  } else if (state.status === 'paused' && !autoPaused) {
    resumeGame();
  } else if (
    (state.status === 'gameover' || state.status === 'won') &&
    performance.now() - gameOverAt > RESTART_LOCKOUT_MS
  ) {
    beginRun();
  }
}

function togglePause(): void {
  if (state.status === 'playing') {
    pauseGame(false);
  } else if (state.status === 'paused') {
    resumeGame();
  }
}

function recordBest(): boolean {
  const newBest = state.score > highScore;
  if (newBest) {
    highScore = state.score;
    saveNumber(BEST_KEY, highScore);
  }
  return newBest;
}

const DEATH_LINES: Record<NonNullable<GameState['deathCause']>, string> = {
  wall: 'SPLAT! STRAIGHT INTO THE GALLI WALL.',
  self: 'YOU TRIPPED OVER YOUR OWN TIFFINS.',
  cow: 'MOO! YOU WALKED RIGHT INTO THE GAAY.',
};

function handleGameOver(): void {
  gameOverAt = performance.now();
  flashUntil = gameOverAt + DEATH_FLASH_MS;
  const newBest = recordBest();
  renderer.crash(state.fatalCell ?? state.snake[0]);
  sfx.noise(0.16, 0.5, 900);
  sfx.tone(330, 0.45, 0.1, 'square', 90, 0.08);
  const cause = state.deathCause ? DEATH_LINES[state.deathCause] : '';
  window.setTimeout(() => {
    if (state.status !== 'gameover') {
      return;
    }
    showMessage(
      newBest ? 'NEW BEST!' : 'GAME OVER',
      [cause, `SCORE ${state.score} · ${state.foodsEaten} VADA PAV`],
      'PRESS ANY KEY OR TAP',
    );
    if (newBest) {
      sfx.jingle();
    }
  }, DEATH_FLASH_MS + 30);
}

function handleWon(): void {
  gameOverAt = performance.now();
  recordBest();
  sfx.jingle([523, 659, 784, 1047, 1319]);
  showMessage(
    'LANE CONQUERED!',
    ['YOU FILLED EVERY LAST CORNER OF THE GALLI.', `SCORE ${state.score}`],
    'PRESS ANY KEY FOR ONE MORE RUN',
  );
}

function handleTick(previous: GameState): void {
  if (state.foodsEaten > previous.foodsEaten) {
    renderer.eat(previous.food, `+${FOOD_POINTS}`, performance.now());
    // Pitch climbs a little with every vada pav in the run.
    sfx.tone(520 + Math.min(state.foodsEaten, 30) * 14, 0.07, 0.07, 'square', 900);
  }
  if (state.cow && !previous.cow) {
    renderer.cowArrives(state.cow);
    showToast('Gaay aayi! Watch out');
    sfx.tone(150, 0.5, 0.12, 'sawtooth', 95);
  }
  if (previous.status !== state.status) {
    if (state.status === 'gameover') {
      handleGameOver();
    } else if (state.status === 'won') {
      handleWon();
    }
  }
}

attachKeyboard({
  onAnyKey: handleAnyInput,
  onPauseToggle: togglePause,
  onMuteToggle() {
    sfx.muted = !sfx.muted;
    showToast(sfx.muted ? 'Sound off' : 'Sound on');
  },
  onDirection(dir) {
    handleAnyInput();
    queueDirection(state, dir);
  },
});

attachSwipe(document.body, {
  onTap: handleAnyInput,
  onSwipe(dir) {
    handleAnyInput();
    queueDirection(state, dir);
  },
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame(true);
  } else if (state.status === 'paused' && autoPaused) {
    startResumeVeil();
  }
});

showMessage(
  'GALLI SNAKE',
  ['DELIVER THE TIFFINS. GRAB EVERY VADA PAV.', 'WALLS, YOUR OWN TIFFINS AND STRAY COWS END THE RUN.'],
  'PRESS ANY KEY OR TAP TO START',
);

startFixedLoop({
  getCurrentIntervalMs: () => state.tickIntervalMs,
  update() {
    const previous = state;
    prevSnake = state.snake;
    state = tick(state);
    handleTick(previous);
  },
  render(alpha) {
    const now = performance.now();
    renderer.update(Math.min(0.05, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    const flashing = now < flashUntil;
    renderer.draw({
      state,
      prevSnake,
      alpha,
      now,
      flashCell: flashing ? state.fatalCell : null,
      dim: state.status !== 'playing' && !flashing,
    });
    syncHud();

    if (state.status === 'playing') {
      if (state.tickIntervalMs < shownSpeedLevel) {
        shownSpeedLevel = state.tickIntervalMs;
        showToast('Speed up!');
        sfx.jingle([659, 880]);
      }
      if (!celebratedBest && highScore > 0 && state.score > highScore) {
        celebratedBest = true;
        showToast('New Best!');
        sfx.jingle([784, 1047, 1319]);
      }
    }
  },
});
