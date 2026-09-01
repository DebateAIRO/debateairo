# Security Hardening 2026-09-01 — Audit and Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every concrete security gap in the dialectical-engine tree at `origin/dev@b5a6b6eb` that can be closed in-repo, and put evidence-backed findings in front of V for the gaps that need V's decision (public-repo history, deployment horizon, custody location).

**Architecture:** Two phases on one branch. **Phase A** runs seven read-only audit lanes in parallel (Fable 5.1 subagents), each owning one attack surface and filing a findings register in a fixed schema. **Phase B** is the fix programme: the tasks already known from the orientation sweep are fully specified below (one behaviour each, RED→GREEN); tasks minted from Phase A findings are appended after orchestrator triage using the same template. All work happens on branch `security/2026-09-01-hardening` (worktree `.worktrees/security-hardening`); each fix lane gets a sub-worktree `security/fix-<task>`; the orchestrator integrates and opens one PR to `dev`.

**Tech stack:** TypeScript 7.0.2 · Node 22.23.1 (engines) · pnpm 11.20.0 · Fastify 5.11.2 · Next 15 App Router (custom `server.mjs`) · PostgreSQL 18 + Drizzle 0.45.2 + `pg` 8.22 · zod 4 · vitest 4.1.10 · Hatchet 1.28.1 · hash-wasm Argon2id.

**Spec:** inline, §1 below. Baseline: `origin/dev` = `b5a6b6eb` (2026-09-01). Repository: `github.com/DebateAIRO/debateairo` (**PUBLIC**). Git root is `V5/`; the product tree is `V5/dialectical-engine/`.

## Global Constraints

- **Defensive-only, own app only** (charter `docs/missions/2026-08-17-accounts-privacy-security/00-mission-charter.md` §1, V 2026-08-17 verbatim: *"only MY application. No Pen testing, no cybersecurity attack on anyone."*). No probing of any third-party host. Self-tests run only against loopback listeners this repo starts.
- **Fail-closed house style:** refuse with a typed `UPPER_SNAKE` code, never repair silently, never log secret material. Errors are `TypeError`/typed classes with a `code`.
- **Register rows are sealed, append-only, V-ruled.** Never edit a sealed value in `packages/register/src/*-policy.ts`; add a versioned row and cite the ruling.
- **RED before GREEN.** Every behaviour change starts with a focused failing test (`pnpm exec vitest run <file>`), then the minimal change, then GREEN, then `pnpm run typecheck`. vitest 4 has **no** `--reporter=basic`; use the default reporter.
- **Fresh worktree provisioning is mandatory:** `pnpm install --frozen-lockfile` **and** `pnpm run generate:contract` (creates the git-ignored `packages/contract/generated/`; without it typecheck shows 157 errors and 83 test files die). Never symlink the root `node_modules` into a worktree.
- **Host quiet rule:** the algorithm-live-loop mission (branch `mission/2026-09-01-algorithm-live-loop`, worktrees `.worktrees/lane-*`, `.worktrees/integration`) is live on this host with codex seats. Run `pnpm test:s00` / full `pnpm test` only when `ps -Ao command | grep -E '[c]odex exec|[c]laude -p'` is empty, or in CI. Focused test files are always fine.
- **Do not touch** `.worktrees/lane-*`, `.worktrees/integration`, the mission branch, or `acceptance/*-relay*.ts` (the in-flight TREL lane owns them).
- **Host Node is v25.7.0** (engines want 22.23.1). Note it in every test receipt; CI pins 22.23.1.
- Commit style: conventional prefix, imperative subject, body cites the finding id (`F-nn` / `L<n>-F<k>`), trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## 1. Spec — threat model, scope, non-goals

### 1.1 Assets (what an attacker wants)
1. Identity material: email + blind index, Argon2id password hash, TOTP seed (encrypted), recovery-code hashes, recovery channel refs.
2. Private debate content (AEAD-encrypted at write under per-run DEKs wrapped by the KEK) and the plaintext that transits API/runner/provider memory.
3. Session and CSRF tokens (`__Host-debateai-session`, `__Host-debateai-csrf`), login challenge tokens, verification tokens.
4. Key custody files: KEK, corpus KEK, blind-index key, audit source-IP salt, user DEK store, publication key store, Hatchet client token, the nine DB principal credentials, dev TLS leaf key.
5. Integrity of the tamper-evident audit chain and of published public snapshots.
6. Model spend (POST /v1/asks fans out to paid/quota-bound model CLIs).
7. The repository itself (public): history, CI, dependency graph.

### 1.2 Actors
- **A1 Anonymous internet user** hitting public routes (`/v1/auth/*` public arms, `/v1/public/*`, the Next front door).
- **A2 Authenticated user** attacking other users' resources (IDOR), step-up bypass, session fixation, CSRF, quota abuse.
- **A3 Malicious model output** (prompt injection) flowing from provider → runner → judge/composer → serve → UI.
- **A4 Local co-tenant / malware on the workstation:** loopback listeners, files under the repo (custody dir), OneDrive-synced copies.
- **A5 Supply chain:** npm packages, GitHub Actions, Docker images, `allowBuilds` scripts.
- **A6 Repository reader:** anyone on GitHub (history, tracked env files, logs).

### 1.3 In scope
`apps/api`, `apps/ui`, `apps/runner`, `apps/scheduler`, `apps/evaluator-worker`, `apps/replay`, all `packages/*`, `migrations/`, `deploy/`, `compose.dev.yaml`, `pnpm-workspace.yaml`, lockfiles, `.husky/`, `.gitignore`, repo settings, CI.

### 1.4 Non-goals (unless V rules otherwise in §6 Q2)
The Phase 2–7 **product programmes** already tracked in `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md` (tiered recovery ladder, passkeys, restricted mode, DSAR centre, moderation/appeals, backup/restore drills, counsel/DPIA). This mission fixes **defects, hygiene, configuration, and assurance automation**; it does not build new product features.

### 1.5 Severity rubric (used by every lane)
- **CRITICAL** – remote, unauthenticated compromise of an asset in 1.1 or of the host.
- **HIGH** – authenticated compromise of another user's asset; secret disclosure; unbounded spend; a known-exploitable dependency on a runtime path.
- **MEDIUM** – defence-in-depth gap with a plausible chain; DoS; dev-stack exposure on non-loopback interfaces; missing assurance gate on a public repo.
- **LOW** – hygiene, hardening opportunities with no current chain.
- **INFO** – verified-OK control, or an observation with no action.

---

## 2. Findings register — orientation sweep (2026-09-01, by the orchestrator)

