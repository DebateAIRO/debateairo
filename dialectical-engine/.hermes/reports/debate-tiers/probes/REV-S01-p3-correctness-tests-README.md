# REV(S01) p3 · correctness/tests — promoted probes

Runnable from ANY worktree. The root comes from `$WORKTREE` (shell) or `PROBE_WORKTREE` (vitest
config) or argv — never hard-coded. Point it at the directory that HOLDS `package.json`
(one level below the worktree root).

    WORKTREE=<abs path> zsh REV-S01-p3-correctness-tests-clusters-3x.sh    # 4 clusters x 3 runs
    WORKTREE=<abs path> zsh REV-S01-p3-correctness-tests-mutants.sh        # M1..M6, each restored byte-exactly

The activation probe is a RENDER fixture: the repo's own `vitest.config.ts` only collects
`tests/**/*.test.tsx`, so copy it into the worktree and delete it afterwards —

    cp probe-REV-S01-p3-activation.test.tsx <WORKTREE>/tests/render/zz-probe.test.tsx
    cd <WORKTREE> && pnpm exec vitest run tests/render/zz-probe.test.tsx ; rm tests/render/zz-probe.test.tsx

Every probe promoted from an EARLIER pass must be renamed to `probe-*.test.ts(x)` before the
promoted vitest config will collect it — its `include` glob is `probe-*`, and a probe promoted
under its seat name is silently dropped as `No test files found` (this is what defeated
FIX-S01-p2 across four attempts). Run the whole promoted set with:

    PROBE_WORKTREE=<abs path> PROBE_DIR=<dir of probe-*.test.ts> \
      pnpm exec vitest run --config REV-S01-p3-correctness-tests-vitest.probe.config.ts
