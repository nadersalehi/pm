#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE_NAME="pm-app-e2e"
CONTAINER_NAME="pm-app-e2e"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -t "$IMAGE_NAME" .
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
env_args=()
if [ -f .env ]; then
  env_args=(--env-file .env)
fi
docker run -d --name "$CONTAINER_NAME" "${env_args[@]}" -p 8000:8000 "$IMAGE_NAME" >/dev/null

echo "Waiting for the app to be ready..."
ready=false
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/api/health >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo "App did not become ready within 30s" >&2
  docker logs "$CONTAINER_NAME" >&2
  exit 1
fi

(cd frontend && npx playwright test --config=playwright.full-stack.config.ts)