| ID | Sev | Surface | Finding (evidence) | Disposition |
|---|---|---|---|---|
| F-01 | INFO (was HIGH; **R1**) | Repo / history | A live PostgreSQL data directory with plaintext debate content (`DebateAI-V3/acceptance/.pgdata-backup-2026-08-11/**`, `.pgdata-debate-091b7663-…/**`) was committed in `7ba6bed0` (2026-08-11) and removed in `56b256ce` (2026-08-12). It is still reachable from `origin/dev` and every `lane/*`/`obs-lane-*` branch (not from `origin/main`). The repository is **PUBLIC**. The root `.gitignore` documents the incident ("1731 files / 72 MB … pushed to a PUBLIC repo"). | **R1 (V, 2026-09-02): the data are FAKE test debates by V and a colleague — nothing to protect.** Repo stays public, no history rewrite, B11 dropped. Hygiene only (B2; the catch-all `.pgdata*` ignore rules already prevent recurrence). Real debates will live on a separate VPS → Phase C. |
| F-02 | **HIGH** | Supply chain | `pnpm audit`: 4 high, 3 moderate, 1 low. `postcss` ≤8.5.22 (4 advisories: XSS via unescaped `</style>`, arbitrary `.map` read ×3) pinned to `8.4.31` by `next@15.5.23`; `sharp` <0.35.0 (libvips CVE-2026-33327/33328/35590/35591) via `next`; `nanoid` <3.3.18 via `postcss`; `esbuild@0.18.20` via `drizzle-kit>@esbuild-kit`; `esbuild@0.27.7` via `tsx`. Latest `next@15` is `15.5.25` (allows `sharp ^0.35.4`); `next@16.3.4` ships `postcss 8.5.23`. Saved: `scratchpad/pnpm-audit.json`. | **B1** |
| F-03 | **MEDIUM** | Assurance | No `.github/` at all (only GitHub's dynamic dependency-graph workflow). No CI test gate, no secret scanning, no dependency-audit gate, no Dependabot config, no `SECURITY.md`, no CodeQL — on a public repo. IMPLEMENTATION-STATUS Phase 7 lists this as ✗. | **B7, B8** |
| F-04 | **MEDIUM** | Dev stack exposure | `compose.dev.yaml`: `hatchet-lite` publishes `8888:8888` and `7077:7077` and `vllm` publishes `8000:8000` on **all interfaces** with `SERVER_AUTH_COOKIE_INSECURE=true`, `SERVER_GRPC_INSECURE=true`, and no vLLM auth. Only `postgres` is bound to `127.0.0.1:55432`. | **B3** |
| F-05 | **MEDIUM** | Key custody | Dev custody root is hard-wired to `<repo>/.local/dev-auth` in 9 places (`apps/runner/src/dev-secret-files.ts:189-190`, `dev-hatchet-token.ts:202-203`, `dev-api-environment.ts:325-326`, `dev-api-process.ts:64,161`, `dev-auth-data-plane.ts:373`, `dev-database-principals-cli.ts:7`, `deploy/dev-auth/tls-front-door.mjs:321`, `deploy/dev-auth/create-local-certificate.mjs:23`). This checkout lives under `~/Library/CloudStorage/OneDrive-adessoGroup/…`, so KEKs, DEK stores, the Hatchet token, DB credentials and the TLS key would be **synced to Microsoft OneDrive**, and OneDrive flips file modes (TOOLING-TRAPS), which the exact `0600/0700` custody checks then refuse. | **B4** (§6 **Q4**) |
| F-06 | **LOW** | Hygiene | Tracked: `dialectical-engine/apps/ui/.env.local` (non-secret today, but the conventional secret file), `dialectical-engine/tmp-orch-goal.txt`, `dialectical-engine/tmp-goal-S3d-claude-final-custody.txt`, root `.playwright-mcp/*.log|*.yml`. Stale `web:` importer in `pnpm-lock.yaml:708` (workspace member no longer exists; pulls a second `next`), orphan `dialectical-engine/web/node_modules/`, nested stale `apps/ui/pnpm-lock.yaml` (2026-08-21). | **B1, B2** |
| F-07 | **MEDIUM** | API resource limits | `buildApi` (`apps/api/src/index.ts:334-338`) constructs Fastify with defaults: no explicit `bodyLimit` (1 MiB on every route including auth), no `requestTimeout`, `maxParamLength` default. Fastify's `FST_ERR_CTP_BODY_TOO_LARGE` would currently fall into the generic 500 branch of `setErrorHandler`. No admission limit on `POST /v1/asks` (model spend per authenticated user) or on anonymous `GET /v1/public/debates*`. Register/verify/resend/login/MFA/step-up/recovery **are** limited. | **B5**; **B10** after L1 confirms |
| F-08 | **LOW** | UI CSP | Production CSP is `script-src 'self' 'unsafe-inline'` (`apps/ui/next.config.mjs:1`) and `app/layout.tsx:36-42` ships an app-owned inline script (theme bootstrap from `localStorage`). `tests/integration/s5-ui-security-smoke.mjs:24` asserts `'unsafe-inline'` is present. | **B9** (§6 **Q4**) after L3 feasibility |
| F-09 | INFO | Runtime | Host Node `v25.7.0` vs `engines.node 22.23.1`; pnpm only warns. All local test evidence is gathered on 25.x. | CI pins 22.23.1 (B7). |
| F-10 | INFO | Verified OK | Double-submit CSRF (`__Host-` cookies, exact Origin, `timingSafeEqual`), deny-default route policy inventory enforced at `onRoute`, Argon2id 64 MiB/t=3/p=1, login/MFA/step-up limiters before Argon2, recovery enumeration floor, generic ≥500 envelope (`message` = code), sendmail via `spawn` with `--` and CR/LF guards, proxy request/response header allowlists with exact Set-Cookie grammar, forwarded-header stripping at the Node edge, no `eval`/`innerHTML` (one static inline script), no interpolated SQL, no tracked secrets, no `rejectUnauthorized:false`, `minimumReleaseAge` supply-chain cooldown configured. | none |

---

## 3. Phase A — parallel audit lanes (read-only)

All lanes run as **Fable 5.1 subagents in parallel**, read from `.worktrees/security-hardening/dialectical-engine` (baseline `b5a6b6eb`, provisioned), **write nothing except their findings file**, and never run the full test suite (focused `vitest run <file>` is allowed for a positive/negative probe).

### A.0 Deliverable contract (every lane)

File: `docs/missions/2026-09-01-security-hardening/findings/L<n>-<slug>.md`

```markdown
# L<n> <surface> — findings (baseline b5a6b6eb, <date>)
## Scope read
- <file> (<lines>) … (every file actually read, with line counts)
## Findings
| ID | Sev | Status | Title | Evidence (file:line) | Exploit narrative (A1..A6 actor → asset) | Existing control | Proposed fix | Proposed test |
| L<n>-F1 | HIGH | CONFIRMED|PLAUSIBLE | … | … | … | … | … | … |
## Verified-OK controls
- <control> — evidence file:line (positive evidence; these are the F-10 style rows)
## Out-of-scope observations
- <anything for another lane or for V, one line each>
## Confidence and residuals
- what was NOT read and why; what would change the severities
```

Rules: (1) every finding cites `file:line` in the worktree; (2) `CONFIRMED` only with a reproduction (a focused test you ran, or a line-by-line trace written out), otherwise `PLAUSIBLE`; (3) no fixes, no edits outside the findings file; (4) severities use §1.5; (5) list what you did **not** read.

### A.1 Lane L1 — API authentication, sessions, authorization
- **Read:** `apps/api/src/index.ts` (1479), `sessions.ts` (597), `mfa.ts` (434), `registration.ts` (1598), `recovery.ts`, `legacy-claim.ts`, `account-erasure.ts`, `publications.ts`, `client-ip.ts`, `main.ts`; `packages/register/src/{auth,mfa,session,recovery,product-role}-policy.ts`; `packages/db/src/{sessions,identity,auth-risk,recovery,legacy-claim,publication}.ts`; `packages/contract/src/index.ts` (route/response shapes); `migrations/0030`–`0053*` (identity/session/audit tables).
- **Answer:** every route in `authorizationPolicyInventory` → who can call it, with which body/param validation (`zod` parse vs. hand-rolled `typeof` checks — e.g. `/v1/auth/login` uses hand-rolled field reads at `index.ts:495-520`), and whether ownership is enforced in the repository query (not just the handler). IDOR on every `{id}`/`{nodeId}`/`{gapRef}` route. Step-up: which mutations require it and can a fresh cookie session skip it? Session: token entropy, hash-at-rest, binding hash, idle/absolute lifetime, rotation on login/step-up, revocation semantics, fixation (is a pre-login cookie ever reused?), logout clearing, `authenticateErasureStatus` special path (`index.ts:407-415`) scope. CSRF: exact-origin when `allowedOrigin` is `undefined` (what does `exactOrigin(x, undefined)` return?), `x-csrf-token` grammar, `MUTATING_METHODS` vs `OPTIONS`/`HEAD`. Enumeration/timing on register/verify/resend/login/recovery. Limiter coverage matrix per route (what is **not** limited). Error envelope leaks (`AuthFlowError` messages). SSE `GET /v1/runs/{id}/events`: per-connection caps, heartbeat, cross-owner leak. `POST /v1/asks`: body ceiling, cost/quota per user, `preserveSubmittedTierSource`. Legacy `x-user-dev-token` retirement (`RETIRED_DEV_HEADER`).
- **Also state:** the maximum legitimate request-body size per route (needed by B5) and whether any per-user admission control exists for asks (needed by B10).

### A.2 Lane L2 — cryptography and key custody
- **Read:** `packages/crypto/src/index.ts` (~3.3k), `argon2-worker-pool.ts`, `argon2-worker.ts`, `packages/crypto/SECRET_STORE_LAYOUT.md`, `packages/register/src/runtime-environment.ts`, `apps/api/src/main.ts` (key loading, `assertPublicationSecretDomains`), `apps/runner/src/{dev-secret-files,dev-hatchet-token,dev-api-environment,dev-api-process}.ts`, `packages/db/src/index.ts` (`configureContentEncryption`), audit-chain migrations (`grep -l hash_chain migrations/*.sql`).
- **Answer:** AEAD construction (algorithm, nonce source/size, AAD contents, key-commitment), envelope versioning, KEK wrap/unwrap, DEK store file format and mode checks (TOCTOU between `stat` and `open`?), zeroisation of key buffers, Argon2 pool bounds (queue, timeouts, DoS), blind-index HMAC domain separation, token hashing (`hashVerificationToken`, session token hash) — algorithm and whether a DB read of hashes alone is useless, TOTP seed encryption, recovery-code hashing cost, audit source-IP KDF (19 456 KiB/2 iter — adequate?), randomness sources (`randomBytes` only?), any `Math.random`, comparison functions (`timingSafeEqual` on equal-length only?), secret material in logs/errors/`JSON.stringify`, child-process env passing of keys/tokens (`dev-api-process.ts`), and the OneDrive custody exposure (F-05) chain.

### A.3 Lane L3 — UI front door (Next 15, custom server, proxy)
- **Read:** `apps/ui/server.mjs`, `trusted-client-ip.mjs`, `app/api/[...path]/route.ts`, `next.config.mjs`, `app/layout.tsx`, `app/**/page.tsx`, `components/{AuthGate,AuthShell,LoginFlow,SignUpFlow,SessionControls,PublicationControl,AccountErasureControls,LegacyRunClaimControls,EvaluatorDevMenu}.tsx`, `lib/{api,serverApi,authNavigationGuard,returnPath,mfaEnrollment,totpQr,v3/answerExport,v3/publicAnswerExport,observability/logger}.ts`, `tests/integration/s5-ui-security-smoke.mjs`, `apps/ui/scripts/*`, `apps/ui/lib/sessionProxy.test.mjs`.
- **Answer:** XSS sinks (the only `dangerouslySetInnerHTML` is `layout.tsx:36`; check `answerExport.href` MIME type — `data:text/html` would be an XSS-on-open; check every `href={…}` built from server data for `javascript:`/protocol-relative escapes, e.g. `returnPath.ts` open-redirect), CSP effectiveness and **nonce feasibility on Next 15.5 App Router with `server.mjs`** (deliverable: a yes/no with the exact mechanism, so B9 can proceed), `localStorage` contents (any token?), SSR cookie forwarding (`serverApi.ts` builds `cookieHeader` — grammar-checked?), proxy: `OPTIONS` forwarding, `x-forwarded-for` synthesis, request-body streaming limits (the proxy buffers with `arrayBuffer()` — size cap?), response-header allowlist vs SSE (`content-type: text/event-stream` passes; `x-accel-buffering`?), `HEAD` handling, error-page information leakage, `NEXT_OUTPUT_EXPORT` mode (no headers()/middleware), `/admin/workers` and `EvaluatorDevMenu` gating in production builds, source maps in production output.

### A.4 Lane L4 — runner, providers, LLM containment
- **Read:** `apps/runner/src/{main,index,provider-topology,dev-provider-panel,dev-cli-provider-panel,dev-runner-policy,dev-runner-process,runner-startup-reconciliation}.ts`, `apps/evaluator-worker/src/index.ts`, `packages/providers/src/index.ts` (512), `packages/judgement/src/*`, `packages/critique/src/*`, `packages/serve/src/*`, `packages/memory/src/*`, `packages/evidence/src/*`, `apps/api/src/provider-discovery.ts`; **read-only reference** `acceptance/relay-core.ts` (do not propose edits there; TREL lane owns it).
- **Answer:** how model output re-enters prompts (judge/critique/composer): is the versioned data-only JSON envelope used on the **runner** side too, or only in acceptance relays? Any string-concatenated prompt built from user question + model output? Output parsing: `JSON.parse` on model text (`packages/judgement/src/s04.ts`, `packages/providers/src/index.ts`) — size caps, schema validation (zod), prototype-pollution-safe? `normalizedProviderBaseUrl` — scheme/host restrictions (SSRF from operator config is low, but document), `authorizationHeader` handling (logged? persisted in `core.provider_probe`? — status doc says "without retaining credentials"; verify), Hatchet token custody and TLS strategy `none` in dev, token ceilings/deadlines (`JUDGE_TOKEN_CEILING`…) enforced per call, retries/backoff bounds (cost amplification), evaluator-worker DB principal breadth, memory package: cross-user memory links (`/memory-link/unlink`) — can a user link another owner's run?

### A.5 Lane L5 — data layer, migrations, principals
- **Read:** `packages/db/src/*.ts` (6 080), every `migrations/*.sql`, `deploy/postgres/init-hatchet.sql`, `apps/runner/src/{production-database-principals,dev-database-principals,migrate-cli}.ts`, `docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json`, `packages/obs-capture/src/*` (writes), `packages/evaluator/src/index.ts` (DB access), `apps/scheduler/src/*`, `apps/replay/src/*`, `tests/support/testDatabase.ts`.
- **Answer:** parameterisation everywhere (`pool.query(text, values)` — any string-built SQL, `format()`, dynamic identifiers?), `search_path` hardening, `REVOKE ALL ON SCHEMA … FROM PUBLIC` coverage per schema/table/sequence/function, `SECURITY DEFINER` functions (owner, `search_path` pinned?), append-only triggers and `TRUNCATE` protection completeness (status ✗), RLS usage (none? → is ownership enforced only in app code — list the tables where a compromised `api` principal can read across owners), principal separation vs manifest (16 wrappers), `sslmode` in every connection string parser (dev URLs use `sslmode=disable` — production parser floor?), migration idempotency and `0054` forward-fix pattern, plaintext columns that hold user content after content encryption (legacy rows marked?), audit chain verification path, backup/`pg_dump` exposure of encrypted vs plaintext columns.

### A.6 Lane L6 — supply chain, repository hygiene, GitHub settings
- **Read:** all `package.json`, `pnpm-workspace.yaml` (`allowBuilds`, `minimumReleaseAgeExclude`), `pnpm-lock.yaml` (importers, resolved versions, integrity), `apps/ui/pnpm-lock.yaml`, `.npmrc` (absent), `.husky/scripts/hook-runner.sh` (full), `scripts/*.mjs`, `tools/*`, `.gitignore` (both), `deploy/IMAGE-PINS.md`, `compose.dev.yaml` image digests, `register.bootstrap.json`; run `pnpm audit --json`, `pnpm licenses list` (if available), `pnpm why esbuild postcss sharp nanoid`; `git log --all --diff-filter=A --name-only | grep -Ei '\.env|\.pem|\.key|pgdata'`; via `gh api` (read-only): branch protection on `main`/`dev`, secret-scanning + push-protection state, Dependabot alerts state, actions permissions, `SECURITY.md` absence; if `gitleaks` is installed run `gitleaks detect --source . --no-git` and `--log-opts` over history, else state so.
- **Answer:** exact override/bump set that makes `pnpm audit` clean without a Next 16 migration (feed B1 — include `pnpm why` output), whether `drizzle-kit` is used by any script (if not, propose removal), lifecycle-script exposure (`allowBuilds`), lockfile integrity gaps, hook-runner behaviours that could be bypassed or that run untrusted code, tracked artefacts that must go (feed B2), GitHub settings gaps (feed B7), the F-01 history exposure with exact object counts/sizes (`git rev-list --objects --all | grep pgdata | wc -l`), and a Node 22 vs 25 behavioural-risk note.

### A.7 Lane L7 — operations, deployment, process boundaries
- **Read:** `compose.dev.yaml`, `.env.compose`, `deploy/**`, `apps/runner/src/dev-*.ts` (all launchers), `apps/api/src/graceful-shutdown.ts`, `apps/api/src/main.ts` (env → child env), `deploy/dev-auth/sendmail-capture.mjs`, `deploy/dev-auth/tls-front-door.mjs` (full), `deploy/dev-auth/create-local-certificate.mjs`, `apps/runner/src/dev-auth-data-plane.ts` (Docker invocations), `tests/architecture/dev-*.test.ts` (what is already pinned).
- **Answer:** every published port and bind address (feed B3), Docker socket / `docker exec` argument construction (injection via env?), secrets passed on argv vs env vs file (argv is visible in `ps` to every user — TOOLING-TRAPS), child-process env allowlists for API/UI/runner launchers, log sinks that could capture tokens (`console.error(JSON.stringify(...))` paths), graceful-shutdown correctness under SIGTERM (audit drain), TLS front door: header handling, `Host` pinning, request smuggling (`transfer-encoding` + `content-length`), WebSocket upgrade proxying, certificate/key file modes, mail-capture sink permissions and retention, `hatchet-lite` insecure flags and whether the dev token grants tenant-admin, `vllm` unauthenticated exposure, PostgreSQL `init-hatchet.sql` grants.

### A.8 Orchestrator triage (after all seven files exist)
1. Merge the seven registers into `findings/CONSOLIDATED.md`: dedupe, re-grade with §1.5, mark each `FIX-NOW` (in scope) / `ASK-V` / `DEFER` (Phase 2–7 programme).
2. Append one Phase-B task per `FIX-NOW` finding using the §4 template (Files, Interfaces, RED test code, GREEN code, commands, commit).
3. Put every `ASK-V` item into `V-DECISIONS-PACKET.md` in this directory with a recommendation and the honest cost of the ambitious option.

---

## 4. Phase B — fix tasks known today

Task template = writing-plans skill template. Every task runs in its own sub-worktree:

```bash
cd "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5"
git worktree add -b security/fix-<task> .worktrees/security-fix-<task> security/2026-09-01-hardening
cd .worktrees/security-fix-<task>/dialectical-engine && pnpm install --frozen-lockfile && pnpm run generate:contract
```

### Task B0: Baseline receipt
**Files:** Create `docs/missions/2026-09-01-security-hardening/BASELINE.md`.
- [ ] Step 1: In `.worktrees/security-hardening/dialectical-engine` run `pnpm run typecheck` and `pnpm exec vitest run tests/architecture` (architecture tests are DB-free and cheap). Record the exact output tails, the commit (`git rev-parse HEAD` = `b5a6b6eb…`), Node/pnpm versions, and the `pnpm audit` summary (`1 low | 3 moderate | 4 high`).
- [ ] Step 2: Commit: `docs(security): baseline receipt for 2026-09-01 hardening (F-02, F-09)`.

### Task B1: Dependency remediation (F-02, F-06 lock hygiene)
**Files:**
- Modify: `dialectical-engine/package.json` (add `pnpm.overrides`), `dialectical-engine/apps/ui/package.json` (`next` → `15.5.25`)
- Modify (regenerated): `dialectical-engine/pnpm-lock.yaml`
- Delete: `dialectical-engine/apps/ui/pnpm-lock.yaml`, untracked dir `dialectical-engine/web/node_modules/`
- Test: `dialectical-engine/tests/architecture/dependency-floors.test.ts`

**Interfaces:** Produces the lockfile floors that B7's CI audit gate enforces (`pnpm audit --audit-level=moderate`).

- [ ] **Step 1: Write the failing architecture test**

```ts
// tests/architecture/dependency-floors.test.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const lock = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");

function resolvedVersions(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = new RegExp(`^  ${escaped}@(\\d+\\.\\d+\\.\\d+)`, "gm");
  return [...new Set([...lock.matchAll(pattern)].map((match) => match[1]!))];
}

function compare(left: string, right: string): number {
  const l = left.split(".").map(Number);
  const r = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (l[i]! !== r[i]!) return l[i]! - r[i]!;
  return 0;
}

// Floors from GHSA-7fh5-64p2-3v2j (postcss XSS), GHSA-… postcss sourceMappingURL family,
// sharp/libvips CVE-2026-33327/33328/35590/35591, nanoid GHSA (size 0 loop),
// esbuild GHSA-67mh-4wv8-2f99 (<=0.24.2) and GHSA-g7r4-m6w7-qqqr (>=0.27.3 <0.28.1).
const VULNERABLE: Record<string, (version: string) => boolean> = {
  postcss: (v) => compare(v, "8.5.23") < 0,
  sharp: (v) => compare(v, "0.35.4") < 0,
  nanoid: (v) => v.startsWith("3.") && compare(v, "3.3.18") < 0,
  esbuild: (v) => compare(v, "0.24.3") < 0 || (compare(v, "0.27.3") >= 0 && compare(v, "0.28.1") < 0)
};

describe("dependency floors (F-02)", () => {
  for (const [name, isVulnerable] of Object.entries(VULNERABLE)) {
    it(`${name}: every resolved version is patched`, () => {
      const versions = resolvedVersions(name);
      expect(versions.length, `${name} must resolve somewhere in the lockfile`).toBeGreaterThan(0);
      expect(versions.filter(isVulnerable)).toEqual([]);
    });
  }
  it("has no stale `web` importer (the workspace member was removed)", () => {
    expect(/^  web:$/m.test(lock)).toBe(false);
  });
  it("has no nested lockfile inside apps/ui", () => {
    expect(existsSync(resolve(root, "apps/ui/pnpm-lock.yaml"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect RED** (`pnpm exec vitest run tests/architecture/dependency-floors.test.ts`): postcss/sharp/nanoid/esbuild rows fail, `web` importer fails, nested lockfile fails.
- [ ] **Step 3: Apply the remediation**

```jsonc
// dialectical-engine/package.json — add at top level (keep existing fields)
"pnpm": {
  "overrides": {
    "postcss@<8.5.23": "8.5.23",
    "sharp@<0.35.4": "0.35.4",
    "nanoid@<3.3.18": "3.3.18",
    "esbuild@<0.24.3": "0.24.3",
    "esbuild@>=0.27.3 <0.28.1": "0.28.1"
  }
}
```
```bash
cd dialectical-engine
pnpm --filter dialectical-engine-v2ui add next@15.5.25          # allows sharp ^0.35.4
git rm apps/ui/pnpm-lock.yaml && rm -rf web/node_modules
pnpm install                                                     # NOT frozen: regenerates the lock and drops the `web` importer
pnpm audit --audit-level=low                                     # expect "No known vulnerabilities found"
```
If `pnpm audit` still lists an esbuild path through `@esbuild-kit/*` (drizzle-kit), and L6 confirmed no script invokes `drizzle-kit`, remove `drizzle-kit` from devDependencies and `drizzle.config.ts` in this same task and say so in the commit body; otherwise keep the override and record the residual.
- [ ] **Step 4: GREEN + regression**: `pnpm exec vitest run tests/architecture/dependency-floors.test.ts`; then `pnpm run generate:contract && pnpm run typecheck`; `pnpm --filter dialectical-engine-v2ui test` (node tests); `pnpm --filter dialectical-engine-v2ui build` (proves Next 15.5.25 + overridden postcss/sharp build and the auth-route manifest gate passes).
- [ ] **Step 5: Commit** `fix(deps): patch postcss/sharp/nanoid/esbuild floors via pnpm overrides, next 15.5.25, prune stale web importer (F-02, F-06)`.

### Task B2: Repository hygiene (F-06)
**Files:**
- Delete from index: `dialectical-engine/apps/ui/.env.local`, `dialectical-engine/tmp-orch-goal.txt`, `dialectical-engine/tmp-goal-S3d-claude-final-custody.txt`, `.playwright-mcp/**` (root)
- Create: `dialectical-engine/apps/ui/.env.local.example`
- Modify: `.gitignore` (root), `dialectical-engine/.gitignore`
- Test: `dialectical-engine/tests/architecture/repo-hygiene.test.ts`

**Interfaces:** none. (The dev launcher `apps/runner/src/dev-ui-process.ts:94-95` already injects `DIALECTICAL_API_BASE`/`NEXT_PUBLIC_API_BASE` by env, so untracking `.env.local` does not break `pnpm dev:auth:up`.)

- [ ] **Step 1: Failing test**

```ts
// tests/architecture/repo-hygiene.test.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: gitRoot, encoding: "utf8" }).split("\0").filter(Boolean);

describe("repository hygiene (F-06)", () => {
  it("tracks no dotenv files except the non-secret compose file and examples", () => {
    const offenders = tracked.filter((path) => /(^|\/)\.env(\.[^/]+)?$/.test(path)
      && !path.endsWith(".env.compose") && !path.endsWith(".example"));
    expect(offenders).toEqual([]);
  });
  it("tracks no orchestrator scratch files or browser-automation logs", () => {
    expect(tracked.filter((path) => /^dialectical-engine\/tmp-[^/]*\.txt$/.test(path))).toEqual([]);
    expect(tracked.filter((path) => path.startsWith(".playwright-mcp/"))).toEqual([]);
  });
  it("ignores the classes that leaked before", () => {
    const rootIgnore = readFileSync(resolve(gitRoot, ".gitignore"), "utf8");
    for (const rule of [".playwright-mcp/", "**/.env.local", "**/.env.*.local", "**/.local/"]) {
      expect(rootIgnore.split("\n")).toContain(rule);
    }
  });
});
```
- [ ] **Step 2: RED** — `pnpm exec vitest run tests/architecture/repo-hygiene.test.ts`.
- [ ] **Step 3: Fix**
```bash
cd "$(git rev-parse --show-toplevel)"
git rm --cached dialectical-engine/apps/ui/.env.local
git rm dialectical-engine/tmp-orch-goal.txt dialectical-engine/tmp-goal-S3d-claude-final-custody.txt
git rm -r .playwright-mcp
printf 'NEXT_PUBLIC_API_BASE=/api\nDIALECTICAL_API_BASE=http://127.0.0.1:8790\n' > dialectical-engine/apps/ui/.env.local.example
cat >> .gitignore <<'EOF'

