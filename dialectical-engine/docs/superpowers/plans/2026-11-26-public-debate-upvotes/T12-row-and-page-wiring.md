### Task T12: Rows and home page wiring

Design §4 and §7.4. This task puts the vote box on the home page. The public list (`PublicDebatesBuffer`) wraps
each row that carries a count in T11's `LibraryVote`, and the home page (`page.tsx`) asks once which of those rows
the signed-in account upvoted. It writes no CSS (T10), no words (T09), no button (T11) and no contract (T03).

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: **T03**, **T09**, **T10**, **T11**. May run alongside T08, T13 and T16 (no shared file). If another
task shares your working tree, run your typecheck, `generate:contract` and commit steps while no other task is in
the middle of an edit, and read every `git status` and typecheck expectation below as "nothing else of yours".

**Files:**
- Create: none
- Modify: `apps/ui/components/DebatesBuffer.tsx:10` (two imports after it), `:40-68` (`LibraryRow`'s props),
  `:78` (the claim line), `:174-223` (`PublicDebatesBuffer`)
- Modify: `apps/ui/app/page.tsx:28` (one import after it), `:205-207` (the new read goes between the legal read
  and the chip comment), `:283` (the list element)
- Modify: `tests/render/t3-library.test.tsx:28-38` (mocks), `:309-320` (`beforeEach`, fixtures after it),
  `:397-399` (six cases before the closing)
- Modify: `tests/render/locale-leftovers.test.tsx:118-120` (one `describe` between the two that are there)
- Modify: `apps/ui/components/debateReferenceDesign.source-test.mjs:29` (one test appended)
- Test: the three test files above, and the unedited files named in Step 14

**Interfaces:**
- Consumes:
  - From T03 (`@debateai/contract`): `PublicDebateSummary["vote_count"]` is `number | undefined` (absent means an API
    from before the upvotes); `ContractClient.readOwnPublicVotes(publicationRefs: readonly string[]): Promise<{ voted: string[] }>`
    (a GET; every refusal is a thrown error); `readPublicDebates` returns `PublicDebateList`.
  - From T09 (`apps/ui/lib/upvoteWords.ts`, not a client file):
    `upvoteMessageCatalog(catalog: MessageCatalog): MessageCatalog` (the `home.upvote.*` entries, frozen). The en and
    ro `home.json` hold the owner's wording.
  - From T11 (`apps/ui/components/LibraryVote.tsx`, `"use client"`):
    `LibraryVote(props: Readonly<{ publicRef: string; initialCount: number; initialVoted: boolean; signedIn: boolean; signInHref: string; catalog: MessageCatalog; locale: string; describedBy?: string; send?: …; children: ReactNode }>)`.
    It renders `div.libVoteRow > button.libVote[data-library-vote][aria-pressed][aria-label][aria-describedby] + {children}`,
    with `span.libVoteCount` inside the button.
  - From T10 (`apps/ui/app/globals.css`): this exact line, `.libVoteRow > .libRow:hover { transform: none; }`.
  - Already in the tree: `signInHref(here: string): string` (`apps/ui/lib/returnPath.ts:44-47`);
    `createServerContractClient(fetch, sessionCookie?, userAgent?, clientIp?)` (`apps/ui/lib/serverApi.ts:65-70`).
- Produces (nothing later imports these; T15's gates run over them):
  - `PublicDebatesBuffer` gains one optional prop, with no default:
    `votes?: Readonly<{ signedIn: boolean; voted: ReadonlySet<string>; signInHref: string }>`.
  - `LibraryRow` (private to the file) gains `claimId?: string`, set as `id` on `div.libRowClaim`.
  - A row is boxed when `votes` is given AND `debate.vote_count !== undefined`. Then its markup is T11's wrapper
    around the unchanged link, and the question's id is `lib-claim-<public_ref>`. Otherwise it is today's markup,
    byte for byte.
  - `page.tsx` hands the list `votes={{ signedIn: sessionConfirmed, voted, signInHref: signInHref("/?tab=public") }}`.
  - Two amendments to the fixed interface, recorded in the plan's index so a reviewer does not flag them:
    1. `upvoteWords = upvoteMessageCatalog(catalog)` is computed once outside the `map`, and only when `votes` is
       given (forced by `tests/render/ai-disclosure.test.tsx:82-86`, which mounts the list with no catalogue).
    2. The page asks `readOwnPublicVotes` only about rows whose `vote_count` is present, and makes no call when
       there is none. (A row with no count comes from an API with no vote routes; the literal rule would send a
       request that is certain to answer 404 on every view of the tab during a side-by-side release.)
  - No browser check is in this task. The look of the wired rows is task T17 (build and look).

**Before you start:**

Read these as templates.
- `apps/ui/app/page.tsx:178-186`: the age read. A signed-in server read inside `try/catch` with a quiet fallback.
  The new read copies that frame.
- `apps/ui/components/DebatesBuffer.tsx:137-140`: a client island (`ResetSentence`) rendered as JSX from this
  server file, fed plain values. `LibraryVote` is mounted the same way.
- `tests/render/t3-library.test.tsx:28-38` and `:57-81`: the hoisted mocks and `renderRoute` the new cases use.

Traps.
- **Pick the words only when `votes` is given.** `tests/render/ai-disclosure.test.tsx:82-86` mounts the list with
  `debates` alone, so `catalog` is `undefined` there. `upvoteMessageCatalog(undefined)` throws
  `Cannot convert undefined or null to object` (measured). Pick once, outside the `map`, and only then.
- **The row's link is pinned as source text.** `apps/ui/components/debateReferenceDesign.source-test.mjs:23` wants
  `<Link className="libRow" href={href} data-library-row data-bezel="shell"` followed directly by the core and the
  body, and `:11` wants the text `models={debate.models ?? []}`. Leave `DebatesBuffer.tsx:74-76` and that prop alone.
- **Private rows must not change.** `tests/render/synthesis-flag-card.test.tsx:47` matches
  `</div><div class="libRowClaim">`. `id={claimId}` renders no attribute when `claimId` is `undefined`; never give
  `DebatesBuffer`'s rows a `claimId`.
- **No hook, no `"use client"`, no `<button>` in `DebatesBuffer.tsx`.** Tests call the buffers as plain functions
  (`tests/render/b10-waiting-state.test.tsx:41`, `tests/render/kbd-r3-k1b-title-facts.test.tsx:204`).
- **Render `LibraryVote` as JSX; never call it.** A server module may not call an export of a client file
  (`apps/ui/scripts/server-client-boundary.source-test.mjs:173-175`).
- **Do not pass `send` to `LibraryVote`.** It is a client component, and a function cannot cross to it from a
  server component. The box gets `initialVoted` as a boolean, never the set of votes.
- **Name the picked words `upvoteWords`.** `apps/ui/lib/i18n/catalogNamespaces.test.mjs:350-351` takes a variable
  called `<namespace>Catalog` to carry exactly that namespace.
- **The new read must be allowed to fail.** Five tests mock the server client without `readOwnPublicVotes`
  (`tests/unit/pda-s03-keyboard-accessibility.test.ts:27`, `tests/render/m8-daily-limit.test.tsx:56`,
  `tests/render/t9-landing.test.tsx:41`, `tests/render/home-legal-gate.test.tsx:27`,
  `tests/render/check-removal-notice.test.tsx:24`). Those files are not edited.
- **`page.tsx` may not hold the sign-in address as text.** `tests/unit/main-site-review-window.test.ts:225-230` reads
  every double-quoted `"/…"` in the file, comments included. `"/?tab=public"` is open (`:123`);
  `"/login?next=…"` is not on either list (`:187-193`). Build it with `signInHref("/?tab=public")`.
- **`page.tsx` is read as source text.** `tests/architecture/s8-publication-contract.test.ts:262` wants
  `readPublicDebates(50, 0)`; `:293-303` take the first `</div>` after `<PublicDebatesBuffer` as the list's end and
  want the indexing note once, after it. Keep one `<PublicDebatesBuffer … />` element and write no `</div>` inside it.
- **The list read stays anonymous.** `page.tsx:161` keeps `undefined` as its session. Counts are the same for
  every caller (design §2, anti-goals).
- **Not this task's files:** `apps/ui/app/globals.css`, `apps/ui/components/LibraryVote.tsx`,
  `apps/ui/lib/upvoteWords.ts`, the catalogues, `packages/contract/**`, `tests/support/shipped-corpus.manifest.txt`.
  `tests/unit/s1-1-depth-contract.test.ts` is red from T09 and T11 until T15; this task adds no shipped file.
- **Nothing type-checks the two `.tsx` tests** (`tsconfig.json:31` takes `tests/**/*.ts`; `:37` excludes
  `apps/ui`). They are checked by running them. `page.tsx` and `DebatesBuffer.tsx` are checked by `pnpm --filter dialectical-engine-v2ui typecheck`.

- [ ] **Step 1: Check that what this task consumes is in the tree**

| Command (after the prefix) | Expected |
|---|---|
| `pnpm run generate:contract` | exit 0 |
| `grep -c "readOwnPublicVotes" packages/contract/src/client.ts` | `2` or more |
| `grep -c "vote_count" packages/contract/src/index.ts` | `1` or more |
| `grep -n "^export function" apps/ui/lib/upvoteWords.ts apps/ui/components/LibraryVote.tsx` | `upvoteMessageCatalog`, `shortVoteCount`, `LibraryVote` |
| `grep -c '"home\.upvote\.' apps/ui/messages/ro/home.json` | `5` |
| `grep -c "^\.libVoteRow > \.libRow:hover { transform: none; }" apps/ui/app/globals.css` | `1` |

If one is missing, stop and report which task has not landed: rows 2 and 3 are T03, row 4 is T09 and T11, row 5
is T09, row 6 is T10. Do not create their files here.

- [ ] **Step 2: Write the failing list test (Romanian words, both conditions)**

In `tests/render/locale-leftovers.test.tsx`, between the `describe` that ends at line 118 and the one that starts
at line 120, add exactly:

```tsx
// Upvotes (design 2026-11-26, sections 4 and 7.4): the list hands each row that carries a count to the vote box, with the
// reader's own words. The box itself is tests/render/library-vote.test.tsx's; this is the hand-over.
describe("public library rows carry the vote box in the reader's language", () => {
  const SIGN_IN = "/login?next=%2F%3Ftab%3Dpublic";
  const COUNTS = [0, 1, 2, 20, 1234];
  const plain = COUNTS.map((_, index) => publicRow("SUPPORTED", index));
  const counted = plain.map((row, index) => ({ ...row, vote_count: COUNTS[index]! }));
  const noneVoted = { signedIn: true, voted: new Set<string>(), signInHref: SIGN_IN };

  async function library(debates: readonly PublicDebateSummary[], votes?: typeof noneVoted): Promise<HTMLElement> {
    const [home, chrome, time, compose] = await Promise.all([
      loadNamespace("ro", "home"), loadNamespace("ro", "chrome"), loadNamespace("ro", "time"), loadNamespace("ro", "compose")
    ]);
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <PublicDebatesBuffer debates={debates} catalog={{ ...home, ...chrome }} timeCatalog={time} locale="ro" composeCatalog={compose}
        {...(votes === undefined ? {} : { votes })} />
    );
    return container;
  }

  it("names each box with the Romanian form for its count and writes 1234 as 1,2k", async () => {
    const list = await library(counted, { ...noneVoted, voted: new Set([counted[2]!.public_ref]) });
    const buttons = [...list.querySelectorAll("button[data-library-vote]")];
    // one: 1. few: 0 and 2. other: 20 and 1234 (the "de" form). The spoken name holds the whole number.
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Votați. 0 voturi", "Votați. 1 vot", "Votați. 2 voturi", "Votați. 20 de voturi", "Votați. 1234 de voturi"
    ]);
    expect(buttons.map((button) => button.querySelector(".libVoteCount")?.textContent)).toEqual(["0", "1", "2", "20", "1,2k"]);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "true", "false", "false"]);
    expect(buttons.map((button) => button.getAttribute("aria-describedby"))).toEqual(counted.map((row) => `lib-claim-${row.public_ref}`));
    expect(list.querySelector("a button")).toBeNull();
    expect(list.querySelectorAll(".libVoteRow > a.libRow[data-library-row]")).toHaveLength(5);
    // MUT: hand the box the English catalogue, or "en" as its locale -> RED.
    expect(list.innerHTML).not.toContain("Upvote");
  });

  it("draws a box only for a row with a count, in a list that was given the votes", async () => {
    const before = (await library(plain)).innerHTML;
    expect(before).not.toMatch(/libVote|lib-claim-|<button/);
    // A count without the votes (every caller but the home page), and the votes without a count (an older API): the old row.
    expect((await library(counted)).innerHTML).toBe(before);
    expect((await library(plain, noneVoted)).innerHTML).toBe(before);
    // An empty list stays the one empty line.
    expect((await library([], noneVoted)).innerHTML).toBe((await library([])).innerHTML);
  });
});
```

- [ ] **Step 3: Run it and see the first case fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/locale-leftovers.test.tsx`
Expected: `Tests  1 failed | 6 passed (7)`. The failure is "names each box…":
`expected [] to deeply equal [ 'Votați. 0 voturi', …(4) ]`. The second new case passes already; it is the guard
that must still pass after Step 9.

- [ ] **Step 4: Extend the home page test**

All in `tests/render/t3-library.test.tsx`.

(a) Replace lines 28-38 (`routeMocks` and the `@/lib/serverApi` mock) with:

```tsx
const routeMocks = vi.hoisted(() => ({
  sessionCookie: "t".repeat(43) as string | null,
  readPublicDebates: vi.fn(async (_limit: number, _offset: number) => ({ items: [] as PublicDebateSummary[], total: 0 })),
  readOwnPublicVotes: vi.fn(async (_refs: readonly string[]) => ({ voted: [] as string[] })),
  listDebatesPageServer: vi.fn(async () => ({ summaries: [] as DebateSummary[], shown: 0, total: 0 })),
  // Each server read, with the session its client was made with ("none" for the anonymous client), in order.
  serverReads: [] as string[],
  // The props the list hands each vote box, in row order (a static render cannot press the box).
  voteProps: [] as Record<string, unknown>[]
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: (_fetch?: unknown, session?: string) => ({
    readPublicDebates: (limit: number, offset: number) => {
      routeMocks.serverReads.push(`readPublicDebates:${session ?? "none"}`);
      return routeMocks.readPublicDebates(limit, offset);
    },
    readOwnPublicVotes: (refs: readonly string[]) => {
      routeMocks.serverReads.push(`readOwnPublicVotes:${session ?? "none"}`);
      return routeMocks.readOwnPublicVotes(refs);
    }
  }),
  listDebatesPageServer: routeMocks.listDebatesPageServer
}));

// The real vote box, with the props it was handed kept for the assertions.
vi.mock("@/components/LibraryVote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/components/LibraryVote.js")>();
  return {
    LibraryVote: (props: Parameters<typeof actual.LibraryVote>[0]) => {
      routeMocks.voteProps.push(props);
      return <actual.LibraryVote {...props} />;
    }
  };
});
```

(b) In the `beforeEach` of `describe("lists")` (lines 309-320), add as its last three lines, and add the fixtures
directly after the `beforeEach`:

```tsx
    routeMocks.readOwnPublicVotes.mockReset().mockResolvedValue({ voted: [] });
    routeMocks.serverReads.length = 0;
    routeMocks.voteProps.length = 0;
  });

  // Upvotes (design 2026-11-26, sections 4 and 7.4): the same three rows as an API that has the feature sends them.
  const VOTE_COUNTS = [0, 1, 1249] as const;
  const countedDebates = publicDebates.map((debate, at) => ({ ...debate, vote_count: VOTE_COUNTS[at]! }));
  const countedRefs = countedDebates.map((debate) => debate.public_ref);
  const SIGN_IN = "/login?next=%2F%3Ftab%3Dpublic";
  const voteButtons = (rendered: Document) => [...rendered.querySelectorAll<HTMLButtonElement>("button[data-library-vote]")];
