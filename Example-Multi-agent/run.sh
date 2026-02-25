#!/bin/bash
# Multi-Agent Example Runner
# Starts Gateway, Agent A, Agent B, and React App

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Dependencies are handled within agent virtual environments using .env files

GATEWAY_PID=""
AGENT_A_PID=""
AGENT_B_PID=""
UI_PID=""

cleanup() {
  echo -e "\n\033[1;33mShutting down services...\033[0m"
  [ -n "$UI_PID" ] && kill $UI_PID 2>/dev/null
  [ -n "$AGENT_A_PID" ] && kill $AGENT_A_PID 2>/dev/null
  [ -n "$AGENT_B_PID" ] && kill $AGENT_B_PID 2>/dev/null
  [ -n "$GATEWAY_PID" ] && kill $GATEWAY_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "\033[0;34mBuilding Freesail SDK...\033[0m"
cd "$ROOT_DIR"
npm run build

echo -e "\n\033[0;32mStarting Multi-Agent Stack...\033[0m\n"

# 1. Start Freesail Gateway
echo -e "\033[0;34m[Gateway]\033[0m Starting on HTTP:3001, MCP:3000"
npx tsx "$ROOT_DIR/packages/@freesail/gateway/src/cli.ts" \
  --mcp-mode http --http-port 3001 --mcp-port 3000 &
GATEWAY_PID=$!
sleep 2

# Helper for executing python without sandbox-exec issues
run_python() {
  local REQ_DIR=$1
  local SCRIPT=$2
  cd "$REQ_DIR"
  if [ ! -d ".venv" ]; then
    echo "Creating virtualenv..."
    python3 -m venv .venv || python -m venv .venv
  fi
  source .venv/bin/activate
  pip install -r requirements.txt
  python "$SCRIPT" &
  echo $!
}

# 2. Start Agent B (UI Agent)
echo -e "\033[0;34m[Agent B]\033[0m Starting A2A Server on port 5002..."
export AGENT_B_PORT=5002
export MCP_URL="http://localhost:3000/mcp"
cd "$SCRIPT_DIR/agent-b"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv || python -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt
python agent_b.py &
AGENT_B_PID=$!
sleep 3 # Wait for it to connect to MCP

# 3. Start Agent A (Conversation Agent)
echo -e "\033[0;34m[Agent A]\033[0m Starting Conversation Agent on port 5001..."
export AGENT_A_PORT=5001
export AGENT_B_URL="http://localhost:5002"
cd "$SCRIPT_DIR/agent-a"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv || python -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt
python agent_a.py &
AGENT_A_PID=$!

# 4. Start React UI
echo -e "\033[0;34m[React UI]\033[0m Starting Vite dev server..."
cd "$SCRIPT_DIR/react-app"
if [ ! -d "node_modules" ]; then
  npm install
fi
rm -rf node_modules/.vite
npm run dev > /dev/null 2>&1 &
UI_PID=$!

sleep 2
echo -e "\n\033[0;32mStack Running successfully!\033[0m"
echo "  React UI:     http://localhost:5173"
echo "  Agent A:      http://localhost:5001"
echo "  Agent B:      http://localhost:5002"
echo "  Gateway:      http://localhost:3001"
echo -e "\033[1;33mPress Ctrl+C to stop.\033[0m"

wait