# Browser-automation session logs (were tracked once; contain page dumps)
.playwright-mcp/
# Local env files are never source; the *.example files are.
**/.env.local
**/.env.*.local
# Dev custody (keys, tokens, credentials, TLS). Mirrors dialectical-engine/.gitignore.
**/.local/
EOF
```
- [ ] **Step 4: GREEN**, then `git status` must still show `apps/ui/.env.local` present on disk but untracked.
- [ ] **Step 5: Commit** `chore(repo): untrack .env.local and scratch/log artefacts, ignore the classes (F-06)`.

### Task B3: Dev Compose services bind to loopback only (F-04)
**Files:** Modify `dialectical-engine/compose.dev.yaml`; Test `dialectical-engine/tests/architecture/dev-compose-loopback.test.ts` (read `tests/architecture/dev-compose-postgres.test.ts` first and follow its parsing style).

- [ ] **Step 1: Failing test**
```ts
// tests/architecture/dev-compose-loopback.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const compose = readFileSync(resolve(import.meta.dirname, "../../compose.dev.yaml"), "utf8");

function publishedPorts(): string[] {
  const ports: string[] = [];
  let inPorts = false;
  for (const line of compose.split("\n")) {
    if (/^\s{4}ports:\s*$/.test(line)) { inPorts = true; continue; }
    if (inPorts && /^\s{6}-\s*"?[^"]+"?\s*$/.test(line)) { ports.push(line.replace(/^\s*-\s*"?/, "").replace(/"?\s*$/, "")); continue; }
    if (inPorts && !/^\s{6}/.test(line)) inPorts = false;
  }
  return ports;
}

