# ARCH-FIX-PES-S01-p3 — the exact S01-27 edits, applied to a MIRROR of the lane (never the lane). Usage:
#   python3 apply_s01_27.py <root> test      -> only the two audit-test rows (the RED half)
#   python3 apply_s01_27.py <root> manifest  -> only the manifest entry (the GREEN half)
# Each anchor must occur exactly once, else nothing is written.
import sys
root, part = sys.argv[1], sys.argv[2]
TEST = f"{root}/tests/architecture/p3-production-database-principals.test.ts"
MANIFEST = f"{root}/docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json"
def edit(path, old, new):
    s = open(path, encoding="utf-8").read()
    n = s.count(old)
    if n != 1: sys.exit(f"{path}: anchor occurs {n} times")
    open(path, "w", encoding="utf-8").write(s.replace(old, new))
if part == "test":
    # list 1: the migration owner's connectionPurposes, in manifest order (appended last)
    edit(TEST, '''            purpose: "PRODUCTION_PRINCIPAL_PROVISIONING",
            binding: "WIRED",
            condition: "package script db:provision-principals"
          }
        ]);''', '''            purpose: "PRODUCTION_PRINCIPAL_PROVISIONING",
            binding: "WIRED",
            condition: "package script db:provision-principals"
          },
          // provider-env-selection S01-27: the hosted provider-set publish command, an operator
          // command run on the VPS as the JIT migrator, like db:provision-principals above.
          {
            component: "apps/runner:hosted-provider-set-publish-cli",
            sourceFile: "apps/runner/src/hosted-provider-set-publish-cli.ts",
            environmentKey: "MIGRATION_DATABASE_URL",
            purpose: "HOSTED_PROVIDER_SET_PUBLICATION",
            binding: "WIRED",
            condition: "package script hosted:publish-provider-set"
          }
        ]);''')
    # list 2: every connection purpose, sorted before comparison (position is free; placed after its sibling)
    edit(TEST, '''        { component: "apps/runner:production-database-principals-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "PRODUCTION_PRINCIPAL_PROVISIONING", binding: "WIRED", condition: "package script db:provision-principals" },
''', '''        { component: "apps/runner:production-database-principals-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "PRODUCTION_PRINCIPAL_PROVISIONING", binding: "WIRED", condition: "package script db:provision-principals" },
        { component: "apps/runner:hosted-provider-set-publish-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "HOSTED_PROVIDER_SET_PUBLICATION", binding: "WIRED", condition: "package script hosted:publish-provider-set" },
''')
elif part == "manifest":
    edit(MANIFEST, '''          "purpose": "PRODUCTION_PRINCIPAL_PROVISIONING",
          "binding": "WIRED",
          "condition": "package script db:provision-principals"
        }
      ]''', '''          "purpose": "PRODUCTION_PRINCIPAL_PROVISIONING",
          "binding": "WIRED",
          "condition": "package script db:provision-principals"
        },
        {
          "component": "apps/runner:hosted-provider-set-publish-cli",
          "sourceFile": "apps/runner/src/hosted-provider-set-publish-cli.ts",
          "environmentKey": "MIGRATION_DATABASE_URL",
          "purpose": "HOSTED_PROVIDER_SET_PUBLICATION",
          "binding": "WIRED",
          "condition": "package script hosted:publish-provider-set"
        }
      ]''')
else:
    sys.exit("part must be test or manifest")
print(f"applied {part}")
