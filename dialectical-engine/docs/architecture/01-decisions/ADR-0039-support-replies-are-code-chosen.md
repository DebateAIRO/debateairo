# ADR-0039 — The support assistant's model reports judgements; code chooses every refusal, crisis reply and threat line

**Status: Proposed** — V ratifies this ADR. No seat writes `Accepted`.

| Field | Value |
|---|---|
| **Date** | 2026-10-19 — written by seat `ARCH-SF-S05` (node `ARCH(S05)`, ticket `t_daa0bfca`) of mission `synthesis-flag`, slice S05. |
| **Source of record** | `docs/missions/synthesis-flag/slices/S05/SPEC-v4.md` (S05-R1, R2, R4, R5, R10); `slices/S05/DECISIONS.md` lines D-S05-1 to D-S05-5 and D-S05-15; `slices/S05/PLAN.md`. |
| **Numbering** | Measured with `ls docs/architecture/01-decisions/` in the lane `.worktrees/sf-s05/dialectical-engine` @ 27e21e5e1: the highest file is `ADR-0032`; `0033` was free. Another lane may take `0033` first; renumber at merge. Renumbered at C15 (2026-10-26): S01 took `0033` and S02 `0034`, both already in this lane through the integration merge, and other in-flight missions claim `0033`-`0038` on their branches (measured over every local and remote ref), so this is `0039`. Migration 0129's header comment and S05's PLAN and DECISIONS still call it "ADR-0033"; 0129 is hash-pinned by its manifest, so its comment stays. |

## Context

The support chat answers from help-centre articles. Until S05 it had no rule for messages that are not about the product, gave a crisis message "This needs a person" without help numbers, and had no answer for a visitor who threatens someone. V's rule (2026-10-18): "The Support Agent should NOT answer anything that is not app related." V's rulings V-45..V-48, V-59..V-61 and V-74 added: a fixed off-topic refusal in 35 languages, the help numbers for a crisis, the threat line for a threat, the model's judgement in every language.

A model asked to refuse in its own words writes different words per call and per language, and a model asked to answer half a message may still write the other half. A fixed reply in 35 languages is reviewable once.

## Decision

1. **The model never writes a refusal, a crisis reply or a threat line.** It reports judgements in a sealed JSON contract — on the answer path three independent marks (`offTopic` none/part/all, `crisis`, `threat`, `support.chat-answer.v3`), on the path with no help article one label (`support.no-source-judgement.v1`) — and code maps each to a fixed template. Code owns the precedence: crisis, then threat, then off-topic.
2. **The fixed crisis recognisers run first.** The crisis phrase check (35 languages) and the support's own self-harm patterns run in the message route before every fixed refusal of the classifier; the classifier's own order and vocabulary are unchanged.
3. **A message the model never reads keeps what its path gives.** A crisis or threat that no recogniser catches before a fixed refusal, or whose judgement call fails or misses its deadline, gets that path's reply; the deadline is a register row.
4. **No reply is stored.** The outcome code is the reply kind the browser reads; it is never written.
5. **The support chat keeps nothing (V-111).** The API's support role holds no INSERT on the eleven conversation tables and the three model-call tables (migration 0129), and the limits count in the API's memory only (V-114).
6. **0129 passes 0065's guards by path (a):** disable, delete children first, `SET CONSTRAINTS support.support_shred_row_guard IMMEDIATE`, enable, `SET CONSTRAINTS … DEFERRED` — never `session_replication_role`, never `SET CONSTRAINTS ALL`.

## Consequences

- A new kind of support reply is a new template key in 35 files and, if the model must recognise it, a new mark in a new sealed contract version — never model prose.
- Every support model call goes through `buildFramedPrompt` and the injection corpus gains its hand-off row.
- A judgement can be wrong (a sad message read as a crisis, an oddly worded app question read as off-topic); the labelled run of S05-R9 shows V how often, and the remedy is the instruction or the marks, not model-written replies.

## Alternatives rejected

- The model writes its own refusals (variable words in 35 languages; half-answers).
- One model call on every message before the classifier (a paid call per message; V-60 approved one only where no article matches).
- A `kind` enum instead of marks (the model would pick one kind, so the precedence would be the model's).
