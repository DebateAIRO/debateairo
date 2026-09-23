"use client";

import React from "react";
import type { ReactNode } from "react";
import { CLIENT_REPORTS, reportClientFault } from "../lib/obs/reporter.js";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import miscEnglish from "@/messages/en/misc.json";

type ScoringErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  catalog?: MessageCatalog;
};

type ScoringErrorBoundaryState = {
  hasError: boolean;
};

export class ScoringErrorBoundary extends React.Component<
  ScoringErrorBoundaryProps,
  ScoringErrorBoundaryState
> {
  state: ScoringErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ScoringErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    void reportClientFault(CLIENT_REPORTS.scoring);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <span className="scoreBadge unavailable" role="status" aria-live="polite">
            {t(this.props.catalog ?? miscEnglish, "misc.scoring.unavailable")}
          </span>
        )
      );
    }

    return this.props.children;
  }
}
