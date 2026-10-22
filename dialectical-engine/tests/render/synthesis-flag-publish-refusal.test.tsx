// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { PublicationControl } from "../../apps/ui/components/PublicationControl";
import { SecurityActionResume } from "../../apps/ui/components/auth/SecurityActionResume";
import publicCatalog from "../../apps/ui/messages/en/public.json";

vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en" }) }));
vi.mock("@/components/AuthShell", () => ({ useSelectedAuthCatalog: () => ({}) }));
vi.mock("@/lib/securityConfirmation", async (original) => ({ ...(await original()), matchingSecurityGrant: () => true }));
vi.mock("@/components/auth/SecurityConfirmation", () => ({ SecurityConfirmation: ({ onConfirmed, authorization }: {
  onConfirmed: (proof: unknown) => void; authorization: Record<string, unknown>
}) => <button type="button" data-confirm onClick={() => onConfirmed({ step_up_grant: {
  ...authorization, token: "test-token", expires_at: new Date(Date.now() + 600_000).toISOString()
} })}>Confirm</button> }));

function refusal(status: number, serverCode: string): ContractHttpError {
  return Object.assign(Object.create(ContractHttpError.prototype), { status, serverCode, statement: null });
}

function setup(publishRun: () => Promise<unknown>, onRemovedByCheck = vi.fn(),
  readRunVisibility: () => Promise<unknown> = async () => ({ state: "PRIVATE", public_ref: null })) {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const client = { readRunVisibility, readPublicationReview: async () => ({
    flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null
  }), publishRun,
    unpublishRun: async () => ({ state: "PRIVATE", public_ref: null }), deletePrivateDebate: async () => ({ status: "CLEANED" }) };
  return { node, root, client, onRemovedByCheck, cleanup: () => { act(() => root.unmount()); node.remove(); } };
}

async function publish(flow: ReturnType<typeof setup>) {
  await act(async () => { flow.root.render(<PublicationControl runId="run-1" client={flow.client as never}
    catalog={publicCatalog} onRemovedByCheck={flow.onRemovedByCheck} />); });
  act(() => { [...flow.node.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Publish…"))?.click(); });
  act(() => { flow.node.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click(); });
  act(() => { flow.node.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { flow.node.querySelector<HTMLButtonElement>("[data-confirm]")?.click(); });
}

afterEach(() => { document.body.innerHTML = ""; });

describe("S01 publication refusal", () => {
  it("shows the approval sentence for a 409 approval requirement", async () => {
    const flow = setup(async () => { throw refusal(409, "PUBLICATION_APPROVAL_REQUIRED"); });
    await publish(flow);
    expect(flow.node.textContent).toContain("This debate needs our approval before it can be published.");
    expect(flow.node.textContent).not.toContain("Publication change was not authorized");
    flow.cleanup();
  });

  it("shows the same approval sentence after a resumed publish", async () => {
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const proof = { step_up_grant: { action: "PUBLISH", target_run_id: "run-1", token: "test-token",
      expires_at: new Date(Date.now() + 600_000).toISOString() } };
    await act(async () => { root.render(<SecurityActionResume catalog={{}} settingsCatalog={{}}
      publicCatalog={publicCatalog} locale="en" takeProof={() => proof as never}
      client={{ readPublicationReview: async () => ({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null }), publishRun: async () => { throw refusal(409, "PUBLICATION_APPROVAL_REQUIRED"); } } as never} />); });
    act(() => { node.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click(); });
    await act(async () => { node.querySelector<HTMLButtonElement>("[data-confirm]")?.click(); });
    expect(node.textContent).toContain("This debate needs our approval before it can be published.");
    act(() => root.unmount());
    node.remove();
  });

  it("routes a resumed Publish removal to the debate's once-only notice", async () => {
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node);
    const onRemovedByCheck = vi.fn();
    const proof = { step_up_grant: { action: "PUBLISH", target_run_id: "run-1", token: "test-token",
      expires_at: new Date(Date.now() + 600_000).toISOString() } };
    await act(async () => { root.render(<SecurityActionResume catalog={{}} settingsCatalog={{}}
      publicCatalog={publicCatalog} locale="en" takeProof={() => proof as never}
      onRemovedByCheck={onRemovedByCheck}
      client={{ readPublicationReview: async () => ({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null }), publishRun: async () => { throw refusal(410, "DEBATE_REMOVED_BY_CHECK"); } } as never} />); });
    act(() => { node.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click(); });
    await act(async () => { node.querySelector<HTMLButtonElement>("[data-confirm]")?.click(); });
    expect(onRemovedByCheck).toHaveBeenCalledWith("run-1");
    act(() => root.unmount()); node.remove();
  });

  it("keeps the existing unavailable sentence for a 503", async () => {
    const flow = setup(async () => { throw refusal(503, "PUBLICATION_CHECK_UNAVAILABLE"); });
    await publish(flow);
    expect(flow.node.textContent).toContain("The content check is not available right now");
    flow.cleanup();
  });

  it("uses the checking debate label during a pending Publish", async () => {
    let complete: ((value: unknown) => void) | undefined;
    let visible: ((value: unknown) => void) | undefined;
    const flow = setup(() => new Promise((resolve) => { complete = resolve; }), vi.fn(),
      () => new Promise((resolve) => { visible = resolve; }));
    await act(async () => { flow.root.render(<PublicationControl runId="run-1" client={flow.client as never} catalog={publicCatalog} />); });
    expect(flow.node.textContent).toContain("Checking visibility…");
    await act(async () => { visible?.({ state: "PRIVATE", public_ref: null }); });
    act(() => { [...flow.node.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Publish…"))?.click(); });
    act(() => { flow.node.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click(); });
    act(() => { flow.node.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    act(() => { flow.node.querySelector<HTMLButtonElement>("[data-confirm]")?.click(); });
    expect(flow.node.textContent).toContain("Checking the debate…");
    await act(async () => { complete?.({ state: "PUBLISHED", public_ref: "ref-1" }); });
    flow.cleanup();
  });

  it("calls the removal callback on a 410 without showing a refusal message", async () => {
    const flow = setup(async () => { throw refusal(410, "DEBATE_REMOVED_BY_CHECK"); });
    await publish(flow);
    expect(flow.onRemovedByCheck).toHaveBeenCalledTimes(1);
    expect(flow.node.textContent).not.toContain("Publication change was not authorized");
    flow.cleanup();
  });
});
