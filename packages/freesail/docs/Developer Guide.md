# Freesail Developer Guide

This guide covers how to build **Generative UI (GenUI)** applications using the **Freesail SDK**. You'll learn how to set up the architecture, run the gateway, connect agents, and build interactive UIs.

---

## 1. Core Concept

Freesail uses a **Triangle Pattern** with three independent processes:

```
┌────────────────┐    MCP Streamable HTTP     ┌──────────────────┐    A2UI SSE   ┌──────────────┐
│   AI Agent     │  ◄────────────────────────►│ Freesail Gateway │ ◄───────────► │ React App    │
│  (Orchestrator)│      Port 3000             │    (Bridge)      │   Port 3001   │ (Renderer)   │
└────────────────┘    localhost only          └──────────────────┘               └──────────────┘
```

- **Agent**: Decides *what* to show by calling MCP tools (e.g., `create_surface`, `update_components`).
- **Gateway**: Translates between MCP (agent-facing) and A2UI (UI-facing). Validates agent output against catalog schemas.
- **Frontend**: Renders A2UI JSON into React components and sends user actions back to the agent.

---

## 2. The Freesail Gateway

The Gateway is the central bridge between agents and frontends. It runs as a standalone Node.js process with **two network-facing interfaces**:

| Interface | Port | Protocol | Purpose |
|-----------|------|----------|---------|
| **Agent-facing** | 3000 (default) | MCP Streamable HTTP | Exposes tools, resources, and prompts to AI agents |
| **UI-facing** | 3001 (default) | HTTP SSE + POST | Streams A2UI updates to the frontend, receives user actions |

### Starting the Gateway

```bash
# Decoupled mode (recommended) — agents connect via HTTP
npx tsx packages/@freesail/gateway/src/cli.ts \
  --mcp-mode http \
  --mcp-port 3000 \
  --http-port 3001

# Stdio mode — agent spawns gateway as child process
npx tsx packages/@freesail/gateway/src/cli.ts \
  --http-port 3001
```

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mcp-mode <mode>` | `stdio` | MCP transport: `stdio` (child process) or `http` (standalone) |
| `--mcp-port <port>` | `3000` | Port for MCP Streamable HTTP server (http mode only) |
| `--mcp-host <host>` | `127.0.0.1` | Bind address for MCP server (http mode only) |
| `--http-port <port>` | `3001` | Port for A2UI HTTP/SSE server |
| `--webhook-url <url>` | — | Forward UI actions to this URL via HTTP POST |
| `--log-file <file>` | — | Write logs to file (in addition to console) |

### Network Isolation

By default, the MCP server binds to `127.0.0.1` — only local processes can connect. The A2UI server binds to `0.0.0.0`, making it accessible from browsers. This provides network-level security without requiring authentication.

### How the Gateway Processes Requests

1. **Agent → Gateway (MCP)**: Agent calls tools like `create_surface` or `update_components`. The gateway validates the call against the catalog schema and pushes the result to the appropriate frontend session via SSE.

2. **Frontend → Gateway → Agent (Actions)**: When a user clicks a button, the frontend POSTs an action to the gateway. The gateway queues it as an MCP resource, and the agent polls for pending actions.

---

## 3. Setting Up the React Application

### Install the SDK

```bash
npm install freesail @freesail/catalogs
```

### Configure the FreesailProvider

The `FreesailProvider` manages the connection to the gateway and registers available component catalogs.

```tsx
import { ReactUI } from 'freesail';
import { StandardCatalog, ChatCatalog } from '@freesail/catalogs';

const CATALOGS: ReactUI.CatalogDefinition[] = [
  StandardCatalog,
  ChatCatalog,
];

function App() {
  return (
    <ReactUI.FreesailProvider
      sseUrl="http://localhost:3001/sse"
      postUrl="http://localhost:3001/message"
      catalogDefinitions={CATALOGS}
    >
      <MainLayout />
    </ReactUI.FreesailProvider>
  );
}
```

### Adding Surfaces

A `FreesailSurface` is a designated area that the AI agent can control.

```tsx
import { ReactUI } from 'freesail';

function MainLayout() {
  return (
    <div className="app-container">
      {/* Client-managed surface (prefix with __) */}
      <aside className="sidebar">
        <ReactUI.FreesailSurface surfaceId="__chat" />
      </aside>

      {/* Agent-created surface (alphanumeric only) */}
      <main className="content">
        <ReactUI.FreesailSurface surfaceId="workspace" />
      </main>
    </div>
  );
}
```

### Surface Naming Rules

| Type | Naming | Who creates it? | Agent permissions |
|------|--------|-----------------|-------------------|
| **Agent-managed** | Alphanumeric (e.g., `workspace`) | Agent via `create_surface` | Full control |
| **Client-managed** | Starts with `__` (e.g., `__chat`) | React app | `updateDataModel` only |

---

## 4. Building the AI Agent

The agent connects to the gateway's MCP endpoint and uses tools to drive the UI.

### Connecting to the Gateway

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp')
);

const mcpClient = new Client(
  { name: 'my-agent', version: '1.0.0' },
  { capabilities: {} }
);

await mcpClient.connect(transport);
```

