### Task T17: Build the website and look at the vote box in a browser

Design §4 (the approved look) and §8. Every other test of the look reads CSS text or runs in jsdom, which does no
layout, and no gate, local or in CI, builds the website. This task builds it once and looks at the wired rows in a
real browser against the mock API, in both modes, left-to-right and right-to-left, wide and narrow, with keyboard
focus and with reduced motion. It also watches, in the browser, the four behaviours T11 was amended for. It writes
no file in the tree and makes no commit. Its result is a short report and a folder of screenshots for the owner.

Depends on: **T10**, **T11**, **T12**, **T13** (all committed). Runs before T15. It may overlap T08, T14 and T16 only
if it has a working tree of its own: the website in development mode rewrites two tracked files while it runs.

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

**Files:**
- Create: none in the tree. Screenshots go to `${TMPDIR:-/tmp}/upvotes-look/` (outside the tree).
- Modify: none. Two tracked files the development website rewrites are put back in Step 9.
- Test: none is added. The task is a build and a look.

**Interfaces:**
- Consumes:
  - From T13, the mock and its seeded rows: `MOCK_PORT=4013 MOCK_QUIET=1 node_modules/.bin/tsx tools/v4-mock-api/server.ts`;
    `/__mock/sign-in`, `/__mock/sign-out` and `/__mock/set?session=OUT|IN` (`tools/v4-mock-api/server.ts:1866-1885`);
    the five public rows, whose boxes read `12.3k`, `1.2k` (already upvoted), `999` (one press makes `1k`), `0`, `7`;
    `/__mock/state` with its member `public_votes` (`casts`, `withdrawals`, `reads`, `voted`).
  - From T12: the home page's Public debates tab, `/?tab=public`, with one `LibraryVote` per row.
  - From T11: `div.libVoteRow > button.libVote[aria-pressed][aria-label] > svg.libVoteArrow + span.libVoteCount`, the
    row's link, and `p.libVoteNote[role=status]` while there is a line; the four amended behaviours (a session
    that ended on the server; a withdrawal answered 404; Back from a debate; both lines also spoken).
  - From T10: the values of design §4, as tokens and rules in `apps/ui/app/globals.css`.
  - From T09: "Sign in to upvote" and "Your vote could not be saved. Try again." (English).
- Produces: the report of Step 10 and the screenshots. T15 starts only after the orchestrator has this report.

**Before you start:**

Read these.
- `tools/v4-mock-api/README.md:52-80`: starting the website against the mock, the cautions after a development run,
  and signing in for the server-drawn pages (the home page decides on the server by the session cookie).
- `docs/superpowers/specs/2026-11-26-public-debate-upvotes-design.md` §4: every value below is copied from it.
- `apps/ui/package.json:8`: what `build` runs (`next build`, then the release stamp, then the front-door route check).

Traps.
- You need a browser you can drive and take screenshots with. If your session has none, do Step 1 and Step 2 (the
  build), then stop and report that the look was not done. Do not replace the look with a jsdom test.
- The development website changes `apps/ui/next-env.d.ts` and `apps/ui/tsconfig.json` and leaves
  `apps/ui/.next-v4mock`, which git does NOT ignore (`tools/v4-mock-api/README.md:70-71`). Step 9 puts all three
  right. Never commit any of them.
- The build writes `apps/ui/.next` (ignored). It may also rewrite `apps/ui/next-env.d.ts`; Step 2 puts it back.
- The build was not run while this plan was written (it writes into the tree). The release tool gives its own
  build an environment of its own (`tools/upload-check/website-build.mjs:7-9`). If the build stops on a missing
  setting of that kind and not on an error in a file of this slice, report the message as it is; do not edit any
  file to get past it.
- Ports. Check both before you start (`lsof`); if one is taken, use another free port in every command.
- Use Chrome or Firefox. Safari may refuse the mock's secure cookie on `127.0.0.1` (`README.md:80`).
- Do not run the unit or integration gates while the development website runs: it is heavy (`README.md:72`).
- A look that differs from design §4 is not fixed here. A wrong value is T10's, wrong markup or behaviour is T11's,
  a row with no box or a wrong starting state is T12's, a wrong count from the mock is T13's. Report it with its
  screenshot.

