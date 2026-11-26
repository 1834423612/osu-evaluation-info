# RMP review workspace

English · [简体中文](../zh-CN/rmp/administration.md)

`/admin/rmp` manages course-label associations. It shows the original RMP label, profile, campus, current match, reasons, official teaching evidence, candidates and review samples. Filters combine course code or official title, professor/profile ID, review/evidence keywords, state and campus. Pagination is bounded. Desktop uses a compact table; mobile keeps core identity and state visible and opens the full record in a detail panel.

## Evidence and human decisions

A numeric label such as `1131` has no subject. The matcher uses an accepted professor identity at the same campus, its official taught subjects and exact official course inventory to find candidates. A department name alone can supply suggestions, but cannot establish a numeric association. Multiple matching subjects remain ambiguous even if one has an exact observed teaching fact. Numeric inference never supplies evidence back into professor-identity verification.

A course-label association does not prove that the professor officially taught that course. Inferred associations retain their provenance and unconfirmed profiles remain unconfirmed leads. The original review text, labels, professor IDs and identity mappings are retained.

Manual decisions have the key **profile + campus + normalized original label**, and affect every active review in that group. Preview the review count and samples before binding; mixed historical uses of the same number should remain ambiguous. Bind, unbind and reject are durable overrides; unbind/reject also suppress the old exact-key fallback for that group. Reconciliation and schema reruns do not remove decisions. Concurrent changes return a conflict instead of overwriting a newer administrator decision.

Batch controls and editable reason templates support quick review of clear cases, with an explicit preview of each target and affected group before confirmation. AI assistance produces pending suggestions for human review; it never assigns production course bindings by itself. See [AI review assistance](assistance.md) and [interface references](../design/reconciliation.md).

## Install and access

Install the reviewed production structures before deploying administration features:

```bash
: "${REPORT_DIR:?Set REPORT_DIR to a private operator report directory}"
mkdir -p "$REPORT_DIR"
pnpm rmp:admin:migrate --production
pnpm account:migrate --production --output "$REPORT_DIR/account-migration.sql"
# After reviewing the generated account migration:
pnpm account:migrate --production --apply
```

Production access requires an existing verified account, a current database administrator role, a login session created within 30 minutes and the existing maintenance-key unlock. The locked page links to Account and Unlock administrator tools. There is no email allowlist and no first-user-wins behavior. [Administrator roles](../admin-roles.md) documents controlled first-user grants, account management, revocation and audit.

For local development:

```bash
pnpm rmp:admin:migrate
RMP_ADMIN_SCHEMA=osu_rmp_dev pnpm dev
```

The development launcher proves the actual incoming socket and preserves its original peer across internal proxy hops. Only development plus verified loopback or Tailscale `100.64.0.0/10` gets relaxed access. Client-supplied Host or forwarded-address headers do not establish permission. Direct `next dev` does not install this proof. The UI marks relaxed access prominently.

Development decisions live in `osu_rmp_dev`. With `RMP_ADMIN_SCHEMA=osu_rmp_dev`, public development queries also preview its overrides. Without that setting, the administrator still writes isolated decisions while public development pages read the production source view; the warning explains the distinction. Production decisions live in `osu_rmp`.

## Reconcile existing course labels

Install the Python dependencies from `scripts/rmp/requirements.txt` in your environment. A course-only run is read-only by default:

```bash
pnpm rmp:reconcile --output "$REPORT_DIR/course-plan.json"
node scripts/rmp/compare_course_plan.mjs "$REPORT_DIR/course-plan.json"
```

Review all transitions, not only newly accepted records. Applying requires both fingerprints returned by that reviewed plan:

```bash
pnpm rmp:reconcile --apply \
  --expected-plan-sha256 "$PLAN_SHA256" \
  --expected-before-sha256 "$BEFORE_SHA256" \
  --output "$REPORT_DIR/course-apply.json"
```

A shared advisory lock serializes mapping refreshes and manual writes. Before mutation, the tool persists the full plan and previous derived/manual snapshots. It commits derived changes as one transaction and writes a separate receipt. Errors identify their phase and safe SQLSTATE/schema/table/constraint details; receipt failures after a commit are not described as rolled-back updates. Identity, raw-source and manual-decision changes are outside this command.

If restoring derived rows after a committed run, use the recorded previous rows through the same locked course-save transaction. Do not delete or roll back later manual decisions. A full backup of the RMP domain is still required; a reconciliation before-image is not a replacement for it.

## Retention and visible updates

Back up the whole administration schema, including `course_decision`, `course_decision_audit`, `admin_migration` and assistance records/routines. Production uses `osu_rmp`, development `osu_rmp_dev`. Decisions and audit are retained; deletion/truncation is blocked, and audit updates are blocked. Restore the domain with its functions, triggers and views, rather than restoring only derived matching tables. Identity-role backup/restore is handled separately in the identity domain.

Administration details read current state. Existing public summary caches can take up to five minutes to reflect a binding. Repeated collection retains the override marker and audit provenance.

## Recorded read-only plan: November 26, 2026

The audit contained 37,020 course-label records; 3,187 had numeric labels. Before the proposed rule change, 11,545 were accepted, 533 ambiguous and 24,942 unresolved. The reviewed plan had these state transitions:

| Transition | Groups | Interpretation |
| --- | ---: | --- |
| Unresolved → accepted | 157 | A unique official course within verified same-campus taught subjects. |
| Accepted → ambiguous | 18 | Several possible subjects share the number. |
| Accepted → unresolved | 465 | Mostly earlier department-only inference; 13 lacked the required official course evidence. |
| Unresolved → ambiguous | 11 | Several candidates now identified, without choosing one. |

The proposed totals are 11,219 accepted, 562 ambiguous and 25,239 unresolved. Identity, source and manual-decision changes are zero. Other differences update candidate/reason metadata without changing accepted course keys.

A same-query serving comparison, preserving the old exact/alias union, found 551 new review/course/campus pairs and 1,114 removed weak pairs. Pairs passing the existing verified-identity gates changed from 64,765 to 65,088. These are query pairs, not distinct people or new reviews. This section describes a read-only plan; it does not assert that the production update has been applied.

## Official evidence and stale proposals

Manual binding and AI export use the same course/campus validation: published catalogs plus official teaching-evaluation history. A historical course is not rejected simply because the current catalog lacks it. Title suggestions read the latest complete published generation per term; exact validation retains historical published rows and active same-campus teaching facts. Results identify source and term.

The record fingerprint includes raw profiles/reviews, accepted identity, live official teaching evidence and the current manual version. A teaching-fact change invalidates an old batch preview or AI proposal even before the automatic mapper runs again.