### Creating a Surface

```typescript
await mcpClient.callTool({
  name: 'create_surface',
  arguments: {
    surfaceId: 'workspace',
    catalogId: 'https://freesail.dev/catalogs/standard_catalog_v1.json',
    sessionId: 'session_abc123',
  },
});
```

### Updating Components

```typescript
await mcpClient.callTool({
  name: 'update_components',
  arguments: {
    surfaceId: 'workspace',
    sessionId: 'session_abc123',
    components: [
      { id: 'root', component: 'Column', children: ['greeting'] },
      { id: 'greeting', component: 'Text', text: 'Hello from the Agent!' },
    ],
  },
});
```

---

## 5. Driving Interactivity (Data Models)

### Data Binding

Bind component properties to the data model for automatic UI updates:

```typescript
// Agent sets up components with data bindings
await mcpClient.callTool({
  name: 'update_components',
  arguments: {
    surfaceId: 'ticker',
    sessionId,
    components: [
      {
        id: 'price',
        component: 'Text',
        text: { path: '/currentPrice' },  // Binds to data model
      },
    ],
  },
});

// Set the data model
await mcpClient.callTool({
  name: 'update_data_model',
  arguments: {
    surfaceId: 'ticker',
    sessionId,
    path: '/currentPrice',
    value: '$150.00',
  },
});
```

### Real-Time Updates

Update data without re-sending the component tree:

```typescript
await mcpClient.callTool({
  name: 'update_data_model',
  arguments: {
    surfaceId: 'ticker',
    sessionId,
    path: '/currentPrice',
    value: '$155.50',
  },
});
```

---

## 6. Handling User Actions

When a user interacts with a component, the SDK sends an **Action** back through the gateway:

1. **UI Event**: User clicks a button in the browser.
2. **Action Payload**: Freesail POSTs the action to the gateway with the surface's data model.
3. **Agent Processing**: The agent picks up the action via MCP and responds.

```json
{
  "version": "v0.9",
  "action": {
    "name": "submit_form",
    "surfaceId": "workspace",
    "sourceComponentId": "submit-btn",
    "context": { "formData": "..." }
  },
  "_clientDataModel": {
    "surfaceId": "workspace",
    "dataModel": { "items": [], "total": 99.99 }
  }
}
```

---

## 7. Running the Full Stack

The easiest way to run everything is with the provided script:

```bash
export GOOGLE_API_KEY=your-api-key
cd examples && bash run-all.sh
```

This starts three independent processes:

| Process | URL | Purpose |
|---------|-----|---------|
| Gateway | `http://localhost:3001` (A2UI), `http://127.0.0.1:3000` (MCP) | Bridge between agent and UI |
| Agent | `http://localhost:3002` | AI agent with health endpoint |
| UI | `http://localhost:5173` | Vite React dev server |

---

## 8. Debugging

### Session Identification
- The gateway assigns a `sessionId` to each SSE connection.
- The React SDK attaches this ID to every HTTP POST via the `X-A2UI-Session` header.
- The agent receives the `sessionId` through a synthetic `__session_connected` action.

### Common Issues

| Symptom | Check |
|---------|-------|
| UI stuck on "Loading surface..." | Is the `__chat` surface being bootstrapped? Check agent logs. |
| Agent not receiving actions | Check the gateway logs for upstream messages. Verify `X-A2UI-Session` header in browser Network tab. |
| Components not rendering | Verify the `catalogId` matches a registered catalog. Check browser console for registry errors. |
| TextFields not editable in templates | Ensure the agent is using relative paths (e.g., `{ path: "name" }`) for data bindings inside ChildList templates. |

---

## 9. Best Practices

- **Surface Isolation**: Use different `surfaceId`s for different logical parts of your app.
- **Data Updates**: Use `update_data_model` to set or replace values at any path. For streaming text (e.g., LLM token output), use `stream_data_model` which performs append-only writes to a specific path without replacing the full value.
- **Catalog Selection**: Only provide the catalogs necessary for a surface to keep the agent focused.
- **Network Security**: In production, keep the MCP port bound to localhost and use auth for the A2UI endpoints.
