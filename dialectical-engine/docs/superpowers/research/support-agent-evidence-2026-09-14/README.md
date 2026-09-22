# Audit evidence

This directory contains research artifacts only. The probe exercises current source using a synthetic model and an in-memory redacting message port. It performs no network, database or account actions. The example password/code in its response-boundary probe is fabricated test data.

Run from `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`:

```sh
node --import tsx docs/superpowers/research/support-agent-evidence-2026-09-14/probe.mts
```

This rewrites `probe-results.json` beside the script. It records routing outcomes, model-call counts, messages passed to the model, corpus version and the synthetic response's persistence/display handling. It does not assert real-model answer quality.

Baseline verification command:

```sh
pnpm exec vitest run tests/unit/support-classify.test.ts tests/unit/support-model.test.ts tests/unit/support-kb.test.ts tests/unit/support-templates.test.ts tests/unit/support-escalation.test.ts tests/render/sup-01-help.test.tsx --reporter=dot
```

The recorded run passed 432 tests in 6 files. See `test-output.txt`. The typecheck, full integration suite and live relay were not run for this audit. `source-manifest.json` records hashes of the local files referenced by the audit and product map; git HEAD alone does not identify the pre-existing uncommitted changes.

The normal `tsx` CLI initially failed because its IPC socket was disallowed by the sandbox. Running Node with `--import tsx` avoided the unnecessary IPC server and reproduced the probe without elevated permissions.

The owner's confirmation of an existing Forgot password flow supersedes any inference that it is globally absent. Its exact URL/control was not found in the inspected source; the documents preserve that integration discrepancy and require reusing the actual existing flow.
