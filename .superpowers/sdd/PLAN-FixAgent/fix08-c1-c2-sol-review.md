# FIX-08 C1/C2 Sol review

Date: 2026-09-04

Commits: `b15bbcac`, `10bac58a`, `f9573394`

## Verdict

- SPEC: **REWORK**
- CODE QUALITY: **REWORK**

## Finding

### HIGH — a child can invent the row receipt and make a fake row PASS

`acceptance/obs/index.ts:128-164` treats one stdout line as a child receipt.
The source-event challenge is given to the child in its environment at
`acceptance/obs/index.ts:182`. The child therefore knows every value it must
print: its real pid, the challenge, and any invented positive `occ_seq`.

`passRows()` then accepts ordinary row objects supplied by the case at
`acceptance/obs/index.ts:261-290`. It compares those objects only with the
values printed by the same child. It does not read or verify any real stored
row.

Fresh proof used a child that only printed:

```text
OBS_G1_CHILD_RECEIPT { pid: <its pid>, source_event_ref: <env challenge>, occ_seq: [777] }
```

The case supplied a matching plain row object. No database row existed. The
runner returned:

```json
{"exitCode":0,"lines":["obs-g1/forged-row PASS(rows=1)"]}
```

This breaks FIX-08-R10 and the corrected C1 rule that plain output cannot
fabricate evidence. The `WeakSet` proves only that the runner created the
JavaScript wrapper. It does not prove that the row existed.

Required change: the parent runner must own the read-back proof. A case must
not be able to turn child stdout plus case-made row objects into PASS. Bind the
opaque spawn handle to rows read by a runner-owned verifier from the real
sink, then mint PASS only from that verified result. Add a regression test
using the stdout-only forgery above; it must FAIL.

## Fresh checks

- Focused FIX-08 test: 21/21 passed, three fresh runs.
- Real C2 CLI: exit 0, exactly three runtime-missing SKIPs, zero PASS.
- Real FAIL CLI with the old database import graph loaded: one FAIL line,
  exit 1.
- Standing runner and relay tests: 12/12 passed outside the sandbox. The first
  sandbox run could not bind loopback and was not treated as a code failure.
- Timeout, combined output cap, and scratch cleanup tests passed.
- Direct planted-data checks found 2 corpus hits, 7 identity-column hits, and
  3 bad schema-name hits.
- `pnpm typecheck`: only the eight pinned `s14-ui.test.ts` baseline errors;
  no FIX-08 error.
- `pnpm audit:source`: only the three known installer environment findings;
  no changed FIX-08 path.
- `git diff --check dev...HEAD`: passed.

## Scope and deferral

- Product source diff: zero.
- `acceptance/run-acceptance.ts`: one added dispatch line.
- Implementation files are only `acceptance/obs/**` and
  `tests/integration/fix08-harness.test.ts`.
- The other two changed files are the supplied controller correction docs,
  `SPEC-v2.md` and `PLAN-v2.md`.
- No zone file was read or inspected. The only zone references are a lexical
  deny rule and its test.
- C3 and C4 have no cases and print no PASS. Their deferral matches
  `SPEC-v2.md`: the FIX-01 runtime is absent, all four database URLs checked
  here are unset, and `obs.emitP99CeilingMs` is still unratified.

The C2 evaluators and dependency SKIPs are sound for this milestone. The
receipt flaw blocks C1 acceptance and any later row-bearing PASS.
