import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "migrations/0055_register_support_publication.sql";

async function migrationSource(): Promise<string> {
  return readFile(migrationPath, "utf8").catch(() => "");
}

describe("REGISTER-SUPPORT-PUBLICATION schema source contract", () => {
  it("defines the allocated replay-safe schema and closed SQL capabilities", async () => {
    const source = await migrationSource();

    expect(source).toContain("register_version_id_seq");
    for (const column of [
      "base_register_version bigint",
      "publication_id uuid",
      "request_sha256 char(64)",
      "snapshot_sha256 char(64)",
      "publication_kind text",
      "recorded_at timestamptz"
    ]) expect(source).toContain(column);
    for (const object of [
      "register_row_register_version_fk",
      "register_version_base_register_version_fk",
      "register_version_publication_kind_check",
      "_assert_register_base_integrity",
      "allocate_register_version",
      "import_historical_register_version",
      "publish_register_version",
      "publish_support_configuration",
      "read_support_configuration_status"
    ]) expect(source).toContain(object);
    expect(source).toContain("debateai:register-publication:v3");
    expect(source).toContain("debateai:register-version:");
    expect(source).toContain("SECURITY DEFINER");
    expect(source).toContain("SET search_path = pg_catalog, register");
    expect(source).toContain("debateai_register_publication_owner");
    expect(source).toContain("debateai_support_config_operator");
    expect(source).toMatch(/NOINHERIT\s+NOLOGIN|NOLOGIN\s+NOINHERIT/iu);
    expect(source).toMatch(/REVOKE\s+INSERT[\s\S]+FROM\s+PUBLIC/iu);
    expect(source).toMatch(/REVOKE\s+INSERT[\s\S]+FROM\s+debateai_runtime/iu);
    expect(source).toMatch(/REVOKE\s+ALL[\s\S]+allocate_register_version[\s\S]+FROM\s+PUBLIC/iu);
  });

  it("forbids destructive, reverse-history, and credential-bearing migration SQL", async () => {
    const source = await migrationSource();
    const executable = source
      .replace(/--[^\n]*/gu, "")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/NOLOGIN/giu, "")
      .replace(/SUPPORT_CONFIG_VERSION_ROLLBACK/giu, "");

    expect(executable).not.toMatch(/\b(?:DROP|DELETE|CASCADE|PASSWORD|LOGIN)\b/iu);
    expect(executable).not.toMatch(/\b(?:UPDATE|ALTER)\b[\s\S]{0,160}\bregister_version\b[\s\S]{0,160}\b(?:SET|RESTART)\b/iu);
  });

  it("discovers exactly the allocated migration and the exact SQL port signatures", async () => {
    expect((await readdir("migrations")).filter((name) => /^0055.*[.]sql$/u.test(name)))
      .toEqual(["0055_register_support_publication.sql"]);
    const compact = (await migrationSource()).replace(/\s+/gu, " ");
    for (const signature of [
      /register[.]publish_register_version\s*\( p_publication_id uuid, p_request_sha256 char\(64\), p_base_register_version bigint, p_rows jsonb, p_source_ref text \)/u,
      /register[.]publish_support_configuration\s*\( p_publication_id uuid, p_request_sha256 char\(64\), p_expected_support_register_version bigint, p_base_register_version bigint, p_schema_version integer, p_patch jsonb, p_source_ref text \)/u,
      /register[.]read_support_configuration_status\s*\(\)/u
    ]) expect(compact).toMatch(signature);
    expect(compact).toContain("greatest( 4::bigint, coalesce(pg_catalog.max(register_version), 0::bigint) ) + 1");
    expect(compact).toContain("v_existing_next := v_last_value::numeric + CASE WHEN v_is_called THEN 1 ELSE 0 END");
    expect(compact).toContain("pg_catalog.setval( 'register.register_version_id_seq'::regclass, v_required_next, false )");
  });

  it("takes the global lock before every per-version lock and records time afterward", async () => {
    const source = await migrationSource();
    const block = (name: string): string => {
      const start = source.indexOf(`FUNCTION register.${name}`);
      const end = source.indexOf("$function$;", start);
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return source.slice(start, end);
    };
    for (const functionName of [
      "_register_row_insert_guard", "_register_version_seal_guard",
      "_assert_register_base_integrity",
      "import_historical_register_version", "publish_register_version",
      "publish_support_configuration"
    ]) {
      const body = block(functionName);
      const globalLock = body.indexOf("debateai:register-publication:v3");
      const versionLock = body.indexOf("debateai:register-version:");
      expect(globalLock).toBeGreaterThan(-1);
      expect(versionLock).toBeGreaterThan(globalLock);
      if (functionName.startsWith("publish_")) {
        expect(body.indexOf("clock_timestamp()")).toBeGreaterThan(versionLock);
      }
    }
  });

  it("pins canonical framing, the exact catalogue, marker-last sealing, and drift mutants", async () => {
    const source = await migrationSource();
    expect(source).toContain("pg_catalog.int8send(");
    expect(source).toContain("pg_catalog.octet_length(pg_catalog.convert_to(p_value, 'UTF8'))::bigint");
    expect(source).toContain("ORDER BY pg_catalog.convert_to(row_value.row_key, 'UTF8')");
    expect(source).toContain("REGISTER_PUBLICATION_DEFINITION_DRIFT: functions");
    expect(source).toContain("REGISTER_PUBLICATION_DEFINITION_DRIFT: allocator sequence");
    expect(source).toContain("REGISTER_PUBLICATION_BASE_INVALID");
    expect(source).toContain("v_actual_changed_keys");
    expect(source).toContain("debateai_runtime','debateai_replay','debateai_support");
    expect(source).toContain("'SUPPORT_MARKER:' || v_version::text");
    expect(source.indexOf("VALUES (v_version,'supportActivation',v_marker,p_source_ref)"))
      .toBeLessThan(source.indexOf("'SEAL:SUPPORT_CONFIGURATION:' || v_version::text"));
    const catalogue = [
      "support_enabled", "support_model_ref", "support_relay_concurrency",
      "support_daily_call_cap", "support_limit_anon_msgs_10m",
      "support_limit_anon_msgs_24h", "support_limit_anon_sessions_1h",
      "support_limit_session_msgs", "support_limit_msg_chars",
      "support_limit_account_msgs_10m", "support_limit_account_msgs_24h",
      "support_queue_depth", "support_lock_after_injections",
      "support_ip_cooldown_minutes", "support_retention_policy",
      "support_retention_ratified_by"
    ];
    const keyBlock = source.slice(
      source.indexOf("FUNCTION register._support_keys"),
      source.indexOf("$function$;", source.indexOf("FUNCTION register._support_keys"))
    );
    for (const key of catalogue) expect(keyBlock).toContain(`'${key}'`);
    expect((keyBlock.match(/'support_[a-z0-9_]+'/gu) ?? [])).toHaveLength(16);
  });

  it("declares closed volatile security-definer surfaces and explicit grants", async () => {
    const source = await migrationSource();
    for (const name of [
      "_register_row_insert_guard", "_register_version_seal_guard",
      "_assert_register_base_integrity",
      "allocate_register_version", "import_historical_register_version",
      "publish_register_version", "publish_support_configuration",
      "read_support_configuration_status"
    ]) {
      const start = source.indexOf(`FUNCTION register.${name}`);
      const end = source.indexOf("$function$;", start);
      const declaration = source.slice(start, end);
      expect(declaration).toContain("VOLATILE");
      expect(declaration).toContain("SECURITY DEFINER");
      expect(declaration).toContain("SET search_path = pg_catalog, register");
    }
    expect(source).toMatch(/REVOKE ALL ON FUNCTION register[.]publish_support_configuration[\s\S]+FROM debateai_runtime,debateai_replay/iu);
    expect(source).toMatch(/GRANT EXECUTE ON FUNCTION register[.]publish_support_configuration[\s\S]+TO debateai_support_config_operator/iu);
    expect(source).toMatch(/REVOKE ALL ON FUNCTION register[.]publish_register_version[\s\S]+FROM debateai_replay,debateai_support_config_operator/iu);
  });
});
