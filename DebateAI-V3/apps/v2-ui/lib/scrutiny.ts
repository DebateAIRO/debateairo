export type PopoverState = {
  nodeId: string;
  x: number;
  y: number;
  text: string;
};

export type ScrutinyStatus = {
  label: string;
  color: string;
  bg: string;
  text: string;
};

export const SCRUTINY_STATUS: Record<string, ScrutinyStatus> = {
  working: {
    label: "Investigating",
    color: "oklch(0.68 0.12 75)",
    bg: "oklch(0.95 0.05 78)",
    text: "oklch(0.5 0.08 65)"
  },
  contested: {
    label: "Contested",
    color: "oklch(0.7 0.13 70)",
    bg: "oklch(0.95 0.06 78)",
    text: "oklch(0.5 0.09 60)"
  },
  strengthened: {
    label: "Strengthened",
    color: "oklch(0.58 0.1 165)",
    bg: "oklch(0.95 0.03 165)",
    text: "oklch(0.43 0.07 165)"
  },
  refuted: {
    label: "Refuted",
    color: "oklch(0.56 0.1 45)",
    bg: "oklch(0.95 0.03 50)",
    text: "oklch(0.5 0.1 45)"
  }
};

export type ChallengeAction = {
  key: string;
  label: string;
  sub: string;
  icon: string;
};

export const CHALLENGE_ACTIONS: ChallengeAction[] = [
  { key: "counter", label: "Counter it", sub: "Spawn a focused opposing argument", icon: "⚔" },
  { key: "factcheck", label: "Fact-check", sub: "Ask for sources, then verify", icon: "◉" },
  { key: "weak", label: "Mark as weak", sub: "Flag as unsupported", icon: "⚠" },
  { key: "reinterpret", label: "Reinterpret", sub: "The claim was misread", icon: "↻" }
];
