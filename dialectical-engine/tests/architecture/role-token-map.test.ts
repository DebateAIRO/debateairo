import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

/**
 * DESIGN provenance, never derived from the shipped bindings:
 * - design-document-original.html:388:
 *   `accentsFor(dk) = { pro: t.pro, con: t.con, reasoning: dk ? '#C8A055' : '#3D5A80' }`
 * - design-document-text.txt:575: "gold is reserved for reasoning & verdict."
 * Token family roles come from architecture/token-inventory.md:111-211. In
 * particular, Terracotta reasoning is slate `--reasoning-*`, never `--gold-*`.
 */

const paths = {
  page: "apps/ui/app/debate/[id]/DebatePageClient.tsx",
  guide: "apps/ui/components/GuideModal.tsx",
  map: "apps/ui/components/DebateMap.tsx",
  canvas: "apps/ui/components/DebateCanvas.tsx",
  models: "apps/ui/components/ModelPresentation.tsx",
  presentation: "apps/ui/lib/debatePresentation.ts",
  scrutiny: "apps/ui/lib/scrutiny.ts",
  synthesis: "apps/ui/components/SynthesisPanel.tsx",
  css: "apps/ui/app/globals.css"
} as const;

type SourceName = keyof typeof paths;
type RoleExpectation = {
  surface: string;
  role: string;
  actual: string;
  family: RegExp;
};

const sources = Object.fromEntries(
  Object.entries(paths).map(([name, path]) => [name, readFileSync(resolve(process.cwd(), path), "utf8")])
) as Record<SourceName, string>;

function capturedToken(source: SourceName, pattern: RegExp): string {
  return sources[source].match(pattern)?.[1] ?? "<unbound>";
}

function objectAt(source: SourceName, anchor: string): string {
  const text = sources[source];
  const anchorAt = text.indexOf(anchor);
  if (anchorAt === -1) return "";
  const start = text.lastIndexOf("{", anchorAt + anchor.length);
  const end = text.indexOf("\n  }", anchorAt);
  return start === -1 || end === -1 ? "" : text.slice(start, end + 4);
}

function objectToken(source: SourceName, anchor: string, property: string): string {
  const match = objectAt(source, anchor).match(new RegExp(`\\b${property}:\\s*"var\\((--[\\w-]+)\\)"`));
  return match?.[1] ?? "<unbound>";
}

function expectRole({ surface, role, actual, family }: RoleExpectation): void {
  if (!family.test(actual)) {
    throw new Error(`${surface}: expected role ${role}, but actually binds ${actual}`);
  }
}

const roles = {
  pro: /^--pro(?:$|-)/,
  con: /^--con(?:$|-)/,
  reasoning: /^--reasoning(?:$|-)/,
  agree: /^--agree(?:$|-)/,
  dispute: /^--dispute(?:$|-)/,
  generation: /^--gen(?:$|-)/,
  uncertainty: /^--score-uncertainty(?:$|-)/,
  strength: /^--score-strength(?:$|-)/,
  stateSurface: /^--surface-sunken$/,
  goldVerdict: /^--gold(?:$|-)/
} as const;

