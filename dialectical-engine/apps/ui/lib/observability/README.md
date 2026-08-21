# Developer Observability Logs

Developer-only observability writes local JSONL events to the server process filesystem:

```sh
tail -f logs/developer-events.jsonl
```

Set `DEV_OBSERVABILITY=true` to force logging on, `DEV_OBSERVABILITY=false` to force it off, or `DEV_OBSERVABILITY_LOG_PATH` to choose another local sink.
When neither flag is set, logging is enabled only for `NODE_ENV=development`.

Each line is one redacted JSON object. Suspicious product-truth events are warning-severity events with a queryable category:

```sh
jq 'select(.category=="suspicious")' logs/developer-events.jsonl
```

These logs are developer-only diagnostics. Do not persist them to the database, add migrations or log tables for them, or expose them through user-facing pages, components, or API surfaces.
