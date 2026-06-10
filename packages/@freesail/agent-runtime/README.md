# @freesail/agent-runtime

The agent runtime connects your AI agent to the Freesail gateway. It handles session lifecycle, action routing, in-flight tracking, and shared MCP resource caching — so your agent only needs to implement business logic.

## Installation

```bash
npm install @freesail/agent-runtime
```

## Core concepts

| Concept                    | Description                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Session**                | One browser tab / connected client. The runtime creates a fresh agent instance per session.                   |
| **`FreesailAgent`**        | Interface your agent class implements. All methods are optional.                                              |
| **`FreesailSessionClient`**| Typed wrapper for all gateway operations (surfaces, data model, catalogs). Passed to your `AgentFactory` — no raw MCP client needed. |
| **`AgentFactory`**         | A function `(sessionId, session: FreesailSessionClient) => FreesailAgent` the runtime calls when a new session connects. |
| **`FreesailAgentRuntime`** | The runtime itself. You create one per process, give it the factory and `gatewayUrl`, and call `.start()`. Caches the system prompt and tool definitions internally — fetched once and shared across all sessions. |

The runtime manages all MCP connections internally — one coordinator client for session discovery and one dedicated client per claimed session. Your code never touches `@modelcontextprotocol/sdk` directly unless you need to connect to other MCP servers for unrelated purposes.

The runtime uses **MCP resource subscriptions** for session and action delivery with a fallback poll on every `resources/list_changed` notification — so per-session actions are never permanently lost if an SSE connection drops after idle.

---

## Quick start

### 1. Implement `FreesailAgent`

```typescript
import type { FreesailAgent, FreesailSessionClient, SessionNotification } from "@freesail/agent-runtime";

class MyAgent implements FreesailAgent {
  private sessionId: string;
  private session: FreesailSessionClient;

  constructor(sessionId: string, session: FreesailSessionClient) {
    this.sessionId = sessionId;
    this.session = session;
  }

  async onSessionConnected(sessionId: string) {
    console.log(`Session ${sessionId} connected`);
  }

  async onSessionDisconnected(sessionId: string) {
    console.log(`Session ${sessionId} disconnected — cleaning up`);
  }

  async onSessionNotification(notification: SessionNotification) {
    if (notification.type === 'error') {
      console.error(`Client error on surface "${notification.event.surfaceId}": ${notification.event.message}`);
      return;
    }
    const { event } = notification;
    console.log(`Action "${event.name}" from surface "${event.surfaceId}"`);
    // Call your LLM, update the UI, etc.
    // Use this.session.updateDataModel(...), this.session.createSurface(...), etc.
  }
}
```

All three methods are **optional** — implement only what your agent needs.

### 2. Create the runtime

```typescript
import { FreesailAgentRuntime } from "@freesail/agent-runtime";

const runtime = new FreesailAgentRuntime({
  gatewayUrl: "http://localhost:3000/mcp",
  clientInfo: { name: "my-agent", version: "1.0.0" }, // optional
  agentFactory: (sessionId, session) => new MyAgent(sessionId, session),
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
  onSessionNotification?(notification: SessionNotification): Promise<void>;
}
```

| Method                    | When called                                                          | Notes                                                                                        |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `onSessionConnected`      | A new client tab connects                                            | Good place to send a welcome message, initialise in-memory state                             |
| `onSessionDisconnected`   | The client tab closes                                                | Called **after** all in-flight notification promises settle (drain guarantee)                |
| `onSessionNotification`   | Any UI action or client-side error arrives                           | **If not implemented, the queue is NOT drained** — messages stay in the gateway queue        |

### `SessionNotification`

The discriminated union passed to `onSessionNotification`:

