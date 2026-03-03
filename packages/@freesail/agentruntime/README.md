# @freesail/agentruntime

The agent runtime connects your AI agent to the Freesail gateway. It handles session lifecycle, action routing, in-flight tracking, and shared MCP resource caching — so your agent only needs to implement business logic.

## Installation

```bash
npm install @freesail/agentruntime
```

## Core concepts

| Concept                    | Description                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Session**                | One browser tab / connected client. The runtime creates a fresh agent instance per session.                   |
| **`FreesailAgent`**        | Interface your agent class implements. All methods are optional.                                              |
| **`AgentFactory`**         | A function `(sessionId) => FreesailAgent` the runtime calls when a new session connects.                      |
| **`FreesailAgentRuntime`** | The runtime itself. You create one per process, give it the factory, and call `.start()`.                     |
| **`SharedCache`**          | A process-level cache for MCP-fetched data (system prompt, tools). Concurrent-safe via promise deduplication. |

---

## Quick start

### 1. Implement `FreesailAgent`

```typescript
import type { FreesailAgent, ActionEvent } from "@freesail/agentruntime";

class MyAgent implements FreesailAgent {
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async onSessionConnected(sessionId: string) {
    console.log(`Session ${sessionId} connected`);
  }

  async onSessionDisconnected(sessionId: string) {
    console.log(`Session ${sessionId} disconnected — cleaning up`);
  }

  async onAction(action: ActionEvent) {
    console.log(`Action "${action.name}" from surface "${action.surfaceId}"`);
    // Call your LLM, update the UI, etc.
  }
}
```

All four methods are **optional** — implement only what your agent needs.

### 2. Create the runtime

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FreesailAgentRuntime } from "@freesail/agentruntime";

const mcpClient = new Client(
  { name: "my-agent", version: "1.0.0" },
  { capabilities: {} },
);
await mcpClient.connect(
  new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp")),
);

const runtime = new FreesailAgentRuntime({
  mcpClient,
  agentId: "my-agent", // must match the ID claimed in the gateway
  agentFactory: (sessionId) => new MyAgent(sessionId),
});

runtime.start();
```

---

## API reference

### `FreesailAgent`

```typescript
interface FreesailAgent {
  onSessionConnected?(sessionId: string): Promise<void>;
  onSessionDisconnected?(sessionId: string): Promise<void>;
  onChat?(message: string): Promise<void>;
  onAction?(action: ActionEvent): Promise<void>;
}
```

| Method                  | When called                                     | Notes                                                                       |
| ----------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| `onSessionConnected`    | A new client tab connects                       | Good place to send a welcome message, initialise in-memory state            |
| `onSessionDisconnected` | The client tab closes                           | Called **after** all in-flight `onAction` promises settle (drain guarantee) |
| `onChat`                | _(reserved)_                                    | Not currently dispatched by the runtime; route chat via `onAction`          |
| `onAction`              | Any UI action (button click, form submit, etc.) | Fire-and-forget from the runtime; errors are caught and logged              |

### `ActionEvent`

The payload passed to `onAction`:

```typescript
interface ActionEvent {
  name: string; // action name, e.g. "submit_form", "chat_send"
  surfaceId: string; // which UI surface triggered it
  sourceComponentId: string; // which component within the surface
  context: Record<string, unknown>; // action-specific payload from the client
  clientDataModel?: Record<string, unknown>; // full UI data model snapshot (if sent)
}
```

### `AgentRuntimeConfig`

```typescript
interface AgentRuntimeConfig {
  mcpClient: Client;
  agentId?: string; // filters get_all_pending_actions to this agent's sessions
  agentFactory: AgentFactory; // (sessionId: string) => FreesailAgent
}
```

> **`agentId` is required for multi-agent deployments.** Without it, the runtime will see actions from all agents' sessions.

---

## Session lifecycle guarantees

```
__session_connected  → onSessionConnected()
                         ↓
onAction() calls ... (fire-and-forget, tracked per session)
                         ↓
__session_disconnected → drain all in-flight onAction promises
                       → onSessionDisconnected()
                       → agent instance GC'd
```

- **Ordering**: lifecycle events for the same session are serialised via a per-session promise chain. Events across different sessions run concurrently.
- **Drain on disconnect**: `onSessionDisconnected` is never called while an `onAction` LLM call is still running for that session. The runtime waits using `Promise.allSettled`.
- **Missed connect**: if a `__session_connected` event is missed (e.g. the agent process restarted), the runtime will create a new agent instance on the first action it sees for that session. `onSessionConnected` will not be called in this case.

---

## Shared cache

Use `SharedCache` when multiple session agents share expensive MCP-fetched data (system prompt, tool definitions) that doesn't change per session.

```typescript
import { SharedCache } from "@freesail/agentruntime";

