// @vitest-environment jsdom
/*
 * Auth UI repair (2026-10-09), fix 9: after a provider check for a debate action (publish, unpublish,
 * delete) the resume panel linked back to the debate with the raw run id as the link text
 * ("33333333-3333-…"). People read "Return to your debate" instead; the id stays only in the href.
 */
import { afterEach, expect, it, vi } from "vitest";
import auth from "../../apps/ui/messages/en/auth.json";
import settings from "../../apps/ui/messages/en/settings.json";
import publicCatalog from "../../apps/ui/messages/en/public.json";
import { SecurityActionResume } from "../../apps/ui/components/auth/SecurityActionResume.js";
import { mount, unmount } from "./task11-harness.js";

vi.mock("@/lib/consumerWebAuthn", () => ({ createConsumerWebAuthnBrowser: () => ({ supportsConditional: async () => false, authenticate: vi.fn(), register: vi.fn(), cancel: vi.fn() }) }));

const runId = "33333333-3333-4333-8333-333333333333";
let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => { await cleanup?.(); cleanup = null; });

it.each(["PUBLISH", "UNPUBLISH", "DELETE_PRIVATE_DEBATE"])("a resumed %s links back with words, never the run id", async (action) => {
  const proof = { status: "step_up_complete", csrf_token: "c".repeat(43), step_up_grant: { action, target_run_id: runId, token: "g".repeat(43), expires_at: new Date(Date.now() + 300_000).toISOString() } };
  const client = { authMethods: vi.fn().mockResolvedValue({ methods: [], recovery_codes_remaining: 10, available_step_up_methods: ["passkey"], step_up_providers: [] }) } as never;
  const { host, root } = await mount(<SecurityActionResume catalog={auth} settingsCatalog={settings} publicCatalog={publicCatalog} locale="en" client={client} takeProof={() => proof as never} />);
  cleanup = () => unmount(root, host);
  const link = host.querySelector<HTMLAnchorElement>(`a[href="/debate/${runId}"]`);
  expect(link?.textContent).toBe("Return to your debate");
  expect(host.textContent).not.toContain(runId);
});
