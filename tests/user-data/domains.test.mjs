import { test } from "node:test";
import assert from "node:assert/strict";
import { domainSchema, domainSQL } from "../../src/lib/user-data/namespace.ts";
import { codeEmail } from "../../src/lib/auth/mail.ts";
test("independent production domains never inherit course search paths", () => {
  for (const [table, schema] of [
    ["principal", "osu_identity"],
    ["sync_item", "osu_identity"],
    ["shared_collection", "osu_identity"],
    ["transfer_pair", "osu_identity"],
    ["visitor_context", "osu_analytics"],
    ["diagnostic_report", "osu_diagnostics"],
  ]) {
    assert.equal(domainSchema(table, { NODE_ENV: "production" }), schema);
    assert.equal(
      domainSchema(table, { NODE_ENV: "development" }),
      schema + "_dev",
    );
  }
});
test("isolated integration namespaces and SQL resolve consistently", () => {
  assert.equal(
    domainSchema("sync_item", { USER_DATA_SCHEMA: "test_domain" }),
    "test_domain",
  );
  assert.match(
    domainSQL("CREATE TABLE osu_identity.sync_item (id text)"),
    /"osu_identity(?:_dev)?"."sync_item"/,
  );
});
test("email code layout is responsive and rejects injected markup", () => {
  assert.match(codeEmail("123456", true), /viewport/);
  assert.match(codeEmail("123456", false), /max-width:480px/);
  assert.throws(() => codeEmail("<img/>", false));
});
