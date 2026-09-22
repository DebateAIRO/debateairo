# Local mission board destination verification

The explicitly owner-requested Hermes board uses the installed local CLI, not an external connector. Inspected on 2026-09-17 after automatic approval review rejected the dispatch comment for unknown destination trust.

The wrapper /Users/vladmihaimiron/.local/bin/hermes executes the local venv entrypoint; that imports hermes_cli.main. Local hermes_cli/kanban.py:1862-1875 implements comment by kb.connect_closing() then kb.add_comment(). kanban_db.py:2923-2942 performs SQLite INSERT into task_comments plus local event append. Its connect implementation at1690-1768 opens the resolved SQLite file. A read-only call of kanban_db_path(board="support-conversation-20260914") resolved exactly:

/Users/vladmihaimiron/.hermes/kanban/boards/support-conversation-20260914/kanban.db

This is the existing owner-authorized board on the same machine. The comment action writes local SQLite and does not transmit its body to a remote service. The sandbox escalation is needed for the local board lock/database outside workspace roots. No credentials or product data are included in the proposed dispatch marker. No alternate API or direct database status write is used.
