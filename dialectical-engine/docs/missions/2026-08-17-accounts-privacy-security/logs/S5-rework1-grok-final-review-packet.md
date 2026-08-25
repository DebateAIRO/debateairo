# S5 rework1 final review — Grok 4.6 independent security lens

You are the sole independent Grok 4.6 reviewer for Accounts Phase 1 S5
`t_4f4e7ac2`. You did not author or route the candidate.

Read-only review: do not edit, stage, commit, merge, push, mutate Kanban,
launch subagents, or search the web. You may run inspection/tests/builds.

## Custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s5/dialectical-engine`
- Branch: `codex/accounts-s5`
- Post-S4 base: `44207914aa90b5f4b263dc6c5a25480c5e4f96da`
- Original S5 candidate: `ec2c1cc739d01f90c987239d1734ac0254dc282f`
- Rework1/final candidate: `9ff7e2ba173f9ed7ad958ef7690ab2df4e97bfa5`
- Worktree must remain clean before and after.

Review `ec2c1cc..9ff7e2ba` for the requested remediation and
`44207914..9ff7e2ba` as the complete final S5 candidate.

## Prior findings that must be independently closed

Your first review ended `GROK S5 CHANGES REQUESTED`. Re-establish each result
from final bytes rather than trusting the author summary.

1. High: BOTH apps/ui and web must render cookie-native session controls for
   logout, active-session list, per-session revoke, revoke-all, and step-up.
   Test the rendered surfaces, not only the contract client. Logout must revoke
   the server row and clear exact cookies.
2. Medium: login challenge completion must read and revalidate
   `password_hash_snapshot` against the current locked user hash for both TOTP
   and recovery paths. A password change after first leg must prevent any
   session, including a race where the challenge was cached before the change.
3. Medium: the concurrent second-leg gate must use distinct accepted TOTP steps
   so the challenge consume predicate—not monotonic step replay—proves at most
   one session. A step-13 follow-up or mutant must make removed consume RED.
4. Medium: SSR cookie auth must narrowly forward the original incoming browser
   User-Agent with the exact session cookie in both UIs. UA A succeeds; UA B
   fails. No broader request headers are forwarded.
5. Low: malformed/non-UUID session revoke ids must be foreign-safe and rejected
   before the repository; generic 5xx bodies must be constant and never expose
   PostgreSQL/driver messages.

Recheck that the original S5 contract still holds: opaque hash-only sessions;
password→single-use MFA challenge→session; conditional sliding/absolute expiry
and revocation; fresh step-up rotation; strict Origin plus session-bound CSRF on
every cookie-auth mutation; exact host-only HttpOnly cookies and BFF request/
response allowlists; default-off exact legacy rollback with no fallback; full
API/UI error/SSE security headers and no-store; audit KDF-before-lock, public
session targets and secret exclusion; no browser token storage; preserved
T1/T2/T3/S3/S4 behavior.

Adversarially inspect the complete rework diff and adjacent implementations.
Specifically attack UI controls for stale/current-session behavior, session list
data minimization, revoke-all/step-up CSRF, password-update races around cached
challenge state, challenge-consume mutants, UA source provenance in Next SSR,
UUID canonicalization, and generic error paths.

Author evidence on final bytes: S5 HTTP 16/16; full unit 74 files/721; rendered
controls/full render 36/36; real PostgreSQL 7/7; apps/ui Node 28/28; root/apps-ui/
web typechecks; both production builds; live 200+404 CSP/header hydration smoke
on both UIs; contract generation no drift; lint 28 architecture edges/0
violations and source 0 blockers; clean diff/index/worktree. Re-run
proportionately and do not trust the summary.

Return findings first with severity, exact file/line, exploit/failure mechanism,
and smallest correction. End with exactly one marker:

`GROK S5 REWORK1 APPROVED`

or

`GROK S5 REWORK1 CHANGES REQUESTED`

Do not approve merely because tests are green.
