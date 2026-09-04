import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { LawfulKind } from "@debateai/obs-capture";

const EXPECTED_KINDS = Object.freeze([
  "run",
  "work_item",
  "node",
  "attempt",
  "ledger_entry",
  "at_seq",
] as const);

const EXPECTED_FIELDS = Object.freeze({
  run: "run_ref",
  work_item: "work_item_ref",
  node: "node_ref",
  attempt: "attempt_ref",
  ledger_entry: "ledger_ref",
  at_seq: "at_seq_watermark",
} as const);

interface KindsSurface {
  readonly DECLARED_KINDS?: readonly string[];
  readonly DECLARED_KIND_FIELDS?: Readonly<Record<string, string>>;
  readonly UNKNOWN_DECLARED_KIND?: string;
  readonly declaredRef?: (kind: string, value: string) => unknown;
  readonly notApplicable?: (kind: string) => unknown;
}

async function loadKindsSurface(): Promise<KindsSurface> {
  return import("@debateai/obs-capture") as Promise<KindsSurface>;
}

// This function is never called. `pnpm typecheck` proves the public union is closed.
function compileTimeKindCheck(kind: LawfulKind): LawfulKind {
  // @ts-expect-error `session` is not a lawful correlation kind.
  compileTimeKindCheck("session");
  // @ts-expect-error `asker` is not a lawful correlation kind.
  compileTimeKindCheck("asker");
  // @ts-expect-error `session_id` is not a lawful correlation kind.
  compileTimeKindCheck("session_id");
  // @ts-expect-error `asker_id` is not a lawful correlation kind.
  compileTimeKindCheck("asker_id");
  return kind;
}
void compileTimeKindCheck;

describe("FIX-03 frozen declared kinds", () => {
  it("exports the six ratified kinds in their fixed order", async () => {
    const surface = await loadKindsSurface();

    expect(surface.DECLARED_KINDS).toEqual(EXPECTED_KINDS);
    expect(surface.DECLARED_KIND_FIELDS).toEqual(EXPECTED_FIELDS);
    expect(surface.UNKNOWN_DECLARED_KIND).toBe(
      "UNKNOWN:DECLARED_KIND_REQUIRED",
    );
    expect(Object.isFrozen(surface.DECLARED_KINDS)).toBe(true);
    expect(Object.isFrozen(surface.DECLARED_KIND_FIELDS)).toBe(true);
    expect(surface.DECLARED_KINDS).not.toContain("session");
    expect(surface.DECLARED_KINDS).not.toContain("asker");
    expect(surface.DECLARED_KINDS).not.toContain("session_id");
    expect(surface.DECLARED_KINDS).not.toContain("asker_id");
  });

  it("builds frozen present and positive-absence declarations", async () => {
    const surface = await loadKindsSurface();
    expect(surface.declaredRef).toBeTypeOf("function");
    expect(surface.notApplicable).toBeTypeOf("function");

    const value = randomUUID();
    const present = surface.declaredRef?.("run", value);
    const absent = surface.notApplicable?.("work_item");

    expect(present).toEqual({ kind: "run", value });
    expect(absent).toEqual({ kind: "work_item", not_applicable: true });
    expect(Object.isFrozen(present)).toBe(true);
    expect(Object.isFrozen(absent)).toBe(true);
  });
});
