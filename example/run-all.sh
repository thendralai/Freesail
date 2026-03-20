#!/bin/bash
# Run the complete Freesail stack: Gateway + Agent + UI
# Usage: ./run-all.sh
#
# Configure via .env in this directory (copy .env.example to .env).
#
# The gateway, agent, and UI all run as independent processes:
#   - Gateway: MCP Streamable HTTP (port 3000, localhost only) + A2UI HTTP/SSE (port 3001, all interfaces)
#   - Agent:   Connects to gateway MCP
#   - UI:      Vite dev server (port 5173, all interfaces)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export CATALOG_LOG_DIR="${CATALOG_LOG_DIR:-$SCRIPT_DIR/.freesail_logs}"

# Load .env if present
if [ -f "$SCRIPT_DIR/agent/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  echo -e "${BLUE}Loading environment variables from .env...${NC}"
  source "$SCRIPT_DIR/agent/.env"
  set +a
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# PIDs for cleanup
GATEWAY_PID=""
AGENT_PID=""
UI_PID=""

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  
  [ -n "$UI_PID" ] && kill $UI_PID 2>/dev/null && echo "Stopped UI"
  [ -n "$AGENT_PID" ] && kill $AGENT_PID 2>/dev/null && echo "Stopped agent"
  [ -n "$GATEWAY_PID" ] && kill $GATEWAY_PID 2>/dev/null && echo "Stopped gateway"
  npm run clean
  exit 0
}

trap cleanup SIGINT SIGTERM

# Check for Google API key (can be set in .env)
if [ -z "$GOOGLE_API_KEY" ] && [ "$LLM_PROVIDER" = "gemini" ]; then
  echo -e "${RED}Error: GOOGLE_API_KEY environment variable is required${NC}"
  echo ""
  echo "Get an API key from: https://aistudio.google.com/app/apikey"
  echo "Then run: export GOOGLE_API_KEY=your-api-key"
  exit 1
fi

# Check for OpenAI API key if using OpenAI provider
if [ -z "$OPENAI_API_KEY" ] && [ "$LLM_PROVIDER" = "openai" ]; then
  echo -e "${RED}Error: OPENAI_API_KEY environment variable is required${NC}"
  echo ""
  echo "Get an API key from: https://platform.openai.com/account/api-keys"
  echo "Then run: export OPENAI_API_KEY=your-api-key"
  exit 1
fi

# Check for Anthropic API key if using Anthropic provider
if [ -z "$ANTHROPIC_API_KEY" ] && [ "$LLM_PROVIDER" = "claude" ]; then
  echo -e "${RED}Error: ANTHROPIC_API_KEY environment variable is required${NC}"
  echo ""
  echo "Get an API key from: https://claude.ai/account/api-keys"
  echo "Then run: export ANTHROPIC_API_KEY=your-api-key"
  exit 1
fi

# Detect LAN IP (Linux: hostname -I, macOS: ipconfig getifaddr en0)
LAN_IP=""
if command -v hostname &>/dev/null; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$LAN_IP" ] && command -v ipconfig &>/dev/null; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
fi
if [ -z "$LAN_IP" ]; then
  LAN_IP="<your-ip>"
fi

cd "$ROOT_DIR"

# Install/update dependencies (always run so workspace links are up to date)
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

# Always rebuild packages to pick up source changes
echo -e "${BLUE}Building Freesail SDK...${NC}"
npm run build

echo ""
echo -e "${GREEN}Starting Freesail stack...${NC}"
echo ""

# Port configuration
GATEWAY_HTTP_PORT="${GATEWAY_PORT:-3001}"
GATEWAY_MCP_PORT="${MCP_PORT:-3000}"

# Build gateway args — log settings come from .env (LOG_LEVEL, LOG_FILE, LOG_FILTER)
GATEWAY_ARGS=(--http-port "$GATEWAY_HTTP_PORT" --mcp-port "$GATEWAY_MCP_PORT")
[ -n "${LOG_LEVEL:-}" ]  && GATEWAY_ARGS+=(--log-level "$LOG_LEVEL")
[ -n "${LOG_FILE:-}" ]   && GATEWAY_ARGS+=(--log-file "$LOG_FILE")
for _filter in ${LOG_FILTER:-}; do
  GATEWAY_ARGS+=(--log-filter "$_filter")
done

# 1. Start Gateway (standalone process)
# Gateway HTTP binds to 0.0.0.0 (all interfaces) by default; MCP stays on localhost.
echo -e "${BLUE}[Gateway]${NC} Starting on HTTP port ${GATEWAY_HTTP_PORT}, MCP port ${GATEWAY_MCP_PORT}"
node "$ROOT_DIR/packages/freesail/dist/cli.js" run gateway "${GATEWAY_ARGS[@]}" &
GATEWAY_PID=$!

# Wait for gateway to be ready
echo -e "${BLUE}[Gateway]${NC} Waiting for gateway to start..."
sleep 3

# 2. Start Agent (connects to gateway via MCP SSE)
echo -e "${BLUE}[Agent]${NC} Starting"
cd "$ROOT_DIR/example/agent"
npm run dev &
AGENT_PID=$!
cd "$ROOT_DIR"

# Wait for agent to connect
sleep 3

# 3. Start UI
echo -e "${BLUE}[UI]${NC} Starting on http://localhost:${UI_PORT:-5173}"
cd "$ROOT_DIR/example/react-app"
rm -rf node_modules/.vite  # Clear Vite cache to pick up fresh workspace sources
npm run dev &
UI_PID=$!
cd "$ROOT_DIR"

# Wait for UI to start
sleep 2

echo ""
echo -e "${GREEN}All services running:${NC}"
echo -e "  Gateway  (localhost):  http://localhost:${GATEWAY_HTTP_PORT}"
echo -e "  Gateway  (network):    http://${LAN_IP}:${GATEWAY_HTTP_PORT}"
echo -e "  MCP                    http://127.0.0.1:${GATEWAY_MCP_PORT}  (agent only, localhost)"
echo -e "  UI       (localhost):  http://localhost:${UI_PORT:-5173}"
echo -e "  UI       (network):    http://${LAN_IP}:${UI_PORT:-5173}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for any process to exit
wait
