import { vi } from "vitest";

/**
 * The readable CSRF cookie the API sets and clears together with the HttpOnly session cookie. A page script sees only
 * this one, so a browser that has it holds a session (or did, until the server stopped accepting it), and a browser
 * without it holds none. Made-up value, of the length the website reads.
 */
export const CSRF_COOKIE = `__Host-debateai-csrf=${"c".repeat(43)}`;

/**
 * Makes this jsdom browser hold a session's cookies: `document.cookie` reads the CSRF cookie beside whatever the page
 * itself wrote. jsdom refuses to store a `__Host-` cookie on its plain-http page, so the getter is stood in instead.
 * `vi.restoreAllMocks()`, or the returned `drop()`, takes it away again (the browser signed out, its cookies cleared).
 */
export function holdSessionCookies(): Readonly<{ drop(): void }> {
  const real = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!.get!;
  const spy = vi.spyOn(document, "cookie", "get").mockImplementation(() => {
    const written = real.call(document) as string;
    return written.length === 0 ? CSRF_COOKIE : `${written}; ${CSRF_COOKIE}`;
  });
  return { drop: () => { spy.mockRestore(); } };
}