- [ ] **Step 1: Check that the four tasks are in the tree, and regenerate the contract**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -c "^\.libVoteRow > \.libRow:hover { transform: none; }" apps/ui/app/globals.css; grep -c "export function LibraryVote" apps/ui/components/LibraryVote.tsx; grep -c "<LibraryVote" apps/ui/components/DebatesBuffer.tsx; grep -c "routePublicVotes" tools/v4-mock-api/server.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git status --short -- apps packages tools
```

Expected: `1`, `1`, `1` or more, `1` or more; the generator exits 0; the last command prints nothing. A `0` means
T10, T11, T12 or T13 (in that order) has not landed: stop and report.

- [ ] **Step 2: Build the website**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui build
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git checkout -- apps/ui/next-env.d.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git status --short -- apps packages tools
```

Expected: the build exits 0 and its route table lists `/` (the home page). The last command prints nothing.
This is the first time the row's server-to-client hand-over is compiled as the upload compiles it. An error that
names `DebatesBuffer.tsx`, `LibraryVote.tsx`, `upvoteWords.ts` or `page.tsx` (a function passed to a client
component, a client export called on the server) is T12's or T11's: stop and report it with the message. For any
other stop, see Traps.

- [ ] **Step 3: Start the mock and the website against it**

Ports first (each prints nothing when the port is free):

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools lsof -nP -iTCP:4013 -sTCP:LISTEN
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools lsof -nP -iTCP:3013 -sTCP:LISTEN
```

Then, each in the background (your harness's background run, or two more terminals):

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools MOCK_PORT=4013 MOCK_QUIET=1 node_modules/.bin/tsx tools/v4-mock-api/server.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine/apps/ui && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools DIALECTICAL_API_BASE=http://127.0.0.1:4013 PORT=3013 NEXT_DIST_DIR=.next-v4mock node server.mjs --dev
```

Expected: the mock prints one line that starts `{"mock":"ready","url":"http://127.0.0.1:4013"`; the website answers
on `http://127.0.0.1:3013`.

- [ ] **Step 4: Sign in and open the tab**

Open `http://127.0.0.1:3013/api/__mock/sign-in` once (it answers `{"signed_in":true,…}` and sets the cookies), then
`http://127.0.0.1:3013/?tab=public`.

Expected: five rows, each with a box at its start edge. The boxes read, top to bottom, `12.3k`, `1.2k`, `999`, `0`,
`7`. The second is drawn upvoted. That second box proves the page's own-votes read on the server. A list with no
box at all means the list carries no count or the page was not handed `votes`: stop and report (T13 or T12).

- [ ] **Step 5: The look, in eight screenshots**

Take the tab at each of these, with the site's own controls (the language switcher and the mode toggle) and the
browser's window width. Save each as `${TMPDIR:-/tmp}/upvotes-look/<mode>-<language>-<width>.png`.

| Mode | Language | Width |
|---|---|---|
| light | English | 1000px, then 375px |
| light | Arabic | 1000px, then 375px |
| chamber | English | 1000px, then 375px |
| chamber | Arabic | 1000px, then 375px |

Check each against design §4. Measure with the browser's inspector where a number is given.

| What | Light | Chamber |
|---|---|---|
| The box | inside the row's card, at its start edge, before the claim; 54 × 58 px; 1.5 px border; 11 px radius; the card's own fill | the same |
| Border and number, not upvoted | ink | `#EEF2F8` on the card's fill `#171E2B` |
| The arrow | 24 px, filled `#4FA26B`, a thin outline `#2F7A47` | filled `#4FA26B`, outline `#86B58D` |
| The number | under the arrow, 14.5 px, weight 700 | the same |
| Upvoted (the second box) | fill `#4FA26B`, border `#2F7A47` and 3 px, arrow and number ink (`#121826`) | fill `#4FA26B`, border `#86B58D` and 3 px, arrow and number `#0E131D` |
| Arabic | the box is on the right, at the row's start edge; the digits are Latin; the arrow still points up | the same |
| 375px | the row wraps; the box stays at the start of the claim and covers no text | the same |
| Rows on the "Your debates" tab | no box; they look as before | the same |

