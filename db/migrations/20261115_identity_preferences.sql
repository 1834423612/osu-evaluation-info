CREATE TABLE IF NOT EXISTS osu_identity.policy_acceptance (
  user_id text NOT NULL REFERENCES osu_identity."user"(id) ON DELETE CASCADE,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, version)
);
CREATE TABLE IF NOT EXISTS osu_identity.institutional_email (
  user_id text PRIMARY KEY REFERENCES osu_identity."user"(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS osu_identity.institutional_challenge (
  user_id text PRIMARY KEY REFERENCES osu_identity."user"(id) ON DELETE CASCADE,
  email text NOT NULL,
  otp_digest text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS osu_identity.public_profile (
  user_id text PRIMARY KEY REFERENCES osu_identity."user"(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  show_name boolean NOT NULL DEFAULT false,
  show_nickname boolean NOT NULL DEFAULT false,
  show_email boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
