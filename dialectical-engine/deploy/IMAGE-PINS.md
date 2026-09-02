# S00 compose image pins

- `hatchet-lite`: `ghcr.io/hatchet-dev/hatchet/hatchet-lite:latest@sha256:7198bda4d73021a9759d90c57f11f1dd2b32599b81f4c08a5a97ea4cf047c41a`
  - Resolution: GHCR registry API manifest HEAD, tag `latest`, 2026-08-07.
- `vllm`: `vllm/vllm-openai:latest@sha256:ffb2d59b1c059a5bd8d781320c9f5189de8293693b7d95da54befddaa54abf52`
  - Resolution: Docker Hub registry API manifest HEAD, tag `latest`, 2026-08-07 (NQ-3 ruling).
- `postgres`: `postgres:${POSTGRES_MAJOR_VERSION}@sha256:4ef4dbc939d61acea57712655ddb4b4ab27419c913f94cca0cd57cb3ea3c2280`.
  - Resolution: Docker Hub registry API manifest HEAD for `library/postgres:18`, 2026-09-02 (L6-F14); the digest is the OCI image index (linux/amd64 and linux/arm64/v8 included) and is identical for tags `18.6` and `18-trixie`, so the pin is PostgreSQL 18.6 on Debian trixie.
  - `pnpm compose:env` reads `register.bootstrap.json` and writes `.env.compose`; the embedded PostgreSQL binary reports 18.4 and the bootstrap equality pins the ruled major `18`. The digest pins the exact image beneath that major; to bump it, re-resolve the tag and update this file and `compose.dev.yaml` together.

The Hatchet digest is an exact audited compose build input, not a register row (`05-register-skeleton.md` §5.4c). RabbitMQ is intentionally absent.