// Create once at process level — pass a factory for your framework's tool format
const cache = new SharedCache(
  mcpClient,
  () => myFramework.getTools(mcpClient), // called at most once until invalidated
);

// In each session agent:
const systemPrompt = await cache.getSystemPrompt();
const tools = await cache.getTools();

// When upstream catalogs change:
cache.invalidate();
```

**Concurrent-fetch deduplication**: if 100 sessions call `getSystemPrompt()` at the same moment on a cold cache, the MCP fetch is issued exactly once. All 100 callers receive the same `Promise` and share the resolved value.

**Mid-turn safety**: `await cache.getSystemPrompt()` returns a plain `string`. If `invalidate()` fires while an agent is mid-turn, the local string is unaffected — only the next caller after invalidation triggers a fresh fetch.

---

## Utilities

### `fetchFreesailSystemPrompt(mcpClient)`

Fetches the `a2ui_system` prompt from the gateway. Returns a default fallback if the gateway doesn't have one.

```typescript
import { fetchFreesailSystemPrompt } from '@freesail/agentruntime';

const prompt = await fetchFreesailSystemPrompt(mcpClient);
```

### `listCatalogResources(mcpClient)` and `readCatalogResource(mcpClient, uri)`

> **These two are mandatory for any agent that creates UI surfaces.**

The gateway's system prompt tells the LLM it MUST call `list_resources` and `read_resource` to discover available component catalogs before creating a surface. If your LLM doesn't have access to these tools, it will attempt to guess component names and produce invalid UI.

```typescript
import { listCatalogResources, readCatalogResource } from '@freesail/agentruntime';

// In your framework adapter — add these as always-available LLM tools:

// Tool 1: list_resources
const resources = await listCatalogResources(mcpClient);
// → [{ uri, name, mimeType, description }, ...]
// → empty array if no catalogs are registered (adapter should inform the user)

// Tool 2: read_resource
try {
  const content = await readCatalogResource(mcpClient, uri);
  // → catalog component definitions as text
} catch (error) {
  // readCatalogResource re-throws — return the error as a tool result so
  // the LLM can tell the user the catalog couldn't be loaded
}
```

The system prompt instructs the LLM what to do on failure:
- **No catalogs**: tell the user no UI is possible right now.
- **Read failure**: tell the user which catalog failed and offer alternatives.

### `formatAction(sessionId, action, clientDataModel?)`

Converts a raw `ActionEvent` into a natural-language string suitable for passing to an LLM as a user message.

```typescript
import { formatAction } from '@freesail/agentruntime';

async onAction(action: ActionEvent) {
  const message = formatAction(this.sessionId, action, action.clientDataModel);
  const reply = await this.llm.chat(message);
  // ...
}
```

### `jsonSchemaToZod(schema)`

Converts a JSON Schema object (as returned by MCP tool definitions) to a Zod schema. Used when wrapping MCP tools for frameworks that require Zod schemas (e.g. LangChain).

```typescript
import { jsonSchemaToZod } from '@freesail/agentruntime';

const zodSchema = jsonSchemaToZod(mcpTool.inputSchema);
```


---

## Complete example

A minimal but production-shaped agent using the runtime:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  FreesailAgentRuntime,
  FreesailAgent,
  ActionEvent,
  SharedCache,
  fetchFreesailSystemPrompt,
  formatAction,
} from "@freesail/agentruntime";

// ─── Shared process-level resources ─────────────────────────────────────────

const mcpClient = new Client(
  { name: "my-agent", version: "1.0.0" },
  { capabilities: {} },
);
await mcpClient.connect(
  new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp")),
);

const cache = new SharedCache(mcpClient, () => myFramework.getTools(mcpClient));

// ─── Per-session agent ───────────────────────────────────────────────────────

class MySessionAgent implements FreesailAgent {
  private sessionId: string;
  private history: string[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async onSessionConnected(sessionId: string) {
    // Optionally send a welcome UI message
  }

  async onSessionDisconnected(sessionId: string) {
    this.history = []; // GC large allocations explicitly
  }

  async onAction(action: ActionEvent) {
    const systemPrompt = await cache.getSystemPrompt();
    const tools = await cache.getTools();
    const userMessage = formatAction(
      this.sessionId,
      action,
      action.clientDataModel,
    );

    // Call your LLM with systemPrompt, tools, history, userMessage ...
  }
}

// ─── Runtime ────────────────────────────────────────────────────────────────

const runtime = new FreesailAgentRuntime({
  mcpClient,
  agentId: "my-agent",
  agentFactory: (sessionId) => new MySessionAgent(sessionId),
});

runtime.start();
```
