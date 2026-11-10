import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DEBUG_SESSION_KEY } from "../../src/lib/debug/flags.ts";

const source = stripTypeScriptTypes(
  await readFile(
    new URL("../../src/lib/debug/client.ts", import.meta.url),
    "utf8",
  ),
)
  .replace(
    'import { initializeBrowserStorage } from "../preferences/browser-storage";',
    "const initializeBrowserStorage = () => {};",
  )
  .replace(
    '"./flags"',
    JSON.stringify(
      new URL("../../src/lib/debug/flags.ts", import.meta.url).href,
    ),
  );
let counter = 0;
function storage(saved) {
  const data = new Map(Object.entries(saved));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}
async function setup({
  expanded = false,
  development = false,
  hidden = false,
} = {}) {
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = development ? "development" : "production";
  const savedGlobals = Object.fromEntries(
    ["window", "document", "sessionStorage", "localStorage"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const session = storage({
    [DEBUG_SESSION_KEY]: JSON.stringify({
      expanded,
      hidden,
      expiresAt: Date.now() + 10000,
    }),
  });
  let resolve;
  const authorization = new Promise((done) => {
    resolve = done;
  });
  globalThis.sessionStorage = session;
  globalThis.localStorage = storage({});
  globalThis.document = { documentElement: { toggleAttribute() {} } };
  globalThis.window = {
    dispatchEvent() {},
    __COURSE_ATLAS_FETCH__: () => authorization,
  };
  const { debugTools } = await import(
    `data:text/javascript;base64,${Buffer.from(source + `\n// fixture ${++counter}`).toString("base64")}`
  );
  debugTools.initialize();
  return {
    tools: debugTools,
    saved: () => JSON.parse(session.getItem(DEBUG_SESSION_KEY)),
    authorize: async () => {
      resolve(
        Response.json({
          authorized: true,
          configured: true,
          expiresAt: Date.now() + 10000,
        }),
      );
      await new Promise(setImmediate);
    },
    cleanup() {
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
      for (const [key, descriptor] of Object.entries(savedGlobals)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}
for (const development of [false, true]) {
  test(`${development ? "development" : "production"} restores expanded and collapsed views and persists each toggle`, async () => {
    for (const expanded of [false, true]) {
      const fixture = await setup({ expanded, development });
      try {
        await fixture.authorize();
        assert.equal(fixture.tools.getSnapshot().expanded, expanded);
        fixture.tools.toggle();
        assert.equal(fixture.saved().expanded, !expanded);
        fixture.tools.toggle();
        assert.equal(fixture.saved().expanded, expanded);
      } finally {
        fixture.cleanup();
      }
    }
  });
}
test("late authorization cannot reopen a panel the user has just collapsed or hidden", async () => {
  for (const action of ["toggle", "hide"]) {
    const fixture = await setup({ expanded: true, development: true });
    try {
      fixture.tools[action]();
      await fixture.authorize();
      assert.equal(fixture.tools.getSnapshot().expanded, false);
      assert.equal(fixture.saved().expanded, false);
      if (action === "hide")
        assert.equal(fixture.tools.getSnapshot().visible, false);
    } finally {
      fixture.cleanup();
    }
  }
});
