# T1 Rework9 — Codex supervisor rework 2

## State and authority

- Ticket `t_b225b2f2` remains `running`; no full registration gate has started.
- Same sole author: `/root/t1_rework9_codex_author`, Codex GPT-5.6 Sol xHigh.
- Both Grok lanes approved Rework9; same code finder session `01a02a3f-abeb-7030-a8df-4d3a0319dfde` approved rework1. This packet addresses one Router-discovered launchability defect before dynamic execution.
- Required HEAD `7918f4f8bff33909792afc01dc38d402972b4ccd`, empty staged index, all 12 governed product/test tuples exact as `T1-rework9-final-manifest.json`.
- Freeze all product/test/statistics bytes and every prior Grok/author receipt.

Allowed permanent edits only:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-launcher.mjs`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-static-supervisor-check.sh`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-contract.md` if needed
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-rework1-static-fixture.mjs` or one new `T1-rework9-rework2-static-fixture.mjs`
- new `T1-rework9-rework2-*` RED/GREEN/static/custody/self-report artifacts

## Blocking defect

`T1-rework9-gate-launcher.mjs` currently creates `runTmpdir` with `mkdtempSync(join(tmpdir(), `debateai-t1gate-${runId}-`))`, then embeds the resulting unpredictable suffix in both rendered plist bytes through `TMPDIR` and `SECRET_FILE`. Earlier in the same launch, the fresh immutable execution packet is required to supply exact `rendered_plist_sha256.controller` and `.worker`. Because the suffix does not exist until the launcher runs, an independently authored fresh packet cannot predict either rendered hash. Every honest launch therefore reaches `RENDERED_PLIST_HASH_MISMATCH` after acquiring the global lock and aborts `UNKNOWN_HELD`.

Reproduce this first with a durable raw-status-1 static fixture showing two lawful fresh suffixes render different hashes and that no packet-authored single hash can bind the launcher-selected suffix.

## Required minimal repair

- Keep a fresh lowercase UUID `run_id` as the namespace authority.
- Replace the unpredictable temp suffix with an exact deterministic private path derived solely from `tmpdir()` and `run_id`, e.g. `join(tmpdir(), `debateai-t1gate-${runId}`)`.
- Create that exact directory exclusively with mode `0700`; any pre-existence, symlink/realpath surprise, wrong ownership/mode, or inability to create must fail closed while retaining the global lock. Do not reclaim or reuse it.
- Keep secret/challenge creation `wx` and mode `0600` inside that exact private directory.
- Preserve the packet's precomputed rendered-plist SHA checks. Do not weaken/remove them or let the launcher author the expected hash after rendering.
- Extend the permanent static gate/fixture to prove a Router can precompute both plist hashes from only the frozen static artifacts, fresh UUID, exact cwd/receipt-dir labels, deterministic temp path, and runtime `process.execPath`, and the launcher's render produces those same hashes.
- Prove a second different run UUID produces different deterministic paths/hashes and a pre-existing path fails closed; do not actually bootstrap the launcher/controller/worker or invoke launchctl.
- Preserve rework1's shared PostgreSQL predicate and epoch-safe recovery byte semantics except unavoidable line/hash movement.

## Gates

Run only non-executing RED/GREEN fixture, `node --check`, `zsh -n`, plist/static checker, `git diff --check`, exact HEAD/index/12-governed custody, prior-receipt preservation, lock absence, and zero runtime receipt directories. Do not run Vitest, PostgreSQL, launchctl, or any supervisor component.

## Handoff

End exactly:

`REWORK2 READY FOR SAME GROK FINDER RE-REVIEW`

Report the RED mechanism, GREEN precomputed controller/worker hashes from the fixture, exact changed hashes, frozen governed hashes, no lock/runtime process/service, and a concise self-report.

## Stop conditions

- No product/test/statistics/policy/threshold edits or reruns.
- No Claude, Grok, Hermes-model, Fable, local model, nested agents, stage, commit, push, Kanban completion, full registration test, or repo suite.
- Stop rather than weaken immutable packet binding or broaden into a general launcher rewrite.
