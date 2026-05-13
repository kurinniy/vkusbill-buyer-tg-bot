#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"

curl --fail --show-error --silent "http://${HOST}:${PORT}/health"
