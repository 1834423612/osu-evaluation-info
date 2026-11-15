import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  registry,
  boundedValue,
  diagnosticReportSchema,
  probeCategory,
} from "../../src/lib/diagnostics/protocol.ts";
import { diagnosticContext } from "../../src/lib/diagnostics/server-context.ts";
import { readJpegExif } from "../../src/lib/diagnostics/exif.ts";
test("all 133 registry IDs are unique and have localized metadata and a consent category", () => {
  assert.equal(registry.length, 133);
  assert.equal(new Set(registry.map((x) => x.id)).size, 133);
  for (const row of registry) {
    assert.ok(row.label.en && row.label.zh && row.method);
    assert.ok(
      ["basic", "advanced", "permission", "network", "file"].includes(
        probeCategory(row.id),
      ),
    );
  }
  for (const id of ["geoloc", "sensors", "kbd"])
    assert.equal(probeCategory(id), "permission");
  assert.equal(probeCategory("canvas"), "advanced");
  assert.equal(probeCategory("lan"), "network");
  assert.equal(probeCategory("exif"), "file");
});
test("reports reject unknown, repeated, unbounded and credential-bearing values", () => {
  const report = {
    version: 1,
    id: randomUUID(),
    capturedAt: new Date().toISOString(),
    consent: "selected-report-v1",
    results: [
      {
        id: "tz",
        status: "available",
        source: "browser",
        value: "UTC",
        duration: 0,
      },
    ],
  };
  assert.equal(diagnosticReportSchema.parse(report).results.length, 1);
  for (const value of [
    { password: "secret" },
    { authorization: "Bearer secret" },
    new Array(257).fill(0),
    "a".repeat(4097),
    Infinity,
  ])
    assert.equal(boundedValue(value), false);
  assert.equal(
    diagnosticReportSchema.safeParse({
      ...report,
      results: [...report.results, ...report.results],
    }).success,
    false,
  );
  assert.equal(
    diagnosticReportSchema.safeParse({
      ...report,
      results: [{ ...report.results[0], id: "cookieDump" }],
    }).success,
    false,
  );
  assert.equal(
    diagnosticReportSchema.safeParse({
      ...report,
      results: [{ ...report.results[0], value: undefined }],
    }).success,
    false,
  );
  let value = null;
  for (let i = 0; i < 10; i++) value = { next: value };
  assert.equal(boundedValue(value), false);
});
test("unconfigured edge data stays missing; only explicit ingress fields are trusted", () => {
  const headers = new Headers({
    "x-forwarded-for": "192.0.2.1",
    "cf-connecting-ip": "192.0.2.2",
    "user-agent": "Test",
    referer: "https://example.com/share/1?k=secret#token",
    cookie: "private=secret",
    authorization: "Bearer secret",
    signature: "secret",
    "x-diagnostic-ja4": "sample",
  });
  const result = diagnosticContext(headers, {});
  assert.equal(
    result.results.find((r) => r.id === "ip").status,
    "not_configured",
  );
  assert.equal(
    result.results.find((r) => r.id === "ja4").status,
    "not_configured",
  );
  assert.equal(
    result.results.find((r) => r.id === "h_ref").value,
    "https://example.com",
  );
  assert.ok(!JSON.stringify(result).includes("secret"));
  const configured = diagnosticContext(headers, {
    USER_DATA_TRUSTED_PROXY_HEADER: "cf-connecting-ip",
    DIAGNOSTICS_TRUSTED_HEADERS:
      '{"ja4":"x-diagnostic-ja4","tlsfp":"authorization"}',
    DIAGNOSTICS_PROBE_PATHS:
      '{"ex_cf":"/diagnostic-probes/cf","dns":"https://uncontrolled.example","h_ua":"/diagnostic-probes/headers"}',
  });
  assert.equal(
    configured.results.find((r) => r.id === "ip").value,
    "192.0.2.2",
  );
  assert.equal(configured.results.find((r) => r.id === "ja4").value, "sample");
  assert.equal(
    configured.results.find((r) => r.id === "tlsfp").status,
    "not_configured",
  );
  assert.deepEqual(configured.probes, { ex_cf: "/diagnostic-probes/cf" });
});
test("JPEG parser handles missing EXIF and refuses malformed non-JPEG input without reading file pixels", () => {
  assert.deepEqual(readJpegExif(new Uint8Array([255, 216, 255, 217])), {
    present: false,
  });
  assert.throws(
    () => readJpegExif(new Uint8Array([0, 0, 0, 0])),
    /jpeg_required/,
  );
  // Little-endian TIFF: one ASCII Make field in APP1.
  const data = new Uint8Array(44),
    v = new DataView(data.buffer);
  data.set([255, 216, 255, 225]);
  v.setUint16(4, 38);
  data.set([69, 120, 105, 102, 0, 0], 6);
  v.setUint16(12, 0x4949);
  v.setUint16(14, 42, true);
  v.setUint32(16, 8, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 0x010f, true);
  v.setUint16(24, 2, true);
  v.setUint32(26, 4, true);
  data.set([84, 101, 115, 0], 30);
  assert.deepEqual(readJpegExif(data), { present: true, make: "Tes" });
});
