let calls = 0;
let pathname = "/";
/** Each router.refresh(), recorded as the page's query string at that moment ("" in a node environment). */
let refreshes: string[] = [];
/** A test's own stand-in for what a refresh does to the page (null: nothing more than the record above). */
let refreshEffect: (() => void) | null = null;

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
    refreshEffect?.();
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
  refreshEffect = null;
}

/** What router.refresh() does to the page from now on (a test's state update, for a refresh that takes a while). */
export function setRefreshEffect(effect: (() => void) | null): void {
  refreshEffect = effect;
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
