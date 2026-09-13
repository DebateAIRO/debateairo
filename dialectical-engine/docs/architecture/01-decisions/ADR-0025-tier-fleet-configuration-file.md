# ADR-0025: Tier fleet configuration file

- Status: Accepted
- Date: 2026-09-13

## Context

The Free and Premium model rosters must be editable in one committed file. The contract package is
also evaluated in browser bundles, so it cannot read that file through Node filesystem APIs. At the
same time, `PLAN_TIER_ROSTERS` remains part of the contract package's main export surface.

## Decision

The deployment fleet is declared in `config/models.yaml` and read by the Node-only
`@debateai/model-config` package. That package owns parsing and shape validation and depends only on
`yaml` and Node built-ins.

A separate model-config generator writes a gitignored TypeScript module under
`packages/contract/generated/`. The contract's browser-safe `plan-tiers.ts` imports that generated
data and never reads the YAML file. The normal contract generator runs only after the roster module
has been generated.

At runtime, server-side deployment code reads the same configuration file directly. Browser clients
receive the rosters through the deployment register rather than importing a file-backed module.
Provider references are stable functions of the tier and maker word, never of a model id.

## Consequences

- A configuration edit requires a stack restart and contract generation before source that imports
  the contract is evaluated in a fresh checkout.
- Invalid file shape is refused at the loader boundary before any deployment state is changed.
- Generated roster data is not committed; `config/models.yaml` remains the sole committed tier-list
  declaration.
- The contract package remains safe to evaluate in browser bundles because no Node filesystem import
  enters its graph.
