#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCENARIO="${1:-websocket-chat}"
PROFILE_NAME="${2:-smoke}"
SCRIPT_PATH="$ROOT_DIR/tests/load/k6/$SCENARIO.js"

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "Unknown scenario: $SCENARIO" >&2
  echo "Available: websocket-chat, history-read, notification-flow" >&2
  exit 2
fi

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is required. Install it before running this script." >&2
  exit 2
fi

COMMIT="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_ID="${TEST_RUN_ID:-${SCENARIO}-${PROFILE_NAME}-${COMMIT}-${TIMESTAMP}}"
RESULT_DIR="$ROOT_DIR/tests/results/$SCENARIO/$RUN_ID"
mkdir -p "$RESULT_DIR"

export TEST_RUN_ID="$RUN_ID"
export TEST_SCENARIO="$SCENARIO"
export PROFILE="$PROFILE_NAME"
export DOCKER_COMPOSE_PROJECT="${DOCKER_COMPOSE_PROJECT:-config}"

node "$ROOT_DIR/scripts/testing/collect-test-metadata.js" "$RESULT_DIR/metadata.json"

collect_docker_stats() {
  local output_path="$1"
  local containers=()
  while IFS= read -r container; do
    [[ -n "$container" ]] && containers+=("$container")
  done < <(docker ps \
    --filter "label=com.docker.compose.project=$DOCKER_COMPOSE_PROJECT" \
    --format '{{.Names}}')

  if [[ ${#containers[@]} -gt 0 ]]; then
    docker stats --no-stream --format '{{json .}}' "${containers[@]}" > "$output_path"
  fi
}

if docker info >/dev/null 2>&1; then
  collect_docker_stats "$RESULT_DIR/docker-stats-before.ndjson"
fi

set +e
k6 run \
  --summary-export "$RESULT_DIR/summary.json" \
  --tag "test_run_id=$RUN_ID" \
  --tag "git_commit=$COMMIT" \
  --tag "profile=$PROFILE_NAME" \
  "$SCRIPT_PATH" > "$RESULT_DIR/k6.log" 2>&1
K6_STATUS=$?
set -e

if docker info >/dev/null 2>&1; then
  collect_docker_stats "$RESULT_DIR/docker-stats-after.ndjson"
fi

if [[ -f "$RESULT_DIR/summary.json" ]]; then
  node "$ROOT_DIR/scripts/testing/render-benchmark-report.js" \
    "$RESULT_DIR/summary.json" \
    "$RESULT_DIR/metadata.json" \
    "$RESULT_DIR/report.md"
fi

echo "Result directory: $RESULT_DIR"
echo "k6 exit status: $K6_STATUS"
exit "$K6_STATUS"
