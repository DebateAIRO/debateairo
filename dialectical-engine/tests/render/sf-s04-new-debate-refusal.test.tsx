// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, CRISIS_SUPPORT_OFFERED, QUESTION_NOT_STARTED, type QuestionNotStarted } from "@debateai/contract";
import home from "../../apps/ui/messages/en/home.json";
import chrome from "../../apps/ui/messages/en/chrome.json";
import newDebate from "../../apps/ui/messages/en/newDebate.json";

const mocks = vi.hoisted(() => ({ createDebate: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("topic=Should%20cities%20add%20more%20bike%20lanes%3F")
}));
vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  contractClient: { readSession: () => new Promise(() => {}) }
}));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: (token: string) => React.ReactNode }) => children("token") }));
vi.mock("@/components/AiNotice", () => ({ AiNotice: () => null }));
vi.mock("@/components/billing/UsageBars", () => ({ UsageBars: () => null }));
vi.mock("@/components/billing/RoomNotice", () => ({ RoomNotice: () => null }));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null }),
  isSensitiveDataConsentRefusal: () => false
}));
vi.mock("@/components/QuestionLanguageChoice", () => ({ useQuestionLanguageChoice: () => ({ dialog: null, ensureChoice: async () => "EDIT" }) }));
vi.mock("@/lib/billing/room", () => ({
  useAskRoom: () => [null, vi.fn()],
  readAskRoom: async () => null,
  waitingRoomOf: () => null
}));

import NewDebatePageClient from "../../apps/ui/app/new/NewDebatePageClient.js";

const roots: { root: Root; node: HTMLElement }[] = [];
beforeEach(() => { mocks.createDebate.mockReset(); mocks.push.mockReset(); });
afterEach(() => { for (const { root, node } of roots.splice(0)) { act(() => root.unmount()); node.remove(); } });

async function submit(error: unknown): Promise<HTMLElement> {
  mocks.createDebate.mockRejectedValue(error);
  const node = document.createElement("div"); document.body.appendChild(node);
  const root = createRoot(node); roots.push({ root, node });
  await act(async () => root.render(<NewDebatePageClient catalog={newDebate} homeCatalog={home} chromeCatalog={chrome} locale="en" />));
  const form = node.querySelector("form"); expect(form).not.toBeNull();
  await act(async () => { form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(mocks.createDebate).toHaveBeenCalledTimes(1);
  return node;
}

function notStarted(refusal: QuestionNotStarted) {
  return new ContractHttpError("UNPROCESSABLE", 422, QUESTION_NOT_STARTED, QUESTION_NOT_STARTED, null, null, null, refusal);
}

describe("the new-debate page routes pre-start refusals", () => {
  it.each([
    { kind: "DRUGS", screen: "REFUSE", emergencyNumber: false },
    { kind: "HARM_TO_OTHERS", screen: "REFUSE", emergencyNumber: true },
    { kind: "SUICIDE_AND_ASSISTED_DYING", screen: "SENSITIVE", emergencyNumber: false }
  ] as const)("a 422 QUESTION_NOT_STARTED %j opens its screen without navigation", async (refusal) => {
    const node = await submit(notStarted(refusal));
    expect(node.querySelector('[data-dialog="question-refusal"]')).not.toBeNull();
    expect(node.querySelector('[data-part="rule"]')?.textContent).toBe((home as Record<string, string>)["home.questionRefusal.rule"]);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("a 503 QUESTION_CHECK_UNAVAILABLE opens the retry screen", async () => {
    const node = await submit(new ContractHttpError("SERVER_FAILURE", 503, "unavailable", "QUESTION_CHECK_UNAVAILABLE"));
    expect(node.querySelector('[data-part="try-again"]')).not.toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("Back closes the refusal while retaining the question", async () => {
    const node = await submit(notStarted("HATE_SPEECH"));
    await act(async () => node.querySelector<HTMLButtonElement>('[data-part="back"]')!.click());
    expect(node.querySelector('[data-dialog="question-refusal"]')).toBeNull();
    expect(node.querySelector<HTMLTextAreaElement>("#topic")?.value).toBe("Should cities add more bike lanes?");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("a 422 CRISIS_SUPPORT_OFFERED still opens the existing help screen", async () => {
    const node = await submit(new ContractHttpError("UNPROCESSABLE", 422, CRISIS_SUPPORT_OFFERED, CRISIS_SUPPORT_OFFERED));
    expect(node.querySelector('[data-dialog="crisis-support"]')).not.toBeNull();
    expect(node.querySelector('[data-dialog="question-refusal"]')).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
