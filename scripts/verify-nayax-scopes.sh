#!/usr/bin/env bash
#
# Verify which Nayax Lynx scopes were actually granted to an operator token.
#
# Companion to lib/api-status.ts: that page probes the endpoints the app already
# uses, this script probes the ones we've *requested* from Nayax but may not have
# been granted yet. Run it after Nayax says a grant has been applied.
#
# Writes are probed with requests guaranteed to fail AFTER the authorization
# check -- nonexistent resource ids, or payloads that cannot pass validation.
# No valid mutation is ever sent at a real resource, so a granted scope is
# detected without changing anything.
#
#   403          -> scope NOT granted
#   2xx          -> granted (read succeeded)
#   400/404/422  -> granted (cleared authz, rejected downstream)
#   401          -> token itself is bad or expired
#
# All paths use the /operational/v1 prefix. lynx.nayax.com 301-redirects bare
# /v1/... there, and curl downgrades a redirected POST/PUT to GET, which would
# silently turn every write probe into a meaningless read. Hit it directly.
#
# Correlation ids are captured from response headers so any still-denied scope
# can be handed straight back to Nayax support.
#
# Usage:
#   npm run verify:scopes
#
# The token is read from a hidden prompt so it never lands in shell history,
# `ps` output, or this repo. Override defaults with NAYAX_BASE,
# NAYAX_OPERATOR_ID, NAYAX_GHOST_MACHINE, NAYAX_GHOST_PRODUCT.

set -uo pipefail

BASE="${NAYAX_BASE:-https://lynx.nayax.com}"
API="/operational/v1"
OPERATOR_ID="${NAYAX_OPERATOR_ID:-}"

# Ids chosen to NOT exist, so update-by-id probes cannot touch live records.
GHOST_MACHINE="${NAYAX_GHOST_MACHINE:-999999999}"
GHOST_PRODUCT="${NAYAX_GHOST_PRODUCT:-999999999}"

if [ -z "${NAYAX_TOKEN:-}" ]; then
  printf 'Nayax token (input hidden): ' >&2
  read -rs NAYAX_TOKEN
  printf '\n' >&2
fi
[ -n "$NAYAX_TOKEN" ] || { echo "No token supplied." >&2; exit 1; }

if [ -z "$OPERATOR_ID" ]; then
  printf 'Operator id: ' >&2
  read -r OPERATOR_ID
fi

HDR_FILE="$(mktemp)"; BODY_FILE="$(mktemp)"
trap 'rm -f "$HDR_FILE" "$BODY_FILE"' EXIT

# Pull whatever correlation/request id the gateway returns, whatever it calls it.
correlation_id() {
  grep -iE '^(x-)?(correlation|request|trace)-?id:' "$HDR_FILE" 2>/dev/null \
    | head -1 | sed 's/^[^:]*: *//' | tr -d '\r'
}

# Bearer first, then raw Authorization -- mirrors the fallback in lib/nayax.ts.
call() {
  local method="$1" path="$2" body="${3:-}"
  local code auth
  for auth in "Bearer $NAYAX_TOKEN" "$NAYAX_TOKEN"; do
    if [ -n "$body" ]; then
      code=$(curl -sS --max-time 30 -o "$BODY_FILE" -D "$HDR_FILE" -w '%{http_code}' \
        -X "$method" -H "Authorization: $auth" -H "accept: application/json" \
        -H "content-type: application/json" --data "$body" "$BASE$path" 2>/dev/null)
    else
      code=$(curl -sS --max-time 30 -o "$BODY_FILE" -D "$HDR_FILE" -w '%{http_code}' \
        -X "$method" -H "Authorization: $auth" -H "accept: application/json" \
        "$BASE$path" 2>/dev/null)
    fi
    [ "$code" = "401" ] || [ "$code" = "403" ] || break
  done
  echo "${code:-000}"
}

verdict() {
  case "$1" in
    2*)          echo "GRANTED" ;;
    400|404|422) echo "GRANTED (cleared authz)" ;;
    403)         echo "NOT GRANTED" ;;
    401)         echo "BAD TOKEN" ;;
    3*)          echo "REDIRECT (wrong path prefix)" ;;
    000)         echo "NO RESPONSE" ;;
    *)           echo "INCONCLUSIVE" ;;
  esac
}

row() { printf '%-54s %-6s %-28s %s\n' "$1" "$2" "$3" "$4"; }

probe() {
  local label="$1" method="$2" path="$3" body="${4:-}"
  local code; code=$(call "$method" "$path" "$body")
  row "$label" "$code" "$(verdict "$code")" "$(correlation_id)"
}

echo
echo "Base: $BASE   Operator: $OPERATOR_ID"
echo "Ghost ids (must not exist): machine=$GHOST_MACHINE product=$GHOST_PRODUCT"
echo
row "ENDPOINT" "CODE" "VERDICT" "CORRELATION ID"
printf '%.0s-' {1..110}; echo

echo "READS"
probe "GET  $API/machines"                         GET  "$API/machines"
probe "GET  $API/devices"                          GET  "$API/devices"
probe "GET  $API/dashboard/widgets"                GET  "$API/dashboard/widgets"
probe "POST $API/dashboard/get-widget-data"        POST "$API/dashboard/get-widget-data" '{}'
probe "GET  $API/productGroups"                    GET  "$API/productGroups"
probe "GET  $API/operators/$OPERATOR_ID/products"  GET  "$API/operators/$OPERATOR_ID/products"
probe "GET  $API/products/{ghost}"                 GET  "$API/products/$GHOST_PRODUCT"

echo
echo "WRITES  (non-mutating probes)"
# Nonexistent id -> 404 proves write scope without touching a real SKU.
probe "PUT  $API/products/{ghost}"                 PUT  "$API/products/$GHOST_PRODUCT" '{}'
# Nonexistent machine -> never touches a live planogram.
probe "PUT  $API/machines/{ghost}/machineProducts" PUT  "$API/machines/$GHOST_MACHINE/machineProducts" '{}'
probe "POST $API/machines/{ghost}/machineProducts" POST "$API/machines/$GHOST_MACHINE/machineProducts" '{}'
# Create endpoints have no id to ghost: send a body that cannot pass validation.
probe "POST $API/productGroups"                    POST "$API/productGroups" '{"__probe":null}'
probe "POST $API/operators/$OPERATOR_ID/products"  POST "$API/operators/$OPERATOR_ID/products" '{"__probe":null}'
probe "POST $API/metadata/upload-picture"          POST "$API/metadata/upload-picture" '{"__probe":null}'

echo
cat <<'NOTE'
Reading the results
  NOT GRANTED (403) ....... scope missing; send the correlation id to Nayax.
  GRANTED (cleared authz) . 400/404/422 -- the request passed the permission
                            gate and failed on validation/existence instead.
                            That is the proof of grant; nothing was written.
  INCONCLUSIVE ............ 405 means the verb is wrong for that path; 5xx
                            means retry. Neither confirms nor denies the scope.

Caveat: this assumes Nayax evaluates authorization BEFORE validation. If a
gateway rejects a malformed body at the edge, a create-endpoint probe can show
400 while the scope is actually absent. The three ghost-id probes are immune to
this (the id is evaluated server-side), so trust those most, and treat the three
create probes as corroborating rather than conclusive.
NOTE
