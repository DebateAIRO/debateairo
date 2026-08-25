# S5 final review — Grok 4.6 independent security lens

You are the sole independent Grok 4.6 reviewer for Accounts Phase 1 S5
`t_4f4e7ac2`: sessions, HttpOnly cookie, CSRF, and security headers. You did not
author or route the candidate.

Read-only review: do not edit, stage, commit, merge, push, mutate Kanban,
launch subagents, or search the web. You may run inspection/tests/builds.

## Custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s5/dialectical-engine`
- Branch: `codex/accounts-s5`
- Base/post-S4 dev: `44207914aa90b5f4b263dc6c5a25480c5e4f96da`
- Candidate: `ec2c1cc739d01f90c987239d1734ac0254dc282f`
- Review the complete `44207914..ec2c1cc` 49-file diff and adjacent code.
- Worktree must remain clean before and after.

## Binding security contract

- Server-side sessions use 256-bit opaque random tokens; only SHA-256 hashes
  persist. Real sessions are `provisional=false`. Browser session token is only
  a host-only `__Host-` HttpOnly Secure SameSite=Lax Path=/ cookie, never JS,
  JSON, URL, localStorage, logs, or audit.
- Password alone never creates a session. Active users complete an expiring,
  hashed, single-use MFA challenge with nonreplayed TOTP or atomic one-time
  recovery proof; two concurrent second legs mint at most one session.
- Session authority is in PostgreSQL, not cookie expiry: 14-day sliding idle,
  90-day absolute cap, strict boundary expiry, conditional refresh, individual
  revoke, revoke-all, logout, and idempotent/foreign-safe semantics. Step-up is
  a fresh proof that rotates session and CSRF; the old token dies immediately.
- Every cookie-authenticated state mutation requires BOTH exact configured UI
  Origin and a session-bound CSRF proof, including logout, session revocation,
  step-up, asks, investigations, and memory unlink. Missing/null/multiple/
  malformed/cross-origin requests fail closed. Invalid or revoked cookie auth
  never falls back to legacy auth; simultaneous channels are rejected.
- The temporary S9 rollback path is explicit, default OFF, exact-credential-only,
  and remains `provisional=true` with distinct provenance. Any nonempty header
  is never accepted.
- BOTH apps/ui and web BFFs narrowly forward only the exact session credential,
  original browser Origin, CSRF token, and audit User-Agent while preserving T2
  socket-derived forwarding. They strip unrelated cookies, Authorization,
  internal/forwarded spoofing, CORS/hop-by-hop baggage, and hostile same-name
  Set-Cookie variants. Only exact lawful issuance/deletion cookie shapes pass.
- API and both UIs emit no-store/private security responses and CSP/HSTS/XFO/
  Referrer/Permissions/nosniff headers on successes, errors, 404s, and raw SSE.
  CSP must not break production hydration or required functionality.
- Session/auth audits run memory-hard context derivation before DB locks, use
  public session targets, minimize/hash source evidence, exclude every password,
  cookie, CSRF, challenge, TOTP/recovery secret and token/hash, and preserve the
  audit chain. No Argon/decrypt while holding a DB connection. S3/S4/T1/T2/T3
  invariants, shared Argon pool, lock order, and graceful shutdown remain intact.
- Contract inventory/client and both UIs expose cookie-native login/MFA/session
  list/revoke/revoke-all/logout/step-up; no live browser manual-token surface.

## Adversarial focus

Attack token fixation, cookie shadowing/duplicate parsing, Set-Cookie response
smuggling, CSRF bypass through proxy header synthesis, Origin ambiguity, session
refresh-vs-revoke/absolute boundary races, challenge replay/concurrent proof,
TOTP/recovery replay, cross-user session deletion, step-up staleness, rollback
downgrade, 401/403 distinctions and enumeration, audit secret/UUID leakage,
cookie clearing mismatch, cache/header omissions on error/SSE, CSP vacuity,
shutdown leaks, database lock inversion, and test mutants/vacuity. Inventory all
state-changing cookie-auth routes rather than reviewing only new auth endpoints.

Author evidence on final bytes: initial 9/9 RED; full unit 74 files/718 tests;
S5 HTTP/client 13/13; real PostgreSQL/Argon/TOTP/concurrency 6/6; apps/ui proxy
1/1; web proxy 3/3; apps/ui Node 28/28; render 5/5; root/apps-ui/web typechecks;
both production builds; live production 200+404 CSP/header hydration smoke on
both UIs; contract generation no drift; lint 28 architecture edges/0 violations
and source 0 blockers; clean diff/index/worktree. Re-run proportionately and do
not trust the summary.

Return findings first with severity, exact file/line, exploit/failure mechanism,
and smallest correction. End with exactly one marker:

`GROK S5 APPROVED`

or

`GROK S5 CHANGES REQUESTED`

Do not approve merely because tests are green.
