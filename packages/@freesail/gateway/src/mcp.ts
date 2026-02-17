/**
 * @fileoverview MCP Server Implementation
 *
 * Implements the Model Context Protocol server that exposes
 * Freesail tools to AI Agents.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  A2UI_VERSION,
  type SurfaceId,
  type CatalogId,
  type A2UIComponent,
  type DownstreamMessage,
} from '@freesail/core';
import type { Catalog } from './converter.js';
import { generateCatalogPrompt, validateComponent } from './converter.js';
import type { SessionManager } from './session.js';

/**
 * MCP Server configuration.
 */
export interface MCPServerOptions {
  /** Server name */
  name?: string;
  /** Server version */
  version?: string;
  /** Session manager for client connections */
  sessionManager: SessionManager;
}

/**
 * Creates the MCP server with Freesail tools.
 */
export function createMCPServer(options: MCPServerOptions): McpServer {
  const {
    name = 'freesail-gateway',
    version = '0.1.0',
    sessionManager,
  } = options;

  const server = new McpServer(
    { name, version },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  // ========================================================================
  // Prompt — authoritative A2UI system prompt for agents
  // ========================================================================

  server.registerPrompt(
    'a2ui_system',
    {
      title: 'A2UI System Prompt',
      description: 'Complete system prompt for AI agents using the A2UI protocol to create dynamic UIs. Includes protocol docs, available catalogs, and tool usage instructions.',
    },
    async () => {
      const catalogs = sessionManager.getCatalogs();




      const promptText = `You are a helpful AI assistant that creates dynamic user interfaces using the A2UI protocol and Freesail tools.

## How It Works

You have access to tools that create and manage UI surfaces. A surface is an independent UI region displayed in the user's browser. You can create multiple surfaces, each with its own component tree and data model.

## Workflow

1. **Create a surface**: Call \`create_surface\` with a unique surfaceId and a catalogId. The catalogId MUST be the exact catalog ID string (a URL like \`https://freesail.dev/standard_catalog_v1.json\`) — do NOT use the catalog name.
2. **Add components**: Call \`update_components\` with a flat array of component definitions. One component MUST have id "root".
3. **Set data**: Call \`update_data_model\` to populate dynamic data that components reference via bindings.
4. **Handle actions**: Use \`get_pending_actions\` or \`get_all_pending_actions\` to receive user interactions (button clicks, form submissions, etc.).
5. **Update UI**: Call \`update_components\` or \`update_data_model\` again to reflect changes.
6. **Remove surface**: Call \`delete_surface\` when done.

## Component Tree Structure

Components are defined as a flat array with parent-child references:
- Each component has a unique \`id\`.
- One component MUST have id \`"root"\` — this is the tree root.
- Use \`children: ["childId1", "childId2"]\` for containers with multiple children.
- Use \`child: "childId"\` for single-child containers (like Card).
- All other properties are component-specific props.

Example:
\`\`\`json
[
  { "id": "root", "component": "Column", "gap": "16px", "children": ["title", "content"] },
  { "id": "title", "component": "Text", "text": "Hello!", "variant": "h1" },
  { "id": "content", "component": "Text", "text": "Welcome to the demo." }
]
\`\`\`

## Data Bindings

Components can reference dynamic data using binding objects:
- \`{ "path": "/user/name" }\` references the value at /user/name in the data model.
- Call \`update_data_model\` to set values: path="/user/name", value="Alice".
- This decouples UI structure from content, allowing efficient data-only updates.

### String Interpolation

Do NOT use \${path} directly in text strings. It will NOT be interpolated.
To combine text and data, use the formatString function with positional placeholders ({0}, {1}, etc.):

    {
      "component": "Text",
      "text": {
        "call": "formatString",
        "args": {
          "0": "Hello {0}",
          "1": { "path": "/user/name" }
        }
      }
    }

## Two-Way Bindings (Input Components)

Input components (TextField, Input, CheckBox) support **two-way binding**. When the user types or checks, the value is written back to the local data model at the bound path.

**Best practice**: Always give input components a \`value\` binding so the agent can read collected data:
\`\`\`json
{ "id": "nameField", "component": "TextField", "label": "Name", "value": { "path": "/formData/name" } }
\`\`\`

Then reference the same path in a Button's action context to receive the data when the user clicks:
\`\`\`json
{ "id": "submitBtn", "component": "Button", "label": "Submit", "action": { "event": { "name": "submit_form", "context": { "name": { "path": "/formData/name" } } } } }
\`\`\`

When the user clicks the button, the action context data bindings are resolved against the current data model, so the agent receives \`context: { "name": "Alice" }\`.

**Auto-bind fallback**: If an input has no explicit \`value\` binding, the framework writes to \`/input/{componentId}\` automatically. Set \`sendDataModel: true\` on the surface to receive the full data model with every action.

### Surfaces with Forms

When creating a surface that contains input components, ALWAYS pass \`sendDataModel: true\`:
\`\`\`
create_surface({ sessionId, surfaceId: "my-form", catalogId: "...", sendDataModel: true })
\`\`\`
This ensures the full data model (including all user input) is attached to every action from that surface.

## Client-Side Functions & Validation

You can use functions to perform client-side logic and validation without server round-trips.

### Function Calls

Use \`{"functionCall": { "call": "functionName", "args": { ... } }}\` to execute a function.
Arguments can be literals or data bindings.

### Input Validation (\`checks\`)

Components like \`Button\` and \`TextField\` support the \`checks\` property.
- A check passes if its \`condition\` evaluates to \`true\`.
- If any check fails (evaluates to \`false\`), the component shows an error or is disabled.
- Use logical functions like \`not\`, \`and\`, \`or\`, \`isEmpty\`, \`eq\` to build conditions.

**Example: Validate 'name' is not empty**
\`\`\`json
{
  "component": "TextField",
  "label": "Name",
  "value": { "path": "/data/name" },
  "checks": [
    {
      "condition": {
        "call": "not",
        "args": {
          "value": { "call": "isEmpty", "args": { "value": { "path": "/data/name" } } }
        }
      },
      "message": "Name is required"
    }
  ]
}
\`\`\`

## Available Catalogs
 
Catalogs are available as MCP resources.
To see available catalogs, use the \`list_resources\` tool. Look for resources with \`mimeType: 'text/plain'\` or names describing catalogs.
Then read the specific resource URI to get component definitions.
 
 For example:
 1. Call \`list_resources()\` -> returns list including "Standard Catalog (mcp://freesail.dev/catalogs/standard_catalog_v1.json)"
 2. Call \`read_resource("mcp://freesail.dev/catalogs/standard_catalog_v1.json")\` to get the component definitions.

## Session Management

- Every tool that sends UI to a client **requires a \`sessionId\`**.
- Use \`list_sessions\` to see connected client sessions, their surfaces, supported catalogs, and bound agent.
- Use \`claim_session\` to bind yourself to a session — claimed sessions route actions exclusively to you.
- Use \`release_session\` to give up ownership of a session.
- When a new client connects, a synthetic \`__session_connected\` action is injected so you discover new clients via \`get_all_pending_actions\`.
- When a client disconnects, a \`__session_disconnected\` action is injected into other sessions.


## Action Handling

When users interact with UI (clicking buttons, submitting forms), actions are queued:
- Use \`get_pending_actions\` with a sessionId to drain that session's action queue.
- Use \`get_all_pending_actions\` to drain all queues at once.
- Each action contains: name, surfaceId, sourceComponentId, and context data.

## Guidelines

- Always create a surface before updating its components.
- Use meaningful and unique surfaceIds (e.g., "weather-dashboard", "user-profile").
- Prefer data bindings for contents that change.
- Respond conversationally AND create/update UI when appropriate.
- When handling user actions, acknowledge the action and update the UI accordingly.
- Use a single catalogId consistently per surface.
- Each surface is bound to exactly ONE catalog. 
- Only use components defined in that surface's catalog. Do NOT mix components from different catalogs in the same surface. If you need layout components like Column or Row, use a catalog that includes them.
- Only create NEW surfaces when you think that the user will have a better experience with a Visual UI.
- Use functions wherever possible to perform client-side logic and validation without server round-trips.`;

      return {
        messages: [{
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: promptText,
          },
        }],
      };
    }
  );

  // ========================================================================
  // Catalog Resources
  // ========================================================================

  // Register catalog resources dynamically when clients provide catalogs
  const registeredCatalogs = new Set<string>();

  const registerCatalogResources = (catalogs: Catalog[]) => {
    for (const catalog of catalogs) {
      if (registeredCatalogs.has(catalog.catalogId)) continue;
      registeredCatalogs.add(catalog.catalogId);

      server.registerResource(
        catalog.title,
        catalog.catalogId,
        {
          description: catalog.description ?? `UI component catalog: ${catalog.title}`,
          mimeType: 'text/plain',
        },
        async () => ({
          contents: [
            {
              uri: catalog.catalogId,
              mimeType: 'text/plain',
              text: generateCatalogPrompt(catalog),
            },
          ],
        })
      );

      console.error(`[MCP] Registered catalog resource: ${catalog.catalogId}`);
    }

    // Notify MCP clients that resources (and prompt content) have changed
    try {
      server.sendResourceListChanged();
      server.sendPromptListChanged();
    } catch {
      // Server may not be connected yet
    }
  };

  // Listen for catalogs from connected clients
  sessionManager.onCatalogsRegistered(registerCatalogResources);

  // Also register any catalogs already available
  const existing = sessionManager.getCatalogs();
  if (existing.length > 0) {
    registerCatalogResources(existing);
  }

  // Listen for upstream actions and notify MCP clients
  sessionManager.onAction((_sessionId, _message) => {
    try {
      server.sendResourceListChanged();
    } catch {
      // Server may not be connected yet
    }
  });

  // Register action queue resource template — MCP clients can read pending actions
  server.registerResource(
    'Pending UI Actions',
    new ResourceTemplate('mcp://freesail.dev/actions/{sessionId}', { list: undefined }),
    {
      description: 'Pending upstream actions from the UI for a given session. Reading drains the queue.',
      mimeType: 'application/json',
    },
    async (uri, { sessionId }) => {
      const actions = sessionManager.dequeueActions(sessionId as string);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(actions),
          },
        ],
      };
    }
  );

  // ========================================================================
  // Tools
  // ========================================================================

  // Helper to send a message to a specific session (sessionId is always required)
  const sendToSession = (
    message: DownstreamMessage,
    sessionId: string
  ): { success: boolean; message: DownstreamMessage; error?: string } => {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return { success: false, message, error: `Session ${sessionId} not found` };
    }

    const surfaceId =
      'createSurface' in message ? message.createSurface.surfaceId :
        'updateComponents' in message ? message.updateComponents.surfaceId :
          'updateDataModel' in message ? message.updateDataModel.surfaceId :
            'deleteSurface' in message ? message.deleteSurface.surfaceId :
              null;

    sessionManager.sendToSession(sessionId, message);

    // Register surface→session mapping for createSurface
    if (surfaceId && 'createSurface' in message) {
      sessionManager.addSurface(sessionId, surfaceId, message.createSurface.catalogId);
    }

    return { success: true, message };
  };


  // Register tools using the modern McpServer API

  server.registerTool(
    'create_surface',
    {
      description:
        'Initialize a new UI surface for a specific client session. This must be called before updating components. ' +
        'The surface will be bound to a specific catalog that the client supports.',
      inputSchema: {
        surfaceId: z.string().describe('Unique identifier for this surface (e.g., "main", "sidebar")'),
        catalogId: z.string().describe('The catalog ID defining available components'),
        sessionId: z.string().describe('Target client session ID'),
        sendDataModel: z.boolean().optional().describe('If true, client sends full data model with every action. Defaults to true.'),
        theme: z.object({
          primaryColor: z.string().optional(),
        }).passthrough().optional().describe('Optional theme configuration'),
      },
    },
    async ({ surfaceId, catalogId, sessionId, sendDataModel, theme }) => {
      // Validate catalog against session capabilities
      const validationError = sessionManager.validateCatalogForSession(sessionId, catalogId);
      if (validationError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: validationError }) }],
          isError: true,
        };
      }

      // Default sendDataModel to true for better UX with input components
      const effectiveSendDataModel = sendDataModel ?? true;

      const message: DownstreamMessage = {
        version: A2UI_VERSION,
        createSurface: {
          surfaceId: surfaceId as SurfaceId,
          catalogId: catalogId as CatalogId,
          sendDataModel: effectiveSendDataModel,
          theme,
        },
      };
      const result = sendToSession(message, sessionId);
      if (!result.success) {
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }
  );

  server.registerTool(
    'update_components',
    {
      description:
        'Update the component tree of a surface. Components are defined as a flat list ' +
        'with parent-child relationships specified via the children array. ' +
        'One component MUST have id "root" to serve as the component tree root.',
      inputSchema: {
        surfaceId: z.string().describe('The surface to update'),
        sessionId: z.string().describe('Target client session ID'),
        components: z.array(z.object({
          id: z.string().describe('Component ID (use "root" for the root component)'),
          component: z.string().describe('Component type from catalog (e.g., "Text", "Column", "Button")'),
          child: z.string().optional().describe('ID of single child component (for Card, Modal)'),
          children: z.union([
            z.array(z.string()),
            z.object({
              componentId: z.string(),
              path: z.string(),
            }),
          ]).optional().describe('IDs of child components or template for dynamic children'),
        }).passthrough()).describe('Array of component definitions'),
      },
    },
    async ({ surfaceId, sessionId, components }) => {
      // STRICT VALIDATION: Ensure components exist in the surface's catalog
      const catalog = sessionManager.getCatalogForSurface(surfaceId);
      if (catalog) {
        const errors: string[] = [];
        for (const comp of components) {
          const validation = validateComponent(catalog, comp.component, comp);
          if (!validation.valid) {
            errors.push(`Component '${comp.id}' (${comp.component}): ${validation.errors.join(', ')}`);
          }
        }

        if (errors.length > 0) {
          return {
            content: [{ type: 'text', text: `Validation Failed:\n${errors.join('\n')}` }],
            isError: true,
          };
        }
      }

      const message: DownstreamMessage = {
        version: A2UI_VERSION,
        updateComponents: {
          surfaceId: surfaceId as SurfaceId,
          components: components as A2UIComponent[],
        },
      };
      const result = sendToSession(message, sessionId);
      if (!result.success) {
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }
  );

  server.registerTool(
    'update_data_model',
    {
      description:
        'Update the data model of a surface. This changes the content displayed by ' +
        'components without changing the component structure. ' +
        'Components use data bindings like {"path": "/user/name"} to reference data.',
      inputSchema: {
        surfaceId: z.string().describe('The surface to update'),
        sessionId: z.string().describe('Target client session ID'),
        path: z.string().optional().describe('JSON pointer to the data location (e.g., "/user/name"). Defaults to "/"'),
        value: z.unknown().optional().describe('The value to set. If omitted, removes the key at path.'),
      },
    },
    async ({ surfaceId, sessionId, path, value }) => {
      const message: DownstreamMessage = {
        version: A2UI_VERSION,
        updateDataModel: {
          surfaceId: surfaceId as SurfaceId,
          path,
          value,
        },
      };
      const result = sendToSession(message, sessionId);
      if (!result.success) {
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }
  );

  server.registerTool(
    'delete_surface',
    {
      description: 'Remove a surface and all its components from the UI for a specific client.',
      inputSchema: {
        surfaceId: z.string().describe('The surface to delete'),
        sessionId: z.string().describe('Target client session ID'),
      },
    },
    async ({ surfaceId, sessionId }) => {
      const message: DownstreamMessage = {
        version: A2UI_VERSION,
        deleteSurface: {
          surfaceId: surfaceId as SurfaceId,
        },
      };
      const result = sendToSession(message, sessionId);
      if (!result.success) {
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }
  );


  // Tool to read pending actions for a session
  server.registerTool(
    'get_pending_actions',
    {
      description:
        'Retrieve and drain all pending upstream actions (button clicks, form submissions, etc.) ' +
        'from a specific client session. Returns an array of action messages.',
      inputSchema: {
        sessionId: z.string().describe('The session ID to get actions for'),
      },
    },
    async ({ sessionId }) => {
      const actions = sessionManager.dequeueActions(sessionId);
      return {
        content: [
          {
            type: 'text',
            text: actions.length > 0
              ? JSON.stringify(actions, null, 2)
              : 'No pending actions.',
          },
        ],
      };
    }
  );

  // Tool to drain all pending actions across all sessions
  server.registerTool(
    'get_all_pending_actions',
    {
      description:
        'Retrieve and drain all pending upstream actions from ALL connected sessions ' +
        '(or only sessions claimed by a specific agent). ' +
        'Returns an array of { sessionId, actions } objects. Only sessions with pending actions are included.',
      inputSchema: {
        agentId: z.string().optional().describe('If provided, only return actions from sessions claimed by this agent'),
      },
    },
    async ({ agentId }) => {
      let allActions;
      if (agentId) {
        const sessionIds = sessionManager.getSessionsForAgent(agentId);
        allActions = sessionIds
          .map(sid => ({ sessionId: sid, actions: sessionManager.dequeueActions(sid) }))
          .filter(a => a.actions.length > 0);
      } else {
        allActions = sessionManager.dequeueAllActions();
      }
      return {
        content: [
          {
            type: 'text',
            text: allActions.length > 0
              ? JSON.stringify(allActions, null, 2)
              : 'No pending actions.',
          },
        ],
      };
    }
  );

  // Tool to list active sessions
  server.registerTool(
    'list_sessions',
    {
      description:
        'List all active client sessions with their surfaces, supported catalogs, ' +
        'bound agent, and pending action counts. ' +
        'Use this to discover connected clients and target specific sessions.',
      inputSchema: {},
    },
    async () => {
      const summaries = sessionManager.getSessionSummaries();
      return {
        content: [
          {
            type: 'text',
            text: summaries.length > 0
              ? JSON.stringify(summaries, null, 2)
              : 'No active sessions.',
          },
        ],
      };
    }
  );

  // ========================================================================
  // Agent Binding Tools
  // ========================================================================

  server.registerTool(
    'claim_session',
    {
      description:
        'Claim a client session for this agent. Once claimed, you can filter ' +
        'get_all_pending_actions by your agentId to receive only your sessions\' actions. ' +
        'A session can only be claimed by one agent at a time.',
      inputSchema: {
        agentId: z.string().describe('Your unique agent identifier'),
        sessionId: z.string().describe('The client session ID to claim'),
      },
    },
    async ({ agentId, sessionId }) => {
      const result = sessionManager.claimSession(agentId, sessionId);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: !result.success,
      };
    }
  );

  server.registerTool(
    'release_session',
    {
      description: 'Release your claim on a client session, making it available to other agents.',
      inputSchema: {
        agentId: z.string().describe('Your agent identifier'),
        sessionId: z.string().describe('The session to release'),
      },
    },
    async ({ agentId, sessionId }) => {
      const released = sessionManager.releaseSession(agentId, sessionId);
      return {
        content: [{
          type: 'text',
          text: released
            ? 'Session released successfully.'
            : 'Session was not claimed by this agent.',
        }],
      };
    }
  );

  return server;
}

/**
 * Run the MCP server with stdio transport.
 */
export async function runMCPServer(options: MCPServerOptions): Promise<void> {
  const server = createMCPServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Server running on stdio');
}
