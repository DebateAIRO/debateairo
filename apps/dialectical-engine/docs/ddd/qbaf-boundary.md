# QBAF Boundary

QBAF remains pure graph math. The package under `coordinator/app/qbaf/` owns
claim graph value objects, edge validation, and gradual semantics propagation.

QBAF code must keep these boundaries:

- No DB/session imports.
- No provider, LLM, CLI, or worker calls.
- No filesystem, network, time, randomness, or environment access.
- No orchestration, evidence, scoring, or API imports.

Adapters own persistence, providers, evidence, and orchestration. They may
convert stored nodes, provider outputs, evidence results, or API payloads into
`QBAFGraph`, `ClaimNode`, and `Edge` values before calling the semantics
strategy, then persist or expose the returned graph outside the QBAF package.
