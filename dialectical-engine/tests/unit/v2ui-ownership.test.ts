import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import * as route from "../../apps/ui/app/api/[...path]/route.js";
import { createBrowserContractClient, getDebateBundle } from "../../apps/ui/lib/api.js";

/**
 * UI-01 S05 ownership proof through the real UI chain: browser contract
 * client -> same-origin rewrite -> compiled proxy route -> real HTTP socket ->
 * an upstream that scopes every read by the exact host-only session cookie
 * apps/api does (owner 200 / foreign 404 / anonymous 401). Nothing here is
 * mocked below the route handler: the proxy performs a real network fetch.
 */

const OWNER_TOKEN = "o".repeat(43);
const FOREIGN_TOKEN = "f".repeat(43);
const SESSION_MARKER = "cookie-session";
const answer = buildFairShapedAnswer();

let server: Server;
let baseBefore: string | undefined;

beforeAll(async () => {
  server = createServer((request, response) => {
    const token = request.headers.cookie
      ?.split(";")
      .map((member) => member.trim())
      .find((member) => member.startsWith("__Host-debateai-session="))
      ?.slice("__Host-debateai-session=".length);
    if (token === undefined || token.length === 0) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "SESSION_REQUIRED" }));
      return;
    }
    const url = new URL(request.url ?? "/", "http://scoped.local");
    const ownerHasAnswer =
      url.pathname === `/v1/answers/${encodeURIComponent(answer.answer_id)}` ||
      url.pathname === `/v1/runs/${encodeURIComponent(answer.run_ref)}/answer`;
    if (token === OWNER_TOKEN && ownerHasAnswer) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(answer));
      return;
    }
    // Foreign asker (or unknown resource): the projection is asker-scoped, so
    // the record simply does not exist for this identity.
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "ANSWER_NOT_FOUND" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("upstream address unavailable");
  baseBefore = process.env.DIALECTICAL_API_BASE;
  process.env.DIALECTICAL_API_BASE = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (baseBefore === undefined) delete process.env.DIALECTICAL_API_BASE;
  else process.env.DIALECTICAL_API_BASE = baseBefore;
  server.close();
  await once(server, "close");
});

/** Browser-shaped fetch: every same-origin /api call goes through the real route handler. */
const throughProxy = (async (input: unknown, init?: RequestInit) => {
  const path = String(input);
  if (!path.startsWith("/api/")) throw new Error(`unexpected non-proxy request: ${path}`);
  const segments = path.slice("/api/".length).split("?")[0]!.split("/").map(decodeURIComponent);
  const request = new Request(`http://web.local${path}`, init);
  const context = { params: Promise.resolve({ path: segments }) };
  if (request.method === "GET") return route.GET(request, context);
  if (request.method === "POST") return route.POST(request, context);
  throw new Error(`unexpected proxy method: ${request.method}`);
}) as typeof fetch;

function throughProxyAs(sessionToken: string | null): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (sessionToken !== null) {
      headers.set("cookie", `__Host-debateai-session=${sessionToken}`);
    }
    return throughProxy(input, { ...init, headers });
  }) as typeof fetch;
}

describe("S05 ownership through the restored V2 data layer", () => {
  it("serves the owner their own debate (200 path)", async () => {
    const client = createBrowserContractClient(throughProxyAs(OWNER_TOKEN));
    const bundle = await getDebateBundle(answer.answer_id, SESSION_MARKER, client);
    expect(bundle.kind).toBe("served");
    if (bundle.kind !== "served") throw new Error("expected served owner debate");
    expect(bundle.answer.answer_id).toBe(answer.answer_id);
    expect(bundle.detail.topic).toBe(answer.question_line);
    expect(bundle.detail.tree?.children[0]?.children[0]?.node_type).toBe("CON");
  });

  it("refuses a foreign asker with NOT_FOUND on both the answer and run projections (404 path)", async () => {
    const client = createBrowserContractClient(throughProxyAs(FOREIGN_TOKEN));
    const failure = await getDebateBundle(answer.answer_id, SESSION_MARKER, client).then(
      () => null,
      (thrown: unknown) => thrown
    );
    expect(failure).toBeInstanceOf(ContractHttpError);
    expect((failure as ContractHttpError).code).toBe("NOT_FOUND");
    expect((failure as ContractHttpError).status).toBe(404);
  });

  it("refuses an anonymous read with SESSION_REQUIRED (401 path)", async () => {
    const client = createBrowserContractClient(throughProxyAs(null));
    const failure = await client.readAnswer(answer.answer_id, SESSION_MARKER).then(
      () => null,
      (thrown: unknown) => thrown
    );
    expect(failure).toBeInstanceOf(ContractHttpError);
    expect((failure as ContractHttpError).code).toBe("SESSION_REQUIRED");
    expect((failure as ContractHttpError).status).toBe(401);
  });
});
