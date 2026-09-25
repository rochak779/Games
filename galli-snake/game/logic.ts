import {
  BASE_TICK_MS,
  COW_EVERY,
  COW_FIRST_AT,
  COW_MIN_DISTANCE,
  COW_STAY_TICKS,
  Coord,
  Cow,
  Direction,
  FOODS_PER_SPEEDUP,
  FOOD_POINTS,
  GRID_SIZE,
  GameState,
  MIN_TICK_MS,
  SPEED_STEP_MS,
} from './state';

const DELTAS: Record<Direction, Coord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const QUEUE_LIMIT = 3;

export function createInitialState(rng: () => number = Math.random): GameState {
  const snake: Coord[] = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  return {
    snake,
    direction: 'right',
    directionQueue: [],
    food: placeFood(snake, rng),
    score: 0,
    foodsEaten: 0,
    tickIntervalMs: BASE_TICK_MS,
    status: 'idle',
    deathCause: null,
    fatalCell: null,
    cow: null,
    nextCowAt: COW_FIRST_AT,
  };
}

export function nextHead(head: Coord, direction: Direction): Coord {
  const d = DELTAS[direction];
  return { x: head.x + d.x, y: head.y + d.y };
}

export function checkWallCollision(head: Coord): boolean {
  return head.x < 0 || head.y < 0 || head.x >= GRID_SIZE || head.y >= GRID_SIZE;
}

export function checkSelfCollision(head: Coord, snake: Coord[], willGrow: boolean): boolean {
  const body = willGrow ? snake : snake.slice(0, -1);
  return body.some((s) => s.x === head.x && s.y === head.y);
}

export function checkFood(head: Coord, food: Coord): boolean {
  return head.x === food.x && head.y === food.y;
}

const key = (c: Coord) => `${c.x},${c.y}`;

export function placeFood(
  snake: Coord[],
  rng: () => number = Math.random,
  blocked: Coord[] = [],
): Coord {
  const occupied = new Set([...snake, ...blocked].map(key));
  const free: Coord[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (!occupied.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }
  if (free.length === 0) {
    return { x: -1, y: -1 };
  }
  return free[Math.floor(rng() * free.length)];
}

export function checkCowCollision(head: Coord, cow: Cow | null): boolean {
  return cow !== null && cow.cells.some((c) => c.x === head.x && c.y === head.y);
}

// Pick a free two-cell spot well away from the head. Returns null when the
// lane is too crowded, in which case the cow just doesn't show up this time.
export function placeCow(
  snake: Coord[],
  food: Coord,
  rng: () => number = Math.random,
): Cow | null {
  const head = snake[0];
  const occupied = new Set([...snake, food].map(key));
  const farEnough = (c: Coord) =>
    Math.abs(c.x - head.x) + Math.abs(c.y - head.y) >= COW_MIN_DISTANCE;
  const free = (c: Coord) =>
    !checkWallCollision(c) && !occupied.has(key(c)) && farEnough(c);

  const spots: Array<[Coord, Coord]> = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const a = { x, y };
      if (!free(a)) {
        continue;
      }
      for (const d of Object.values(DELTAS)) {
        const b = { x: x + d.x, y: y + d.y };
        if (free(b)) {
          spots.push([a, b]);
        }
      }
    }
  }
  if (spots.length === 0) {
    return null;
  }
  return { cells: spots[Math.floor(rng() * spots.length)], ticksLeft: COW_STAY_TICKS };
}

function tickIntervalAfter(foodsEaten: number): number {
  const steps = Math.floor(foodsEaten / FOODS_PER_SPEEDUP);
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - steps * SPEED_STEP_MS);
}

function isValidTurn(candidate: Direction, reference: Direction): boolean {
  return candidate !== OPPOSITE[reference] && candidate !== reference;
}

export function queueDirection(state: GameState, dir: Direction): void {
  if (state.status !== 'playing') {
    return;
  }
  if (state.directionQueue.length >= QUEUE_LIMIT) {
    return;
  }
  const reference =
    state.directionQueue.length > 0
      ? state.directionQueue[state.directionQueue.length - 1]
      : state.direction;
  if (!isValidTurn(dir, reference)) {
    return;
  }
  state.directionQueue.push(dir);
}

function dequeueTurn(queue: Direction[], current: Direction): { direction: Direction; queue: Direction[] } {
  const remaining = [...queue];
  while (remaining.length > 0) {
    const candidate = remaining.shift()!;
    if (isValidTurn(candidate, current)) {
      return { direction: candidate, queue: remaining };
    }
  }
  return { direction: current, queue: remaining };
}

export function tick(state: GameState, rng: () => number = Math.random): GameState {
  if (state.status !== 'playing') {
    return state;
  }

  const { direction, queue } = dequeueTurn(state.directionQueue, state.direction);

  const head = nextHead(state.snake[0], direction);

  if (checkWallCollision(head)) {
    return {
      ...state,
      status: 'gameover',
      deathCause: 'wall',
      fatalCell: state.snake[0],
      directionQueue: [],
    };
  }

  if (checkCowCollision(head, state.cow)) {
    return { ...state, status: 'gameover', deathCause: 'cow', fatalCell: head, directionQueue: [] };
  }

  const ate = checkFood(head, state.food);

  if (checkSelfCollision(head, state.snake, ate)) {
    return { ...state, status: 'gameover', deathCause: 'self', fatalCell: head, directionQueue: [] };
  }

  const snake = [head, ...state.snake];
  if (!ate) {
    snake.pop();
  }

  let cow: Cow | null =
    state.cow && state.cow.ticksLeft > 1 ? { ...state.cow, ticksLeft: state.cow.ticksLeft - 1 } : null;

  let next: GameState = { ...state, deathCause: null, fatalCell: null };
  if (ate) {
    const foodsEaten = state.foodsEaten + 1;
    next = {
      ...next,
      score: state.score + FOOD_POINTS,
      foodsEaten,
      tickIntervalMs: tickIntervalAfter(foodsEaten),
      food: placeFood(snake, rng, cow ? cow.cells : []),
    };
    if (next.food.x < 0 && next.food.y < 0) {
      return { ...next, snake, cow, status: 'won', direction, directionQueue: [] };
    }
    if (!cow && foodsEaten >= state.nextCowAt) {
      cow = placeCow(snake, next.food, rng);
      next = { ...next, nextCowAt: foodsEaten + COW_EVERY };
    }
  }

  return {
    ...next,
    snake,
    cow,
    direction,
    directionQueue: queue,
  };
}
