"use client";

import type { CSSProperties } from "react";
import type { DebateNode } from "@/lib/types";
import { ROLE_PALETTES, flattenOutline, renderStateOf, roleLabel, roleOf } from "@/lib/debatePresentation";
import { modelMeta } from "@/lib/models";

export function DebateOutline({ root }: { root: DebateNode }) {
  const rows = flattenOutline(root);

  return (
    <div className="outline scroll">
      <div className="outlineInner">
        <div className="nodeEyebrow">Root claim</div>
        <h1 className="outlineRoot">{root.claim}</h1>
        {rows.map(({ node, depth }) => {
          const role = roleOf(node);
          const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
          const empty = renderStateOf(node) === "empty";
          const generation = node.active_generation;
          const model = generation ? modelMeta(generation.model_id) : null;
          const rowStyle: CSSProperties = {
            marginLeft: depth * 26,
            borderLeftColor: empty ? "oklch(0.85 0.006 80)" : pal.line,
            background: empty ? "var(--surface-sunken)" : pal.bg
          };
          return (
            <div key={node.id} className="outlineRow" style={rowStyle}>
              <div className="outlineRowHead">
                <span className="outlineRole" style={{ color: pal.text }}>
                  {pal.arrow} {roleLabel(node)}
                </span>
                {model ? (
                  <span className="metaLine">
                    <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
                    {model.name}
                  </span>
                ) : null}
              </div>
              <div className="outlineClaim">{empty ? "No strong argument found." : node.claim}</div>
              {!empty && generation?.argument ? <div className="outlineBody">{generation.argument}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
