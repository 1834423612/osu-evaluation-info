import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getDatabasePool } from "../db.ts";
import { userDataTable as table } from "../user-data/namespace.ts";
import { checkBudget, reserveCooldown } from "../user-data/rate-limit.ts";
import { UserDataError } from "../user-data/http.ts";
import { sendSignInCode } from "./mail.ts";
import { isInstitutionalEmail } from "./institutional-policy.ts";
export async function institutionalStatus(user: {
  id: string;
  email: string;
  emailVerified: boolean;
}) {
  if (user.emailVerified && isInstitutionalEmail(user.email))
    return { verified: true, email: user.email, primary: true };
  const r = await getDatabasePool().query(
    "SELECT email,verified_at FROM " +
      table("institutional_email") +
      " WHERE user_id=$1",
    [user.id],
  );
  return {
    verified: !!r.rows[0],
    email: r.rows[0]?.email ?? null,
    verifiedAt: r.rows[0]?.verified_at ?? null,
    primary: false,
  };
}
export async function requireInstitutionalIdentity(user: {
  id: string;
  email: string;
  emailVerified: boolean;
}) {
  if (!user.emailVerified || !(await institutionalStatus(user)).verified)
    throw new UserDataError("institution_required", 403);
}
const digest = (id: string, email: string, code: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update("institution:" + id + ":" + email + ":" + code)
    .digest("hex");
export async function sendInstitutionCode(
  userId: string,
  rawEmail: string,
  locale: string,
  source: string,
  deliver = sendSignInCode,
) {
  const email = rawEmail.trim().toLowerCase();
  if (!isInstitutionalEmail(email))
    throw new UserDataError("institution_email", 400);
  await reserveCooldown("mail-cooldown", email, 60);
  await checkBudget("mail-address", email, 3600, 6);
  await checkBudget("mail-source", source, 3600, 30);
  await checkBudget("mail-global", "all", 3600, 1000);
  await checkBudget("institution-account", userId, 3600, 6);
  const code = String(randomInt(1000000)).padStart(6, "0");
  await getDatabasePool().query(
    "INSERT INTO " +
      table("institutional_challenge") +
      "(user_id,email,otp_digest,attempts,expires_at) VALUES($1,$2,$3,0,now()+interval '5 minutes') ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,otp_digest=EXCLUDED.otp_digest,attempts=0,expires_at=EXCLUDED.expires_at",
    [userId, email, digest(userId, email, code)],
  );
  await deliver(email, code, locale);
}
export async function verifyInstitutionCode(userId: string, code: string) {
  const db = await getDatabasePool().connect();
  let invalid = false;
  try {
    await db.query("BEGIN");
    const r = await db.query(
      "SELECT email,otp_digest,attempts,expires_at FROM " +
        table("institutional_challenge") +
        " WHERE user_id=$1 FOR UPDATE",
      [userId],
    );
    const row = r.rows[0];
    if (
      !row ||
      row.attempts >= 3 ||
      new Date(row.expires_at).getTime() <= Date.now()
    )
      invalid = true;
    else {
      const expected = Buffer.from(row.otp_digest, "hex"),
        actual = Buffer.from(digest(userId, row.email, code), "hex");
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      ) {
        invalid = true;
        await db.query(
          "UPDATE " +
            table("institutional_challenge") +
            " SET attempts=attempts+1 WHERE user_id=$1",
          [userId],
        );
      } else {
        await db.query(
          "INSERT INTO " +
            table("institutional_email") +
            "(user_id,email) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,verified_at=now()",
          [userId, row.email],
        );
        await db.query(
          "DELETE FROM " +
            table("institutional_challenge") +
            " WHERE user_id=$1",
          [userId],
        );
      }
    }
    await db.query("COMMIT");
  } catch {
    await db.query("ROLLBACK");
    throw new UserDataError("verification_failed", 400);
  } finally {
    db.release();
  }
  if (invalid) throw new UserDataError("invalid_code", 400);
}
