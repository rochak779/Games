export type Direction = 'up' | 'down' | 'left' | 'right';

export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameover' | 'won';

export type DeathCause = 'wall' | 'self' | 'cow';

export interface Coord {
  x: number;
  y: number;
}

// A stray cow parked across two cells: cells[0] is her head, cells[1] her rump.
export interface Cow {
  cells: [Coord, Coord];
  ticksLeft: number;
}

export interface GameState {
  snake: Coord[];
  direction: Direction;
  directionQueue: Direction[];
  food: Coord;
  score: number;
  foodsEaten: number;
  tickIntervalMs: number;
  status: GameStatus;
  deathCause: DeathCause | null;
  fatalCell: Coord | null;
  cow: Cow | null;
  nextCowAt: number;
}

export const GRID_SIZE = 20;
export const BASE_TICK_MS = 150;
export const MIN_TICK_MS = 70;
export const SPEED_STEP_MS = 12;
export const FOODS_PER_SPEEDUP = 5;
export const FOOD_POINTS = 10;

// The galli fights back: a cow wanders in after the first few vada pavs,
// then again every few more, and wanders off after a while.
export const COW_FIRST_AT = 6;
export const COW_EVERY = 5;
export const COW_STAY_TICKS = 70;
export const COW_LEAVING_TICKS = 16;
// Never drop a cow on top of the player: both cells must be at least this far
// (in steps) from the dabbawala's head.
export const COW_MIN_DISTANCE = 6;
