import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createSharedRedactor,
  type CaptureQueueEntry,
  type ObsContext,
  type PostRedactionEnvelope,
} from "@debateai/obs-capture";

const UNKNOWN = "UNKNOWN:DECLARED_KIND_REQUIRED";
const REF_FIELDS = Object.freeze([
  "run_ref",
  "work_item_ref",
  "node_ref",
  "attempt_ref",
  "ledger_ref",
  "at_seq_watermark",
] as const);

const REDACTOR_CONFIG = Object.freeze({
  environment: "test",
  build_ref: "UNTRACKED-DEV:fix03:test",
  build_dirty: true,
  runtime: "runner" as const,
  component: Object.freeze({ process: "runner", package: "@debateai/runner" }),
  writer_identity: "fix03-test",
  redaction_policy_version: "g0",
  allowlist_set_id: "g0-empty-parameters",
  now: () => new Date("2026-09-04T00:00:00.000Z"),
  sourceEventRef: () => "00000000-0000-4000-8000-000000000001",
});

const VALID_PAYLOAD = Object.freeze({
  code: "CALL_BUDGET_EXHAUSTED",
  taxonomy_class: "PROVIDER_EXHAUSTED",
  capture_point: "provider",
  disposition: "THROWN",
  source: "first_party",
});

function entry(
  ambientContext: ObsContext | undefined,
  handledContext?: unknown,
): CaptureQueueEntry {
  return Object.freeze({
    kind: "envelope" as const,
    payload_ref: VALID_PAYLOAD,
    ambient_context_ref: ambientContext,
    ...(handledContext === undefined
      ? {}
      : { handled_context_ref: handledContext }),
  });
}

function redact(ambientContext: ObsContext | undefined): PostRedactionEnvelope {
  return createSharedRedactor(REDACTOR_CONFIG).redact(entry(ambientContext));
}

function refs(envelope: PostRedactionEnvelope): Readonly<Record<string, string>> {
  return Object.fromEntries(REF_FIELDS.map((field) => [field, envelope[field]]));
}

