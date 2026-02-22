# Freesail

**Generative UI SDK** - Enables AI Agents to drive user interfaces across any frontend framework. Currently in alpha.

## Overview

Freesail enables AI Agents to stream UI to supported clients using the **A2UI Protocol**. This allows agents to render interfaces remotely, without generating raw HTML or framework-specific code.

## Architecture

Freesail operates on a "Triangle Pattern" with three nodes:

- **Agent (Orchestrator)**: The intelligence layer (e.g., LangChain) that decides *what* to show using MCP tools.
- **Freesail Gateway (Bridge)**: The Node.js server that connects to the Agent via MCP and streams A2UI messages to the Frontend via Server-Sent Events (SSE).
- **Frontend (Renderer)**: The presentation layer (e.g., React) that translates A2UI messages and renders dynamic UI statefully.

## Packages

| Package | Description |
|---------|-------------|
| `@freesail/agentruntime` | Core agent functionalities and streaming integration |
| `@freesail/catalogs` | Shared UI catalog schemas and type definitions |
| `@freesail/core` | Pure TypeScript logic - A2UI protocol definitions, parser, transport |
| `@freesail/gateway` | Node.js MCP bridge server with native structured logging |
| `@freesail/logger` | Native structured logging for the Freesail ecosystem |
| `@freesail/react` | React implementation of the Renderer |

## Quick Start

The easiest way to see Freesail in action is to run the complete example stack (Agent + Gateway + React UI) using the provided script.

Ensure you have a Google Gemini API key mapped in your environment:

```bash
export GOOGLE_API_KEY=your-api-key
```

Then run the stack from the project root:

```bash
./examples/run-all.sh
```

This script will automatically build all packages, then start the Gateway, Agent, and React UI as three independent processes.

## Key Concepts

### Schema-First Development

We write the **Contract** (`catalog.json`) first:

1. Define a component's schema in `catalog.json`
2. The UI Developer builds the React component and registers the catalog
3. The Agent can now use the new UI component via its tools

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
- [A2UI Protocol](docs/a2ui/a2ui_protocol.md)
- [Creating Custom Catalogs](packages/freesail/docs/Creating%20Custom%20Catalogs.md)
- [Developer Guide](packages/freesail/docs/Developer_Guide.md)

## 👥 Maintainers & Contributors

Freesail is an open-source initiative by **Thendral AI**.

* **Shanmugam Sudalaimuthu** ([@shan-s](https://github.com/shan-s)) - *Architecture and Development*
* **Thendral AI Team** - *Core Maintenance*

## License

MIT
