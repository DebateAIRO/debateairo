// @vitest-environment jsdom

/**
 * The bold lead-ins. The drafts open many paragraphs with a bold run ("**Delivery.**", "**Cancelling.**"), and that run
 * is how a reader finds the delivery or the cancellation paragraph in Terms section 12 by eye. The generated data
 * carries it as the paragraph's `lead`, and both the legal page and the sign-up modal draw it in <strong>, while the
 * paragraph's words stay exactly its `text`.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalDocumentBody } from "../../apps/ui/components/legal/LegalBodies.js";
import { TermsOfServiceModal } from "../../apps/ui/components/consent/TermsOfServiceModal.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import { TERMS_OF_SERVICE as TERMS_RO } from "../../apps/ui/lib/legal/ro/termsOfService.js";
import type { LegalDocument } from "../../apps/ui/lib/legalDocument.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function render(element: ReactElement): Promise<void> {
  await act(async () => {
    root!.render(element);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const paragraphs = (document: LegalDocument, no: string) =>
  document.sections.find((section) => section.no === no)!.blocks.flatMap((block) => (block.kind === "p" ? [block] : []));

describe("the bold lead-ins of the legal texts", () => {
  it.each([
    ["en", TERMS_OF_SERVICE, ["Cancelling.", "Delivery.", "Statutory rights first."]],
    ["ro", TERMS_RO, ["Anularea.", "Livrare.", "Drepturile legale au prioritate."]]
  ] as const)("%s: the terms page draws section 12's lead-ins bold, and the words stay the paragraph's text", async (_code, document, leads) => {
    await render(<LegalDocumentBody document={document} />);
    const section = container!.querySelector("#legal-section-12")!;
    const bold = [...section.querySelectorAll("p > strong")].map((node) => node.textContent);
    for (const lead of leads) expect(bold, lead).toContain(lead);
    const blocks = paragraphs(document, "12");
    const drawn = [...section.querySelectorAll("p")];
    expect(drawn.map((node) => node.textContent)).toEqual(blocks.map((block) => block.text));
    for (const [index, block] of blocks.entries()) {
      const strong = drawn[index]!.querySelectorAll("strong");
      // A paragraph with a lead draws exactly that run bold, first; one without draws nothing bold.
      if (block.lead === undefined) expect(strong, block.text.slice(0, 40)).toHaveLength(0);
      else {
        expect(strong, block.lead).toHaveLength(1);
        expect(drawn[index]!.firstChild).toBe(strong[0]);
        expect(strong[0]!.textContent).toBe(block.lead);
      }
    }
    // Section 12 opens with the free plan, a paragraph with no lead-in.
    expect(blocks[0]!.lead).toBeUndefined();
  });

  it("the sign-up modal draws the same lead-ins bold", async () => {
    await render(<TermsOfServiceModal open mode="read" onClose={vi.fn()} />);
    const section = document.getElementById("terms-section-12")!;
    const bold = [...section.querySelectorAll(".policyText > strong")].map((node) => node.textContent);
    expect(bold).toEqual(paragraphs(TERMS_OF_SERVICE, "12").flatMap((block) => (block.lead === undefined ? [] : [block.lead])));
    expect(bold).toEqual(expect.arrayContaining(["Cancelling.", "Delivery.", "Statutory rights first."]));
    expect([...section.querySelectorAll(".policyText")].map((node) => node.textContent))
      .toEqual(paragraphs(TERMS_OF_SERVICE, "12").map((block) => block.text));
  });
});
