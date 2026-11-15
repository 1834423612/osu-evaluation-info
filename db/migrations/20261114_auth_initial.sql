BEGIN;
CREATE SCHEMA IF NOT EXISTS osu_account;
SET LOCAL search_path = osu_account;
CREATE SCHEMA IF NOT EXISTS osu_user;
CREATE TABLE IF NOT EXISTS osu_user.rate_bucket (
  bucket text NOT NULL,
  window_start bigint NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS rate_bucket_expiry ON osu_user.rate_bucket(expires_at);
CREATE TABLE IF NOT EXISTS osu_user.security_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  principal text,
  action text NOT NULL,
  network_digest text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_event_time ON osu_user.security_event(created_at);

create table "user" ("id" text not null primary key, "name" text not null, "recoveryGeneration" text, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" boolean not null, "transports" text, "createdAt" timestamptz, "aaguid" text);

create table "rate_limit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "session_userId_idx" on "session" ("userId");

create index "account_userId_idx" on "account" ("userId");

create index "verification_identifier_idx" on "verification" ("identifier");

create index "passkey_userId_idx" on "passkey" ("userId");

create index "passkey_credentialID_idx" on "passkey" ("credentialID");
CREATE UNIQUE INDEX IF NOT EXISTS "passkey_credential_unique" ON "passkey" ("credentialID");
CREATE TABLE IF NOT EXISTS "osu_user".installation (name text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()); INSERT INTO "osu_user".installation(name) VALUES ('auth:') ON CONFLICT DO NOTHING;
COMMIT;
