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
    color: "var(--reasoning-line)",
    bg: "var(--reasoning-bg)",
    text: "var(--reasoning-text)"
  },
  contested: {
    label: "Contested",
    color: "var(--gold-line)",
    bg: "var(--gold-bg)",
    text: "var(--gold-text)"
  },
  strengthened: {
    label: "Strengthened",
    color: "var(--agree-border)",
    bg: "var(--agree-bg)",
    text: "var(--agree-text)"
  },
  refuted: {
    label: "Refuted",
    color: "var(--dispute-border)",
    bg: "var(--dispute-bg)",
    text: "var(--dispute-text)"
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
