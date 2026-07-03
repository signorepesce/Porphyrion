#!/bin/bash
set -eu

IMAGE_NAME="porphyrion"
PORT=8099
STAMP_FILE=".deploy-stamp"

if command -v podman >/dev/null 2>&1; then
    ENGINE="podman"
elif command -v docker >/dev/null 2>&1; then
    ENGINE="docker"
else
    echo "Error: neither podman nor docker is installed." >&2
    exit 1
fi

# Fingerprint of everything that influences the image. If it matches the last
# deploy and the container is already up, there is nothing to do.
checksum() {
    find Makefile Dockerfile src include web resources -type f -print0 \
        | sort -z | xargs -0 shasum | shasum | cut -d ' ' -f 1
}

SUM=$(checksum)
RUNNING=$("$ENGINE" ps --format '{{.Names}}' 2>/dev/null | grep -cx "$IMAGE_NAME" || true)

if [ "${1:-}" != "--force" ] && [ "$RUNNING" = "1" ] \
   && [ -f "$STAMP_FILE" ] && [ "$(cat "$STAMP_FILE")" = "$SUM" ]; then
    echo "No changes since last deploy — already running on http://localhost:$PORT"
    echo "(use ./deploy.sh --force to rebuild anyway)"
    exit 0
fi

START_TIME=$(date +%s)

# Build FIRST: the old container keeps serving until the new image is ready.
echo "Building image with $ENGINE..."
"$ENGINE" build -t "$IMAGE_NAME" .

DURATION=$(( $(date +%s) - START_TIME ))
SIZE=$("$ENGINE" images --format '{{.Size}}' "$IMAGE_NAME" 2>/dev/null | head -n 1 || true)
VERSION=$(grep '^VERSION =' Makefile | cut -d '=' -f 2 | xargs)

"$ENGINE" rm -f "$IMAGE_NAME" >/dev/null 2>&1 || true
"$ENGINE" run --name "$IMAGE_NAME" --rm -d -p "$PORT:$PORT" \
    -v "$(pwd)/data:/data" -v "$(pwd)/web:/web:ro" "$IMAGE_NAME" >/dev/null

echo "$SUM" > "$STAMP_FILE"

echo "------------------------------------"
echo "  Porphyrion $VERSION ($ENGINE)"
echo "  Build time: ${DURATION}s"
echo "  Image size: ${SIZE}"
echo "  Running on http://localhost:$PORT"
echo "------------------------------------"
