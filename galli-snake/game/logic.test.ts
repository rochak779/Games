import { describe, expect, it } from 'vitest';
import {
  checkCowCollision,
  checkFood,
  checkSelfCollision,
  checkWallCollision,
  createInitialState,
  nextHead,
  placeCow,
  placeFood,
  queueDirection,
  tick,
} from './logic';
import {
  BASE_TICK_MS,
  COW_EVERY,
  COW_FIRST_AT,
  COW_MIN_DISTANCE,
  COW_STAY_TICKS,
  Coord,
  Cow,
  GRID_SIZE,
  GameState,
  MIN_TICK_MS,
  SPEED_STEP_MS,
} from './state';

const zeroRng = () => 0;

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createInitialState(zeroRng),
    status: 'playing',
    ...overrides,
  };
}

function stateAboutToEat(foodsEaten: number): GameState {
  return makeState({
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ],
    direction: 'right',
    food: { x: 6, y: 5 },
    foodsEaten,
    score: foodsEaten * 10,
    tickIntervalMs: BASE_TICK_MS,
  });
}

describe('createInitialState', () => {
  it('starts idle, centred, heading right with a 3-segment snake', () => {
    const s = createInitialState();
    expect(s.status).toBe('idle');
    expect(s.direction).toBe('right');
    expect(s.snake).toEqual([
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]);
    expect(s.score).toBe(0);
    expect(s.foodsEaten).toBe(0);
    expect(s.tickIntervalMs).toBe(BASE_TICK_MS);
  });

  it('spawns food outside the snake body', () => {
    for (let i = 0; i < 200; i++) {
      const s = createInitialState();
      const onSnake = s.snake.some((p) => p.x === s.food.x && p.y === s.food.y);
      expect(onSnake).toBe(false);
    }
  });
});

describe('nextHead', () => {
  it.each([
    ['up', { x: 5, y: 4 }],
    ['down', { x: 5, y: 6 }],
    ['left', { x: 4, y: 5 }],
    ['right', { x: 6, y: 5 }],
  ] as const)('moves %s by one cell', (dir, expected) => {
    expect(nextHead({ x: 5, y: 5 }, dir)).toEqual(expected);
  });
});

describe('checkWallCollision', () => {
  it('flags out-of-bounds heads on every edge', () => {
    expect(checkWallCollision({ x: -1, y: 5 })).toBe(true);
    expect(checkWallCollision({ x: 5, y: -1 })).toBe(true);
    expect(checkWallCollision({ x: GRID_SIZE, y: 5 })).toBe(true);
    expect(checkWallCollision({ x: 5, y: GRID_SIZE })).toBe(true);
  });

  it('accepts in-bounds heads including the far corners', () => {
    expect(checkWallCollision({ x: 0, y: 0 })).toBe(false);
    expect(checkWallCollision({ x: GRID_SIZE - 1, y: GRID_SIZE - 1 })).toBe(false);
  });
});

describe('checkSelfCollision', () => {
  const snake = [
    { x: 5, y: 5 },
    { x: 5, y: 4 },
    { x: 4, y: 4 },
  ];

  it('detects a hit against the body', () => {
    expect(checkSelfCollision({ x: 5, y: 4 }, snake, true)).toBe(true);
  });

  it('allows moving into the tail cell when not growing', () => {
    const tail = snake[snake.length - 1];
    expect(checkSelfCollision(tail, snake, false)).toBe(false);
  });

  it('treats the tail cell as solid when growing', () => {
    const tail = snake[snake.length - 1];
    expect(checkSelfCollision(tail, snake, true)).toBe(true);
  });
});

describe('checkFood', () => {
  it('matches exact coordinates only', () => {
    expect(checkFood({ x: 3, y: 7 }, { x: 3, y: 7 })).toBe(true);
    expect(checkFood({ x: 3, y: 7 }, { x: 7, y: 3 })).toBe(false);
  });
});

describe('placeFood', () => {
  it('never places food on the snake body', () => {
    for (let i = 0; i < 500; i++) {
      const food = placeFood(createInitialState().snake);
      const onSnake = createInitialState().snake.some(
        (p) => p.x === food.x && p.y === food.y,
      );
      expect(onSnake).toBe(false);
    }
  });

  it('uses the injected rng to pick among free cells deterministically', () => {
    const snake = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ];
    expect(placeFood(snake, zeroRng)).toEqual({ x: 1, y: 0 });
  });

  it('returns an off-grid sentinel when the board is full', () => {
    const cells: Coord[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        cells.push({ x, y });
      }
    }
    expect(placeFood(cells, zeroRng)).toEqual({ x: -1, y: -1 });
  });
});