- [ ] **Step 6: Hover, focus, reduced motion**

- Hover a box that is not upvoted: it takes the pale green tint (light `--agree-bg`; chamber `#1E2A22`) and the
  arrow lifts 2 px. Hover the row: it slides 4 px as the other rows do, and the box moves with the card (one
  slide, not two).
- Tab to a box with the keyboard: the site's 2 px focus ring is around the box, 2 px away from it. Tab again: focus
  goes to the row's link. Space and Enter on the box press it; the row's link is not followed.
- Turn on reduced motion in the browser (its rendering emulation of `prefers-reduced-motion: reduce`): hovering
  lifts no arrow and slides no row.

Save `focus.png` and `reduced-motion-hover.png` in the same folder.

- [ ] **Step 7: Presses, in English and light mode**

Read the mock's counters before and after with
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools curl -s "http://127.0.0.1:4013/__mock/state"`
(the member `public_votes`).

| Do | Expect |
|---|---|
| Press the `999` box | at once upvoted and `1k`; `casts` goes up by one |
| Press it again | back to `999`, not upvoted; `withdrawals` goes up by one |
| Press the `0` box, open that debate through the row's link, press the browser's Back | the row shows `1` and upvoted, as you left it (T11's amendment 3). Reload the page: still `1` and upvoted, now from the server |
| With a screen reader running, if you have one: press a box twice | it says the button's name with the count, and pressed or not pressed |

- [ ] **Step 8: The two lines**

| Do | Expect |
|---|---|
| Open `http://127.0.0.1:3013/api/__mock/sign-out` in a second tab, come back to the first without reloading, press a box | nothing changes in the box; one line under the row, the link "Sign in to upvote", which leads to the sign-in page; `casts` does not move (nothing was sent) |
| Open `/api/__mock/sign-in` again, reload `/?tab=public`. Then open `http://127.0.0.1:4013/__mock/set?session=OUT`, come back without reloading, press a box | the press is sent once and refused; the box goes back; the line is the link "Sign in to upvote", not the failure line (T11's amendment 1). A second press sends nothing |
| Open `http://127.0.0.1:4013/__mock/set?session=IN`, sign in again, reload. Stop the mock (`kill $(lsof -nP -tiTCP:4013 -sTCP:LISTEN)`), press a box | the box flips, then goes back; the line is "Your vote could not be saved. Try again." |

Save `signed-out-line.png` and `failure-line.png`. Start the mock again if you need another look.

- [ ] **Step 9: Stop everything and put the tree back**

```bash
kill $(lsof -nP -tiTCP:4013 -sTCP:LISTEN) $(lsof -nP -tiTCP:3013 -sTCP:LISTEN)
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git checkout -- apps/ui/next-env.d.ts apps/ui/tsconfig.json
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git status --short --untracked-files=all -- apps packages tools tests
```

Move `apps/ui/.next-v4mock` to the Trash (do not delete it with a command). Expected from the last command, after
that: nothing. T15's first step refuses a tree that still holds that folder.

- [ ] **Step 10: Verify, and report (there is nothing to commit)**

| Check | Expected |
|---|---|
| Step 2's build | exit 0 |
| `ls "${TMPDIR:-/tmp}/upvotes-look"` | the eight screenshots of Step 5, `focus.png`, `reduced-motion-hover.png`, `signed-out-line.png`, `failure-line.png` |
| `git status --short` (with the prefix) | nothing but the `??` lines under `docs/superpowers/` that were there before |
| `git log -1 --format=%H` before and after the task | the same commit: this task commits nothing |

Report to the orchestrator, for the owner: the folder's full path; one line per row of Step 5's table and per item
of Steps 6 to 8, "as designed" or what you saw instead, with the screenshot's name; the build's result; and
anything you could not do (no screen reader, no browser) said plainly. Not seen by anyone until now, so say what
you think of each: the line under the card (11 px, muted, 18 px start inset), which is not in the approved mock-up;
the arrow's shape, measured from a prototype and not from the owner's file; the box beside a claim of three or more
lines; the hover tint that can stay on a box after a touch.
