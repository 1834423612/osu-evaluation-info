import { optionalAPI as api, required, ProbeUnavailable } from "../protocol.ts";
export type Probe = (signal: AbortSignal) => unknown | Promise<unknown>;
type Hints = {
  brands: unknown;
  mobile: boolean;
  platform: string;
  getHighEntropyValues: (keys: string[]) => Promise<Record<string, unknown>>;
};
type Connection = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};
const media = (query: string) => matchMedia(query).matches;
const hints = () => required(api<Hints>(navigator, "userAgentData"));
const highHints = (keys: string[]) => hints().getHighEntropyValues(keys);
const feature = (names: string[], object: object = window) =>
  Object.fromEntries(names.map((name) => [name, name in object]));
const rect = (r: DOMRect) => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
});
function temporaryElement<T>(node: HTMLElement, fn: () => T) {
  node.style.position = "fixed";
  node.style.left = "-10000px";
  node.style.top = "0";
  node.setAttribute("aria-hidden", "true");
  document.body.append(node);
  try {
    return fn();
  } finally {
    node.remove();
  }
}
function canvas() {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 80;
  const ctx = required(c.getContext("2d"));
  ctx.font = "17px serif";
  ctx.fillStyle = "#bb0000";
  ctx.fillRect(3, 3, 70, 31);
  ctx.fillStyle = "#333";
  ctx.fillText("Course Atlas Ω 🦉 012345", 5, 58);
  return { c, ctx };
}
export function canvasSample() {
  return canvas().c.toDataURL();
}
export async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(
    new Uint8Array(await required(crypto.subtle).digest("SHA-256", bytes)),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
const fontCandidates = [
  "Arial",
  "Arial Black",
  "Calibri",
  "Cambria",
  "Comic Sans MS",
  "Courier New",
  "Georgia",
  "Helvetica",
  "Noto Sans",
  "Noto Sans CJK SC",
  "PingFang SC",
  "Segoe UI",
  "SimSun",
  "Tahoma",
  "Times New Roman",
  "Verdana",
];
export function sampledFonts() {
  const ctx = canvas().ctx,
    text = "mmmmmmmmWWΩ中文",
    bases = ["monospace", "serif", "sans-serif"];
  return {
    coverage: "16 named fonts; metric comparison only",
    matched: fontCandidates.filter((font) =>
      bases.some((base) => {
        ctx.font = "24px " + base;
        const a = ctx.measureText(text).width;
        ctx.font = '24px "' + font + '",' + base;
        return ctx.measureText(text).width !== a;
      }),
    ),
  };
}
function glInfo() {
  const c = document.createElement("canvas"),
    gl = required(c.getContext("webgl"));
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : null,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      version: gl.getParameter(gl.VERSION),
      extensions: gl.getSupportedExtensions()?.slice(0, 80),
    };
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
export const browserProbes: Record<string, Probe> = {
  clock: () => ({
    time: new Date().toISOString(),
    offsetMinutes: new Date().getTimezoneOffset(),
  }),
  langs: () => [...navigator.languages],
  locale: () => Intl.DateTimeFormat().resolvedOptions().locale,
  tz: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  hour: () =>
    Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions()
      .hourCycle,
  week: () => {
    const locale = new Intl.Locale(navigator.language);
    return (
      api<{ firstDay: number; weekend: number[]; minimalDays: number }>(
        locale,
        "weekInfo",
      ) ?? required(api<() => unknown>(locale, "getWeekInfo"))!.call(locale)
    );
  },
  fmt: () => ({
    number: new Intl.NumberFormat().format(123456.78),
    date: new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date("2026-01-15T12:00:00Z")),
  }),
  icu: () =>
    Object.fromEntries(
      [
        "calendar",
        "collation",
        "currency",
        "numberingSystem",
        "timeZone",
        "unit",
      ].map((key) => [
        key,
        Intl.supportedValuesOf(
          key as Parameters<typeof Intl.supportedValuesOf>[0],
        ).length,
      ]),
    ),
  kbd: async () =>
    Object.fromEntries(
      await required(
        api<{ getLayoutMap: () => Promise<Map<string, string>> }>(
          navigator,
          "keyboard",
        ),
      ).getLayoutMap(),
    ),
  voices: () => {
    const voices = required(window.speechSynthesis).getVoices();
    return {
      loaded: voices.length > 0,
      voices: voices.slice(0, 100).map((v) => ({
        name: v.name,
        lang: v.lang,
        local: v.localService,
        default: v.default,
      })),
    };
  },
  os: () =>
    api<Hints>(navigator, "userAgentData")?.platform ?? navigator.platform,
  browser: () =>
    api<Hints>(navigator, "userAgentData")?.brands ?? {
      userAgent: navigator.userAgent,
    },
  arch: () => highHints(["architecture", "bitness", "wow64"]),
  form: () => highHints(["formFactors", "mobile"]),
  model: () => highHints(["model", "platformVersion"]),
  ch: () =>
    highHints([
      "architecture",
      "bitness",
      "formFactors",
      "fullVersionList",
      "model",
      "platformVersion",
      "wow64",
    ]),
  screen: () => ({
    width: screen.width,
    height: screen.height,
    availableWidth: screen.availWidth,
    availableHeight: screen.availHeight,
    dpr: devicePixelRatio,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    orientation: screen.orientation?.type ?? null,
  }),
  win: () => ({
    width: innerWidth,
    height: innerHeight,
    outerWidth,
    outerHeight,
    visualViewport: window.visualViewport
      ? {
          width: visualViewport!.width,
          height: visualViewport!.height,
          scale: visualViewport!.scale,
        }
      : null,
  }),
  screens: () => ({
    extended: api<boolean>(screen, "isExtended") ?? null,
    windowX: screenX,
    windowY: screenY,
    coverage: "current screen only; no screen enumeration",
  }),
  scrollbar: () => {
    const n = document.createElement("div");
    n.style.cssText = "width:100px;height:100px;overflow:scroll";
    return temporaryElement(n, () => n.offsetWidth - n.clientWidth);
  },
  cpu: () => required(navigator.hardwareConcurrency),
  mem: () => required(api<number>(navigator, "deviceMemory")),
  heap: () =>
    required(
      api<{
        jsHeapSizeLimit: number;
        totalJSHeapSize: number;
        usedJSHeapSize: number;
      }>(performance, "memory"),
    ),
  touch: () => ({
    maxTouchPoints: navigator.maxTouchPoints,
    fine: media("(pointer:fine)"),
    coarse: media("(pointer:coarse)"),
    hover: media("(hover:hover)"),
  }),
  gpu: glInfo,
  webgl: glInfo,
  glx: glInfo,
  vm: () => ({
    virtualRendererPattern: /swiftshader|llvmpipe|virtualbox|vmware/i.test(
      JSON.stringify(glInfo()),
    ),
    conclusive: false,
  }),
  webgpu: async () => {
    const adapter = required(
      await required(
        api<{ requestAdapter: () => Promise<{ info: object }> }>(
          navigator,
          "gpu",
        ),
      ).requestAdapter(),
    );
    return Object.fromEntries(
      ["vendor", "architecture", "device", "description"].map((key) => [
        key,
        Reflect.get(adapter.info, key) ?? null,
      ]),
    );
  },
  gpulim: async () => {
    const adapter = required(
      await required(
        api<{
          requestAdapter: () => Promise<{
            limits: object;
            features: Set<string>;
          }>;
        }>(navigator, "gpu"),
      ).requestAdapter(),
    );
    const limits = Object.fromEntries(
      Object.getOwnPropertyNames(Object.getPrototypeOf(adapter.limits))
        .filter((k) => k !== "constructor")
        .map((k) => [k, Reflect.get(adapter.limits, k)])
        .filter(([, v]) => typeof v === "number"),
    );
    return { limits, features: [...adapter.features] };
  },
  conn: () => {
    const c = required(api<Connection>(navigator, "connection"));
    return {
      effectiveType: c.effectiveType ?? null,
      downlink: c.downlink ?? null,
      rtt: c.rtt ?? null,
      saveData: c.saveData ?? null,
    };
  },
  battery: async () => {
    const b = await required(
      api<
        () => Promise<{
          charging: boolean;
          level: number;
          chargingTime: number;
          dischargingTime: number;
        }>
      >(navigator, "getBattery"),
    ).call(navigator);
    return {
      charging: b.charging,
      level: b.level,
      chargingTime: Number.isFinite(b.chargingTime) ? b.chargingTime : null,
      dischargingTime: Number.isFinite(b.dischargingTime)
        ? b.dischargingTime
        : null,
    };
  },
  media: async () => ({
    devices: (await required(navigator.mediaDevices).enumerateDevices())
      .slice(0, 32)
      .map((d) => ({ kind: d.kind, label: d.label || null })),
    coverage: "No device IDs; labels may be withheld",
  }),
  audiohw: async () => {
    const ctx = new AudioContext();
    try {
      return {
        sampleRate: ctx.sampleRate,
        baseLatency: ctx.baseLatency,
        state: ctx.state,
      };
    } finally {
      await ctx.close();
    }
  },
  bio: async () => ({
    webauthn: typeof PublicKeyCredential !== "undefined",
    platformAuthenticator:
      typeof PublicKeyCredential !== "undefined"
        ? await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        : false,
    coverage: "availability only; no biometric data",
  }),
  bt: () =>
    required(
      api<{ getAvailability: () => Promise<boolean> }>(navigator, "bluetooth"),
    ).getAvailability(),
  devs: async () => {
    const entries = await Promise.all(
      ["usb", "hid", "serial"].map(async (key) => {
        const obj = api<{
          getDevices?: () => Promise<object[]>;
          getPorts?: () => Promise<object[]>;
        }>(navigator, key);
        const fn = obj?.getDevices ?? obj?.getPorts;
        return [key, fn ? (await fn.call(obj)).length : null];
      }),
    );
    return Object.fromEntries(entries);
  },
  gamepad: () =>
    required(navigator.getGamepads)
      .call(navigator)
      .filter(Boolean)
      .map((g) => ({
        id: g!.id,
        mapping: g!.mapping,
        buttons: g!.buttons.length,
        axes: g!.axes.length,
      })),
  xr: async () => {
    const xr = required(
      api<{ isSessionSupported: (mode: string) => Promise<boolean> }>(
        navigator,
        "xr",
      ),
    );
    return Object.fromEntries(
      await Promise.all(
        ["inline", "immersive-vr", "immersive-ar"].map(async (mode) => [
          mode,
          await xr.isSessionSupported(mode),
        ]),
      ),
    );
  },
  codecs: () => {
    const v = document.createElement("video");
    return Object.fromEntries(
      [
        'video/mp4; codecs="avc1.42E01E"',
        'video/webm; codecs="vp9"',
        'video/mp4; codecs="av01.0.04M.08"',
        'audio/ogg; codecs="opus"',
        'audio/mp4; codecs="mp4a.40.2"',
      ].map((type) => [type, v.canPlayType(type)]),
    );
  },
  rtccodecs: () => ({
    audio: required(RTCRtpReceiver.getCapabilities("audio"))?.codecs.map(
      (c) => ({ mimeType: c.mimeType, clockRate: c.clockRate }),
    ),
    video: required(RTCRtpReceiver.getCapabilities("video"))?.codecs.map(
      (c) => ({ mimeType: c.mimeType, clockRate: c.clockRate }),
    ),
  }),
  recmime: () => {
    required(window.MediaRecorder);
    return Object.fromEntries(
      ["video/webm", "video/mp4", "audio/webm", "audio/ogg"].map((t) => [
        t,
        MediaRecorder.isTypeSupported(t),
      ]),
    );
  },
  hwdec: async () =>
    required(navigator.mediaCapabilities).decodingInfo({
      type: "file",
      video: {
        contentType: 'video/mp4; codecs="avc1.42E01E"',
        width: 1920,
        height: 1080,
        bitrate: 4000000,
        framerate: 30,
      },
    }),
  drm: async () => {
    const out: Record<string, string> = {};
    for (const key of [
      "com.widevine.alpha",
      "org.w3.clearkey",
      "com.apple.fps",
    ]) {
      try {
        await required(navigator.requestMediaKeySystemAccess).call(
          navigator,
          key,
          [
            {
              initDataTypes: ["cenc"],
              videoCapabilities: [
                { contentType: 'video/mp4; codecs="avc1.42E01E"' },
              ],
            },
          ],
        );
        out[key] = "supported";
      } catch {
        out[key] = "unavailable";
      }
    }
    return out;
  },
  storage: async () => {
    const estimate = await required(navigator.storage).estimate();
    return {
      quota: estimate.quota ?? null,
      usage: estimate.usage ?? null,
      persisted: await navigator.storage.persisted(),
    };
  },
  scheme: () => (media("(prefers-color-scheme:dark)") ? "dark" : "light"),
  motion: () => media("(prefers-reduced-motion:reduce)"),
  gamut: () =>
    ["srgb", "p3", "rec2020"].filter((g) => media("(color-gamut:" + g + ")")),
  a11y: () => ({
    forcedColors: media("(forced-colors:active)"),
    moreContrast: media("(prefers-contrast:more)"),
    reducedTransparency: media("(prefers-reduced-transparency:reduce)"),
  }),
  sysui: () => {
    const n = document.createElement("span");
    n.style.font = "menu";
    return temporaryElement(n, () => ({
      font: getComputedStyle(n).font,
      accent: CSS.supports("accent-color", "auto"),
    }));
  },
  display: () => ({
    mode:
      ["fullscreen", "standalone", "minimal-ui", "browser"].find((m) =>
        media("(display-mode:" + m + ")"),
      ) ?? null,
    fullscreenEnabled: document.fullscreenEnabled,
  }),
  dnt: () => ({
    dnt: navigator.doNotTrack,
    gpc: api<boolean>(navigator, "globalPrivacyControl") ?? null,
  }),
  cookies: () => ({
    enabled: navigator.cookieEnabled,
    coverage: "browser setting; no cookie values",
  }),
  psb: () =>
    feature(
      [
        "joinAdInterestGroup",
        "runAdAuction",
        "sharedStorage",
        "browsingTopics",
      ],
      navigator,
    ),
  perms: async () => {
    const out: Record<string, string> = {};
    for (const name of [
      "geolocation",
      "notifications",
      "camera",
      "microphone",
      "clipboard-read",
      "accelerometer",
      "gyroscope",
      "persistent-storage",
      "window-management",
    ]) {
      try {
        out[name] = (
          await required(navigator.permissions).query({
            name: name as PermissionName,
          })
        ).state;
      } catch {
        out[name] = "unsupported";
      }
    }
    return out;
  },
  apis: () => ({
    navigator: feature(
      [
        "usb",
        "serial",
        "hid",
        "bluetooth",
        "geolocation",
        "clipboard",
        "credentials",
      ],
      navigator,
    ),
    window: feature([
      "IdleDetector",
      "EyeDropper",
      "showOpenFilePicker",
      "DeviceMotionEvent",
    ]),
  }),
  pdf: () => required(navigator.pdfViewerEnabled),
  ai: async () => {
    const out: Record<string, unknown> = {};
    for (const name of [
      "LanguageModel",
      "Translator",
      "Summarizer",
      "Writer",
      "Rewriter",
    ]) {
      const obj = api<{ availability?: (opts?: object) => Promise<string> }>(
        window,
        name,
      );
      out[name] = obj?.availability
        ? await obj.availability(
            name === "Translator"
              ? { sourceLanguage: "en", targetLanguage: "zh" }
              : undefined,
          )
        : "unsupported";
    }
    return out;
  },
  webdriver: () => navigator.webdriver,
  auto: () => ({
    webdriver: navigator.webdriver,
    headlessUA: /HeadlessChrome/i.test(navigator.userAgent),
    electronUA: /Electron\//.test(navigator.userAgent),
    conclusive: false,
  }),
  idstr: () => ({
    vendor: navigator.vendor,
    productSub: navigator.productSub,
    platform: navigator.platform,
    plugins: [...navigator.plugins].map((p) => p.name).slice(0, 32),
  }),
  ext: () => ({
    ethereumExposed: "ethereum" in window,
    chromeRuntimeExposed: !!api<{ runtime?: unknown }>(window, "chrome")
      ?.runtime,
    coverage: "exposed API traces only; not an extension inventory",
  }),
  history: () => history.length,
  traces: async () => ({
    localStorageEntries: localStorage.length,
    sessionStorageEntries: sessionStorage.length,
    indexedDatabases:
      "databases" in indexedDB ? (await indexedDB.databases()).length : null,
    cacheEntries: "caches" in window ? (await caches.keys()).length : null,
    windowNameLength: window.name.length,
    coverage: "counts on this origin only",
  }),
  adblock: () => {
    const el = document.createElement("div");
    el.className = "adsbox ad-banner adsbygoogle";
    el.style.width = "1px";
    el.style.height = "1px";
    return temporaryElement(el, () => ({
      baitHidden:
        getComputedStyle(el).display === "none" || el.offsetHeight === 0,
      conclusive: false,
    }));
  },
  fonts: sampledFonts,
  engine: () => {
    try {
      JSON.parse("{");
      return null;
    } catch (e) {
      return {
        parseError: e instanceof Error ? e.message : "unknown",
        coverage: "engine clue only",
      };
    }
  },
  engver: () => ({
    features: feature(["Iterator", "Temporal", "Float16Array", "WebAssembly"]),
    arrayToSorted: "toSorted" in Array.prototype,
    coverage: "feature support; no exact version inference",
  }),
  wasm: () => ({
    supported: typeof WebAssembly !== "undefined",
    emptyModule:
      typeof WebAssembly !== "undefined" &&
      WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
  }),
  lies: () => ({
    navigatorUserAgentGetterNative: Function.prototype.toString
      .call(
        Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent")?.get,
      )
      .includes("[native code]"),
    conclusive: false,
  }),
  cssv: () =>
    Object.fromEntries(
      [
        "selector(:has(*))",
        "color:oklch(50% .1 30)",
        "container-type:inline-size",
        "text-wrap:balance",
        "anchor-name:--a",
      ].map((x) => [x, CSS.supports(x)]),
    ),
  canvas: () => digest(canvasSample()),
  smooth: () => {
    const { ctx } = canvas(),
      data = ctx.getImageData(0, 40, 320, 40).data;
    let partial = 0;
    for (let i = 3; i < data.length; i += 4)
      if (data[i] > 0 && data[i] < 255) partial++;
    return {
      partiallyTransparentPixels: partial,
      coverage: "canvas rasterization only",
    };
  },
  mathfp: () =>
    digest([
      Math.acos(0.123),
      Math.asinh(1),
      Math.atanh(0.5),
      Math.cosh(1),
      Math.expm1(1),
      Math.log1p(10),
      Math.sin(1e20),
      Math.tan(0.123),
    ]),
  emoji: () => {
    const ctx = canvas().ctx;
    return Object.fromEntries(
      ["😀", "🫠", "🫨", "🪿", "🫩"].map((e) => [e, ctx.measureText(e).width]),
    );
  },
  fontfp: () => digest(sampledFonts()),
  domrect: () => {
    const el = document.createElement("span");
    el.textContent = "Course Atlas Ω";
    el.style.font = "17px serif";
    return temporaryElement(el, () => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return {
        element: rect(el.getBoundingClientRect()),
        range: rect(range.getBoundingClientRect()),
      };
    });
  },
  svgrect: () => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
      t = document.createElementNS(el.namespaceURI, "text") as SVGTextElement;
    el.style.cssText = "position:fixed;left:-10000px";
    t.textContent = "Course Atlas Ω";
    el.append(t);
    document.body.append(el);
    try {
      const r = t.getBBox();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        length: t.getComputedTextLength(),
      };
    } finally {
      el.remove();
    }
  },
  textm: () => {
    const m = canvas().ctx.measureText("Course Atlas Ω");
    return {
      width: m.width,
      left: m.actualBoundingBoxLeft,
      right: m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent,
      descent: m.actualBoundingBoxDescent,
    };
  },
  glimg: async () => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const gl = required(c.getContext("webgl"));
    try {
      gl.clearColor(0.1, 0.2, 0.3, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const pixels = new Uint8Array(16 * 16 * 4);
      gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return {
        hash: await digest([...pixels]),
        coverage: "clear-buffer rendering",
      };
    } finally {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  },
  keys: () => ({
    window: Object.getOwnPropertyNames(window).length,
    element: Object.getOwnPropertyNames(HTMLElement.prototype).length,
    css: Object.keys(CSS).length,
  }),
  timer: () => {
    const samples: number[] = [];
    let previous = performance.now();
    for (let i = 0; i < 200; i++) {
      const next = performance.now();
      if (next > previous) samples.push(next - previous);
      previous = next;
    }
    return {
      minimumMilliseconds: samples.length ? Math.min(...samples) : null,
      samples: samples.length,
    };
  },
  rand: async () => ({
    same: (await digest(canvasSample())) === (await digest(canvasSample())),
    conclusive: false,
  }),
  adsp: () => ({
    outerSmallerThanInner: outerWidth < innerWidth,
    screenSmallerThanViewport: screen.width < innerWidth,
    zeroCores: navigator.hardwareConcurrency === 0,
    conclusive: false,
  }),
  shield: async () => ({
    brave:
      (await api<{ isBrave?: () => Promise<boolean> }>(
        navigator,
        "brave",
      )?.isBrave?.()) ?? null,
    coverage: "exposed browser API only",
  }),
};
export async function permissionProbe(id: string, signal: AbortSignal) {
  if (id === "geoloc")
    return new Promise((resolve, reject) =>
      required(navigator.geolocation).getCurrentPosition(
        (p) =>
          signal.aborted
            ? reject(new DOMException("Aborted", "AbortError"))
            : resolve({
                latitude: p.coords.latitude,
                longitude: p.coords.longitude,
                accuracyMeters: p.coords.accuracy,
              }),
        (e) =>
          reject(
            new ProbeUnavailable(
              e.code === 1 ? "denied" : e.code === 3 ? "timed_out" : "failed",
              "geolocation_unavailable",
            ),
          ),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      ),
    );
  if (id === "sensors") {
    const motion = required(
      api<{ requestPermission?: () => Promise<string> }>(
        window,
        "DeviceMotionEvent",
      ),
    );
    if (
      motion.requestPermission &&
      (await motion.requestPermission()) !== "granted"
    )
      throw new ProbeUnavailable("denied");
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener("devicemotion", listener);
        signal.removeEventListener("abort", abort);
      };
      const listener = (e: DeviceMotionEvent) => {
        cleanup();
        resolve({
          acceleration: e.acceleration
            ? { x: e.acceleration.x, y: e.acceleration.y, z: e.acceleration.z }
            : null,
          rotation: e.rotationRate
            ? {
                alpha: e.rotationRate.alpha,
                beta: e.rotationRate.beta,
                gamma: e.rotationRate.gamma,
              }
            : null,
          interval: e.interval,
        });
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new ProbeUnavailable("timed_out"));
      }, 3000);
      window.addEventListener("devicemotion", listener, { once: true });
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  return required(browserProbes[id])(signal);
}