describe("FIX-03 declared-kind projection", () => {
  it("copies every correctly declared value to its paired field", () => {
    const values = Object.freeze({
      run_ref: randomUUID(),
      work_item_ref: randomUUID(),
      node_ref: randomUUID(),
      attempt_ref: randomUUID(),
      ledger_ref: randomUUID(),
      at_seq_watermark: "9007199254740991",
    });
    const envelope = redact(Object.freeze({
      run_ref: Object.freeze({ kind: "run", value: values.run_ref }),
      work_item_ref: Object.freeze({
        kind: "work_item",
        value: values.work_item_ref,
      }),
      node_ref: Object.freeze({ kind: "node", value: values.node_ref }),
      attempt_ref: Object.freeze({
        kind: "attempt",
        value: values.attempt_ref,
      }),
      ledger_ref: Object.freeze({
        kind: "ledger_entry",
        value: values.ledger_ref,
      }),
      at_seq_watermark: Object.freeze({
        kind: "at_seq",
        value: values.at_seq_watermark,
      }),
    }));

    expect(refs(envelope)).toEqual(values);
  });

  it("keeps positive absence distinct from an undeclared field", () => {
    const envelope = redact(Object.freeze({
      run_ref: Object.freeze({ kind: "run", not_applicable: true }),
    }));

    expect(envelope.run_ref).toBe("NOT_APPLICABLE");
    expect(envelope.work_item_ref).toBe(UNKNOWN);
  });

  it.each([
    ["bare UUID", { run_ref: randomUUID() }],
    ["unlawful kind", { run_ref: { kind: "session", value: randomUUID() } }],
    ["session-id kind", { run_ref: { kind: "session_id", value: randomUUID() } }],
    ["asker-id kind", { run_ref: { kind: "asker_id", value: randomUUID() } }],
    ["wrong-field kind", { run_ref: { kind: "work_item", value: randomUUID() } }],
    ["missing value", { run_ref: { kind: "run" } }],
    [
      "value and absence together",
      { run_ref: { kind: "run", value: randomUUID(), not_applicable: true } },
    ],
    ["uppercase UUID", { run_ref: { kind: "run", value: randomUUID().toUpperCase() } }],
    ["UUID with whitespace", { run_ref: { kind: "run", value: ` ${randomUUID()}` } }],
    ["zero sequence", { at_seq_watermark: { kind: "at_seq", value: "0" } }],
    ["leading-zero sequence", { at_seq_watermark: { kind: "at_seq", value: "01" } }],
    [
      "unsafe sequence",
      { at_seq_watermark: { kind: "at_seq", value: "9007199254740992" } },
    ],
  ])("rejects %s without minimizing the event", (_name, context) => {
    const envelope = redact(Object.freeze(context));

    expect(envelope.run_ref).toBe(UNKNOWN);
    expect(envelope.at_seq_watermark).toBe(UNKNOWN);
    expect(envelope.fallback_minimized).toBe(false);
  });

  it("ignores inherited field and declaration properties", () => {
    const inheritedField = Object.create({
      run_ref: { kind: "run", value: randomUUID() },
    }) as ObsContext;
    const inheritedDeclaration = Object.create({
      kind: "run",
      value: randomUUID(),
    });

    expect(redact(inheritedField).run_ref).toBe(UNKNOWN);
    expect(redact(Object.freeze({ run_ref: inheritedDeclaration })).run_ref).toBe(
      UNKNOWN,
    );
  });

  it("forces all six fields to the sentinel in zone context", () => {
    const canaries = Object.freeze({
      run_ref: randomUUID(),
      work_item_ref: randomUUID(),
      node_ref: randomUUID(),
      attempt_ref: randomUUID(),
      ledger_ref: randomUUID(),
    });
    const envelope = redact(Object.freeze({
      run_ref: { kind: "run", value: canaries.run_ref },
      work_item_ref: { kind: "work_item", value: canaries.work_item_ref },
      node_ref: { kind: "node", value: canaries.node_ref },
      attempt_ref: { kind: "attempt", value: canaries.attempt_ref },
      ledger_ref: { kind: "ledger_entry", value: canaries.ledger_ref },
      at_seq_watermark: { kind: "at_seq", value: "42" },
      zone_context: true,
    }));
    const serialized = JSON.stringify(envelope);

    expect(refs(envelope)).toEqual(Object.fromEntries(
      REF_FIELDS.map((field) => [field, UNKNOWN]),
    ));
    for (const value of Object.values(canaries)) {
      expect(serialized).not.toContain(value);
    }
  });

  it("never treats handled context as a declaration channel", () => {
    const canary = randomUUID();
    const envelope = createSharedRedactor(REDACTOR_CONFIG).redact(Object.freeze({
      kind: "handled_error" as const,
      payload_ref: Object.freeze({ code: "CALL_BUDGET_EXHAUSTED" }),
      ambient_context_ref: undefined,
      handled_context_ref: Object.freeze({
        run_ref: Object.freeze({ kind: "run", value: canary }),
      }),
    }));

    expect(envelope.run_ref).toBe(UNKNOWN);
    expect(JSON.stringify(envelope)).not.toContain(canary);
  });

  it("keeps a lawful ambient declaration on the minimized fallback path", () => {
    const runRef = randomUUID();
    const envelope = createSharedRedactor(REDACTOR_CONFIG).redact(Object.freeze({
      kind: "envelope" as const,
      payload_ref: Object.freeze({
        ...VALID_PAYLOAD,
        forbidden_extra_key: "forces-fallback",
      }),
      ambient_context_ref: Object.freeze({
        run_ref: Object.freeze({ kind: "run", value: runRef }),
      }),
    }));

    expect(envelope.code).toBe("OBS_CAPTURE_SELF");
    expect(envelope.fallback_minimized).toBe(true);
    expect(envelope.run_ref).toBe(runRef);
  });

  it("still suppresses fallback refs when the ambient context is a zone", () => {
    const runRef = randomUUID();
    const envelope = createSharedRedactor(REDACTOR_CONFIG).redact(Object.freeze({
      kind: "envelope" as const,
      payload_ref: Object.freeze({
        ...VALID_PAYLOAD,
        forbidden_extra_key: "forces-fallback",
      }),
      ambient_context_ref: Object.freeze({
        run_ref: Object.freeze({ kind: "run", value: runRef }),
        zone_context: true,
      }),
    }));

    expect(envelope.fallback_minimized).toBe(true);
    expect(envelope.run_ref).toBe(UNKNOWN);
    expect(JSON.stringify(envelope)).not.toContain(runRef);
  });

  it("is total when hostile proxies throw during property access", async () => {
    const surface = await import("@debateai/obs-capture") as unknown as {
      readonly projectDeclaredRefs?: (
        context: ObsContext | undefined,
        zoneContext: boolean,
      ) => Readonly<Record<string, string>>;
    };
    expect(surface.projectDeclaredRefs).toBeTypeOf("function");
    const hostile = new Proxy(Object.create(null) as ObsContext, {
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor trap");
      },
    });

    expect(() => surface.projectDeclaredRefs?.(hostile, false)).not.toThrow();
    expect(surface.projectDeclaredRefs?.(hostile, false)).toEqual(Object.fromEntries(
      REF_FIELDS.map((field) => [field, UNKNOWN]),
    ));
  });
});
