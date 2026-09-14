# FIX-01 implementer self-report

Prompt answered verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Case file

- Opened 2026-09-02 at Task BASE `4332c9421eeeecc2e0687625a0e6b57cffcd9727`; final evidence and costs will be appended before handoff.
- Packet defect already measured: the original launch omitted the heartbeat worker role floor and self-report exception. The orchestrator corrected it mid-session; no implementation edit preceded the corrected contract.
- Packet/reality defect already measured: the frozen scheduler installer's `RuntimeCaptureModule` is not exported and declares only `startCaptureRuntime`, while the brief asks a test to import an exported type containing start and stop.
- Mission-filesystem defect already measured: the worker contract requires `docs/missions/observability-agents/INSTRUCTIONS.md`, but no such file exists. The absolute task brief, frozen SPEC, scaffold PLAN, and DECISIONS were used without reconstructing requirements.
- The remaining cause, price, near-misses, dead ends, and one-prompt upgrades will be recorded from actual implementation evidence rather than predicted.
- Blocking cause found before C2 code: the actual pre-arm loss count is private in `emit.ts:94-100`, and the only arm seam (`installCaptureEmitter`, lines 102-105) discards it. Runtime-only code cannot retrieve the count.
- Dead end rejected: inventing one loss at every arm would pass a one-emission fixture while being false for zero and multiple emissions. This would be workflow-green fake data, forbidden by the mission.
- Price so far: one complete C1 TDD/refutation/three-run cycle and one prescribed commit remain valid; C2-C5 were prevented from accumulating invalid work. The blocker cost one source-flow audit rather than a later review round.
- One-prompt upgrade: pre-dispatch packet review should mechanically compare every required cross-module state transfer with the allowed/read-only file surface. Here, `R02: DEFAULT_GAPS -> runtime gaps` has no edge in the frozen API, which could have been detected before worker launch.