```typescript
type SessionNotification =
  | { type: 'action'; event: ActionEvent }
  | { type: 'error'; event: ClientErrorEvent };

interface ActionEvent {
  name: string;                          // action name, e.g. "submit_form", "chat_send"
  surfaceId: string;                     // which UI surface triggered it
  sourceComponentId: string;             // which component within the surface
  context: Record<string, unknown>;      // action-specific payload from the client
  clientDataModel?: Record<string, unknown>; // full UI data model snapshot (if sent)
}

interface ClientErrorEvent {
  code: string;    // e.g. "CLIENT_SIDE_VALIDATION_FAILURE"
  message: string;
  surfaceId: string;
  path?: string;   // the component path that failed validation, if applicable
}
```

> **Queue drain behaviour**: The runtime only calls `readResource` on the session queue if `onSessionNotification` is implemented. If it is not, the queue stays intact and the gateway will block write tools (`create_surface`, `update_components`, etc.) until the agent explicitly calls `get_pending_actions`.

### `FreesailSessionClient`

The typed session wrapper passed to `AgentFactory`. Covers all gateway operations so framework-specific code never needs to import `@modelcontextprotocol/sdk`.

```typescript
interface FreesailSessionClient {
  readonly sessionId: string;

  // Surface management
  createSurface(params: { surfaceId: string; catalogId: string; sendDataModel?: boolean }): Promise<unknown>;
  updateComponents(surfaceId: string, components: unknown[]): Promise<void>;
  deleteSurface(surfaceId: string): Promise<void>;

  // Data model
  updateDataModel(surfaceId: string, path?: string, value?: unknown): Promise<void>;
  getDataModel(surfaceId: string): Promise<unknown>;

  // Introspection
  getComponentTree(surfaceId: string): Promise<unknown>;
  getPendingActions(): Promise<unknown[]>;
  listSessions(): Promise<unknown[]>;

  // Catalog helpers
  getCatalogs(): Promise<unknown[]>;
  getComponentDetails(catalogId: string, components: string[]): Promise<string>;
  getFunctionDetails(catalogId: string, functions: string[]): Promise<string>;

  // Escape hatch for raw tool calls and tool listing
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  getToolDefinitions(): Promise<ToolDefinition[]>;
  getSystemPrompt(): Promise<string>;
}
```

### `AgentRuntimeConfig`

```typescript
interface AgentRuntimeConfig {
  /** URL of the Freesail gateway MCP endpoint, e.g. http://localhost:3000/mcp */
  gatewayUrl: string | URL;
  /** Factory called once per session — receives a typed session client */
  agentFactory: AgentFactory; // (sessionId: string, session: FreesailSessionClient) => FreesailAgent
  /** MCP client identity sent to the gateway (default: freesail-agent / 1.0.0) */
  clientInfo?: { name: string; version: string };
}
```

### `FreesailToolProvider`

Interface implemented by both `FreesailAgentRuntime` and `FreesailSessionClient`. Accept it as a parameter type when your code needs to fetch the system prompt or tool list without being coupled to a specific session (e.g. when passing the runtime to a per-session agent).

```typescript
interface FreesailToolProvider {
  getSystemPrompt(): Promise<string>;
  getToolDefinitions(): Promise<ToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}
```

---

## Session lifecycle guarantees

```
sessions resource updated (session appears)
  → claim_session(agentId, sessionId)           [retried on network error]
  → subscribe to mcp://freesail.ai/sessions/{sessionId}
  → onSessionConnected()
        ↓
per-session resource updated (action or error arrives)
  → readResource drains queue (only if onSessionNotification is implemented)
  → onSessionNotification() (fire-and-forget, tracked per session)
        ↓
sessions resource updated (session disappears)
  → drain all in-flight onSessionNotification promises
  → onSessionDisconnected()
  → release_session(agentId, sessionId)
  → unsubscribe from mcp://freesail.ai/sessions/{sessionId}
  → agent instance GC'd
```

