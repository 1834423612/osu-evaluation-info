# Development account pairing

English · [简体中文](zh-CN/development-account.md)

Pairing connects two verified accounts for testing private favorites, folders, planning reports and calendars across isolated databases. It does not copy passwords, sessions, email verification, public shares or analytics. Development and production retain separate identities and schemas.

1. Apply `pnpm user-data:migrate --apply` in each environment. Production uses its database configuration and `--production`.
2. On development, set `DEVELOPMENT_PRODUCTION_ORIGIN` to the production HTTPS origin without a path. `SITE_URL` is the fallback. This setting alone grants no account access.
3. In the production account's **Account and devices → Development account link**, create a pairing credential. Paste the one-time displayed value into the verified development account's pairing form.
4. Development pulls production data automatically during sync and shows a **Development account** navigation label. Development edits never automatically overwrite production.
5. To write back, use **Preview merge to production**, review counts and conflict paths, then **Merge these changes to production**. Pending favorite sync or unresolved conflicts block this action. Changed data invalidates the preview; generate a new one.

Merging uses stable IDs and a three-way base. Independent additions and field changes merge; competing edits remain conflicts. Aligning the conflicting fields in both environments resolves them on the next preview. Production compares planning revision and favorite cursor in one transaction; capacity or version failure rolls back the whole account change.

Credentials expire after 30 days and can be revoked from production. Each account supports five active credentials. Disconnecting development removes its saved credential without deleting either account's data; revoke the production credential to stop its access completely.

Production stores a credential digest. Development stores an AES-256-GCM encrypted copy derived from the server secret because subsequent pulls need the credential. The server can decrypt it; this is not end-to-end encryption. Rotating `USER_DATA_SECRET` invalidates stored links, requiring pairing again. Restrict development database access because pairing deliberately copies private data there.

Private `development_grant` and `development_link` tables belong to `osu_identity` / `osu_identity_dev`, are included in domain backups, and are cleaned when expired, revoked or orphaned. The remote endpoint verifies account existence and verification and bounds requests, time and bytes. It uses one configured production origin and refuses redirects.

[Integration tests](testing.md) use in-memory data and a synthetic production transport. Both environments must deploy the endpoint before real pairing; a preview alone cannot connect to a production release that lacks it.