describe("compose.dev.yaml publishes only on loopback (F-04)", () => {
  it("prefixes every published port with 127.0.0.1", () => {
    const ports = publishedPorts();
    expect(ports.length).toBeGreaterThanOrEqual(4); // postgres, hatchet 8888, hatchet 7077, vllm
    expect(ports.filter((port) => !port.startsWith("127.0.0.1:"))).toEqual([]);
  });
});
```
- [ ] **Step 2: RED.**
- [ ] **Step 3: Fix** — in `compose.dev.yaml` change `"8888:8888"` → `"127.0.0.1:8888:8888"`, `"7077:7077"` → `"127.0.0.1:7077:7077"`, `"8000:8000"` → `"127.0.0.1:8000:8000"`. `SERVER_GRPC_BROADCAST_ADDRESS: localhost:7077` stays valid.
- [ ] **Step 4: GREEN**; also run `pnpm exec vitest run tests/architecture/dev-compose-postgres.test.ts tests/architecture/dev-auth-data-plane.test.ts` (they pin compose facts).
- [ ] **Step 5: Commit** `fix(dev-stack): bind hatchet-lite and vllm to 127.0.0.1 (F-04)`.

### Task B4: Dev custody root override + cloud-sync refusal (F-05) — **APPROVED under R4** (custody moves out of the synced tree; source stays synced; README gets a "moving to a new machine" section: regenerate dev keys, never copy custody)
**Files:**
- Create: `dialectical-engine/deploy/dev-auth/custody-root.mjs`, `custody-root.d.mts`
- Modify: `apps/runner/src/dev-secret-files.ts:188-190`, `dev-hatchet-token.ts:202-203`, `dev-api-environment.ts:325-326`, `dev-api-process.ts:64,161`, `dev-auth-data-plane.ts:373`, `dev-database-principals-cli.ts:7`, `deploy/dev-auth/tls-front-door.mjs:321`, `deploy/dev-auth/create-local-certificate.mjs:23`, `deploy/dev-auth/README.md`
- Test: `tests/architecture/dev-custody-root.test.ts`

**Interfaces:** Produces `resolveDevCustodyRoot(repositoryRoot: string, environment?: Record<string, string|undefined>): string` and `DEV_CUSTODY_ROOT_ENV = "DEBATEAI_DEV_CUSTODY_ROOT"`; throws `DevCustodyRootError` with `code` ∈ {`DEV_AUTH_CUSTODY_ROOT_RELATIVE`, `DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED`}.

- [ ] **Step 1: Failing test**
```ts
// tests/architecture/dev-custody-root.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEV_CUSTODY_ROOT_ENV, resolveDevCustodyRoot } from "../../deploy/dev-auth/custody-root.mjs";

