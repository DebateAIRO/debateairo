"use client";

import { useEffect } from "react";

import { CLIENT_REPORTS, reportClientFault } from "../lib/obs/reporter.js";

export default function GlobalError({ error, reset }: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    void reportClientFault(CLIENT_REPORTS.global);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <main role="alert">
          <h1>The application could not be displayed.</h1>
          <button type="button" onClick={reset}>Try again</button>
        </main>
      </body>
    </html>
  );
}
