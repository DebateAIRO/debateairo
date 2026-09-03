# CODE-T1C3 Codex self-report

- Outcome: implemented T1-C3 set-aside, synthesis fidelity, and public lock behavior in the authorized `slice/t1` worktree; browser measurement remains with the independent review seat as contracted.
- Primary process finding: `dispatch-order.md:1634` still names the main tree at `af0db9af`, while the epoch-31 packet and route name this worktree at `82f7293d`. The latest route resolves authority, but the stale upstream row cost a second source-of-truth comparison and could make a careful seat block again.
- Recommended class fix: when a lane moves, amend the dispatch-order tree/base row in the same authority-epoch change; do not rely on a later packet to supersede a contradicted constant silently.
- Tooling cause: Vitest jsdom presented `import.meta.url` as HTTP, so `fileURLToPath` failed before the synthesis assertion. Cost: one 1.8-second broken RED run plus a patch/rerun; the trap is now appended to `.hermes/TOOLING-TRAPS.md`.
- Board-write cause: shell-passing `JSON.stringify` preserved `\\n` literally in the first claim comment. Cost: one extra board comment and readback; future multiline comments should use a single-quoted argument with explicit quote escaping.
- Near-miss: the first synthesis RED was initially a harness error, not evidence. Systematic debugging prevented it from being misreported as feature RED.
- Near-miss: the public lock could have been implemented as opacity alone. The mandated aria-disabled mutant proved the semantic lock is independently guarded.
- Dead end: `rg` is absent in this sandbox. The documented guarded `grep` fallback plus a planted `#C15F3C` proved the color oracle discriminated 0→1→0 instead of accepting an unproven zero.
- Efficiency upgrade: ship a small repository-owned oracle script rather than making each seat reconstruct matcher liveness, discrimination, and counting from prose.
- Evidence quality: six required bad mutants went RED, one neighboring prop-order mutant stayed GREEN, and every restore returned to the pre-mutant SHA-256.
- Scope discipline: no git command, commit, push, merge, branch, or worktree mutation was performed; only packet-authorized files were written.
