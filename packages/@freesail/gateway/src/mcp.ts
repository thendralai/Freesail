/**
 * @fileoverview MCP Server Implementation
 *
 * Implements the Model Context Protocol server that exposes
 * Freesail tools to AI Agents.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from '@freesail/logger';

const logger = createLogger(['freesail', 'mcp']);
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
 * Recursively strip null values from an object, converting them to undefined
 * so JSON.stringify omits them. LLMs frequently send null for optional fields.
 */
function stripNulls<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(stripNulls) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== null) {
        result[key] = stripNulls(value);
      }
    }
    return result as T;
  }
  return obj;
}

/**
 * Validates whether an agent has permission to perform an operation on a surface,
 * and whether the surface ID conforms to naming rules.
 * 
 * Rules:
 * 1. Agent-created surfaces must be alphanumeric.
 * 2. Client-managed surfaces start with '__' and must be alphanumeric. Agents cannot create or delete them.
 * 3. Agents can only send 'updateDataModel' messages to client-managed surfaces.
 * 
 * @param surfaceId The ID of the surface.
 * @param operation The operation being attempted ('create_surface', 'update_components', 'update_data_model', 'delete_surface').
 * @returns An error string if access is denied, null if permitted.
 */
function validateAgentSurfaceAccess(surfaceId: string, operation: string): string | null {
  const isClientManaged = surfaceId.startsWith('__');

  if (isClientManaged) {
    if (!/^__[a-zA-Z0-9]+$/.test(surfaceId)) {
      return `Invalid client-managed surface ID '${surfaceId}'. It must start with '__' and contain only alphanumeric characters.`;
    }

    if (operation === 'create_surface' || operation === 'delete_surface') {
      return `Agents are not permitted to create or delete client-managed surfaces ('${surfaceId}').`;
    }

    if (operation !== 'update_data_model') {
       return `Agents are only permitted to send 'updateDataModel' messages to client-managed surfaces ('${surfaceId}'). Operation '${operation}' is forbidden.`;
    }
  } else {
    // Agent-created surface
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_]*$/.test(surfaceId)) {
      return `Invalid agent-created surface ID '${surfaceId}'. It must start with an alphanumeric character and contain only alphanumeric characters or underscores.`;
    }
  }

  return null;
}

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let systemPromptText: string;
try {
  systemPromptText = readFileSync(join(__dirname, 'system-prompt.md'), 'utf-8');
} catch (err) {
  logger.error('[MCP] Failed to load system-prompt.md:', err);
  systemPromptText = '';
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

      return {
        messages: [{
          role: 'assistant' as const,
          content: {
            type: 'text' as const,
            text: systemPromptText,
          },
        }],
      };
    }
  );

  // Listen for upstream actions and notify MCP clients.
  // Sends resources/list_changed so resource-polling agents can wake up and check
  // mcp://freesail.dev/actions/{sessionId}.
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
      },
    },
    async ({ surfaceId, catalogId, sessionId, sendDataModel }) => {
      const accessError = validateAgentSurfaceAccess(surfaceId, 'create_surface');
      if (accessError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: accessError }) }],
          isError: true,
        };
      }

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
        }).passthrough()).describe('Array of component definitions. Use child/children properties as specified in the catalog.'),
      },
    },
    async ({ surfaceId, sessionId, components }) => {
      const accessError = validateAgentSurfaceAccess(surfaceId, 'update_components');
      if (accessError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: accessError }) }],
          isError: true,
        };
      }

      // Reject if the surface hasn't been created for this session yet
      const surfaceError = sessionManager.validateSurfaceForSession(sessionId, surfaceId);
      if (surfaceError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: surfaceError }) }],
          isError: true,
        };
      }
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
          logger.warn(`[MCP] update_components validation failed for surface '${surfaceId}':`, errors);
          return {
            content: [{ type: 'text', text: `Validation Failed:\n${errors.join('\n')}` }],
            isError: true,
          };
        }
      } else {
        logger.warn(`[MCP] update_components: no catalog found for surface '${surfaceId}', skipping component validation`);
      }

      const message: DownstreamMessage = {
        version: A2UI_VERSION,
        updateComponents: {
          surfaceId: surfaceId as SurfaceId,
          components: stripNulls(components) as A2UIComponent[],
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
      const accessError = validateAgentSurfaceAccess(surfaceId, 'update_data_model');
      if (accessError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: accessError }) }],
          isError: true,
        };
      }

      // Reject writes to __-prefixed paths (reserved for client-side internal state)
      if (path && path.replace(/^\/+/, '').startsWith('__')) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Data model paths starting with '__' are reserved for client-side use. Agents cannot write to '${path}'.` }) }],
          isError: true,
        };
      }

      // Reject if the surface hasn't been created for this session yet
      const surfaceError = sessionManager.validateSurfaceForSession(sessionId, surfaceId);
      if (surfaceError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: surfaceError }) }],
          isError: true,
        };
      }
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
    'get_data_model',
    {
      description:
        'Retrieve the current data model for a surface from the client. ' +
        'Sends a request to the frontend which responds with the full data model ' +
        'regardless of the sendDataModel setting.',
      inputSchema: {
        surfaceId: z.string().describe('The surface to get the data model for'),
        sessionId: z.string().describe('Target client session ID'),
      },
    },
    async ({ surfaceId, sessionId }) => {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Session ${sessionId} not found` }) }],
          isError: true,
        };
      }

      const surfaceError = sessionManager.validateSurfaceForSession(sessionId, surfaceId);
      if (surfaceError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: surfaceError }) }],
          isError: true,
        };
      }

      try {
        const dataModel = await sessionManager.requestDataModel(sessionId, surfaceId as SurfaceId);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, surfaceId, dataModel }),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          }],
          isError: true,
        };
      }
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
      const accessError = validateAgentSurfaceAccess(surfaceId, 'delete_surface');
      if (accessError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: accessError }) }],
          isError: true,
        };
      }

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
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Session ${sessionId} not found or has disconnected.` }) }],
          isError: true,
        };
      }

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
      let allActions: Array<{ sessionId: string, actions: any[] }>;
      if (agentId) {
        const sessionIds = sessionManager.getSessionsForAgent(agentId);
        allActions = sessionIds
          .map(sid => ({ sessionId: sid, actions: sessionManager.dequeueActions(sid) }))
          .filter(a => a.actions.length > 0);
          
        const offlineActions = sessionManager.dequeueOfflineActions(agentId);
        if (offlineActions.length > 0) {
          allActions.push(...offlineActions);
        }
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
        'List the client sessions owned by this agent, with their surfaces, ' +
        'supported catalogs, and pending action counts.',
      inputSchema: {
        agentId: z.string().describe('Your agent identifier'),
      },
    },
    async ({ agentId }) => {
      const ownedSessionIds = new Set(sessionManager.getSessionsForAgent(agentId));
      const summaries = sessionManager.getSessionSummaries()
        .filter(s => ownedSessionIds.has(s.id));
      return {
        content: [
          {
            type: 'text',
            text: summaries.length > 0
              ? JSON.stringify(summaries, null, 2)
              : 'No active sessions owned by this agent.',
          },
        ],
      };
    }
  );

  // Tool to get catalogs and their component definitions for a specific session
  server.registerTool(
    'get_catalogs',
    {
      description:
        'Get the catalogs supported by a specific client session, including full component definitions. ' +
        'Returns an array of { catalogId, title, content } objects. ' +
        'Use the catalogId when calling create_surface. Read the content to understand available components.',
      inputSchema: {
        sessionId: z.string().describe('The client session ID'),
      },
    },
    async ({ sessionId }) => {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return {
          content: [{ type: 'text', text: `Session ${sessionId} not found.` }],
          isError: true,
        };
      }

      const catalogs = sessionManager.getCatalogsForSession(sessionId);
      if (catalogs.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No catalogs registered for this session yet. ' +
              'The client may still be initializing — retry in a moment, ' +
              'or tell the user no UI components are available.',
          }],
        };
      }

      const result = catalogs.map(c => ({
        catalogId: c.catalogId,
        title: c.title,
        content: generateCatalogPrompt(c),
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
  logger.info('[MCP] Server running on stdio');
}

/**
 * Options for the HTTP MCP server.
 */
export interface MCPHTTPServerOptions extends MCPServerOptions {
  /** Port for the MCP HTTP server (default: 3000) */
  port?: number;
  /** Host to bind to (default: '127.0.0.1' for localhost-only access) */
  host?: string;
}

/**
 * Run the MCP server with Streamable HTTP transport on a separate port.
 *
 * This is the decoupled mode: the gateway exposes MCP over HTTP
 * so that agents (in any language) can connect as standalone processes.
 *
 * All MCP communication goes through a single endpoint:
 * - GET  /mcp  → SSE stream for server-to-client messages
 * - POST /mcp  → client-to-server JSON-RPC messages
 * - DELETE /mcp → session termination
 *
 * Bound to 127.0.0.1 by default for network-level isolation.
 */
export async function runMCPServerHTTP(options: MCPHTTPServerOptions): Promise<void> {
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const { randomUUID } = await import('crypto');
  const express = (await import('express')).default;
  const cors = (await import('cors')).default;

  const port = options.port ?? 3000;
  const host = options.host ?? '127.0.0.1';

  const server = createMCPServer(options);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // Track transports by session ID for cleanup
  const transports: Record<string, InstanceType<typeof StreamableHTTPServerTransport>> = {};

  // Single /mcp endpoint handles GET (SSE), POST (messages), and DELETE (session termination)
  app.all('/mcp', async (req, res) => {
    // For new connections (no session header), create a new transport
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST' && !sessionId) {
      // New session — create transport and connect to MCP server
      logger.info('[MCP-HTTP] New session request');

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          logger.info(`[MCP-HTTP] Transport closed for session ${sid}`);
          delete transports[sid];
        }
      };

      await server.connect(transport);

      // handleRequest processes the initialize request and generates the session ID.
      // The session ID is only available AFTER this call completes.
      await transport.handleRequest(req, res, req.body);

      const sid = transport.sessionId;
      if (sid) {
        transports[sid] = transport;
        logger.info(`[MCP-HTTP] Session established: ${sid}`);
      }
      return;
    }

    // Existing session — route to the right transport
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // Unknown session
    if (sessionId) {
      res.status(404).send('Session not found');
      return;
    }

    // GET without session (initial SSE connection is handled by POST in Streamable HTTP)
    res.status(400).send('Missing mcp-session-id header');
  });

  // Start the MCP HTTP server on its own port
  return new Promise((resolve) => {
    app.listen(port, host, () => {
      logger.info(`[MCP-HTTP] Server listening on http://${host}:${port}`);
      logger.info(`[MCP-HTTP] Endpoint: http://${host}:${port}/mcp`);
      resolve();
    });
  });
}

