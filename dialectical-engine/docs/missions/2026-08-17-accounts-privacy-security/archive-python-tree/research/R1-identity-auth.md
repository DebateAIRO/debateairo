# R1 — Identity & Authentication Surface Inventory (research asset, Wave 1)

`apps/dialectical-engine` (FastAPI coordinator + Next.js web + Python workers). READ-ONLY; all citations verified against source. Produced by the R1 research agent, 2026-08-17.

## 1. Human auth = shared bearer token in browser localStorage — CONFIRMED

**localStorage key `dialectical:userToken`** (web):
- `web/lib/api.ts:16-29` — `getStoredToken()` reads `window.localStorage.getItem("dialectical:userToken")`; `setStoredToken()` sets it (line 23); `clearStoredToken()` removes it (line 28).
- `web/lib/api.ts:31-34` — `apiFetch()` attaches it as `headers.set("Authorization", "Bearer ${token}")`.
- `web/lib/api.ts:127-129` — `validateUserToken()` probes `GET /api/settings` to test a token.
- Set/validated in UI: `web/components/AuthGate.tsx:16-52`, and `web/app/debate/[id]/DebatePageClient.tsx:413,522-529,867-874` (separate "action token" unlock flow, same storage key).
- Entered as a `type="password"` field (`AuthGate.tsx:88`), copied from what "the coordinator printed on first boot" (`AuthGate.tsx:74`).

**Coordinator validation** (`coordinator/app/core/auth.py`):
- `bearer_token()` (52-59) — extracts `Authorization: Bearer …`; **401** if missing/malformed.
- `require_user_token()` (62-69) — loads `Setting` keyed `USER_TOKEN_SETTING = "user_token_hash"` (24), `verify_token(...)`; **403** "Invalid user token" on mismatch/absent.
- Hashing: `hash_token()` uses **bcrypt (rounds=12)**, else PBKDF2-SHA256 260k iters (32-49). Only the hash is stored.

**Single shared secret, NOT per-user:**
- `coordinator/app/main.py:41-43` `ensure_user_token(...)`; first boot generates `new_secret_token("user")` (`auth.py:100` = `"user_" + secrets.token_urlsafe(32)`, `config.py:245-246`) and **prints it once** to stdout.
- Override env var **`DIALECTICAL_USER_TOKEN`** (`config.py:196`). Rotation via `scripts/reset_user_token.py`.
- One global secret in a single `settings` row — one human token for the whole instance.

**Without a token:** write/admin → 401/403. Public reads stay open (§5).

## 2. NO individual user accounts — CONFIRMED

- Migrations create only: settings, debates, nodes, generations, syntheses, workers, jobs, debate_branches, skills, agents, analyzer_runs, capability_matches, agent_outputs, provenance_records, node_scoring_results, node_feedback_votes, judge_output_artifacts (+ additive lifecycle/job_transitions). **No users/accounts/sessions/login table.**
- `entities.py` — no user/account model. Human identity = single `Setting(key="user_token_hash")`.
- Auth deps extract no identity/subject/claims — `require_user_token` returns `AuthContext(token=token)`; the raw token is the only "identity."
- `NodeFeedbackVote.user_identity_hash` (`entities.py:632-660`) = `sha256("debateai-scoring-feedback:" + raw_user_token)`. Everyone shares one token → this hash is **identical for all humans**; dedups votes globally, not per person.

## 3. Worker/service identity already exists — CONFIRMED

**Worker model** (`entities.py:126-136`): `{id, name (unique), token_hash, capabilities, last_seen, status, current_job_id}`. Own hashed token, distinct from human token.

**Registration & auth:**
- `POST /api/workers/register` (`workers.py:82-128`) is gated by **`require_user_token`** — a worker needs the human token to enrol. New registration mints `new_secret_token("worker")` (returned once, 128); re-registering returns no token unless `rotate_token=True`.
- Thereafter workers use **their own** token: `require_worker` (path `worker_id`, `auth.py:72-80`) and `require_worker_header` (`X-Worker-ID`, `auth.py:83-93`); **403** on mismatch.
- Worker client sends `Authorization: Bearer <worker_token>` + `X-Worker-ID` (`worker/app/client.py:36-42`); registration sends `Authorization: Bearer <user_token>` (`client.py:63-66`).

