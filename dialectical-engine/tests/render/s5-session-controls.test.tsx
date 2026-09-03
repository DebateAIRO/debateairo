// @vitest-environment jsdom

import { act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContractClient, SessionList } from "@debateai/contract";
import { SessionControls as UiSessionControls } from "../../apps/ui/components/SessionControls.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type ControlClient = Pick<ContractClient,
  "listSessions" | "logout" | "revokeSession" | "revokeAllSessions" | "stepUp"
>;

const currentId = "11111111-1111-4111-8111-111111111111";
const remoteId = "22222222-2222-4222-8222-222222222222";
const sessions: SessionList = {
  sessions: [currentId, remoteId].map((sessionId, index) => ({
    session_id: sessionId,
    created_at: "2026-08-23T10:00:00.000Z",
    last_seen_at: "2026-08-23T10:05:00.000Z",
    idle_expires_at: "2026-09-06T10:05:00.000Z",
    absolute_expires_at: "2026-11-21T10:00:00.000Z",
    last_mfa_at: "2026-08-23T10:00:00.000Z",
    current: index === 0
  }))
};

const surfaces: ReadonlyArray<readonly [string, ComponentType<{
  client?: ControlClient;
  onSessionEnded?: () => void;
}>]> = [
  ["apps/ui", UiSessionControls]
];

let root: Root | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")]
    .find((candidate) =>
      candidate.textContent?.trim() === label
      || candidate.getAttribute("aria-label") === label);
  expect(button, `missing rendered button ${label}`).toBeDefined();
  await act(async () => { (button as HTMLButtonElement).click(); });
  await settle();
}

describe.each(surfaces)("S5 rendered session controls — %s", (_name, Controls) => {
  let client: ControlClient;
  let ended: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    client = {
      listSessions: vi.fn().mockResolvedValue(sessions),
      logout: vi.fn().mockResolvedValue(undefined),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeAllSessions: vi.fn().mockResolvedValue({ revoked: 2 }),
      stepUp: vi.fn().mockResolvedValue({
        status: "step_up_complete", csrf_token: "c".repeat(43)
      })
    };
    ended = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root!.render(<Controls client={client} onSessionEnded={ended} />); });
    await settle();
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("renders own active sessions and wires individual revoke, revoke-all, logout, and step-up", async () => {
    expect(document.body.textContent).toContain("Active sessions");
    expect(document.body.textContent).toContain("Current session");
    // Raw session ids are deliberately not shown: a uuid tells a person nothing
    // about which device they are revoking.
    expect(document.body.textContent).not.toContain(remoteId);
    expect(document.body.textContent).toContain("Other session");
    expect(document.body.textContent).toContain("Signed in");

    await click(`Revoke session ${remoteId}`);
    expect(client.revokeSession).toHaveBeenCalledWith(remoteId);

    const password = document.querySelector<HTMLInputElement>('input[name="step-up-password"]');
    const code = document.querySelector<HTMLInputElement>('input[name="step-up-code"]');
    const form = document.querySelector<HTMLFormElement>('form[data-session-step-up="true"]');
    expect(password).not.toBeNull();
    expect(code).not.toBeNull();
    expect(form).not.toBeNull();
    password!.value = "correct horse battery staple";
    code!.value = "123456";
    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(client.stepUp).toHaveBeenCalledWith("correct horse battery staple", "123456");
    expect(document.body.textContent).toContain("Fresh authentication complete");

    await click("Revoke all sessions");
    expect(client.revokeAllSessions).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);

    await click("Sign out");
    expect(client.logout).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(2);
  });
});

it("mounts the rendered session-control component on the live settings page", async () => {
  const ui = await readFile(resolve(process.cwd(), "apps/ui/app/settings/page.tsx"), "utf8");
  expect(ui).toContain("<SessionControls");
});
