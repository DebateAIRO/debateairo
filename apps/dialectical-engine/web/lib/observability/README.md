# Developer Observability Logs

Developer-only observability writes local JSONL events to the server process filesystem:

```sh
tail -f logs/developer-events.jsonl
```

Set `DEV_OBSERVABILITY=true` to force logging on, `DEV_OBSERVABILITY=false` to force it off, or `DEV_OBSERVABILITY_LOG_PATH` to choose another local sink.

These logs are developer-only diagnostics. Do not persist them to the database, add migrations or log tables for them, or expose them through user-facing pages, components, or API surfaces.
