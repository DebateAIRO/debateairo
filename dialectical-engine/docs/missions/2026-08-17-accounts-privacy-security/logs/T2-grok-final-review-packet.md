# T2 final review — Grok 4.6 independent lens

You are the sole independent Grok 4.6 reviewer for Accounts Phase 1 ticket
`t_ceeb128c` (T2 real client IP). You did not author or route this candidate.

Review read-only. Do not edit any file, stage, commit, merge, push, mutate the
Kanban, launch subagents, or search the web. You may run read-only inspection
and the candidate's tests/builds.

## Candidate custody

- Worktree: `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/accounts-t2/dialectical-engine`
- Branch: `codex/accounts-t2`
- Base: `db54fec9cc39b2bc2c833626669f94edf664d4e1`
- Candidate: `65f52661adf3cf6cccc57e182d24dd18bb47c87f`
- Worktree must be clean before and after review.

Review the complete diff and adjacent callers/tests. The contract is:

1. Never use `trustProxy: true`; trust only the exact loopback UI hop.
2. A public caller cannot select the address used by authentication rate
   limiting or audit through `X-Forwarded-For`, `Forwarded`, duplicates,
   malformed values, or a multi-hop chain.
3. Both `apps/ui` and `web` proxies use explicit outbound header allowlists and
   establish one canonical client-IP value from their socket boundary.
4. Direct/untrusted peers fail closed to the immediate peer; IPv4/IPv6 and
   IPv4-mapped IPv6 normalization are unambiguous.
5. The ruled single-host topology is explicit. A CDN or split-host topology is
   not silently trusted.
6. Tests are non-vacuous and kill the naive trust-all/blanket-copy mutants.

Adversarially inspect the custom Next server approach, dev/start scripts,
header overwrite/removal order, Node socket address forms, Fastify trust proxy
semantics, direct API exposure, proxy error paths, and whether any unrelated
header/cookie/security behavior regressed. Verify the claimed focused, adjacent,
typecheck, lint, build, and live-probe evidence proportionately.

Return findings first, each with severity, exact file/line, exploit/failure
mechanism, and smallest correction. Then give exactly one terminal marker:

`GROK T2 APPROVED`

or

`GROK T2 CHANGES REQUESTED`

Approval means no blocking correctness, security, lifecycle, test, or scope
finding remains. Do not approve based only on green tests.
