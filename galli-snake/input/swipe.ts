import { Direction } from '../game/state';

export interface SwipeHandlers {
  onSwipe: (dir: Direction) => void;
  onTap?: () => void;
}

const SWIPE_THRESHOLD_PX = 28;

export function attachSwipe(element: HTMLElement, handlers: SwipeHandlers): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  function onTouchStart(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
    event.preventDefault();
  }

  function onTouchMove(event: TouchEvent): void {
    if (tracking) {
      event.preventDefault();
    }
  }

  function onTouchEnd(event: TouchEvent): void {
    if (!tracking) {
      return;
    }
    tracking = false;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX && Math.abs(dy) < SWIPE_THRESHOLD_PX) {
      handlers.onTap?.();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      handlers.onSwipe(dx > 0 ? 'right' : 'left');
    } else {
      handlers.onSwipe(dy > 0 ? 'down' : 'up');
    }
  }

  const options: AddEventListenerOptions = { passive: false };
  element.addEventListener('touchstart', onTouchStart, options);
  element.addEventListener('touchmove', onTouchMove, options);
  element.addEventListener('touchend', onTouchEnd, options);

  return () => {
    element.removeEventListener('touchstart', onTouchStart);
    element.removeEventListener('touchmove', onTouchMove);
    element.removeEventListener('touchend', onTouchEnd);
  };
}
