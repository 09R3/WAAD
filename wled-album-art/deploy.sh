#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  WLED Album Art Display — Unraid Deploy Script
#  Save this file to: /mnt/user/appdata/waad/deploy.sh
#  Run with:  bash /mnt/user/appdata/waad/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── Config (edit these) ───────────────────────────────────────────────────────
APPDATA_DIR="/mnt/user/appdata/waad"
REPO_URL="https://github.com/09R3/WAAD"
BRANCH="main"
SUBDIR="wled-album-art"        # subfolder inside repo
CONTAINER_NAME="waad"
IMAGE_NAME="waad"
HOST_PORT=3080                 # port exposed on Unraid
CONTAINER_PORT=3000            # port inside container
# ─────────────────────────────────────────────────────────────────────────────

ENV_FILE="$APPDATA_DIR/.env"
DATA_DIR="$APPDATA_DIR/data"
SOURCE_DIR="$APPDATA_DIR/_source"

echo ""
echo "══════════════════════════════════════════"
echo "  WLED Album Art Display Deploy"
echo "  Branch : $BRANCH"
echo "  Port   : $HOST_PORT"
echo "══════════════════════════════════════════"
echo ""

# ── 1. Create appdata dir if needed ──────────────────────────────────────────
mkdir -p "$APPDATA_DIR"
cd "$APPDATA_DIR"

# ── 2. First-run: create .env template and exit ───────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "[1/5] No .env found — creating template..."
    cat > "$ENV_FILE" <<'EOF'
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
# Set this to your Unraid server's LAN IP
SPOTIFY_REDIRECT_URI=http://YOUR_UNRAID_IP:3080/auth/callback
SERVER_PORT=3000
EOF

    echo ""
    echo "  ┌─────────────────────────────────────────────────┐"
    echo "  │  ACTION REQUIRED                                │"
    echo "  │  Edit your Spotify credentials:                │"
    echo "  │  $ENV_FILE"
    echo "  │                                                 │"
    echo "  │  1. Add your Spotify Client ID and Secret      │"
    echo "  │  2. Set SPOTIFY_REDIRECT_URI to your Unraid IP │"
    echo "  │  3. Add the redirect URI to your Spotify app   │"
    echo "  │  4. Re-run this script                         │"
    echo "  └─────────────────────────────────────────────────┘"
    echo ""
    exit 0
fi

# ── 3. Stop and remove existing container ────────────────────────────────────
echo "[1/5] Stopping old container (if running)..."
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop "$CONTAINER_NAME" >/dev/null && docker rm "$CONTAINER_NAME" >/dev/null
    echo "      Stopped and removed."
else
    echo "      No existing container found."
fi

# ── 4. Pull latest source ─────────────────────────────────────────────────────
echo "[2/5] Downloading latest code from GitHub..."
rm -rf "$SOURCE_DIR"

git clone \
    --depth 1 \
    --branch "$BRANCH" \
    --filter=blob:none \
    --sparse \
    --quiet \
    "$REPO_URL" \
    "$SOURCE_DIR"
cd "$SOURCE_DIR"
git sparse-checkout set "$SUBDIR"
BUILD_CONTEXT="$SOURCE_DIR/$SUBDIR"

cd "$APPDATA_DIR"
echo "      Done."

# ── 5. Build Docker image ─────────────────────────────────────────────────────
echo "[3/5] Building Docker image..."
docker build \
    --tag "$IMAGE_NAME" \
    --quiet \
    "$BUILD_CONTEXT"
echo "      Built."

# ── 6. Clean up source clone ──────────────────────────────────────────────────
echo "[4/5] Cleaning up source files..."
rm -rf "$SOURCE_DIR"
echo "      Done."

# ── 7. Run the container ──────────────────────────────────────────────────────
echo "[5/5] Starting container..."
mkdir -p "$DATA_DIR"
docker run \
    --detach \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --publish "${HOST_PORT}:${CONTAINER_PORT}" \
    --env-file "$ENV_FILE" \
    --volume "${DATA_DIR}:/app/data" \
    "$IMAGE_NAME" \
    >/dev/null

# ── Done ──────────────────────────────────────────────────────────────────────
HOST_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "  ┌──────────────────────────────────────────────────┐"
echo "  │  ✓  WLED Album Art Display is running!          │"
echo "  │                                                  │"
echo "  │  http://${HOST_IP}:${HOST_PORT}                  │"
echo "  │                                                  │"
echo "  │  Settings are persisted to:                      │"
echo "  │  $DATA_DIR"
echo "  │                                                  │"
echo "  │  To view logs:                                   │"
echo "  │  docker logs -f $CONTAINER_NAME                 │"
echo "  └──────────────────────────────────────────────────┘"
echo ""
