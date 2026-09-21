# LIVE_P3 manual demonstration

Runtime: branch `codex/support-conversation-cp1`, revision `475c5a7e7eb8f48a3f5a81379f37b49fdd014ce9`, URL `https://localhost:3100/help`.

1. Open the URL with ordinary TLS validation. Expect the full Help desk, Support online status, EN selected, and no certificate interstitial.
2. Ask `How do I create a debate?`. Expect a grounded answer with human-readable sources and a **Start a debate** action. Activating it should open `https://localhost:3100/login?next=%2Fnew`; do not enter credentials for this demonstration.
3. Return to Help and ask `What can I change in Settings?`, then `How does JSON export work?`. Expect grounded explanations with visible source labels. The anonymous demonstration does not claim signed-in Settings or export execution.
4. Switch to RO and ask `Cum creez o dezbatere?`, `Ce pot schimba în Setări?`, and `Cum funcționează exportul JSON?`. Expect Romanian grounded answers and Romanian source labels; creation includes **Pornește o dezbatere**.
5. At `https://localhost:3100/`, open the compact Support widget, select RO, and ask `Cum creez o dezbatere?`. Tab to **Pornește o dezbatere** and press Enter. Expect `https://localhost:3100/login?next=%2Fnew`.
6. Forgot-password navigation is unavailable in this demonstration because its canonical owner-confirmed destination remains unresolved. Do not substitute Settings, saved MFA recovery codes, the recovery-start POST endpoint, or a guessed route.

The captured finite run sent each of the seven questions exactly once. It used the actual compiled UI, Support API, and unchanged support-preview relay with a fresh headless-browser profile and no TLS bypass, credentials, recovery submission, or synthetic Support override.

