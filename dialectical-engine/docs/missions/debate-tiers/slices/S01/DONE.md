# DONE — S01 · The Free/Premium selector on `/new`

**PLACEHOLDER. V writes this file.** What done looks like on a UI slice is V's to define, at the mock
gate: `MOCK(S01)` builds the Claude Design canvas from the repo's real tokens and components, V
refines it, and V's words here become the oracle that `REV(S01)` measures against
(`heartbeat-requirements` §2). The REQ node does not define done for a UI slice and has written no
judgement below.

Until V fills this in, the floor is `SPEC.md` §2 Acceptance — a floor, never a ceiling.

## The screens and states the SPEC implies (for the mock to draw and V to rule on)

One screen: `/new`, in **Terracotta** and in **Chamber**.

| # | State | What is on screen |
|---|---|---|
| 1 | Free chosen, question empty | The selector above the question box, Free reading as chosen; the Free option naming `gpt-5.6-luna` and `claude-sonnet-5`, the Premium option naming `gpt-5.6-sol`, `claude-opus-5` and `grok-4.6`; Risk tier Standard, Composition budget tier Low, Tree depth 2, both steering boxes empty and all of them locked; the question box empty and typeable; `Start run` unavailable. |
| 2 | Free chosen, question typed | As state 1, with the question text present and `Start run` available. |
| 3 | Free chosen, `⚙ OPTIONS` expanded | As state 2, with the five V2 knobs visible, locked, and still carrying the notice that they are not sent. |
| 4 | Premium chosen, question typed | Every gauge usable and showing whatever the asker last left on screen; the selector reading Premium; `Start run` available. |
| 5 | Premium chosen, `⚙ OPTIONS` expanded | As state 4, with the five V2 knobs usable. |
| 6 | Mid-switch | What the moment of changing tier looks like — whether the re-pinning of the Free values is announced, silent, or animated. Undecided; V rules. |
| 7 | Submitting | `Start run` in its submitting state, in both tiers. |
| 8 | Error | The form's error block carrying a message from the API, in both tiers — the state S02's refusal will land in. |

## Questions the canvas exists to answer (V's, not REQ's)

- Which of the two readings of "the user gets to choose" is right: Free preselected (row V-9's
  default, `SPEC.md` R2), or nothing chosen until the asker chooses. The canvas shows both.
- How a locked gauge reads — dimmed, greyed, badged, or something the document has not used yet — so
  that "locked because this run is Free" is legible without a tooltip.
- Whether the model names sit on the selector itself, under it, or somewhere else on the card.
- Whether the tier is one control or two, and how much of the `/new` card it takes.

## V's definition of done

_(empty — V writes here)_
