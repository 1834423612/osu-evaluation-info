# Administrator accounts

[简体中文](zh-CN/admin-roles.md) · [Documentation](README.md)

Administrators are existing front-end accounts with an `admin` role in the identity database. `/admin/users` searches accounts by name, email or exact account ID and shows role changes with the operator, reason and time. `/admin/rmp` uses the same role check.

Production access requires a verified account, a sign-in within the previous 30 minutes, a current database administrator role and the existing administrator unlock. Roles are read on every request. Revocation takes effect on the next request, including requests using an existing session. Production writes require a same-origin JSON request.

## Initialize and grant the first administrator

Run the account migration against the intended environment. It includes `db/migrations/20261126_admin_roles.sql`, after the authentication user table exists:

```sh
pnpm account:migrate --production --apply
node scripts/user-data/admin-roles.mjs list --production --search 'name or email'
node scripts/user-data/admin-roles.mjs grant --production --user-id EXISTING_ACCOUNT_ID --actor OPERATOR_NAME --reason 'Initial administrator approved'
```

The grant command above prints a plan. Review its account ID, email and environment, then repeat with `--apply` to write the grant. The first administrator is never chosen automatically. Only an operator who already has database access can bootstrap it. Account listings contain private email addresses and must stay in the operator's local terminal.

Subsequent administrators can use `/admin/users`, or the same CLI. CLI changes always require an explicit account ID, operator and reason of 8–500 characters. `revoke` uses the same options as `grant`. `audit --production --page 1` lists permission history. Omitting `--production` selects the development environment; development role helpers reject the production `osu_identity` schema.

## Storage and direct database operations

`account_role.user_id` references the configured authentication `user.id`. Roles, `account_role_audit` and `admin_role_guard` live in `osu_identity`, or `osu_identity_dev` in development, and honor `AUTH_SCHEMA` and `AUTH_TABLE_PREFIX`. They are included in account initialization and user-data backups.

For a direct database operation with the default schema and prefix, use the audited function rather than editing records:

```sql
SELECT osu_identity.change_admin_role(
  'EXISTING_ACCOUNT_ID', 'grant', 'operator:OPERATOR_NAME',
  'Initial administrator approved', NULL
);
```

Use `revoke` for removal. The SQL function serializes role changes and rechecks an acting administrator while holding its lock. Database triggers reject removal of the final administrator, role updates and audit modification or deletion. Revoke an administrator role before deleting that account; the final administrator must be replaced first. Audit records retain account IDs, operators and reasons as security records.

## Verification

```sh
node --test tests/auth/admin-roles.test.mjs tests/user-data/backup.test.mjs
ADMIN_ROLES_DATABASE_TEST=1 node --test tests/auth/admin-roles-postgres.integration.test.mjs
```

The first command uses in-memory PostgreSQL for role, foreign-key, audit, namespace and origin checks. The opt-in command requires `DATABASE_URL`, creates and removes a temporary schema, and checks concurrent revocation and an actor revoked while waiting. It does not modify existing accounts or roles. `tests/auth/admin-users.browser.mjs` exercises the page with intercepted account APIs; set `ADMIN_TEST_BASE_URL` and, when needed, `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Its simulated grants never reach a database. `ADMIN_TEST_EXPECT_PRODUCTION=1` also checks that unauthenticated GET and POST requests are refused by the production preview.
