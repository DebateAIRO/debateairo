import composeEnglish from "../messages/en/compose.json" with { type: "json" };
import { t, type MessageCatalog } from "./i18n/translate.js";

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

export function scrutinyStatus(catalog: MessageCatalog = composeEnglish): Record<string, ScrutinyStatus> {
  return {
    working: {
      label: t(catalog, "compose.scrutiny.status.investigating"),
      color: "var(--reasoning-line)",
      bg: "var(--reasoning-bg)",
      text: "var(--reasoning-text)"
    },
    contested: {
      label: t(catalog, "compose.scrutiny.status.contested"),
      color: "var(--dispute)",
      bg: "var(--dispute-bg)",
      text: "var(--dispute-text)"
    },
    strengthened: {
      label: t(catalog, "compose.scrutiny.status.strengthened"),
      color: "var(--agree-border)",
      bg: "var(--agree-bg)",
      text: "var(--agree-text)"
    },
    refuted: {
      label: t(catalog, "compose.scrutiny.status.refuted"),
      color: "var(--dispute-border)",
      bg: "var(--dispute-bg)",
      text: "var(--dispute-text)"
    }
  };
}

export const SCRUTINY_STATUS: Record<string, ScrutinyStatus> = scrutinyStatus();

export type ChallengeAction = {
  key: string;
  label: string;
  sub: string;
  icon: string;
};

export function challengeActions(catalog: MessageCatalog = composeEnglish): ChallengeAction[] {
  return [
    {
      key: "counter",
      label: t(catalog, "compose.challenge.counter.label"),
      sub: t(catalog, "compose.challenge.counter.hint"),
      icon: "⚔"
    },
    {
      key: "factcheck",
      label: t(catalog, "compose.challenge.factCheck.label"),
      sub: t(catalog, "compose.challenge.factCheck.hint"),
      icon: "◉"
    },
    {
      key: "weak",
      label: t(catalog, "compose.challenge.markWeak.label"),
      sub: t(catalog, "compose.challenge.markWeak.hint"),
      icon: "⚠"
    },
    {
      key: "reinterpret",
      label: t(catalog, "compose.challenge.reinterpret.label"),
      sub: t(catalog, "compose.challenge.reinterpret.hint"),
      icon: "↻"
    }
  ];
}

export const CHALLENGE_ACTIONS: ChallengeAction[] = challengeActions();
