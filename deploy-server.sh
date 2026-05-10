#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# deploy-server.sh — Build & deploy the relay server to an EC2 instance
#
# Usage:
#   ./deploy-server.sh <ssh-key> <api-key> <user>@<hostname-or-ip> [ssh-port]
#
# Examples:
#   ./deploy-server.sh ~/.ssh/dev-pietro.pem "my-secret-key" ubuntu@54.123.45.67
#   ./deploy-server.sh ~/.ssh/dev-pietro.pem "key1,key2" deploy@my-server.com 2222
#
# What it does:
#   1. Builds the TypeScript project
#   2. Creates a .env file with the API key(s) on the remote EC2
#   3. Uploads the build and starts the server (Docker or direct Node)
#
# Environment variables (optional):
#   USE_DOCKER   — "true" or "false" (default: true)
#   DEPLOY_PATH  — remote directory (default: ~/llm-tinkerer/server)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Arguments ────────────────────────────────────────────────────────────────
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <ssh-key> <api-key> <user>@<host> [ssh-port]"
  echo ""
  echo "  ssh-key     — path to the .pem SSH key (e.g. ~/.ssh/dev-pietro.pem)"
  echo "  api-key     — single key or comma-separated keys (e.g. 'key1,key2')"
  echo "  user@host   — SSH user and EC2 hostname/IP"
  echo "  ssh-port    — SSH port (default: 22)"
  exit 1
fi

SSH_KEY="$1"
API_KEY="$2"
USER_HOST="$3"
SSH_PORT="${4:-22}"

# ── Config ───────────────────────────────────────────────────────────────────
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes -i "$SSH_KEY")
# scp on macOS uses uppercase -P for port (lowercase -p means "preserve timestamps")
SCP_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes -i "$SSH_KEY" -P "$SSH_PORT")
USE_DOCKER="${USE_DOCKER:-true}"
DEPLOY_PATH="${DEPLOY_PATH:-~/llm-tinkerer/server}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "❌ SSH key not found: $SSH_KEY"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"

# ── Helpers ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
NC='\033[0m'

ok()  { echo -e "${GREEN}✓ $*${NC}"; }

# Cleanup temp files on exit
TMP_TAR=""
trap 'rm -f "$TMP_TAR"' EXIT

# ── Step 0: Build locally ────────────────────────────────────────────────────
echo "🔨 Building server..."
cd "$SERVER_DIR"
npm install          # full install (includes tsc for build)
npm run build
ok "Build complete"

# ── Step 1: Upload & deploy ─────────────────────────────────────────────────
echo "📦 Uploading to ${USER_HOST}..."

# Create the .env content first
ENV_CONTENT="SERVER_API_KEYS=${API_KEY}"

# SSH into EC2, set up the directory, and write the .env
ssh "${SSH_OPTS[@]}" -p "$SSH_PORT" "${USER_HOST}" \
  "mkdir -p '${DEPLOY_PATH}'"

echo "$ENV_CONTENT" | \
  ssh "${SSH_OPTS[@]}" -p "$SSH_PORT" "${USER_HOST}" \
  "cat > '${DEPLOY_PATH}/.env'"

ok ".env created on remote (SERVER_API_KEYS set)"

# Tar up the built project (exclude node_modules — installed remotely or by Docker)
TMP_TAR=$(mktemp -t llm-server-build.XXXXXX.tar.gz)
tar czf "$TMP_TAR" \
  --exclude=node_modules \
  -C "$SERVER_DIR" \
  . dist

scp "${SCP_OPTS[@]}" "$TMP_TAR" "${USER_HOST}:/tmp/llm-build.tar.gz"
rm -f "$TMP_TAR"
ok "Build artifacts uploaded"

# Deploy on remote
echo "🚀 Deploying..."
ssh "${SSH_OPTS[@]}" -p "$SSH_PORT" "${USER_HOST}" <<'REMOTE'
set -e

DEPLOY_PATH="$DEPLOY_PATH"
USE_DOCKER="$USE_DOCKER"
DEPLOY_PATH="${DEPLOY_PATH:-~/llm-tinkerer/server}"

# Extract
rm -rf "$DEPLOY_PATH/node_modules" "$DEPLOY_PATH/dist"
tar xzf /tmp/llm-build.tar.gz -C "$DEPLOY_PATH" --warning=no-timestamp
rm -f /tmp/llm-build.tar.gz

if [[ "$USE_DOCKER" == "true" ]]; then
  # Verify Docker is available
  if docker compose version &>/dev/null || docker-compose version &>/dev/null; then
    cd "$DEPLOY_PATH"
    docker compose up -d --build
    echo "Docker container running:"
    docker compose ps
  else
    echo "❌ Docker not found — cannot deploy"
    echo "   Set USE_DOCKER=false and ensure Node.js is installed:"
    echo "   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
    echo "   sudo dnf install -y nodejs"
    exit 1
  fi
else
  if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
    echo "❌ Node.js and/or npm not found on remote"
    echo "   Install with:"
    echo "   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
    echo "   sudo dnf install -y nodejs"
    exit 1
  fi
  cd "$DEPLOY_PATH"
  npm ci --omit=dev
  (nohup node dist/index.js > /tmp/llm-server.log 2>&1 &)
  sleep 1
  echo "Direct Node process started"
fi
REMOTE

echo ""
echo -e "${GREEN}✅ Deployed to ${USER_HOST}${NC}"
echo ""
echo "   HTTP:  http://${USER_HOST}:3000"
echo "   WS:    ws://${USER_HOST}:3000/ws/host"
echo ""
