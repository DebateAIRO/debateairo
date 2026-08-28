# DEV-12E external review — Claude Opus 5, round 2

- Date: 2026-08-27
- Model: `claude-opus-5` (Anthropic first-party)
- Session: `b691468d-6596-4d4a-9bf1-ac5837557af4`
- Mode: read-only (`Read`, `Grep`, and `Glob`; no edit, shell, web, or
  subprocess tools)
- Frozen input: [`DEV-12E-freeze.sha256`](../logs/DEV-12E-freeze.sha256)
- Cost: `$4.6320535`
- Turns: `54`
- Verdict: **GREENLIGHT**

## Terminal verdict

Claude inspected every frozen path plus the narrow non-frozen settlement,
serve, runner, and schema call sites necessary to determine reachability. It
found no remaining P0/P1 in this bounded local-provider/runner lifecycle.

The reviewer independently cleared:

1. persistent post-listen provider error observation, exact `exited` receipt,
   and six-resource reverse shutdown;
2. subject-run scorecard-cell facts linked through recorded
   `answer_outcome_id@at_seq` derivations, including the Q56 activation
   consequence;
3. actual `debateai_runtime` provider-probe INSERT denial and narrow capability
   access;
4. the single exported provider target, receipt mismatch rejection, resolver
   single-flight, recovered-ABSENT re-probe, and runner readiness ordering;
5. over-the-wire provider negative routes, model/body/prompt rejection, and no
   provider egress;
6. publication owner step-up at both HTTP and application layers, isolated
   corpus custody/cleanup principal, orphan reconciliation, and visibility
   revalidation after decrypt;
7. the honest one-responder `DOWNGRADED` claim and the disclosed absence of a
   broader Q56 cross-run class mapping.

## Non-blocking follow-ups

- **P2:** add direct census tests for the set-aside counting branch and both
  `CENSUS_PARTITION_INVALID` guard clauses. The live defect is repaired, but
  the exact guard branches are not yet behaviorally covered.
- **P3:** confirm the class-H/hidden-review relationship when a future ticket
  enables multiple makers. The demonstrated one-maker path makes class H
  empty.
- **P3:** a later run's scorecard cell can cite an outcome from the subject run
  and increase the disclosed `scorecard_cells` number. This cannot change Q56's
  activation predicate because the subject answer outcome already makes it
  nonzero.
- **P3:** two architecture tests remain source-string shaped, backed by
  behavioral PostgreSQL/topology tests but less durable against refactors.

The reviewer could not independently hash the manifest or read the
`/private/tmp` JSON receipts because its seat deliberately had no shell access.
Its verdict rests on the source and test content it read directly. Codex
verified the 37-path manifest with `shasum -a 256 -c` and ran the recorded
commands before handoff.
