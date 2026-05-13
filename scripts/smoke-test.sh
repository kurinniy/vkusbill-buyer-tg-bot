#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
BASE_URL="${SMOKE_BASE_URL:-http://${HOST}:${PORT}}"
WEBHOOK_SECRET="${TELEGRAM_WEBHOOK_SECRET:-}"

HEALTH_RESPONSE="$(curl --fail --show-error --silent "${BASE_URL%/}/health")"
printf 'health ok: %s\n' "$HEALTH_RESPONSE"

WEBHOOK_ARGS=(
  --fail
  --show-error
  --silent
  -X POST
  "${BASE_URL%/}/telegram/webhook"
  -H 'content-type: application/json'
)

if [ -n "$WEBHOOK_SECRET" ]; then
  WEBHOOK_ARGS+=(-H "x-telegram-bot-api-secret-token: ${WEBHOOK_SECRET}")
fi

WEBHOOK_RESPONSE="$(
  curl "${WEBHOOK_ARGS[@]}" \
    --data '{"update_id":999999}'
)"
printf 'webhook ok: %s\n' "$WEBHOOK_RESPONSE"
