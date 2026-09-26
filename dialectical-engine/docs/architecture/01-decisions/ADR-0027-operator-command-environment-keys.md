# ADR-0027 — An operator command names its own environment keys, and the register loader stays their only reader

- **Status:** Proposed (mission `provider-env-selection`, slice S01, ARCH(S01) pass 1, 2026-09-25) — accepted
  when REV(S01) passes and V does not veto the slice; lands on `dev` with the slice (PLAN step S01-04).
- **Deciders:** `ARCH(S01)` seat ARCH-PES-S01, ticket `t_96e1881a`. No V row: this is HOW, not WHAT.
- **Number:** 0027, not 0025 — `ls` of this directory in the main tree ends at 0024, but ADR-0025
  (`tier-fleet-configuration-file`, commit `62a4c367`) and ADR-0026 (`system-publication-without-grant`,
  commit `5ef138b7`) already exist on other missions' refs (`git log --all -- 'dialectical-engine/docs/architecture/01-decisions/ADR-002[5-9]*'`).
- **Relates to:** the source-purity law enforced by `tools/orphan-audit/src/index.ts:671-673` and asserted by
  `tests/architecture/scaffold.test.ts` ("enforces purity, one provider gateway, …"); SPEC-v3 R1.2 and R1.13 of
  `docs/missions/provider-env-selection/slices/S01/SPEC-v3.md`.

## Context

The repository reads the process environment in ONE file. `auditSourceRules` blocks every file under `packages/`,
`apps/` and `tools/` whose text contains `process.env`, except `packages/register/src/runtime-environment.ts`
(`tools/orphan-audit/src/index.ts:671-673`), and `tests/architecture/scaffold.test.ts` pins the blocking list to the
three known `obs-capture` entries. Every loader in that file names its keys in a zod shape
(`loadDevelopmentCommandEnvironment`, `runtime-environment.ts:213-238`; `loadObservationAgentEnvironment`, `:625-640`).

Slice S01 adds an operator command, run by hand, that reads four keys. One of them, `PROVIDER_HOSTED_ROSTER_PATH`,
must never be read by a booting service, and SPEC-v3 R1.13 measures that by a grep that must find the name in no
file under `apps/` or `packages/` except the command itself — explicitly never in `runtime-environment.ts`. The house
pattern (a loader naming the key in `runtime-environment.ts`) is therefore barred, and so is the command reading
`process.env` itself.

## Decision

`packages/register/src/runtime-environment.ts` exports `readOperatorCommandEnvironment(keys)`, re-exported from
`@debateai/register`. It returns a frozen object holding exactly the listed keys that are set (an unset key is
absent; a set key keeps its string value, empty included) and nothing else. The COMMAND names its keys and judges
their values with the shipped parsers (`resolveDeploymentMode`, `parseRegisterVersionText`, its own absolute-path
rule). Booting services keep their zod-shaped loaders and never call this function.

Rule for later use: a key that a booting service reads is read through that service's loader, never through
`readOperatorCommandEnvironment`; the function is for keys only an operator command reads.

## Consequences

- The process environment is still read in one file, and the source-rule audit is unchanged.
- A key only an operator command reads stays out of the services' loader file, so R1.13's grep holds by construction.
- The validation of such a key lives in the command, not in a zod shape beside the other loaders — the reviewer
  of the command owns it.
- `@debateai/register` gains one public function. Its misuse (reading a service key through it) is a review
  finding under the rule above; no test enforces the rule.

## Rejected alternatives

| alternative | why rejected |
|---|---|
| A loader in `runtime-environment.ts` that names `PROVIDER_HOSTED_ROSTER_PATH` (the house pattern) | SPEC-v3 R1.13 bars the name from that file. |
| The command imports `env` from `node:process` | Its text does not contain `process.env`, so the audit's text match passes — while it reads the process environment outside the loader, which is the law the audit enforces. |
| Exempt the command in `tools/orphan-audit/src/index.ts` | Weakens a gate every app is held to, for one file. |
| The roster path as a command-line argument | SPEC-v3 R1.2 names the environment key as the roster's one source. |
| Export the private `parseEnvironment(shape)` and give the command a zod shape | Adds a `zod` edge to the command and a second generic export; the command's checks are the shipped parsers, which a zod shape would only restate. |
