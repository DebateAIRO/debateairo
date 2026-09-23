# SPEC-v3.md §2 Acceptance (:383-458) — verbatim; steps 3, 4 and 10b wait on V's keys (V-34)

## 2. Acceptance — V runs these, in a browser, on the real dev stack

**Preconditions.** P3: V is signed in on the `:3000` stack, serving the merge candidate.
**P1 (row V-34):** an OpenAI API key exists in `.local/dev-auth/provider-keys.env` as
`OPENAI_API_KEY=…`, mode 600. None exists on this Mac today. Whether OpenAI sells the model under the
id `gpt-5.6-luna` is **UNVERIFIED** until a key exists.
**P2 (row V-35, ANSWERED):** V's Z.ai subscription token is in that same file as `ZAI_API_KEY=…`. The
token already on this Mac answers `200` on `https://api.z.ai/api/coding/paas/v4` (F13), so P2 is a file
V writes, not a purchase.

**Which steps run before P1 and P2** — derived from R32 (with no key file the stack starts, Premium is
healthy, both Free slots are configured but absent from the healthy panel):

| Step | Needs a key? | Why |
|---|---|---|
| 1 read the file | no | a file read |
| 2 `/new` lists both tiers | **no** | the lists are the file's (R16, R23.5), not the healthy panel's; the stack is up (R32) |
| 3 a Free debate runs on both models | **yes (P1+P2)** | both Free slots are out of the healthy panel without keys |
| 4 read `discovered_panel` back for that run | **yes (P1+P2)** | there is no run without step 3 |
| 5 a Premium debate runs on three CLI models | no | Premium needs no key |
| 6 edit one line, restart, `/new` shows it | no | the restart completes (R32) |
| 7 a broken edit is refused, nothing rewritten | no | a shape refusal (R20/R21) |
| 8 a missing Free model is named in the refusal | **no — this is the merge-day state** | both Free models are out of the healthy panel, so R15 fires without preparation |
| 9 remove the grok entry, restart, the version moves | no | a Premium-only entry-set change (R24) |
| 10a add grok under `free:`, restart, Free lists three | no | a list change |
| 10b that Free debate runs on all three | **yes (P1+P2)** | two of the three are keyed |
| 11 the support bot still answers | no | a different seam (R26) |

So **steps 3, 4 and 10b are the only ones that wait on V's keys.** They stay in the acceptance,
flagged, never dropped.

1. Open `config/models.yaml`. It reads as R7 prints it: two tiers, five entries, two of them `api:`
   entries naming a base URL and a variable name, no key anywhere in the file.
2. Open `/new`. The **Free** card lists exactly `gpt-5.6-luna` and `glm-5.3-flash`; the **Premium** card
   lists exactly `gpt-5.6-sol`, `claude-opus-5` and `grok-4.6-build`. `claude-sonnet-5` appears nowhere
   on the page. Each of the five ids shows a dot and a name, none blank (R17).
3. *(P1, P2)* Choose **Free**, type a question, press `Start run`. The debate page opens; exactly two
   distinct models argue and they are `gpt-5.6-luna` and `glm-5.3-flash`.
4. *(P1, P2)* For that run, read `discovered_panel` back with the command the implementing seat records
   verbatim in its READY handoff and its self-report (relayed by the orchestrator into
   `slices/S03/PROGRESS.md` and the review package — any of the three is enough; if the command is in
   none of them, this step is UNVERIFIED, not passed). It names those two models and no others.
5. Choose **Premium**, start a run: exactly three distinct models argue — `gpt-5.6-sol`,
   `claude-opus-5`, `grok-4.6-build` — over the three local CLI relays, and neither Free id appears.
6. **The edit V asked for.** Change one line — for example the Z.ai entry's `model:` from
   `glm-5.3-flash` to `glm-5.3` (row V-37's alternative), or a Premium `model:` to another id that CLI
   answers as — run `pnpm dev:auth:up`, wait for it to finish, reload `/new`. The card shows the edited
   entry. Nothing under `apps/ui/` was rebuilt or edited (R16).
7. **The broken edit.** Note the register version and take a `sha256` of `.local/dev-auth/api.env`
   (never its contents). Introduce one **shape** fault — an unknown transport word (`api: acme`), a
   fourth key on an entry, a second Anthropic entry in Premium, or a `key:` value that is an actual
   key-looking string — and run `pnpm dev:auth:up`. It **refuses**: non-zero exit, a message naming the
   tier, the entry's model id and the failure class, and no key value printed. `api.env`'s `sha256` is
   unchanged, the register's latest version is unchanged, and the stack is still serving — reload
   `/new` and the previous lists are still there (R20, R21, R22). Undo the fault.
8. **The missing model is named, never substituted — runnable on merge day, before any key exists.**
   With no `OPENAI_API_KEY` and no `ZAI_API_KEY`, `pnpm dev:auth:up` **completes** and prints one
   warning per Free entry naming the tier, the model id and "missing key" (R31a, R32). `/new` still
   lists both Free models (R16, R23.5). Start a Free debate: the page does **not** navigate; the error
   names `free`, `gpt-5.6-luna` and `glm-5.3-flash`. In devtools the `POST /v1/asks` body's `error`
   reads exactly `ASK_PLAN_TIER_MODEL_UNAVAILABLE`. Reload `/`: no new debate was created (R15).
   *Once the keys exist*, reproduce the same state without touching a key: point one Free entry's
   `base_url:` at a host that answers nothing and restart — the command still completes, warns "does
   not answer" (R31b), and that tier refuses with that one model named.
9. **Subtraction.** Remove the `grok` entry from `premium:` (Premium keeps two makers, R6), run
   `pnpm dev:auth:up`. It succeeds, `/new`'s Premium card now lists two models, and the register's
   version number has moved forward (R24). Put the entry back and restart.
10. **Addition.** Add `grok-4.6-build` under `free:` as the file's own comment block shows, restart,
    reload `/new`: Free lists three models **(10a)**. *(P1, P2)* A Free debate then runs on all three
    **(10b)**.
11. **The support bot is untouched.** Through the whole of the above, the support widget still answers
    (its GLM path is a different provider ref on port 8794, R26).

Nothing here is run twice for display mode: S03 adds no element and no token to any page, and the tier
cards it changes are the ones S01's acceptance already exercised in both modes.