```

(c) After the last case (it ends at line 397), before the `});` that closes `describe("lists")`, add:

```tsx
  it("gives each public row that carries a count one vote box beside its link, never inside it", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    routeMocks.readOwnPublicVotes.mockResolvedValue({ voted: [countedRefs[1]!] });
    const rendered = await renderRoute("t".repeat(43), "public");
    const buttons = voteButtons(rendered);

    expect(buttons).toHaveLength(3);
    expect(rendered.querySelector("a button")).toBeNull();
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Upvote. 0 votes", "Upvote. 1 vote", "Upvote. 1249 votes"]);
    expect(buttons.map((button) => button.querySelector(".libVoteCount")?.textContent)).toEqual(["0", "1", "1.2k"]);
    buttons.forEach((button, at) => {
      const box = button.parentElement!;
      const link = box.querySelector<HTMLAnchorElement>(':scope > a.libRow[data-library-row][data-bezel="shell"]');
      const claim = link?.querySelector(".libRowClaim");
      expect(box.className).toBe("libVoteRow");
      expect(box.parentElement?.classList.contains("recentList")).toBe(true);
      expect(box.hasAttribute("data-library-row") || box.hasAttribute("data-bezel")).toBe(false);
      expect(button.hasAttribute("data-library-row") || button.hasAttribute("data-bezel")).toBe(false);
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(link?.getAttribute("href")).toBe(`/public/debate/${countedRefs[at]}`);
      expect(claim?.textContent).toBe(countedDebates[at]!.question);
      expect(claim?.id).toBe(`lib-claim-${countedRefs[at]}`);
      expect(button.getAttribute("aria-describedby")).toBe(claim?.id);
    });
    // The chip still counts rows, not boxes, and the indexing note still follows the list.
    expectLiveCount(rendered, "3 TOTAL");
    expect(rendered.querySelector(".recentList")?.nextElementSibling?.textContent?.trim()).toBe(disclosure);
  });

  it("asks once which rows the account upvoted, with its session, and still reads the list without one", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    routeMocks.readOwnPublicVotes.mockResolvedValue({ voted: [countedRefs[1]!] });
    await renderRoute("t".repeat(43), "public");

    expect(routeMocks.readPublicDebates.mock.calls).toEqual([[50, 0]]);
    expect(routeMocks.readOwnPublicVotes.mock.calls).toEqual([[countedRefs]]);
    expect(routeMocks.serverReads).toEqual(["readPublicDebates:none", `readOwnPublicVotes:${"t".repeat(43)}`]);
    expect(routeMocks.voteProps.map(({ publicRef, initialCount, initialVoted, signedIn, signInHref, locale, describedBy }) =>
      ({ publicRef, initialCount, initialVoted, signedIn, signInHref, locale, describedBy }))).toEqual(countedDebates.map((debate, at) => ({
      publicRef: debate.public_ref, initialCount: VOTE_COUNTS[at], initialVoted: at === 1, signedIn: true,
      signInHref: SIGN_IN, locale: "en", describedBy: `lib-claim-${debate.public_ref}`
    })));
    for (const props of routeMocks.voteProps) {
      // Only the vote box's own words cross to the browser, and the box keeps its own way of sending.
      expect(Object.isFrozen(props.catalog)).toBe(true);
      expect(Object.keys(props.catalog as object).sort()).toEqual(
        ["home.upvote.failed", "home.upvote.label.one", "home.upvote.label.other", "home.upvote.signedOut"]);
      expect("send" in props).toBe(false);
    }
  });

  it("draws no vote box and asks nothing on Your debates", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    const rendered = await renderRoute("t".repeat(43), "yours");

    expect(rendered.querySelectorAll("[data-library-vote], .libVoteRow")).toHaveLength(0);
    expect(rendered.querySelectorAll("[data-library-row]")).toHaveLength(4);
    expect(routeMocks.readOwnPublicVotes).not.toHaveBeenCalled();
    expect(routeMocks.voteProps).toEqual([]);
  });

  it("renders a row that carries no count exactly as before, and asks only about the rows that carry one", async () => {
    // An API from before the upvotes sends no count: no box, no wrapper, no id, and nothing asked.
    const plain = await renderRoute("t".repeat(43), "public");
    expect(plain.querySelectorAll('[data-library-vote], .libVoteRow, [id^="lib-claim-"]')).toHaveLength(0);
    expect([...plain.querySelector(".recentList")!.children].every((child) => child.matches("a.libRow[data-library-row]"))).toBe(true);
    expect(routeMocks.readOwnPublicVotes).not.toHaveBeenCalled();

    routeMocks.readPublicDebates.mockResolvedValue({ items: [countedDebates[0]!, publicDebates[1]!, countedDebates[2]!], total: 37 });
    const mixed = await renderRoute("t".repeat(43), "public");
    const bare = mixed.querySelectorAll("[data-library-row]")[1]!;
    expect(voteButtons(mixed)).toHaveLength(2);
    expect(bare.outerHTML).toBe(plain.querySelectorAll("[data-library-row]")[1]!.outerHTML);
    expect(bare.parentElement?.classList.contains("recentList")).toBe(true);
    expect(routeMocks.readOwnPublicVotes.mock.calls).toEqual([[[countedRefs[0], countedRefs[2]]]]);
    expectLiveCount(mixed, "3 TOTAL");
  });

  it("keeps every row and its box, none pressed, when the account's votes cannot be read", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    routeMocks.readOwnPublicVotes.mockRejectedValue(new Error("the votes read is down"));
    const rendered = await renderRoute("t".repeat(43), "public");

    expect(voteButtons(rendered).map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
    expect(routeMocks.voteProps.map((props) => props.signedIn)).toEqual([true, true, true]);
    expect(rendered.querySelector(".error")).toBeNull();
  });

  it("shows the counts to a session that could not be confirmed, as signed out, and asks nothing", async () => {
    routeMocks.readPublicDebates.mockResolvedValue({ items: countedDebates, total: 37 });
    routeMocks.listDebatesPageServer.mockRejectedValue(new Error("the session could not be confirmed"));
    const rendered = await renderRoute("t".repeat(43), "public");

    expect(voteButtons(rendered).map((button) => button.querySelector(".libVoteCount")?.textContent)).toEqual(["0", "1", "1.2k"]);
    expect(routeMocks.voteProps.map(({ signedIn, initialVoted, signInHref }) => ({ signedIn, initialVoted, signInHref }))).toEqual(
      Array.from({ length: 3 }, () => ({ signedIn: false, initialVoted: false, signInHref: SIGN_IN })));
    expect(routeMocks.readOwnPublicVotes).not.toHaveBeenCalled();
    expect(routeMocks.serverReads).toEqual(["readPublicDebates:none"]);
  });
