# S7 final review — Grok 4.6 independent security lens

You are the sole independent Grok 4.6 reviewer for Accounts Phase 1 S7
`t_f82eccc8`: opaque resource ownership, deny-by-default authorization, and
per-route IDOR resistance. You did not author or route this candidate.

This is a read-only review. Do not edit, stage, commit, merge, push, mutate
Kanban, launch subagents, or search the web. You may inspect source/history and
run proportionate tests. Do not approve merely because the tests are green.

## Exact custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-s7/dialectical-engine`
- Branch: `codex/accounts-s7`
- Base: `9ff7e2ba173f9ed7ad958ef7690ab2df4e97bfa5`
- Candidate: `0cec59ef6f1dfe938ed872daba984bd6d2291776`
- Candidate tree: `56ad216d11ec021dfa186b5ef6905f84e08cfd38`
- Review range: `9ff7e2ba..0cec59ef`
- Worktree and index must remain clean before and after.

Read the binding Phase 1 mission documents and relevant decisions before
judging the implementation. Review the complete range plus adjacent S3/S4/S5
session, identity, memory, liveness, serve, ledger, and API code.

## Security properties to attack

1. **Opaque ownership and erasure.** `identity.user.owner_ref` must be an
   independently random UUIDv4 and the sole mutable mapping from a user to
   immutable ownership history. It must be distinct from both raw `user_id`
   and `audit_token`; `audit_token` must also differ from `user_id`. Migration
   0037 must fail closed on historical collisions or raw `user:<uuid>`
   carriers, and permanent constraints must prevent future raw identity
   strings in `core.run.asker_id`, `memory.question_key.asker_scope`, and
   `memory.pull_record.asker_scope`. Ownership events must contain no identity
   FK and erasure must sever the mapping while retaining valid opaque audit and
   ownership history.

2. **Append-only latest-wins ownership.** `core.run_ownership_event` must be
   immutable, non-truncatable by runtime, globally ordered, and authorize only
   the latest event. Legacy fallback is lawful only when no ownership event
   exists. Server-session creation must lock and revalidate the active mapping
   and atomically create the run plus first ownership event; legacy callers
   must never create eventless `owner:`/`user:` scopes.

3. **Privilege boundaries.** Runtime must use only the hardened ownership
   append function, not direct event insertion. Recheck SECURITY DEFINER
   search paths, PUBLIC revocations, runtime/replay schema/table/function
   grants, direct INSERT/TRUNCATE/UPDATE/DELETE denial, active-owner validation,
   and rollback behavior under the actual database roles.

4. **Deadlock-free serialization.** Inspect the exact PostgreSQL lock graph.
   Claims use `FOR NO KEY UPDATE` so they conflict with governed mutation
   `FOR UPDATE` and deletion, but remain compatible with child-FK `FOR KEY
   SHARE`. Privileged direct inserts must fail fast rather than reintroduce an
   allocator/run cycle. Multi-run memory and liveness paths must discover and
   lock the complete sorted run set before the first ledger allocation, then
   revalidate ownership. Attack mutation/claim in both directions,
   allocator-first child-FK/claim, two-run memory, multi-run liveness, and the
   future S10 run-to-identity deletion order.

5. **Exact deny-by-default route inventory.** The canonical inventory must
   equal all 28 explicit Fastify routes with no implicit HEAD carriers or
   undeclared route. Public identity flows, self/session routes, transitional
   operator routes, ask creation, and all ten owned resource routes must have
   the exact ruled auth/resource/action policy. Startup must fail closed on an
   undeclared route. Operator access is only the exact explicitly configured
   legacy credential, default off; ordinary server sessions stay ASKER.

6. **IDOR and non-enumeration.** For every owned route, owner access succeeds
   while foreign, absent, malformed, mixed nested IDs, missing link/gap/node,
   and version variants have the same 404 envelope and no side effects. Ensure
   ownership is enforced in SQL against the latest event, not only in mocks or
   API prechecks. GET answer index/count, answer, inspection, node, ledger
   digest, investigation, memory unlink, run, run-answer, and SSE must all be
   non-vacuously covered. SSE must authorize before headers and revalidate
   after lifecycle projection before yielding.

7. **Server-derived authority.** Cookie sessions propagate only opaque
   `owner_ref`; raw user IDs remain authentication-internal. Ask callers cannot
   overpost `caller_scope`, `decision_owner`, or `action_owner`. Machine
   `decision_scope` and `as_of` must not be user controls; the duplicate web
   `/new` surface derives `as_of` in a server-only force-dynamic component.
   Acceptance CLI/docs must not advertise retired ownership flags.

8. **Adjacent behavior.** Preserve S5 strict Origin+session-bound CSRF for
   cookie mutations, step-up/session semantics, S3/S4 identity and audit
   privacy, memory matching, liveness, catch-up serve paths, immutable replay,
   and ordinary UI flows. Operator-only UI surfaces must not poll privileged
   endpoints for ordinary users. The battery split classifier must remain
   genuinely unattached; unrelated generic `.decide()` calls must not create a
   reachability false positive.

## Evidence to verify, not trust

- Independent Sol xHigh audit: APPROVE FOR GROK REVIEW, no P0/P1.
- Focused disposable PostgreSQL ownership/session/memory gate: 22/22.
- Focused architecture/contract gate after final fixes: 62/62.
- Full frozen-byte `pnpm test`: exit 0, 124/124 files, 1168/1168 tests,
  1983.18 seconds; tracked pre/post diff hash
  `cc8b5ea334870131596ba43fe5d9e19eab99b34380d99a6d708ab524c6612ea5`.
- Typecheck, lint (28 architecture edges, zero source blockers), production
  build, diff-check, mutation-residue scan, and final custody were green.
- Genuine behavioral mutants killed answer predicate removal, answer-index
  count bypass, latest-order reversal, and memory post-lock ownership bypass.
  Two direct authorization-weakening mutants were refused by the platform
  safety gate and must not be represented as executed evidence.

Adversarially inspect and rerun proportionately. Return findings first, ordered
by severity, with exact file/line, exploit or failure mechanism, and the
smallest correction. If no blocking finding remains, say so explicitly.

End with exactly one marker:

`GROK S7 APPROVED`

or

`GROK S7 CHANGES REQUESTED`

