# Probes — REV(S03) p1, lens `security-data-safety`

Written against slice head **`cc014550`** (`slice/tiers-s03`), by seat `REV-S03-p1-security-data-safety`, 2026-09-13.
Every key value inside them is this seat's own fake (`FAKEKEY-rev-s03-p1-security-DO-NOT-USE`, `sk-FAKE-rev-s03-p1-security-DO-NOT-USE`). They read no `.local/**`, open no socket, start no process and call no provider.

## How to run them from any worktree

They import the code under test by relative path from `tests/unit/`, so copy them in and run from the worktree root — no path inside them is absolute:

```sh
WORKTREE=<abs path to a worktree at or after cc014550>/dialectical-engine
cp REV-S03-p1-security-data-safety-*.test.ts "$WORKTREE/tests/unit/"
cd "$WORKTREE" && LANG=en_US.UTF-8 npx vitest run tests/unit/REV-S03-p1-security-data-safety-admission-discovery-register.test.ts
# … and the other two. Delete the copies afterwards; they are fixtures, not suites.
```

They assert almost nothing and PRINT everything: each result is a `console.log` marker line, which is the evidence. Markers: `ADMISSION_TABLE`, `UNCREDENTIALED_CALLS`, `STALE_ADMISSION`, `FLOOD_BYTES_DELIVERED`, `PROBE_REQUEST`, `REGISTER_ROWS`, `PANEL_TARGETS_JSON_CARRIES_KEY`, `ADDITIVE`, `REMOVAL_NO_MAP`, `REMOVAL_WITH_MAP`, `REMOVAL_WRONG_MAP`, `REMOVAL_REWIND`, `R25_MOVED_KEYS`, `SLOT_ORDER_NO_CLI`, `SLOT_ORDER_MIXED`, `CUSTODY_MATRIX`, `VALUE_CARRIAGE`, `MALFORMED_LINE`, `RESTART_REFUSAL`.

| file | what it measures |
|---|---|
| `…-admission-discovery-register.test.ts` | base-URL admission at both gates; uncredentialed discovery (and the stale-record admission); the probe response bound; the probe request verbatim; that the register rows carry no bearer |
| `…-removal-slotorder.test.ts` | `api.env` across an ADD / a REMOVAL with no held map / with the correct map / with a forged map / with a version rewind; which `api.env` keys move; slot order with and without a `cli:` entry |
| `…-custody-restart.test.ts` | the 14-cell key-custody matrix (modes, symlinks, hard link, symlinked parent); how a value is carried; that no key value reaches an error; that a refused restart check enters no later stage and leaves `api.env`'s digest identical |

The `evidence-*.log` files beside them are the captured runs, not probes.

## The MUTANT (charge b) — a procedure, not a file

Written against **`cc014550`**. It mutates the tracked file `config/models.yaml` and **restores from a byte copy captured first**, never from a literal and never with `git checkout`:

```sh
W=<worktree>/dialectical-engine; S=<scratch dir>
cd "$W"
cp -p config/models.yaml "$S/models.yaml.BYTECOPY"          # capture FIRST
shasum -a 256 config/models.yaml                             # at cc014550: 97af8017bf45e3d2b1da2b8907318475b044d3ba765a6ef12e8e10a9ad8654ea

# mutant 1 — a credential in a comment (the file still loads)
printf '\n# operator note: xai-FAKEREVS03P1SECURITYdoNOTuse0123456789abcdef\n' >> config/models.yaml
LANG=en_US.UTF-8 npx vitest run tests/architecture/model-config-no-secret.test.ts tests/unit/model-config-file.test.ts tests/unit/model-config-tiers.test.ts   # measured: 3 files, 8/8 GREEN

cp -p "$S/models.yaml.BYTECOPY" config/models.yaml           # restore between mutants
# mutant 2 — a credential in base_url userinfo
sed -i '' 's|base_url: https://api.z.ai/api/coding/paas/v4|base_url: https://svc:glmFAKEtokenREVS03p1security0123456789@api.z.ai/api/coding/paas/v4|' config/models.yaml
LANG=en_US.UTF-8 npx vitest run tests/architecture/model-config-no-secret.test.ts                                                                            # measured: 1/1 GREEN

cp -p "$S/models.yaml.BYTECOPY" config/models.yaml           # restore FROM THE CAPTURE
shasum -a 256 config/models.yaml; git status --porcelain     # must match the hash above; porcelain clean
```

Both mutants passed the custody gate at `cc014550` — finding N1 in `docs/missions/debate-tiers/reviews/REV-S03-p1-security-data-safety.md`. If a later head changes the gate, re-derive the expected result rather than trusting this line.