```

- [ ] **Step 5: Run it and see five of the six new cases fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/t3-library.test.tsx`
Expected: `Tests  5 failed | 16 passed (21)`. Failing: every new case but "draws no vote box and asks nothing on
Your debates" (a guard). The first reads `expected [] to have a length of 3 but got +0`. The fifteen old cases
pass: the new mocks changed nothing for them.

- [ ] **Step 6: Add the source pin**

Append to `apps/ui/components/debateReferenceDesign.source-test.mjs`, after line 29:

```js

test("a public row's vote box wraps the unchanged row link and is never drawn in this file", () => {
  // Upvotes (design 2026-11-26, section 4): a button may not sit inside an anchor, so the box is the client island
  // LibraryVote, which wraps the server-rendered link. This file stays a server module: no directive, no hook, no button.
  assert.doesNotMatch(library, /^\s*["']use client["']/m);
  assert.doesNotMatch(library, /<button\b|\buse[A-Z][A-Za-z]*\(/);
  assert.match(library, /<LibraryVote\b[\s\S]*?<\/LibraryVote>/);
  // The row's question carries the id the box points at; it is set only for a row inside a box.
  assert.match(library, /<div className="libRowClaim" id=\{claimId\}>\{claim\}<\/div>/);
  // The wrapper slides box and card together on hover, so the link inside it must not slide a second time.
  assert.match(css, /\.libVoteRow > \.libRow:hover \{ transform: none; \}/);
});
```

