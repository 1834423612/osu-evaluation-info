import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  instructorPhotoPlan,
  instructorPhotoUrl,
} from "../../src/lib/people/photo.ts";
import { createInstructorPhotoClient } from "../../src/lib/people/photo-client.ts";

const source = (
  await readFile(
    new URL("../../src/app/api/instructors/photo/route.ts", import.meta.url),
    "utf8",
  )
).replace(
  '"@/lib/people/photo"',
  JSON.stringify(
    new URL("../../src/lib/people/photo.ts", import.meta.url).href,
  ),
);
const { GET } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);

describe("direct official instructor photos", { concurrency: false }, () => {
  it("serves only a cacheable endpoint dictionary, without fetching image bytes", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("Server must not fetch photos");
    };
    try {
      const response = GET();
      assert.equal(response.status, 200);
      assert.match(response.headers.get("Content-Type"), /application\/json/);
      assert.match(response.headers.get("Cache-Control"), /max-age=3600/);
      assert.deepEqual(await response.json(), instructorPhotoPlan());
    } finally {
      globalThis.fetch = original;
    }
  });
  it("requests 404 for missing photos while keeping official URLs and identity validation", () => {
    const plan = instructorPhotoPlan();
    assert.equal(
      instructorPhotoUrl(plan, "blanas.2"),
      "https://opic.osu.edu/blanas.2?width=96&d=404",
    );
    for (const identity of [
      "../secret",
      "https://other.example",
      "name@osu.edu",
      "missing-number",
    ])
      assert.equal(instructorPhotoUrl(plan, identity), null);
    assert.equal(
      instructorPhotoUrl(
        { ...plan, endpoints: { photo: "https://other.example/" } },
        "blanas.2",
      ),
      null,
    );
    assert.equal(
      instructorPhotoUrl({ ...plan, width: 5000 }, "blanas.2"),
      null,
    );
  });
  it("shares one discovery for concurrent avatars and caches it without sending teacher identities", async () => {
    const seen = [];
    const client = createInstructorPhotoClient(async (url) => {
      seen.push(String(url));
      return Response.json(instructorPhotoPlan());
    });
    const urls = await Promise.all(
      ["first.1", "second.2", "third.3"].map((identity) =>
        client.url(identity),
      ),
    );
    assert.deepEqual(urls, [
      "https://opic.osu.edu/first.1?width=96&d=404",
      "https://opic.osu.edu/second.2?width=96&d=404",
      "https://opic.osu.edu/third.3?width=96&d=404",
    ]);
    assert.deepEqual(seen, ["/api/instructors/photo"]);
    await client.url("fourth.4");
    assert.equal(seen.length, 1);
    assert.equal(await client.url("../secret"), null);
    assert.equal(seen.length, 1);
  });
  it("does not keep a failed or unsafe discovery as a permanent cached result", async () => {
    let calls = 0;
    const client = createInstructorPhotoClient(async () => {
      calls++;
      return calls === 1
        ? Response.json({
            ...instructorPhotoPlan(),
            endpoints: { photo: "https://other.example/" },
          })
        : Response.json(instructorPhotoPlan());
    });
    await assert.rejects(client.url("first.1"), /Invalid photo endpoint/);
    assert.equal(
      await client.url("first.1"),
      "https://opic.osu.edu/first.1?width=96&d=404",
    );
    assert.equal(calls, 2);
  });
  it("refreshes expired endpoint configuration without a per-identity server request", async () => {
    const now = Date.now;
    let time = now(),
      calls = 0;
    Date.now = () => time;
    try {
      const client = createInstructorPhotoClient(async () => {
        calls++;
        return Response.json(instructorPhotoPlan());
      });
      await client.url("first.1");
      time += 3_600_001;
      await client.url("second.2");
      assert.equal(calls, 2);
    } finally {
      Date.now = now;
    }
  });
});
