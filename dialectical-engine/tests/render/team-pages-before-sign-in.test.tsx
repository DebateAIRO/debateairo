// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamLimitPanel } from "../../apps/ui/components/TeamLimitPanel.js";
import { TeamAllowancePanel } from "../../apps/ui/components/TeamAllowancePanel.js";
import { PublicReviewPanel } from "../../apps/ui/components/PublicReviewPanel.js";
import { PublicationReviewsPanel } from "../../apps/ui/components/PublicationReviewsPanel.js";
import { createTeamLimitClient } from "../../apps/ui/lib/teamLimitApi.js";
import { createTeamAllowanceClient } from "../../apps/ui/lib/teamAllowanceApi.js";
import { createPublicReviewClient } from "../../apps/ui/lib/publicReviewApi.js";
import { createStaffApiClient } from "../../apps/ui/lib/staffApi.js";
import staff from "../../apps/ui/messages/en/staff.json";
import { CSRF_COOKIE, holdReadableCookies, STAFF_CSRF_COOKIE } from "../support/sessionCookie.js";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

/*
 * The site sits behind a site password at the edge, and the browser forgets that password whenever a request it sent with
 * it comes back 401 without asking for it again. The team pages read the team's data on opening, before the team sign-in:
 * the API refuses each of those reads (401) without the team cookie, so the press on the team sign-in on the same page
 * asked for the site password again. The team cookie is HttpOnly, but the API sets a readable one beside it, with the same
 * lifetime, and clears neither on its own: the panels now read on opening only when the browser holds it. The fake server
 * refuses every team read without that cookie, as the API does.
 */

const holdsStaff = () => document.cookie.split(";").some((member) => member.trim().startsWith("__Host-debateai-staff-csrf="));
function server() {
  const calls: string[] = [];
  const fetchImplementation = (async (input: RequestInfo | URL) => {
    const path = String(input).slice(String(input).indexOf("/v1/"));
    calls.push(path);
    // A made-up refusal with the team cookie too: whether the read was sent is all these tests look at.
    return holdsStaff() ? Response.json({ error: "STAFF_REQUEST_REFUSED" }, { status: 403 }) : Response.json({ error: "STAFF_AUTHORITY_INVALID" }, { status: 401 });
  }) as typeof fetch;
  return { calls, fetchImplementation };
}
const browser = { authenticate: async () => { throw new Error("unused"); }, register: async () => { throw new Error("unused"); }, cancel() {} };

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function render(view: React.ReactNode): Promise<void> {
  await act(async () => { root.render(view); for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); });
}
async function teamSignIn(): Promise<void> {
  holdReadableCookies(CSRF_COOKIE, STAFF_CSRF_COOKIE);
  await act(async () => {
    window.dispatchEvent(new CustomEvent("debateai:staff-authority-changed", { detail: { capabilities: ["TEAM_READ"] } }));
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
}

describe("/admin/team before the team sign-in", () => {
  it("the team limit and the allowance panels send nothing, then read once the team sign-in is done", async () => {
    holdReadableCookies(CSRF_COOKIE);
    const api = server();
    await render(<>
      <TeamLimitPanel client={createTeamLimitClient({ fetchImplementation: api.fetchImplementation, browser })} catalog={staff} />
      <TeamAllowancePanel client={createTeamAllowanceClient({ fetchImplementation: api.fetchImplementation, browser })} catalog={staff} />
    </>);
    expect(api.calls, "no team read before the team sign-in").toEqual([]);
    await teamSignIn();
    expect(api.calls).toEqual(["/v1/admin/team-limit", "/v1/admin/team-allowances"]);
  });

  it("the public review panel sends nothing and stays away, as it did after the refusal", async () => {
    holdReadableCookies(CSRF_COOKIE);
    const api = server();
    await render(<PublicReviewPanel client={createPublicReviewClient({ fetchImplementation: api.fetchImplementation, browser })} catalog={staff} />);
    expect(api.calls).toEqual([]);
    expect(host.textContent).toBe("");
  });

  it("with the team sign-in already done in this browser, every panel reads on opening, as before", async () => {
    holdReadableCookies(CSRF_COOKIE, STAFF_CSRF_COOKIE);
    const api = server();
    await render(<>
      <TeamLimitPanel client={createTeamLimitClient({ fetchImplementation: api.fetchImplementation, browser })} catalog={staff} />
      <TeamAllowancePanel client={createTeamAllowanceClient({ fetchImplementation: api.fetchImplementation, browser })} catalog={staff} />
      <PublicReviewPanel client={createPublicReviewClient({ fetchImplementation: api.fetchImplementation, browser })} catalog={staff} />
    </>);
    expect(api.calls).toEqual(["/v1/admin/team-limit", "/v1/admin/team-allowances", "/v1/admin/public-review"]);
  });
});

describe("/admin/reviews before the team sign-in", () => {
  it("sends nothing and says to sign in to the team console first, as the refusal made it say", async () => {
    holdReadableCookies(CSRF_COOKIE);
    const api = server();
    await render(<PublicationReviewsPanel client={createStaffApiClient({ fetchImplementation: api.fetchImplementation, browser })} catalog={staff} />);
    expect(api.calls).toEqual([]);
    expect(host.textContent).toContain(staff["staff.reviews.notElevated"]);
  });

  it("with the team sign-in done, it reads the queue on opening, as before", async () => {
    holdReadableCookies(CSRF_COOKIE, STAFF_CSRF_COOKIE);
    const api = server();
    await render(<PublicationReviewsPanel client={createStaffApiClient({ fetchImplementation: api.fetchImplementation, browser })} catalog={staff} />);
    expect(api.calls).toEqual(["/v1/admin/publication-reviews"]);
  });
});