- [ ] **Step 7: Run it and see the new test fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui exec node --import tsx --test --test-concurrency=1 components/debateReferenceDesign.source-test.mjs`
Expected: `ℹ pass 1`, `ℹ fail 1`. The failure:
`The input did not match the regular expression /<LibraryVote\b[\s\S]*?<\/LibraryVote>/`.

- [ ] **Step 8: `LibraryRow` takes the question's id**

`apps/ui/components/DebatesBuffer.tsx`. Add `claimId?: string;` to `LibraryRow`'s props type (after
`confidenceBand` at line 65) and `claimId` to its destructuring. Line 78 becomes exactly:

```tsx
          <div className="libRowClaim" id={claimId}>{claim}</div>
```

Nothing else in `LibraryRow` changes. `DebatesBuffer` (lines 108-170) does not pass it.

- [ ] **Step 9: `PublicDebatesBuffer` wraps the rows that carry a count**

Same file. After line 10 add:

```tsx
import { LibraryVote } from "@/components/LibraryVote";
import { upvoteMessageCatalog } from "@/lib/upvoteWords";
```

`PublicDebatesBuffer` (lines 174-223):
- New prop, last in the type and in the destructuring, optional, no default:
  `votes?: Readonly<{ signedIn: boolean; voted: ReadonlySet<string>; signInHref: string }>;` with a one-line doc
  comment: the home page's reader, for the vote boxes; absent everywhere else, and then no row has a box.
- The empty-list branch (lines 188-190) stays first and unchanged.
- After it, once, outside the `map`:
  `const upvoteWords = votes === undefined ? null : upvoteMessageCatalog(catalog);` (first trap).
- Inside the `map`: `const count = debate.vote_count;`. The row is boxed when
  `votes !== undefined && upvoteWords !== null && count !== undefined`. All three are constants, so TypeScript
  narrows them in the boxed arm: no `!`, no `as`. And no `?? 0`: a row without a count gets no box, it is not a zero.
- `claimId` is `` `lib-claim-${debate.public_ref}` `` for a boxed row and `undefined` otherwise.
- Build today's `<LibraryRow … />` element (lines 204-220) once, as `row`, with `claimId={claimId}` added, so the
  two arms cannot drift apart. A row that is not boxed is `row` alone (an `undefined` id renders nothing). A boxed
  row is exactly this:

```tsx
<LibraryVote key={debate.public_ref} publicRef={debate.public_ref} initialCount={count}
  initialVoted={votes.voted.has(debate.public_ref)} signedIn={votes.signedIn} signInHref={votes.signInHref}
  catalog={upvoteWords} locale={locale} describedBy={claimId}>
  {row}