const expected: RoleExpectation[] = [
  {
    surface: "DebateMap empty-state arc",
    role: "state surface",
    actual: capturedToken("map", /renderStateOf\(node\) === "empty"\) return "var\((--[\w-]+)\)"/),
    family: roles.stateSurface
  },
  {
    surface: "DebateMap pro arcs",
    role: "pro stance",
    actual: capturedToken("map", /role === "pro"\) return "var\((--[\w-]+)\)"/),
    family: roles.pro
  },
  {
    surface: "DebateMap con arcs",
    role: "con stance",
    actual: capturedToken("map", /role === "con"\) return "var\((--[\w-]+)\)"/),
    family: roles.con
  },
  {
    surface: "DebateMap reasoning arcs",
    role: "reasoning accent",
    actual: capturedToken("map", /return "var\((--reasoning[\w-]*)\)";\n}/),
    family: roles.reasoning
  },
  {
    surface: "DebateMap Supports legend",
    role: "pro stance",
    actual: capturedToken("map", /mapLegendSwatch" style=\{\{ background: "var\((--[\w-]+)\)" \}\} \/>\n\s*Supports/),
    family: roles.pro
  },
  {
    surface: "DebateMap Opposes legend",
    role: "con stance",
    actual: capturedToken("map", /mapLegendSwatch" style=\{\{ background: "var\((--[\w-]+)\)" \}\} \/>\n\s*Opposes/),
    family: roles.con
  },
  {
    surface: "DebateMap root hub",
    role: "reasoning accent",
    actual: capturedToken("map", /r=\{HUB_R}\s+fill="var\((--[\w-]+)\)"/),
    family: roles.reasoning
  },
  {
    surface: "DebateCanvas pro stance tab",
    role: "pro stance",
    actual: capturedToken("canvas", /case "pro":\s+stanceLine = "var\((--[\w-]+)\)"/),
    family: roles.pro
  },
  {
    surface: "DebateCanvas con stance tab",
    role: "con stance",
    actual: capturedToken("canvas", /case "con":\s+stanceLine = "var\((--[\w-]+)\)"/),
    family: roles.con
  },
  {
    surface: "DebateCanvas reasoning stance tab",
    role: "reasoning accent (not Terracotta gold)",
    actual: capturedToken("canvas", /case "reasoning":\s+stanceLine = "var\((--[\w-]+)\)"/),
    family: roles.reasoning
  },
  {
    surface: "DebateCanvas empty/abandoned/failed card",
    role: "state surface",
    actual: capturedToken("canvas", /state === "empty" \|\| state === "abandoned" \|\| state === "failed"[\s\S]*?background: "var\((--[\w-]+)\)"/),
    family: roles.stateSurface
  },
  {
    surface: "DebateCanvas agreed review mark",
    role: "agreed review verdict",
    actual: capturedToken("canvas", /compactReview === "agreed"\s+\? "var\((--[\w-]+)\)"/),
    family: roles.agree
  },
  {
    surface: "DebateCanvas disputed review mark",
    role: "disputed review verdict",
    actual: capturedToken("canvas", /compactReview === "disputed"\s+\? "var\((--[\w-]+)\)"/),
    family: roles.dispute
  },
  {
    surface: "Guide live-generation icon",
    role: "generation state",
    actual: objectToken("guide", 'title: "Live generation"', "iconBg"),
    family: roles.generation
  },
  {
    surface: "Guide stance icon fill",
    role: "pro stance",
    actual: objectToken("guide", 'title: "Who said what, and which side"', "iconBg"),
    family: roles.pro
  },
  {
    surface: "Guide reasoning icon",
    role: "reasoning accent (not Terracotta gold)",
    actual: objectToken("guide", 'title: "Who said what, and which side"', "iconColor"),
    family: roles.reasoning
  },
  {
    surface: "Guide challenge icon fill",
    role: "score uncertainty chrome",
    actual: objectToken("guide", 'title: "Challenge a flaw anywhere"', "iconBg"),
    family: roles.uncertainty
  },
  {
    surface: "Guide challenge icon text",
    role: "score uncertainty chrome",
    actual: objectToken("guide", 'title: "Challenge a flaw anywhere"', "iconColor"),
    family: roles.uncertainty
  },
  {
    surface: "Guide compare/switch/export icon",
    role: "state surface",
    actual: objectToken("guide", 'title: "Compare, switch, export"', "iconBg"),
    family: roles.stateSurface
  },
  {
    surface: "Adaptive-depth expand chip",
    role: "score strength state",
    actual: capturedToken("page", /item\.expansion_hint === "expand" \? "var\((--[\w-]+)\)"/),
    family: roles.strength
  },
  {
    surface: "Adaptive-depth meter track",
    role: "state surface",
    actual: capturedToken("page", /className="adaptiveDepthMeter"[\s\S]*?background: "var\((--[\w-]+)\)"/),
    family: roles.stateSurface
  },
  {
    surface: "Adaptive-depth high-pressure meter",
    role: "disputed/high-risk state",
    actual: capturedToken("page", /item\.pressure === "high"\s+\? "var\((--[\w-]+)\)"/),
    family: roles.dispute
  },
  {
    surface: "Adaptive-depth medium-pressure meter",
    role: "generation/intermediate state",
    actual: capturedToken("page", /item\.pressure === "medium"\s+\? "var\((--[\w-]+)\)"/),
    family: roles.generation
  },
  {
    surface: "Adaptive-depth low-pressure meter",
    role: "agreed/healthy state",
    actual: capturedToken("page", /item\.pressure === "medium"[\s\S]*?: "var\((--[\w-]+)\)"\s*\n\s*}\}/),
    family: roles.agree
  },
  {
    surface: "Synthesis verdict label",
    role: "gold verdict treatment",
    actual: capturedToken("css", /\.synthCardLabel\.verdict\s*\{[\s\S]*?color:\s*var\((--[\w-]+)\)/),
    family: roles.goldVerdict
  }
];

