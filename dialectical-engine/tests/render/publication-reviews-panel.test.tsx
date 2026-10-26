// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { StaffAccessPanel } from "../../apps/ui/components/StaffAccessPanel.js";
import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { createStaffApiClient, type StaffApiClient } from "../../apps/ui/lib/staffApi.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import enStaff from "../../apps/ui/messages/en/staff.json";
import roStaff from "../../apps/ui/messages/ro/staff.json";
import enPublic from "../../apps/ui/messages/en/public.json";
import roPublic from "../../apps/ui/messages/ro/public.json";

const routerReplace = vi.hoisted(() => vi.fn());
let cookieLocale: string | undefined;
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplace }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => cookieLocale === undefined ? undefined : { value: cookieLocale } }) }));

const reviewRef = "11111111-1111-4111-8111-111111111111";
const older = { review_ref: reviewRef, asked_at: "2026-10-20T08:00:00.000Z", ask_ordinal: 1 as const, categories: ["HATE_SPEECH" as const] };
const newer = { review_ref: "22222222-2222-4222-8222-222222222222", asked_at: "2026-10-20T09:00:00.000Z", ask_ordinal: 2 as const, categories: ["WEAPONS_OR_DRUGS" as const] };
const snapshot = {
  ...older,
  question: "Should this debate be published?",
  answer: {
    terminal: "SERVED", verdict: "PRO", verdict_available: true,
    confidence_band: null, summary_segments: [{ text: "The synthesis to review." }],
    badges: [], residual_objections: [], reversal_point: "A new argument", as_of: older.asked_at,
    nodes: [], edges: [], tree_included: true
  }
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mounted: Array<{ root: Root; host: HTMLDivElement }> = [];
async function mount(element: ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => { root.render(element); });
  return host;
}
async function click(button: Element | null) {
  expect(button, "expected button to exist").not.toBeNull();
  await act(async () => { (button as HTMLElement).click(); });
}
function button(host: HTMLElement, label: string) {
  return Array.from(host.querySelectorAll("button")).find(node => node.textContent?.includes(label)) ?? null;
}
function accessClient(capabilities: string[], auditEvents: unknown[] = []): StaffApiClient {
  const client = {
    withFundingPolicyVersion: () => client,
    cancel: vi.fn(),
    enrollment: async () => ({ user_id: "33333333-3333-4333-8333-333333333333", readiness: {
      account_active: true, email_verified: true, totp_active: true, security_hold: false,
      verified_credential_count: 2, owner_credential_requirement_met: true, delegated_credential_requirement_met: true
    } }),
    elevate: async () => ({ staff_id: "44444444-4444-4444-8444-444444444444", capabilities, expires_at: "2099-01-01T00:00:00.000Z" }),
    team: async () => ({ members: [], next_cursor: null }),
    audit: async () => ({ events: auditEvents, next_cursor: null })
  };
  return client as unknown as StaffApiClient;
}
function panelClient(overrides: Record<string, unknown> = {}): StaffApiClient {
  return {
    publicationReviews: async () => ({ items: [older], order: "ASKED_AT_ASC" }),
    publicationReview: async () => snapshot,
    proveAction: async () => ({ proof_handle: "p".repeat(43) }),
    approvePublicationReview: async () => ({ review_ref: reviewRef, outcome: "APPROVE", decided_at: older.asked_at }),
    refusePublicationReview: async () => ({ review_ref: reviewRef, outcome: "REFUSE", decided_at: older.asked_at }),
    cancel: vi.fn(),
    ...overrides
  } as unknown as StaffApiClient;
}
async function reviews(client: StaffApiClient) {
  const panelPath = "../../apps/ui/components/PublicationReviewsPanel.js";
  const { PublicationReviewsPanel } = await import(/* @vite-ignore */ panelPath);
  return mount(createElement(PublicationReviewsPanel, { client, catalog: enStaff, publicCatalog: enPublic, locale: "en" }));
}
afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => { root.unmount(); });
    host.remove();
  }
  routerReplace.mockReset();
  cookieLocale = undefined;
});

