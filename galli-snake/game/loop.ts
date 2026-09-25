export interface FixedLoopOptions {
  getCurrentIntervalMs: () => number;
  update: () => void;
  // alpha: how far (0..1) we are between the last tick and the next one.
  render: (alpha: number) => void;
}

export interface LoopHandle {
  stop: () => void;
}

const MAX_FRAME_MS = 250;

export function startFixedLoop(opts: FixedLoopOptions): LoopHandle {
  let accumulator = 0;
  let last = performance.now();
  let stopped = false;
  let rafId = requestAnimationFrame(frame);

  function frame(now: number): void {
    if (stopped) {
      return;
    }
    accumulator += Math.min(now - last, MAX_FRAME_MS);
    last = now;
    while (accumulator >= opts.getCurrentIntervalMs()) {
      opts.update();
      accumulator -= opts.getCurrentIntervalMs();
    }
    opts.render(Math.min(1, accumulator / opts.getCurrentIntervalMs()));
    rafId = requestAnimationFrame(frame);
  }

  return {
    stop(): void {
      stopped = true;
      cancelAnimationFrame(rafId);
    },
  };
}
