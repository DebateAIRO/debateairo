// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, QUESTION_NOT_STARTED, QUESTION_NOT_STARTED_KINDS, type QuestionNotStartedKind } from "@debateai/contract";
import { CRISIS_LINES } from "../../apps/ui/lib/crisisLines.js";
import home from "../../apps/ui/messages/en/home.json";
const catalog: Record<string, string> = home;

const roots: { root: Root; node: HTMLElement }[] = [];
afterEach(() => {
  for (const { root, node } of roots.splice(0)) { act(() => root.unmount()); node.remove(); }
  vi.restoreAllMocks();
});

function refusal(kind: QuestionNotStartedKind): ContractHttpError {
  return new ContractHttpError("UNPROCESSABLE", 422, QUESTION_NOT_STARTED, QUESTION_NOT_STARTED, null, null, null, { kind });
}
const unavailable = () => new ContractHttpError("SERVER_FAILURE", 503, "QUESTION_CHECK_UNAVAILABLE", "QUESTION_CHECK_UNAVAILABLE");

async function open(error: unknown, options: { country?: string | null; locale?: string } = {}) {
  const path = "../../apps/ui/components/QuestionRefusal.js";
  const module = await import(/* @vite-ignore */ path).catch(() => null);
  expect(module, "the refusal screen component is shipped").not.toBeNull();
  let offer: (failure: unknown) => boolean = () => false;
  function Harness() {
    const refusal = module!.useQuestionRefusal({ catalog: home, locale: options.locale ?? "en", countryHint: options.country ?? null });
    offer = refusal.offer;
    return <>{refusal.dialog}</>;
  }
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  roots.push({ root, node });
  await act(async () => root.render(<Harness />));
  let accepted = false;
  await act(async () => { accepted = offer(error); });
  return { node, accepted };
}

const part = (node: HTMLElement, name: string) => node.querySelector(`[data-part="${name}"]`);
const REFUSING_KINDS = QUESTION_NOT_STARTED_KINDS;
const KEPT_LABELS = ["HARM_TO_OTHERS", "WEAPONS_DRUGS_TERRORISM"] as const;

