#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE_NAME="pm-app"
CONTAINER_NAME="pm-app"

docker build -t "$IMAGE_NAME" .

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --env-file .env \
  -p 8000:8000 \
  "$IMAGE_NAME"

echo "Running at http://localhost:8000"
