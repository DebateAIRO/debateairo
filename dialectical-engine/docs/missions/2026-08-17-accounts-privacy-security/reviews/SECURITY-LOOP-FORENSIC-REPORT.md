# Security Loop Forensic Report — Claude Examination Packet

Case date: 2026-08-28  
Case: Accounts, authentication, privacy, and local-QA security loop  
Scope: process integrity, evidence quality, escaped outcomes, and corrective controls  
Constraint: this is a post-mortem, not a production-readiness or legal-compliance claim.

## 1. Detective's verdict

The victim was **product truth**: the distinction between “an internal contract passed” and “the user-visible outcome works.”
The primary cause was a broken requirement-to-evidence chain. The clearest escape is email: the ruling required an owned mail service with no relay, while implementation and review proved only a sendmail adapter and local file-capture sink; status then called the mail lifecycle complete.
The security engineering itself was strong. It found serious concurrency, enumeration, least-privilege, erasure, evaluator-binding, and resource-exhaustion defects. The process failure was aiming that rigor at a narrowed boundary and calling it DONE.

## 2. Scene measurements and commands

- `git branch --show-current` → `dev`.
- `git log --oneline -1` → `80362d0 chore: checkpoint all local mission artifacts`.
- `git status --porcelain=v1` aggregation → 312 entries: 69 tracked modifications, 243 untracked, 0 staged; `git stash list | wc -l` → 0.
- `git diff --stat` → 69 files, 2,594 insertions, 526 deletions.
- `hermes kanban --board accounts-phase1 stats` → 24/24 done.
- `hermes kanban --board auth-front-door stats` → 13/13 done.
- `hermes kanban --board accounts-program-closure stats` → 33 done, 16 blocked, 10 ready, 1 running, 42 todo.
- Timed-ticket calculation from `hermes ... list --json | jq ...`: Phase 1 median 7,547s, P90 112,577s, maximum 189,607s, summed elapsed 688,887s. Elapsed values may overlap and are not labor hours.
- `find .../reviews -type f | wc -l` → 146 review files; logs → 1,181 files; `du -sh` → 1.4 MB reviews and 244 MB logs.
- Largest single log from `find ... | xargs du -h | sort -h` → `S3-codex.log`, 173 MB.

## 3. Exhibits proving the escaped email requirement

- Exhibit A — authoritative ruling: `AMENDMENTS.md:159-163` says **own mail service, NO relays**, spam guidance, resend cooldown, and operator-visible failures.
- Exhibit B — ticket packet: `logs/S3-packet.md:43-51` repeats that exact ruling and requires a swappable sender plus a dev/test transport.
- Exhibit C — implementation: `apps/api/src/mail-channel.ts` safely spawns a configured sendmail-compatible executable; it does not implement an Internet-facing MTA.
- Exhibit D — current dev transport: `deploy/dev-auth/sendmail-capture.mjs` writes private `.eml` files and opens no network transport.
- Exhibit E — measured runtime configuration: `.local/dev-auth/api.env` points `MAIL_SENDMAIL_PATH` to that capture sink and uses `MAIL_FROM=noreply@localhost.test`; six `.eml` files exist.
- Exhibit F — contradictory completion claim: `IMPLEMENTATION-STATUS.md:27` marks P1-S3 complete and includes “mail lifecycle.”
- Causal chain: ruling → narrowed packet interpretation → adapter/capture tests → reviewer anchoring → green verdict → status checkmark → manual QA discovers no external email.

## 4. What went well

1. Independent review found genuine defects: registration timing oracles, unauthenticated memory/audit growth, limiter bypass, resend deadlocks, PostgreSQL unassigned-record denial failures, evaluator cross-run attribution, erasure races, and owner-history exhaustion.
2. RED-first and mutation work frequently proved non-vacuity; green mutants triggered stronger tests rather than waivers.
3. S10 preserved uncomfortable evidence: a lost mutation baseline invalidated dependent receipts; first and second full-suite REDs remained recorded; evidence defects were not mislabeled product defects.
4. The terminal S10 receipt (`pnpm test --reporter=json --outputFile=/private/tmp/s10-third-full-final.json`) reached 139/139 files, 400/400 suites, 1,345/1,345 tests in 2,146.927s.
5. Live-stack execution caught PostgreSQL 18, Hatchet, UI startup, provider, and runner integration defects that mocks missed.

