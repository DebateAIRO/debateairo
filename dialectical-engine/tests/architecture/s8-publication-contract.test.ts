import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("Accounts S8 publication architecture", () => {
  it("adds private-default append-only latest-wins visibility without mutating core.run", async () => {
    const migration = await read("migrations/0039_publication_visibility.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS core.run_visibility_event");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS serve.publication_snapshot");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS identity.step_up_grant");
    expect(migration).not.toMatch(/target_run_id uuid[^\n]*REFERENCES core\.run/i);
    expect(migration).toContain("core.run_is_published");
    expect(migration).toMatch(/ORDER BY event\.at_seq DESC[\s\S]*LIMIT 1/i);
    expect(migration).toMatch(/run_visibility_event[\s\S]*reject_mutation/i);
    expect(migration).toMatch(/publication_snapshot[\s\S]*reject_mutation/i);
    expect(migration).toMatch(/BEFORE TRUNCATE ON core\.run_visibility_event/i);
    expect(migration).toMatch(/BEFORE TRUNCATE ON serve\.publication_snapshot/i);
    expect(migration).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON core\.run_visibility_event FROM debateai_runtime/i);
    expect(migration).toContain("core.transition_run_publication");
    expect(migration).toContain("identity.audit_publication_preflight_denial");
    const preflightDenial = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION identity.audit_publication_preflight_denial"),
      migration.indexOf("-- Session rotation and optional grant minting")
    );
    expect(preflightDenial).not.toContain("p_run_id");
    expect(preflightDenial).not.toContain("p_publication_ref");
    expect(preflightDenial).not.toContain("p_grant");
    expect(preflightDenial).toContain("'debate.publication_attempt'");
    expect(preflightDenial).toContain("'OMITTED_FOR_PREFLIGHT_DENIAL'");
    expect(migration).not.toContain("serve.append_publication_snapshot");
    expect(migration).not.toContain("core.append_run_visibility_event");
    expect(migration).not.toContain("core.lock_run_for_publication");
    expect(migration).toMatch(/transition_run_publication[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = pg_catalog/i);
    expect(migration).toContain("core.run_uses_content_encryption(p_run_id)");
    expect(migration).toMatch(/REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON identity\.step_up_grant FROM debateai_runtime/i);
    expect(migration).toContain("debateai_authorization_runtime");
    expect(migration).toMatch(/rotate_session_after_step_up[\s\S]*TO debateai_authorization_runtime/i);
    expect(migration).not.toMatch(/ALTER TABLE core\.run[\s\S]*(?:visibility|published)/i);
    expect(migration).not.toMatch(/UPDATE core\.run/i);
  });

  it("uses a publication-only key domain and performs key I/O outside database locks", async () => {
    const [crypto, publication, environment, main, erasureMigration] = await Promise.all([
      read("packages/crypto/src/index.ts"),
      read("packages/db/src/publication.ts"),
      read("packages/register/src/runtime-environment.ts"),
      read("apps/api/src/main.ts"),
      read("migrations/0040_account_erasure.sql")
    ]);
    expect(crypto).toContain("export interface PublicationKeyStore");
    expect(crypto).toContain("export class FilePublicationKeyStore");
    expect(crypto).toContain("export class PublicationCipher");
    expect(crypto).toContain("publication-key:");
    expect(crypto).toContain("publication-snapshot:");
    expect(environment).toContain("CORPUS_KEK_PATH");
    expect(environment).toContain("PUBLICATION_KEY_STORE_PATH");
    expect(environment).toContain("AUTHORIZATION_DATABASE_URL");
    expect(environment).toContain("AUTHORIZATION_DATABASE_URL_MUST_BE_SEPARATE");
    expect(main).toContain("assertPublicationDatabaseRoleSeparation");
    expect(main).toContain("authorizationPool");
    expect(main).toContain(
      "const authorizationPool = createPool(environment.AUTHORIZATION_DATABASE_URL!)"
    );
    expect(main).not.toMatch(
      /const authorizationPool = environment\.PUBLICATION_ENABLED === "true"/
    );
    expect(main).toContain("loadKek(environment.CORPUS_KEK_PATH");
    expect(main).toContain("FilePublicationKeyStore");
    const domainAttestation = main.slice(
      main.indexOf("assertPublicationSecretDomains({"),
      main.indexOf("});", main.indexOf("assertPublicationSecretDomains({"))
    );
    for (const secretPath of [
      "BLIND_INDEX_KEY_PATH",
      "AUDIT_SOURCE_IP_SALT_PATH",
      "AUDIT_KEY_STORE_PATH"
    ]) expect(domainAttestation).toContain(secretPath);
    expect(publication).toContain("session_user");
    expect(publication).toContain("rolsuper");
    expect(erasureMigration).toContain("debate.publication.denied");
    expect(publication).not.toContain("FileRunContentKeyStore");
    expect(publication).not.toContain("FileUserDekStore");
    expect(publication).not.toMatch(/INSERT INTO serve\.publication_snapshot/i);
    expect(publication).not.toMatch(/INSERT INTO core\.run_visibility_event/i);
    expect(publication).toContain("core.transition_run_publication");
    expect(publication).toContain("identity.publication_grant_is_live");

    const publish = publication.slice(
      publication.indexOf("async publish("),
      publication.indexOf("async unpublish(")
    );
    const unpublish = publication.slice(
      publication.indexOf("async unpublish("),
      publication.indexOf("async readPublic(")
    );
    expect(publish).not.toMatch(/(?:preparePublication|\.create\(|\.open\(|\.destroy\()/);
    expect(unpublish).not.toMatch(/(?:preparePublication|\.create\(|\.open\(|\.destroy\()/);
    expect(publication).not.toContain("this.pool.connect");
  });

  it("requires a one-use action/target/session-bound grant and an affirmative public warning", async () => {
    const [sessions, databaseSessions, api, contract] = await Promise.all([
      read("apps/api/src/sessions.ts"),
      read("packages/db/src/sessions.ts"),
      read("apps/api/src/index.ts"),
      read("packages/contract/src/index.ts")
    ]);
    expect(sessions).toContain("grantToken");
    expect(databaseSessions).toContain("identity.rotate_session_after_step_up");
    expect(databaseSessions).toContain("grantTokenHash");
    expect(api).toContain("PublishDebateRequestSchema");
    expect(api).toContain("step_up_grant");
    expect(api.match(/auditPreflightDenial\(/g)).toHaveLength(2);
    expect(contract).toContain("warning_acknowledged");
    expect(contract).toContain("z.literal(true)");
  });

  it("exposes a dedicated strict public contract and no anonymous owner-only carriers", async () => {
    const [contract, api] = await Promise.all([
      read("packages/contract/src/index.ts"),
      read("apps/api/src/index.ts")
    ]);
    const schema = contract.slice(
      contract.indexOf("export const PublicDebateSchema"),
      contract.indexOf("export type PublicDebate =")
    );
    expect(schema).toContain(".strict()");
    for (const forbidden of [
      "asker_id", "owner_ref", "user_id", "run_ref", "answer_id", "memory_disclosure",
      "ledger_digest_handle", "inspection_handle", "cost_envelope", "tier_provenance_ref"
    ]) expect(schema).not.toContain(forbidden);
    expect(api).toContain('GET /v1/public/debates/{id}');
    expect(api).not.toContain('GET /v1/public/debates/{id}/inspection');
    expect(api).not.toContain('GET /v1/public/debates/{id}/ledger-digest');
    expect(api).not.toContain('GET /v1/public/debates/{id}/events');
  });

  it("ships the deliberate controls and public-only reader in the UI composition", async () => {
    const [applicationControl, applicationHome, applicationPublic, englishHome, englishPublic] = await Promise.all([
      read("apps/ui/components/PublicationControl.tsx"),
      read("apps/ui/app/page.tsx"),
      read("apps/ui/app/public/debate/[id]/page.tsx"),
      readFile(join(process.cwd(), "apps/ui/messages/en/home.json"), "utf8"),
      readFile(join(process.cwd(), "apps/ui/messages/en/public.json"), "utf8")
    ]);
    const englishHomeCatalog = JSON.parse(englishHome) as Readonly<Record<string, string>>;
    const englishPublicCatalog = JSON.parse(englishPublic) as Readonly<Record<string, string>>;
    for (const control of [applicationControl]) {
      expect(control).toContain("stepUp(password, code");
      expect(control).toContain("publishRun(runId, grant.token)");
      expect(control).toContain("unpublishRun(runId, grant.token)");
      expect(control).toContain('type="checkbox"');
      expect(control).toContain('t(catalog, "public.publication.publishWarning")');
      expect(englishPublicCatalog["public.publication.publishWarning"]).toBe(
        "Publishing makes this debate readable by anyone and may allow search engines to index it. " +
        "It leaves your private deletion envelope, and public copies may persist even if you later " +
        "unpublish or delete your account."
      );
      expect(control).toContain('t(catalog, "public.publication.unpublishWarning")');
      expect(englishPublicCatalog["public.publication.unpublishWarning"]).toBe(
        "Unpublishing stops future anonymous reads from DebateAI, but copies already downloaded, " +
        "quoted, cached, or indexed may persist."
      );
    }
    // The home surface fetches the published list and states the indexing
    // warning; the row component owns the per-debate public link.
    const publicRows = await read("apps/ui/components/DebatesBuffer.tsx");
    for (const home of [applicationHome]) {
      expect(home).toContain("readPublicDebates(50, 0)");
      expect(home).toContain('t(catalog, "home.publicDebates")');
      expect(englishHomeCatalog["home.publicDebates"]).toBe("Public debates");
      expect(home).toContain("PublicDebatesBuffer");
      expect(home).toContain('t(catalog, "home.publicIndexingNotice")');
      expect(englishHomeCatalog["home.publicIndexingNotice"]).toBe(
        "Published debates may be indexed by search engines. Copies may persist after unpublishing."
      );
    }
    expect(publicRows).toContain("/public/debate/");
    expect(publicRows).toContain("author_pseudonym");

    // RESTORED 2026-09-20. Merge 690ebe14 resolved this file by taking one side
    // whole and discarded 10 of 10 lines of the branch side, among them the two
    // STRUCTURAL laws below. What survived is presence only, so a home page that
    // printed the indexing disclosure five times, above the list, satisfied this
    // contract completely. A discarded test cannot notice its own absence, and
    // the one other guard on this property (tests/render/t3-library.test.tsx) is
    // itself red because the same merge dropped the `data-library-row` attribute
    // it selects on -- so the law was guarded by a red test and nothing else.
    //
    // ADAPTED, not pasted. The discarded lines anchored on an inline
    // `published.items.map` and the `</article>` that closed each card. That
    // markup is gone for a real reason: the rows moved into
    // apps/ui/components/DebatesBuffer.tsx and the page now composes
    // `<PublicDebatesBuffer debates={published.items} />` inside `div.libList`.
    // The laws are therefore expressed against the list CONTAINER that replaced
    // the inline map. Both indices are pinned > -1 so the ordering cannot decay
    // into the vacuous shape swept in round 3: indexOf returns -1 for a missing
    // needle, and -1 is less than every real position.
    const disclosure = 't(catalog, "home.publicIndexingNotice")';
    const cardListStart = applicationHome.indexOf("<PublicDebatesBuffer");
    const cardListEnd = applicationHome.indexOf("</div>", cardListStart);
    const disclosureAt = applicationHome.indexOf(disclosure);
    expect(cardListStart).toBeGreaterThan(-1);
    expect(cardListEnd).toBeGreaterThan(cardListStart);
    expect(disclosureAt).toBeGreaterThan(-1);
    // LAW 1 — stated exactly once, so the page cannot repeat the warning.
    expect(applicationHome.match(/t\(catalog, "home\.publicIndexingNotice"\)/g) ?? [])
      .toHaveLength(1);
    // LAW 2 — stated AFTER the card list, so it reads as a note on the list.
    expect(disclosureAt).toBeGreaterThan(cardListEnd);
    const applicationPublicClient = await read("apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx");
    for (const page of [applicationPublic + applicationPublicClient]) {
      expect(page).toContain("readPublicDebate(id)");
      expect(page).toContain("PublicAnswerDisclosure");
      for (const forbidden of ["readInspection", "readLedgerDigest", "readEvents", "memory_disclosure"]) {
        expect(page).not.toContain(forbidden);
      }
    }
  });
});