</LibraryVote>
```

- [ ] **Step 10: Run the list test and the source pin: green. The page test: still red**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/render/locale-leftovers.test.tsx`
Expected: `Tests  7 passed (7)`.

Run the command of Step 7. Expected: `ℹ pass 2`, `ℹ fail 0`.

Run the command of Step 5. Expected: still `Tests  5 failed | 16 passed (21)`: the page hands the list no `votes` yet.

- [ ] **Step 11: The home page reads the account's votes and hands them to the list**

`apps/ui/app/page.tsx`.
- After line 28: `import { signInHref } from "@/lib/returnPath";`
- Between the legal read (ends at line 205) and the chip comment (starts at line 207), so it runs after the age
  screen's early return (lines 187-191):
  - `let voted: ReadonlySet<string> = new Set();`
  - The refs to ask about: when `tab === "public" && sessionConfirmed`, the `public_ref` of every item of
    `published.items` whose `vote_count !== undefined`, in list order; otherwise none.
  - Only when there is at least one ref: inside `try`,
    `voted = new Set((await createServerContractClient(fetch, token, userAgent, clientIp).readOwnPublicVotes(refs)).voted);`
    and in `catch`, `voted = new Set();`. No error line, no log, no retry: the boxes then start unpressed.
  - A comment above it, in the file's style (see lines 176-177 and 192-194): upvotes, design of 26 Nov 2026 §7.4;
    asked once for the page of rows, with the session; the list itself stays anonymous; a row without a count comes
    from an API without the vote routes, so nothing is asked about it; a failed read leaves every box unpressed.
