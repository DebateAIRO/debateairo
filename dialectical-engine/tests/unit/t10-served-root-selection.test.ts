import { describe, expect, it } from "vitest";

/**
 * T10 (goal 188-195; rulings S6-1, S6-3) — propagation chooses the served root,
 * configuration order does not.
 *
 * The baseline served `configuredProviderRoots[0]` under the named rule
 * `first-configured-provider`. Every assertion below states the DESIRED law:
 *
 *   served root = the maximum PROPAGATED strength among the servable maker
 *   roots; ties broken by lexicographic node id; the margin to the runner-up
 *   is a first-class recorded quantity, ABSENT when there is no runner-up.
 *
 * The imports are dynamic so the failure a stale build produces names the
 * missing production symbol instead of dying at module load.
 */

type Candidate = { readonly nodeId: string; readonly maker: string };

const strengthsFor = (
  entries: readonly (readonly [string, number])[]
): readonly { readonly nodeId: string; readonly strength: number }[] =>
  entries.map(([nodeId, strength]) => ({ nodeId, strength }));

async function runner(): Promise<typeof import("@debateai/runner")> {
  return import("@debateai/runner");
}

describe("T10 · the served root is the strongest root, not the first-configured one", () => {
  /**
   * THE RED. A constructed run whose FIRST configured provider authored the
   * WEAKER root: the answer must be served from the stronger root. On the
   * baseline this is the `first-configured-provider` rule's own answer, so the
   * assertion fails on the served node id.
   */
  it("serves the higher-strength root when the configured order puts it second", async () => {
    const { selectServedRootByStrength } = await runner();
    const configuredOrder: readonly Candidate[] = [
      { nodeId: "node:alpha", maker: "house-a" },
      { nodeId: "node:beta", maker: "house-b" }
    ];

    const selection = selectServedRootByStrength(
      configuredOrder,
      strengthsFor([["node:alpha", 0.31], ["node:beta", 0.72]])
    );

    expect(selection.root.nodeId).toBe("node:beta");
    expect(selection.servedStrength).toBe(0.72);
  });

  /** The same run with the configuration REVERSED serves the same root. */
  it("serves the same root under reversed configured-provider order", async () => {
    const { selectServedRootByStrength } = await runner();
    const strengths = strengthsFor([["node:alpha", 0.31], ["node:beta", 0.72]]);
    const forward: readonly Candidate[] = [
      { nodeId: "node:alpha", maker: "house-a" },
      { nodeId: "node:beta", maker: "house-b" }
    ];
    const reversed: readonly Candidate[] = [...forward].reverse();

    const forwardSelection = selectServedRootByStrength(forward, strengths);
    const reversedSelection = selectServedRootByStrength(reversed, strengths);

    expect(reversedSelection.root.nodeId).toBe(forwardSelection.root.nodeId);
    expect(reversedSelection.root.nodeId).toBe("node:beta");
    expect(reversedSelection.servedStrength).toBe(forwardSelection.servedStrength);
    expect(reversedSelection.margin).toEqual(forwardSelection.margin);
  });

  it("records the margin to the runner-up as a measured quantity", async () => {
    const { selectServedRootByStrength } = await runner();

    const selection = selectServedRootByStrength(
      [
        { nodeId: "node:alpha", maker: "house-a" },
        { nodeId: "node:beta", maker: "house-b" },
        { nodeId: "node:gamma", maker: "house-c" }
      ],
      strengthsFor([["node:alpha", 0.31], ["node:beta", 0.72], ["node:gamma", 0.5]])
    );

    // Runner-up is the SECOND-highest root, not the next configured one.
    expect(selection.runnerUp).toEqual({ nodeId: "node:gamma", strength: 0.5 });
    expect(selection.margin).toEqual({ kind: "MEASURED", value: 0.72 - 0.5 });
  });

  it("reports the margin ABSENT when a single servable root leaves no runner-up", async () => {
    const { selectServedRootByStrength } = await runner();

    const selection = selectServedRootByStrength(
      [{ nodeId: "node:only", maker: "house-a" }],
      strengthsFor([["node:only", 0.64]])
    );

    expect(selection.runnerUp).toBeNull();
    expect(selection.margin).toEqual({ kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" });
  });

  /**
   * The documented tiebreak. Equal strengths are decided by lexicographic node
   * id — deterministic, and independent of configured order (a tie is CONTESTED
   * under T11's ladder anyway, because its margin is 0 <= gamma).
   */
  it("breaks an exact strength tie on lexicographic node id, in either configured order", async () => {
    const { selectServedRootByStrength } = await runner();
    const strengths = strengthsFor([["node:aaa", 0.5], ["node:bbb", 0.5]]);

    const forward = selectServedRootByStrength(
      [{ nodeId: "node:bbb", maker: "house-b" }, { nodeId: "node:aaa", maker: "house-a" }],
      strengths
    );
    const reversed = selectServedRootByStrength(
      [{ nodeId: "node:aaa", maker: "house-a" }, { nodeId: "node:bbb", maker: "house-b" }],
      strengths
    );

    expect(forward.root.nodeId).toBe("node:aaa");
    expect(reversed.root.nodeId).toBe("node:aaa");
    expect(forward.tiebreak).toBe("LEXICOGRAPHIC_NODE_ID");
    expect(reversed.tiebreak).toBe("LEXICOGRAPHIC_NODE_ID");
    // A tie is a zero margin, never an absent one: T11 rung 2 must see it.
    expect(forward.margin).toEqual({ kind: "MEASURED", value: 0 });
  });

  it("does not claim a tiebreak when the winner is strictly strongest", async () => {
    const { selectServedRootByStrength } = await runner();

    const selection = selectServedRootByStrength(
      [{ nodeId: "node:alpha", maker: "house-a" }, { nodeId: "node:beta", maker: "house-b" }],
      strengthsFor([["node:alpha", 0.31], ["node:beta", 0.72]])
    );

    expect(selection.tiebreak).toBe("NOT_APPLIED");
  });

  it("names the new rule and never the retired one", async () => {
    const { selectServedRootByStrength, SERVED_ROOT_SELECTION_RULE } = await runner();

    const selection = selectServedRootByStrength(
      [{ nodeId: "node:alpha", maker: "house-a" }],
      strengthsFor([["node:alpha", 0.4]])
    );

    expect(selection.rule).toBe(SERVED_ROOT_SELECTION_RULE);
    expect(SERVED_ROOT_SELECTION_RULE).toBe("max-propagated-strength-lexicographic-tiebreak");
    expect(SERVED_ROOT_SELECTION_RULE).not.toBe("first-configured-provider");
  });

  it("stops loudly rather than defaulting when a servable root has no propagated strength", async () => {
    const { selectServedRootByStrength } = await runner();

    expect(() => selectServedRootByStrength(
      [{ nodeId: "node:alpha", maker: "house-a" }, { nodeId: "node:unpropagated", maker: "house-b" }],
      strengthsFor([["node:alpha", 0.31]])
    )).toThrowError(expect.objectContaining({ code: "SERVED_ROOT_STRENGTH_UNRESOLVED" }));
  });

  it("stops loudly when there is no servable root at all", async () => {
    const { selectServedRootByStrength } = await runner();

    expect(() => selectServedRootByStrength([], strengthsFor([]))).toThrowError(
      expect.objectContaining({ code: "SERVED_ROOT_UNRESOLVED" })
    );
  });

  it("freezes the selection so no consumer can rewrite the served decision", async () => {
    const { selectServedRootByStrength } = await runner();

    const selection = selectServedRootByStrength(
      [{ nodeId: "node:alpha", maker: "house-a" }, { nodeId: "node:beta", maker: "house-b" }],
      strengthsFor([["node:alpha", 0.31], ["node:beta", 0.72]])
    );

    expect(Object.isFrozen(selection)).toBe(true);
    expect(Object.isFrozen(selection.margin)).toBe(true);
  });
});
