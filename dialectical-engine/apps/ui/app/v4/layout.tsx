import type { ReactNode } from "react";
import "./v4-base.css";
import "./v4-ask.css";
import "./v4-map.css";
import "./v4-debate.css";
import "./v4-report.css";

/* V4 initial (2026-10-28): the V4 pages live beside V3 under /v4 and share only the site's tokens (globals.css). */
export default function V4Layout({ children }: { children: ReactNode }) {
  return <div className="v4Root">{children}</div>;
}
