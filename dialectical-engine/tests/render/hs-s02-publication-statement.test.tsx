// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContractClient } from "@debateai/contract";
import { PublicationControl } from "../../apps/ui/components/PublicationControl.js";
import english from "../../apps/ui/messages/en/public.json";
import romanian from "../../apps/ui/messages/ro/public.json";

// Independent oracle: SPEC-v2 R11, not values derived from the product catalog.
const copy = {
  refusedHeading: "We did not publish this debate",
  refusedWhatBlock: "An automated check found text in this debate that breaks our rules, so the debate was not published.",
  refusedWhatUnsure: "An automated check could not confirm that this debate follows our rules, so the debate was not published.",
  partsIntro: "Where the check found it:",
  "part.question": "The question",
  "part.summary": "The summary, verdict notes and remaining objections",
  "part.arguments": "The arguments",
  "part.reviews": "The reviewers' comments",
  "part.story": "The verdict story",
  groundTerms: "Ground: our Terms of Service, section 7 (no content that incites violence or hatred).",
  groundIllegal: "The text may also be illegal.",
  automated: "This decision was made by an automated tool. No person has reviewed it yet.",
  stillPrivate: "Your debate stays private and unchanged. Only you can see it.",
  appeal: "To ask a person to review this decision, write to [appeals@dezbatere.ro] within six months.",
  unavailable: "The content check is not available right now, so nothing was published. Your debate stays private. Try again in a few minutes."
};
const locales = ["ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "ga", "he", "hi", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "mt", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi", "zh"];
const prefix = "public.publication.contentCheck.";
const runId = "11111111-1111-4111-8111-111111111111";
const publicRef = "22222222-2222-4222-8222-222222222222";
const refusal = {
  error: "PUBLICATION_CONTENT_REFUSED",
  message: "The content check refused to publish this debate. It stays private.",
  statement: { outcome: "BLOCK", parts: ["QUESTION", "ARGUMENTS"], ground: "TERMS_AND_POSSIBLY_ILLEGAL", automated: true, visibility: "PRIVATE" }
};
let root: Root;
let host: HTMLDivElement;
let requests: { path: string; body: unknown }[];
let respond: () => Promise<Response>;
let respondStepUp: () => Promise<Response>;
const grantedStepUp = async () => Response.json({
  status: "step_up_complete", csrf_token: "c".repeat(43),
  step_up_grant: { token: "g".repeat(43), action: "PUBLISH", target_run_id: runId, expires_at: "2026-09-29T20:00:00Z" }
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  requests = [];
  respond = async () => Response.json(refusal, { status: 409 });
  respondStepUp = grantedStepUp;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(catalog: Record<string, string> = english) {
  const client = createContractClient("https://publication.invalid", (async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    requests.push({ path, body });
    if (path.endsWith("/visibility")) return Response.json({ state: "PRIVATE", public_ref: null });
    if (path === "/v1/auth/step-up") return respondStepUp();
    if (path.endsWith("/publish")) return respond();
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }) as typeof fetch);
  await act(async () => root.render(<PublicationControl runId={runId} client={client} catalog={catalog} />));
}
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((node) => node.textContent === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => button.click());
}
async function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function openAndSubmit(catalog: Record<string, string> = english) {
  await click(catalog["public.publication.publishEllipsis"]!);
  await fill('input[type="password"]', "test-password");
  await fill('input[autocomplete="one-time-code"]', "123456");
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await submit();
}
async function submit() {
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
function statementChildren() {
  return [...(host.querySelector('[role="status"]')?.children ?? [])].map((node) =>
    node.tagName === "UL" ? [...node.children].map((child) => child.textContent) : node.textContent);
}

describe("publication statement", () => {
  // Property: only the outcome's prescribed lines appear, in the prescribed order, with no extra content.
  it.each([
    ["BLOCK", "TERMS_AND_POSSIBLY_ILLEGAL"], ["BLOCK", "TERMS"], ["UNSURE", "TERMS"]
  ])("renders %s with %s", async (outcome, ground) => {
    respond = async () => Response.json({ ...refusal, statement: { ...refusal.statement, outcome, ground } }, { status: 409 });
    await mount();
    await openAndSubmit();
    expect(statementChildren()).toEqual([
      copy.refusedHeading, outcome === "BLOCK" ? copy.refusedWhatBlock : copy.refusedWhatUnsure,
      copy.partsIntro, [copy["part.question"], copy["part.arguments"]], copy.groundTerms,
      ...(ground === "TERMS_AND_POSSIBLY_ILLEGAL" ? [copy.groundIllegal] : []), copy.automated, copy.stillPrivate, copy.appeal
    ]);
    expect(host.querySelector('[role="status"] a')).toBeNull();
  });
  // Property: each part code is translated independently; all five labels can be shown.
  it("renders all five part labels", async () => {
    respond = async () => Response.json({ ...refusal, statement: { ...refusal.statement, parts: ["QUESTION", "SUMMARY", "ARGUMENTS", "REVIEWS", "STORY"] } }, { status: 409 });
    await mount(); await openAndSubmit();
    expect([...host.querySelectorAll('[role="status"] li')].map((node) => node.textContent)).toEqual([
      "The question", "The summary, verdict notes and remaining objections", "The arguments", "The reviewers' comments", "The verdict story"
    ]);
  });
  // Property: unavailable and unrelated failures show only their own single-line status.
  it.each([
    [503, { error: "PUBLICATION_CHECK_UNAVAILABLE", message: "PUBLICATION_CHECK_UNAVAILABLE" }, copy.unavailable],
    [404, { error: "RUN_NOT_FOUND" }, "Publication change was not authorized. Recheck your password and authenticator code."]
  ])("renders the single message for %s", async (status, body, message) => {
    respond = async () => Response.json(body, { status });
    await mount(); await openAndSubmit();
    expect([...host.querySelectorAll('[role="status"]')].map((node) => node.textContent)).toEqual([message]);
  });
  // Property (sd-N4): a failure the server did not attribute to the owner's credentials (5xx, no answer, an unreadable
  // answer, a step-up with no grant) never shows the wrong-password sentence; it shows the card's own status-unknown line.
  // Break caught: the catch-all mapping every non-statement, non-503-check failure to changeUnauthorized.
  const statusUnknown = "Publication status is unavailable.";
  it.each([
    ["publish 500 INTERNAL_ERROR (record write failed)", "publish", async () => Response.json({ error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" }, { status: 500 })],
    ["publish 502 from the proxy", "publish", async () => new Response("Bad Gateway", { status: 502 })],
    ["publish 503 without the check code", "publish", async () => Response.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 })],
    ["publish 504 at the proxy ceiling", "publish", async () => new Response("Gateway Timeout", { status: 504 })],
    ["publish never answers (network)", "publish", async () => { throw new TypeError("fetch failed"); }],
    ["publish 201 with an unreadable body", "publish", async () => Response.json({ unexpected: true }, { status: 201 })],
    ["step-up 500", "step-up", async () => Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })],
    ["step-up without a grant", "step-up", async () => Response.json({ status: "step_up_complete", csrf_token: "c".repeat(43) })]
  ] as const)("shows the status-unknown line, not the password sentence, for %s", async (_name, where, answer) => {
    if (where === "publish") respond = answer; else respondStepUp = answer;
    await mount(); await openAndSubmit();
    expect([...host.querySelectorAll('[role="status"]')].map((node) => node.textContent)).toEqual([statusUnknown]);
  });
  // Neighbour of sd-N4: a failure the server DID attribute to the request keeps today's sentence (R11 "any other failure").
  it.each([
    ["step-up 401 STEP_UP_REFUSED", "step-up", 401, "STEP_UP_REFUSED"],
    ["publish 403 FORBIDDEN", "publish", 403, "FORBIDDEN"],
    ["publish 429 RATE_LIMITED", "publish", 429, "RATE_LIMITED"]
  ] as const)("keeps the password sentence for %s", async (_name, where, status, error) => {
    const answer = async () => Response.json({ error }, { status });
    if (where === "publish") respond = answer; else respondStepUp = answer;
    await mount(); await openAndSubmit();
    expect([...host.querySelectorAll('[role="status"]')].map((node) => node.textContent)).toEqual([
      "Publication change was not authorized. Recheck your password and authenticator code."
    ]);
  });
  // Property (pt-B2): whatever the card has to say after an action (statement or one-line message) is its first content
  // after the visibility status line — before every control — so a height-capped card shows it without scrolling.
  // Break caught: the status slot rendered after the form and the delete section (the pre-fix order).
  function statusPrecedesEveryControl() {
    const card = host.querySelector("section.publicationControl")!;
    const status = card.querySelector('[role="status"]')!;
    const children = [...card.children];
    return {
      slot: children.indexOf(status),
      controlsBefore: [...card.querySelectorAll("button, form, input, h3")].filter((node) =>
        !status.contains(node) && (node.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).length
    };
  }
  it.each([
    ["BLOCK statement", async () => Response.json(refusal, { status: 409 })],
    ["check unavailable", async () => Response.json({ error: "PUBLICATION_CHECK_UNAVAILABLE" }, { status: 503 })],
    ["other failure", async () => Response.json({ error: "RUN_NOT_FOUND" }, { status: 404 })],
    ["server failure", async () => Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })]
  ] as const)("puts the %s before every control", async (_name, answer) => {
    respond = answer;
    await mount(); await openAndSubmit();
    expect(statusPrecedesEveryControl()).toEqual({ slot: 2, controlsBefore: 0 });
  });
  it("puts a failed deletion's message before every control", async () => {
    await mount();
    await click("Delete private debate…");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    respondStepUp = async () => Response.json({ error: "STEP_UP_REFUSED" }, { status: 401 });
    await submit();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Private debate deletion was not authorized. Recheck your credentials.");
    expect(statusPrecedesEveryControl()).toEqual({ slot: 2, controlsBefore: 0 });
  });
  // Property: successful publication still reports success and exposes the actual returned public link.
  it("renders success and the public link", async () => {
    respond = async () => Response.json({ state: "PUBLISHED", public_ref: publicRef }, { status: 201 });
    await mount(); await openAndSubmit();
    expect({ message: host.querySelector('[role="status"]')?.textContent, link: host.querySelector("a")?.getAttribute("href") }).toEqual({
      message: "Published. Anyone with the link can read it, and search engines may index it.", link: `/public/debate/${publicRef}`
    });
  });
  // Property: refusal preserves entered credentials and a fresh submit uses the newly entered code.
  it("keeps the form filled and reauthorizes a retry", async () => {
    await mount(); await openAndSubmit();
    expect([...host.querySelectorAll<HTMLInputElement>('form input')].map((input) => input.type === "checkbox" ? input.checked : input.value)).toEqual(["test-password", "123456", true]);
    await fill('input[autocomplete="one-time-code"]', "654321");
    await submit();
    expect(requests.filter(({ path }) => path === "/v1/auth/step-up").map(({ body }) => body)).toEqual([
      { password: "test-password", code: "123456", authorization: { action: "PUBLISH", target_run_id: runId } },
      { password: "test-password", code: "654321", authorization: { action: "PUBLISH", target_run_id: runId } }
    ]);
  });
  // Property: leaving the failed publication action dismisses its statement.
  it.each(["Cancel", "Delete private debate…"])("clears the statement on %s", async (action) => {
    await mount(); await openAndSubmit(); await click(action);
    expect(host.querySelector('[role="status"]')).toBeNull();
  });
  // Property: stale refusal text disappears immediately while another attempt is in flight.
  it("clears the statement at the start of a new submit", async () => {
    await mount(); await openAndSubmit();
    let finish!: (response: Response) => void;
    respond = () => new Promise((resolveResponse) => { finish = resolveResponse; });
    await submit();
    expect(host.querySelector('[role="status"]')).toBeNull();
    await act(async () => finish(Response.json({ error: "PUBLICATION_CHECK_UNAVAILABLE" }, { status: 503 })));
  });
  // Property: the component consumes the selected locale, not embedded English.
  it("renders the Romanian statement heading", async () => {
    await mount(romanian); await openAndSubmit(romanian);
    expect(host.querySelector('[role="status"] h3')?.textContent).toBe("Nu am publicat această dezbatere");
  });
});