describe("publication reviews staff surface", () => {
  it("the console shows the Publication reviews link only to a self holding PUBLICATION_REVIEW, an OWNER self and a DELEGATED self alike", async () => {
    const without = await mount(createElement(StaffAccessPanel, { client: accessClient([]) }));
    await click(button(without, enStaff["staff.elevate"]));
    expect(without.querySelector('a[href="/admin/reviews"]')).toBeNull();
    for (const role of ["OWNER", "DELEGATED"]) {
      const capabilities = role === "OWNER"
        ? ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "EMERGENCY_DISABLE", "AUDIT_READ", "PUBLICATION_REVIEW"]
        : ["PUBLICATION_REVIEW"];
      const host = await mount(createElement(StaffAccessPanel, { client: accessClient(capabilities) }));
      await click(button(host, enStaff["staff.elevate"]));
      expect(host.querySelector('a[href="/admin/reviews"]')?.textContent).toBe("Publication reviews");
      expect(host.querySelector('a[href="/admin/reviews"]')?.closest(".staffActions")).not.toBeNull();
    }
  });

  it("the grant form offers PUBLICATION_REVIEW", async () => {
    const host = await mount(createElement(StaffAccessPanel, { client: accessClient(["TEAM_INVITE"]) }));
    await click(button(host, enStaff["staff.elevate"]));
    await click(button(host, enStaff["staff.action.invite"]));
    expect(host.querySelector('input[name="capabilities"][value="PUBLICATION_REVIEW"]')).not.toBeNull();
  });

  it("the queue lists items oldest first with time and category words, and the empty state", async () => {
    const host = await reviews(panelClient({ publicationReviews: async () => ({ items: [newer, older], order: "ASKED_AT_ASC" }) }));
    expect(host.textContent?.indexOf(enStaff["staff.reviews.category.HATE_SPEECH"])).toBeLessThan(host.textContent!.indexOf(enStaff["staff.reviews.category.WEAPONS_OR_DRUGS"]));
    expect(host.textContent).toContain(enStaff["staff.reviews.secondRequest"]);
    expect(host.querySelectorAll("time")).toHaveLength(2);
    expect(host.querySelector(".setCard .staffSectionTitle")?.textContent).toBe(enStaff["staff.reviews.heading"]);
    expect(host.querySelectorAll(".rvQueue > li")).toHaveLength(2);
    expect(host.querySelector(".staffBadge")?.textContent).toBe(enStaff["staff.reviews.secondRequest"]);
    expect(host.querySelector(".rvQueue button")?.classList.contains("setBtnQuiet")).toBe(false);
    const empty = await reviews(panelClient({ publicationReviews: async () => ({ items: [], order: "ASKED_AT_ASC" }) }));
    expect(empty.textContent).toContain(enStaff["staff.reviews.empty"]);
    expect(empty.querySelector(".setCard .staffSectionTitle")?.textContent).toBe(enStaff["staff.reviews.heading"]);
  });

  it("shows the more-requests line only when the queue reports an overflow", async () => {
    const full = await reviews(panelClient({ publicationReviews: async () => ({ items: [older], order: "ASKED_AT_ASC", has_more: false }) }));
    expect(full.textContent).not.toContain("More requests are waiting");
    const overflow = await reviews(panelClient({ publicationReviews: async () => ({ items: [older], order: "ASKED_AT_ASC", has_more: true }) }));
    expect(overflow.textContent).toContain("More requests are waiting");
  });

  it("an open item renders through PublicDebateOverview without the public note and with no owner identity; Back returns to the queue and posts nothing", async () => {
    const post = vi.fn();
    const host = await reviews(panelClient({ approvePublicationReview: post, refusePublicationReview: post }));
    await click(button(host, enStaff["staff.reviews.open"]));
    expect(host.textContent).toContain(snapshot.question);
    expect(host.querySelector("h1.setTitle")?.textContent).toBe(snapshot.question);
    expect(host.textContent).toContain("The synthesis to review.");
    expect(host.querySelector(".publicUnlockNote")).toBeNull();
    expect(host.textContent).not.toContain("author_pseudonym");
    expect([...host.querySelectorAll(".rvActions button")].map(item => item.textContent)).toEqual([
      enStaff["staff.reviews.approve"], enStaff["staff.reviews.refuse"], enStaff["staff.reviews.back"]
    ]);
    await click(button(host, enStaff["staff.reviews.back"]));
    expect(host.textContent).not.toContain(snapshot.question);
    expect(routerReplace).toHaveBeenCalledWith("/admin/reviews");
    expect(post).not.toHaveBeenCalled();
  });

  it("Details and Read open review-local content from the pending snapshot", async () => {
    const fair = buildFairShapedAnswer({ answer_id: reviewRef, run_ref: newer.review_ref,
      question_line: snapshot.question, verdict_state: "CONTESTED" });
    const readable = { ...snapshot, answer: { ...snapshot.answer, verdict: "SUPPORTED", nodes: fair.nodes ?? [], edges: fair.edges ?? [] } };
    const host = await reviews(panelClient({ publicationReview: async () => readable }));
    await click(button(host, enStaff["staff.reviews.open"]));
    expect(host.querySelector("[data-review-detail]")).toBeNull();
    await click(host.querySelector(".publicDetailsAction"));
    // REV-S02-p3 product N2: the panel sits in the page flow and traps nothing, so it is a labelled section, not a dialog.
    expect(host.querySelector("[role=dialog]")).toBeNull();
    expect(host.querySelector('section[data-review-detail="verdict"]')?.getAttribute("aria-label")).toBe(enPublic["public.overview.details"]);
    expect(host.querySelector('section[data-review-detail="verdict"]')?.textContent).toContain("The synthesis to review.");
    expect(host.querySelector('[data-review-detail="verdict"]')?.textContent).toContain("Clear answer");
    expect(host.querySelector('[data-review-detail="verdict"]')?.textContent).not.toContain("SUPPORTED");
    await click(button(host, enPublic["public.honesty.close"]));
    await click(host.querySelector(".publicReadAction"));
    expect(host.querySelector("[role=dialog]")).toBeNull();
    expect(host.querySelector('section[data-review-detail="argument"]')?.getAttribute("aria-label")).toBe(enPublic["public.overview.read"]);
    expect(host.querySelector('section[data-review-detail="argument"]')?.textContent).toContain("The defeater claim attacking the position.");
  });

  it("Refuse needs 1..500 trimmed characters before the ceremony starts", async () => {
    const prove = vi.fn().mockResolvedValue({ proof_handle: "p".repeat(43) });
    const refuse = vi.fn().mockResolvedValue({ review_ref: reviewRef, outcome: "REFUSE", decided_at: older.asked_at });
    const host = await reviews(panelClient({ proveAction: prove, refusePublicationReview: refuse }));
    await click(button(host, enStaff["staff.reviews.open"]));
    await click(button(host, enStaff["staff.reviews.refuse"]));
    const reason = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(host.querySelectorAll(".rvActions button")).toHaveLength(2);
    expect(button(host, enStaff["staff.reviews.approve"])).toBeNull();
    expect(reason.closest(".rvReason")).not.toBeNull();
    expect(host.querySelector(".rvCount")?.textContent).toContain("0");
    expect(reason.maxLength).toBe(500);
    expect(reason.labels?.[0]?.textContent).toContain(enStaff["staff.reviews.reasonLabel"]);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reason, "   ");
    await act(async () => { reason.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(prove).not.toHaveBeenCalled();
    expect(button(host, enStaff["staff.reviews.refuse"])?.hasAttribute("disabled")).toBe(true);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reason, " Test refusal reason ");
    await act(async () => { reason.dispatchEvent(new Event("input", { bubbles: true })); });
    await click(button(host, enStaff["staff.reviews.refuse"]));
    expect(prove).toHaveBeenCalledWith(expect.objectContaining({ action: "PUBLICATION_REVIEW_REFUSE", reason: "Test refusal reason" }));
    expect(refuse).toHaveBeenCalledWith(reviewRef, expect.objectContaining({ reason: "Test refusal reason" }));
  });

  it("Approve runs proveAction with the review intent, posts the decision, clears the content and replaces the route with /admin/reviews", async () => {
    const order: string[] = [];
    const client = panelClient({
      proveAction: async (intent: { action: string }) => { order.push(intent.action); return { proof_handle: "p".repeat(43) }; },
      approvePublicationReview: async () => { order.push("POST"); return { review_ref: reviewRef, outcome: "APPROVE", decided_at: older.asked_at }; }
    });
    const host = await reviews(client);
    await click(button(host, enStaff["staff.reviews.open"]));
    await click(button(host, enStaff["staff.reviews.approve"]));
    expect(order).toEqual(["PUBLICATION_REVIEW_APPROVE", "POST"]);
    expect(host.textContent).not.toContain(snapshot.question);
    expect(host.textContent).toContain(enStaff["staff.reviews.approved"]);
    expect(host.querySelector(".setCard .staffNotice[role=status]")?.textContent).toBe(enStaff["staff.reviews.approved"]);
    expect(routerReplace).toHaveBeenCalledWith("/admin/reviews");
    const fetchCalls: Array<{ method: string; path: string; body: unknown }> = [];
    const api = createStaffApiClient({ fetchImplementation: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      fetchCalls.push({ method: init?.method ?? "GET", path, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
      const value = path.endsWith("/approve") ? { review_ref: reviewRef, outcome: "APPROVE", decided_at: older.asked_at }
        : path.endsWith("/refuse") ? { review_ref: reviewRef, outcome: "REFUSE", decided_at: older.asked_at }
          : path.endsWith(`/${reviewRef}`) ? { ...snapshot, answer: { ...snapshot.answer, verdict: null, verdict_available: false } }
            : { items: [], order: "ASKED_AT_ASC" };
      return new Response(JSON.stringify(value), { status: 200 });
    }) as typeof fetch });
    await api.publicationReviews();
    await api.publicationReview(reviewRef);
    await api.approvePublicationReview(reviewRef, { proof_handle: "p".repeat(43), operation_id: reviewRef });
    await api.refusePublicationReview(reviewRef, { proof_handle: "p".repeat(43), operation_id: reviewRef, reason: "Checked reason" });
    expect(fetchCalls.map(call => `${call.method} ${call.path.replace(/^.*\/v1/u, "/v1")}`)).toEqual([
      "GET /v1/admin/publication-reviews",
      `GET /v1/admin/publication-reviews/${reviewRef}`,
      `POST /v1/admin/publication-reviews/${reviewRef}/approve`,
      `POST /v1/admin/publication-reviews/${reviewRef}/refuse`
    ]);
    expect(fetchCalls[3]?.body).toEqual({ proof_handle: "p".repeat(43), operation_id: reviewRef, reason: "Checked reason" });
  });

  it("404, own-debate, same-reviewer, decided and 503 STAFF_ALERT_UNAVAILABLE answers each show their message and no content", async () => {
    for (const [status, code, message] of [
      [404, "PUBLICATION_REVIEW_NOT_FOUND", "staff.reviews.error.notFound"],
      [403, "PUBLICATION_REVIEW_OWN_DEBATE", "staff.reviews.error.ownDebate"],
      [403, "PUBLICATION_REVIEW_SAME_REVIEWER", "staff.reviews.error.sameReviewer"],
      [409, "PUBLICATION_REVIEW_DECIDED", "staff.reviews.error.decided"],
      [503, "STAFF_ALERT_UNAVAILABLE", "staff.reviews.error.locked"]
    ] as const) {
      const host = await reviews(panelClient({ publicationReview: async () => { throw new ContractHttpError("SERVER_FAILURE", status, "STAFF_REQUEST_FAILED", code); } }));
      await click(button(host, enStaff["staff.reviews.open"]));
      expect(host.textContent).toContain(enStaff[message]);
      expect(host.textContent).not.toContain(snapshot.question);
      expect(host.querySelector(".setCard [role=status]")?.textContent).toBe(enStaff[message]);
      expect(host.querySelector(".setCard [role=status]")?.classList.contains("setCardHint")).toBe(true);
      expect(button(host, enStaff["staff.reviews.back"])?.classList.contains("setBtnQuiet")).toBe(true);
      expect(button(host, enStaff["staff.reviews.back"])).not.toBeNull();
      expect(host.querySelector(".rvQueue")).toBeNull();
    }
    const locked = await reviews(panelClient({ proveAction: async () => { throw new ContractHttpError("SERVER_FAILURE", 503, "STAFF_REQUEST_FAILED", "STAFF_ALERT_UNAVAILABLE"); } }));
    await click(button(locked, enStaff["staff.reviews.open"]));
    await click(button(locked, enStaff["staff.reviews.approve"]));
    expect(locked.textContent).toContain(enStaff["staff.reviews.error.locked"]);
    expect(locked.textContent).not.toContain(snapshot.question);
    expect(button(locked, enStaff["staff.reviews.back"])).not.toBeNull();
    const denied = await reviews(panelClient({ publicationReviews: async () => { throw new ContractHttpError("FORBIDDEN", 403, "STAFF_REQUEST_FAILED"); } }));
    expect(denied.textContent).toContain("Your account does not have the Publication reviews permission.");
    expect(denied.querySelector('a[href="/admin/team"]')?.closest(".staffActions")).not.toBeNull();
    const signedOut = await reviews(panelClient({ publicationReviews: async () => { throw new ContractHttpError("SESSION_REQUIRED", 401, "STAFF_REQUEST_FAILED"); } }));
    expect(signedOut.textContent).toContain(enStaff["staff.reviews.notElevated"]);
    expect(signedOut.textContent).not.toContain(enStaff["staff.failed"]);
    expect(signedOut.querySelector(".staffSectionTitle")?.textContent).toBe(enStaff["staff.reviews.heading"]);
    expect(signedOut.querySelector('a[href="/admin/team"]')?.textContent).toBe(enStaff["staff.title"]);
    expect(signedOut.querySelector('a[href="/admin/team"]')?.closest(".staffActions")).not.toBeNull();
  });

  it("the audit list renders review events without a delivery state", async () => {
    const host = await mount(createElement(StaffAccessPanel, { client: accessClient(["AUDIT_READ"], [{ event_id: reviewRef, event: "PUBLICATION_REVIEW_READ", review_ref: reviewRef, recorded_at: older.asked_at }]) }));
    await click(button(host, enStaff["staff.elevate"]));
    const row = Array.from(host.querySelectorAll(".staffAuditList li")).find(node => node.textContent?.includes(enStaff["staff.event.PUBLICATION_REVIEW_READ"]));
    expect(row).toBeDefined();
    expect(row?.querySelector(".staffDelivery")).toBeNull();
  });

  it("the page module picks ro catalogues for the ro cookie and en otherwise, and renders no main element", async () => {
    const pagePath = "../../apps/ui/app/admin/reviews/page.js";
    const { default: Page } = await import(/* @vite-ignore */ pagePath);
    cookieLocale = "ro";
    const romanianPage = await Page();
    const romanian = renderToStaticMarkup(romanianPage);
    expect(romanian).toContain(roStaff["staff.reviews.heading"]);
    expect(romanian).not.toContain("<main");
    expect((romanianPage as any).props.children.props.children.props.publicCatalog).toBe(roPublic);
    cookieLocale = "fr";
    const englishPage = await Page();
    const english = renderToStaticMarkup(englishPage);
    expect(english).toContain(enStaff["staff.reviews.heading"]);
    expect((englishPage as any).props.children.props.children.props.publicCatalog).toBe(enPublic);
    expect((englishPage as any).props.children.props.children.props.locale).toBe("fr");
  });

  it("staff.json en and ro hold the same keys", () => {
    expect(Object.keys(roStaff).sort()).toEqual(Object.keys(enStaff).sort());
    expect(Object.keys(enStaff).filter(key => key.startsWith("staff.reviews."))).toHaveLength(25);
    expect(enStaff["staff.reviews.category.TERRORISM"]).not.toBe(roStaff["staff.reviews.category.TERRORISM"]);
  });

  it("PublicDebateOverview without viewingNote still renders the public note", () => {
    const debate = { ...snapshot, public_ref: reviewRef, author_pseudonym: "Someone", published_at: older.asked_at };
    const html = renderToStaticMarkup(createElement(PublicDebateOverview, {
      debate: debate as never, catalog: enPublic, storyCatalog: enPublic, storyLocale: "en", onDetails: () => {}, onRead: () => {}
    }));
    expect(html).toContain("publicUnlockNote");
    expect(html).toContain(enPublic["public.overview.publicViewingNotice"]);
  });
});
