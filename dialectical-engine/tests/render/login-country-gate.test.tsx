// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";

const mocks = vi.hoisted(() => ({ availability: vi.fn() }));
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({ getGeoAvailability: mocks.availability })
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "user-agent": "vitest-render-browser", "x-debateai-client-ip": "203.0.113.9" })
}));

import LoginPage from "../../apps/ui/app/login/page.js";

/** Paid plans G3a, sign-in: where the service is not offered, the sign-up page's sentence and no form. */
const SENTENCE = "Dialectical Engine isn't available in your country yet.";
let root: Root | null = null;

async function mount(element: ReactElement): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await act(async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
}

describe("the login page where the service is not offered", () => {
  beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    mocks.availability.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows the sentence and no sign-in form when sign-in is closed for this visitor", async () => {
    mocks.availability.mockResolvedValue({ signup: false, pay: false, service: false });
    const html = renderToStaticMarkup(await LoginPage({}));
    const page = new DOMParser().parseFromString(html, "text/html");
    expect(page.body.textContent).toContain(SENTENCE);
    expect(page.querySelector("form")).toBeNull();
    expect(page.querySelector('input[type="password"]')).toBeNull();
  });

  it("shows the form when sign-in is open, and when the check itself fails", async () => {
    for (const setUp of [
      () => mocks.availability.mockResolvedValue({ signup: true, pay: false, service: true }),
      () => mocks.availability.mockRejectedValue(new Error("unreachable"))
    ]) {
      setUp();
      const html = renderToStaticMarkup(await LoginPage({}));
      const page = new DOMParser().parseFromString(html, "text/html");
      expect(page.body.textContent).not.toContain(SENTENCE);
      expect(page.querySelector('input[type="password"]')).not.toBeNull();
    }
  });

  it("says the sentence when the sign-in itself is refused for the country", async () => {
    const beginLogin = vi.fn().mockRejectedValue(
      new ContractHttpError("FORBIDDEN", 403, "COUNTRY_SERVICE_UNAVAILABLE", "COUNTRY_SERVICE_UNAVAILABLE")
    );
    await mount(<LoginFlow client={{ beginLogin } as never} />);
    const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    for (const [name, value] of [["email", "person@example.test"], ["password", "Correct horse 7!"]] as const) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
        field(name).dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await act(async () => {
      field("password").form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
    expect(beginLogin).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(SENTENCE);
  });
});
