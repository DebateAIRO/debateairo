# INTAKE — public-debate-access (Router measurement, 2026-08-29)

**Read this before you touch the repo.** Re-deriving what is here costs tokens the
post-mortem already charged us for.

**Every claim carries its own tag — there is no blanket guarantee** (corrected after
finding N2; the original banner claimed everything was MEASURED, which was false for the
back-compat consequence in §"the load-bearing finding"). `MEASURED` = a probe was run and
its command is quoted. `READ` = a file was read, cited file:line. `INFERRED` = reasoning
from what was read, NOT observed. Untagged prose is context, not evidence.

## V's brief (verbatim)

> We need our published debates to be fully accessible to anyone, including people who have
> not logged in or created an account. Visibility wise, the "Your Debates" section will be
> selectible, with a new section called "Public Debates" present. Clicking "Your Debates"
> takes the user to their own debates. "Public Debaets" will make the debates that were
> already published visible and accessible.
>
> What Done looks like :
> 1. Your Debates, Public Debates buttons are present, and accessible
> 2. clicking either will show the user their debates/the public debates
> 3. public debates can be accessed just the same as the user's own debates.

## V's ruling on criterion 3 (asked at intake, answered 2026-08-29)

> public debates are always opened as a user's own. Same UI options, you can see the
> verdict, the arguments, and et cetera.

**FULL PARITY.** This deliberately reverses the narrowing the security mission shipped.
The published envelope must carry the argument tree, and the public debate page must render
the same UI the owner sees.

### The one sub-question the Router did NOT put to V (working assumption — confirm, do not re-litigate)

