import assert from "node:assert/strict";
import test from "node:test";
import { createLogoClickController } from "../../src/lib/debug/logo-clicks.ts";
import { createLogoTapSequence } from "../../src/lib/debug/flags.ts";

function setup() {
  let now = 0,
    id = 0,
    navigations = 0,
    opened = 0;
  const timers = new Map();
  const tap = createLogoTapSequence();
  const gesture = createLogoClickController({
    tap(time) {
      const count = tap(time);
      if (count === 7) opened++;
      return count;
    },
    reset: tap.reset,
    schedule(callback, delay) {
      const key = ++id;
      timers.set(key, { at: now + delay, callback });
      return () => timers.delete(key);
    },
  });
  return {
    gesture,
    press: () => gesture.press(now, () => navigations++),
    navigations: () => navigations,
    opened: () => opened,
    pending: () => timers.size,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = target;
    },
  };
}

test("a single logo click navigates only after the double-click window", () => {
  const s = setup();
  assert.equal(s.press(), 1);
  s.advance(699);
  assert.equal(s.navigations(), 0);
  s.advance(1);
  assert.equal(s.navigations(), 1);
  assert.equal(s.pending(), 0);
});

test("a second click cancels home and seven relaxed taps open the tools once", () => {
  const s = setup();
  s.press();
  s.advance(600);
  assert.equal(s.press(), 2);
  for (let count = 3; count <= 7; count++) {
    s.advance(900);
    assert.equal(s.press(), count);
  }
  assert.equal(s.opened(), 1);
  assert.equal(s.navigations(), 0);
  assert.equal(s.press(), 0);
  assert.equal(s.pending(), 0);
});

test("a second press cancels home even when released after the single-click deadline", () => {
  const s = setup();
  s.press();
  s.advance(650);
  s.gesture.hold();
  s.advance(150);
  assert.equal(s.navigations(), 0);
  assert.equal(s.press(), 2);
  s.advance(1200);
  assert.equal(s.navigations(), 0);
  assert.equal(s.pending(), 0);
});

test("incomplete multi-click gestures expire without navigating and allow a fresh single click", () => {
  const s = setup();
  s.press();
  s.advance(500);
  s.press();
  s.advance(900);
  s.press();
  s.advance(1101);
  assert.equal(s.navigations(), 0);
  assert.equal(s.press(), 1);
  s.advance(700);
  assert.equal(s.navigations(), 1);
});

test("cancelling on outside input or cleanup clears timers and resets the gesture", () => {
  const s = setup();
  s.press();
  s.gesture.cancel();
  s.advance(2000);
  assert.equal(s.navigations(), 0);
  assert.equal(s.pending(), 0);
  assert.equal(s.press(), 1);
});

test("resetting a completed gesture preserves its cooldown against accidental extra clicks", () => {
  const s = setup();
  for (let i = 0; i < 7; i++) {
    s.press();
    s.advance(100);
  }
  s.gesture.cancel();
  assert.equal(s.press(), 0);
  s.advance(1200);
  assert.equal(s.press(), 1);
  s.advance(700);
  assert.equal(s.opened(), 1);
  assert.equal(s.navigations(), 1);
});