**Worker credential storage:** plaintext in `~/.dialectical-worker/config.toml` (`worker/app/config.py:19-20,102-132`) holding `worker_id`, `worker_token`, AND `user_token`; env overrides `DIALECTICAL_WORKER_ID/_TOKEN/_USER_TOKEN`. So the human token sits in cleartext on every worker host.

**`blocked_auth`:** a worker-reported heartbeat **status string** (`workers.py:41-46`), stored on the worker row — NOT a coordinator lockout. Worker side (`worker/app/main.py:108-122,300-362`): on repeated 401/403/404 it clears identity and re-registers with `rotate_token=True`; after `RECOVERY_ATTEMPT_CAP=5` failures sends `status="blocked_auth"` and exits. Observability + self-healing only; grants no privilege.

**Hostile worker (valid worker token, no user token):** can `poll` jobs and submit arbitrary content via `POST /api/jobs/{id}/stream|complete|fail` — inject/poison node arguments, syntheses, evidence, judge outputs for any job it claims; can rotate its own identity. Cannot hit user-gated admin/write endpoints unless the operator stored the user token on that host (the standard install does).

## 4. `scripts/acceptance_check.py` — CONFIRMED

- Human token from CLI `--user-token`, default env `DIALECTICAL_USER_TOKEN`/`USER_TOKEN` (`:2377`); hard-fails if absent (`:1919-1920`).
- Builds `Authorization: Bearer <token>` (`:359-360`). Also **negatively asserts** the boundary: unauth create/settings → 401/403; invalid token → 403 (`:473-498,505-553,370-372`). Shared-token model; no accounts.

## 5. Endpoint auth inventory (coordinator FastAPI)

Auth: **User** = `require_user_token`; **Worker** = `require_worker`/`_header`; **None** = public.

| METHOD PATH | Auth | Exposes / mutates |
|---|---|---|
| GET `/healthz` | None | liveness |
| GET `/api/debates` | **None (public)** | list non-archived debates |
| POST `/api/debates` | **User** | create debate — spawns jobs |
| GET `/api/debates/{id}` | **None (public)** | full debate tree |
| DELETE `/api/debates/{id}` | **User** | archive (cancels active jobs) |
| GET `/api/debates/{id}/events` | **None (public)** | SSE live stream |
| GET `/api/debates/{id}/export.md` | **None (public)** | markdown export |
| GET `/api/debates/{id}/scoring` | **Optional** | scoring; token only for personal feedback/force_refresh |
| POST `/api/debates/{id}/scoring/jobs` | **User** | queue scoring job |
| GET `/api/debates/{id}/scoring/jobs/{job_id}` | **None (public)** | scoring job status (incl. raw error) |
| POST `.../scoring/nodes/{node_id}/feedback` | **User** | up/down vote |
| POST `.../scoring/manual-investigations` | **User** | queue node regen |
| GET `.../scoring/adaptive-depth/dry-run` | **None (public)** | expansion plan preview |
| POST `.../scoring/adaptive-depth/approvals` | **User** | approve tree expansion |
| POST `/api/nodes/{node_id}/regenerate` | **User** | regenerate node → job |
| GET `/api/nodes/{node_id}/generations` | **User** | generation history |
| POST `/api/workers/register` | **User** | create/rotate worker identity ⚠ |
| POST `/api/workers/{id}/heartbeat` | **Worker** | update status/capabilities |
| POST `/api/workers/{id}/poll` | **Worker** | claim next job |
| GET `/api/backends/status` | **None (public)** | worker roster: names, capabilities, current_job_id ⚠ |
| POST `/api/jobs/{id}/stream` | **Worker (header)** | append streamed tokens |
| POST `/api/jobs/{id}/complete` | **Worker (header)** | complete job, write result |
| POST `/api/jobs/{id}/fail` | **Worker (header)** | fail/requeue |
| POST `/api/qbaf/runs` | **User** | run QBAF orchestration |
| GET `/api/qbaf/runs/{run_id}` | **None (public)** | fetch QBAF run |
| GET `/api/settings` | **User** | routing, enabled models, spend caps ⚠ admin |
| PUT `/api/settings` | **User** | mutate routing, models, monthly $ caps ⚠ admin |
| GET `/api/ops/jobs` | **User** | job-transition ledger |
| GET `/api/ops/verdict-shadow` | **User** | verdict shadow telemetry |
| GET `/api/ops/expansion` | **User** | expansion internals |

