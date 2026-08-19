# S2 — Personal-Data & Deletion Inventory (research asset, Wave 1)

Read-only audit, 2026-08-17. Live-DB claims verified with `SET default_transaction_read_only = on` SELECTs against `127.0.0.1:55432/debateai_acceptance`.

## 0. Authoritative table count: **79** base tables across 8 schemas

`packages/db/src/schema.ts` (968 lines) declares only **63** — it is a *partial* Drizzle mirror, **not** the source of truth. `migrations/*.sql` is authoritative (79 `CREATE TABLE`), confirmed against `information_schema.tables`: core 21, serve 11, evaluator 15, ledger 10, evidence 8, memory 7, scorecard 5, register 2.

> **G0 (schema drift):** 16 tables exist in migrations but not in `schema.ts` — incl. `core.run_progress_event`, `core.stranger_restatement`, `core.investigation_request`(present), `core.provider_probe`, `ledger.decision_record`, `register.register_version`, `evaluator.consumer_refresh_receipt`. **Any ROPA built from `schema.ts` alone under-reports by 20%.**

## 1. Risk-bearing tables (condensed; full detail in the audit)

**core (21)** — `core.run` is the root: **`question_line`** (the user's typed question, NOT NULL), `asker_id`, `session_id`, **`ask_contract` jsonb** (see §1.9), `asker_risk_tier`. Also `core.node.claim_text` (model argument, empirically echoes the question), **`core.stranger_restatement.restatement_text`** (24/64 rows echo the question verbatim), **`core.investigation_request.user_input`** (free text typed by the user; 0 rows today), `core.value_hinge.weight_owner` (free text, may name a person), `core.run_progress_event.value_json` (carries `constructed_prompt`).

**ledger (10)** — **`ledger.raw_artifact.raw_text`**: verbatim provider response bodies captured at `packages/providers/src/index.ts:234`, persisted `packages/ledger/src/index.ts:211-221`, on **every** attempt including failures. **Empirically embeds the question: 33/151 and 35/151 rows.** Also `ledger.node_review.reasons` (model prose), `ledger.overlay_run.weight_owner`.

**serve (11)** — **`serve.composed_text.segments`** (4 rows contain question phrases), `serve.fact_bundle.facts`/`residual_objections`, `serve.answer.memory_disclosure` (cross-run linkage).

**memory (7)** — **`memory.question_key.canonical_question_text`**: a **second full copy** of the question (7 rows, 5 distinct). **`memory.pull_record.payload_snapshot`** contains `questionLine` verbatim (`packages/memory/src/index.ts:422`) — 0 rows today, **latent third copy**. `memory.memory_link_event.actor_ref` receives `asker:${asker_id}`. `memory.alias_row.surface`/`canonical` — user-confirmed terms, may be proper nouns.

**evidence (8)** — `query_set.queries`, `query_amendment.amended_query`, `absence_row.query_text` (queries derived from the question), **`evidence_item.excerpt`** (third-party source text → copyright + others' personal data).

**scorecard (5)** — `routing_decision.session_id`, `session_assignment.session_id`.

**evaluator (15)** — mostly model telemetry, but `consumer_selection.selected_by` receives `session.asker_id`, `consumer_output.summary` is model prose, and **most rows carry `run_id` → joinable back to an asker via `core.run`**.

### 1.9 The `ask_contract` blind spot — **highest-value personal data, and not a column**

`AskRequestSchema` (`packages/contract/src/index.ts:107-121`) requires four free-text fields serialized whole into **`core.run.ask_contract` jsonb** (`packages/db/src/index.ts:347,360`):

```
decision_owner: z.string().trim().min(1),   // :114
action_owner:   z.string().trim().min(1),   // :115
decision_scope: z.string().trim().min(1),   // :116
steering_annotations: z.array(z.string().min(1))  // :121
```

`decision_owner`/`action_owner` are **required** free-text inputs in the UI form (`web/app/new/page.tsx:57-58`) — fields **designed to hold the names of real people** (who owns the decision, who will act on it). Live values are placeholders today; the schema imposes no constraint. **These are third-party personal data → GDPR Art. 14 notice obligations that no column-level review would surface.**

## 2. The question's travel path — **9 locations, 3 verbatim copies**

| # | Location | Verified |
|---|---|---|
| 1 | `core.run.question_line` (canonical) | 7 rows |
| 2 | `memory.question_key.canonical_question_text` (2nd full copy) | 7 rows, 5 distinct |
| 3 | `memory.pull_record.payload_snapshot→questionLine` (3rd copy) | 0 rows (latent) |
| 4 | `ledger.raw_artifact.raw_text` (model echoes it back) | **33+35 of 151** |
| 5 | `core.node.claim_text` | **11+16 of 64** |
| 6 | `core.stranger_restatement.restatement_text` | **24 of 64** |
| 7 | `serve.composed_text.segments` | **4 rows** |
| 8 | `evidence.query_set/query_amendment/absence_row` | latent |
| 9 | `core.run.ask_contract`, `run_progress_event.value_json` | latent |

**The prompts themselves are NOT persisted** — only `inputHash = sha256(packet)` (`packages/providers/src/index.ts:214`). The system records **what the model said but not what it was asked**: limits stored volume, but a DSAR cannot reconstruct what was sent to third parties, and incident forensics is impossible.

**Egress:** the question goes verbatim to providers as the user message (`packages/judgement/src/index.ts:122`, re-interpolated at `:197` and `apps/runner/src/index.ts:1693-1696,1718-1721,1827,1833,1873,2319`; evaluator truncates to 4096 B). **No redaction, no anonymisation, no zero-retention header anywhere.**

**Consequence: there is no single point of erasure.** Nulling `question_line` leaves the question in ledger, node, restatement, and composed-text rows, with no marker distinguishing an echo from model prose.

## 3. Deletion capability TODAY: **NONE — by construction**

**Trigger** (`migrations/0000_s00.sql:31-39`) — unconditional, no branch:
```sql
CREATE OR REPLACE FUNCTION core.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE='55000'; END; $$;
```
Attached `BEFORE UPDATE OR DELETE … FOR EACH ROW` to **77 of 79 tables** (19 in 0000, plus 0002/0003/0006/0008/0010/0011/0013/0014/0015/0016/0017/0019/0022/0023/0028). Unprotected by design: `ledger.sequence_allocator`, `core.work_item`.

**Application layer:** exhaustive search (`.delete(`, `DELETE FROM`, `DROP`, `TRUNCATE`, `purge`, `prune`, `gdpr`, `erasure`, `dsar`, `anonymi[sz]e`, `redact`, `retention`, `ttl`, `ON DELETE CASCADE`) → **zero production DB deletions**; every hit is a JS Set/Map op, an HTTP method string, or a **negative test asserting rejection**. **Not one `ON DELETE CASCADE` in the entire schema.**

Traps worth knowing:
- `migrations/0021_dr174_cooldown_prune.sql` says "prune" but contains **zero deletion** — its header states the semantics are "hide/exclude, never deletion".
- `POST /v1/answers/:id/memory-link/unlink` is the only erasure-*shaped* endpoint; its entire write is an **INSERT** (`state='UNLINKED'`, `packages/memory/src/index.ts:482-503`). The link and all prior events survive.
- `runReaper` (`apps/scheduler/src/index.ts:87-89`) — the one named slot for a deletion job — is a stub that throws.

**GDPR Art. 17 erasure is impossible by construction, not merely unimplemented.**

### Enforcement gaps
- **G1 — TRUNCATE is not blocked.** Row triggers never fire on TRUNCATE; no `BEFORE TRUNCATE … FOR EACH STATEMENT` trigger exists. `TRUNCATE core.run CASCADE` by the owner would silently empty append-only tables.
- **G2 — the grant layer is inert.** All seven roles are `NOLOGIN`; apps connect as superuser/owner `debateai`. Every `REVOKE … FROM debateai_runtime` is bypassed. **The trigger is the sole effective control** — and a superuser can `ALTER TABLE … DISABLE TRIGGER` or `SET session_replication_role='replica'`.
- **G3 — `core.work_item` has neither trigger nor REVOKE** (has `GRANT UPDATE`).

## 4. DR-188 — verbatim and precise

`docs/missions/2026-08-06-v3-programming/decisions-ledger.md:1611-1630`, **ACTIVE**, 2026-08-15, ruled by V:

> **THE DATA-PRESERVATION LAW.** User debate data survives every update, on every environment, forever. Consequences: (1) migrations must remain additive/data-preserving; (2) the backup-then-reseed ceremony is ACCEPTANCE-ERA DEBT — the register conflict guard forcing datadir swaps is the single mechanism that ever displaces data, and register-versioning work is ELEVATED to mandatory; (3) **no datadir is ever DELETED** — archives are permanent until V personally disposes of them; (4) the archived truth-pursuit debate (`.pgdata-debate-091b7663-awaiting-rebaseline`) is V's research corpus.

**Scope:** DR-188 names **no individual tables** — it governs at the **migration** and **datadir** level. Table immutability comes from `core.reject_mutation()`, independently. The two mechanisms are mutually reinforcing.
**Related:** DR-133 (livenessPolicy), DR-144 (register change → fresh datadir — the mechanism DR-188 condemns), DR-151 (first backup ruling), DR-172/173, **DR-174-A(4)** (V: *"HIDDEN, NOT PRUNED… Not Pruned, not removed. But hidden"* — the in-app analogue), DR-187.

## 5. Retention / lifecycle — **infinite**

`livenessPolicy` register row: `review_after_ms` 7 days, `retire_after_ms` 180 days (`acceptance/seed-register.ts:211-226`). Effects:
- 7 d passes → **read-time projection only**, badge `UNDER-REVIEW`. Nothing written, nothing deleted.
- 180 d unqueried → **INSERTs** `staleness_state='ARCHIVED'` + event. Next matching query **INSERTs** `ARCHIVED_REVIVED` — full un-archive.
- A stored `ARCHIVED` deliberately projects as `UNDER_REVIEW` (`packages/liveness/src/index.ts:56`) — archived data stays fully readable, merely badged.

**What expires: nothing but a badge. What is removed: nothing, ever.** And **no scheduler runs automatically** — `job:liveness-sweep` exists but there is no cron/timer/compose service; even the badge flip requires a human. **Effective retention today: infinite, for everything.**

## 6. Data leaving the system

**Question text leaves via 4 endpoints:** `GET /v1/answers/:id`, `GET /v1/runs/:id/answer`, `GET /v1/answers` (list), `GET /v1/runs/:id`. **`asker_id` is never a top-level response field**; `session_id` only via `GET /v1/session`.
**Do NOT expose the question:** `/inspection` and `/ledger-digest` (digest returns ids/outcomes/timestamps only; `reason` strings pass a secret scrubber at `packages/serve/src/index.ts:614-628`). **No endpoint returns `raw_artifact.raw_text`.**
But verbatim model output IS returned as `node.claim_text`, `node_review.reasons`, `composed_text.segments`, `fact_bundle.residual_objections`, and via SSE `value_json` **passed through wholesale** (`apps/api/src/index.ts:614`) including `constructed_prompt`.
**Two dev routes are unscoped (cross-tenant):** `/v1/dev/evaluator` returns other askers' `run_id`s + failure reasons; `/v1/dev/evaluator/consumer-selection` writes globally. `/v1/deployment` returns all register rows + all scorecard cells.
**Contract drift:** `contractInventory.routes` lists **12** of the 15 live routes.

**Providers:** one production egress path (generic OpenAI-compatible HTTP, `packages/providers/src/index.ts:224-233`), endpoint from `VLLM_BASE_URL` — schema is `z.string().url()`, so **nothing prevents repointing it at a hosted provider**. The evaluator's own providers are hard-restricted to localhost (`assertLocalEndpoint`). Anthropic/xAI/OpenAI are reached only via the acceptance CLI relays, where **the full rendered prompt is passed as a command-line argument** (visible in host process listings) and `env: {...process.env}` is inherited.

**Export/logging:** no `pg_dump`, backup script, or CSV export in the repo. `Fastify({ logger: false })`. The one real risk is the UI file sink (`apps/ui/lib/observability/logger.ts:224-244`, auto-on in development): redaction is **key-name based**, so a field named `question_line`/`claim_text` would be **written in full** (truncated at 1024 chars). Only caller today is `suspiciousScoring.ts:138` — latent, no rotation, no retention.

## 7. Encryption at rest: **NONE** (verified)

Searches (`pgcrypto`, `pgp_sym`, `gen_random_bytes`, `encrypt`, `cipher`, `AES`, `KMS`, `envelope`, `TDE`, `LUKS`, `sops`, `sslmode=require`) → **zero real hits**. **Zero `CREATE EXTENSION`** across all 30 migrations. **Zero `bytea` columns** — no ciphertext storage anywhere. No `password`/`secret`/`api_key`/`email` columns exist at all. SHA-256 is used widely but is hashing (content addressing + pseudonymisation), giving **zero confidentiality**. TLS off (`sslmode=disable`; `#ssl = off`).

**Physical location:** the live DB is `embedded-postgres` on the host, port 55432, datadir `acceptance/.pgdata` (PG 18, 16 MB live). **15 plaintext PGDATA directories, ~1.0 GB total** in `acceptance/` — each a complete restorable copy; `strings` on a backup returns readable catalog content. Permissions `drwx------` are access control, not encryption. **DR-188(3) makes all 15 permanent.** macOS **FileVault is ON** — the sole at-rest control, and inert while the machine is booted.

> **G4 — plaintext database in git.** `acceptance/.pgdata-debate-091b7663-awaiting-rebaseline` matches **neither** ignore pattern (`acceptance/.gitignore` has only `.pgdata/`; root `.gitignore:37-38` covers `.pgdata/` and `.pgdata-backup-*/`). **1731 files.** *(Orchestrator verification: already committed in `c18991d` and pushed to `origin/dev` on a PUBLIC GitHub repo, and re-staged under the renamed path.)* The ignore patterns are name-prefix based, so **any future datadir not named `.pgdata-backup-*` will be tracked again.**

## 8. UNKNOWN
- Production deployment posture (no CI/CD, Terraform, or Helm; `deploy/` has two files).
- Real-world content of `decision_owner`/`action_owner` (placeholders today; schema unconstrained).
- Provider-side retention — no zero-retention configuration exists, so retention is each provider's default.
- Contents of the 14 archived datadirs (not booted).
- **No consent, ToS-acceptance, or lawful-basis table exists** in any of the 79 tables.

## RISK SUMMARY

1. **Personal data today:** user questions (`question_line` + 8 derived locations), free-text `user_input` steers, pseudonymous `asker_id`/`session_id`, and — highest-risk — **`decision_owner`/`action_owner` inside `ask_contract` jsonb, designed to hold third parties' names** and invisible to column-level review.
2. **Nothing could be erased on demand.** No delete endpoint, no reaper (stub throws), and `core.reject_mutation()` makes 77/79 tables physically refuse DELETE. DR-188 elevates this to law forever — a direct, unresolved conflict with GDPR Art. 17.
3. **The question is not erasable by nulling one column** — verbatim in 3 stores, empirically embedded in 33/151 raw artifacts, 24/64 restatements, 11-16/64 claims, 4 composed texts.
4. **Crypto-shredding is required** (deletion structurally unavailable) for: `run.question_line`+`ask_contract`, `node.claim_text`, `stranger_restatement.restatement_text`, `raw_artifact.raw_text`, `composed_text.segments`, `fact_bundle`, `node_review.reasons`, `question_key.canonical_question_text`, `pull_record.payload_snapshot`, `alias_row`, `investigation_request.user_input`, and the `evidence.*` query/excerpt columns.
5. **Simple deletion would suffice** for pure identifier/telemetry rows — but the same trigger blocks it there too, so *every* table needs either a DR-188 amendment or key-per-subject encryption.
6. **Zero encryption at rest**; FileVault is the only control and is inert while booted.
7. **Retention is effectively infinite** — the 7d/180d policy only flips a badge, and no scheduler runs.
8. **Auth accepts any non-empty string** as identity — knowing a token string is total takeover of every stored debate.
9. **Two dev routes leak cross-tenant data**; `/v1/deployment` is unscoped.
10. **1731 files of plaintext debate database are in git** — committed, pushed to a public repo, and re-staged under the renamed path.
