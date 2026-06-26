# Developer Observability Logs

Developer-only observability writes local JSONL events to:

```sh
tail -f logs/developer-events.jsonl
```

Set `DEV_OBSERVABILITY=true` to force logging on, `DEV_OBSERVABILITY=false` to force it off, or `DEV_OBSERVABILITY_LOG_PATH` to choose another local sink.