describe("locales", () => {
  // Property: every locale has all 15 readable messages and preserves the literal appeal address.
  it.each(locales)("provides the full statement in %s", (locale) => {
    const catalog = JSON.parse(readFileSync(resolve(process.cwd(), `apps/ui/messages/${locale}/public.json`), "utf8")) as Record<string, string>;
    expect(Object.keys(copy).filter((key) => typeof catalog[prefix + key] !== "string" || catalog[prefix + key]!.trim() === "")).toEqual([]);
    expect(catalog[prefix + "appeal"]).toContain("[appeals@dezbatere.ro]");
  });
  // Property (pt-N1): the ground line names the Terms with the exact name the app's own Terms link uses in that locale
  // (`chrome.legal.terms`), compared case-insensitively in the locale (a capital letter mid-sentence is spelling, not a name).
  // Break caught: a locale calling the document "Terms of Use" while its footer link says "Terms of Service".
  it.each(locales)("names the Terms in the ground line as the footer link does in %s", (locale) => {
    const read = (namespace: string) => JSON.parse(readFileSync(resolve(process.cwd(), `apps/ui/messages/${locale}/${namespace}.json`), "utf8")) as Record<string, string>;
    const terms = read("chrome")["chrome.legal.terms"];
    expect(terms?.trim()).toBeTruthy();
    expect(read("public")[prefix + "groundTerms"]!.toLocaleLowerCase(locale)).toContain(terms!.toLocaleLowerCase(locale));
  });
  // Property: the authoritative English copy matches the SPEC, and Romanian has no untranslated message.
  it("uses the English oracle and translated Romanian values", () => {
    expect(Object.fromEntries(Object.keys(copy).map((key) => [key, (english as Record<string, string>)[prefix + key]]))).toEqual(copy);
    expect(Object.keys(copy).filter((key) => (romanian as Record<string, string>)[prefix + key] === (english as Record<string, string>)[prefix + key])).toEqual([]);
  });
});

describe("card is not clipped", () => {
  // Property: the live controls (not only the deletion tombstone) match the targeted un-clipping selector.
  it("marks the rendered visibility card", async () => {
    await mount();
    expect(host.querySelector("section[data-support-primary-control]")?.className).toBe("card publicationControl");
  });
  // Property: the specific card override beats every legacy clipping declaration before the consent block.
  it("overrides the seven clipping declarations before consent", () => {
    const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    const beforeConsent = css.slice(0, css.indexOf("/* === consent-ui S01 === */"));
    const body = beforeConsent.match(/\.debateView\s*>\s*section\.card\.publicationControl\s*\{([^}]+)\}/)?.[1] ?? "";
    const declarations = Object.fromEntries(body.split(";").filter((line) => line.includes(":")).map((line) => line.split(":").map((part) => part.trim())));
    expect(declarations).toEqual({ position: "static !important", width: "auto !important", height: "auto !important", overflow: "auto !important", clip: "auto !important", "clip-path": "none !important", "white-space": "normal !important", flex: "0 0 auto", "max-height": "45dvh", "box-sizing": "border-box", padding: "12px 18px", "border-top": "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text)" });
  });
});
