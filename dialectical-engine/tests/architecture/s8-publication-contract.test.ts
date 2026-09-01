import { readFile } from "node:fs/promises";
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

  it("ships the same deliberate controls and public-only reader in both UI compositions", async () => {
    const [applicationControl, webControl, applicationHome, webHome, applicationPublic, webPublic] = await Promise.all([
      read("apps/ui/components/PublicationControl.tsx"),
      read("web/components/PublicationControl.tsx"),
      read("apps/ui/app/page.tsx"),
      read("web/app/page.tsx"),
      read("apps/ui/app/public/debate/[id]/page.tsx"),
      read("web/app/public/debate/[id]/page.tsx")
    ]);
    for (const control of [applicationControl, webControl]) {
      expect(control).toContain("stepUp(password, code");
      expect(control).toContain("publishRun(runId, grant.token)");
      expect(control).toContain("unpublishRun(runId, grant.token)");
      expect(control).toContain('type="checkbox"');
      expect(control).toContain("search engines to index it");
      expect(control.toLowerCase()).toContain("copies already");
    }
    for (const home of [applicationHome, webHome]) {
      expect(home).toContain("readPublicDebates(50, 0)");
      expect(home).toContain("Published debates");
      expect(home).toContain("/public/debate/");
    }
    const disclosure =
      "Published debates may be indexed by search engines. Copies may persist after unpublishing.";
    const applicationMapStart = applicationHome.indexOf("published.items.map");
    const applicationCardEnd = applicationHome.indexOf("</article>", applicationMapStart);
    expect(applicationHome.match(/Published debates may be indexed by search engines/g) ?? []).toHaveLength(1);
    expect(applicationHome.indexOf(disclosure)).toBeGreaterThan(applicationCardEnd);

    const webMapStart = webHome.indexOf("published.items.map");
    const webPublicCard = webHome.slice(webMapStart, webHome.indexOf("</article>", webMapStart));
    expect(webPublicCard).toContain("may be indexed by search engines");
    expect(webPublicCard).toContain("Copies may persist after unpublishing");
    const applicationPublicClient = await read("apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx");
    for (const page of [applicationPublic + applicationPublicClient, webPublic]) {
      expect(page).toContain("readPublicDebate(id)");
      expect(page).toContain("PublicAnswerDisclosure");
      for (const forbidden of ["readInspection", "readLedgerDigest", "readEvents", "memory_disclosure"]) {
        expect(page).not.toContain(forbidden);
      }
    }
  });
});
