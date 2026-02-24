#!/bin/bash
# Run the complete Freesail stack: Gateway + Agent + UI
# Usage: ./run-all.sh
#
# The gateway, agent, and UI all run as independent processes:
#   - Gateway: MCP SSE server (port 3000, localhost only) + A2UI HTTP/SSE (port 3001)
#   - Agent:   Connects to gateway MCP via SSE, exposes health endpoint (port 3002)
#   - UI:      Vite dev server (port 5173)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

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

# Check for Google API key
if [ -z "$GOOGLE_API_KEY" ]; then
  echo -e "${RED}Error: GOOGLE_API_KEY environment variable is required${NC}"
  echo ""
  echo "Get an API key from: https://aistudio.google.com/app/apikey"
  echo "Then run: export GOOGLE_API_KEY=your-api-key"
  exit 1
fi

cd "$ROOT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo -e "${BLUE}Installing dependencies...${NC}"
  npm install
fi

# Always rebuild packages to pick up source changes
echo -e "${BLUE}Building Freesail SDK...${NC}"
npm run build

echo ""
echo -e "${GREEN}Starting Freesail stack...${NC}"
echo ""

# Resolve paths
GATEWAY_SCRIPT="$ROOT_DIR/packages/@freesail/gateway/src/cli.ts"

# Port configuration
GATEWAY_HTTP_PORT="${GATEWAY_PORT:-3001}"
GATEWAY_MCP_PORT="${MCP_PORT:-3000}"
AGENT_PORT_NUM="${AGENT_PORT:-3002}"

# 1. Start Gateway (standalone process)
echo -e "${BLUE}[Gateway]${NC} Starting on HTTP port ${GATEWAY_HTTP_PORT}, MCP port ${GATEWAY_MCP_PORT}"
npx tsx "$GATEWAY_SCRIPT" \
  --mcp-mode http \
  --http-port "$GATEWAY_HTTP_PORT" \
  --mcp-port "$GATEWAY_MCP_PORT" &
GATEWAY_PID=$!

# Wait for gateway to be ready
echo -e "${BLUE}[Gateway]${NC} Waiting for gateway to start..."
sleep 3

# 2. Start Agent (connects to gateway via MCP SSE)
echo -e "${BLUE}[Agent]${NC} Starting"
cd "$ROOT_DIR/Example-Typescript/agent"
npm run dev &
AGENT_PID=$!
cd "$ROOT_DIR"

# Wait for agent to connect
sleep 3

# 3. Start UI
echo -e "${BLUE}[UI]${NC} Starting on http://localhost:${UI_PORT:-5173}"
cd "$ROOT_DIR/Example-Typescript/react-app"
rm -rf node_modules/.vite  # Clear Vite cache to pick up fresh workspace sources
npm run dev > /dev/null 2>&1 &
UI_PID=$!
cd "$ROOT_DIR"

# Wait for UI to start
sleep 2

echo ""
echo -e "${GREEN}All services running:${NC}"
echo -e "  Gateway: http://localhost:${GATEWAY_HTTP_PORT}  (A2UI HTTP/SSE for UI)"
echo -e "  Gateway: http://127.0.0.1:${GATEWAY_MCP_PORT}  (MCP SSE for agent, localhost only)"
echo -e "  Agent:   http://localhost:${AGENT_PORT_NUM}  (Health endpoint)"
echo -e "  UI:      http://localhost:${UI_PORT:-5173}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for any process to exit
wait
