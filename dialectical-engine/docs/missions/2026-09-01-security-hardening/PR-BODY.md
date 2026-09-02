# security: 2026-09-01 hardening (audit + fixes)

Baseline `origin/dev@b5a6b6eb`. Plan, seven audit registers, consolidated triage, verification ledger and the V decisions packet live under `dialectical-engine/docs/missions/2026-09-01-security-hardening/`.

## What this branch changes
- **Supply chain / repo:** pnpm audit clean (overrides for postcss/sharp/nanoid/esbuild, next 15.5.25, drizzle-kit removed), 7-day release-age cooldown + strict dep builds, exact pins in apps/ui, `.nvmrc`, digest-pinned postgres image, stale `web` importer and nested lockfile removed, tracked `.env.local`/scratch/log artefacts untracked and ignored.
- **CI (new `.github/`):** typecheck + unit + architecture tests, `pnpm audit`, gitleaks as a pinned verified binary, CodeQL, Dependabot on `dev`, all actions SHA-pinned; `SECURITY.md`.
- **API:** explicit body/param/request-time limits with typed 413/400/414/415 envelopes and a single 400 shape; per-user ask admission and per-source public-read/recovery-start admission (sealed `admissionPolicy` row, V-1/V-12 pending); constant 400 envelope (no schema disclosure); typed 404; gapRef bound; ask question bound 8 KiB.
- **Production floors (register):** remote DB URLs need `sslmode=verify-full` + CA, content encryption required, Hatchet TLS unless loopback, loopback API bind, cleartext provider targets refused, replay CLI floored.
- **UI edge:** per-request nonce CSP with strict-dynamic (no `unsafe-inline` scripts), static CSP on `/api/*`, fail-closed fallback, explicit trusted reverse-proxy list + edge secret, 1 MiB proxy body cap, upgrade-socket teardown, SSR cookie grammar, proxy abort/timeout, `poweredByHeader` off, image optimizer off, dead export knob removed, production build restored.
- **Crypto:** locale-independent audit canonical order, purpose-prefixed token hashing, derived binding keys, hardened key loaders (O_NOFOLLOW/uid/nlink/mode/size), key zeroisation + `destroyKek`, Argon2 breaker → supervisor restart, unconditional key-domain separation.
- **Custody:** `DEBATEAI_DEV_CUSTODY_ROOT` override + fail-closed refusal of cloud-synced custody (OneDrive/Dropbox/…), one resolver for all nine former hard-codes, README for moving to a new machine.
- **Data:** migration 0056 — reusable `core.install_truncate_guard(regclass)` on 78 append-only relations, PUBLIC EXECUTE revoked on 32 identity functions, search_path pins on 14 invoker functions. (The `serve.answer` plaintext fix is handed to the live mission as a patch: `handoff/`.)
- **Dev stack:** hatchet-lite/vllm loopback-only, dedicated non-superuser Hatchet role, admin credentials/api-key from custody, front-door teardown and hop-by-hop hygiene, bounded graceful shutdown, Hatchet token rotation, mail tokens in the URL fragment, recipient off argv, spool pruning.
- **Deploy (VPS baseline, `deploy/vps/`):** Caddy edge, native hardened Postgres config (SCRAM, TLS, pg_hba, database-level search_path), per-service systemd units, encrypted DB+custody backups with separate key escrow, proving restore drill, runbook.
- **Dev baseline drift:** obsolete `web/` cases retired, drifted contract pins updated and documented; obs-capture purity violations left RED by ruling.

## Evidence
See `VERIFICATION.md` (per-lane RED→GREEN, typecheck, build, smoke) and `findings/CONSOLIDATED.md` (84 findings: 2 HIGH, 25 MEDIUM, 47 LOW; dispositions).

## Needs V
`V-DECISIONS-PACKET.md` (V-1 … V-18): admission values, KEK rotation, default branch, GitHub protections/scanning, tracked archives, dormant husky, production shape, runner-side containment handoff, password maximum, exclusion pruning, serve.answer follow-ups.

## Merge order
Agreed with the live algorithm mission: this branch → `dev` first; its DEV-SYNC then merges `dev` into the mission branch and re-baselines its obs zone pins.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
