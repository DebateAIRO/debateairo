# PREVIEW investigation self-report

## Case finding

The root cause is endpoint topology encoded as unrelated constants in the supervisor, API environment, API/UI probes, provider panel, Support relay validator, Hatchet authority validation, TLS readiness, and Compose. A request that sounds like “use different UI/API ports” is therefore a data-integrity problem: `compose.dev.yaml:1,16-17,30-43` fixes one Compose project, one named PostgreSQL volume, and one Hatchet authority. Reusing that plane would let the CP1 lane migrate, provision, publish, and initialize state that the already-running source stack uses.

## Price

- One read-only pass traced 20 implementation/config files and 16 focused test files before a safe contract could be named.
- Twelve candidate preview ports had to be checked together. Six existing provider/API ports plus the private UI port were confirmed occupied; all twelve proposed preview ports were free at the measurement.
- No test/build/stack pass was spent because this seat had no heavy-command lease. Token usage is UNAVAILABLE in this runtime.

## What nearly went wrong

The tempting minimum was public/UI/API `3100/3101/8890` while reusing the existing PostgreSQL and Hatchet services. That would preserve network listeners but not data ownership. The static Compose project name (`debateai-v3`), shared volume, repeat migrations, role provisioning, register publication, Support configuration initialization, and Hatchet token authority make reuse unsafe for a changed review lane.

Another tempting shortcut was arbitrary port environment variables. That would spread unreviewed text substitutions into security-sensitive origin, cookie, provider, token, and proxy validation. The contract instead needs one allow-listed immutable profile selected by one environment value.

## Dead ends not to repeat

- Do not stop or adopt the existing stack.
- Do not run the stock `pnpm dev:auth:up` beside the occupied `3001` and `8790-8796` listeners.
- Do not share the default Compose project or PostgreSQL volume with CP1.
- Do not change only the TLS/UI/API ports; provider target parsing and Hatchet JWT authority checks will reject the result.
- Do not weaken system TLS trust, Host/Origin checks, Secure cookies, anonymous-session denial, or exact environment custody.
- Do not replace the Support model. Only its loopback relay endpoint changes; provider ref and model remain `development:hermes-glm-5.3-flash` / `z-ai/glm-5.3-flash`.

## Upgrade that removes the recurring cost

Add one immutable `support-preview` stack profile beside the unchanged default profile and thread the typed profile through every endpoint producer and validator. The profile owns the public origin, private UI/API, debate-provider relay ports, Support relay port, PostgreSQL port, Hatchet API/gRPC ports, and Compose project name. Accept only the absent/default value or the literal `support-preview`; reject every other value before the first side effect. This turns future preview requests into one supported command with a machine-checkable receipt instead of another repository-wide port hunt.

## Packet clarity defect

The packet says to load “the investigation role where applicable,” but the repository has no investigation role skill and the heartbeat router defines no investigation role. I applied the heartbeat universal laws plus the packet’s read-only investigation contract. The packet should name the intended role or explicitly say that no role-specific skill exists.

