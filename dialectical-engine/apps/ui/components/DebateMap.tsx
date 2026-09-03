"use client";

import { useState } from "react";
import type { DebateNode } from "@/lib/types";
import { ROLE_PALETTES, renderStateOf, roleOf } from "@/lib/debatePresentation";

type DebateMapProps = {
  root: DebateNode;
  onOpenSplit: (nodeId: string) => void;
};

type Arc = {
  id: string;
  node: DebateNode;
  d: string;
  fill: string;
  depth: number;
  opacity: number;
};

const CX = 300;
const CY = 300;
const HUB_R = 46;
const GAP = 10;
const MAX_R = 286;
const RING_GAP = 5;
const START = -Math.PI / 2 + 0.012;

function leafCount(node: DebateNode): number {
  const kids = node.children || [];
  if (kids.length === 0) return 1;
  return kids.reduce((sum, child) => sum + leafCount(child), 0);
}

function treeDepth(node: DebateNode): number {
  const kids = node.children || [];
  if (kids.length === 0) return 0;
  return 1 + kids.reduce((max, child) => Math.max(max, treeDepth(child)), 0);
}

function polar(r: number, a: number): [number, number] {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function arcPath(rInner: number, rOuter: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0o, y0o] = polar(rOuter, a0);
  const [x1o, y1o] = polar(rOuter, a1);
  const [x1i, y1i] = polar(rInner, a1);
  const [x0i, y0i] = polar(rInner, a0);
  return `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i} Z`;
}

function fillFor(node: DebateNode): string {
  if (renderStateOf(node) === "empty") return "var(--surface-sunken)";
  const role = roleOf(node);
  if (role === "pro") return "var(--pro-line)";
  if (role === "con") return "var(--con-line)";
  return "var(--reasoning-line)";
}

export function DebateMap({ root, onOpenSplit }: DebateMapProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const maxDepth = Math.max(1, treeDepth(root));
  const ringW = (MAX_R - HUB_R - GAP - RING_GAP * (maxDepth - 1)) / maxDepth;
  const innerR = (depth: number) => HUB_R + GAP + (depth - 1) * (ringW + RING_GAP);

  const arcs: Arc[] = [];
  const place = (node: DebateNode, depth: number, a0: number, a1: number) => {
    if (depth >= 1) {
      arcs.push({
        id: node.id,
        node,
        d: arcPath(innerR(depth), innerR(depth) + ringW, a0, a1),
        fill: fillFor(node),
        depth,
        opacity: Math.max(0.3, 0.9 - (depth - 1) * 0.22)
      });
    }
    const kids = node.children || [];
    if (!kids.length) return;
    const totalW = kids.reduce((sum, child) => sum + leafCount(child), 0);
    const span = a1 - a0;
    let cur = a0;
    kids.forEach((child) => {
      const slice = (span * leafCount(child)) / totalW;
      const pad = Math.min(0.016, slice * 0.16);
      place(child, depth + 1, cur + pad / 2, cur + slice - pad / 2);
      cur += slice;
    });
  };
  place(root, 0, START, START + Math.PI * 2 - 0.024);

  const readoutNode = hoverId ? arcs.find((a) => a.id === hoverId)?.node ?? root : root;
  const readoutRole = roleOf(readoutNode);
  const readoutPal = readoutRole === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[readoutRole];

  return (
    <div className="map scroll">
      <div className="mapInner">
        <div className="mapLegend">
          <span className="mapLegendItem">
            <span className="mapLegendSwatch" style={{ background: "var(--pro-line)" }} />
            Supports
          </span>
          <span className="mapLegendItem">
            <span className="mapLegendSwatch" style={{ background: "var(--con-line)" }} />
            Opposes
          </span>
          <span className="mapLegendItem">
            <span className="mapLegendSwatch" style={{ background: "var(--reasoning-line)" }} />
            Reasoning
          </span>
          <span className="mapLegendHint">Ring = depth · width = the amount of debate below it</span>
        </div>

        <div className="mapStage" onMouseLeave={() => setHoverId(null)}>
          <svg viewBox="0 0 600 600" width="100%" style={{ display: "block", overflow: "visible" }}>
            {arcs.map((arc) => (
              <path
                key={arc.id}
                d={arc.d}
                fill={arc.fill}
                stroke="var(--core)"
                strokeWidth={2}
                opacity={(hoverId && hoverId !== arc.id ? 0.55 : 1) * arc.opacity}
                style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                onClick={() => onOpenSplit(arc.id)}
                onMouseEnter={() => setHoverId(arc.id)}
              >
                <title>{arc.node.claim}</title>
              </path>
            ))}
            <circle
              cx={CX}
              cy={CY}
              r={HUB_R}
              fill="var(--ink)"
              stroke="var(--bg)"
              strokeWidth={2.5}
              style={{ cursor: "pointer" }}
              onClick={() => {
                setHoverId(null);
                onOpenSplit(root.id);
              }}
            >
              <title>{root.claim}</title>
            </circle>
            <circle cx={CX} cy={CY} r={9} fill="none" stroke="var(--bg)" strokeWidth={2.5} />
            <circle cx={CX} cy={CY} r={2.4} fill="var(--bg)" />
          </svg>
        </div>

        <div className="mapReadoutShell">
          <div className="mapReadout" data-reference-map-readout>
            <span className="referenceStanceTab" style={{ background: readoutRole === "root" ? "var(--ink)" : readoutPal.line }} aria-hidden />
            <div className="nodeEyebrow">{readoutRole === "root" ? "Root claim" : readoutRole}</div>
            <div className="mapReadoutClaim">{readoutNode.claim}</div>
            <div className="mapReadoutFooter">
              <span>Hover a wedge to inspect · click to focus</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="nodeCtrl link" onClick={() => onOpenSplit(readoutNode.id)}>
                Open in Split ▸
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
