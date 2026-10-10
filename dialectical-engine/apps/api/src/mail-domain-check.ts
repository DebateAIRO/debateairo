import { Resolver } from "node:dns/promises";
import { mailAddressDomain } from "@debateai/kernel";

/**
 * The optional DNS question at the ENTRY POINTS only (sign-up, the recovery address, email change; owner decision
 * G5, 2026-10-09): "can this domain receive mail at all?". It is never asked at send time, where the stored
 * address was already accepted and a DNS hiccup must not hold back a security notice.
 *
 * - UNDELIVERABLE: the domain does not exist (NXDOMAIN), or it publishes a "null MX" (RFC 7505: it takes no
 *   mail), or it has neither an MX record nor an A/AAAA address to fall back on (RFC 5321 §5.1).
 * - DELIVERABLE: an MX record, or failing that an A or AAAA address, exists.
 * - UNKNOWN: anything else, including no answer within the deadline. The caller lets the address through
 *   (fail open): a slow or broken resolver must never block a real person from signing up.
 *
 * The resolver is injected, so tests never touch the network. Nothing here logs, and nothing returns the domain.
 */
export type MailDomainVerdict = "DELIVERABLE" | "UNDELIVERABLE" | "UNKNOWN";
export type MailDomainCheck = (domain: string) => Promise<MailDomainVerdict>;

export interface MailDomainResolver {
  resolveMx(domain: string): Promise<ReadonlyArray<Readonly<{ exchange: string; priority: number }>>>;
  resolve4(domain: string): Promise<readonly string[]>;
  resolve6(domain: string): Promise<readonly string[]>;
  /** Abandons the queries still in flight once the deadline has passed. */
  cancel?(): void;
}

/** Owner decision G5: two seconds, then fail open. Module-private (the source-purity law refuses an exported numeric literal). */
const MAIL_DOMAIN_CHECK_TIMEOUT_MS = 2_000;
/**
 * The process-wide brakes (self-review 2026-10-09): a signed-in account can ask about a new domain on every email
 * change or recovery-address request, so the questions this process sends are capped. Over either brake the answer
 * is UNKNOWN without any query, which lets the address through (fail open) and can never be turned into a flood of
 * lookups at someone else's name servers.
 */
const MAIL_DOMAIN_CHECK_MAX_IN_FLIGHT = 8;
const MAIL_DOMAIN_CHECK_MAX_PER_MINUTE = 120;
const MINUTE_MS = 60_000;
/**
 * Special-use names (RFC 2606, RFC 6761) are never asked about: they never resolve. In LOCAL mode they are what the
 * test suites and the development stack sign up with, so they pass; anywhere else (ruling 2026-10-09) they are
 * refused outright, so a hosted site can never store an address that cannot receive mail.
 */
const SPECIAL_USE_TOP_LEVEL = new Set(["test", "example", "invalid", "localhost"]);

const errorCode = (error: unknown): string | undefined =>
  error !== null && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code : undefined;
/** c-ares answers NXDOMAIN with ENOTFOUND and "the name exists without this record type" with ENODATA. */
const NAME_ABSENT = "ENOTFOUND";
const RECORD_ABSENT = "ENODATA";

async function lookUp(resolver: MailDomainResolver, domain: string, expired: () => boolean): Promise<MailDomainVerdict> {
  let exchanges: ReadonlyArray<Readonly<{ exchange: string; priority: number }>>;
  try {
    exchanges = await resolver.resolveMx(domain);
  } catch (error) {
    const code = errorCode(error);
    if (code === NAME_ABSENT) return "UNDELIVERABLE";
    if (code !== RECORD_ABSENT) return "UNKNOWN";
    exchanges = [];
  }
  if (exchanges.length > 0) {
    const nullMx = exchanges.length === 1 && (exchanges[0]!.exchange === "" || exchanges[0]!.exchange === ".");
    return nullMx ? "UNDELIVERABLE" : "DELIVERABLE";
  }
  // Past the deadline the answer is already UNKNOWN: send no further queries.
  if (expired()) return "UNKNOWN";
  const addresses = await Promise.allSettled([resolver.resolve4(domain), resolver.resolve6(domain)]);
  if (addresses.some((result) => result.status === "fulfilled" && result.value.length > 0)) return "DELIVERABLE";
  const absent = addresses.every((result) => result.status === "fulfilled"
    || errorCode(result.reason) === NAME_ABSENT || errorCode(result.reason) === RECORD_ABSENT);
  return absent ? "UNDELIVERABLE" : "UNKNOWN";
}

