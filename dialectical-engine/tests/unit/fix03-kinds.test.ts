import { randomUUID } from "node:crypto";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  declaredRef,
  notApplicable,
  type DeclaredRef,
  type LawfulKind,
  type NotApplicableRef,
  type ObsContext,
} from "@debateai/obs-capture";

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

type DeclaredRefConstructor = <K extends LawfulKind>(
  kind: K,
  value: string,
) => Readonly<DeclaredRef<K>>;

type NotApplicableConstructor = <K extends LawfulKind>(
  kind: K,
) => Readonly<NotApplicableRef<K>>;

// This function is never called. `pnpm typecheck` pins the public constructors.
function compileTimeConstructorCheck(): void {
  expectTypeOf(declaredRef).toEqualTypeOf<DeclaredRefConstructor>();
  expectTypeOf(notApplicable).toEqualTypeOf<NotApplicableConstructor>();

  const present = declaredRef("run", "550e8400-e29b-41d4-a716-446655440000");
  const absent = notApplicable("work_item");
  expectTypeOf(present).toEqualTypeOf<Readonly<DeclaredRef<"run">>>();
  expectTypeOf(absent).toEqualTypeOf<Readonly<NotApplicableRef<"work_item">>>();

  // @ts-expect-error An unlawful literal is rejected by the real constructor.
  declaredRef("session", "550e8400-e29b-41d4-a716-446655440000");
  // @ts-expect-error An unlawful literal is rejected by the real constructor.
  notApplicable("asker");

  const widenedKind: string = "run";
  // @ts-expect-error A widened string is not a closed lawful kind.
  declaredRef(widenedKind, "550e8400-e29b-41d4-a716-446655440000");
  // @ts-expect-error A widened string is not a closed lawful kind.
  notApplicable(widenedKind);

  const handBuiltAmbient: ObsContext = {
    run_ref: { kind: "session", value: "opaque" },
  };
  void handBuiltAmbient;
}
void compileTimeConstructorCheck;

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

  it("builds frozen present and positive-absence declarations", () => {
    const value = randomUUID();
    const present = declaredRef("run", value);
    const absent = notApplicable("work_item");

    expect(present).toEqual({ kind: "run", value });
    expect(absent).toEqual({ kind: "work_item", not_applicable: true });
    expect(Object.isFrozen(present)).toBe(true);
    expect(Object.isFrozen(absent)).toBe(true);
  });
});