- **Push + fallback**: per-session actions are delivered via `ResourceUpdated` notifications. On every `resources/list_changed` notification (fired by the gateway on every upstream action), all active sessions are polled as a fallback — so actions are never permanently lost if a per-session SSE connection drops after idle.
- **Dedicated client per session**: each claimed session gets its own MCP client. A slow or blocked session never delays others.
- **Session ownership**: the runtime calls `claim_session` when a session connects and `release_session` when it disconnects. This lets the gateway track which agent owns each session.
- **Ordering**: lifecycle events for the same session are serialised via a per-session promise chain. Events across different sessions run concurrently.
- **Drain on disconnect**: `onSessionDisconnected` is never called while an in-flight `onSessionNotification` promise is still running for that session. The runtime waits using `Promise.allSettled`.
- **Clean shutdown**: call `await runtime.stop()` before the process exits to release all sessions and close all MCP clients.
- **Missed connect**: if the agent process restarts while sessions are active, `start()` reads the sessions list and picks up existing sessions. `onSessionConnected` is called for each recovered session.

---

---

## Utilities

### `formatAction(sessionId, action, clientDataModel?)`

Converts a raw `ActionEvent` into a natural-language string suitable for passing to an LLM as a user message.

```typescript
import { formatAction } from '@freesail/agent-runtime';

async onSessionNotification(notification: SessionNotification) {
  if (notification.type !== 'action') return;
  const { event } = notification;
  const message = formatAction(this.sessionId, event, event.clientDataModel);
  const reply = await this.llm.chat(message);
  // ...
}
```

### `jsonSchemaToZod(schema)`

Converts a JSON Schema object (as returned by MCP tool definitions) to a Zod schema. Used when wrapping Freesail tools for frameworks that require Zod schemas (e.g. LangChain).

```typescript
import { jsonSchemaToZod } from '@freesail/agent-runtime';

const zodSchema = jsonSchemaToZod(toolDef.inputSchema);
```

---

## Complete example

A minimal but production-shaped agent using the runtime:

```typescript
import {
  FreesailAgentRuntime,
  FreesailAgent,
  FreesailSessionClient,
  FreesailToolProvider,
  SessionNotification,
  formatAction,
} from "@freesail/agent-runtime";

// ─── Runtime ────────────────────────────────────────────────────────────────

// runtime caches getSystemPrompt() and getToolDefinitions() internally after
// the first call — shared across all sessions with no extra setup required.
const runtime: FreesailAgentRuntime = new FreesailAgentRuntime({
  gatewayUrl: "http://localhost:3000/mcp",
  clientInfo: { name: "my-agent", version: "1.0.0" },
  agentFactory: (sessionId, session) =>
    new MySessionAgent(sessionId, session, runtime),
});

await runtime.start();

// ─── Per-session agent ───────────────────────────────────────────────────────

class MySessionAgent implements FreesailAgent {
  private sessionId: string;
  private session: FreesailSessionClient;
  private runtime: FreesailToolProvider;
  private history: string[] = [];

  constructor(
    sessionId: string,
    session: FreesailSessionClient,
    runtime: FreesailToolProvider,
  ) {
    this.sessionId = sessionId;
    this.session = session;
    this.runtime = runtime;
  }

  async onSessionDisconnected(sessionId: string) {
    this.history = []; // GC large allocations explicitly
  }

  async onSessionNotification(notification: SessionNotification) {
    if (notification.type === 'error') {
      const { event } = notification;
      const message =
        `[System Error] Client error on surface "${event.surfaceId}": ` +
        `${event.code} — ${event.message}`;
      // ... enqueue message for your LLM
      return;
    }

    const { event } = notification;
    const systemPrompt = await this.runtime.getSystemPrompt();
    const tools = await this.runtime.getToolDefinitions();
    const userMessage = formatAction(this.sessionId, event, event.clientDataModel);

    // Call your LLM with systemPrompt, tools, history, userMessage ...
    // Use this.session.updateDataModel(...), this.session.createSurface(...), etc.
  }
}

// On shutdown:
// await runtime.stop();
```

---

## License

MIT — see [LICENSE](./LICENSE)
