/* Bounded, disposable worker. No requests or persistent writes. */
self.onmessage = (event) => {
  if (event.data === "navigator") {
    self.postMessage({
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: [...navigator.languages],
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
  } else if (event.data === "callstack") {
    let depth = 0,
      limited = false;
    const start = performance.now();
    function recurse() {
      depth++;
      if (depth >= 20000 || performance.now() - start > 40) {
        limited = true;
        return;
      }
      recurse();
    }
    try {
      recurse();
    } catch {
      /* Engine stack limit reached. */
    }
    self.postMessage({
      depth,
      limited,
      coverage: "40 ms / 20,000-frame maximum; worker stack only",
    });
  }
};
