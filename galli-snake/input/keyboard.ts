import { Direction } from '../game/state';

export interface KeyboardHandlers {
  onAnyKey?: () => void;
  onDirection: (dir: Direction) => void;
  onPauseToggle: () => void;
  onMuteToggle: () => void;
}

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

const START_KEYS = new Set([...Object.keys(KEY_MAP), 'Space', 'Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);

export function attachKeyboard(handlers: KeyboardHandlers): () => void {
  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.code === 'KeyM') {
      handlers.onMuteToggle();
      return;
    }
    if (PAUSE_KEYS.has(event.code)) {
      event.preventDefault();
      handlers.onPauseToggle();
      return;
    }
    if (START_KEYS.has(event.code)) {
      event.preventDefault();
      handlers.onAnyKey?.();
    }
    const dir = KEY_MAP[event.code];
    if (dir) {
      handlers.onDirection(dir);
    }
  }

  window.addEventListener('keydown', onKeyDown);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
  };
}
