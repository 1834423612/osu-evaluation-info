BEGIN;
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

create table "ca_user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "ca_session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "ca_user" ("id") on delete cascade);

create table "ca_account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "ca_user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "ca_verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "ca_passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "ca_user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" boolean not null, "transports" text, "createdAt" timestamptz, "aaguid" text);

create table "ca_rate_limit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "ca_session_userId_idx" on "ca_session" ("userId");

create index "ca_account_userId_idx" on "ca_account" ("userId");

create index "ca_verification_identifier_idx" on "ca_verification" ("identifier");

create index "ca_passkey_userId_idx" on "ca_passkey" ("userId");

create index "ca_passkey_credentialID_idx" on "ca_passkey" ("credentialID");
CREATE UNIQUE INDEX IF NOT EXISTS "ca_passkey_credential_unique" ON "ca_passkey" ("credentialID");
CREATE TABLE IF NOT EXISTS "osu_user".installation (name text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()); INSERT INTO "osu_user".installation(name) VALUES ('auth:ca_') ON CONFLICT DO NOTHING;
COMMIT;
