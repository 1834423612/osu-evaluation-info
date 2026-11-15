import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInstitutionalEmail,
  publicAuthor,
} from "../../src/lib/auth/institutional-policy.ts";
test("school mailbox checks reject deceptive suffixes and public authors expose only opted-in fields", () => {
  for (const email of ["name.1@osu.edu", "USER@OSUMC.EDU"])
    assert.equal(isInstitutionalEmail(email), true);
  for (const email of [
    "user@osu.edu.evil.example",
    "user@evil-osu.edu",
    "user@gmail.com",
    "@osu.edu",
    "user@osu.edu@evil.example",
  ])
    assert.equal(isInstitutionalEmail(email), false);
  const account = {
    id: "private-id",
    name: "Nickname",
    email: "private@example.invalid",
    ip: "203.0.113.2",
    password: "never-public",
  };
  assert.deepEqual(
    publicAuthor(account, {
      display_name: "Public name",
      show_name: false,
      show_nickname: false,
      show_email: false,
    }),
    {},
  );
  assert.deepEqual(
    publicAuthor(account, {
      display_name: "Public name",
      show_name: true,
      show_nickname: true,
      show_email: false,
    }),
    { name: "Public name", nickname: "Nickname" },
  );
  assert.deepEqual(
    publicAuthor(account, {
      display_name: "",
      show_name: false,
      show_nickname: false,
      show_email: true,
    }),
    { email: account.email },
  );
});
