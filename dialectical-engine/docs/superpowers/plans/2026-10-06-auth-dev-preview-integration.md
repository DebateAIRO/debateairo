# Authentication Dev and Preview Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Preserve the user's selected subagent-driven execution; do not request approval again for the explicitly requested merge/push/preview work.

**Goal:** Integrate the reviewed authentication changes with fresh Dev, push Dev normally, and update the existing V3 preview with verified compatible artifacts.
**Architecture:** Reuse the existing clean isolated auth worktree. One implementer owns merge resolution and a fresh reviewer verifies its integration delta; the controller owns publication and preview operation after source/target preflight. The preview has separate GLM API/runner and recovery103 UI overlays that must survive replacement.
**Tech Stack:** Git, pnpm11, Node26.8.2, TypeScript/Next, PostgreSQL native migration/register, OVH/Caddy/systemd.
**Spec:** ../specs/2026-10-06-auth-dev-preview-integration.md; approved auth requirements remain in ../specs/2026-10-04-account-onboarding-passkeys-design.md.

## Global Constraints

- Fresh origin/dev is7b91df4f101a3880ef57e11231443689dabac0e1; auth is cba421c5fb8ede48a19ce0de3ca09b046f47f6b8. Re-fetch before publishing if remote changes; never force-push.
- Source and Dev functionality/security boundaries both survive; no broad ours/theirs selection.
- Phone manual/unverified/encrypted; no SMS/provider phone retrieval/uniqueness denial or phone-only recovery. Five-minute exact purpose/account/session proof remains.
- Consumer14day idle/30day absolute; stronger staff/Owner rules unchanged; no seven-day exception.
- Verify email links24hours; resend60seconds/max3perrollinghour including first/failed sends; no threshold/GC/KDF/count weakening.
- Preserve exact installed external0103; reconcile overlapping source prefixes with tested ordering and actual ledger semantics before deployment.
- No secrets/private alias/user-record output, no unsafe original auth25b/59e4/855 ancestry; private historical custody remains outside Git refs.
- No main/production cutover, paid activation, unapproved real mail or irreversible schema/data guess. The explicit new instruction authorizes Dev push and preview update, not invented operator facts.

## Review Focus

- A region-selected new account must retain encrypted manual phone, age/legal gates and current schema/client shape.
- A billing/security change must still require the current exact target/session proof under the new session producer.
- Fresh migration and installed103 upgrade must retain history/grants and include both region and auth capabilities without number collisions.
- Every locale must retain both parents' unrelated keys and the exact approved headline/auth guidance.
- Live overlay/register/relay incompatibility must be detected before switching preview, with an actually usable forward-compatible rollback.

### Task 1: Merge, resolve and verify integrated source

**Files:** Conflict inventory from the read-only merge-tree preflight (API main/index/registration/sessions/mail, auth/shared UI, contract/DB/kernel/register/providers, multilingual catalogs, support KB, migration/upgrade and auth fixtures, package/lock state). Preserve unaffected incoming files automatically; only semantic integration repairs and proven fixtures are in scope.
**Interfaces:** Consumes both strict contract schemas and established SQL capability owners/entry points. Produces a normal merge descendant of both frozen parent tips, current generated contract/KB/register/locale bindings, and an exact verification report.

- [ ] Read the exact conflict inventory and both parent implementations. Establish a migration-number/order proposal for controller adjudication before renumbering or touching installed-history bytes.
- [ ] Merge origin/dev with --no-commit --no-ff in the existing worktree, resolve every conflict preserving both approved feature sets. Use meaningful existing tests or a focused failing test for an actual new integration seam, not mirrored tests for trivial metadata.
- [ ] Reconcile strict registration/region/phone, session/sensitive action/billing, mail current-channel/cohort and generated label/attestation interfaces. Retain old removed-field fixtures only where still meaningful; no assertion weakening to obtain green.
- [ ] Run proper engine/UI compilers, generated contract/KB parity and build; run complete affected auth/region/billing/Help files and native fresh/installed103 migration tests. Record source digests, exact argv/output/exit and cleanup. Original unrelated/resource failures stay visible; new failures require source-backed diagnosis.
- [ ] Self-review the actual merge delta, commit the merge/integration corrections normally, and report all concerns. Do not push/deploy. Controller supplies one fresh integration review over the merge resolutions/new repairs, not a duplicate entire Dev audit.

### Task 2: Publish source and update preview

**Files/targets:** origin refs/heads/dev; existing v3-preview.dezbatere.ro API/runner/UI release pointers, native ledger/register and reviewed mail/Turnstile launch configuration. No v3-preview Git branch is to be invented.
**Interfaces:** Consumes reviewed integrated commit and actual readonly preview preflight. Produces verified remote Dev head and preview served revision/health, or a specific unresolved target dependency with evidence.

- [ ] Controller checks source review/actual integrated verification and re-fetches Dev; merge any new remote changes with proper cover before normal push.
- [ ] Push only the explicit integrated commit to dev; independently query remote head/ancestry. No force or all-ref push; no PR required unless branch policy mandates it.
- [ ] Read current preview service roots, public source/ledger/shape/register metadata and overlay interfaces without dumping secrets/user rows. Prepare exact artifact transfer, quiescence/native upgrade/register selection, preserved private config and tested compatible rollback.
- [ ] Execute only concretely supported preview changes within the user's explicit request; stop for missing irreversible/security-sensitive facts rather than guessing schema lineage or destroying data. Do not declare unknown legal/device/inbox checks passed.
- [ ] Check preview health, API/UI served revision, sign-in/signup/recovery/security/locale paths and applicable source/transport checks; retain operational receipts with sensitive output excluded. Report remote source and preview outcomes separately.
