// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  // Property (ui-B1): after ANY answer the answer's first line is inside the card's visible box, whatever the card's
  // scroll position was when the owner pressed the button (first attempt, retry in place, card scrolled to its end).
  // A layout model stands in for the browser (jsdom has none): every top-level child of the card is 100 px tall, the card
  // box starts at y = 500 and shows 380 px. The real geometry is measured by the p2 ui-product drive harness.
  // Break caught: submit()/deletePrivate() leaving the card's scroll where the owner left it (the pass-1 state).
  function cardLayoutModel() {
    const card = host.querySelector<HTMLElement>("section.publicationControl")!;
    let scrollTop = 0;
    Object.defineProperty(card, "scrollTop", { configurable: true, get: () => scrollTop, set: (value: number) => { scrollTop = Math.max(0, value); } });
    const CARD_TOP = 500, CARD_VISIBLE = 380, ROW = 100;
    const rect = (top: number) => ({ top, bottom: top + ROW, left: 0, right: 390, width: 390, height: ROW, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this === card) return { ...rect(CARD_TOP), bottom: CARD_TOP + CARD_VISIBLE, height: CARD_VISIBLE } as DOMRect;
      const row = [...card.children].findIndex((child) => child === this || child.contains(this));
      return rect(row < 0 ? 0 : CARD_TOP + row * ROW - scrollTop);
    });
    return {
      scrollTo: (value: number) => { scrollTop = value; },
      answerTopInView: () => {
        const top = card.querySelector('[role="status"]')!.getBoundingClientRect().top;
        return top >= CARD_TOP && top + 24 <= CARD_TOP + CARD_VISIBLE;
      },
      restore: () => spy.mockRestore()
    };
  }
  it.each([
    ["BLOCK statement", async () => Response.json(refusal, { status: 409 })],
    ["check unavailable", async () => Response.json({ error: "PUBLICATION_CHECK_UNAVAILABLE" }, { status: 503 })],
    ["other failure", async () => Response.json({ error: "STEP_UP_REQUIRED" }, { status: 401 })],
    ["server failure", async () => Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })],
    ["success", async () => Response.json({ state: "PUBLISHED", public_ref: publicRef }, { status: 201 })]
  ] as const)("brings the %s into the card's view from the owner's scroll position, first attempt and retry", async (_name, answer) => {
    await mount();
    const layout = cardLayoutModel();
    try {
      await click("Publish…");
      await fill('input[type="password"]', "test-password");
      await fill('input[autocomplete="one-time-code"]', "123456");
      await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      layout.scrollTo(600); // the owner scrolled the card down to reach "Publish publicly"
      respond = async () => Response.json(refusal, { status: 409 });
      await submit();
      const first = layout.answerTopInView();
      layout.scrollTo(900); // R11's retry in place: the owner scrolls down to the code field and the button again
      respond = answer;
      await fill('input[autocomplete="one-time-code"]', "654321");
      await submit();
      expect({ first, retry: layout.answerTopInView() }).toEqual({ first: true, retry: true });
    } finally { layout.restore(); }
  });
  it("brings a failed deletion's message into the card's view", async () => {
    await mount();
    const layout = cardLayoutModel();
    try {
      await click("Delete private debate…");
      await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
      respondStepUp = async () => Response.json({ error: "STEP_UP_REFUSED" }, { status: 401 });
      layout.scrollTo(700);
      await submit();
      expect(layout.answerTopInView()).toBe(true);
    } finally { layout.restore(); }
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
  // Property (ui-N2, ui-p3 N2): the ground line cites section 7 and no other number, and section 7 of that locale's own
  // Terms of Service IS the acceptable-use section the line paraphrases (not merely "some section 7"). Oracle: the
  // acceptable-use heading of each locale's Terms, hand-read at 333d79e0b (every title below means "acceptable use").
  // Breaks caught: a locale citing section 8 (mutant-section7.zsh) · a Terms edit that moves acceptable use away from
  // section 7 or swaps the 7/8 headings (the p3 lens's tosswap mutant) while the statement still cites 7.
  const ACCEPTABLE_USE: Record<string, string> = {
    ar: "الاستخدام المقبول", bg: "Допустима употреба", cs: "Přijatelné užívání", da: "Acceptabel brug", de: "Zulässige Nutzung",
    el: "Αποδεκτή χρήση", en: "Acceptable use", es: "Uso aceptable", et: "Lubatud kasutus", fi: "Hyväksyttävä käyttö",
    fr: "Utilisation acceptable", ga: "Úsáid inghlactha", he: "שימוש מקובל", hi: "स्वीकार्य उपयोग", hr: "Prihvatljiva uporaba",
    hu: "Elfogadható használat", id: "Penggunaan yang dapat diterima", it: "Uso consentito", ja: "許容される利用", ko: "허용되는 이용",
    lt: "Priimtinas naudojimas", lv: "Pieņemama lietošana", mt: "Użu aċċettabbli", nl: "Toegestaan gebruik", pl: "Dozwolone korzystanie",
    pt: "Utilização aceitável", ro: "Utilizarea acceptabilă", ru: "Допустимое использование", sk: "Prijateľné používanie", sl: "Dopustna uporaba",
    sv: "Tillåten användning", tr: "Kabul edilebilir kullanım", uk: "Допустиме використання", vi: "Sử dụng được chấp nhận", zh: "可接受使用"
  };
  it.each(locales)("cites section 7 of that locale's Terms, the acceptable-use section, in %s", (locale) => {
    const ground = (JSON.parse(readFileSync(resolve(process.cwd(), `apps/ui/messages/${locale}/public.json`), "utf8")) as Record<string, string>)[prefix + "groundTerms"]!;
    const terms = readFileSync(resolve(process.cwd(), `apps/ui/legal/${locale}/terms-of-service.md`), "utf8");
    const headingOf = (title: string) => /^## (\d+)\. (.+)$/mu.exec(terms.split("\n").find((line) => line.endsWith(` ${title}`) && line.startsWith("## ")) ?? "")?.[1];
    expect({ numbers: ground.match(/\p{Nd}+/gu), acceptableUseSection: headingOf(ACCEPTABLE_USE[locale]!) }).toEqual({ numbers: ["7"], acceptableUseSection: "7" });
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
  // Property (ui-N1): inside the Visibility card, every text control (button, typed input) paints its OWN background and
  // text from one token pair, and that pair reaches 4.5 : 1 in light (:root) and dark (html[data-mode="chamber"]); the rule
  // is scoped to the card, never the global control rule other pages use. Break caught: controls left on the user agent's
  // white/grey background with the dark theme's inherited near-white text (1.04–1.20 : 1). Geometry-free; the rendered
  // colours are measured by the p2 ui-product controls-contrast harness in headless Chromium.
  it("gives the card's controls a token pair that reaches 4.5 : 1 in both modes, scoped to the card", () => {
    const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    const block = css.slice(css.indexOf("/* hate-speech S02: the owner's Visibility card"), css.indexOf("/* === consent-ui S01 === */")).replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...block.matchAll(/([^{}]+)\{([^}]+)\}/g)].map(([, selector, body]) => ({ selector: selector!.replace(/\/\*[\s\S]*?\*\//g, "").trim(),
      decl: Object.fromEntries(body!.split(";").filter((line) => line.includes(":")).map((line) => { const i = line.indexOf(":"); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; })) }));
    const controls = rules.filter(({ selector }) => /button/.test(selector) && /input/.test(selector));
    const tokens = (open: string) => { const at = css.indexOf(open); return Object.fromEntries([...css.slice(at, css.indexOf("\n}", at)).matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(([, k, v]) => [k, v])); };
    const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x! + 0.05) / (y! + 0.05); };
    const pair = (decl: Record<string, string>, mode: Record<string, string>) => [decl.color, decl.background].map((value) => mode[/var\((--[\w-]+)\)/.exec(value ?? "")?.[1] ?? ""] ?? "missing");
    expect(controls.map(({ selector, decl }) => {
      const [lightFg, lightBg] = pair(decl, tokens(":root {"));
      const [darkFg, darkBg] = pair(decl, tokens('html[data-mode="chamber"] {'));
      return { scoped: selector.split(",").every((part) => part.trim().startsWith(".debateView > section.card.publicationControl ")),
        light: ratio(lightFg!, lightBg!) >= 4.5, dark: ratio(darkFg!, darkBg!) >= 4.5 };
    })).toEqual([{ scoped: true, light: true, dark: true }]);
  });
  // Property: the specific card override beats every legacy clipping declaration before the consent block.
  it("overrides the seven clipping declarations before consent", () => {
    const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    const beforeConsent = css.slice(0, css.indexOf("/* === consent-ui S01 === */"));
    const body = beforeConsent.match(/\.debateView\s*>\s*section\.card\.publicationControl\s*\{([^}]+)\}/)?.[1] ?? "";
    const declarations = Object.fromEntries(body.split(";").filter((line) => line.includes(":")).map((line) => line.split(":").map((part) => part.trim())));
    // V-19: `position: sticky` (not static) + `bottom: 0` (the column's effective bottom padding is 0) keeps the whole card inside
    // the 100dvh overflow:hidden column when the siblings above it (story strip, language offer) leave no room;
    // `flex: 0 1 auto` + `min-height` lets it shrink first. The geometry is measured by the p3 reach-p3.mjs probe.
    expect(declarations).toEqual({ position: "sticky !important", bottom: "0", "z-index": "1", width: "auto !important", height: "auto !important", overflow: "auto !important", clip: "auto !important", "clip-path": "none !important", "white-space": "normal !important", flex: "0 1 auto", "min-height": "min(6rem, 25dvh)", "max-height": "45dvh", "box-sizing": "border-box", padding: "12px 18px", "border-top": "1px solid var(--line)", background: "var(--surface-2)", color: "var(--text)" });
  });
  // Property (ui-p3 N1): the card's typed text fields keep a visible boundary — their border colour reaches WCAG 1.4.11's
  // 3 : 1 against the card's background in both modes. Break caught: a border token at 1.47 / 1.63 : 1 (--line-strong).
  it("gives the card's text fields a 3 : 1 boundary against the card in both modes", () => {
    const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    const block = css.slice(css.indexOf("/* hate-speech S02: the owner's Visibility card"), css.indexOf("/* === consent-ui S01 === */")).replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...block.matchAll(/([^{}]+)\{([^}]+)\}/g)].map(([, selector, body]) => ({ selector: selector!.replace(/\/\*[\s\S]*?\*\//g, "").trim(),
      decl: Object.fromEntries(body!.split(";").filter((line) => line.includes(":")).map((line) => { const i = line.indexOf(":"); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; })) }));
    // the LAST declaration of border-color (or border) that applies to the card's text inputs wins, as in the cascade
    let border = ""; for (const { selector, decl } of rules) if (/input:not\(\[type="checkbox"\]\)/.test(selector)) border = decl["border-color"] ?? /var\(--[\w-]+\)/.exec(decl.border ?? "")?.[0] ?? border;
    const cardBg = rules.find(({ selector }) => selector === ".debateView > section.card.publicationControl")!.decl.background!;
    // token values: #rrggbb, or rgba(r,g,b,a) composited over the card background (the --line* tokens are translucent)
    const tokens = (open: string) => { const at = css.indexOf(open); return Object.fromEntries([...css.slice(at, css.indexOf("\n}", at)).matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6}|rgba\([^)]*\))/g)].map(([, k, v]) => [k, v])); };
    const rgb = (value: string, under?: number[]): number[] => { if (value.startsWith("#")) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
      const [r, g, b, a] = value.slice(5, -1).split(",").map(Number); return [r!, g!, b!].map((c, i) => c * a! + under![i]! * (1 - a!)); };
    const lum = (c: number[]) => { const [r, g, b] = c.map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
    const name = (value: string) => /var\((--[\w-]+)\)/.exec(value)?.[1] ?? "";
    const boundary = (mode: Record<string, string>) => { const bg = rgb(mode[name(cardBg)]!); const line = mode[name(border)]; if (!line) return 0;
      const [x, y] = [lum(rgb(line, bg)), lum(bg)].sort((m, n) => n - m); return Math.round(((x! + 0.05) / (y! + 0.05)) * 100) / 100; };
    const measured = { light: boundary(tokens(":root {")), dark: boundary(tokens('html[data-mode="chamber"] {')) };
    expect({ light: measured.light >= 3, dark: measured.dark >= 3, measured }).toEqual({ light: true, dark: true, measured });
  });
});
