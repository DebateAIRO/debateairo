// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChargeStatusPoller } from "../../apps/ui/components/billing/ChargeStatusPoller.js";
import billingEnglish from "../../apps/ui/messages/en/billing.json" with { type: "json" };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function mount(getBillingCharge: ReturnType<typeof vi.fn>): Promise<void> {
  await act(async () => {
    root.render(
      <ChargeStatusPoller chargeRef="0123456789abcdef0123456789abcdef" catalog={billingEnglish}
        client={{ getBillingCharge }} successText="PAID" failureText="REFUSED" />
    );
  });
}

describe("P19 the waiting screen (B5)", () => {
  it("polls every 2 seconds for 2 minutes, then says an email will follow and stops", async () => {
    const getBillingCharge = vi.fn(async () => ({ state: "PENDING" as const, reason_code: null }));
    await mount(getBillingCharge);
    expect(container.textContent).toBe("Waiting for your bank to confirm…");
    await act(async () => { await vi.advanceTimersByTimeAsync(118_000); });
    expect(container.textContent).toBe("Waiting for your bank to confirm…");
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(container.textContent).toBe("We'll email you as soon as your bank confirms.");
    expect(getBillingCharge).toHaveBeenCalledTimes(61);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(getBillingCharge).toHaveBeenCalledTimes(61);
  });

  it("stops at the server's answer, never guessed in the browser: a success", async () => {
    const getBillingCharge = vi.fn()
      .mockResolvedValueOnce({ state: "PENDING", reason_code: null })
      .mockResolvedValueOnce({ state: "SUCCEEDED", reason_code: null });
    await mount(getBillingCharge);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(container.textContent).toBe("PAID");
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(getBillingCharge).toHaveBeenCalledTimes(2);
  });

  it("a bank decline (NEEDS_ACTION, P8c) is settled: the caller's refusal text, and no more polling", async () => {
    const getBillingCharge = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ state: "NEEDS_ACTION", reason_code: "PAYMENT_DECLINED" });
    await mount(getBillingCharge);
    expect(container.textContent).toBe("Waiting for your bank to confirm…");
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(container.textContent).toBe("REFUSED");
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(getBillingCharge).toHaveBeenCalledTimes(2);
  });

  it("a payment we refunded says so, never 'no money was taken'", async () => {
    await mount(vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_COUNTRY_BLOCKED" })));
    expect(container.textContent).toBe("We can't accept cards issued in that card's country. Any money taken goes back to your card in full.");
    act(() => root.unmount());
    root = createRoot(container);
    await mount(vi.fn(async () => ({ state: "FAILED" as const, reason_code: "ALREADY_SUBSCRIBED" })));
    expect(container.textContent).toBe("We refunded this payment in full. The email we sent explains why.");
    act(() => root.unmount());
    root = createRoot(container);
    await mount(vi.fn(async () => ({ state: "FAILED" as const, reason_code: "VOIDED" })));
    expect(container.textContent).toBe("REFUSED");
  });

  it("a new card from a country we cannot serve (D6a's CARD_CHECK_REFUSED) says so, since no email follows", async () => {
    await mount(vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_CHECK_REFUSED" })));
    expect(container.textContent).toBe(
      "We can't accept cards issued in that card's country. The hold on it is released, and your plan keeps the card it had."
    );
    expect(container.textContent).not.toContain("email");
  });

  it("a card check deferred while a plan payment is open (D6b's CARD_CHECK_DEFERRED) asks to try again, never success", async () => {
    await mount(vi.fn(async () => ({ state: "FAILED" as const, reason_code: "CARD_CHECK_DEFERRED" })));
    expect(container.textContent).toBe(
      "We couldn't save your new card just now because a payment on your plan is still being confirmed. Your current card stays in use; please try again in an hour."
    );
    expect(container.textContent).not.toBe("PAID");
  });
});
