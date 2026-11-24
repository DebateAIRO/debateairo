import { GET as proxyGet } from "../../../../../api/[...path]/route.js";

/**
 * The address a sign-in company sends the browser back to. apps/api/src/social-providers/provider.ts derives it from
 * PUBLIC_APP_URL as <site>/v1/auth/social/<provider>/callback and the relay accepts no other path, but the website is
 * all that answers on the site's address. This route hands the return to the API through the /api proxy (its header
 * and cookie rules unchanged) and gives the browser the API's redirect to a page of this site. Whatever else comes
 * back (a refusal, a limit, a provider that is off, an unreachable API) goes to the sign-in page, which says that
 * sign-in could not be completed: a person arriving from another site never lands on a bare API answer.
 * Apple returns by form post (POST), which this address does not take.
 */
const PROVIDERS = new Set(["google", "facebook", "x"]);
const FAILED = "/login?social=failed";

type ReturnContext = Readonly<{ params: Promise<Readonly<{ provider: string }>> }>;

function failed(cookies: readonly string[]): Response {
  const headers = new Headers({ location: FAILED, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function GET(request: Request, context: ReturnContext): Promise<Response> {
  const { provider } = await context.params;
  if (!PROVIDERS.has(provider)) return failed([]);
  let answer: Response;
  try {
    answer = await proxyGet(request, { params: Promise.resolve({ path: ["v1", "auth", "social", provider, "callback"] }) });
  } catch {
    return failed([]);
  }
  const location = answer.status === 303 ? answer.headers.get("location") : null;
  const cookies = answer.headers.getSetCookie();
  await answer.body?.cancel();
  if (location === null) return failed(cookies);
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}