export function createMailDomainCheck(
  resolver: MailDomainResolver,
  timeoutMs: number = MAIL_DOMAIN_CHECK_TIMEOUT_MS,
  specialUse: "ALLOW" | "REFUSE" = "ALLOW"
): MailDomainCheck {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("MAIL_DOMAIN_CHECK_CONFIGURATION_INVALID");
  return async (domain: string): Promise<MailDomainVerdict> => {
    if (SPECIAL_USE_TOP_LEVEL.has(domain.slice(domain.lastIndexOf(".") + 1).toLowerCase())) {
      return specialUse === "REFUSE" ? "UNDELIVERABLE" : "UNKNOWN";
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    const deadline = new Promise<MailDomainVerdict>((resolve) => {
      timer = setTimeout(() => {
        expired = true;
        try { resolver.cancel?.(); } catch { /* The deadline's answer stands. */ }
        resolve("UNKNOWN");
      }, timeoutMs);
    });
    try {
      return await Promise.race([lookUp(resolver, domain, () => expired).catch((): MailDomainVerdict => "UNKNOWN"), deadline]);
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Wraps a check in the process-wide brakes above. Over a brake: UNKNOWN, and no query is sent. */
export function limitMailDomainCheck(
  check: MailDomainCheck,
  limits: Readonly<{ maxInFlight: number; maxPerMinute: number; now?: () => number }> = {
    maxInFlight: MAIL_DOMAIN_CHECK_MAX_IN_FLIGHT, maxPerMinute: MAIL_DOMAIN_CHECK_MAX_PER_MINUTE
  }
): MailDomainCheck {
  const now = limits.now ?? (() => Date.now());
  let inFlight = 0;
  const started: number[] = [];
  return async (domain: string): Promise<MailDomainVerdict> => {
    const at = now();
    while (started.length > 0 && started[0]! <= at - MINUTE_MS) started.shift();
    if (inFlight >= limits.maxInFlight || started.length >= limits.maxPerMinute) return "UNKNOWN";
    inFlight += 1;
    started.push(at);
    try {
      return await check(domain);
    } finally {
      inFlight -= 1;
    }
  };
}

/**
 * The running API's resolver: the system's DNS servers, one try each, bounded by the same deadline. One Resolver
 * per question, because `cancel()` abandons every query of its Resolver and must not cut another visitor's check.
 */
export function systemMailDomainCheck(deploymentMode: "local" | "hosted"): MailDomainCheck {
  const specialUse = deploymentMode === "local" ? "ALLOW" as const : "REFUSE" as const;
  const limited = limitMailDomainCheck((domain: string) => {
    const resolver = new Resolver({ timeout: MAIL_DOMAIN_CHECK_TIMEOUT_MS, tries: 1 });
    return createMailDomainCheck({
      resolveMx: (name) => resolver.resolveMx(name),
      resolve4: (name) => resolver.resolve4(name),
      resolve6: (name) => resolver.resolve6(name),
      cancel: () => resolver.cancel()
    }, MAIL_DOMAIN_CHECK_TIMEOUT_MS, specialUse)(domain);
  });
  // A special-use name is decided without DNS, so the brakes never turn a hosted refusal into a pass.
  return async (domain: string) => specialUse === "REFUSE" && SPECIAL_USE_TOP_LEVEL.has(domain.slice(domain.lastIndexOf(".") + 1).toLowerCase())
    ? "UNDELIVERABLE" : limited(domain);
}

/**
 * The entry points' one call: true only when the check positively says the domain takes no mail. No check
 * configured, DELIVERABLE and UNKNOWN (timeout, resolver failure) all let the address through.
 */
export async function mailDomainRefused(check: MailDomainCheck | undefined, address: string): Promise<boolean> {
  if (check === undefined) return false;
  try {
    return await check(mailAddressDomain(address)) === "UNDELIVERABLE";
  } catch {
    return false;
  }
}
