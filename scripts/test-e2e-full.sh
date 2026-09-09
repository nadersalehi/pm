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
docker run -d --name "$CONTAINER_NAME" -p 8000:8000 "$IMAGE_NAME" >/dev/null

echo "Waiting for the app to be ready..."
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/api/hello >/dev/null; then
    break
  fi
  sleep 1
done

(cd frontend && npx playwright test --config=playwright.full-stack.config.ts)
