# BUILD-S01-C3 case file — mission `debate-tiers`

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

The C3 artifact landed as `e57624a82e697b7f4f2e60ddfb46d328fecaeec9`. The final cluster marker was
`CLUSTER_GREEN` three times. The report below separates implementation defects I nearly shipped from
packet/tooling defects that consumed work without changing the product.

## Finding 1 — the packet's baseline coordinates were stale

**Cause.** `BUILD-S01-C3.md:10` names `BASELINE.md` rows 37, 39–40 and 127–132 as the C3 baseline.
Those coordinates currently contain only one C3 row plus unrelated C2/standing-suite rows. The actual
C3 suite rows are `BASELINE.md:33-38` and `:71-76`. The quoted counts were correct, but the evidence
coordinates were not.

**Price.** Two extra read probes; less than one second of command time; token usage was not metered in
this seat, so the token price is **UNMEASURED** rather than estimated.

**Upgrade.** Packet generation should resolve each named suite to its current line and fail when a
claimed range omits it. **VERDICT:** add a suite-name-to-line packet check. **CONFIDENCE:** high.
**STRONGEST COUNTER:** line coordinates are only navigational when the executable count is also quoted,
but the reading-floor law makes wrong coordinates operationally expensive.

## Finding 2 — `modelColor(id)` was a false interface claim

**Cause.** `BUILD-S01-C3.md:25` says `modelColor(id)` maps a model id to its family colour. The named
implementation `apps/ui/components/ModelPresentation.tsx:5-18` accepts maker identities such as
`openai`, `anthropic`, and `xai`; a model id falls through to `--m-default`. Trusting the packet
literally would have rendered five default-colour dots. C3 added a local model-id-to-identity adapter
and a rendered `--dot` assertion in `tests/render/tier01-new-plan-tier.test.tsx`.

**Price.** One discrepancy probe, one helper, and one paired mutation run; roughly two minutes of
wall-clock investigation; token usage **UNMEASURED**.

**Upgrade.** Packet checks should execute quoted helper examples or at least compare the quoted input
domain with the function body. **VERDICT:** reject packets that claim an example the named function
does not implement. **CONFIDENCE:** high. **STRONGEST COUNTER:** the page can adapt the id locally, as
this seat did, but that silently changes the interface the concurrent CSS seat believes it shares.

## Finding 3 — the runner contract contradicted its own body

**Cause.** `BUILD-S01-C3.md:26` requires pasting `run_suites` and retaining full vitest output in a
scratch log. The pasted function captures output in `o` and never emits it; redirecting the function
alone therefore cannot create a full log. The scratch runner had to append `o` to the log before
printing its summary.

**Price.** One custom runner adaptation and one pre-refutation cluster run; about seven seconds of
test time plus reasoning; token usage **UNMEASURED**.

**Upgrade.** Publish the capture-to-log line in the canonical runner instead of asking every seat to
infer it. **VERDICT:** make the runner body and logging promise one executable artifact.
**CONFIDENCE:** high. **STRONGEST COUNTER:** a wrapper could reconstruct the output, but reconstruction
is exactly what the verbatim-evidence law forbids.

## Finding 4 — the jsdom source-path dead end was predictable but excluded

**Cause.** I reused the unit-suite `import.meta.url` source-loading idiom inside a jsdom render suite.
Vitest rewrote the URL to a non-file scheme, so collection failed with `ERR_INVALID_URL_SCHEME` before
any test ran. The packet required reading selected tooling-trap headings but omitted the existing
heading that names this exact behavior. The stable form was `readFileSync("apps/ui/app/new/page.tsx")`
under the packet-pinned project cwd.

**Price.** Two BROKEN invocations (`Tests no tests`), one log investigation, and one correction;
about one minute wall clock; token usage **UNMEASURED**.

**Upgrade.** When a packet orders source reads from a jsdom suite, include the `import.meta.url` trap
or provide the exact cwd-relative idiom. **VERDICT:** add the relevant trap automatically from the
test environment. **CONFIDENCE:** high. **STRONGEST COUNTER:** the worker can diagnose this quickly,
but every fresh seat pays the same avoidable collection failure.

## Finding 5 — I violated the heavy-command semaphore once

**Cause.** I used a parallel tool-call batch for the S01-21 and S01-22 focused vitest runs. The global
tool default favored latency, while the spine pins `max_concurrent_heavy` to one on this laptop. Both
runs completed, but the scheduling choice was still wrong.

**Price.** One concurrent pair, 1.5 seconds wall clock, no failed result, no observed corruption;
token usage **UNMEASURED**. All later test invocations were sequential.

**Upgrade.** Seat runners should carry a machine-readable semaphore that the execution layer enforces,
not only prose the model must remember at every call. **VERDICT:** enforce heavy-command concurrency
outside the prompt. **CONFIDENCE:** high. **STRONGEST COUNTER:** model discipline can work most of the
time, but one generic parallelization heuristic can override it in a single call.

## Finding 6 — I nearly shipped two process defects

**Cause.** First, S01-21 initially included the roster markup before the S01-25 test existed. I removed
that uncommitted markup, captured S01-25 RED, and restored it. Second, the first committed test caught
empty markup indirectly through a zero-option count but did not contain the packet's required literal
first assertion. The pre-handoff audit caught it; the unpushed commit was updated only after another
three-run cluster gate.

**Price.** One remove/restore cycle, two focused runs, three extra cluster runs (~18 seconds), and one
local commit update; token usage **UNMEASURED**.

**Upgrade.** Turn packet-exact harness clauses into a generated checklist beside the test scaffold.
**VERDICT:** generate the required first assertions and case-name skeleton before dispatch.
**CONFIDENCE:** medium. **STRONGEST COUNTER:** generated scaffolds can become change detectors, but
these clauses were already exact and mandatory, so generation removes transcription drift.

## Repeated token sinks and one-prompt-machine prescription

The repeated sink was translating prose contracts into executable ceremony: scratch logging,
20 case names, nine required RED comments, paired mutants, restore-status receipts, inherited failure
classification, and line-coordinate reconciliation. None was individually large; re-deriving the
mechanics consumed more reasoning than the product change.

**Upgrade.** Dispatch a generated seat kit containing: the prevalidated runner, an empty 20-case test
scaffold, machine-readable allowed paths, baseline pairs resolved by suite name, a comment cursor, and
a mutation evidence table that the runner fills. **VERDICT:** move deterministic ceremony from prompt
text into generated artifacts. **CONFIDENCE:** high. **STRONGEST COUNTER:** generators can encode a bad
plan faster; retain packet review and known-good/known-bad runner fixtures as the gate.

## Dead ends and near misses

- Dead end: `fileURLToPath(new URL(..., import.meta.url))` in this jsdom suite; it failed collection.
- Near miss: direct `modelColor(modelId)` would have produced `--m-default` dots.
- Near miss: the roster markup briefly preceded its RED test; it was backed out before S01-25 evidence.
- Near miss: the explicit non-empty-markup assertion was caught only after the first local commit.
- No unmeasured runtime, live database, desktop, main-tree product file, C4 file, S02 lane, push, merge,
  or remote operation was used.
