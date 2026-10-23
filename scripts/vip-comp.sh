#!/usr/bin/env bash
# Owner-only: grant lifetime comp VIP by @handle. Needs PJ_ADMIN_SECRET in env (same as Vercel). DRY=1 to look up only.
# Usage: PJ_ADMIN_SECRET=... scripts/vip-comp.sh climbin richofftheball
set -euo pipefail
h=$(printf '"%s",' "$@"); dry=${DRY:+true}
curl -fsS -X POST "${PJ_URL:-https://portaljuice.app}/api/admin/vip-comp" -H "authorization: Bearer $PJ_ADMIN_SECRET" -H 'content-type: application/json' -d "{\"handles\":[${h%,}],\"dry\":${dry:-false}}"; echo