describe("question refusal screens", () => {
  it.each([...REFUSING_KINDS, "UNAVAILABLE"] as const)("places the opening words with the title for %s", async (kind) => {
    // Property: the opening words remain in the modal head, like the help screen's ledes.
    const { node } = await open(kind === "UNAVAILABLE" ? unavailable() : refusal(kind));
    const head = node.querySelector(".policyHeadText");
    expect(head?.querySelector('[data-part="not-started"].crisisSupportLede')).not.toBeNull();
    expect(head?.querySelector(kind === "UNAVAILABLE" ? '[data-part="try-again"].crisisSupportLede' : '[data-part="automatic"].crisisSupportLede')).not.toBeNull();
    expect(node.querySelector('.crisisSupportBody [data-part="not-started"]')).toBeNull();
  });
  it.each(REFUSING_KINDS)("renders parts 1-6 and only one button for %s", async (kind) => {
    const { node, accepted } = await open(refusal(kind), { country: "RO" });
    expect(accepted).toBe(true);
    expect(node.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    for (const name of ["not-started", "back", "automatic", "rule", "complain"]) expect(part(node, name), name).not.toBeNull();
    expect(part(node, "rule")?.textContent).toBe(catalog[`home.questionRefusal.rule.${kind}`]);
    expect(part(node, "complain")?.textContent).toContain(home["home.questionRefusal.months"]);
    expect(part(node, "complain")?.querySelector('a[href="mailto:office@dezbatere.ro"]')).not.toBeNull();
    expect(node.querySelectorAll("button")).toHaveLength(1);
    expect(node.querySelector("button")).toBe(part(node, "back"));
    expect([...node.querySelectorAll("a")].every((link) => link.hasAttribute("href"))).toBe(true);
    expect(node.querySelector(".policyEyebrow")).toBeNull();
  });

  it.each(KEPT_LABELS)("shows the kept line and no not-saved statement for %s", async (kind) => {
    const { node } = await open(refusal(kind));
    expect(part(node, "kept")?.textContent).toBe(home["home.questionRefusal.kept"]);
    expect(node.textContent).not.toContain(home["home.crisisSupport.notSaved"]);
  });

  it.each(["HATE_SPEECH", "RELIGIOUS_INSULT", "SENSITIVE_TOPIC"] as const)("does not show a kept line for %s", async (kind) => {
    const { node } = await open(refusal(kind));
    expect(part(node, "kept")).toBeNull();
  });

  it("shows Romania's emergency number on a harm-to-others refusal", async () => {
    const { node } = await open(refusal("HARM_TO_OTHERS"), { country: "RO" });
    expect(part(node, "emergency")?.textContent).toContain("112");
    expect(part(node, "emergency")?.querySelector('a[href="tel:112"]')).not.toBeNull();
  });

  it("shows the local-number instruction when no country resolves", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ar"]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("ar");
    const { node } = await open(refusal("HARM_TO_OTHERS"), { locale: "ar" });
    expect(part(node, "emergency")?.textContent).toBe(home["home.crisisSupport.emergencyAnywhere"]);
  });

  it("shows a GB fixture helpline only in GB", async () => {
    const path = "../../apps/ui/components/HarmHelpLine.js";
    const module = await import(/* @vite-ignore */ path).catch(() => null);
    expect(module).not.toBeNull();
    const HarmHelpLine = module!.HarmHelpLine;
    const fixture = { name: "Example line", phone: "0800 123 456", tel: "0800123456", website: "https://example.org", sourceUrl: "https://example.org/help", checkedAt: "2026-10-19", countries: ["GB"] };
    const node = document.createElement("div"); document.body.appendChild(node);
    const root = createRoot(node); roots.push({ root, node });
    await act(async () => root.render(<HarmHelpLine catalog={home} locale="en" country="GB" helpline={fixture} />));
    expect(part(node, "helpline")?.querySelector('a[href="tel:0800123456"]')).not.toBeNull();
    expect(part(node, "helpline")?.classList.contains("harmHelpLine")).toBe(true);
    await act(async () => root.render(<HarmHelpLine catalog={home} locale="en" country="RO" helpline={fixture} />));
    expect(part(node, "helpline")).toBeNull();
  });

  it("ships no harm helpline for any checked country", async () => {
    for (const country of Object.keys(CRISIS_LINES)) {
      const { node } = await open(refusal("HARM_TO_OTHERS"), { country });
      expect(part(node, "helpline"), country).toBeNull();
    }
  });

  it("shows only a help-number pointer for a sensitive topic", async () => {
    const { node } = await open(refusal("SENSITIVE_TOPIC"));
    expect(part(node, "help-numbers")?.tagName).toBe("A");
    expect(part(node, "help-numbers")?.getAttribute("href")).toBe("#");
    for (const name of ["emergency", "helpline", "kept"]) expect(part(node, name)).toBeNull();
  });

  it.each(["WEAPONS_DRUGS_TERRORISM", "HATE_SPEECH", "RELIGIOUS_INSULT"] as const)("does not show harm or help-number parts for %s", async (kind) => {
    const { node } = await open(refusal(kind));
    for (const name of ["emergency", "helpline", "help-numbers"]) expect(part(node, name)).toBeNull();
  });

  it("renders only the retry parts when checking is unavailable", async () => {
    const { node, accepted } = await open(unavailable());
    expect(accepted).toBe(true);
    for (const name of ["not-started", "back", "try-again", "help-numbers"]) expect(part(node, name)).not.toBeNull();
    for (const name of ["automatic", "rule", "complain", "kept", "emergency", "helpline"]) expect(part(node, name)).toBeNull();
    expect(node.querySelectorAll("button")).toHaveLength(1);
    expect(node.querySelector(".policyEyebrow")).toBeNull();
  });

  it("opens the existing help screen from the help-number link", async () => {
    const { node } = await open(unavailable());
    await act(async () => part(node, "help-numbers")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(node.querySelector('[data-dialog="question-refusal"]')).toBeNull();
    expect(node.querySelector('[data-dialog="crisis-support"]')).not.toBeNull();
  });

  it("declares the new classes with token-only colors", async () => {
    const { node } = await open(refusal("HARM_TO_OTHERS"), { country: "RO" });
    const css = readFileSync(join(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    for (const className of ["questionRefusal", "questionRefusalKept", "questionRefusalRule", "questionRefusalComplain", "harmHelpLine"]) {
      if (className !== "harmHelpLine") expect(node.querySelector(`.${className}`), className).not.toBeNull();
      const rule = css.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, "u"));
      expect(rule, className).not.toBeNull();
      expect(rule![1]).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/iu);
      for (const color of rule![1]!.matchAll(/(?:color|background|border-color):\s*([^;]+);/gu)) expect(color[1]).toMatch(/var\(--(?:ink|text-2|line|line-strong|link|focus)\)/u);
    }
  });
});
