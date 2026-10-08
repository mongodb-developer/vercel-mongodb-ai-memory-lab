#!/usr/bin/env bash
# Local preview of the Instruqt attendee view: code-server on http://localhost:8080, with the lab
# notebook, the Deno kernel and a fresh Atlas Local deployment next to it.
#
#   instruqt/local-preview/run.sh          # build (cached) and start in the background
#   instruqt/local-preview/run.sh fg       # same, but code-server stays in the foreground (Ctrl-C stops it)
#   instruqt/local-preview/run.sh stop     # remove both containers and the network
#
# The AI Gateway key comes from the lab's .env, mounted read-only. /etc/lab-env is loaded first by
# the notebook, so MONGODB_URI always points at the local Atlas container, never at .env's cluster.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NET=trailhead-preview
ATLAS=trailhead-atlas
UI=trailhead-webui

if [[ "${1:-}" == "stop" ]]; then
  docker rm -f "$UI" "$ATLAS" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  echo "stopped"; exit 0
fi

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null

if ! docker inspect "$ATLAS" >/dev/null 2>&1; then
  docker run -d --name "$ATLAS" --hostname localhost --network "$NET" \
    -e MONGODB_INITDB_ROOT_USERNAME=admin -e MONGODB_INITDB_ROOT_PASSWORD=mongodb \
    mongodb/mongodb-atlas-local:8.3.8 >/dev/null
fi

docker build -f "$ROOT/instruqt/local-preview/Dockerfile" -t "$UI" "$ROOT"

LAB_ENV="$(mktemp)"
printf 'MONGODB_URI="mongodb://admin:mongodb@%s:27017/?directConnection=true"\n' "$ATLAS" > "$LAB_ENV"

ENV_MOUNT=()
[[ -f "$ROOT/.env" ]] && ENV_MOUNT=(-v "$ROOT/.env:/root/labs/vercel-mongodb-ai-memory-lab/.env:ro")

docker rm -f "$UI" >/dev/null 2>&1 || true
RUN_ARGS=(--name "$UI" --network "$NET" -p 8080:8080 -v "$LAB_ENV:/etc/lab-env:ro" "${ENV_MOUNT[@]}" "$UI")

if [[ "${1:-}" == "fg" ]]; then
  echo "code-server: http://localhost:8080"
  exec docker run --rm "${RUN_ARGS[@]}"
fi
docker run -d "${RUN_ARGS[@]}" >/dev/null
echo "code-server: http://localhost:8080   (stop with: $0 stop)"
