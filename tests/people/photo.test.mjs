import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getInstructorPhoto } from "../../src/lib/people/photo.ts";

describe("OPIC photo proxy", { concurrency: false }, () => {
  const withFetch = async (fetcher, action) => {
    const original = globalThis.fetch;
    globalThis.fetch = fetcher;
    try {
      await action();
    } finally {
      globalThis.fetch = original;
    }
  };

  it("rejects invalid identities without network access", async () => {
    await withFetch(
      () => {
        throw new Error("must not fetch");
      },
      async () => {
        assert.equal((await getInstructorPhoto("../secret")).status, "missing");
        assert.equal(
          (await getInstructorPhoto("https://example.com")).status,
          "missing",
        );
      },
    );
  });

  it("recognizes and caches the official default leaf redirect", async () => {
    let calls = 0;
    await withFetch(
      async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "/assets/leaf/default.png" },
        });
      },
      async () => {
        assert.equal(
          (await getInstructorPhoto("missingtest.1")).status,
          "missing",
        );
        assert.equal(
          (await getInstructorPhoto("missingtest.1")).status,
          "missing",
        );
        assert.equal(calls, 1);
      },
    );
  });

  it("rejects redirects outside the fixed OPIC origin", async () => {
    let calls = 0;
    await withFetch(
      async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.com/photo.jpg" },
        });
      },
      async () => {
        assert.equal(
          (await getInstructorPhoto("redirecttest.1")).status,
          "unavailable",
        );
        assert.equal(calls, 1);
      },
    );
  });

  it("allows real PNG photos and deduplicates concurrent loads", async () => {
    let calls = 0;
    await withFetch(
      async (url) => {
        calls++;
        assert.equal(new URL(url).origin, "https://opic.osu.edu");
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "content-type": "image/png" },
        });
      },
      async () => {
        const [first, second] = await Promise.all([
          getInstructorPhoto("phototest.1"),
          getInstructorPhoto("phototest.1"),
        ]);
        assert.equal(first.status, "available");
        assert.equal(second.status, "available");
        assert.equal(calls, 1);
      },
    );
  });

  it("rejects HTML masquerading as a successful photo response", async () => {
    await withFetch(
      async () =>
        new Response("<html>Sign in</html>", {
          headers: { "content-type": "text/html" },
        }),
      async () => {
        assert.equal(
          (await getInstructorPhoto("htmltest.1")).status,
          "unavailable",
        );
      },
    );
  });

  it("enforces a streaming size limit even without content-length", async () => {
    await withFetch(
      async () =>
        new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
          headers: { "content-type": "image/jpeg" },
        }),
      async () => {
        assert.equal(
          (await getInstructorPhoto("sizetest.1")).status,
          "unavailable",
        );
      },
    );
  });
});