- Line 283: the same single element gains one prop, after `composeCatalog={composeCatalog}`:

```tsx
votes={{ signedIn: sessionConfirmed, voted, signInHref: signInHref("/?tab=public") }}
```

Line 161 (`readPublicDebates(50, 0)` on the anonymous client) and the note at lines 285-287 do not change.

- [ ] **Step 12: Run the page test and see it pass**

Run the command of Step 5. Expected: `Test Files  1 passed (1)`, `Tests  21 passed (21)`.

- [ ] **Step 13: Check the types**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui typecheck`
Expected: exit 0, no `error TS` line. (This is what proves `initialCount` is a `number` and that
`readOwnPublicVotes` exists on the client.)

- [ ] **Step 14: Verify the task**

One file per vitest command, each with the prefix
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`:

| Command (after the prefix) | Expected |
|---|---|
| `pnpm exec vitest run tests/render/t3-library.test.tsx` | `Tests  21 passed (21)` |
| `pnpm exec vitest run tests/render/locale-leftovers.test.tsx` | `Tests  7 passed (7)` |
| `pnpm exec vitest run tests/render/library-vote.test.tsx` | `Tests  28 passed (28)`, file unedited (T11's) |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test --test-concurrency=1 components/debateReferenceDesign.source-test.mjs` | `ℹ pass 2`, `ℹ fail 0` |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test --test-concurrency=1 scripts/no-hardcoded-english.test.mjs scripts/server-client-boundary.source-test.mjs lib/i18n/catalogThreading.test.mjs lib/i18n/catalogNamespaces.test.mjs` | `ℹ pass 13`, `ℹ fail 0`, files unedited |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test --test-concurrency=1 components/authRoutes.source-test.mjs lib/serverApi.test.mjs lib/i18n/auth.test.mjs` | `ℹ pass 32`, `ℹ fail 0`, files unedited (they read `page.tsx` as text) |
| `pnpm exec vitest run tests/render/ai-disclosure.test.tsx` | `Tests  14 passed (14)`: the list with `debates` alone |
| `pnpm exec vitest run tests/render/synthesis-flag-card.test.tsx` | `Tests  7 passed (7)`: private rows unchanged |
| `pnpm exec vitest run tests/render/m6-library-floor.test.tsx` | `Tests  4 passed (4)` |
| `pnpm exec vitest run tests/render/r2-split-ui.test.tsx` | `Tests  76 passed (76)` |
| `pnpm exec vitest run tests/render/kbd-r3-k1b-title-facts.test.tsx` | `Tests  13 passed (13)` |
| `pnpm exec vitest run tests/render/b10-waiting-state.test.tsx` | `Tests  7 passed (7)` |
| `pnpm exec vitest run tests/unit/pda-s03-keyboard-accessibility.test.ts` | `Tests  5 passed (5)`: a server client with no votes read |
| `pnpm exec vitest run tests/render/home-legal-gate.test.tsx` | `Tests  3 passed (3)` |
| `pnpm exec vitest run tests/render/check-removal-notice.test.tsx` | `Tests  13 passed (13)` |
| `pnpm exec vitest run tests/render/m8-daily-limit.test.tsx` | `Tests  7 passed (7)` |
| `pnpm exec vitest run tests/render/t9-landing.test.tsx` | `Tests  28 passed (28)` |
| `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts` | `Tests  5 passed (5)`: the page's source laws |
| `pnpm exec vitest run tests/unit/main-site-review-window.test.ts` | `Tests  37 passed (37)`: no closed address written in `page.tsx` |
| `pnpm --filter dialectical-engine-v2ui typecheck` | exit 0 |
| `pnpm run typecheck` | exit 0 (it reads none of this task's files; it shows nothing else broke) |
| `pnpm run audit:text-bytes` | `REPOSITORY_TEXT_CONTROL_BYTES=0` (the list test holds Romanian letters as plain UTF-8) |
| `grep -c "use client\|<button\|useState\|useEffect" apps/ui/components/DebatesBuffer.tsx` | `0` |
| `git diff --stat -- apps/ui/app/globals.css apps/ui/components/LibraryVote.tsx apps/ui/lib/upvoteWords.ts tests/support/shipped-corpus.manifest.txt packages/contract` | empty |
| `git status --short` | of this task: the five modified paths of Step 15, no new file, and nothing else of yours |

A count that differs in an unedited file: compare the failing names with a run of the same file on the commit
before yours before you change anything.

- [ ] **Step 15: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add apps/ui/components/DebatesBuffer.tsx apps/ui/app/page.tsx tests/render/t3-library.test.tsx tests/render/locale-leftovers.test.tsx apps/ui/components/debateReferenceDesign.source-test.mjs
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The home page's public rows carry the vote box, and the page asks once which of them the signed-in account upvoted." -m "PublicDebatesBuffer wraps a row in LibraryVote when the home page hands it the reader's votes and the row carries a count; every other row, and every other caller, renders as before. The page reads the account's own votes with its session, inside try/catch, and still reads the list without one. Tests: tests/render/t3-library.test.tsx, tests/render/locale-leftovers.test.tsx, apps/ui/components/debateReferenceDesign.source-test.mjs." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Expected from the check, last line: `LIMITS_CHECK_OK <n> added line(s) read.` Never `git add -A` or `git add .`: the
tree holds untracked plan and design files that are not this task's. The commit goes to the branch
`feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The last `-m` is the attribution line;
if your session's instructions give another one, use theirs.