Two token-free info-leaks: `GET /api/backends/status` (worker names, capabilities, job IDs); `GET /api/debates/{id}` + `/export.md` + `/events` + `/scoring` (full content, by design).

## 6. Session semantics: expiry / rotation / revocation

- **Human token:** single hash in `Setting("user_token_hash")`, **no expiry, no TTL, no rotation schedule, no revocation list**. Rotation only as a manual whole-instance op (`scripts/reset_user_token.py` — invalidates every client at once). No per-session tokens; the same long-lived secret rides every request.
- **Worker token:** rotation at re-registration (`rotate_token=True`), which requeues that worker's jobs. No expiry; **no delete/deregister endpoint**.
- Client-side: no cookie/JWT; browser keeps the bearer in localStorage indefinitely, re-validates on load.

## 7. CSRF / CORS

- **CORS** (`main.py:88-94`): `CORSMiddleware`, `allow_origins=[web_origin, localhost:3000, 127.0.0.1:3000]`, `allow_credentials=True`, `allow_methods/headers=["*"]`. Explicit allow-list (no wildcard) but credentials-true with a fixed localhost list.
- **CSRF:** none anywhere. Structurally low risk because auth is a **bearer header** (not a cookie) — no `Set-Cookie`/`SameSite` usage. `allow_credentials=True` is a latent trap if cookies are ever introduced.
- **Rate limiting:** in-process per-IP on GET public-read paths only (`main.py:105-153`, default 100/min); trusts `cf-connecting-ip`/`x-forwarded-for`/`x-real-ip` — spoofable off-proxy. **No rate limit on authed or worker endpoints.**
- **Web proxy** (`web/app/api/[...path]/route.ts`): forwards `/api/*` to coordinator, passes `Authorization` straight through (148-160), strips only host/expect; no auth at proxy.

## Mission-evidence: IdP / email / minors
- **No IdP, email vendor, passkey/WebAuthn, or accounts library wired.** grep `oauth|oidc|auth0|clerk|okta|firebase|cognito|supabase|sendgrid|mailgun|postmark|resend|smtp|magic.link|webauthn|passkey` → no app code (only model-provider CLI OAuth for Gemini/Codex in setup scripts).
- Planned only in the mission prompt itself; no vendor chosen in code or docs.

## RISK SUMMARY
- **Attacker WITH the shared human token = full operator control:** create/archive debates, regenerate any node, register/rotate workers, read+mutate `/api/settings` (routing, model enable, spend caps) and all `/api/ops/*`. One secret, no per-user scoping, no expiry, no revocation short of a global reset.
- Token is **long-lived and widely copied**: printed once to coordinator stdout/log, stored plaintext in every worker's config.toml and launchd env — any worker-host compromise or log exposure = full admin.
- **Attacker WITHOUT any token:** reads all public content/trees, SSE, export, scoring, QBAF runs, and the worker roster via `/api/backends/status`; spends the IP-spoofable rate budget. Cannot mutate.
- **Attacker with only a WORKER token:** claim jobs, inject poisoned content into debates it processes; cannot reach human-gated admin.
- **Systemic gaps:** no accounts/sessions/ownership, no CSRF primitive, no MFA, no auth-endpoint rate limiting, no token rotation/expiry — the mission's charter.
