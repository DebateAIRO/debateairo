# T1 Rework9 — Codex author rework 1

## Ticket state

- Ticket `t_b225b2f2`, risk tier high, remains `running`.
- Same author: `/root/t1_rework9_codex_author`, Codex GPT-5.6 Sol xHigh. No replacement or nested agent.
- Trigger: fresh Grok 4.6 code/lifecycle/security session `01a02a3f-abeb-7030-a8df-4d3a0319dfde` returned `GROK REWORK9 CODE REVIEW CHANGES REQUESTED` in `T1-rework9-grok-code-review-attempt2.log`.
- Independent Grok evidence session `01a02a3f-acc0-7ad1-a1fd-5eb08409f32a` returned `GROK REWORK9 EVIDENCE REVIEW APPROVED`; its statistical/test/custody conclusion remains frozen.
- HEAD must stay `7918f4f8bff33909792afc01dc38d402972b4ccd`; staged index stays empty.
- Freeze all 12 governed paths exactly as `T1-rework9-final-manifest.json`, especially integration test `58342fe2...` and product registration `10213406...`.

Allowed permanent edits only:

- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-launcher.mjs`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-controller.mjs`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-static-supervisor-check.sh`
- `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-gate-contract.md` only if needed to state the corrected recovery semantics
- new `T1-rework9-rework1-*` receipts, manifest/self-report/progress addenda under the same logs directory

All other files are read-only/forbidden.

## Immediate upstream findings

Read the complete Grok code verdict in `T1-rework9-grok-code-review-attempt2.log`; do not read or alter the reviewer packet/log beyond that completed verdict.

Required finding 1 — High, fail-open PostgreSQL exclusivity:

- Current launcher/controller matcher misses path-prefixed `.../bin/postgres -D ...` and normal `postgres: checkpointer`/child titles. Grok applied it to 9 live PostgreSQL lines and got 0 hits.
- Reproduce first on current bytes with a durable raw-status-1 static receipt that expects both representative lines to be classified heavy.
- Repair all launcher/controller preflight and postflight sites with one consistent predicate. Any postgres/pg_ctl line not exactly in the frozen baseline and not proven owned by the current run must classify `PREFLIGHT_LIVENESS_UNKNOWN`/hold; never fail open.
- Extend the permanent static checker so representative path-prefixed parent and colon child lines must classify heavy, while an unrelated process does not.

Required finding 2 — Medium, postflight recovery dead branch:

- `process-post.txt` and `launchd-post.txt` use `wx`; if epoch 1 writes them and dies before release, a KeepAlive epoch fails EEXIST before reaching the existing-terminal finalization branch.
- Make postflight snapshots recovery-safe and fail-closed: use epoch-owned append-once snapshots or idempotently verify/reuse exact existing snapshots before finalization. A later controller epoch must be able to finalize only when terminal/postflight/lock-token/inode evidence is exact; ambiguity holds the lock.
- Add a static/non-executing assertion that proves the recovery branch cannot be preempted merely by an earlier epoch's postflight snapshots.

After the fix run only non-executing gates: `node --check` on changed `.mjs`, plist/static checker as applicable, shell syntax, the checker itself, exact HEAD/index/12-path custody, and a bounded static recovery fixture. Do not run Vitest/PostgreSQL/launchctl or bootstrap/execute launcher/controller/worker/viewer. Do not rerun T9.

## Handoff marker

End with exactly:

`REWORK READY FOR GROK CODE RE-REVIEW`

Report RED→GREEN receipts, exact changed-artifact hashes, frozen 12-path hashes, no lock/service/process, and a concise self-report. The same Grok finder session must confirm its own fix before the Router can launch the exclusive full gate.

## Stop conditions

- Stop rather than widen into product/test/statistics/threshold/policy changes.
- No Claude, Grok, Hermes-model, Fable, local model, or nested agents.
- No stage/commit/push/Done/full registration file/repo suite.
- Never execute or bootstrap the supervisor; static inspection/fixtures only.
- Preserve all first-round Grok receipts and prior author evidence byte-for-byte.
