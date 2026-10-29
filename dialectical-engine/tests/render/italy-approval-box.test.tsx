// @vitest-environment jsdom
/**
 * S01-C6 (mission italy-clause-approval, PLAN P20): the Italy approval box on its own.
 *
 * B1 the five clause titles come from the Terms headings in every one of the 35 legal locales; B2 the box is a
 * native, unticked checkbox named by its own <label>, and a click on that label ticks it; B3 an error makes it
 * aria-invalid and describes it; B4 exactly the two sign-up surfaces import it. B5 pins what V's DONE.md fixed
 * (2026-10-24): one clause per line, the number with no "§" in a bold tabular column, the title in a regular one,
 * spans only, and a visually hidden separator between clauses for screen readers.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ITALY_APPROVAL_CLAUSES } from "@debateai/kernel";
import { ItalyApprovalBox, italyClauseItems } from "../../apps/ui/components/auth/ItalyApprovalBox.js";
import type { LegalDocument } from "../../apps/ui/lib/legalDocument.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import english from "../../apps/ui/messages/en/auth.json";

const REPO = process.cwd();
const LEGAL_LOCALES = readdirSync(join(REPO, "apps/ui/legal"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "archive")
  .map((entry) => entry.name)
  .sort();

async function generatedTerms(locale: string): Promise<LegalDocument> {
  const module = (locale === "en"
    ? await import("../../apps/ui/lib/termsOfService.ts")
    : await import(`../../apps/ui/lib/legal/${locale}/termsOfService.ts`)) as { TERMS_OF_SERVICE: LegalDocument };
  return module.TERMS_OF_SERVICE;
}

let root: Root | null = null;

async function render(props: Readonly<{ checked?: boolean; error?: string | null; onChange?: (checked: boolean) => void }> = {}): Promise<void> {
  const container = document.createElement("div");
  container.className = "consentGroup";
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(
    <ItalyApprovalBox idPrefix="signup" catalog={english} terms={TERMS_OF_SERVICE} checked={props.checked ?? false}
      onChange={props.onChange ?? (() => undefined)} disabled={false} error={props.error ?? null}/>
  ));
}

function box(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[name="italy-approval"]');
  expect(input, "missing the Italy approval box").not.toBeNull();
  return input!;
}

function label(): HTMLLabelElement {
  const found = document.querySelector<HTMLLabelElement>('label[for="signup-italy-approval"]');
  expect(found, "missing the box's <label for>").not.toBeNull();
  return found!;
}

describe("the Italy approval box (S01-C6, P20)", () => {
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("B1 lists the Terms headings 11, 12, 14, 15 and 18 of each of the 35 legal locales, in clause order", async () => {
    expect(LEGAL_LOCALES).toHaveLength(35);
    for (const locale of LEGAL_LOCALES) {
      const markdown = readFileSync(join(REPO, `apps/ui/legal/${locale}/terms-of-service.md`), "utf8");
      const headings = [...markdown.matchAll(/^## (11|12|14|15|18)\. (.+)$/gm)]
        .map((match) => ({ number: Number(match[1]), title: match[2]! }));
      expect(headings.map((heading) => heading.number), `${locale} headings`).toEqual([...ITALY_APPROVAL_CLAUSES]);
      expect(italyClauseItems(await generatedTerms(locale)), locale).toEqual(headings);
    }
  });

  it("B2 is a native unticked checkbox named by its own label, and a click on the label ticks it", async () => {
    const onChange = vi.fn();
    await render({ onChange });
    const input = box();
    expect(input.type).toBe("checkbox");
    expect(input.name).toBe("italy-approval");
    expect(input.id).toBe("signup-italy-approval");
    expect(input.checked).toBe(false);
    expect(input.getAttribute("aria-labelledby")).toBe("signup-italy-approval-text");
    expect(input.hasAttribute("aria-label")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(label().id).toBe("signup-italy-approval-text");
    expect([...input.labels!]).toEqual([label()]);
    // The row is a .consentRow with the shared .consentBox, and holds no document button (Q4: Terms is plain text).
    const row = input.closest(".consentRow");
    expect(row).not.toBeNull();
    expect(input.classList.contains("consentBox")).toBe(true);
    expect(row!.querySelector("button")).toBeNull();
    await act(async () => label().click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("B3 an error makes the box aria-invalid and describes it with the message under the row", async () => {
    await render({ error: "x" });
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(box().getAttribute("aria-describedby")).toBe("signup-italy-approval-error");
    expect(document.querySelector("#signup-italy-approval-error")?.textContent).toBe("x");
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    await render();
    expect(box().getAttribute("aria-invalid")).toBe("false");
    expect(document.querySelector("#signup-italy-approval-error")).toBeNull();
  });

  it("B4 is imported by exactly the email sign-up and the social completion", () => {
    const importer = /from\s+['"][^'"]*\/ItalyApprovalBox(?:\.js)?['"]/;
    const importers: string[] = [];
    for (const top of ["apps/ui/components", "apps/ui/app"]) {
      for (const entry of readdirSync(join(REPO, top), { recursive: true, encoding: "utf8" })) {
        const path = `${top}/${entry.split("\\").join("/")}`;
        const name = path.slice(path.lastIndexOf("/") + 1);
        if (name.includes(".test.") || !/\.tsx?$/.test(name)) continue;
        if (importer.test(readFileSync(join(REPO, path), "utf8"))) importers.push(path);
      }
    }
    expect(importers.sort()).toEqual(["apps/ui/components/SignUpFlow.tsx", "apps/ui/components/auth/SocialCompleteFlow.tsx"]);
  });

  it("B5 shows one clause per line as spans: the number with no § in its own column, then the title", async () => {
    await render();
    const list = label().querySelector(".consentClauseList");
    expect(list?.tagName).toBe("SPAN");
    expect(label().querySelector("ul, ol, li, p, div")).toBeNull();
    const clauses = [...list!.querySelectorAll<HTMLElement>(":scope > .consentClause")];
    expect(clauses.map((clause) => clause.dataset.clause)).toEqual(ITALY_APPROVAL_CLAUSES.map(String));
    const titles = italyClauseItems(TERMS_OF_SERVICE);
    clauses.forEach((clause, index) => {
      expect(clause.tagName).toBe("SPAN");
      const number = clause.querySelector(":scope > .consentClauseNumber");
      expect(number?.textContent, "the number column holds the number alone").toBe(String(ITALY_APPROVAL_CLAUSES[index]));
      const title = clause.querySelector<HTMLElement>(":scope > .consentClauseTitle");
      // The hidden separator sits inside the title cell after every title but the last.
      const hidden = [...title!.querySelectorAll(".srOnly")];
      expect(hidden.map((node) => node.textContent)).toEqual(index < clauses.length - 1 ? [english["auth.signUp.italyApprovalClauseSeparator"]] : []);
      expect(title!.textContent!.slice(0, title!.textContent!.length - (hidden[0]?.textContent?.length ?? 0)).trim()).toBe(titles[index]!.title);
    });
    expect(label().textContent).not.toContain("§");
  });

  it("B5 the stylesheet rules that match the rendered list lay it out as V's measured grid, numbers bold and tabular", async () => {
    await render();
    // Render tests have no CSS: the app's stylesheet is read through jsdom's CSSOM, and only the rules that
    // match the rendered elements count (the auth-ui-styling idiom).
    const style = document.createElement("style");
    style.textContent = readFileSync(join(REPO, "apps/ui/app/globals.css"), "utf8");
    document.head.append(style);
    const rules = [...style.sheet!.cssRules].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
    const declared = (element: Element, property: string): string[] => rules
      .filter((rule) => { try { return element.matches(rule.selectorText); } catch { return false; } })
      .map((rule) => rule.style.getPropertyValue(property))
      .filter(Boolean);
    try {
      const list = label().querySelector(".consentClauseList")!;
      expect(declared(list, "display")).toEqual(["grid"]);
      expect(declared(list, "grid-template-columns")).toEqual(["max-content minmax(0, 1fr)"]);
      expect(declared(list, "column-gap")).toEqual(["6px"]);
      expect(declared(list, "row-gap").map((value) => value.replace(/px$/, ""))).toEqual(["0"]);
      expect(declared(list, "margin-top")).toEqual(["5px"]);
      for (const clause of list.querySelectorAll(".consentClause")) expect(declared(clause, "display")).toEqual(["contents"]);
      const number = list.querySelector(".consentClauseNumber")!;
      expect(declared(number, "font-weight")).toEqual(["700"]);
      expect(declared(number, "font-variant-numeric")).toEqual(["tabular-nums"]);
      expect(declared(list.querySelector(".consentClauseTitle")!, "font-weight")).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