## 5. What went wrong

1. **Oracle failure:** tests proved the software boundary selected by implementers, not every authoritative user outcome.
2. **Reviewer anchoring:** reviewers attacked frozen packets but lacked an independent ruling-to-runtime coverage examination; eleven-agent S3 verification (ticket records 1.63M tokens) still missed external mail delivery.
3. **False convergence:** S3 verification later reported three regressions whose new proof tests passed deliberately broken code.
4. **Oversized tickets:** S3 elapsed 189,607s; T1 135,511s; S3d 112,577s; S10 98,403s. T1 recorded 30 attempts, 29 manually reclaimed.
5. **Serial review:** repeated “final” audits revealed one adjacent P0/P1 after each refreeze instead of one checklist-complete finding batch.
6. **Late vertical proof:** full-suite and browser QA arrived after extensive focused evidence; the user became the first effective external-mail acceptance test.
7. **Custody risk:** mutation work once lost the sole exact 0040 baseline; the present 312-entry dirty tree is not a safe release unit.
8. **Evidence debt:** 244 MB of logs and a retrospective ledger that stops at DEV-11A made the record expensive yet incomplete during the decisive later work.
9. **Tooling churn:** sandbox IPC/loopback failures, Docker/Rosetta, reviewer logout/quota/TUI failures, missing final transcripts, long silent tests, and teardown hangs consumed review time without product signal.
10. **Ambiguous DONE:** code-complete, contract-green, locally integrated, operator-ready, user-verified, and deploy-ready were collapsed into one checkmark.

## 6. Examinations Claude must perform

1. Reconcile every `AMENDMENTS.md` ruling to one implementation owner, one deterministic test, one live-runtime receipt, and—where user-facing—one journey receipt; list every orphan.
2. Confirm whether any production MTA, SPF, DKIM, DMARC, PTR/rDNS, queue, bounce processor, or external-mailbox receipt exists. Treat absence as `MAIL_OPERATIONAL_NOT_IMPLEMENTED`, not a test gap.
3. Audit every `IMPLEMENTATION-STATUS.md` checkmark against the completion ladder below; identify overclaims.
4. Sample S3, T1, S3d, and S10 reviewer packets for shared assumptions that independent reviewers failed to challenge.
5. Classify REDs into product defect, evidence defect, stale fixture, environment/tool failure, expected mutant, and custody failure; reject flattened counts.
6. Examine whether the current 312-path tree can be partitioned into a reproducible merge unit without losing untracked evidence.
7. Determine which full-suite defects focused gates could not detect and move only those checks earlier.

## 7. Required corrective controls

1. Replace one ✓ with: `CODE_COMPLETE`, `CONTRACT_GREEN`, `INTEGRATED_LOCAL`, `OPERATOR_READY`, `USER_JOURNEY_GREEN`, `DEPLOY_READY`.
2. Add a requirement-to-receipt matrix; external outcomes require external witnesses.
3. Open an owned-MTA ticket covering a public domain, MTA, SPF/DKIM/DMARC, PTR/rDNS, queue/bounce visibility, abuse bounds, restart/drain, and delivery to an external mailbox.
4. Add one executable journey: register → external email → verify → MFA → logout/login → create/reload debate → publish where supported → delete → verify aftermath.
5. Cap tickets at one primary invariant and two substantive review rounds; otherwise split and reopen design.
6. Require one checklist-complete reviewer pass, one consolidated finding batch, and one bounded recheck; reviewer reads authoritative rulings independently of the packet.
7. Run mutants only in disposable worktrees with automatic hash restoration in `finally`.
8. Store compact JSON receipts and summaries; archive interactive transcripts outside the release diff.
9. Measure implementation, tests, review, orchestration, waiting, and environment failure separately.
10. Before merge, classify and clean all 312 status entries; do not push the current mixed scene as one unit.

## 8. Uncertainty and requested verdict

- Board durations are measured wall-clock intervals, not clean labor hours; overlapping work prevents a defensible cost total.
- The closure board is stale enough that its one running item cannot be treated as live truth without a current ticket comment.
- No public domain, DNS state, public-IP reputation, or outbound port-25 probe was examined; exact MTA feasibility remains UNKNOWN.
- Requested Claude verdict: `CONFIRMED`, `CONFIRMED_WITH_CORRECTIONS`, or `REJECTED`, with each challenged claim tied to a command or repository line.
