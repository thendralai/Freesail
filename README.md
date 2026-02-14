# Freesail

**Generative UI SDK** - Enables AI Agents to drive user interfaces across any frontend framework. Currently in alpha.

## Overview

Freesail enables AI Agents to stream UI to supported clients using the **A2UI Protocol**. This allows agents to render interfaces remotely, without generating raw HTML or framework-specific code.

## Architecture

Freesail operates on a "Triangle Pattern" with three nodes:

- **Agent (Orchestrator)**: Your AI agents decides *what* to show
- **Freesail Server (Bridge)**: Combines an MCP server provides A2UI as a service to your agent and streams A2UI messages to the front end.
- **Frontend**: Core Logic + Presentation layer - translates A2UI messages and renders dynamic UI.

## Packages

| Package | Description |
|---------|-------------|
| `@freesail/core` | Pure TypeScript logic - protocol definitions, parser, transport |
| `@freesail/react` | React implementation of the Renderer |
| `@freesail/gateway` | Node.js MCP bridge server |

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start the MCP server
npm run dev -w @freesail/gateway
```

## Key Concepts

### Schema-First Development

We write the **Contract** (`catalog.json`) first:

1. Define a component in `catalog.json`
2. The Agent immediately sees a new tool
3. The React Developer implements the component

This ensures the Agent and UI never drift out of sync.

### A2UI Protocol

A2UI (Agent-to-User Interface) is the JSON protocol for bi-directional communication:

**Server → Client (SSE)**
- `createSurface` - Initialize UI container
- `updateComponents` - Stream UI components
- `updateDataModel` - Push data updates
- `deleteSurface` - Remove a surface

**Client → Server (HTTP POST)**
- `action` - Report user interactions
- `error` - Report validation or runtime errors

## Documentation

- [Freesail Architecture](docs/Freesail_Architecture.md)
- [A2UI Protocol](docs/a2ui_protocol.md)
- [Agents](docs/Agents.md)

## License

MIT