describe("dev custody root (F-05)", () => {
  it("defaults to <repo>/.local/dev-auth outside cloud-synced folders", () => {
    expect(resolveDevCustodyRoot("/Users/v/src/engine", {})).toBe("/Users/v/src/engine/.local/dev-auth");
  });
  it("honours an absolute override", () => {
    expect(resolveDevCustodyRoot("/Users/v/src/engine", { [DEV_CUSTODY_ROOT_ENV]: "/Users/v/.debateai/dev-auth" }))
      .toBe("/Users/v/.debateai/dev-auth");
  });
  it("refuses a relative override", () => {
    expect(() => resolveDevCustodyRoot("/Users/v/src/engine", { [DEV_CUSTODY_ROOT_ENV]: ".custody" }))
      .toThrow("DEV_AUTH_CUSTODY_ROOT_RELATIVE");
  });
  it("refuses custody under a cloud-synced folder", () => {
    for (const root of [
      "/Users/v/Library/CloudStorage/OneDrive-Corp/Debate/engine",
      "/Users/v/Dropbox/engine",
      "/Users/v/Library/Mobile Documents/com~apple~CloudDocs/engine"
    ]) {
      expect(() => resolveDevCustodyRoot(root, {})).toThrow("DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED");
    }
  });
  it("is the only place that spells the custody path", () => {
    const sources = [
      "apps/runner/src/dev-secret-files.ts", "apps/runner/src/dev-hatchet-token.ts",
      "apps/runner/src/dev-api-environment.ts", "apps/runner/src/dev-api-process.ts",
      "apps/runner/src/dev-auth-data-plane.ts", "apps/runner/src/dev-database-principals-cli.ts",
      "deploy/dev-auth/tls-front-door.mjs", "deploy/dev-auth/create-local-certificate.mjs"
    ];
    for (const source of sources) {
      const text = readFileSync(resolve(import.meta.dirname, "../..", source), "utf8");
      expect(text, source).not.toMatch(/\.local[/"]|"dev-auth"/);
    }
  });
});
```
- [ ] **Step 2: RED** (module missing).
- [ ] **Step 3: Implement**
```js
// deploy/dev-auth/custody-root.mjs
import { isAbsolute, resolve, sep } from "node:path";

export const DEV_CUSTODY_ROOT_ENV = "DEBATEAI_DEV_CUSTODY_ROOT";
const CLOUD_SYNC_MARKERS = Object.freeze([
  "Library/CloudStorage", "OneDrive", "Dropbox", "Library/Mobile Documents", "iCloud Drive", "Google Drive", "Box"
]);

export class DevCustodyRootError extends TypeError {
  constructor(code) { super(code); this.name = "DevCustodyRootError"; this.code = code; }
}

/** Absolute custody root; refuses relative overrides and cloud-synced locations (keys must never sync). */
export function resolveDevCustodyRoot(repositoryRoot, environment = process.env) {
  const override = environment[DEV_CUSTODY_ROOT_ENV]?.trim();
  const candidate = override !== undefined && override.length > 0 ? override : resolve(repositoryRoot, ".local", "dev-auth");
  if (!isAbsolute(candidate)) throw new DevCustodyRootError("DEV_AUTH_CUSTODY_ROOT_RELATIVE");
  const normalized = resolve(candidate).split(sep).join("/");
  if (CLOUD_SYNC_MARKERS.some((marker) => normalized.includes(`/${marker}/`))) {
    throw new DevCustodyRootError("DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED");
  }
  return resolve(candidate);
}
```
```ts
// deploy/dev-auth/custody-root.d.mts
export const DEV_CUSTODY_ROOT_ENV: "DEBATEAI_DEV_CUSTODY_ROOT";
export class DevCustodyRootError extends TypeError { readonly code: "DEV_AUTH_CUSTODY_ROOT_RELATIVE" | "DEV_AUTH_CUSTODY_ROOT_CLOUD_SYNCED"; }
export function resolveDevCustodyRoot(repositoryRoot: string, environment?: Readonly<Record<string, string | undefined>>): string;
```
Then replace each hard-coded `join(repositoryRoot, ".local", "dev-auth")` (and the two `.mjs` `resolve(".local/dev-auth/tls")` forms) with `resolveDevCustodyRoot(repositoryRoot)` (+ `"tls"`, `"mail"`, `"database-principals.env"` suffixes where the original appended them). `dev-auth-data-plane.ts:373` passes `DEBATEAI_DEV_MAIL_CAPTURE_DIR: join(resolveDevCustodyRoot(cwd), "mail")`. Launchers that spawn children must forward `DEBATEAI_DEV_CUSTODY_ROOT` in the child env allowlist (grep `env:` in `dev-api-process.ts`, `dev-ui-process.ts`, `dev-runner-process.ts`). Add to `deploy/dev-auth/README.md` a "Custody location" section: default, the override, and the refusal codes.
- [ ] **Step 4: GREEN** for the new file, then `pnpm exec vitest run tests/architecture/dev-secret-files.test.ts tests/architecture/dev-local-auth-topology-spec.test.ts tests/architecture/dev-tls-front-door.test.ts tests/architecture/dev-auth-data-plane.test.ts tests/integration/dev-secret-files.test.ts` — if any of these fixtures build a repository root under a cloud marker, set `DEBATEAI_DEV_CUSTODY_ROOT` to a tmp dir in the fixture; do **not** weaken the refusal. `pnpm run typecheck`.
- [ ] **Step 5: Commit** `feat(dev-auth): custody root override, refuse cloud-synced custody (F-05)`.

### Task B5: Fastify request limits and 413 envelope (F-07)
**Files:** Modify `apps/api/src/index.ts:334-338` (constructor), the `setErrorHandler` block (`index.ts:452-492`), and each `api.post("/v1/auth/…")` registration; Test `tests/unit/api-request-limits.test.ts` (follow the `buildApi` stubbing pattern of the existing `tests/unit/*api*.test.ts`).

**Interfaces:** Exports `API_BODY_LIMIT_BYTES = 262_144`, `AUTH_BODY_LIMIT_BYTES = 16_384`, `API_REQUEST_TIMEOUT_MS = 30_000`. **L1 must confirm** the largest legitimate body per route before the values are final; adjust the constants (not the mechanism) if L1 reports a larger legitimate ceiling.

- [ ] **Step 1: Failing test**
```ts
// tests/unit/api-request-limits.test.ts
import { describe, expect, it } from "vitest";
import { API_BODY_LIMIT_BYTES, AUTH_BODY_LIMIT_BYTES, API_REQUEST_TIMEOUT_MS, buildApi } from "@debateai/api";
// use the same minimal ApiOptions stub the neighbouring api tests use (a registration stub is enough)
import { minimalApiOptionsWithRegistration } from "../support/httpSession.js"; // or inline the stub the other tests use

describe("API request limits (F-07)", () => {
  it("advertises the ruled limits", async () => {
    const api = buildApi(minimalApiOptionsWithRegistration());
    await api.ready();
    expect(api.initialConfig.bodyLimit).toBe(API_BODY_LIMIT_BYTES);
    expect(api.initialConfig.requestTimeout).toBe(API_REQUEST_TIMEOUT_MS);
    expect(api.initialConfig.maxParamLength).toBe(128);
  });
  it("refuses an oversized auth body with a typed 413 and no 5xx", async () => {
    const api = buildApi(minimalApiOptionsWithRegistration());
    const response = await api.inject({
      method: "POST", url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      payload: `{"email":"${"a".repeat(AUTH_BODY_LIMIT_BYTES + 1)}"}`
    });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: "PAYLOAD_TOO_LARGE", message: "PAYLOAD_TOO_LARGE" });
  });
});
```
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement**
```ts
export const API_BODY_LIMIT_BYTES = 262_144 as const;   // 256 KiB: asks/investigations are text, far below this
export const AUTH_BODY_LIMIT_BYTES = 16_384 as const;   // credentials, tokens, codes
export const API_REQUEST_TIMEOUT_MS = 30_000 as const;  // time to RECEIVE a request; SSE responses are unaffected
// constructor
const api = Fastify({
  logger: false,
  trustProxy: [...TRUSTED_UI_PROXY_NETWORKS],
  exposeHeadRoutes: false,
  bodyLimit: API_BODY_LIMIT_BYTES,
  requestTimeout: API_REQUEST_TIMEOUT_MS,
  maxParamLength: 128
});
// auth routes: api.post("/v1/auth/register", { ...routePolicy("POST /v1/auth/register"), bodyLimit: AUTH_BODY_LIMIT_BYTES }, …)
// error handler, before the generic branches:
const tooLarge = (knownError as { code?: unknown }).code === "FST_ERR_CTP_BODY_TOO_LARGE";
const statusCode = tooLarge ? 413 : malformed ? 400 : …;
const errorCode  = tooLarge ? "PAYLOAD_TOO_LARGE" : malformed ? "MALFORMED_REQUEST" : …;
// and the 5xx console.error branch must stay >= 500 only (413 is not logged as failure)
```
- [ ] **Step 4: GREEN**; run `pnpm exec vitest run tests/unit` files that touch the API (`grep -l buildApi tests/unit/*.test.ts`) and `tests/architecture/s05-contract.test.ts s07-authorization-contract.test.ts`; `pnpm run typecheck`. If a contract test pins the exact Fastify options object, extend that pin (this is a ruled change), do not delete it.
- [ ] **Step 5: Commit** `fix(api): explicit body/param/request-time limits and typed 413 envelope (F-07)`.

### Task B7: CI security workflow, Dependabot, Node pin (F-03, F-09)
**Files:** Create `.github/workflows/security.yml`, `.github/dependabot.yml`, `.gitleaks.toml` (git root). Test: `dialectical-engine/tests/architecture/ci-security-gates.test.ts`.

- [ ] **Step 1: Failing test** — asserts the three files exist, the workflow pins `node-version: 22.23.1`, runs `pnpm audit --audit-level=moderate`, `gitleaks`, `pnpm run typecheck`, `vitest run tests/unit tests/architecture`, and `github/codeql-action`; Dependabot covers `npm` (directory `/dialectical-engine`) and `github-actions` weekly.
```ts
// tests/architecture/ci-security-gates.test.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const gitRoot = resolve(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(resolve(gitRoot, p), "utf8");
describe("CI security gates (F-03)", () => {
  it("ships the workflow, dependabot and gitleaks config", () => {
    for (const p of [".github/workflows/security.yml", ".github/dependabot.yml", ".gitleaks.toml"]) expect(existsSync(resolve(gitRoot, p)), p).toBe(true);
  });
  it("pins the ruled Node and runs every gate", () => {
    const wf = read(".github/workflows/security.yml");
    for (const needle of ["node-version: 22.23.1", "pnpm audit --audit-level=moderate", "gitleaks", "pnpm run typecheck", "vitest run tests/unit tests/architecture", "github/codeql-action/analyze"]) expect(wf).toContain(needle);
  });
  it("dependabot watches npm and actions weekly", () => {
    const db = read(".github/dependabot.yml");
    expect(db).toContain('package-ecosystem: "npm"'); expect(db).toContain('directory: "/dialectical-engine"');
    expect(db).toContain('package-ecosystem: "github-actions"'); expect(db.match(/interval: "weekly"/g)?.length).toBe(2);
  });
});
```
- [ ] **Step 2: RED.**
- [ ] **Step 3: Create the files**
```yaml
# .github/workflows/security.yml
name: security
on:
  push: { branches: [main, dev] }
  pull_request: { branches: [main, dev] }
  schedule: [{ cron: "23 4 * * 1" }]
permissions: { contents: read }
concurrency: { group: security-${{ github.ref }}, cancel-in-progress: true }
jobs:
  verify:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: dialectical-engine } }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.20.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.23.1, cache: pnpm, cache-dependency-path: dialectical-engine/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run generate:contract
      - run: pnpm run typecheck
      - run: pnpm exec vitest run tests/unit tests/architecture
      - run: pnpm audit --audit-level=moderate
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}, GITLEAKS_CONFIG: .gitleaks.toml }
  codeql:
    runs-on: ubuntu-latest
    permissions: { contents: read, security-events: write }
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: javascript-typescript }
      - uses: github/codeql-action/analyze@v3
```
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/dialectical-engine"
    schedule: { interval: "weekly", day: "monday" }
    groups: { minor-and-patch: { update-types: ["minor", "patch"] } }
    open-pull-requests-limit: 5
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly", day: "monday" }
```
```toml
# .gitleaks.toml
[extend]
useDefault = true
[allowlist]
description = "Test fixtures and documented non-secrets"
paths = [ '''dialectical-engine/tests/.*''', '''dialectical-engine/docs/.*''', '''dialectical-engine/\.hermes/.*''' ]
regexes = [ '''correct horse battery staple''', '''debateai-dev-only''' ]
```
Note: the `secrets` job does not use `working-directory` (gitleaks scans the whole checkout). If `pnpm audit` in CI is flaky on network, keep the step but do not mark it `continue-on-error` — record the flake instead.
- [ ] **Step 4: GREEN**; `act` is not required — push the branch and confirm the three jobs run green on GitHub before merging (record run URLs in the commit body of the integration merge).
- [ ] **Step 5: Commit** `ci(security): typecheck+unit+architecture, pnpm audit, gitleaks, CodeQL, Dependabot (F-03, F-09)`.

### Task B8: SECURITY.md (F-03)
**Files:** Create `SECURITY.md` (git root). Test: extend `tests/architecture/ci-security-gates.test.ts` with `expect(existsSync(resolve(gitRoot, "SECURITY.md"))).toBe(true)` and that it contains "Report a vulnerability".
- [ ] Step 1: RED (add the assertion). Step 2: Write:
```markdown
# Security policy
## Supported branches
`main` (releases) and `dev` (integration). Fixes land on `dev` first.
## Report a vulnerability
Use GitHub's private vulnerability reporting for this repository (Security → Report a vulnerability). Do not open a public issue. You will get an acknowledgement within 3 working days. Please include the commit, the affected surface (API / UI / runner / data / dev-stack), and a reproduction that touches only your own local instance.
## Scope
This product is a local-first application. Testing is welcome **only against instances you run yourself**; never against anyone else's deployment.
## Disclosure
We follow coordinated disclosure: a fix, then a public advisory citing the reporter (unless you prefer anonymity).
```
Step 3: GREEN, commit `docs(security): add SECURITY.md disclosure policy (F-03)`. Then (orchestrator, with V's go from §6 Q1/Q2) enable **private vulnerability reporting**, **secret scanning + push protection**, and **Dependabot alerts** via `gh api -X PATCH repos/DebateAIRO/debateairo` / `gh api -X PUT repos/DebateAIRO/debateairo/private-vulnerability-reporting` — these are account-setting changes and are executed only after V says yes.

### Task B9: Nonce-based CSP for the UI (F-08) — **APPROVED under R4**, still gated on L3 feasibility
**Files:** Create `apps/ui/middleware.ts`; Modify `apps/ui/app/layout.tsx:32-43` (read nonce via `headers()`), `apps/ui/next.config.mjs` (drop the static CSP header when middleware owns it; keep every other header), `tests/integration/s5-ui-security-smoke.mjs:22-25`, `apps/ui/scripts/next-config-csp.test.mjs`.
- [ ] Step 1: RED — change the smoke assertion to `assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]{22,}' 'strict-dynamic'/)` and `assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/)`; run `node tests/integration/s5-ui-security-smoke.mjs` (needs a production build; see the file's own spawn logic).
- [ ] Step 2: Implement
```ts
// apps/ui/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
const STATIC_DIRECTIVES = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const scriptSrc = process.env.NODE_ENV === "development"
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const csp = `${scriptSrc}; ${STATIC_DIRECTIVES}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}
export const config = { matcher: [{ source: "/((?!api/|_next/static|_next/image|icon.svg).*)" }] };
```
```tsx
// apps/ui/app/layout.tsx (RootLayout becomes async)
import { headers } from "next/headers";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (… <script nonce={nonce} dangerouslySetInnerHTML={{ __html: "try{var m=localStorage.getItem('debateai.mode');if(m==='chamber'||m==='terracotta')document.documentElement.dataset.mode=m;}catch(e){}" }} /> …);
}
```
In `next.config.mjs` remove only the `Content-Security-Policy` entry from `headers()` when `process.env.NEXT_OUTPUT_EXPORT !== "1"` (export mode has no middleware, so it keeps the static policy). `/api/*` keeps the API's own CSP (`default-src 'none'`).
- [ ] Step 3: GREEN: smoke test, `apps/ui` node tests, `pnpm --filter dialectical-engine-v2ui build`, and a manual `next start` check that the theme bootstrap still applies (no CSP violation in the browser console — verify with the Browser pane, `read_console_messages`).
- [ ] Step 4: Commit `feat(ui): per-request nonce CSP with strict-dynamic, drop unsafe-inline for scripts (F-08)`.

### Task B10: Admission limits for `POST /v1/asks` and anonymous public reads (F-07) — *minted after L1*
L1 reports whether any per-user spend/admission control exists. If none: reuse the `MfaVerificationLimiter` shape (`apps/api/src/mfa.ts:51-95`, windowed count + temporary block, fail-closed) as a new `AdmissionLimiter` keyed by `ownerRef` for asks and by normalized source IP for `/v1/public/*`; policy values live in a **new versioned register row** `admissionPolicy` in `packages/register/src/session-policy.ts` (proposed: asks `20 / 60 min / user`, public reads `120 / 15 min / source`; both refuse with `429 {error:"ADMISSION_RATE_LIMITED"}` and an audit row via the existing refusal-aggregate pattern). The exact numbers are put to V in `V-DECISIONS-PACKET.md`; the mechanism and the RED test (`tests/unit/api-admission-limits.test.ts`, 21st ask → 429) are not contingent.

### Task B11: History remediation runbook (F-01) — **DROPPED by R1 (2026-09-02): the leaked trees are fake test data; no rewrite, repo stays public.** Kept below only as the procedure to use if a real leak ever happens.
**Files:** Create `docs/missions/2026-09-01-security-hardening/HISTORY-REWRITE-RUNBOOK.md`. No code. Content (to be executed only on V's explicit go, after the algorithm-live-loop mission has merged and every `.worktrees/lane-*` is removed):
1. `gh repo edit DebateAIRO/debateairo --visibility private` (immediate blast-radius cut; reversible).
2. Inventory: `git rev-list --objects --all | grep -E '\.pgdata' | wc -l`, total bytes via `git cat-file --batch-check`.
3. Fresh mirror clone → `git filter-repo --invert-paths --path-glob 'DebateAI-V3/acceptance/.pgdata*' --path-glob '**/.pgdata*'` → verify `git log --all -- 'DebateAI-V3/acceptance/.pgdata-backup-2026-08-11' | wc -l` is 0.
4. Force-push every branch and tag from the mirror; delete stale remote branches (`obs-lane-*`, merged `lane/*`).
5. Ask GitHub Support to purge cached/forked objects (public-repo history stays reachable through forks and the API cache until they do).
6. Every collaborator re-clones; local worktrees are recreated from the rewritten `dev`.
7. Treat the leaked content as disclosed: it was plaintext debate content from the 2026-08-11 acceptance database. Rotate nothing (no credentials were in it — L6 confirms by scanning the blobs before step 3).

### B-Δ: tasks minted from Phase A
Appended by the orchestrator after A.8, one section per `FIX-NOW` finding, same template, ids `B12+`, each citing `L<n>-F<k>`.

---

## 5. Integration and verification

1. Each task lands on `security/fix-<task>`; the orchestrator fast-forwards or merges into `security/2026-09-01-hardening` after: focused tests GREEN, `pnpm run typecheck` GREEN, review of the diff against the task's stated files (no drive-by edits).
2. Before the PR: on a quiet host (§Global Constraints) run `pnpm test:s00` (unit+integration+architecture; integration needs Docker or embedded-postgres) and `pnpm --filter dialectical-engine-v2ui test && pnpm --filter dialectical-engine-v2ui build`; record tails in `docs/missions/2026-09-01-security-hardening/VERIFICATION.md`. Any RED that pre-exists on the baseline is listed by name with the baseline receipt (B0) as evidence, not silently skipped.
3. Open one PR `security/2026-09-01-hardening → dev` titled `security: 2026-09-01 hardening (F-02…F-08, L-findings)` whose body links `findings/CONSOLIDATED.md` and the CI run. V merges.
4. `V-DECISIONS-PACKET.md` carries every `ASK-V` row with the recommended option first and the ambitious option honestly costed.

---

## 6. Open questions for V — **answered 2026-09-02, rulings in §7**

- **Q1 — F-01, public repo with leaked database history.** Recommended: make the repository **private now** (reversible, immediate), rewrite history **after** the live algorithm mission lands (17 worktrees would otherwise need re-creation), then reconsider going public. Alternatives: rewrite now; leave history and only go private; accept as-is.
- **Q2 — Deployment horizon and scope.** Is the product local-only on your Mac for the foreseeable future, or is a hosted deployment planned? Local-only keeps the loopback assumptions and prioritises custody (B4) and dev-stack binding (B3); hosted pulls forward SCRAM/HBA/TLS, backups and break-glass (currently Phase 3 ✗) into this mission. And: stay with "defects + hygiene + CI" (recommended, §1.4) or include the Phase 2–7 programmes?
- **Q3 — Timing versus the live algorithm mission.** Recommended: audit now (read-only), fixes now in separate worktrees, full suites only on a quiet host. Alternatives: audit now / fixes after the mission lands; everything now regardless of host load.
- **Q4 — Two behaviour changes.** (a) B4 makes `pnpm dev:auth:up` **refuse** to run with custody under OneDrive until `DEBATEAI_DEV_CUSTODY_ROOT` points outside the synced tree (recommended; the alternative is a warning, which is not fail-closed). (b) B9 replaces `'unsafe-inline'` scripts with a per-request nonce (recommended if L3 confirms feasibility on Next 15.5; the fallback is to move the one inline script to a static file and keep the current CSP).


---

## 7. Rulings (V, 2026-09-02) and amendments

- **R1 (Q1 — leaked `.pgdata` trees).** They hold **fake test debates** authored by V and a colleague; nothing to protect. Repository stays **public**; **no history rewrite**; F-01 re-graded INFO; B11 dropped. The real debates will live on a separate VPS once deployed → they are the asset Phase C protects.
- **R2 (Q2 — deployment).** **A hosted VPS deployment is planned.** Phase C (below) is added to this mission: production configuration floors in code, an explicit reverse-proxy trust rule for the UI edge, and a VPS deployment baseline (config, systemd, Postgres SCRAM/TLS, encrypted off-host backups, restore drill). The Phase 2–7 product programmes stay out of scope.
- **R3 (Q3 — timing).** Fix now under the quiet-host rule. The live-loop orchestrator (session "Dialectical engine goal implementation") runs a **one-heavy-suite-at-a-time** law on this host: message it before any full `pnpm test` or repo-wide `pnpm run typecheck`; focused files anytime. Never write under `.worktrees/lane-*`, `.worktrees/integration`, or `dialectical-engine/.hermes/reports/2026-09-01-*/`. `TOOLING-TRAPS.md` is append-only; announce appends.
- **R4 (Q4 — behaviour changes).** V wants the *source* synced between two Macs (a new machine is being set up) and will move things out of OneDrive if it causes an issue. Therefore B4 ships **both** the override (`DEBATEAI_DEV_CUSTODY_ROOT`) and the fail-closed cloud-sync refusal, with an error message that names the variable and a suggested path (`~/.debateai/dev-auth`) so the repo itself can stay synced while keys never sync. `deploy/dev-auth/README.md` gains "Moving to a new machine": run `pnpm dev:auth:generate-secrets` + principals + register on the new host; never copy custody. **Nonce CSP (B9) approved** subject to L3's feasibility verdict.

### Merge coordination (R3)
The security branch is off `b5a6b6eb`; the live mission is off `1c9578a` with 95 diverged files on UI/web/serve/kernel/runner. Surfaces this branch touches: `apps/api/src/index.ts` (constructor, error handler, auth-route options), `apps/ui/{middleware.ts,app/layout.tsx,next.config.mjs,server.mjs,trusted-client-ip.mjs}`, `tests/integration/s5-ui-security-smoke.mjs`, `apps/runner/src/dev-*.ts` (custody resolver), `deploy/**`, `compose.dev.yaml`, `package.json` + `pnpm-lock.yaml` (overrides, next bump), `apps/ui/package.json`, `.github/**`, `.gitignore`, `SECURITY.md`, new `tests/architecture/*.test.ts`, `packages/register/src/runtime-environment.ts` (C1), this docs directory. V decides merge order; the orchestrator of the live mission records a closure "dev-sync" step.

---

## 8. Phase C — hosted deployment baseline (added under R2)

### Task C1: Production configuration floors (code)
**Files:** Modify `packages/register/src/runtime-environment.ts` (`validateApiEnvironment`, `loadRunnerEnvironment`); Test `tests/unit/production-environment-floors.test.ts` (find the existing tests that call `parseApiEnvironment` with `grep -rl parseApiEnvironment tests` and copy their fixture builder).

**Interfaces:** Produces `assertProductionFloors(environment: { NODE_ENV?: string; [key: string]: unknown }): void` (exported for the runner path) throwing `TypeError` with messages `DATABASE_URL_TLS_REQUIRED:<KEY>`, `HATCHET_TLS_REQUIRED`, `API_HOST_MUST_BE_LOOPBACK`. Applied only when `NODE_ENV === "production"`.

- [ ] **Step 1: Failing test**
```ts
// tests/unit/production-environment-floors.test.ts
import { describe, expect, it } from "vitest";
import { parseApiEnvironment } from "@debateai/register";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js"; // build it from the existing parseApiEnvironment tests if absent

const production = (overrides: Record<string, string | undefined>) =>
  parseApiEnvironment({ ...validApiEnvironmentFixture(), NODE_ENV: "production", ...overrides });

describe("production configuration floors (R2)", () => {
  it("accepts loopback database hosts without TLS", () => {
    expect(() => production({ DATABASE_URL: "postgresql://api:pw@127.0.0.1:5432/debateai?sslmode=disable" })).not.toThrow();
  });
  it("refuses a remote database URL without sslmode=verify-full", () => {
    expect(() => production({ DATABASE_URL: "postgresql://api:pw@db.internal:5432/debateai?sslmode=require" }))
      .toThrow("DATABASE_URL_TLS_REQUIRED:DATABASE_URL");
    expect(() => production({ ERASURE_DATABASE_URL: "postgresql://erasure:pw@10.0.0.5:5432/debateai" }))
      .toThrow("DATABASE_URL_TLS_REQUIRED:ERASURE_DATABASE_URL");
  });
  it("refuses HATCHET_TLS_STRATEGY=none against a non-loopback Hatchet", () => {
    expect(() => production({ HATCHET_TLS_STRATEGY: "none", HATCHET_HOST_PORT: "hatchet.internal:7077" })).toThrow("HATCHET_TLS_REQUIRED");
    expect(() => production({ HATCHET_TLS_STRATEGY: "none", HATCHET_HOST_PORT: "127.0.0.1:7077" })).not.toThrow();
  });
  it("refuses a public API bind (the edge proxy is the only public listener)", () => {
    expect(() => production({ API_HOST: "0.0.0.0" })).toThrow("API_HOST_MUST_BE_LOOPBACK");
  });
  it("applies none of this outside production", () => {
    expect(() => parseApiEnvironment({ ...validApiEnvironmentFixture(), NODE_ENV: "development", API_HOST: "0.0.0.0" })).not.toThrow();
  });
});
```
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement** (in `runtime-environment.ts`, above `validateApiEnvironment`)
```ts
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
function isLoopbackHost(host: string): boolean { return LOOPBACK_HOSTS.has(host.toLowerCase()); }
function databaseUrlNeedsTls(url: string): boolean {
  const parsed = new URL(url);
  return !isLoopbackHost(parsed.hostname) && parsed.searchParams.get("sslmode") !== "verify-full";
}
export function assertProductionFloors(environment: Readonly<Record<string, unknown>>): void {
  if (environment.NODE_ENV !== "production") return;
  for (const key of Object.keys(environment).filter((name) => name.endsWith("_DATABASE_URL") || name === "DATABASE_URL")) {
    const value = environment[key];
    if (typeof value === "string" && databaseUrlNeedsTls(value)) throw new TypeError(`DATABASE_URL_TLS_REQUIRED:${key}`);
  }
  const hatchetHost = typeof environment.HATCHET_HOST_PORT === "string" ? environment.HATCHET_HOST_PORT.replace(/:\d+$/, "") : "";
  if (environment.HATCHET_TLS_STRATEGY === "none" && !isLoopbackHost(hatchetHost)) throw new TypeError("HATCHET_TLS_REQUIRED");
  if (typeof environment.API_HOST === "string" && !isLoopbackHost(environment.API_HOST)) throw new TypeError("API_HOST_MUST_BE_LOOPBACK");
}
```
Call `assertProductionFloors(environment)` as the first statement of `validateApiEnvironment` and before `return environment` in `loadRunnerEnvironment` (the runner has no `API_HOST`; the DB/Hatchet floors apply).
- [ ] **Step 4: GREEN**; run every test that references `parseApiEnvironment`/`loadRunnerEnvironment` (`grep -rl 'parseApiEnvironment\|loadRunnerEnvironment\|loadApiEnvironment' tests`), `pnpm run typecheck` (coordinated window).
- [ ] **Step 5: Commit** `feat(register): production floors — remote DB TLS, Hatchet TLS, loopback API bind (R2)`.

### Task C2: Explicit reverse-proxy trust for the UI edge (code)
Why: on the VPS a TLS-terminating reverse proxy (Caddy/nginx) sits in front of `server.mjs`. Today `hardenIncomingProxyHeaders` discards every forwarded header, so **every client would be seen as 127.0.0.1**: all per-source rate limits collapse into one bucket and the audit source-IP becomes meaningless. Trust must be explicit and exact, never guessed.

**Files:** Modify `apps/ui/trusted-client-ip.mjs`, `apps/ui/trusted-client-ip.d.mts`, `apps/ui/server.mjs`; Test `apps/ui/lib/trustedClientIp.test.mjs` (node:test, register it in `apps/ui/scripts/node-test-manifest.json`).

**Interfaces:** `parseTrustedProxies(text: string | undefined): readonly string[]` (exact IPv4/IPv6 literals, comma-separated; refuses CIDRs, hostnames, whitespace-only garbage with `DIALECTICAL_UI_TRUSTED_PROXIES_INVALID`); `hardenIncomingProxyHeaders(headers, remoteAddress, trustedProxies = [])`. Env: `DIALECTICAL_UI_TRUSTED_PROXIES` (default empty = current behaviour).

- [ ] **Step 1: Failing test**
```js
// apps/ui/lib/trustedClientIp.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { hardenIncomingProxyHeaders, parseTrustedProxies, TRUSTED_CLIENT_IP_HEADER } from "../trusted-client-ip.mjs";

test("untrusted remote: every forwarded header is dropped and the socket address wins", () => {
  const headers = { "x-forwarded-for": "203.0.113.9", forwarded: "for=203.0.113.9", host: "localhost" };
  hardenIncomingProxyHeaders(headers, "127.0.0.1", ["10.0.0.2"]);
  assert.equal(headers["x-forwarded-for"], undefined);
  assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "127.0.0.1");
});
test("trusted remote: the LAST x-forwarded-for hop becomes the client ip", () => {
  const headers = { "x-forwarded-for": "198.51.100.7, 203.0.113.9" };
  hardenIncomingProxyHeaders(headers, "10.0.0.2", ["10.0.0.2"]);
  assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "203.0.113.9");
  assert.equal(headers["x-forwarded-for"], undefined);
});
test("trusted remote with a malformed hop falls back to the socket address", () => {
  const headers = { "x-forwarded-for": "not-an-ip" };
  hardenIncomingProxyHeaders(headers, "10.0.0.2", ["10.0.0.2"]);
  assert.equal(headers[TRUSTED_CLIENT_IP_HEADER], "10.0.0.2");
});
test("parseTrustedProxies accepts exact literals only", () => {
  assert.deepEqual(parseTrustedProxies("10.0.0.2, ::1"), ["10.0.0.2", "::1"]);
  assert.deepEqual(parseTrustedProxies(undefined), []);
  for (const bad of ["10.0.0.0/8", "proxy.internal", "10.0.0.2;::1"]) assert.throws(() => parseTrustedProxies(bad), /DIALECTICAL_UI_TRUSTED_PROXIES_INVALID/);
});
```
- [ ] **Step 2: RED** (`node --test apps/ui/lib/trustedClientIp.test.mjs`).
- [ ] **Step 3: Implement**
```js
// trusted-client-ip.mjs additions
export function parseTrustedProxies(text) {
  if (text === undefined || text.trim() === "") return Object.freeze([]);
  const entries = text.split(",").map((entry) => entry.trim());
  const normalized = entries.map((entry) => normalizeClientIp(entry));
  if (normalized.some((entry) => entry === null)) throw new Error("DIALECTICAL_UI_TRUSTED_PROXIES_INVALID");
  return Object.freeze(normalized);
}
export function hardenIncomingProxyHeaders(headers, remoteAddress, trustedProxies = []) {
  const forwardedFor = headers["x-forwarded-for"];
  for (const name of Object.keys(headers)) { /* unchanged stripping loop */ }
  const socketIp = normalizeClientIp(remoteAddress);
  let clientIp = socketIp;
  if (socketIp !== null && trustedProxies.includes(socketIp) && typeof forwardedFor === "string" && forwardedFor.length <= 512) {
    const hops = forwardedFor.split(",").map((hop) => hop.trim());
    const lastHop = normalizeClientIp(hops[hops.length - 1]);
    if (lastHop !== null) clientIp = lastHop;
  }
  if (clientIp !== null) headers[TRUSTED_CLIENT_IP_HEADER] = clientIp;
}
```
`server.mjs`: `const trustedProxies = parseTrustedProxies(process.env.DIALECTICAL_UI_TRUSTED_PROXIES);` at boot (throws → process refuses to start), passed to both `hardenIncomingProxyHeaders` calls. Update the `.d.mts` signatures. The API side (`TRUSTED_UI_PROXY_NETWORKS`) stays loopback: Next remains the only hop to the API.
- [ ] **Step 4: GREEN**; run `pnpm --filter dialectical-engine-v2ui test`; `node apps/ui/lib/sessionProxy.test.mjs`.
- [ ] **Step 5: Commit** `feat(ui-edge): explicit trusted reverse-proxy list for client ip (R2)`.

### Task C3: VPS deployment baseline (config, units, Postgres, backups, runbook)
**Files (create):** `deploy/vps/README.md`, `deploy/vps/Caddyfile`, `deploy/vps/compose.prod.yaml`, `deploy/postgres/pg_hba.conf.template`, `deploy/postgres/hardening.sql`, `deploy/vps/systemd/debateai-api.service`, `deploy/vps/systemd/debateai-ui.service`, `deploy/vps/systemd/debateai-runner.service`, `deploy/vps/backup.sh`, `deploy/vps/restore-drill.sh`; Test `tests/architecture/vps-deployment-baseline.test.ts`.

Floors the test pins (each is a `toContain` on the named file):
- `Caddyfile`: `header_up X-Forwarded-For`, `Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"`, `request_body { max_size 1MB }`, `reverse_proxy 127.0.0.1:3001`, no `:80` plaintext site except the automatic redirect.
- `compose.prod.yaml`: every `ports:` entry starts with `127.0.0.1:`; postgres `command:` contains `-c ssl=on`, `-c password_encryption=scram-sha-256`, `-c log_connections=on`, `-c log_disconnections=on`; `POSTGRES_PASSWORD_FILE` (never inline); `hatchet-lite` has **no** `SERVER_AUTH_COOKIE_INSECURE`/`SERVER_GRPC_INSECURE`; `vllm` absent (model access is via authenticated CLIs per DR-179) or loopback + `--api-key`.
- `pg_hba.conf.template`: only `scram-sha-256` and `hostssl` lines for non-local, `reject` catch-all last.
- `hardening.sql`: `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`, `ALTER DATABASE debateai SET statement_timeout`, per-role `SET search_path`.
- systemd units: `User=debateai`, `NoNewPrivileges=true`, `ProtectSystem=strict`, `PrivateTmp=true`, `ReadWritePaths=` (custody + data only), `EnvironmentFile=/etc/debateai/<svc>.env` (0600 root:debateai), `Environment=NODE_ENV=production`, `Environment=DIALECTICAL_UI_TRUSTED_PROXIES=127.0.0.1` for the UI unit.
- `backup.sh`: `pg_dump --format=custom` piped to `age -r` (public key in `/etc/debateai/backup.age.pub`), `set -euo pipefail`, off-host copy (`rclone copy` or `scp`), retention pruning, receipt line `BACKUP_OK <sha256> <bytes>`; `restore-drill.sh`: restores into `debateai_drill`, runs `SELECT count(*)` on `core.runs` and the audit chain check, prints `RESTORE_DRILL_OK`, drops the drill DB.
- `README.md`: firewall (`ufw allow 22,80,443; ufw default deny incoming`), unattended-upgrades, secrets custody at `/etc/debateai` 0600, key generation with the existing `dev:auth:generate-secrets`-equivalent production commands, principal provisioning via `pnpm db:provision-principals`, quarterly restore drill, log retention, break-glass = deliberately absent (Phase 2), the exact boot order.
- [ ] Step 1 RED (test asserts existence + floors), Step 2 author the files, Step 3 GREEN, Step 4 `shellcheck` both scripts if installed (record), Step 5 commit `feat(deploy): VPS baseline — Caddy, hardened compose/postgres, systemd, encrypted backups, restore drill (R2)`.
