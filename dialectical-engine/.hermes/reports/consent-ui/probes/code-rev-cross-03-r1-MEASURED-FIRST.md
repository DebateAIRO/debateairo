# CODE-REV-CROSS-03 r1 — MY OWN MEASUREMENT, written before any of the author's claims were read

Timestamp: 2026-09-07, immediately after the probe runs below. Probe:
`<scratch>/probes/reflexive-contains.test.tsx`, runner `<scratch>/probe-runner.config.ts`,
lane = `.worktrees/rev-cross-03/dialectical-engine` @ `4ef2f7d3`, three identical runs.

## The reflexive-`contains` question (packet §4, "RULE ON THIS")

`topmostSurface()` at HEAD, pass 2:
    if (!topContainer.contains(container)) continue;
`Node.contains` is REFLEXIVE (`n.contains(n) === true`). The ruling's word is "descendant",
which is strict. MEASURED consequence, three runs, identical:

| case | shape | registration order (measured) | Escape reaches | rule requires |
|---|---|---|---|---|
| P1 control | two UNRELATED containers | [a, b] | `b` (last opened) | `b` — PASS |
| P2 control | strictly NESTED pair | [outer, inner] | `inner` | `inner` — PASS |
| **P3** | **two surfaces sharing ONE container node** | **["first","second"] (asserted)** | **`first`** | **`second` — FAIL** |
| **P4** | **three surfaces sharing ONE container node** | [a, b, c] | **`a`** | **`c` — FAIL** |
| P5 | Tab under the shared-container shape | [first, second] | wraps within the shared container | unchanged — PASS |
| P6 mixed | shared-container pair + a genuine descendant | [inner, outer-1, outer-2] | `inner` | `inner` — PASS |

Verbatim, run 1 of 3 (runs 2 and 3 byte-identical on these lines):
```
P3 RESULT firstClose=1 secondClose=0
P4 RESULT closed=["a"]
P6 RESULT closed=["inner"]
      Tests  2 failed | 4 passed (6)
```

So the shipped code INVERTS open order for surfaces sharing one container node, and P4 shows the
inversion is not a single swap: the loop keeps replacing through every reflexive match, so Escape
reaches the FIRST-registered member of the group — the surface opened FIRST, i.e. the bottom one.

## The remedy, MEASURED (so it is BINDING, not advisory)

Planted `container === topContainer ||` in front of the existing test:
```
    if (container === topContainer || !topContainer.contains(container)) continue;
```
(snapshot `cp` before, restore `cp` after, `diff -q` clean, `git status --porcelain` = 0)
```
P3 RESULT firstClose=0 secondClose=1
P4 RESULT closed=["c"]
P6 RESULT closed=["inner"]
      Tests  6 passed (6)
```
All four controls unchanged; both failing cases flip. One `||` term.

## Reachability, measured by me

`grep -rn "useModalSurface" apps/ui` → exactly two product consumers:
`CookiePreferencesCard.tsx:119` (`containerRef: cardRef`) and `PrivacyPolicyModal.tsx:101`
(`containerRef: dialogRef`). Each owns its own ref, so no consumer shares a container TODAY.
