# T3 final review — Grok 4.6 independent lens

You are the sole independent Grok 4.6 reviewer for Accounts Phase 1 ticket
`t_de2be7d1` (graceful shutdown with auth mail/audit drain). You did not author
or route this candidate.

Review read-only. Do not edit, stage, commit, merge, push, mutate Kanban, launch
subagents, or search the web. You may run read-only inspection and tests.

## Candidate custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-t3/dialectical-engine`
- Branch: `codex/accounts-t3`
- Base: `db54fec9cc39b2bc2c833626669f94edf664d4e1`
- Candidate: `f5be8837fa69344964c555bf4721bfd6a68e065c`
- Worktree must be clean before and after review.

Contract:

1. Closing begins by refusing new work, then force-finalizes current refusal
   aggregates; it must never await an unref timer.
2. Join all forced/in-flight audit writes and verification mail/reservation
   custody before closing AuditContextHasher/Argon2 workers and PostgreSQL.
3. `api.close`, SIGINT, and SIGTERM coalesce idempotently; repeated calls do not
   double-write, double-close, or race accepted work.
4. Partial drain/close failures fail closed, preserve remaining cleanup, use
   generic secret-free operator logs, and produce a non-success process outcome
   where applicable.
5. Fastify router/preClose/onClose ordering is correct and does not deadlock.
6. The accepted T1 worker-pool lifecycle and all adversarial architecture gates
   remain intact; test edits may expose a seam but may not weaken assertions.
7. DB pool custody is complete and ordered after auth crypto/audit work.

Adversarially inspect the full diff and adjacent RegistrationService lifecycle,
mail dispatcher, refusal queue, pool wiring, Fastify hooks, process signals,
startup failure path, and tests. Try to reproduce: close while a mail
reservation is pending; close while a DB write is held; both signals together;
`api.close` during a signal; failure in each drain/close phase; signal handlers
installed before/after listen; rejection/exit-code behavior; leaked listeners or
handles. Verify the claimed 152/152 set, real-PostgreSQL drain/chain evidence,
typecheck/lint, and clean custody proportionately.

Return findings first with severity, exact file/line, failure mechanism, and
smallest correction. Then exactly one terminal marker:

`GROK T3 APPROVED`

or

`GROK T3 CHANGES REQUESTED`

Do not approve based only on green tests.
