import type { Pool } from "pg";

const COUNTRY = /^[A-Z]{2}$/u;

/**
 * The sign-up country of the request's own account (migration 0192), through identity.read_registration_country only:
 * the country code, never the US state. A signed-in person's prices start from it. The database refuses (42501
 * REQUEST_OWNER_MISMATCH) unless the connection is that account's own, and that refusal reaches the caller as it is.
 */
export class PostgresRegistrationCountryReader {
  /** `pool`: the API's request login, which holds the billing role 0192 grants the function to. */
  constructor(private readonly pool: Pick<Pool, "query">) {}

  /** The country the account chose at sign-up, or null when it chose none. Rejects when the database refuses. */
  async read(ownerRef: string): Promise<string | null> {
    const result = await this.pool.query<{ country: string | null }>(
      "SELECT identity.read_registration_country($1) AS country",
      [ownerRef]
    );
    const country = result.rows[0]?.country ?? null;
    if (country !== null && !COUNTRY.test(country)) throw new Error("REGISTRATION_COUNTRY_INVALID");
    return country;
  }
}
