# PREVIEW API interface handoff

Author /root/preview released exactly apps/api/src/support/model.ts and tests/unit/support-model.test.ts at commit 1d84592c0d639dfebaea4ac3aa9cb0711555e251. Root independently checked the committed path set. Existing default/prod acceptance/refusal remains pinned; selected preview JSON adds one exact server-config marker for relay8894. Runtime provider/model unchanged.

Author evidence: PREVIEW-model-ratifier-green-r2.log reports3 files,6 passed/24 deliberately filtered skips; the targeted support-model matrix is4/4. PREVIEW-hermes-relay-green.log is3/3. Live PREVIEW-stack-live-r5.log passed API startup, then failed a later runner stage. This is stable API handoff, not a whole-preview readiness or independent code-review claim. Full support-model regression is part of NAV baseline/final cluster and bundle review. Author explicitly will not edit these files further; infrastructure remains in progress on disjoint paths.
