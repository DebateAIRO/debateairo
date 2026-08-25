# T1 Rework9 full-gate recovery correction1 — same Grok review packet

Review only the single stopped-controller vocabulary correction. Do not execute
recovery, launchctl, bootstrap, bootout, supervisor, worker, viewer, Vitest,
PostgreSQL, or any heavy command.

The prior review is SHA-256
`56320c9bbe4e9123e6ec6673154ea5a2dc3182187bd20874794ecfc0396ec9d3`
with raw status zero. It approved the future supervisor/parser and all other
recovery design, but found that the old recovery required `state = exited` while
the preserved live controller print uses `state = not running`, `last exit code
= 0`, and no numeric PID.

Review these corrected artifacts:

- recovery tool — `30decab681b96f3a2fa8e3b0acc0ff0ed37a5fb13bbe08535260621fb34deac5`
- authority — `44a9a30121c2669ac5a1be1ac4e06ec5af764f88d881577edf9fa263e44c265b`
- deterministic fixture — `4a625b6290b8db97fce9c5ea2a57c6f73d3152ac7a2982290db203e408706a9b`
- contract — `8caf1baa66f781125fe6151b95f71bc883fe61d560141b24e148545ed8515d8f`
- aggregate static checker — `abe6292d3e7c833c4f851ce1c1b15e5706c469c61f0961b403159bc20ae2ca0e`
- custody checker — `f38081c3468f60e9124abe8df4e792f7e4bf815a81c5d8d12bd61c8fd6330eaf`

Required result: the tool accepts only exact anchored launchctl lines with state
`not running` or `exited`; it still requires exact `last exit code = 0` and
rejects any numeric `pid = N`. The returned receipt records the actual matched
state. The authority uses
`present_not_running_or_exited_last_exit_0_no_pid`, and the tool explicitly
verifies that field plus the exact controller/worker labels and worker-absent
state. No other recovery binding may weaken.

RED/GREEN evidence:

- RED raw1 — `044029b8611f6df7b172b21bcc05a9282825913175e879981d8220ddb0123d69`
- GREEN raw0 — `92c88f5b277f9e98250ef2096afd1abe792dc16fd60fa774d36836a8dcd45437`
- final static raw0 — `ebdda161e9c8fbcf2c48f09906fd133a3bd5105677bd7ccb6d7e90558dfdf828`
- final custody raw0 — `c61f7fcc8589d3b20b880df469f9a6c5a02c26db9dc0120a7560d20112742f27`
- correction manifest — `3b8009e7374955179582e56cb0d390c58b9c6180f7eb77cfc9f4ad7e0b00407e`
- correction self-report — `ef53314d36dbf83ad7465b7baaa254e4a7709de6287dd8fdcefc38cdbae64f43`

The fixture must prove old-matcher rejection of the exact `not running`
vocabulary, GREEN acceptance of both allowed states, and fail-closed mutations
of state, last exit code, and PID.

Frozen unchanged custody: HEAD
`7918f4f8bff33909792afc01dc38d402972b4ccd`, staged zero, 12/12 governed,
lock `16777233/47087786`, claim inode/SHA
`47087814/d51149eb7036f6c4ccf7557982e13d7860e3efffcbf6439d8aa129b80b939c86`,
receipt tree `e88564b645e626c6844b11530665f0c7d425b522b466d7eeec2b6738388545b9`,
private tree `a220d9932e1e9b4a073722a42aa64d70ca6d640cb4096fac956d7797621ea07f`
including frozen `tsx-501`. Recovery outputs remain absent.

If accepted, return exact marker:

`GROK REWORK9 FULL GATE RECOVERY CORRECTION1 APPROVED`
