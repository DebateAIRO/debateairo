# F1 — finding: dispatch packet v1 violated spine §4 (same-day ticket, 2026-08-31)
filed by: codex-audit seat (packet-review duty, heartbeat-reviewer §1)
against: orchestrator (Fable 5) dispatch packet packets/codex-audit.md (v1)
severity: blocking (for that lane) · class: process/dispatch

CAUSE (not symptom): orchestrator wrote a mission-briefing-style packet (role prose,
process law, inlined 26-claim spec) where the spine caps launch packets at exactly four
elements — ticket-state block, upstream artifact paths, single handoff marker, stop
conditions — and requires the twelve-field typed state object on the ticket. The
orchestrator had read router+role contract but not spine §4; the seat, following
authority order (spine wins), correctly refused.

FIX: claim spec moved to declared upstream artifact board/inputs/claim-audit-spec.md;
T2 rewritten with canonical typed state; packet v2 reduced to the four elements; seat
resumed conversation-mode in the same session; rework_round set to 1 (charged to the
orchestrator, not the seat).

PRICE: one dispatch round lost; ~4 minutes wall-clock + one full codex pass spent on
refusal; repair cost ~15 minutes orchestrator time.

RESIDUAL (non-blocking, scheduled not dropped): opus-blind lane runs under a v1-shaped
packet it accepted at its own packet review. Recorded in DECISIONS.md D6-b for V; its
findings are graded on evidence, and the packet-shape defect is cured for any future
dispatch this mission. Status: closed-by-record unless V orders an opus re-dispatch.
