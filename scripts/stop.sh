#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="pm-app"

if docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Stopped."
else
  echo "Not running."
fi
