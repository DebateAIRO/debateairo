// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { CancelFlow, type CancelClient } from "../../apps/ui/components/billing/CancelFlow.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const TOKEN = "T".repeat(43);
let container: HTMLDivElement;
let root: Root;
let client: { requestCancelLink: ReturnType<typeof vi.fn>; cancelByToken: ReturnType<typeof vi.fn> };

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = {
    requestCancelLink: vi.fn(async () => ({ status: "ACCEPTED" as const })),
    cancelByToken: vi.fn(async () => undefined)
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, "", "/");
});

async function settle(): Promise<void> {
  for (let hop = 0; hop < 4; hop += 1) await act(async () => { await Promise.resolve(); });
}
async function render(): Promise<void> {
  await act(async () => { root.render(<CancelFlow catalog={billingEnglish} client={client as unknown as CancelClient} />); });
  await settle();
}
const button = (label: string) => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);

describe("P21 /cancel without signing in (Terms §12, A25)", () => {
  it("sends a link for any address and says the same thing whether or not a plan exists", async () => {
    await render();
    const input = container.querySelector<HTMLInputElement>("#cancel-email")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, " person@example.test ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button("Send the link")!.click(); });
    await settle();
    expect(client.requestCancelLink).toHaveBeenCalledWith("person@example.test");
    expect(container.textContent).toContain("If a plan exists for this address, we've sent a link. It works once, for 24 hours.");
  });

  it("opening the emailed link cancels nothing; only the button does, and the token leaves the address bar", async () => {
    window.history.replaceState(null, "", `/cancel#token=${TOKEN}`);
    await render();
    expect(window.location.hash).toBe("");
    expect(client.cancelByToken).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Cancel your plan now?");
    // The page cannot know the plan's state (cancel-by-token answers 204 with no body), so it states both cases
    // before the irreversible press: an overdue payment ends the plan now (D6b's requestCancelLocked).
    expect(container.textContent).toContain("If a payment is overdue, your plan ends now.");
    await act(async () => { button("Cancel my plan")!.click(); });
    await settle();
    expect(client.cancelByToken).toHaveBeenCalledWith(TOKEN);
    expect(container.textContent).toContain("Your plan is cancelled and you won't be charged again.");
    // The access end date is M7's to name ("until {date}" or "ended on {date}"); the page promises none.
    expect(container.textContent).not.toContain("You keep it until");
  });

  it("an expired or used link says so and offers a new one", async () => {
    client.cancelByToken.mockRejectedValue(new ContractHttpError("NOT_FOUND", 404, "x", "CANCEL_LINK_INVALID"));
    window.history.replaceState(null, "", `/cancel#token=${TOKEN}`);
    await render();
    await act(async () => { button("Cancel my plan")!.click(); });
    await settle();
    expect(container.textContent).toContain("This link has expired or was already used. Ask for a new one below.");
    expect(container.querySelector("#cancel-email")).not.toBeNull();
  });

  it("a link that cancelled nothing says only that, points to Settings and keeps the email form (W10, P2-M18)", async () => {
    // NOTHING_TO_CANCEL folds three states: a cancel already pending (on an ACTIVE, PAST_DUE or, since P2-W10, a
    // SUSPENDED plan), a plan that ended and a newer plan in the token's place. The sentence must hold for all three, so
    // it never says the account has no plan.
    client.cancelByToken.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 409, "x", "NOTHING_TO_CANCEL"));
    window.history.replaceState(null, "", `/cancel#token=${TOKEN}`);
    await render();
    await act(async () => { button("Cancel my plan")!.click(); });
    await settle();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("This link didn't cancel anything. Check your plan in Settings.");
    expect(container.textContent).not.toContain("no plan left");
    expect(container.querySelector("#cancel-email")).not.toBeNull();
    expect(container.querySelector('a[href="/settings"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Your plan is cancelled");
    expect(container.textContent).not.toContain("won't be charged again");
    // The token is spent: no button to press again.
    expect(button("Cancel my plan")).toBeUndefined();
  });

  it("words the hourly limit with its own sentence, for the link and for the button (W10, P2-M19)", async () => {
    const limited = () => new ContractHttpError("RATE_LIMITED", 429, "x", "ADMISSION_RATE_LIMITED");
    client.requestCancelLink.mockRejectedValueOnce(limited());
    await render();
    const input = container.querySelector<HTMLInputElement>("#cancel-email")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "person@example.test");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { button("Send the link")!.click(); });
    await settle();
    expect(container.textContent).toContain("Too many tries in the last hour. Please try again later.");
    expect(container.textContent).not.toContain("Something went wrong");
    act(() => root.unmount());
    root = createRoot(container);
    client.cancelByToken.mockRejectedValueOnce(limited());
    window.history.replaceState(null, "", `/cancel#token=${TOKEN}`);
    await render();
    await act(async () => { button("Cancel my plan")!.click(); });
    await settle();
    expect(container.textContent).toContain("Too many tries in the last hour. Please try again later.");
    // Nothing was spent: the same button may be pressed again later.
    expect(button("Cancel my plan")).toBeDefined();
  });

  it("a failure that is not the link's keeps the button, so the person can press it again", async () => {
    client.cancelByToken.mockRejectedValueOnce(new ContractHttpError("NETWORK_FAILURE", 0, "x"));
    window.history.replaceState(null, "", `/cancel#token=${TOKEN}`);
    await render();
    await act(async () => { button("Cancel my plan")!.click(); });
    await settle();
    expect(container.textContent).toContain("Something went wrong. Please try again.");
    await act(async () => { button("Cancel my plan")!.click(); });
    await settle();
    expect(client.cancelByToken).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Your plan is cancelled and you won't be charged again.");
  });

  it("ignores a fragment that is not a token", async () => {
    window.history.replaceState(null, "", "/cancel#token=short");
    await render();
    expect(container.textContent).not.toContain("Cancel your plan now?");
  });
});
