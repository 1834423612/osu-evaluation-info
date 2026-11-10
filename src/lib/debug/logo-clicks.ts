export const LOGO_SINGLE_CLICK_DELAY_MS = 700;
export const LOGO_TAP_GAP_MS = 1100;
export const LOGO_TAP_DURATION_MS = 8000;

type CancelTimer = () => void;
type Schedule = (callback: () => void, delay: number) => CancelTimer;
const scheduleTimer: Schedule = (callback, delay) => {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
};

/** The first click may navigate; any second press commits to a non-navigating gesture. */
export function createLogoClickController({
  tap,
  reset,
  schedule = scheduleTimer,
}: {
  tap: (now: number) => number;
  reset: () => void;
  schedule?: Schedule;
}) {
  let cancelHome: CancelTimer | undefined,
    cancelExpiry: CancelTimer | undefined;
  const hold = () => {
    cancelHome?.();
    cancelHome = undefined;
  };
  const clearTimers = () => {
    hold();
    cancelExpiry?.();
    cancelExpiry = undefined;
  };
  return {
    hold,
    press(now: number, navigate: () => void) {
      clearTimers();
      const count = tap(now);
      if (count === 1)
        cancelHome = schedule(() => {
          clearTimers();
          reset();
          navigate();
        }, LOGO_SINGLE_CLICK_DELAY_MS);
      if (count > 0 && count < 7)
        cancelExpiry = schedule(() => {
          cancelExpiry = undefined;
          reset();
        }, LOGO_TAP_GAP_MS);
      return count;
    },
    cancel() {
      clearTimers();
      reset();
    },
  };
}
