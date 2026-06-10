# Freesail

**Agent-driven UI SDK** — Enables AI agents to create and drive user interfaces.

## Overview

Freesail enables AI agents to stream UI to supported clients using the **A2UI Protocol**. Agents render interfaces remotely without generating raw HTML or framework-specific code. The UI is defined through a schema-first catalog, keeping the agent and the frontend in sync.

## Architecture

Freesail operates on a three-node pattern:

- **Agent**: The intelligence layer that decides what to show, using MCP tools exposed by the Gateway.
- **Gateway**: A Node.js bridge that connects to the agent via MCP and streams A2UI messages to the frontend via Server-Sent Events (SSE).
- **Frontend**: The presentation layer (React) that receives A2UI messages and renders dynamic UI statefully.

## Packages

| Package | Description |
|---------|-------------|
| `freesail` | CLI and core libraries for running and configuring Freesail |
| `@freesail/core` | A2UI protocol definitions, parser, and transport |
| `@freesail/gateway` | Node.js MCP bridge server |
| `@freesail/react` | React renderer (`<FreesailProvider>` and surface hooks) |
| `@freesail/agent-runtime` | Runtime library for building Freesail agents |
| `@freesail/standard-catalog` | Standard UI component catalog (Text, Button, Chart, etc.) |
| `@freesail/chat-catalog` | Chat interface component catalog |
| `@freesail/logger` | Structured logging for the Freesail ecosystem |

Community packages are in `packages/@freesail-community/`.

## Key Concepts

### Catalogs

A catalog is a JSON schema that defines the components and functions an agent can use on a surface. The agent can only reference components declared in the catalog registered for that surface, preventing drift between the agent and the UI.

### Surfaces

A surface is a named UI container within a client session. The agent creates surfaces, populates them with components, and updates their data model independently. Multiple surfaces can be active simultaneously within the same session.

### Sessions

AA client session represents a conversation thread. Sessions are identified by a unique ID and track active surfaces, client capabilities, and connection state (`connected` or `suspended`). A suspended session retains its state during a 3-minute reconnect grace period.

### A2UI Protocol

A2UI is the JSON protocol for bi-directional communication between the gateway and the frontend.

**Gateway → Frontend (SSE)**

| Message | Description |
|---------|-------------|
| `createSurface` | Initialise a UI surface and load a catalog |
| `updateComponents` | Send or update the component tree for a surface |
| `updateDataModel` | Push data updates to a surface |
| `deleteSurface` | Remove a surface and its components |
| `getDataModel` | Request the current data model from the frontend |
| `getComponentTree` | Request the current component tree from the frontend |

**Frontend → Gateway (HTTP POST)**

| Message | Description |
|---------|-------------|
| `action` | Report a user interaction |
| `error` | Report a validation or runtime error |

## MCP Tools

The Gateway exposes the following MCP tools to the agent:

| Tool | Description |
|------|-------------|
| `create_surface` | Create a new surface for a session |
| `update_components` | Send components to a surface |
| `update_data_model` | Update a surface's data model |
| `delete_surface` | Delete a surface |
| `get_data_model` | Retrieve the current data model from the frontend |
| `get_component_tree` | Retrieve the current component tree from the frontend |
| `get_pending_actions` | Drain pending user actions for a session |
| `get_all_pending_actions` | Drain pending actions across all claimed sessions |
| `list_sessions` | List active sessions owned by the agent |
| `get_catalogs` | Get catalog definitions for a session |
| `get_component_details` | Get detailed schema for specific components |
| `get_function_details` | Get detailed schema for specific functions |
| `claim_session` | Claim a client session for exclusive use |
| `release_session` | Release a claimed session |

## Documentation

[www.freesail.ai](https://www.freesail.ai)

## Maintainers & Contributors

Freesail is an open-source project. For support contact [Thendral AI](mailto:support@thendral.ai).

## License

MIT
