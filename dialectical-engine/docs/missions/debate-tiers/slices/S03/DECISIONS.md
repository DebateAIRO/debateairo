# DECISIONS — slice S03 (append-only; one line per decision: date · question · choice · reason · who ruled)

A question answered here is re-asked to nobody. Checked before anything goes to V.

## Ruled at REQ (2026-09-13, seat REQ-S03) — the alternatives are recorded because a fleet seat has no human to say yes to (`heartbeat-requirements` §Superpowers)

- 2026-09-13 · **`ui:` yes or no?** · **`ui: no`** · `/new` already draws a model chip per roster
  member (`apps/ui/app/new/page.tsx:199-210`); S03 changes what those chips SAY, not what exists on
  the page. `heartbeat-requirements` §2: "a slice whose only browser step is watching existing
  components render stays `ui: no`". Rejected: `ui: yes`, which would open a MOCK gate and hand V a
  DONE.md to write for a slice that adds no surface — a mock of an unchanged page, priced at one
  seat and one V round-trip for nothing. C15 (`00-intake-S03.md:74`) says the page changes in data
  only, and the intake left the flag to REQ (`:58`) · REQ-S03.
- 2026-09-13 · **File format and path** · **YAML at `config/models.yaml`** · it is the preview V
  chose, verbatim down to the path in its first comment line (`00-intake-S03.md:23-49`), and its
  instructional comments ("Put Grok in Free too…") are the thing that makes it editable by hand.
  Rejected: JSON — no new dependency, but it cannot carry a comment, which deletes the half of V's
  preview that teaches the edit. Rejected: TOML — not what V saw. Note for ARCH: `yaml@2.9.0` sits
  in the workspace store but is no package's dependency, and no `config/` directory exists (F11) ·
  REQ-S03.
- 2026-09-13 · **How a Free entry declares its transport** · **`api: <maker>` with explicit
  `base_url:` and `key:` lines** (SPEC R4) · every value V may need to change is visible in the file,
  including the Z.ai endpoint that row V-35 says may move. Rejected: `api: zai` alone with the base
  URL and key-variable defaulted in code — two lines per entry instead of four, but it puts a value
  V is expected to change back into a TS file, which is the thing this slice exists to stop; the
  first V-35 edit would be a code change. Rejected: `transport: api` + `maker: zai` as separate keys —
  one more line than `api:` and no gain. **This departs from V's two-line preview, so it also goes to
  V as the row below** · REQ-S03, default binding until V rules.
- 2026-09-13 · **Where the key lives** · **`.local/dev-auth/provider-keys.env`, mode 600, the file
  naming only the VARIABLE** (SPEC R5, R12) · ruling R-S03-1, named at intake so V can act before
  ARCH; the custody shape is the one `readGlmCredential` already asserts
  (`acceptance/hermes-relay.ts:33-40`). Rejected: reading the Z.ai key from the Hermes store as the
  support relay does — it works today and needs no V action, but it couples the debate fleet to a
  third-party tool's credential file and gives the two Free entries two different custody paths.
  ARCH may still choose it for Z.ai by a line here; the SPEC's R10 is written so either satisfies it,
  as long as the file names a variable and never a key · REQ-S03.
- 2026-09-13 · **One slice or two (file first, keys second)?** · **one slice** · ruling R-S03-2: the
  transport is declared IN the file, so a file of `cli:` entries only would not carry V's goal.
  Rejected: S03a (the file) → S03b (the key transport) — a smaller review package each, but the first
  would ship a file shape that the second immediately re-freezes, and V's goal is one sentence ·
  orchestrator at intake, recorded here.
- 2026-09-13 · **Does the SPEC pin how `/new` gets the lists at runtime?** · **no — it pins the
  observable only** (SPEC R16) · C15 names two candidates (an API route, or a generated module the
  restart rewrites) and the choice is ARCH's. REQ states what V runs: edit, restart, reload, read the
  new id, with nothing under `apps/ui/` rebuilt · REQ-S03.
- 2026-09-13 · **Does the SPEC pin how the probe passes on GLM 5.3 Flash?** · **no — the observable
  is a HEALTHY record whose `modelId` is `glm-5.3-flash` exactly** (SPEC R13) · the two candidates
  the intake measured are Z.ai's `thinking: {type: "disabled"}` (UNVERIFIED on this key) and a larger
  probe budget for that target; both are mechanisms, and F6 is a measurement, not a design ·
  REQ-S03.
