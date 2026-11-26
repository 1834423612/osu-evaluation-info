import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  validIngressProof,
  signIngressProof,
} from "../../scripts/rmp/dev-ingress-proof.mjs";
test("development launcher replaces every client proof using the actual HTTP socket", async (t) => {
  const secret = "f".repeat(64);
  const code = `import {createServer} from 'node:http'; const server=createServer((req,res)=>res.end(JSON.stringify({proof:req.headers['x-rmp-ingress'],raw:req.rawHeaders.filter((s,i)=>i%2===0&&s.toLowerCase()==='x-rmp-ingress').length}))); server.listen(0,'127.0.0.1',()=>console.log(server.address().port));`;
  const child = spawn(
    process.execPath,
    [
      "--import",
      new URL("../../scripts/rmp/dev-ingress.mjs", import.meta.url).href,
      "--input-type=module",
      "-e",
      code,
    ],
    {
      env: { ...process.env, RMP_DEV_INGRESS_SECRET: secret },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => {
    child.kill();
  });
  const [chunk] = await once(child.stdout, "data"),
    port = Number(chunk.toString().trim());
  assert(port > 0);
  const response = await fetch(
    `http://127.0.0.1:${port}/api/admin/rmp?access=1`,
    {
      headers: {
        "x-rmp-ingress": "forged,forged-again",
        "x-forwarded-for": "8.8.8.8",
        host: "public.example",
      },
    },
  );
  const result = await response.json();
  assert.notEqual(result.proof, "forged,forged-again");
  assert.equal(result.raw, 1);
  assert(
    validIngressProof(result.proof, "GET", "/api/admin/rmp?access=1", secret),
  );
  assert(
    !validIngressProof(result.proof, "POST", "/api/admin/rmp?access=1", secret),
  );
  // A Next localhost render proxy must not upgrade a signed external peer.
  for (const time of [Date.now(), Date.now() - 60000]) {
    const denied = signIngressProof(
      "8.8.8.8",
      "GET",
      "/api/admin/rmp?access=1",
      secret,
      time,
    );
    const forwarded = await fetch(
      `http://127.0.0.1:${port}/api/admin/rmp?access=1`,
      { headers: { "x-rmp-ingress": denied } },
    );
    const echo = await forwarded.json();
    assert.equal(echo.proof, denied);
    assert(
      !validIngressProof(echo.proof, "GET", "/api/admin/rmp?access=1", secret),
    );
  }
});
