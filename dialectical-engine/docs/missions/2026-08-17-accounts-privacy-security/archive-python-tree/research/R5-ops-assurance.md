# R5 — Operations, Deployment, Logging & Assurance Posture (research asset, Wave 1)

Base `B` = `apps/dialectical-engine`. READ-ONLY. Produced by the R5 research agent, 2026-08-17.

## 1. Hosting / transfer plans
Intended shape: public site `https://dezbatere.ro` (+www) = a **residential Mac mini behind a Cloudflare Tunnel** — no traditional hosting. Coordinator :8000, web :3000, tunnel `dialectical` as user launchd service.
- `Cloudfare_TODO.md` (typo twin) is the real 196-line checklist; `Cloudflare_TODO.md` is a pointer. Steps: CF zone, NS delegation, `cloudflared tunnel login`, named tunnel + launchd `com.dialectical.cloudflared`. Hard-codes prior operator path `/Users/stefannour/...` (`:83`).
- **Status conflict:** `Cloudfare_TODO.md:177-184` lists blockers (cert.pem missing, still on Romarg) but newer `ManualSetup_TODO.md:39-47` (2026-06-15) shows **all hosting boxes checked** — NS delegated to `pat.ns.cloudflare.com`/`toby.ns.cloudflare.com`, tunnel loaded, `https://dezbatere.ro/` + `/api/backends/status` serving. So the site is (or was) **live from a home Mac**.
- Registrar = **Romarg** (Romanian); NS delegation only; A-records to home IP forbidden. `deploy/README.md` two-machine target: Mac mini (coordinator/web/Worker A/tunnel) + **Worker B on an "adesso MacBook" (corporate-named laptop)** connecting outbound.
- **Vendors receiving data:** Cloudflare (all HTTP terminates at their edge), Romarg/ROTLD (DNS only), GitHub (source), and per model routing: OpenAI/Codex, Anthropic, xAI/Grok, Google/Gemini, local LM Studio. **Operator: a single person on personal subscriptions.**

## 2. Logging
- Coordinator: single stderr handler (`log_config.py:22-27`), captured by launchd. Structured events `oplog.py:19-30` with **explicit content law** (`:9-11`): "ids, types, outcomes, durations only -- never LLM text bodies, prompts, tokens, or any secret/PII-bearing value."
- **Token in log:** `main.py:43` prints user token → world-readable `/tmp/dialectical-coordinator.out.log`; `deploy/README.md:16` tells operator to `tail` it.
- **Debate content in log:** `worker/app/main.py:266` prints up to 2000 chars of model output to `/tmp/dialectical-worker.out.log`. Worker has **no logging framework** — bare `print()`.
- Web: `logger.ts` real redaction (dev-only default). 
- **Destinations/rotation/retention:** launchd writes 12 fixed `/tmp/dialectical-*.{out,err}.log`. **No rotation/retention anywhere**; macOS purges /tmp on reboot — unbounded between reboots, lost on reboot.

## 3. Secrets hygiene
- **No `.env` files exist; `.gitignore` does NOT exclude `.env`** — yet `config.py:18,151-153` loads `B/.env` for `OPENAI_API_KEY`. A future `.env` would be committed by default.
- User token: `secrets.token_urlsafe(32)`, stored bcrypt/PBKDF2-hashed. Worker tokens hashed. Good.
- Plaintext copies: worker `~/.dialectical-worker/config.toml` holds `worker_token` + `user_token` plaintext (no file mode set). `install_worker.py` injects real `GEMINI_API_KEY`/`XAI_API_KEY` into `~/Library/LaunchAgents/com.dialectical.worker.plist`. Browser localStorage bearer.
- Mitigations: placeholder-secret filter; token echo disabled on acceptance; judge/provider metadata secret-scrub. **No secret scanning** (no gitleaks/trufflehog/bandit/semgrep).

## 4. Test corpus
- `coordinator/tests/`: 134 files, ~2337 `def test_`. `worker/tests/`: 8 files, ~127. `web`: 33 files under `web/tests/` + 50 `*.test.mjs` node-tests.
- Security-relevant: `coordinator/tests/test_api_auth_settings.py` — genuine auth/authz suite (public-read vs auth-write, forwarded-IP rate limiting, auth-gated archive/regen/history, worker token/identity rejection, oversized/malformed input rejection, status-without-secrets). Prompt-injection posture = source-invariant checks in `scripts/status_report.py:2042-2093`. Migration coverage thin (no dedicated migration test).
- Frameworks: pytest+asyncio+cov; `make test` `--cov-fail-under=70` on services+adapters only; web via pnpm (no Makefile target runs web tests).

## 5. CI/CD
**None.** No `.github/`, no pre-commit, no active hooks, no SAST/dep/container scanners. Substitute = local `make deploy-preflight`, `make status --strict-production` (source invariants incl. prompt safety), `make acceptance`.

## 6. AGENTS.md + README.md
Single-operator/single-machine assumption throughout; hard-codes prior operator machine paths (`/Users/stefannour/...`). Governance section is for AI agents (Hermes-gated, Codex-only implementation), not humans. README: "local-first… token-gated write/admin"; token printed once on first boot.

## 7. Incident / backup / recovery
No dedicated IR or backup policy doc. Closest: manual pre-migration SQLite `.backup` (`flip-plan-2026-07.md:95-98`); self-healing watchdog `scripts/dezbatere_watchdog.py` (restarts launchd services, can invoke Codex for automated repair, 1h cooldown) hard-coded to another user's paths + `https://dezbatere.ro`. Repo-level DR-188 data-preservation law exists at board level.

## RISK SUMMARY
1. Single shared bearer token = the entire human authz model; printed plaintext to world-readable /tmp log + browser localStorage; no accounts, no revocation granularity.
2. Production = one residential Mac mini: no redundancy, /tmp logs vanish on reboot, only ad-hoc manual SQLite backup — data-loss + availability SPOF.
3. No CI, no secret scanning, `.env` loaded but NOT gitignored — one accidental key file from a committed secret.
4. Worker logs up to 2000 chars of model output to /tmp despite the coordinator's "no LLM text" law.
5. Plaintext user/worker tokens + API keys in `~/.dialectical-worker/config.toml` and LaunchAgents plists (default perms).
6. Rate limiting trusts client `x-forwarded-for` — spoofable unless Cloudflare-only ingress enforced.
7. No log rotation/retention; no IR runbook; recovery = autonomous Codex-invoking watchdog hard-coded to another user's paths.
8. Stale/conflicting ops docs (typo-twin CF files, stefannour paths, June-dated status) make real deployment state unauditable.
