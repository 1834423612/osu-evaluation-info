import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  randomBytes,
  generateKeyPairSync,
  createHash,
  sign,
} from "node:crypto";

test(
  "HTTP auth boundary supports passwordless accounts, password setup and account-bound passkeys",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const file of [".env.local", ".env"])
      if (existsSync(file)) process.loadEnvFile(file);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const schema = "osu_identity_test_" + randomBytes(5).toString("hex");
    Object.assign(process.env, {
      NODE_ENV: "test",
      AUTH_SCHEMA: schema,
      USER_DATA_SCHEMA: schema,
      AUTH_TABLE_PREFIX: "",
      AUTH_DEV_BASE_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      USER_DATA_SECRET: randomBytes(32).toString("hex"),
    });
    const { getDatabasePool } = await import("../../src/lib/db.ts");
    const { getAuthPool } = await import("../../src/lib/auth/database.ts");
    const { createAuth } = await import("../../src/lib/auth/server.ts");
    const { handleAuthRequest } = await import("../../src/lib/auth/handler.ts");
    const { getMigrations } = await import("better-auth/db/migration");
    const db = getDatabasePool();
    await db.query('CREATE SCHEMA "' + schema + '"');
    const pool = getAuthPool();
    t.after(async () => {
      await pool.end();
      assert.match(schema, /^osu_identity_test_[a-f0-9]+$/);
      await db.query('DROP SCHEMA "' + schema + '" CASCADE');
      await db.end();
    });
    await pool.query(
      readFileSync(
        "db/migrations/20261114_user_data_base.sql",
        "utf8",
      ).replaceAll("osu_identity", schema),
    );
    const codes = new Map();
    const auth = createAuth({
      deliverCode: async (email, code) => {
        codes.set(email, code);
      },
    });
    await pool.query(
      await (await getMigrations(auth.options)).compileMigrations(),
    );
    const { domainSQL } = await import("../../src/lib/user-data/namespace.ts");
    await pool.query(
      domainSQL(
        readFileSync("db/migrations/20261115_identity_preferences.sql", "utf8"),
      ),
    );
    const references = await pool.query(
      "SELECT n.nspname FROM pg_constraint c JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE c.conrelid=$1::regclass AND c.contype='f'",
      [schema + ".policy_acceptance"],
    );
    assert.deepEqual(
      references.rows.map((row) => row.nspname),
      [schema],
    );
    async function request(
      path,
      body,
      { origin = "http://localhost:3000", headers = {}, cookie = "" } = {},
    ) {
      const response = await handleAuthRequest(
        new Request(origin + "/api/auth" + path, {
          method: body ? "POST" : "GET",
          headers: {
            origin,
            "content-type": "application/json",
            "x-waho-policy-version": "2026-11-15",
            ...headers,
            ...(cookie ? { cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        auth,
      );
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers
          .getSetCookie()
          .map((x) => x.split(";")[0])
          .join("; "),
      };
    }
    await pool.query(
      domainSQL(readFileSync("db/migrations/20261114_sharing.sql", "utf8")),
    );
    const email = "passwordless@example.invalid",
      password = "eightpwd";
    assert.equal(
      (
        await request("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).status,
      429,
    );
    const otp = codes.get(email);
    const login = await request("/sign-in/email-otp", { email, otp });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.match(login.cookie, /session_token/);
    const { actorFor } = await import("../../src/lib/user-data/principal.ts");
    const guest = await actorFor(
      new Request("http://localhost:3000/api/shares"),
      true,
    );
    const guestCookie = guest.cookie.split(";")[0];
    const accountActor = await actorFor(
      new Request("http://localhost:3000/api/shares", {
        headers: { cookie: login.cookie + "; " + guestCookie },
      }),
      true,
    );
    assert.deepEqual(accountActor.owners, ["u:" + login.data.user.id]);
    const signedOutActor = await actorFor(
      new Request("http://localhost:3000/api/shares", {
        headers: { cookie: guestCookie },
      }),
    );
    assert.deepEqual(signedOutActor.owners, [guest.id]);
    await pool.query(
      domainSQL(readFileSync("db/migrations/20261114_sync.sql", "utf8")),
    );
    await pool.query(
      domainSQL(readFileSync("db/migrations/20261114_telemetry.sql", "utf8")),
    );
    const { recordProductEvents } =
      await import("../../src/lib/user-data/telemetry.ts");
    const { readAccountDevices } =
      await import("../../src/lib/auth/devices.ts");
    const { randomUUID } = await import("node:crypto");
    delete process.env.USER_DATA_TRUSTED_PROXY_HEADER;
    await recordProductEvents(
      new Headers({ cookie: login.cookie, "user-agent": "Device fixture" }),
      {
        device: randomUUID(),
        session: randomUUID(),
        language: "en",
        languages: ["en"],
        timeZone: "America/New_York",
        viewport: "small",
        context: {
          screen: { width: 390, height: 844, ratio: 2, depth: 24 },
          viewport: { width: 390, height: 844 },
          platform: "Test OS",
          model: "Test device",
          cores: 4,
          touch: 1,
          cookies: true,
          online: true,
          colorScheme: "light",
          reducedMotion: false,
          network: {
            ip: "203.0.113.8",
            source: "geojs",
            country: "Test",
            city: "Example city",
          },
        },
        events: [],
      },
      db,
    );
    const deviceList = await readAccountDevices(
      login.data.user.id,
      pool,
      async () => null,
    );
    assert.ok(
      deviceList.some(
        (row) =>
          row.ip === "203.0.113.8" &&
          row.context.model === "Test device" &&
          row.source === "browser-reported:geojs",
      ),
    );
    assert.ok(deviceList.every((row) => !Object.hasOwn(row, "token")));
    assert.equal(
      (await request("/get-session", null, { cookie: login.cookie })).data.user
        .email,
      email,
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM account")).rows[0].n,
      0,
    );
    const noPassword = await request("/sign-in/email", { email, password });
    assert.equal(noPassword.status, 401);
    assert.equal(noPassword.data.code, "INVALID_EMAIL_OR_PASSWORD");
    assert.notEqual(
      (await request("/sign-in/email-otp", { email, otp })).status,
      200,
    );

    // Advance only the disposable fixture's mail cooldown; no real messages are sent.
    await pool.query(
      "UPDATE cooldown_bucket SET expires_at=now()-interval '1 second'",
    );
    assert.equal(
      (await request("/email-otp/request-password-reset", { email })).status,
      200,
    );
    assert.equal(
      (
        await request("/email-otp/reset-password", {
          email,
          otp: codes.get(email),
          password,
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/sign-in/email", { email, password })).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/sign-in/email",
          { email, password },
          { origin: "http://127.0.0.1:3000" },
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/sign-in/email",
          { email, password },
          {
            origin: "https://evil.example",
            headers: { "x-forwarded-host": "localhost:3000" },
          },
        )
      ).status,
      403,
    );

    // A software authenticator signs real WebAuthn assertions with user verification.
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const jwk = publicKey.export({ format: "jwk" });
    const cose = Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
      Buffer.from(jwk.x, "base64url"),
      Buffer.from([0x22, 0x58, 0x20]),
      Buffer.from(jwk.y, "base64url"),
    ]);
    const credentialID = randomBytes(32).toString("base64url");
    await pool.query(
      'INSERT INTO passkey(id,"publicKey","userId","credentialID",counter,"deviceType","backedUp",transports,"createdAt") VALUES($1,$2,$3,$4,0,$5,false,$6,now())',
      [
        randomBytes(16).toString("hex"),
        cose.toString("base64"),
        login.data.user.id,
        credentialID,
        "singleDevice",
        "internal",
      ],
    );
    async function passkey(emailHeader, count) {
      const options = await request("/passkey/generate-authenticate-options");
      assert.equal(options.status, 200);
      const client = Buffer.from(
        JSON.stringify({
          type: "webauthn.get",
          challenge: options.data.challenge,
          origin: "http://localhost:3000",
        }),
      );
      const counter = Buffer.alloc(4);
      counter.writeUInt32BE(count);
      const authenticatorData = Buffer.concat([
        createHash("sha256").update("localhost").digest(),
        Buffer.from([0x05]),
        counter,
      ]);
      const signature = sign(
        "sha256",
        Buffer.concat([
          authenticatorData,
          createHash("sha256").update(client).digest(),
        ]),
        privateKey,
      );
      return request(
        "/passkey/verify-authentication",
        {
          response: {
            id: credentialID,
            rawId: credentialID,
            type: "public-key",
            response: {
              clientDataJSON: client.toString("base64url"),
              authenticatorData: authenticatorData.toString("base64url"),
              signature: signature.toString("base64url"),
            },
            clientExtensionResults: {},
          },
        },
        {
          cookie: options.cookie,
          headers: emailHeader ? { "x-waho-passkey-email": emailHeader } : {},
        },
      );
    }
    const missingPolicy = await request(
      "/sign-in/email",
      { email, password },
      { headers: { "x-waho-policy-version": "" } },
    );
    assert.equal(missingPolicy.status, 400);
    assert.equal(missingPolicy.data.code, "POLICY_REQUIRED");
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM policy_acceptance"))
        .rows[0].n,
      1,
    );
    const { sendInstitutionCode, verifyInstitutionCode, institutionalStatus } =
      await import("../../src/lib/auth/institution.ts");
    let schoolCode = "";
    const deliver = async (_email, code) => {
      schoolCode = code;
    };
    const school = "student.1@osu.edu";
    await sendInstitutionCode(
      login.data.user.id,
      school,
      "en",
      "test-source",
      deliver,
    );
    for (let i = 0; i < 3; i++)
      await assert.rejects(
        verifyInstitutionCode(
          login.data.user.id,
          schoolCode === "000000" ? "111111" : "000000",
        ),
        (e) => e.code === "invalid_code",
      );
    await assert.rejects(
      verifyInstitutionCode(login.data.user.id, schoolCode),
      (e) => e.code === "invalid_code",
    );
    await assert.rejects(
      sendInstitutionCode(
        login.data.user.id,
        school,
        "en",
        "test-source",
        deliver,
      ),
      (e) => e.status === 429,
    );
    await pool.query(
      "UPDATE cooldown_bucket SET expires_at=now()-interval '1 second'",
    );
    await sendInstitutionCode(
      login.data.user.id,
      school,
      "en",
      "test-source",
      deliver,
    );
    await verifyInstitutionCode(login.data.user.id, schoolCode);
    await assert.rejects(
      verifyInstitutionCode(login.data.user.id, schoolCode),
      (e) => e.code === "invalid_code",
    );
    assert.equal(
      (await institutionalStatus({ ...login.data.user, emailVerified: true }))
        .verified,
      true,
    );
    assert.equal(
      (
        await institutionalStatus({
          id: "unused",
          email: "member@osumc.edu",
          emailVerified: true,
        })
      ).primary,
      true,
    );
    const sessionsBefore = (
      await pool.query("SELECT count(*)::int AS n FROM session")
    ).rows[0].n;
    for (const badEmail of [undefined, "another@example.invalid"]) {
      const mismatch = await passkey(badEmail, 1);
      assert.equal(mismatch.status, 401, JSON.stringify(mismatch.data));
      assert.equal(mismatch.data.code, "PASSKEY_EMAIL_MISMATCH");
      assert.ok(!mismatch.cookie.includes("session_token"));
    }
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM session")).rows[0].n,
      sessionsBefore,
    );
    const signedIn = await passkey("  PASSWORDLESS@EXAMPLE.INVALID  ", 1);
    assert.equal(signedIn.status, 200, JSON.stringify(signedIn.data));
    assert.equal(signedIn.data.user.id, login.data.user.id);
    assert.match(signedIn.cookie, /session_token/);
  },
);
