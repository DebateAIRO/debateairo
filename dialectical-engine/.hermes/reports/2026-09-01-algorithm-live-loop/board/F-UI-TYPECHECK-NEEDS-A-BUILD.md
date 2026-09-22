# [unassigned] F-UI-TYPECHECK-NEEDS-A-BUILD · the website's own typecheck cannot pass from a clean tree, and a stale cache has been reporting that it does

```yaml
state:
  ticket: F-UI-TYPECHECK-NEEDS-A-BUILD
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [apps/ui/tsconfig.json, apps/ui/next-env.d.ts, package.json], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-19 by the orchestrator, measured while closing the Node 26 upgrade's last open question
(D78; the blind review's Minor 4 and the seat's UNVERIFIED U4, which asked whether `apps/ui` typechecks
after its `@types/node` was aligned).

**Measured.** Three runs, quiet host, at `53a09658`:

```text
apps/ui tsc run1 exit=1
apps/ui tsc run2 exit=1
apps/ui tsc run3 exit=1
```

with one error, identical every run:

```text
app/layout.tsx(4,8): error TS2882: Cannot find module or type declarations for side-effect import of './globals.css'.
```

**Why it fails, and why it is NOT the upgrade.** Next 15.5.23 does not ship a `*.css` module declaration
in its published types; it GENERATES one during `next build`, into `.next/types`, which
`apps/ui/tsconfig.json`'s `include` list names and `apps/ui/next-env.d.ts` references by path. There is
no `.next` directory in this worktree — no build has ever run here — so the declaration does not exist
and a side-effect stylesheet import has nothing to resolve against. `@types/node` cannot reach this: a
Node type package has no bearing on a CSS side-effect declaration. STRENGTH: entailed (the version read
from the installed package, the absent directory, and the error's own text).

**The part worth more than the error.** The earlier measurement of this same command reported **exit 0,
twice** — because `incremental: true` reused `apps/ui/tsconfig.tsbuildinfo` (gitignored, dated
2026-09-18 10:02) and skipped the work. The error only appeared when the build-info file was redirected
elsewhere and the check ran in full. **A cached incremental typecheck can report success for a project
that does not typecheck**, and nothing in the repository's gates would have caught it, because the root
`tsconfig.json` excludes `apps/ui` and no gate has ever included it. STRENGTH: entailed (both
measurements, same command, differing only in `--tsBuildInfoFile`).

**Charge.** Two things, in this order. (1) Give `apps/ui` a typecheck that is honest from a clean tree:
either run `next build` (or `next typegen`, if this version has it) before `tsc` in a script the gate can
call, or declare the CSS modules in a checked-in `.d.ts` so the project does not depend on a build
artefact to typecheck. (2) Then put that script in the gate list, and always pass an explicit
`--tsBuildInfoFile` under a scratch path when measuring, so no future measurement can be answered by a
cache. Related: `F-J27-GATE-ACCEPTANCE-SITE` is the same shape — a check that reads one of two sites.