for (const [palette, family, role] of [
  ["pro", roles.pro, "pro stance"],
  ["con", roles.con, "con stance"]
] as const) {
  for (const property of ["text", "bg", "border", "line"] as const) {
    expected.push({
      surface: `ROLE_PALETTES.${palette}.${property}`,
      role,
      actual: objectToken("presentation", `  ${palette}: {`, property),
      family
    });
  }
}

for (const [tier, family, role] of [
  ["working", roles.reasoning, "reasoning scrutiny"],
  ["contested", roles.dispute, "disputed scrutiny"],
  ["strengthened", roles.agree, "agreed scrutiny"]
] as const) {
  for (const property of ["color", "bg", "text"] as const) {
    expected.push({
      surface: `scrutiny ${tier}.${property}`,
      role,
      actual: objectToken("scrutiny", `  ${tier}: {`, property),
      family
    });
  }
}

// `refuted` is deliberately not blessed by this role oracle: its current
// contested/refuted collision is the ARCH-owned exception t_41f2950f. The
// six-pair distinctness matrix, not this family map, owns that correction.
for (const [maker, token] of [
  ["anthropic", "--m-claude"],
  ["openai", "--m-gpt"],
  ["google", "--m-gemini"],
  ["xai", "--m-grok"],
  ["alibaba", "--m-qwen"]
] as const) {
  expected.push({
    surface: `model identity ${maker}`,
    role: `model identity ${token}`,
    actual: capturedToken("models", new RegExp(`case "${maker}":\\s+return "var\\((--[\\w-]+)\\)"`)),
    family: new RegExp(`^${token}$`)
  });
}
expected.push({
  surface: "model identity fallback",
  role: "model identity --m-default",
  actual: capturedToken("models", /default:\s+return "var\((--[\w-]+)\)"/),
  family: /^--m-default$/
});

describe("R2-C1 design-derived role to token-family oracle", () => {
  it.each(expected)("$surface binds its $role role", (row) => {
    // PROPERTY: a surface may retoken within its role family, but rebinding it
    // to another legal family's token is a semantic regression.
    expectRole(row);
  });

  it("reserves raw gold bindings for named verdict/reasoning treatments", () => {
    // PROPERTY: generic T1 chrome cannot couple itself to raw gold merely
    // because another role currently resolves to the same bytes.
    for (const sourceName of ["page", "guide", "map", "canvas", "models", "presentation", "scrutiny", "synthesis"] as const) {
      const lines = sources[sourceName].split("\n");
      lines.forEach((line, index) => {
        for (const match of line.matchAll(/var\((--gold[\w-]*)\)/g)) {
          throw new Error(
            `${paths[sourceName]}:${index + 1}: expected role non-gold T1 surface ` +
            `(gold is reserved for reasoning/verdict), but actually binds ${match[1]}`
          );
        }
      });
    }
  });
});
