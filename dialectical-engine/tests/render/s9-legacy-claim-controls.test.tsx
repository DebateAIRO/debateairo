// @vitest-environment jsdom

import { act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContractClient } from "@debateai/contract";
import { LegacyRunClaimControls as UiLegacyRunClaimControls } from "../../apps/ui/components/LegacyRunClaimControls.js";

type ClaimClient = Pick<ContractClient, "claimLegacyRuns">;
type ClaimControl = ComponentType<{ readonly client?: ClaimClient }>;

const surfaces: ReadonlyArray<readonly [string, ClaimControl]> = [
  ["apps/ui", UiLegacyRunClaimControls]
];

let root: Root | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe.each(surfaces)("S9 rendered legacy claim control — %s", (_surface, Control) => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("clears the proof before awaiting and reports the exact claimed count", async () => {
    let resolveClaim!: (value: { status: "CLAIMED"; claimed_count: number }) => void;
    const pending = new Promise<{ status: "CLAIMED"; claimed_count: number }>((resolve) => {
      resolveClaim = resolve;
    });
    const claimLegacyRuns = vi.fn(() => pending);
    root = createRoot(document.body.firstElementChild!);
    await act(async () => root!.render(<Control client={{ claimLegacyRuns }} />));
    const input = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    const proof = "legacy-browser-proof-must-not-remain-mounted";
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, proof);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = input.closest("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(claimLegacyRuns).toHaveBeenCalledWith(proof);
    expect(input.value).toBe("");
    expect(document.body.textContent).not.toContain(proof);
    await act(async () => resolveClaim({ status: "CLAIMED", claimed_count: 2 }));
    await settle();
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "2 legacy debates added to this account."
    );
  });

  it("keeps an unmatched proof opaque and offers no browser persistence", async () => {
    const claimLegacyRuns = vi.fn(async () => ({ status: "NO_MATCH" as const, claimed_count: 0 }));
    root = createRoot(document.body.firstElementChild!);
    await act(async () => root!.render(<Control client={{ claimLegacyRuns }} />));
    const input = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "unmatched-legacy-proof");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(document.body.textContent).toContain("No unclaimed legacy debates matched that token.");
    expect(document.body.textContent).not.toContain("unmatched-legacy-proof");
  });
});

it("mounts the claim control on the settings page without a browser persistence or logging sink", async () => {
  const paths = [
    "apps/ui/components/LegacyRunClaimControls.tsx",
    "apps/ui/app/settings/page.tsx"
  ];
  const [control, settings] = await Promise.all(
    paths.map((path) => readFile(resolve(process.cwd(), path), "utf8"))
  );
  expect(settings).toContain("<LegacyRunClaimControls");
  expect(`${control}\n${settings}`).not.toMatch(/localStorage|sessionStorage|console\./);
});
