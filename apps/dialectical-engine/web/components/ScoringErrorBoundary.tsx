"use client";

import React from "react";
import type { ReactNode } from "react";

type ScoringErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
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

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <span className="scoreBadge unavailable" role="status" aria-live="polite">
            Scoring UI unavailable.
          </span>
        )
      );
    }

    return this.props.children;
  }
}
