// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { readFileSync } from "node:fs";
import { PublicationControl } from "../../apps/ui/components/PublicationControl.js";
import { TakeDownControl } from "../../apps/ui/components/TakeDownControl.js";
import { SecurityActionResume } from "../../apps/ui/components/auth/SecurityActionResume.js";
import { mount, unmount, click } from "./task11-harness.js";
import auth from "../../apps/ui/messages/en/auth.json";
import settings from "../../apps/ui/messages/en/settings.json";
import pub from "../../apps/ui/messages/en/public.json";
import ro from "../../apps/ui/messages/ro/public.json";
import home from "../../apps/ui/messages/en/home.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en" }) }));
vi.mock("@/components/AuthShell", () => ({ useSelectedAuthCatalog: () => auth }));
vi.mock("@/components/auth/SecurityConfirmation", () => ({ SecurityConfirmation: ({ authorization, onConfirmed, disabled, initialProof }: { authorization: { action: string; target_run_id: string }; onConfirmed: (value: unknown) => unknown; disabled: boolean; initialProof?: unknown }) => <button type="button" data-auth={`${authorization.action}:${authorization.target_run_id}`} disabled={disabled} onClick={() => void onConfirmed(initialProof ?? { step_up_grant: { token: "g".repeat(43), ...authorization } })}>Complete proof</button> }));

const run = "11111111-1111-4111-8111-111111111111";
const reviewWords: Record<string, string> = {
  "public.publicationReview.askButton": "Ask for approval",
  "public.publicationReview.askWarning": "A member of our team will read this debate to decide whether it may be published.",
  "public.publicationReview.askAcknowledge": "I understand that a team member will read this debate.",
  "public.publicationReview.askSubmit": "Ask for approval",
  "public.publicationReview.asked": "Your request is under review.",
  "public.publicationReview.flaggedLine": "Our automatic check flagged this debate for:",
  "public.publicationReview.category.HATE_SPEECH": "hate speech",
  "public.publicationReview.category.TERRORISM": "terrorism",
  "public.publicationReview.category.WEAPONS_OR_DRUGS": "crafting weapons or drugs",
  "public.publicationReview.category.SUICIDE_OR_HARM_TO_OTHERS": "suicide or harming others",
  "public.publicationReview.rule.HATE_SPEECH": "hate speech of any kind",
  "public.publicationReview.rule.TERRORISM": "Do not submit or publish unlawful content",
  "public.publicationReview.rule.WEAPONS_OR_DRUGS": "instructions for crafting weapons or drugs",
  "public.publicationReview.rule.SUICIDE_OR_HARM_TO_OTHERS": "content encouraging suicide or harming other people",
  "public.publicationReview.ruleLine": "{category} — Terms §7: {rule}",
  "public.publicationReview.underReview": "Under review",
  "public.publicationReview.pendingError": "This debate is already under review.",
  "public.publicationReview.notAllowed": "You cannot ask for another review.",
  "public.publicationReview.statement.heading": "Why this debate was not approved",
  "public.publicationReview.statement.what": "These versions of this debate cannot be published. It remains private; your account and other debates are unaffected.",
  "public.publicationReview.statement.facts": "Our automated check flagged the synthesis, and a team member read and refused this debate.",
  "public.publicationReview.statement.automated": "The check was automated; the refusal was a person's decision.",
  "public.publicationReview.statement.categoriesIntro": "Categories found:",
  "public.publicationReview.statement.groundIntro": "Terms §7 grounds:",
  "public.publicationReview.statement.reasonIntro": "The reviewer's reason:",
  "public.publicationReview.statement.challengeFirst": "You may ask once more, reply or write to office@dezbatere.ro within six months, or use an out-of-court body or the courts.",
  "public.publicationReview.statement.challengeFinal": "You may use a certified out-of-court body or the courts."
};
const catalog = { ...pub, ...reviewWords };
const clear = { flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null } as const;
const flagged = { flagged: true, state: "NONE", categories: ["HATE_SPEECH", "TERRORISM"], asks_used: 0, may_ask: true, refusal: null } as const;
function client(state: object = flagged) {
  return {
    readRunVisibility: vi.fn().mockResolvedValue({ state: "PRIVATE", public_ref: null }),
    readPublicationReview: vi.fn().mockResolvedValue(state),
    requestPublicationReview: vi.fn().mockResolvedValue({ state: "UNDER_REVIEW" }),
    publishRun: vi.fn().mockResolvedValue({ state: "PUBLISHED", public_ref: "ref" }),
    unpublishRun: vi.fn(), deletePrivateDebate: vi.fn(), authMethods: vi.fn()
  };
}
async function mounted(state: object = flagged, words: Record<string, string> = catalog) {
  const api = client(state);
  const result = await mount(<PublicationControl runId={run} client={api as never} catalog={words} />);
  return { ...result, api };
}
const check = (host: HTMLElement) => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const proof = async (host: HTMLElement) => { await click(host, "Ask for approval"); await act(async () => check(host).click()); await click(host, reviewWords["public.publicationReview.askSubmit"]!); await click(host, "Complete proof"); };
afterEach(() => { vi.clearAllMocks(); document.body.replaceChildren(); });