describe('queueDirection', () => {
  it('rejects reversing straight into the neck', () => {
    const s = makeState({ direction: 'right' });
    queueDirection(s, 'left');
    expect(s.directionQueue).toEqual([]);
  });

  it('queues a perpendicular turn and applies it on the next tick', () => {
    let s = makeState({ direction: 'right' });
    queueDirection(s, 'up');
    expect(s.directionQueue).toEqual(['up']);
    s = tick(s);
    expect(s.direction).toBe('up');
  });

  it('buffers a second turn and plays it one tick later instead of dropping it', () => {
    let s = makeState({ direction: 'right' });
    queueDirection(s, 'up');
    queueDirection(s, 'left');

    s = tick(s);
    expect(s.status).toBe('playing');
    expect(s.direction).toBe('up');
    expect(s.directionQueue).toEqual(['left']);

    s = tick(s);
    expect(s.status).toBe('playing');
    expect(s.direction).toBe('left');
  });

  it('skips a stale reversal at the front and applies the turn behind it', () => {
    const s = makeState({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ],
      direction: 'up',
      directionQueue: ['down', 'right'],
      food: { x: 18, y: 18 },
    });
    const after = tick(s);
    expect(after.status).toBe('playing');
    expect(after.direction).toBe('right');
    expect(after.directionQueue).toEqual([]);
  });

  it('caps the buffer at three turns', () => {
    const s = makeState({ direction: 'right' });
    queueDirection(s, 'up');
    queueDirection(s, 'left');
    queueDirection(s, 'down');
    queueDirection(s, 'right');
    expect(s.directionQueue).toEqual(['up', 'left', 'down']);
  });

  it('ignores direction input unless the game is playing', () => {
    const idle = makeState({ status: 'idle' });
    queueDirection(idle, 'up');
    expect(idle.directionQueue).toEqual([]);

    const paused = makeState({ status: 'paused' });
    queueDirection(paused, 'up');
    expect(paused.directionQueue).toEqual([]);

    const dead = makeState({ status: 'gameover' });
    queueDirection(dead, 'up');
    expect(dead.directionQueue).toEqual([]);
  });
});

describe('tick: movement', () => {
  it('advances the head one cell and keeps length constant', () => {
    const before = makeState({ direction: 'right' });
    const after = tick(before);

    expect(after.snake[0]).toEqual({ x: 11, y: 10 });
    expect(after.snake).toHaveLength(before.snake.length);
    expect(after.snake.slice(1)).toEqual(before.snake.slice(0, -1));
  });

  it('does not mutate the previous state', () => {
    const before = makeState({ direction: 'right' });
    const snapshot = structuredClone(before);
    tick(before);
    expect(before).toEqual(snapshot);
  });

  it('does nothing while idle, paused, won or game over', () => {
    const idle = makeState({ status: 'idle' });
    expect(tick(idle)).toBe(idle);

    const paused = makeState({ status: 'paused' });
    expect(tick(paused)).toBe(paused);

    const won = makeState({ status: 'won' });
    expect(tick(won)).toBe(won);

    const dead = makeState({ status: 'gameover' });
    expect(tick(dead)).toBe(dead);
  });
});

describe('tick: walls', () => {
  it('ends the game when the head leaves the grid on the right', () => {
    const s = makeState({
      snake: [
        { x: GRID_SIZE - 1, y: 10 },
        { x: GRID_SIZE - 2, y: 10 },
      ],
      direction: 'right',
    });
    const after = tick(s);
    expect(after.status).toBe('gameover');
    expect(after.deathCause).toBe('wall');
    expect(after.fatalCell).toEqual({ x: GRID_SIZE - 1, y: 10 });
  });

  it('ends the game when the head leaves the grid on the top', () => {
    const s = makeState({
      snake: [
        { x: 10, y: 0 },
        { x: 10, y: 1 },
      ],
      direction: 'up',
    });
    const after = tick(s);
    expect(after.status).toBe('gameover');
    expect(after.deathCause).toBe('wall');
    expect(after.fatalCell).toEqual({ x: 10, y: 0 });
  });
});

describe('tick: self collision', () => {
  it('ends the game when the head runs into its own body', () => {
    const s = makeState({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 4 },
        { x: 4, y: 4 },
      ],
      direction: 'up',
      food: { x: 18, y: 18 },
    });
    const after = tick(s);
    expect(after.status).toBe('gameover');
    expect(after.deathCause).toBe('self');
    expect(after.fatalCell).toEqual({ x: 5, y: 4 });
  });

  it('survives moving into the cell the tail is vacating', () => {
    const s = makeState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
      ],
      direction: 'down',
      food: { x: 18, y: 18 },
    });
    const after = tick(s);
    expect(after.status).toBe('playing');
    expect(after.deathCause).toBeNull();
    expect(after.snake[0]).toEqual({ x: 5, y: 6 });
    expect(after.snake).toHaveLength(4);
  });

  it('dies when growing into the tail cell it is chasing', () => {
    const s = makeState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
      ],
      direction: 'down',
      food: { x: 5, y: 6 },
    });
    const after = tick(s);
    expect(after.status).toBe('gameover');
    expect(after.deathCause).toBe('self');
  });
});

describe('tick: winning', () => {
  it('declares victory when the last free cell is eaten', () => {
    const cells: Coord[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        cells.push({ x, y });
      }
    }
    const body = cells.filter((c) => !(c.x === 19 && c.y === 19) && !(c.x === 18 && c.y === 19));
    const s = makeState({
      snake: [{ x: 18, y: 19 }, ...body],
      direction: 'right',
      food: { x: 19, y: 19 },
    });
    const after = tick(s, zeroRng);
    expect(after.status).toBe('won');
  });
});

