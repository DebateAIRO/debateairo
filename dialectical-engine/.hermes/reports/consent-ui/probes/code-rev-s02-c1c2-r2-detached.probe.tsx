// @vitest-environment jsdom
// CODE-REV-S02-C1C2 r2 — probe W3 (v2).  topmostSurface()'s unpinned branch: a registered
// surface whose container is non-null but DETACHED.  Measures (a) how jsdom compares such a
// node, (b) whether React 19 leaves containerRef.current pointing at the detached node — for
// BOTH callback-ref idioms (with and without a returned cleanup) and for an object ref.
import { act, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

describe("W3 — detached container", () => {
  it("W3a jsdom: an attached node compared against a detached one", () => {
    const attached = document.createElement("div");
    document.body.append(attached);
    const detached = document.createElement("div");
    const rel = attached.compareDocumentPosition(detached);
    console.log(
      `W3a rel=${rel}  DISCONNECTED=${!!(rel & 1)} FOLLOWING=${!!(rel & 4)} CONTAINED_BY=${!!(rel & 16)} ` +
        `IMPL_SPECIFIC=${!!(rel & 32)}  ->  topmostSurface()'s 'above' test = ${!!(rel & 16) || !!(rel & 4)}`
    );
    console.log(`W3a  detached.isConnected = ${detached.isConnected}  attached.isConnected = ${attached.isConnected}`);
    expect(rel & 1).toBe(1);
    attached.remove();
  });

  it("W3b React 19: does containerRef.current survive as a detached node?", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const results: Record<string, string> = {};

    for (const idiom of ["callback-no-return", "callback-with-cleanup", "object-ref"] as const) {
      const host = document.createElement("div");
      document.body.append(host);
      const root: Root = createRoot(host);
      const captured: { ref: { current: HTMLElement | null } | null } = { ref: null };

      function Surface({ open }: { open: boolean }): ReactNode {
        const containerRef = useRef<HTMLElement | null>(null);
        captured.ref = containerRef;
        if (!open) return null;
        if (idiom === "object-ref") return <div ref={containerRef as never}>x</div>;
        if (idiom === "callback-with-cleanup") {
          return (
            <div
              ref={(node) => {
                containerRef.current = node;
                return () => {};
              }}
            >
              x
            </div>
          );
        }
        return (
          <div
            ref={(node) => {
              containerRef.current = node;
            }}
          >
            x
          </div>
        );
      }

      await act(async () => root.render(<Surface open />));
      await act(async () => root.render(<Surface open={false} />));
      const cur = captured.ref!.current;
      results[idiom] =
        cur === null ? "null (safe)" : `NON-NULL, isConnected=${cur.isConnected} (stale detached node)`;
      await act(async () => root.unmount());
      host.remove();
    }
    console.log("W3b " + JSON.stringify(results, null, 1));
    vi.unstubAllGlobals();
    expect(Object.keys(results).length).toBe(3);
  });
});
