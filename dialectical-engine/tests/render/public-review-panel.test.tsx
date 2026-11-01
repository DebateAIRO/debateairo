// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContractHttpError, PublicReviewPageSchema, type PublicReviewPage } from "@debateai/contract";
import { PublicReviewPanel } from "../../apps/ui/components/PublicReviewPanel.js";
import { publicationRefOf, type PublicReviewClient } from "../../apps/ui/lib/publicReviewApi.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
/** Decision 33: the team page's panel. Made-up debate. The refusals themselves: public-review-http.test.ts and the database's. */
const REF = "11111111-1111-4111-8111-111111111111";
const DIG = "22222222-2222-4222-8222-222222222222";
const LATER = "33333333-3333-4333-8333-333333333333";
const pageOf = (hidden: boolean, removed = false): PublicReviewPage => PublicReviewPageSchema.parse({ publication_ref: REF, hidden, revision: hidden ? 1 : 0, question: "A made-up question?", published_at: "2026-10-20T08:00:00.000Z", snapshot_unreadable: false,
  snapshot: [{ pointer: "/question", original: "A made-up question?", corrected: null }, { pointer: "/story_short/summary", original: "Holds a name.", corrected: "A corrected summary." }],
  digs: [{ dig_run_id: DIG, parent_run_id: REF, position_ref: "p", contributor: "Quiet Heron", contributed_at: "2026-10-21T08:00:00.000Z", removed }],
  updates: [{ update_id: LATER, update_seq: 2, dig_run_id: DIG, kind: "PATH", position_ref: "p", recorded_at: "2026-10-21T09:00:00.000Z", state: "AFFECTED", before: "The text before.", pieces: [{ pointer: "/line", original: "The dig's line.", corrected: null }] }],
  reports: [], log: hidden ? [{ revision: 1, action: "HIDE", piece_kind: null, actor_staff_id: DIG, at: "2026-11-01T09:00:00.000Z" }] : [] });
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });
function client(change: Partial<PublicReviewClient> = {}) {
  return { cancel: vi.fn(), readReports: vi.fn(async () => ({ reports: [{ flag_id: LATER, publication_ref: REF, reporter: "Quiet Heron", state: "HIDDEN", verdict: "AGREE", reason: "PERSONAL", created_at: "2026-11-01T08:00:00.000Z", judged_at: null, dismissed_at: null, where: "A place.", claim: "A claim to read.", debate_hidden: true }] })), dismissReport: vi.fn(async () => ({})), list: vi.fn(async () => ({ hidden: [], log: [] })), read: vi.fn(async () => pageOf(false)), hide: vi.fn(async () => ({})), step: vi.fn(async () => ({})), ...change } as unknown as PublicReviewClient;
}
async function mount(api: PublicReviewClient) {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => { root!.render(<PublicReviewPanel client={api} />); });
}
const button = (name: string) => [...host!.querySelectorAll("button")].find((entry) => entry.textContent === name);
async function press(name: string) { await act(async () => { button(name)!.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); }
async function open() {
  const input = host!.querySelector<HTMLInputElement>("#public-review-link")!;
  input.value = `https://dezbatere.ro/public/debate/${REF}`;
  await act(async () => { host!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

describe("the review panel", () => {
  it("shows nothing at all to anyone but the two", async () => {
    await mount(client({ list: vi.fn(async () => { throw new ContractHttpError("FORBIDDEN", 403, "x", "STAFF_REQUEST_REFUSED"); }) }));
    expect(host!.querySelector("[data-public-review-panel]")).toBeNull();
  });
  it("a pasted link opens the debate; hide says what it does, and only the confirm press hides", async () => {
    const hide = vi.fn(async () => ({}));
    const api = client({ hide } as never);
    await mount(api);
    await open();
    expect(api.read).toHaveBeenCalledWith(REF);
    await press("Hide now");
    expect(host!.querySelector("[data-review-confirm]")!.textContent).toContain("Hide this debate now");
    expect(hide).not.toHaveBeenCalled();
    await press("Confirm");
    expect(hide).toHaveBeenCalledWith(REF, 0);
  });
  it("while hidden: each dig's text with what it changed and its state; a correction shows both texts; the steps name their piece", async () => {
    const step = vi.fn(async () => ({}));
    await mount(client({ read: vi.fn(async () => pageOf(true)), step } as never));
    await open();
    expect(host!.querySelector("[data-review-debate]")!.getAttribute("data-review-debate")).toBe("HIDDEN");
    expect(host!.querySelector("[data-review-dig]")!.textContent).toContain("Quiet Heron");
    expect(host!.querySelector("[data-review-update]")!.getAttribute("data-review-update")).toBe("AFFECTED");
    expect(host!.textContent).toContain("Before it: The text before.");
    expect(host!.querySelector("[data-review-original]")!.textContent).toBe("Holds a name.");
    expect(host!.querySelector("[data-review-corrected]")!.textContent).toBe("A corrected summary.");
    await press("Take this dig out");
    await press("Confirm");
    expect(step).toHaveBeenLastCalledWith(REF, 1, { step: "REMOVE_DIG", pieceKind: "DIG", pieceId: DIG });
    await press("Put this back");
    await press("Confirm");
    expect(step).toHaveBeenLastCalledWith(REF, 1, { step: "PUT_BACK", pieceKind: "UPDATE", pieceId: LATER });
    await press("Put back");
    await press("Confirm");
    expect(step).toHaveBeenLastCalledWith(REF, 1, { step: "REPUBLISH" });
  });
  it("offers no correction while the debate is public; words find their pieces; a stale page says so in plain words", async () => {
    const api = client({ hide: vi.fn(async () => { throw new ContractHttpError("SERVER_FAILURE", 409, "x", "PUBLIC_REVIEW_STALE"); }) } as never);
    await mount(api);
    await open();
    expect(button("Replace this text")).toBeUndefined();
    await press("Hide now");
    await press("Confirm");
    expect(host!.textContent).toContain("Someone else took a step first");
  });
  it("the queue shows each report with its claim, what the AI said and the reporter; open goes to the review tool; a dismissal says what it does first", async () => {
    const api = client();
    await mount(api);
    const row = host!.querySelector("[data-report]")!;
    expect(row.getAttribute("data-report")).toBe("HIDDEN");
    expect(row.textContent).toContain("Quiet Heron");
    expect(row.textContent).toContain("A claim to read.");
    await press("Open in the review tool");
    expect(api.read).toHaveBeenCalledWith(REF);
    await press("Dismiss");
    expect(api.dismissReport).not.toHaveBeenCalled();
    await press("Confirm");
    expect(api.dismissReport).toHaveBeenCalledWith(LATER);
  });
  it("a public link or a bare reference names the debate; anything else is nothing", () => {
    expect(publicationRefOf(`https://dezbatere.ro/public/debate/${REF}?x=1`)).toBe(REF);
    expect(publicationRefOf(REF.toUpperCase())).toBe(REF);
    expect(publicationRefOf("no reference")).toBeNull();
  });
});
