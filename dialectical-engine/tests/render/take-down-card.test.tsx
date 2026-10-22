// @vitest-environment jsdom
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { DebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";
import { debateSummariesFromIndex } from "../../apps/ui/lib/v3/adapter.js";
import type { DebateSummary } from "../../apps/ui/lib/types.js";
import home from "../../apps/ui/messages/en/home.json";
import auth from "../../apps/ui/messages/en/auth.json";
import pub from "../../apps/ui/messages/en/public.json";
import time from "../../apps/ui/messages/en/time.json";
import { mount, unmount, click } from "./task11-harness.js";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), unpublish: vi.fn(), stepUp: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/i18n/I18nProvider", () => ({ useChromeI18n: () => ({ locale: "en", catalog: home }) }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../apps/ui/lib/api.js")>()),
  contractClient: {
    unpublishRun: mocks.unpublish,
    authMethods: async () => ({ methods: [], recovery_codes_remaining: 0, available_step_up_methods: ["password_totp"], step_up_providers: [] }),
    stepUp: mocks.stepUp
  }
}));

const runRef = "11111111-1111-4111-8111-111111111111";
const row: DebateSummary = { id: "answer-1", run_ref: runRef, topic: "City plan", status: "complete", created_at: "", completed_at: null, models: [], synthesis_flag: { verdict: "FLAGGED" }, publication_review: { review_state: "APPROVED", asks_used: 1, visibility: "PUBLISHED" } };
const view = (debates: DebateSummary[]) => <DebatesBuffer debates={debates} catalog={home} publicCatalog={pub} timeCatalog={time} locale="en" checkingLabel="Checking" />;
const html = (debates: DebateSummary[]) => renderToStaticMarkup(view(debates));
const button = (host: HTMLElement, label: string) => [...host.querySelectorAll("button")].find((item) => item.textContent === label)!;
const grant = { status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { token: "g".repeat(43), action: "UNPUBLISH", target_run_id: runRef, expires_at: new Date(Date.now() + 300000).toISOString() } };
afterEach(() => { vi.clearAllMocks(); document.body.replaceChildren(); });

it("a flagged PUBLISHED row renders Take down as the Link's sibling, never inside it", () => {
  const document = new DOMParser().parseFromString(html([row]), "text/html");
  const group = document.querySelector(".libTakeDownGroup")!;
  expect(group.children[0]?.tagName).toBe("A");
  expect(group.children[1]?.querySelector("button.libTakeDown")?.textContent).toBe("Take down");
  expect(group.children[0]?.querySelector("button")).toBeNull();
});
it("a flagged PRIVATE row and an unflagged PUBLISHED row render no Take down", () => {
  const privateRow = { ...row, publication_review: { ...row.publication_review!, visibility: "PRIVATE" as const } };
  const clearRow = { ...row, id: "answer-2", synthesis_flag: null };
  expect(html([privateRow, clearRow])).not.toContain("libTakeDown");
});
it("the label per state: FLAGGED, UNDER REVIEW, APPROVED, REFUSED", () => {
  const states = ["NONE", "UNDER_REVIEW", "APPROVED", "REFUSED"] as const;
  const labels = ["FLAGGED", "FLAGGED · UNDER REVIEW", "APPROVED", "NOT APPROVED"];
  const summaries = debateSummariesFromIndex({ items: [{ answer_id: "answer-1", run_ref: runRef, question_line: "City plan", models: [], created_at_sequence: 2, synthesis_flag: { verdict: "FLAGGED" }, publication_review: row.publication_review }], open_runs: [{ run_ref: "open-1", question_line: "Open", state: "RUNNING", created_at_sequence: 1, terminal_reason: null }] } as never);
  expect(summaries[0]).toMatchObject({ run_ref: runRef, publication_review: row.publication_review });
  expect(summaries[1]).toMatchObject({ publication_review: null });
  states.forEach((state, index) => {
    const markup = html([{ ...row, publication_review: { review_state: state, asks_used: 1, visibility: "PRIVATE" } }]);
    expect(new DOMParser().parseFromString(markup, "text/html").querySelector(".libFlagLabel")?.textContent).toBe(labels[index]);
  });
});
it("Take down opens the unpublish confirmation without navigation; Cancel calls nothing", async () => {
  const { host, root } = await mount(view([row]));
  try {
    await click(host, "Take down");
    expect(host.textContent).toContain(pub["public.publication.unpublishWarning"]);
    await click(host, pub["public.publication.cancel"]);
    expect(host.textContent).not.toContain(pub["public.publication.unpublishWarning"]);
    expect(mocks.unpublish).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  } finally { await unmount(root, host); }
});
it("confirming calls unpublishRun with the row's run_ref and the grant token, then refreshes", async () => {
  mocks.stepUp.mockResolvedValue(grant);
  mocks.unpublish.mockResolvedValue({ state: "PRIVATE", public_ref: null });
  const { host, root } = await mount(view([row]));
  try {
    await click(host, "Take down");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await click(host, pub["public.publication.unpublish"]);
    await click(host, auth["auth.security.passwordMethod"]);
    const password = host.querySelector<HTMLInputElement>('[name="security-password"]')!;
    const code = host.querySelector<HTMLInputElement>('[name="security-code"]')!;
    await act(async () => { password.value = "correct horse battery staple"; code.value = "123456"; password.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(mocks.unpublish).toHaveBeenCalledWith(runRef, "g".repeat(43));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  } finally { await unmount(root, host); }
});
it("a failed take-down keeps the card and shows the debate page's unpublish failure message", async () => {
  mocks.stepUp.mockResolvedValue(grant);
  mocks.unpublish.mockRejectedValue(new ContractHttpError("FORBIDDEN", 403, "FORBIDDEN", "FORBIDDEN"));
  const { host, root } = await mount(view([row]));
  try {
    await click(host, "Take down");
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await click(host, pub["public.publication.unpublish"]);
    await click(host, auth["auth.security.passwordMethod"]);
    const password = host.querySelector<HTMLInputElement>('[name="security-password"]')!;
    const code = host.querySelector<HTMLInputElement>('[name="security-code"]')!;
    await act(async () => { password.value = "correct horse battery staple"; code.value = "123456"; password.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(host.querySelector(".libRow")).not.toBeNull();
    expect(host.querySelector(".tdPanel")).toBeNull();
    expect(button(host, "Take down")).not.toBeNull();
    expect(host.textContent).toContain(pub["public.publication.changeUnauthorized"]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  } finally { await unmount(root, host); }
});
it("the Link's pinned attribute run is unchanged", () => {
  const document = new DOMParser().parseFromString(html([row]), "text/html");
  const link = document.querySelector("a.libRow")!;
  expect(link.getAttribute("data-library-row")).toBe("true");
  expect(link.getAttribute("data-bezel")).toBe("shell");
  expect(link.getAttribute("href")).toBe("/debate/answer-1");
});