"Same UI options" is read as **every READ affordance**, not every mutation. An anonymous
stranger cannot be granted delete, unpublish, or replay-generation (replay spends real model
calls, and delete/unpublish would let any visitor destroy V's debate). Those stay owner-only.
View toggles, the tree, node cards, scoring diagnostics, the honesty drawer and export are
read affordances and are IN scope. This sits on the V DECISIONS PACKET as a confirm row.

## Measured state of the repo

| Surface | Measured state |
|---|---|
| `GET /v1/public/debates` | `auth: "public"` (apps/api/src/index.ts:118). **MEASURED anonymous 200.** `limit`+`offset` are REQUIRED — omit them and you get 400 `MALFORMED_REQUEST`. Exact command: `curl -sk 'http://127.0.0.1:8790/v1/public/debates?limit=20&offset=0'` · via the UI proxy: `curl -sk 'https://localhost:3000/api/v1/public/debates?limit=20&offset=0'`. **The bare path on :3000 returns a Next 404 — that is the wrong surface, not a broken API.** |
| `GET /v1/public/debates/{id}` | `auth: "public"` (index.ts:119), handler index.ts:725. |
| `/` for a logged-OUT visitor | **200 verified**; already renders `Published debates` + `Sign in to start`. |
| `apps/ui/app/public/debate/[id]/page.tsx` | Exists, 33 lines, renders anonymously. Answer-only. |
| Public **list** route | **Does not exist.** Only a stacked section on `/`. |
| "Your debates" / "Published debates" | `<h2>` headings (app/page.tsx:81, :98). **Not selectable controls.** |
| Serving UI tree | `apps/ui` (confirmed via the dev server's own cwd). NOT `web/`. |
| Debates currently published | **total = 1** (verified against the live list endpoint). |

**Criteria 1 and 2 are the genuine build. The anonymous plumbing beneath them already ships.**

## The load-bearing finding: publications are FROZEN ENCRYPTED SNAPSHOTS

`apps/api/src/publications.ts` — a published debate is not a view over live data.
At publish time the answer is serialized into `PublicDebateSchema`, **encrypted** with a
per-publication corpus key, and stored as ciphertext. `readPublicDebate` (publications.ts:301)
takes a content lease, decrypts, re-parses, and revalidates against the snapshot before any
plaintext leaves the service.

Three consequences that decide the design:

1. **The tree is already in hand at publish time.** `AnswerSchema` ALREADY carries
   `nodes` and `edges` (packages/contract/src/index.ts:495-496), and `publish()` receives the
   whole `Answer`. The publish path simply never copies them into the envelope. **No new data
   source and no run-projection plumbing is needed for anonymous readers.**
2. **Back-compat is a live trap. `MEASURED` — three-trial experiment, REV-00.**
   Adding a **REQUIRED** field to `PublicDebateSchema` makes every snapshot published before
   the change fail to parse; `readPublicDebate` swallows that in `catch { return null }`
   (`apps/api/src/publications.ts:301-321`) and the handler turns `null` into a **404**
   (`apps/api/src/index.ts:724-735`). Not an error — a disappearance.

   **The mechanism is REQUIRED KEYS + `catch → null` + handler `null → 404`. It is NOT
   `.strict()`.** Measured under the SAME `.strict()`: current shape → 200 · widened
   **OPTIONAL** → 200 · widened **REQUIRED** → 404 · nested required `nodes`/`edges` → 404 ·
   unknown EXTRA key → 404. Identical across all three trials.

   Two separate footguns, do not conflate them: **required keys** break OLD snapshots
   (forward-reading), and **`.strict()`** breaks UNKNOWN keys. *Removing `.strict()` does
   NOT make a required-field widen safe* — that mistake would still 404 every existing
   publication. New fields must be optional/nullable or carry a version discriminator.
   A RED test proving an old-shape snapshot still reads is the headline test of this mission.
3. **Already-published debates will not gain arguments retroactively.** Their ciphertext does
   not contain the tree. Whether they are re-published, migrated, or left answer-only is an
   architecture decision — state it in DECISIONS.md, do not decide it silently. Blast radius
   today is exactly ONE debate.

## Anonymous-exposure surface (new, must be reviewed)

The widened envelope newly exposes node/edge text to unauthenticated readers. The security
mission's standing invariants still bind: no user-linked identifiers, no free-text in error
events, declared kinds not shapes for `id` params. `author_pseudonym` is already public.
Whether node text can carry anything user-identifying is a QA question, not an assumption.

## Environment (probed 2026-08-29)

Grok `1.0.13` at `~/.grok/bin/grok` · Codex `0.146.0` · Hermes `0.18.2` · board on **9119**,
slug `public-debate-access`. macOS: no `timeout` — use `perl -e 'alarm N; exec @ARGV'`.
zsh needs `--include='*.ts'` QUOTED. Also read `.hermes/TOOLING-TRAPS.md`.

## CORRECTIONS LOG (append-only)

INTAKE is not frozen the way a SPEC is, but it IS consumed by seats — so corrections are
made in place AND recorded here, never silently.

- **2026-08-29 · N2 · banner.** Original claimed "Every line below was MEASURED, not
  assumed." False: the back-compat consequence was INFERRED. Replaced with per-claim tags.
  Found by REV-00 (`t_a12687d5`), ticket `t_f30baf1a`.
- **2026-08-29 · N3 · anonymous-200 row.** Original said "verified live" with no port, proxy
  or params; `limit`/`offset` are required and the bare `:3000` path is the wrong surface.
  A seat lost ~8 minutes to it. Exact commands now pasted. Ticket `t_d64e8fdd`.
- **2026-08-29 · N4 · back-compat causal mechanism. LOAD-BEARING.** Original blamed
  `.strict()` + `catch → null`. The measured mechanism is REQUIRED KEYS + `catch → null` +
  handler `null → 404`; `.strict()` is a separate unknown-key footgun. The danger of the
  original wording: architecture removes `.strict()`, believes back-compat is solved, adds
  required fields, and still 404s every pre-existing publication. The PRESCRIPTION
  (optional/nullable or version discriminator) was correct all along — only the causal
  sentence was wrong. Corrected before ARCH-01 read it. Ticket `t_d260c28c`.
- **2026-08-29 · N1 · V DECISIONS PACKET.** INTAKE and the REQ-01 packet claimed a confirm
  row existed with no resolvable path, and none did. `docs/missions/public-debate-access/V-DECISIONS-PACKET.md`
  now exists (Row 1 = the read-vs-mutation confirm). Ticket `t_7b2ad2c9`.

All four were found by a blind Grok lens reviewing the Router, and all four are findings
AGAINST the Router. This is the "no reviewing your own homework" law paying for itself in
the first hour of the mission.