describe('tick: food and scoring', () => {
  it('awards points, grows the snake and respawns food off-body', () => {
    const before = makeState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      direction: 'right',
      food: { x: 6, y: 5 },
    });
    const after = tick(before, zeroRng);

    expect(after.score).toBe(before.score + 10);
    expect(after.foodsEaten).toBe(before.foodsEaten + 1);
    expect(after.snake).toHaveLength(before.snake.length + 1);
    expect(after.snake[0]).toEqual({ x: 6, y: 5 });
    expect(
      after.snake.some((p) => p.x === after.food.x && p.y === after.food.y),
    ).toBe(false);
  });

  it('keeps length constant when no food is eaten', () => {
    const before = makeState();
    expect(tick(before).snake).toHaveLength(before.snake.length);
  });
});

describe('speed progression', () => {
  it('keeps the base interval for the first four vada pavs', () => {
    expect(tick(stateAboutToEat(2)).tickIntervalMs).toBe(BASE_TICK_MS);
    expect(tick(stateAboutToEat(3)).tickIntervalMs).toBe(BASE_TICK_MS);
  });

  it('steps the interval down on every fifth vada pav', () => {
    expect(tick(stateAboutToEat(4)).tickIntervalMs).toBe(BASE_TICK_MS - SPEED_STEP_MS);
    expect(tick(stateAboutToEat(9)).tickIntervalMs).toBe(BASE_TICK_MS - 2 * SPEED_STEP_MS);
  });

  it('clamps to the minimum interval once the curve bottoms out', () => {
    expect(tick(stateAboutToEat(33)).tickIntervalMs).toBe(BASE_TICK_MS - 6 * SPEED_STEP_MS);
    expect(tick(stateAboutToEat(34)).tickIntervalMs).toBe(MIN_TICK_MS);
    expect(tick(stateAboutToEat(99)).tickIntervalMs).toBe(MIN_TICK_MS);
  });
});

describe('stray cow', () => {
  const parked = (cells: [Coord, Coord], ticksLeft = COW_STAY_TICKS): Cow => ({ cells, ticksLeft });
  const steps = (a: Coord, b: Coord) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  it('stays away until the first few vada pavs are eaten', () => {
    expect(tick(stateAboutToEat(COW_FIRST_AT - 2), zeroRng).cow).toBeNull();
  });

  it('wanders in on the vada pav that reaches the threshold, then schedules the next one', () => {
    const after = tick(stateAboutToEat(COW_FIRST_AT - 1), zeroRng);
    expect(after.cow).not.toBeNull();
    expect(after.cow!.ticksLeft).toBe(COW_STAY_TICKS);
    expect(after.nextCowAt).toBe(COW_FIRST_AT + COW_EVERY);
  });

  it('parks on two adjacent free cells far from the head and off the food', () => {
    for (let i = 0; i < 200; i++) {
      const s = createInitialState();
      const cow = placeCow(s.snake, s.food)!;
      const [a, b] = cow.cells;
      expect(steps(a, b)).toBe(1);
      for (const c of cow.cells) {
        expect(steps(c, s.snake[0])).toBeGreaterThanOrEqual(COW_MIN_DISTANCE);
        expect(s.snake.some((p) => p.x === c.x && p.y === c.y)).toBe(false);
        expect(c.x === s.food.x && c.y === s.food.y).toBe(false);
        expect(checkWallCollision(c)).toBe(false);
      }
    }
  });

  it('skips the visit when there is no room far enough away', () => {
    const snake: Coord[] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (x + y >= 3) {
          snake.push({ x, y });
        }
      }
    }
    snake.unshift({ x: 0, y: 0 });
    expect(placeCow(snake, { x: 1, y: 0 }, zeroRng)).toBeNull();
  });

  it('ends the run when the dabbawala walks into her', () => {
    const s = makeState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      direction: 'right',
      cow: parked([
        { x: 6, y: 5 },
        { x: 7, y: 5 },
      ]),
      food: { x: 18, y: 18 },
    });
    const after = tick(s);
    expect(after.status).toBe('gameover');
    expect(after.deathCause).toBe('cow');
    expect(after.fatalCell).toEqual({ x: 6, y: 5 });
  });

  it('counts down and wanders off when her time is up', () => {
    let s = makeState({ cow: parked([{ x: 2, y: 2 }, { x: 3, y: 2 }], 2), food: { x: 18, y: 18 } });
    s = tick(s);
    expect(s.cow?.ticksLeft).toBe(1);
    s = tick(s);
    expect(s.cow).toBeNull();
  });

  it('never drops a vada pav under the cow', () => {
    const cells: [Coord, Coord] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(placeFood([{ x: 10, y: 10 }], zeroRng, cells)).toEqual({ x: 2, y: 0 });
    expect(checkCowCollision({ x: 1, y: 0 }, parked(cells))).toBe(true);
    expect(checkCowCollision({ x: 2, y: 0 }, parked(cells))).toBe(false);
    expect(checkCowCollision({ x: 2, y: 0 }, null)).toBe(false);
  });
});
