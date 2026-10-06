let calls = 0;
let pathname = "/";
/** Each router.refresh(), recorded as the page's query string at that moment ("" in a node environment). */
let refreshes: string[] = [];

export function notFound(): never {
  calls += 1;
  throw new Error("NEXT_NOT_FOUND");
}

export function resetNotFoundCalls(): void {
  calls = 0;
}

export function readNotFoundCalls(): number {
  return calls;
}

export function usePathname(): string {
  return pathname;
}

export function setPathname(value: string): void {
  pathname = value;
}

const router = Object.freeze({
  refresh(): void {
    refreshes.push(typeof window === "undefined" ? "" : window.location.search);
  },
  push(): void {},
  replace(): void {},
  prefetch(): void {},
  back(): void {},
  forward(): void {}
});

export function useRouter(): typeof router {
  return router;
}

export function resetRefreshes(): void {
  refreshes = [];
}

export function readRefreshes(): readonly string[] {
  return [...refreshes];
}

let redirects: string[] = [];

export function redirect(url: string): never {
  redirects.push(url);
  throw new Error("NEXT_REDIRECT");
}

export function resetRedirects(): void {
  redirects = [];
}

export function readRedirects(): readonly string[] {
  return [...redirects];
}
