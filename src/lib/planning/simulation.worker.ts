import { simulateSchedule } from "./simulation";
self.onmessage = (event) => {
  try {
    self.postMessage({
      result: simulateSchedule(
        event.data.courses,
        event.data.fixed,
        event.data.preferences,
      ),
    });
  } catch {
    self.postMessage({ error: true });
  }
};