it("FLAGGED, no request: needs approval, rules and Ask; neither form renders before both reads and Ask starts unticked", async () => {
  let resolveReview!: (value: object) => void;
  const api = client(); api.readPublicationReview.mockReturnValue(new Promise((resolve) => { resolveReview = resolve; }));
  const { host, root } = await mount(<PublicationControl runId={run} client={api as never} catalog={catalog} />);
  try {
    expect(host.textContent).not.toContain("Publish…");
    expect(host.textContent).not.toContain("Ask for approval");
    await act(async () => resolveReview(flagged));
    expect(host.textContent).toContain(pub["public.publication.approvalRequired"]);
    expect(host.textContent).toContain("hate speech — Terms §7: hate speech of any kind");
    expect(host.textContent).toContain("terrorism — Terms §7: Do not submit or publish unlawful content");
    expect(host.textContent).toContain("Ask for approval");
    expect(host.textContent).not.toContain("Publish…");
    await click(host, "Ask for approval");
    expect(check(host).checked).toBe(false);
  } finally { await unmount(root, host); }
});
it("CLEAR offers today's Publish control and no Ask; failed review read also offers Publish", async () => {
  for (const fails of [false, true]) {
    const api = client(clear);
    if (fails) api.readPublicationReview.mockRejectedValue(new Error("unavailable"));
    const { host, root } = await mount(<PublicationControl runId={run} client={api as never} catalog={catalog} />);
    try { expect(host.textContent).toContain("Publish…"); expect(host.textContent).not.toContain("Ask for approval"); }
    finally { await unmount(root, host); }
  }
});
it("Ask opens the team-read confirmation; Cancel calls nothing", async () => {
  const { host, root, api } = await mounted();
  try { await click(host, "Ask for approval"); expect(host.querySelector(".publicationReviewPanel form strong")?.textContent).toBe(reviewWords["public.publicationReview.askWarning"]); await click(host, "Cancel"); expect(api.requestPublicationReview).not.toHaveBeenCalled(); }
  finally { await unmount(root, host); }
});
it("ticked Ask confirms PUBLISH for the run, requests review once, and never publishes", async () => {
  const { host, root, api } = await mounted();
  try {
    await click(host, "Ask for approval");
    await act(async () => check(host).click());
    await click(host, reviewWords["public.publicationReview.askSubmit"]!);
    expect(host.querySelector("[data-auth]")?.getAttribute("data-auth")).toBe(`PUBLISH:${run}`);
    await click(host, "Complete proof");
    expect(api.requestPublicationReview).toHaveBeenCalledWith(run, "g".repeat(43));
    expect(api.publishRun).not.toHaveBeenCalled();
    expect(host.textContent).toContain(reviewWords["public.publicationReview.asked"]);
    expect(host.textContent?.match(/under review/gi)).toHaveLength(1);
  }
  finally { await unmount(root, host); }
});
it("UNDER_REVIEW displays its line and neither Publish nor Ask", async () => {
  const { host, root } = await mounted({ ...flagged, state: "UNDER_REVIEW", may_ask: false, asks_used: 1 });
  try { expect(host.textContent).toContain("Under review"); expect(host.textContent).not.toContain("Publish…"); expect(host.textContent).not.toContain("Ask for approval"); }
  finally { await unmount(root, host); }
});
it("APPROVED offers Publish", async () => {
  const { host, root } = await mounted({ ...flagged, state: "APPROVED", may_ask: false, asks_used: 1 });
  try { expect(host.textContent).toContain("Publish…"); expect(host.textContent).not.toContain("Ask for approval"); }
  finally { await unmount(root, host); }
});
it("REFUSED once shows all seven statement parts in order, verbatim reason and Ask", async () => {
  const { host, root } = await mounted({ ...flagged, state: "REFUSED", asks_used: 1, refusal: { reason: "Exact reviewer reason", decided_at: "2026-10-20T00:00:00Z" } });
  try {
    const statement = host.querySelector(".publicationReviewStatement")!;
    const order = ["Why this debate was not approved", "These versions", "Our automated check", "The check was automated", "Categories found:", "Terms §7 grounds:", "The reviewer's reason:", "Exact reviewer reason", "You may ask once more"];
    let previous = -1; for (const phrase of order) { const next = statement.textContent!.indexOf(phrase); expect(next).toBeGreaterThan(previous); previous = next; }
    expect(statement.querySelector("blockquote")?.textContent).toBe("Exact reviewer reason");
    expect(host.textContent).toContain("Ask for approval");
  } finally { await unmount(root, host); }
});
it("REFUSED twice names only outside routes in part seven and offers no Ask", async () => {
  const { host, root } = await mounted({ ...flagged, state: "REFUSED", asks_used: 2, may_ask: false, refusal: { reason: "No", decided_at: "2026-10-20T00:00:00Z" } });
  try { expect(host.textContent).toContain("certified out-of-court body or the courts"); expect(host.textContent).not.toContain("ask once more"); expect(host.textContent).not.toContain("Ask for approval"); }
  finally { await unmount(root, host); }
});
it("Ask refusals map pending, not allowed, unauthorized and unavailable to their own messages", async () => {
  for (const [status, code, message] of [[409, "PUBLICATION_REVIEW_PENDING", reviewWords["public.publicationReview.pendingError"]], [409, "PUBLICATION_REVIEW_NOT_ALLOWED", reviewWords["public.publicationReview.notAllowed"]], [404, "RUN_NOT_FOUND", pub["public.publication.changeUnauthorized"]], [503, "PUBLICATION_REVIEW_UNAVAILABLE", pub["public.publication.statusUnavailable"]]] as const) {
    const { host, root, api } = await mounted();
    api.requestPublicationReview.mockRejectedValue(new ContractHttpError(code, status, code, code));
    try {
      await proof(host);
      expect(host.textContent).toContain(message);
      const panel = host.querySelector(".publicationReviewPanel")!;
      expect(panel.querySelector("form")).toBeNull();
      expect([...panel.querySelectorAll("button")].filter(button => button.textContent === "Ask for approval")).toHaveLength(status === 409 ? 0 : 1);
    }
    finally { await unmount(root, host); }
  }
});
it("the Romanian catalogue renders its review words", async () => {
  const locales = ["ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "ga", "he", "hi", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "mt", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi", "zh"];
  for (const locale of locales) {
    const messages = JSON.parse(readFileSync(`${process.cwd()}/apps/ui/messages/${locale}/public.json`, "utf8")) as Record<string, string>;
    for (const key of Object.keys(reviewWords)) expect(messages[key], `${locale}: ${key}`).toBeTruthy();
  }
  const { host, root } = await mounted(flagged, ro as Record<string, string>);
  try { expect(host.textContent).toContain((ro as Record<string, string>)["public.publicationReview.askButton"]); expect(host.textContent).not.toContain("Ask for approval"); }
  finally { await unmount(root, host); }
});
it("resumed PUBLISH asks on FLAGGED, publishes on CLEAR, waits for the read and fails closed", async () => {
  const resumeProof = { status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action: "PUBLISH", target_run_id: run, token: "g".repeat(43), expires_at: new Date(Date.now() + 300000).toISOString() } };
  for (const [state, ask] of [[flagged, true], [clear, false]] as const) {
    let resolve!: (value: object) => void;
    const api = client(state); api.readPublicationReview.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { host, root } = await mount(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={catalog} locale="en" client={api as never} takeProof={() => resumeProof as never} />);
    try {
      expect(host.querySelector("input[type=checkbox]")).toBeNull();
      expect(host.textContent).not.toContain("Complete proof");
      await act(async () => resolve(state));
      expect(check(host).checked).toBe(false);
      expect(host.textContent).toContain(ask ? reviewWords["public.publicationReview.askWarning"] : pub["public.publication.publishWarning"]);
      await act(async () => check(host).click());
      await click(host, "Complete proof");
      expect(ask ? api.requestPublicationReview : api.publishRun).toHaveBeenCalledWith(run, "g".repeat(43));
      expect(ask ? api.publishRun : api.requestPublicationReview).not.toHaveBeenCalled();
    } finally { await unmount(root, host); }
  }
  const api = client(); api.readPublicationReview.mockRejectedValue(new Error("read failed"));
  const { host, root } = await mount(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={catalog} locale="en" client={api as never} takeProof={() => resumeProof as never} />);
  try { expect(host.textContent).toContain(pub["public.publication.statusUnavailable"]); expect(host.textContent).not.toContain("Complete proof"); }
  finally { await unmount(root, host); }
});
it("no element the panel or take-down control renders has an inline colour", async () => {
  const { host, root } = await mounted();
  const takeDown = await mount(<TakeDownControl runRef={run} homeCatalog={home} publicCatalog={catalog} client={client() as never} />);
  try {
    for (const container of [host, takeDown.host]) {
      expect([...container.querySelectorAll<HTMLElement>("*")].some((element) => /(?:^|;)\s*(?:color|background|border-color)\s*:/.test(element.getAttribute("style") ?? ""))).toBe(false);
    }
  } finally { await unmount(root, host); await unmount(takeDown.root, takeDown.host); }
});
