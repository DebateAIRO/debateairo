# GUIDE_HARNESS_REVIEW14 — probe filename execution-contract review

- Ticket: `t_4bb9cddb`; run `194`
- Reviewer: `/root/baseline`; native session `01a09ef7-e096-7c31-9b35-806840028cf0` (parent thread `01a09ef2-30b5-7ee2-b12d-0599616d139a`)
- Reviewed on: `2026-09-20T15:30:03.584454Z`
- Product revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Freeze: `8414adab8108efbd9a5f9a57fbd6893177417252`
- Verdict: **PASS_EXECUTION_ARGUMENT_CORRECTION**

## Finding and bounded correction

PROBE2 failed before browser launch because its reviewed output basename did not satisfy the unchanged executable's argument guard. Lines 16–20 of `probe-zero-request-ui.mjs` accept only an absolute path directly under the mission evidence root whose basename matches `^GUIDE_UI_TRANSITION_PROBE-run-[A-Za-z0-9_-]+\.json$`. The prescribed `GUIDE_UI_TRANSITION_PROBE2-run-LIVE8.json` contains `PROBE2` before `-run-` and therefore rejects.

The failed receipt is preserved. It records one child invocation, exit status 1, `GUIDE_UI_PROBE_ARGUMENTS_INVALID`, no browser launch, zero transitions, zero guarded browser attempts and zero forwarded Support requests. Those zero counts describe a pre-browser rejection and are not UI evidence. No product or runtime defect follows.

The corrected command is:

```sh
node /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/probes/GUIDE_HARNESS_BIND14/probe-zero-request-ui.mjs 152eed4da1cd3e66b74d8301159ba76427552409 /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/evidence/GUIDE_UI_TRANSITION_PROBE-run-LIVE8-PROBE3.json > /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/support-conversation-20260914/logs/GUIDE_UI_TRANSITION_PROBE3-LIVE8.log 2>&1
```

The four program argv positions are exact: `node`, the unchanged pinned BIND14 probe script, the full 40-hex revision and the corrected absolute output destination. Direct redirection is outside the child argv and preserves numeric child status. There are no extra child arguments. The output and log paths are unique and absent, and the pinned Chromium executable is present.

## Inert extracted-guard check

The bounded inert check copied only the argument predicate from source lines 16–20. It did not import or execute the probe module and did not launch a browser. Results were 5/5:

| Case | Expected | Result |
|---|---:|---:|
| corrected output under exact evidence root | accept | accept |
| failed PROBE2 basename | reject | reject |
| corrected basename under wrong root | reject | reject |
| extra child argument | reject | reject |
| abbreviated revision | reject | reject |

Evidence: `GUIDE_HARNESS_REVIEW14-argument-check.json`, SHA-256 `5254d163dcc6078b11b42bacc152e5b24f9efe88a82f5cfc2352c598e8614d40`.

The output name is an artifact destination, not a behavior or oracle input. After validation, `outputPath` appears only in the checkpoint write. The revision is copied into the fixed result. The five-transition sequence, readiness helper, Support route classifier and success/failure predicates do not read the output basename or path. No dependency requires a harness change.

## Limited supersession and retained review

This review supersedes only the invalid future probe output/log naming and the UI_PROBE2 prerequisite carried by:

- BIND14 `package-evidence.mjs` output-absence and generated probe-contract fields;
- the BIND14 README command;
- the sealed BIND14 report/receipt language copied from that contract;
- REVIEW13's prepared-probe argv/output/log assertion;
- the failed PROBE2 packet and any subsequent packet derived from it.

Those sealed files remain immutable. Their substantive harness bindings remain evidence; this supplemental review is the execution-contract authority for PROBE3. The old `GUIDE_UI_TRANSITION_PROBE-run-LIVE8.json` read inside `package-evidence.mjs` is the historical pre-BIND14 result used only to establish the prior aggregate and is unrelated to the new output destination. The actual `GUIDE_LIVE_GUIDE14` capture namespace is unchanged.

REVIEW13's exact-argv acceptance assertion was incorrect and is withdrawn. Its full-readiness, state-preservation, route-classifier, five-session, matrix54 and 127/127 control dispositions remain valid because the executable, `controls.mjs`, capture, adapter, matrix, ordered-eight digest and product bytes are unchanged. All 57 REVIEW14 indexed inputs matched their frozen hashes and byte counts. The product checkout remains clean at the exact revision.

## Next prerequisite and limits

A separately sealed successful `GUIDE_COMPACT_UI_PROBE3` at this revision, using the corrected command and unchanged executable, is required before later live work. The failed PROBE2 does not satisfy that prerequisite.

This static pass does not prove browser behavior, the five transitions, composer usability, Support traffic blocking, model quality, capacity or testability. No browser, runtime, HTTP, DB, Support, model, status, capacity, product, KB, Git or harness activity ran. Forgot remains unresolved and actionless; CP1 is incomplete and CP2 remains gated. No readiness or acceptance is claimed.
