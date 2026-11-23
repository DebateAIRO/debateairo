import { vi } from "vitest";

/**
 * The readable CSRF cookie the API sets and clears together with the HttpOnly session cookie. A page script sees only
 * this one, so a browser that has it holds a session (or did, until the server stopped accepting it), and a browser
 * without it holds none. Made-up value, of the length the website reads.
 */
export const CSRF_COOKIE = `__Host-debateai-csrf=${"c".repeat(43)}`;

/**
 * The readable CSRF cookies the API's reset and recovery exchanges set beside their HttpOnly cookies, in the same
 * response and with the same lifetime. A browser that has one holds that reset or recovery (in progress, or ended and
 * not yet expired); a browser without it holds none. Made-up values, of the length the website reads.
 */
export const PASSWORD_RESET_CSRF_COOKIE = `__Host-debateai-password-reset-csrf=${"r".repeat(43)}`;
export const MFA_RECOVERY_CSRF_COOKIE = `__Host-debateai-mfa-recovery-csrf=${"m".repeat(43)}`;

/**
 * Makes this jsdom browser hold the given readable cookies: `document.cookie` reads them beside whatever the page itself
 * wrote. jsdom refuses to store a `__Host-` cookie on its plain-http page, so the getter is stood in instead.
 * `vi.restoreAllMocks()`, or the returned `drop()`, takes them away again (the cookies cleared or expired).
 */
export function holdReadableCookies(...cookies: readonly string[]): Readonly<{ drop(): void }> {
  const real = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")!.get!;
  const held = cookies.join("; ");
  const spy = vi.spyOn(document, "cookie", "get").mockImplementation(() => {
    const written = real.call(document) as string;
    return written.length === 0 ? held : `${written}; ${held}`;
  });
  return { drop: () => { spy.mockRestore(); } };
}

/** Makes this jsdom browser hold a session's cookies (see `holdReadableCookies`). */
export function holdSessionCookies(): Readonly<{ drop(): void }> {
  return holdReadableCookies(CSRF_COOKIE);
}