- 2026-09-13 · **The identity dot for `glm-5.3-flash`** · **accept the `default` family** (SPEC R17) ·
  `modelKey` (`apps/ui/lib/models.ts:26-35`) has no `glm` branch, so the chip shows the raw id with
  `var(--m-default)` — legible, distinct from the GPT chip beside it, and nothing renders blank.
  Rejected: adding a `glm` family now — one map entry plus a `--m-glm` token, and a new colour
  literal in `globals.css` lands on the token-contract suite (`tests/unit/t9-mode-tokens.test.ts`,
  already 2 failed | 7 passed at base), which buys a colour at the price of a RED suite inside a
  wiring slice. Reversible in one line later; NOT sent to V, because both outcomes satisfy R17 and
  V's queue is not the place for a grey dot · REQ-S03.
- 2026-09-13 · **`claude-sonnet-5` after Free loses it** · **it survives in no production file** (SPEC
  R8) · the id is quoted-exact in exactly one file today
  (`tests/architecture/tier01-roster.test.ts:43-52` proves it), so removing the Free entry removes the
  id from the product entirely; only the suites that pin it change. Rejected: keeping it declared as
  an unused constant "in case V switches back" — a second declaration is precisely what R8 forbids,
  and switching back is an edit of one line in the file · REQ-S03.
- 2026-09-13 · **Acceptance in both display modes?** · **once, in whichever mode V is in** · S03 adds
  no element and no token; the chips it changes were exercised in both modes by S01's acceptance.
  Rejected: the S02 pattern of running everything twice to prove the mode changes nothing — S02 said
  so explicitly (`slices/S02/SPEC-v2.md:182-183`) and it held; repeating it here prices V's time for
  a result already recorded · REQ-S03.
- 2026-09-13 · **Which tree's line numbers the SPEC cites** · **the S03 LANE at `7188b167`** · BUILD
  works in the lane. The main tree carries another mission's uncommitted `+13` lines in
  `apps/api/src/index.ts`, which is why the intake's F1 citations into that file (`:1227`, `:1229`,
  `:1236`) are 13 lines ahead of the lane (`:1214`, `:1216`, `:1223`). Every other file the intake
  cites is byte-identical between the trees (`git diff --stat 7188b167..HEAD` over them is empty) ·
  REQ-S03.

## Rows for V (numbered by the orchestrator at transcription — never by a seat)

V-ROW: NEW · S03 · slice ticket `t_f14b0ca0` · **A Free entry is four lines, not the two V's preview
showed.** V chose a file shape where an entry is `cli: codex` + `model: gpt-5.6-luna` — two lines. A
Free entry now names an HTTPS API instead of a CLI, and two more facts have to live somewhere: which
URL the maker is called at, and which variable in `.local/dev-auth/provider-keys.env` holds the key.
This SPEC puts both in the file:

```yaml
free:
  - api: zai
    model: glm-5.3-flash
    base_url: https://api.z.ai/api/paas/v4
    key: ZAI_API_KEY
```

Premium's entries stay exactly two lines, as previewed.
Recommended default: keep the four lines. Row V-35 already says the Z.ai base URL may have to change
(the pay-as-you-go endpoint answered 429; the coding endpoint answers 200) — with the URL in the
file, that is an edit and a restart, which is the whole point of the slice; with it defaulted in
code, it is a code change on V's first switch.
Smallest yes/no for V: "Is it fine that a Free entry carries two extra lines — the API's URL and the
name of the key variable — so both can be changed in this file?"
VERDICT keep the four lines / CONFIDENCE high / STRONGEST COUNTER: V asked for "a simple config file
where things happen easily", and doubling an entry's height is the first step of every config file
that ended up unreadable; the two-line form with `openai` and `zai` defaults in code is genuinely
simpler to read, and V may never edit a base URL again after V-35 is settled.

---
**Fold by the orchestrator, 2026-09-13 15:35 (REQ-S03 finding 3, N — no SPEC edit):** SPEC R27's row `tests/integration/dev-api-environment.test.ts | 9/10 — RED at base in the LANE` is stale. The cause was the orchestrator's own commit `6a05a0d0` sweeping another session's uncommitted hunk into that file (finding `t_ec1eda80`); fixed by `4df0b2b5`, cherry-picked to the lane as **`9a000c37`**, where the file is **10/10**. BUILD seats read the lane baseline at 9a000c37 (`setup-tiers-s03.log` rows + this line); the SPEC's RED row is superseded here, not by a SPEC-v2. Findings 4–5 (packet ambiguities: "append only" vs the slice-table row; both-modes rule on a `ui: no` slice) are template notes for the orchestrator; finding 6 (`apps/runner/src/main.ts:65-71` first-slot pin) is ARCH's, carried by SPEC R14.
