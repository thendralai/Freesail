#!/bin/bash
# Run the complete Freesail stack: Agent (spawns Gateway via MCP) + UI
# Usage: ./run-all.sh
#
# The agent spawns the gateway as a child process via MCP stdio,
# so only the agent and UI need to be started separately.

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
UI_PID=""
AGENT_PID=""

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  
  [ -n "$UI_PID" ] && kill $UI_PID 2>/dev/null && echo "Stopped UI"
  [ -n "$AGENT_PID" ] && kill $AGENT_PID 2>/dev/null && echo "Stopped agent (+ gateway)"
  
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
echo -e "${BLUE}Building @freesail/core...${NC}"
cd packages/@freesail/core && npm run build && cd "$ROOT_DIR"

echo -e "${BLUE}Building @freesail/react...${NC}"
cd packages/@freesail/react && npm run build && cd "$ROOT_DIR"

echo -e "${BLUE}Building @freesail/gateway...${NC}"
cd packages/@freesail/gateway && npm run build && cd "$ROOT_DIR"

echo -e "${BLUE}Building @freesail/catalogs...${NC}"
cd packages/@freesail/catalogs && npm run build && cd "$ROOT_DIR"

echo ""
echo -e "${GREEN}Starting Freesail stack...${NC}"
echo ""

# Start Agent (which spawns the gateway as an MCP child process)
echo -e "${BLUE}[Agent]${NC} Starting on http://localhost:${AGENT_PORT:-3002}"
echo -e "${BLUE}[Agent]${NC} Will spawn gateway MCP server on http://localhost:${GATEWAY_PORT:-3001}"
cd "$ROOT_DIR/examples/agent"
npm run dev &
AGENT_PID=$!
cd "$ROOT_DIR"

# Wait for agent + gateway to start
sleep 4

# Start UI
echo -e "${BLUE}[UI]${NC} Starting on http://localhost:${UI_PORT:-5173}"
cd "$ROOT_DIR/examples/react-app"
rm -rf node_modules/.vite  # Clear Vite cache to pick up fresh workspace sources
npm run dev > /dev/null 2>&1 &
UI_PID=$!
cd "$ROOT_DIR"

# Wait for UI to start
sleep 2

echo ""
echo -e "${GREEN}All services running:${NC}"
echo -e "  Agent:   http://localhost:${AGENT_PORT:-3002}  (MCP host)"
echo -e "  Gateway: http://localhost:${GATEWAY_PORT:-3001}  (MCP server, spawned by agent)"
echo -e "  UI:      http://localhost:${UI_PORT:-5173}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for any process to exit
wait
