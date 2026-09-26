# BUILD-PES-S02-C1 self-report

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat BUILD-PES-S02-C1; session 01a0d828-295b-7400-8471-265412f14d26. Result: commit c05d43a035ce6b98d3542f445116339342c61b4e on slice/provider-env-selection-s02. Three final CLUSTER_GREEN markers, 18 caught product mutants with green restores, five green neighbouring controls. Evidence is in probes/BUILD-PES-S02-C1. No product rework was needed. The initial baseline was captured at 13:43:32 EEST; the first final run at 13:53:31, both 2026-09-25. Token prices below are estimates; precise per-operation billing is unavailable.

## Ranked upgrades

1. **Bound reads by output budget, including the orchestration wrapper.** Cause: I batched the plan, decisions and verbose historical logs into a tool call whose aggregate output exceeded its limit. Raising only the nested command limit did not raise the wrapper limit. This caused repeated partial reads. Price: several additional calls and roughly 8–15k duplicated transcript tokens (estimate), about 1–2 minutes. Upgrade: read long documents in bounded sections; for historical logs, request their named frame and failing cases directly. VERDICT: use bounded reads / CONFIDENCE: high / STRONGEST COUNTER: too many tiny reads also cost calls; choose sections, not lines.

2. **Reduce whole-history reading for an 11-step coding packet.** Cause: full DECISIONS and V packet histories include substantial C2/C3 and other-slice discussion that cannot change this worker's deliverable. The entire reading floor took longer than editing the four production locations. Price: roughly 10k tokens of decisions/history, estimate; several minutes combined with source reading. Upgrade: dispatch a frozen current-decision extract naming superseded rows, and retain original history as dispute-only evidence. VERDICT: current-decision extract / CONFIDENCE: medium / STRONGEST COUNTER: the historical reason sometimes prevents a repeated design error, so the extract must preserve rejected alternatives relevant to C1.

3. **Add a documented capture composition for cluster runs.** Cause: run-suites already captures full suite output, while the packet also requires every run through run-capture. Nesting them uses two logs per run; the outer capture summary omits CLUSTER_GREEN because it only extracts Vitest frames. I read the outer file to obtain the marker. Price: a read per cluster run and duplicated long absolute paths, about 1k tokens (estimate); no invalid test run. Upgrade: teach the repository runner to surface the cluster marker and advertise the exact nesting once. VERDICT: marker-aware capture / CONFIDENCE: high / STRONGEST COUNTER: run-suites alone already does the needed capture; removing the double requirement is simpler.

4. **Resolve the import-edit wording against the zero-deletion gate.** PLAN S02-S02 asks for rm in the existing import at :1 and afterEach/vi at :3, then requires that git diff removes no line. Updating those single-line imports would print deletions. I used additional imports in the head block, preserving every original line; the gate reports 88 added / 0 removed for v9. Price: under one minute of interpretation; no retry. Upgrade: say either “remove no pre-existing case or assertion” or explicitly request additional import declarations. VERDICT: clarify the gate / CONFIDENCE: high / STRONGEST COUNTER: readers can infer the test-preservation intent, but a mechanical reviewer may not.

## Nearly wrong, and why it did not ship

- A default-profile launcher rejection would fail at the existing EVALUATOR_DEV_MENU_ENABLED mismatch and prove nothing about mode. The packet's support-preview positive half prevents that. The guard-removal mutant actually started hosted, so the new assertion observes the intended guard.
- Removing the row from an existing file requires a byte-exact upgrade predicate. Merely adding the two declarations would strand a pre-slice api.env. S05's real RED showed DEV_API_ENVIRONMENT_DRIFT before S06.
- An empty forbidden-path diff can lie when prefixed from the wrong Git root. Every protected pathspec was positively checked against an empty tree, then compared with 776359c3 from the lane.
- Restoring a mutant from HEAD would discard the whole implementation. I restored only from the three saved green file snapshots and verified byte equality afterward.

## Dead ends and costs

- rg is unavailable here despite the requested PATH; find located the requested skill files. One failed lookup, negligible wall time.
- Oversized batched reads, described above, were the only repeated tooling failure.
- No speculative product fix, no BROKEN suite, no dependency installation, no live database, no listener, no real credential, and no desktop UI was needed. Process tests inject the spawn/probe boundaries.

## What worked

The plan's intermediate counts were exact: 201/2, 10/2 and 5/6 at the first test RED. Subsequent captures isolated the migration and launcher guard failures before their edits. The final record accounts for all 23 integration cases: all 14 base PASS cases stay PASS, and all six base integration failures stay at their original causes. The unrelated snapshot failure is explicitly retained at 14/15. This made green-with-inherited-failures a precise count gate rather than an assertion that the repository is globally green.

The next seat needs only the commit, exact run logs, the 23-row table and the refutation matrix. Broader hosted acceptance and whole-slice review remain their assigned nodes' work.
