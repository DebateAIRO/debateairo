import { describe, expect, it } from "vitest";
import {
  parseApiEnvironment,
  publicationCustodyOf
} from "../../packages/register/src/runtime-environment.js";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";

/**
 * NV-11 (security-audit run 3, K02). Publication key custody (the corpus KEK, the key store and the cleanup
 * principal) is separate from publication SERVING: an account or private-run erasure with publication history needs
 * the keys whether or not public pages are served. The two separation refinements follow custody, not the flag.
 */
describe("NV-11 · publication key custody is separate from publication serving", () => {
  it("custody is separate from serving", () => {
    expect(publicationCustodyOf({ PUBLICATION_ENABLED: "false" })).toEqual({ keys: false, cleanup: false });
    expect(publicationCustodyOf({
      PUBLICATION_ENABLED: "false",
      CORPUS_KEK_PATH: "/run/secrets/corpus-kek",
      PUBLICATION_KEY_STORE_PATH: "/run/secrets/publications"
    })).toEqual({ keys: true, cleanup: false });
    expect(publicationCustodyOf({
      PUBLICATION_ENABLED: "false",
      CORPUS_KEK_PATH: "/run/secrets/corpus-kek",
      PUBLICATION_KEY_STORE_PATH: "/run/secrets/publications",
      PUBLICATION_CLEANUP_DATABASE_URL: "postgresql://cleanup:pass@127.0.0.1:5432/debateai"
    })).toEqual({ keys: true, cleanup: true });
    expect(publicationCustodyOf({ PUBLICATION_ENABLED: "true" })).toEqual({ keys: true, cleanup: true });
  });

  it("a half pair (one custody path only) is not custody", () => {
    expect(publicationCustodyOf({
      PUBLICATION_ENABLED: "false",
      PUBLICATION_KEY_STORE_PATH: "/run/secrets/publications",
      PUBLICATION_CLEANUP_DATABASE_URL: "postgresql://cleanup:pass@127.0.0.1:5432/debateai"
    })).toEqual({ keys: false, cleanup: false });
    expect(publicationCustodyOf({
      PUBLICATION_ENABLED: "false",
      CORPUS_KEK_PATH: "/run/secrets/corpus-kek",
      PUBLICATION_CLEANUP_DATABASE_URL: "postgresql://cleanup:pass@127.0.0.1:5432/debateai"
    })).toEqual({ keys: false, cleanup: false });
  });

  it("parses a custody-only environment with publication off", () => {
    const fixture = validApiEnvironmentFixture();
    const environment = parseApiEnvironment({
      ...fixture,
      PUBLICATION_ENABLED: "false",
      CORPUS_KEK_PATH: "/run/secrets/corpus-kek",
      PUBLICATION_KEY_STORE_PATH: "/run/secrets/publications",
      PUBLICATION_CLEANUP_DATABASE_URL: "postgresql://cleanup:pass@127.0.0.1:5432/debateai"
    });
    expect(environment.PUBLICATION_ENABLED).toBe("false");
    expect(publicationCustodyOf(environment)).toEqual({ keys: true, cleanup: true });
  });

  it("custody with publication off still refuses aliased key domains", () => {
    const fixture = validApiEnvironmentFixture();
    expect(() => parseApiEnvironment({
      ...fixture,
      PUBLICATION_ENABLED: "false",
      CORPUS_KEK_PATH: fixture.KEK_PATH!,
      PUBLICATION_KEY_STORE_PATH: "/run/secrets/publications"
    })).toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");
    expect(() => parseApiEnvironment({
      ...fixture,
      PUBLICATION_ENABLED: "false",
      CORPUS_KEK_PATH: "/run/secrets/corpus-kek",
      PUBLICATION_KEY_STORE_PATH: fixture.USER_DEK_STORE_PATH!
    })).toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");
  });

  it("custody with publication off still refuses a shared cleanup URL", () => {
    const fixture = validApiEnvironmentFixture();
    for (const shared of [fixture.DATABASE_URL!, fixture.AUTHORIZATION_DATABASE_URL!]) {
      expect(() => parseApiEnvironment({
        ...fixture,
        PUBLICATION_ENABLED: "false",
        CORPUS_KEK_PATH: "/run/secrets/corpus-kek",
        PUBLICATION_KEY_STORE_PATH: "/run/secrets/publications",
        PUBLICATION_CLEANUP_DATABASE_URL: shared
      })).toThrow("PUBLICATION_CLEANUP_DATABASE_URL_MUST_BE_SEPARATE");
    }
  });

  it("control: the fixture alone (publication off, no custody) parses and holds no custody", () => {
    const environment = parseApiEnvironment(validApiEnvironmentFixture());
    expect(environment.PUBLICATION_ENABLED).toBe("false");
    expect(publicationCustodyOf(environment)).toEqual({ keys: false, cleanup: false });
  });
});
