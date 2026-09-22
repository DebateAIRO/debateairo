# GROK-REV-S02-10C r1 probe kit

Run from the lane that holds `package.json`. No `.worktrees/` path is hard-coded.

```sh
LANE=/abs/path/to/lane
CFG="$LANE/../../../../.hermes/reports/consent-ui/probes/GROK-REV-S02-10C-r1-probe-runner.config.ts"
# or copy this config next to the probes and point --config at the copy

cd "$LANE"
export LANE
export PROBE=/abs/path/to/GROK-REV-S02-10C-r1-design-fidelity.probe.test.tsx
pnpm exec vitest run --config /abs/path/to/GROK-REV-S02-10C-r1-probe-runner.config.ts

export PROBE=/abs/path/to/GROK-REV-S02-10C-r1-behaviour.probe.test.tsx
pnpm exec vitest run --config /abs/path/to/GROK-REV-S02-10C-r1-probe-runner.config.ts

OUTDIR=/tmp/grok-rev-s02-10c-r1 LANE="$LANE" /bin/bash GROK-REV-S02-10C-r1-run-clusters.sh
```

jsdom note: stub `scrollTop`/`clientHeight`/`scrollHeight` on `HTMLElement.prototype` **before** the first render. jsdom's zeros satisfy `>= scrollHeight - 8` at mount.
