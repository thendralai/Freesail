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

The runtime uses **MCP resource subscriptions** for all session and action delivery — no polling. It subscribes to `mcp://freesail.dev/sessions` on startup to detect session connects/disconnects, then subscribes to `mcp://freesail.dev/sessions/{sessionId}` for each active session to receive per-action push notifications.

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
  { capabilities: { resources: { subscribe: true } } }, // required for push notifications
);
await mcpClient.connect(
  new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp")),
);

const runtime = new FreesailAgentRuntime({
  mcpClient,
  agentFactory: (sessionId) => new MyAgent(sessionId),
});

await runtime.start();

// On shutdown:
// await runtime.stop();
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
  agentFactory: AgentFactory; // (sessionId: string) => FreesailAgent
}
```

---

## Session lifecycle guarantees

```
sessions resource updated (session appears)
  → claim_session(agentId, sessionId)
  → subscribe to mcp://freesail.dev/sessions/{sessionId}
  → onSessionConnected()
        ↓
per-session resource updated (action arrives)
  → readResource drains action queue
  → onAction() (fire-and-forget, tracked per session)
        ↓
sessions resource updated (session disappears)
  → drain all in-flight onAction promises
  → onSessionDisconnected()
  → release_session(agentId, sessionId)
  → unsubscribe from mcp://freesail.dev/sessions/{sessionId}
  → agent instance GC'd
```

- **Push model**: session connects/disconnects and per-session actions are all delivered via MCP `ResourceUpdated` notifications — no polling.
- **Session ownership**: the runtime calls `claim_session` when a session connects and `release_session` when it disconnects. This lets the gateway track which agent owns each session.
- **Ordering**: lifecycle events for the same session are serialised via a per-session promise chain. Events across different sessions run concurrently.
- **Drain on disconnect**: `onSessionDisconnected` is never called while an `onAction` LLM call is still running for that session. The runtime waits using `Promise.allSettled`.
- **Clean shutdown**: call `await runtime.stop()` before closing the MCP client to unsubscribe from all active resource subscriptions.
- **Missed connect**: if the agent process restarts while sessions are active, `start()` reads the sessions list and picks up existing sessions. `onSessionConnected` is called for each recovered session.

---

## Shared cache

Use `SharedCache<TTools>` when multiple session agents share expensive MCP-fetched data (system prompt, tool definitions) that doesn't change per session. The `TTools` generic lets any agent framework (LangChain, Vercel AI SDK, etc.) share a single fetched tool list without coupling to a particular SDK.

```typescript
import { SharedCache } from "@freesail/agentruntime";

// Create once at process level — pass a factory for your framework's tool format
const cache = new SharedCache(
  mcpClient,
  () => myFramework.getTools(mcpClient), // called at most once until invalidated
  // optional third arg: systemPromptOverride — use a hardcoded prompt instead of fetching from MCP
);

// In each session agent:
const systemPrompt = await cache.getSystemPrompt();
const tools = await cache.getTools();

// Invalidate when upstream tools or system prompt change (e.g. new agent version):
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

### `listCatalogResources(mcpClient)`

Lists all MCP resources (catalogs, files, etc.) registered on the gateway. Returns an array of `McpResourceEntry` objects, or an empty array on failure.

```typescript
import { listCatalogResources } from '@freesail/agentruntime';

const resources = await listCatalogResources(mcpClient);
// [{ uri, name, mimeType?, description? }, ...]
```

### `readCatalogResource(mcpClient, uri)`

Reads the content of a single MCP resource by URI (e.g. a catalog definition). Throws on failure so the error can be surfaced to the LLM.

```typescript
import { readCatalogResource } from '@freesail/agentruntime';

const content = await readCatalogResource(mcpClient, 'catalog://my-catalog');
```

### Catalog discovery via `get_catalogs`

> **Calling `get_catalogs` is mandatory for any agent that creates UI surfaces.**

Agents discover available component catalogs by calling the `get_catalogs` MCP tool with a `sessionId`. It returns an array of catalog objects — each with the catalog ID, title, and full component definitions — in a single call. The agent should do this at the start of a session before calling `create_surface`.

```typescript
// Call the get_catalogs gateway tool:
const result = await mcpClient.callTool({
  name: 'get_catalogs',
  arguments: { sessionId },
});
// result.content[0].text is JSON: [{ catalogId, title, content }]
// catalogId  → the exact string to pass to create_surface
// content    → full component definitions to include in the LLM system prompt
```

The system prompt instructs the LLM what to do:
- **Empty array returned**: tell the user no UI is available for this session.
- **Non-empty array**: use `catalogId` for `create_surface`; include `content` in the context so the LLM knows which components are available.

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
  { capabilities: { resources: { subscribe: true } } },
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
  agentFactory: (sessionId) => new MySessionAgent(sessionId),
});

await runtime.start();

// On shutdown: await runtime.stop();
```
