# DECISIONS — T3 (append-only)

Format: `YYYY-MM-DD | question | choice | reason | ruled by`

- 2026-08-31 | Spec TURN 3b against parallel page or shared workspace? | Against shipped shared workspace + `publicMode` (3705955, 362c469); 3b is layout/lock requirements on that path. | Packet §2 + §4 known tension — do not contradict shipped reality. | Requirements (Grok REQ-01)
- 2026-08-31 | May this slice drop tree/views on public? | No — R5 forbids regressing to answer-only. | Prior public-debate-access Done + publicMode. | Requirements (Grok REQ-01)
- 2026-08-31 | Verdict-first vs view toggles conflict? | OPEN QUESTION → ARCH composition; not silently dropped. | Packet §4. | Requirements (Grok REQ-01)
- 2026-08-31 | Library term `debates` vs landing `rounds`? | OPEN QUESTION → V-DECISION; proposal keep `debates` on T3. | Packet §4 vocab. | Requirements (Grok REQ-01) — proposal only
