import type { AuthSourceContext } from "@debateai/db";
import { decideAsk, decidePayment, decideSignup, UNKNOWN_COUNTRY, type GeoLookup } from "@debateai/geo";
import { countryRule, type CountryPolicy, type DeploymentMode } from "@debateai/register";

/**
 * A14's one decision, pure so a test can hold it: the country policy in force is read ONLY in hosted
 * mode. Local mode has no country gate even when its register publishes the row (the development
 * seeder always does), so `readRow` is never called there.
 */
export async function countryPolicyInForce(
  mode: DeploymentMode,
  readRow: () => Promise<CountryPolicy | null>
): Promise<CountryPolicy | null> {
  return mode === "hosted" ? readRow() : null;
}

/**
 * Paid plans G3a (spec 2026-09-29 §2.3.3, amendment A14) — THE COUNTRY GATE, as the API applies it.
 *
 * Composed only in hosted mode AND when the register version in force publishes `countryPolicy`;
 * absent, every route behaves exactly as before. It checks sign-up (the IP's country switch, Tor,
 * unknown), the support assistant (the same rule as sign-up) and new debates (the always-blocked
 * list); sign-in and every read are never gated.
 *
 * AUDIT, AGGREGATED. Each refusal writes an identity audit event — the code, the country and the
 * fact that the evidence was the IP — but at most ONE per route, code and country per window, and
 * off the request path: a flood of refused requests costs one Argon2 derivation and one chain
 * append per window, never one per request. The refusal never waits for, or depends on, the write.
 *
 * THE ONE COUNTRY SOURCE (RULINGS-R3 R3-3). The age gate records a country with every age check
 * (identity.age_check.country_code, "recorded, never decisive"). It reads Cloudflare's cf-ipcountry,
 * which the V3 kit never has (Caddy in front, and the UI's /api proxy does not forward the header),
 * so `recordedCountry` supplies the same fact from this lookup; the API's sourceFor uses the edge's
 * header when one exists and this otherwise.
 */
export type CountryGateRefusal = "COUNTRY_SIGNUP_UNAVAILABLE" | "COUNTRY_UNKNOWN" | "TOR_REFUSED" | "COUNTRY_ASK_BLOCKED";

export interface CountryGateAuditWriter {
  recordCountryGateRefusal(input: Readonly<{
    route: "register" | "asks";
    code: CountryGateRefusal;
    country: string;
    windowStartedAt: Date;
    source: AuthSourceContext;
  }>): Promise<void>;
}

export class CountryGate {
  private readonly clock: () => Date;
  private readonly auditWindowMs: number;
  private readonly auditCapacity = 4_096;
  private readonly audited = new Map<string, number>();

  constructor(private readonly options: Readonly<{
    policy: CountryPolicy;
    lookup: GeoLookup;
    audit: CountryGateAuditWriter;
    clock?: () => Date;
    /** Fifteen minutes unless a test supplies its own. */
    auditWindowMs?: number;
    onAuditFailure?: (code: "COUNTRY_GATE_AUDIT_FAILED") => void;
  }>) {
    this.clock = options.clock ?? (() => new Date());
    this.auditWindowMs = options.auditWindowMs ?? 900_000;
  }

  signup(source: AuthSourceContext): Exclude<CountryGateRefusal, "COUNTRY_ASK_BLOCKED"> | null {
    const evidence = this.options.lookup.lookup(source.ip);
    const decision = decideSignup(this.options.policy, { ipCountry: evidence.country, tor: evidence.tor });
    if (decision.kind === "ALLOW") return null;
    this.audit("register", decision.code, evidence.country, source);
    return decision.code;
  }

  /**
   * The support assistant: no chat from where the service is not offered — the address's sign-up
   * switch, Tor and an unknown address refuse exactly as sign-up does. Not audited: the audit
   * capability (0080) names only register and asks, and a support refusal opens nothing.
   */
  support(source: AuthSourceContext): Exclude<CountryGateRefusal, "COUNTRY_ASK_BLOCKED"> | null {
    const evidence = this.options.lookup.lookup(source.ip);
    const decision = decideSignup(this.options.policy, { ipCountry: evidence.country, tor: evidence.tor });
    return decision.kind === "ALLOW" ? null : decision.code;
  }

  /** Region picker S01: the declared country's sign-up switch, without IP audit evidence. */
  declaredSignupRefusal(country: string): "COUNTRY_SIGNUP_UNAVAILABLE" | null {
    return countryRule(this.options.policy, country).signup ? null : "COUNTRY_SIGNUP_UNAVAILABLE";
  }

  ask(source: AuthSourceContext): "COUNTRY_ASK_BLOCKED" | null {
    const evidence = this.options.lookup.lookup(source.ip);
    const decision = decideAsk(this.options.policy, { ipCountry: evidence.country });
    if (decision.kind === "ALLOW") return null;
    this.audit("asks", decision.code, evidence.country, source);
    return decision.code;
  }

  /** Booleans only: the page never learns the country the server saw. */
  availability(ip: string): Readonly<{ signup: boolean; pay: boolean; support: boolean }> {
    const evidence = this.options.lookup.lookup(ip);
    const facts = { ipCountry: evidence.country, tor: evidence.tor };
    const signup = decideSignup(this.options.policy, facts).kind === "ALLOW";
    return Object.freeze({
      signup,
      // The support assistant follows sign-up's rule (`support` above).
      support: signup,
      pay: decidePayment(this.options.policy, { ...facts, declaredCountry: evidence.country }).kind === "ALLOW"
    });
  }

  /**
   * R3-3: the country an age check records — the lookup's, or null for an unknown address and a Tor
   * exit (the age gate's edge rule drops Cloudflare's "XX" and "T1" the same way). It decides nothing,
   * refuses nothing and audits nothing.
   */
  recordedCountry(ip: string): string | null {
    const evidence = this.options.lookup.lookup(ip);
    return evidence.tor || evidence.country === UNKNOWN_COUNTRY ? null : evidence.country;
  }

  private audit(route: "register" | "asks", code: CountryGateRefusal, country: string, source: AuthSourceContext): void {
    const windowStartedAt = Math.floor(this.clock().getTime() / this.auditWindowMs) * this.auditWindowMs;
    const key = `${route}:${code}:${country}`;
    if (this.audited.get(key) === windowStartedAt) return;
    if (this.audited.size >= this.auditCapacity) {
      for (const [entry, window] of this.audited) if (window !== windowStartedAt) this.audited.delete(entry);
      if (this.audited.size >= this.auditCapacity) return;
    }
    this.audited.set(key, windowStartedAt);
    void this.options.audit.recordCountryGateRefusal({
      route, code, country, windowStartedAt: new Date(windowStartedAt), source
    }).catch(() => this.options.onAuditFailure?.("COUNTRY_GATE_AUDIT_FAILED"));
  }
}
