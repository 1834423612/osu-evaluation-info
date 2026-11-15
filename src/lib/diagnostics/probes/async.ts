import { required, ProbeUnavailable } from "../protocol.ts";
import { browserProbes, digest, type Probe } from "./browser.ts";
function worker(task: string, signal: AbortSignal) {
  return new Promise((resolve, reject) => {
    const w = new Worker("/diagnostics/worker-v1.js");
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      w.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new ProbeUnavailable("timed_out"));
    }, 1000);
    w.onmessage = (e) => {
      cleanup();
      resolve(e.data);
    };
    w.onerror = () => {
      cleanup();
      reject(new ProbeUnavailable("blocked", "worker_unavailable"));
    };
    signal.addEventListener("abort", abort, { once: true });
    w.postMessage(task);
  });
}
export const asyncProbes: Record<string, Probe> = {
  worker: (signal) => worker("navigator", signal),
  callstack: (signal) => worker("callstack", signal),
  hz: (signal) =>
    new Promise((resolve, reject) => {
      const frames: number[] = [];
      let frame = 0;
      const cleanup = () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const step = (t: number) => {
        frames.push(t);
        if (frames.length < 16) frame = requestAnimationFrame(step);
        else {
          cleanup();
          const deltas = frames
            .slice(1)
            .map((t, i) => t - frames[i])
            .sort((a, b) => a - b);
          resolve({
            estimatedHz: Math.round(
              1000 / deltas[Math.floor(deltas.length / 2)],
            ),
            frames: 16,
            coverage:
              "requestAnimationFrame estimate; power state affects result",
          });
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new ProbeUnavailable("timed_out", "background_or_throttled"));
      }, 1200);
      signal.addEventListener("abort", abort, { once: true });
      frame = requestAnimationFrame(step);
    }),
  audio: async (signal) => {
    const ctx = new OfflineAudioContext(1, 4096, 44100),
      o = ctx.createOscillator(),
      c = ctx.createDynamicsCompressor();
    o.type = "triangle";
    o.frequency.value = 10000;
    o.connect(c);
    c.connect(ctx.destination);
    o.start();
    const buffer = await ctx.startRendering();
    signal.throwIfAborted();
    return {
      hash: await digest([...buffer.getChannelData(0).slice(3000, 3100)]),
      sampleRate: 44100,
      frames: 4096,
      coverage: "offline; no audio output or microphone",
    };
  },
  agent: (signal) =>
    new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener("pointerdown", listener);
        signal.removeEventListener("abort", abort);
      };
      const listener = (e: PointerEvent) => {
        cleanup();
        resolve({
          pointerType: e.pointerType,
          isTrusted: e.isTrusted,
          pressure: e.pressure,
          coverage: "one pointer event; no coordinates or keystrokes",
        });
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new ProbeUnavailable("timed_out", "click_once_to_sample"));
      }, 5000);
      window.addEventListener("pointerdown", listener, { once: true });
      signal.addEventListener("abort", abort, { once: true });
    }),
  fpid: async (signal) => ({
    hash: await digest(
      await Promise.all(
        ["canvas", "mathfp", "textm", "screen", "cpu"].map(async (id) => {
          try {
            return [id, await browserProbes[id](signal)];
          } catch {
            return [id, null];
          }
        }),
      ),
    ),
    coverage: "diagnostic composite; spoofable, not an identity",
  }),
  hwid: async (signal) => ({
    hash: await digest(
      await Promise.all(
        ["screen", "cpu", "gpu", "fonts"].map(async (id) => {
          try {
            return [id, await browserProbes[id](signal)];
          } catch {
            return [id, null];
          }
        }),
      ),
    ),
    coverage:
      "heuristic composite; not a hardware serial or stable cross-browser ID",
  }),
  etag: async (signal) => {
    const first = await fetch("/api/diagnostics/cache", {
      signal,
      cache: "no-cache",
      credentials: "omit",
    });
    const etag = required(first.headers.get("etag"));
    const next = await fetch("/api/diagnostics/cache", {
      signal,
      cache: "no-store",
      credentials: "omit",
      headers: { "If-None-Match": etag },
    });
    return {
      firstStatus: first.status,
      conditionalStatus: next.status,
      constantValidator: etag,
      coverage: "same constant validator for every visitor",
    };
  },
  lan: (signal) =>
    new Promise((resolve, reject) => {
      const pc = new RTCPeerConnection({ iceServers: [] }),
        candidates: string[] = [];
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        pc.close();
      };
      const finish = () => {
        cleanup();
        resolve({
          candidates,
          coverage: "host candidates only; mDNS may hide addresses; no STUN",
        });
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timer = setTimeout(finish, 1800);
      pc.onicecandidate = (e) => {
        if (e.candidate) candidates.push(e.candidate.candidate.slice(0, 512));
        else finish();
      };
      signal.addEventListener("abort", abort, { once: true });
      pc.createDataChannel("diagnostic");
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(() => {
          cleanup();
          reject(new ProbeUnavailable("blocked", "webrtc_unavailable"));
        });
    }),
};
