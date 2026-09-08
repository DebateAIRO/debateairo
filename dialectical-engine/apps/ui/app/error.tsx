"use client";

import { useEffect } from "react";

import { CLIENT_REPORTS, reportClientFault } from "../lib/obs/reporter.js";

export default function SegmentError({ error, reset }: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    void reportClientFault(CLIENT_REPORTS.segment);
  }, [error]);
  return (
    <main className="screen" role="alert">
      <h1>This view could not be displayed.</h1>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  );
}
