#!/usr/bin/env bash
# Seed id and dirname claims for the first-party PicOS apps, so no third-party
# repository can take them before the first public refresh.
#
#   ./scripts/seed-claims.sh ~/Projects/PicOS [--dry-run]
#
# Reads apps/*/app.json from the PicOS checkout given as $1 and writes
# claim:<id> and claim:dir:<dirname> (dirname lower-cased) = jeffory/picOS into the
# REMOTE PICOS_STORE_KV. Keys that already exist are left alone, so an app that has
# since moved to its own repository (and been claimed by it) is never overwritten.
set -euo pipefail

OWNER="jeffory/picOS"
ROOT="${1:-}"
DRY_RUN="${2:-}"

if [ -z "$ROOT" ] || [ ! -d "$ROOT/apps" ]; then
  echo "usage: $0 <path-to-PicOS-checkout> [--dry-run]" >&2
  exit 2
fi

put() {
  local existing
  if existing="$(npx wrangler kv key get --binding PICOS_STORE_KV --remote "$1" 2>/dev/null)"; then
    echo "keep $1 = $existing"
    return
  fi
  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "would put $1 = $OWNER"
  else
    npx wrangler kv key put --binding PICOS_STORE_KV --remote "$1" "$OWNER"
    echo "put $1 = $OWNER"
  fi
}

shopt -s nullglob
for manifest in "$ROOT"/apps/*/app.json; do
  dir_default="$(basename "$(dirname "$manifest")")"
  # Prints "<id>\t<dirname>", or nothing when the manifest has no usable id.
  fields="$(python3 -c '
import json, sys
path, fallback = sys.argv[1], sys.argv[2]
try:
    m = json.load(open(path))
except Exception as exc:
    print("skip %s: %s" % (path, exc), file=sys.stderr)
    raise SystemExit(0)
app_id = m.get("id")
if not isinstance(app_id, str) or not app_id:
    print("skip %s: no id" % path, file=sys.stderr)
    raise SystemExit(0)
dirname = m.get("dirname")
if not isinstance(dirname, str) or not dirname:
    dirname = app_id.split(".")[-1] or fallback
print("%s\t%s" % (app_id, dirname))
' "$manifest" "$dir_default")"
  [ -n "$fields" ] || continue
  IFS=$'\t' read -r app_id dirname <<<"$fields"
  put "claim:$app_id"
  put "claim:dir:${dirname,,}"
done
