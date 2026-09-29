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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  requests = [];
  respond = async () => Response.json(refusal, { status: 409 });
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
    if (path === "/v1/auth/step-up") return Response.json({
      status: "step_up_complete", csrf_token: "c".repeat(43),
      step_up_grant: { token: "g".repeat(43), action: "PUBLISH", target_run_id: runId, expires_at: "2026-09-29T20:00:00Z" }
    });
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
