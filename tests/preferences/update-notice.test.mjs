import assert from "node:assert/strict";
import test from "node:test";
import {
  availableUpdate,
  createUpdateNoticeClient,
} from "../../src/lib/layout/update-notice-client.ts";

const bundled = { sha: "a".repeat(40), environment: "production" };
const published = { ...bundled, sha: "b".repeat(40) };

test("only a deployed production version differing from the loaded bundle needs a refresh", () => {
  assert.equal(availableUpdate(null, bundled), null);
  assert.equal(availableUpdate(published, null), null);
  assert.equal(availableUpdate(bundled, bundled), null);
  assert.equal(
    availableUpdate({ ...published, environment: "development" }, bundled),
    null,
  );
  assert.equal(availableUpdate(published, bundled), published);
});

test("dismissal survives route remounts and reloads for this version without suppressing later versions", () => {
  const values = new Map();
  const storage = () => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
  const notice = createUpdateNoticeClient(storage);
  let updates = 0;
  const stop = notice.subscribe(() => updates++);
  notice.dismiss(published.sha);
  assert.equal(notice.getSnapshot().dismissed, published.sha);
  stop();
  notice.subscribe(() => {});
  assert.equal(notice.getSnapshot().dismissed, published.sha);
  const reloaded = createUpdateNoticeClient(storage);
  assert.equal(reloaded.getServerSnapshot().dismissed, null);
  reloaded.subscribe(() => {});
  assert.equal(reloaded.getSnapshot().dismissed, published.sha);
  assert.notEqual(reloaded.getSnapshot().dismissed, "c".repeat(40));
  reloaded.resetDismissed();
  assert.equal(reloaded.getSnapshot().dismissed, null);
  assert.equal(values.size, 0);
  assert(updates > 0);
});

test("developer previews can be repeated and dismissed without changing real release dismissal", () => {
  const notice = createUpdateNoticeClient(() => ({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }));
  notice.dismiss(published.sha);
  notice.preview();
  const first = notice.getSnapshot().preview;
  notice.dismissPreview();
  assert.equal(notice.getSnapshot().preview, null);
  notice.preview();
  assert(notice.getSnapshot().preview > first);
  assert.equal(notice.getSnapshot().dismissed, published.sha);
});

test("restricted storage does not prevent dismissing, resetting or previewing notices", () => {
  const notice = createUpdateNoticeClient(() => {
    throw new Error("Storage blocked");
  });
  notice.subscribe(() => {});
  notice.dismiss(published.sha);
  assert.equal(notice.getSnapshot().dismissed, published.sha);
  notice.resetDismissed();
  assert.equal(notice.getSnapshot().dismissed, null);
  notice.preview();
  assert.equal(notice.getSnapshot().preview, 1);
});
