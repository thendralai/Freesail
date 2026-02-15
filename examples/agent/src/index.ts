/**
 * @fileoverview Freesail Agent Server
 *
 * Spawns the Freesail gateway as an MCP server child process
 * and handles all user interaction through A2UI actions.
 *
 * Chat communication flows through the A2UI protocol via a __chat surface
 * rather than a separate HTTP endpoint. When a client connects, the agent
 * receives a synthetic __session_connected action and bootstraps the chat
 * surface for that session.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { createAgent } from './agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = parseInt(process.env['AGENT_PORT'] ?? '3002', 10);
const GATEWAY_PORT = parseInt(process.env['GATEWAY_PORT'] ?? '3001', 10);
const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'];
const CHAT_CATALOG_ID = 'https://freesail.dev/catalogs/chat_catalog_v1.json';
const AGENT_ID = 'freesail-example-agent';

if (!GOOGLE_API_KEY) {
  console.error('Error: GOOGLE_API_KEY environment variable is required');
  console.error('Set it with: export GOOGLE_API_KEY=your-api-key');
  process.exit(1);
}

// ============================================================================
// Per-session Chat State
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/** In-memory message history per session (drives the __chat surface data model). */
const sessionChatMessages = new Map<string, ChatMessage[]>();

function getChatMessages(sessionId: string): ChatMessage[] {
  if (!sessionChatMessages.has(sessionId)) {
    sessionChatMessages.set(sessionId, []);
  }
  return sessionChatMessages.get(sessionId)!;
}

// ============================================================================
// MCP Client Setup — spawn gateway as child process
// ============================================================================

console.log('[Agent] Spawning Freesail gateway as MCP server...');

// Resolve path to gateway CLI script (dev = source, prod = dist)
const isDev = import.meta.url.includes('/src/');
const gatewayScript = isDev
  ? path.resolve(__dirname, '../../../packages/@freesail/gateway/src/cli.ts')
  : path.resolve(__dirname, '../../../packages/@freesail/gateway/dist/cli.js');

const spawnCommand = isDev ? 'npx' : 'node';
const spawnArgs = isDev
  ? ['tsx', '--inspect=9229', gatewayScript, '--http-port', String(GATEWAY_PORT)]
  : [gatewayScript, '--http-port', String(GATEWAY_PORT)];

console.log(`[Agent] Gateway command: ${spawnCommand} ${spawnArgs.join(' ')}`);

const transport = new StdioClientTransport({
  command: spawnCommand,
  args: spawnArgs,
  // stderr: 'inherit' is the default — gateway logs appear in agent's terminal
});

const mcpClient = new Client(
  { name: 'freesail-agent', version: '0.1.0' },
  { capabilities: {} }
);

await mcpClient.connect(transport);
console.log('[Agent] Connected to gateway MCP server');

// Log available capabilities
const { tools } = await mcpClient.listTools();
console.log(`[Agent] MCP tools: ${tools.map(t => t.name).join(', ')}`);

const { prompts } = await mcpClient.listPrompts();
console.log(`[Agent] MCP prompts: ${prompts.map(p => p.name).join(', ')}`);

// ============================================================================
// Agent Setup
// ============================================================================

const agent = createAgent({
  googleApiKey: GOOGLE_API_KEY,
  mcpClient,
});

// ============================================================================
// Serialized Processing Queue
// ============================================================================

/**
 * All chat / action processing is serialized to avoid concurrent writes
 * to conversation history and data models.
 */
let processingChain = Promise.resolve();

function queueChat(message: string, sessionId: string): Promise<string> {
  const resultPromise = processingChain.then(() => agent.chat(message, sessionId));
  processingChain = resultPromise.then(
    () => { },
    () => { }
  );
  return resultPromise;
}

/** Queue an async side-effect that participates in the serial chain. */
function queueAsync(fn: () => Promise<void>): void {
  processingChain = processingChain.then(fn, () => fn().catch(() => { }));
}

// ============================================================================
// Chat Surface Bootstrap
// ============================================================================

/**
 * Called when a new client session connects.
 * Creates the __chat surface with the chat catalog components.
 */
async function bootstrapChatSurface(sessionId: string): Promise<void> {
  console.log(`[Agent] Bootstrapping chat surface for session ${sessionId}`);

  // Claim this session so the gateway knows who owns it
  await mcpClient.callTool({
    name: 'claim_session',
    arguments: { sessionId, agentId: AGENT_ID },
  });

  // Create the __chat surface bound to the chat catalog
  await mcpClient.callTool({
    name: 'create_surface',
    arguments: {
      surfaceId: '__chat',
      catalogId: CHAT_CATALOG_ID,
      sessionId,
      sendDataModel: true,
    },
  });

  // Send the component tree (flat adjacency list)
  await mcpClient.callTool({
    name: 'update_components',
    arguments: {
      surfaceId: '__chat',
      sessionId,
      components: [
        {
          id: 'root',
          component: 'ChatContainer',
          title: 'Chat with AI Agent',
          height: '100%',
          children: ['message_list', 'typing', 'chat_input'],
        },
        {
          id: 'message_list',
          component: 'ChatMessageList',
          children: { componentId: 'msg_template', path: '/messages' },
        },
        {
          id: 'msg_template',
          component: 'ChatMessage',
          // Properties flow from scopeData (each message object in /messages)
          // Explicitly bind them to satisfy strict schema validation
          role: { path: 'role' },
          content: { path: 'content' },
          timestamp: { path: 'timestamp' },
        },
        {
          id: 'typing',
          component: 'ChatTypingIndicator',
          visible: { path: '/isTyping' },
          text: 'Thinking...',
        },
        {
          id: 'chat_input',
          component: 'ChatInput',
          placeholder: 'Type a message...',
        },
      ],
    },
  });

  // Set initial data model
  await mcpClient.callTool({
    name: 'update_data_model',
    arguments: {
      surfaceId: '__chat',
      sessionId,
      path: '/',
      value: { messages: [], isTyping: false },
    },
  });

  sessionChatMessages.set(sessionId, []);
  console.log(`[Agent] Chat surface ready for session ${sessionId}`);
}

// ============================================================================
// Chat Message Handler
// ============================================================================

/**
 * Processes a chat_send action from the __chat surface.
 * Updates the data model optimistically, calls the LLM, then updates again.
 */
async function handleChatSend(sessionId: string, text: string): Promise<void> {
  const messages = getChatMessages(sessionId);

  // Append user message
  messages.push({
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
  });

  // Update UI: show user message + typing indicator
  await mcpClient.callTool({
    name: 'update_data_model',
    arguments: {
      surfaceId: '__chat',
      sessionId,
      path: '/',
      value: { messages: [...messages], isTyping: true },
    },
  });

  try {
    console.log(`[Agent] User (session=${sessionId}):`, text);
    // Include session context so the LLM targets the correct session
    const sessionPrompt = `[Session Context] The following message is from session "${sessionId}". ` +
      `When calling ANY tool (create_surface, update_components, update_data_model, delete_surface), ` +
      `you MUST use sessionId: "${sessionId}". Do NOT reuse a sessionId from a previous message.\n` +
      `IMPORTANT: Do NOT create or modify the "__chat" surface — it is managed by the framework. ` +
      `Only create new surfaces when the user explicitly asks for visual UI.\n\n` +
      `User: ${text}`;
    const response = await agent.chat(sessionPrompt, sessionId);
    console.log('[Agent] Assistant:', response);

    // Append assistant message
    messages.push({
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Agent] Chat error:', error);
    messages.push({
      role: 'assistant',
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: new Date().toISOString(),
    });
  }

  // Update UI: show response + hide typing
  await mcpClient.callTool({
    name: 'update_data_model',
    arguments: {
      surfaceId: '__chat',
      sessionId,
      path: '/',
      value: { messages: [...messages], isTyping: false },
    },
  });
}

// ============================================================================
// Session Cleanup
// ============================================================================

function handleSessionDisconnected(sessionId: string): void {
  sessionChatMessages.delete(sessionId);
  agent.clearHistory(sessionId);
  console.log(`[Agent] Cleaned up chat state for session ${sessionId}`);
}

// ============================================================================
// Action Notification Handler
// ============================================================================

/**
 * Format a generic UI action as a natural language message for the LLM.
 */
function formatAction(
  sessionId: string,
  action: {
    name?: string;
    surfaceId?: string;
    sourceComponentId?: string;
    context?: Record<string, unknown>;
  },
  clientDataModel?: Record<string, unknown>
): string {
  const { name, surfaceId, sourceComponentId, context } = action;
  const contextStr =
    context && Object.keys(context).length > 0
      ? `\nAction data: ${JSON.stringify(context, null, 2)}`
      : '';

  const dataModelStr =
    clientDataModel && Object.keys(clientDataModel).length > 0
      ? `\nClient data model (all current form/input values): ${JSON.stringify(clientDataModel, null, 2)}`
      : '';

  return `[Session Context] This action is from session "${sessionId}". Use sessionId: "${sessionId}" for ALL tool calls in your response.\n\n[UI Action] The user clicked "${name}" on component "${sourceComponentId}" in surface "${surfaceId}".${contextStr}${dataModelStr}\n\nPlease respond to this action appropriately. If form data is provided, process it. You may update the UI using your tools.`;
}

// Listen for MCP resource changes (fired when new actions or catalogs arrive)
mcpClient.setNotificationHandler(
  ResourceListChangedNotificationSchema,
  async () => {
    // Invalidate caches (catalogs/prompt may have changed)
    agent.invalidateCache();

    // Check for pending actions across all sessions
    try {
      const result = await mcpClient.callTool({
        name: 'get_all_pending_actions',
        arguments: {},
      });

      const content = result.content as Array<{ type: string; text?: string }>;
      const text =
        content[0]?.type === 'text'
          ? content[0].text ?? '[]'
          : '[]';

      if (text === 'No pending actions.' || text === '[]') return;

      const allActions = JSON.parse(text) as Array<{
        sessionId: string;
        actions: Array<{
          action?: {
            name: string;
            surfaceId: string;
            sourceComponentId: string;
            context: Record<string, unknown>;
          };
          _clientDataModel?: {
            surfaceId: string;
            dataModel: Record<string, unknown>;
          };
        }>;
      }>;

      for (const entry of allActions) {
        for (const actionMsg of entry.actions) {
          const action = actionMsg.action;
          if (!action) continue;

          console.log(
            `[Agent] Action: ${action.name} (session=${entry.sessionId})`
          );

          // ---- Synthetic: session connected ----
          if (action.name === '__session_connected') {
            queueAsync(() => bootstrapChatSurface(entry.sessionId));
            continue;
          }

          // ---- Synthetic: session disconnected ----
          if (action.name === '__session_disconnected') {
            const disconnectedId =
              (action.context?.['sessionId'] as string) ?? entry.sessionId;
            handleSessionDisconnected(disconnectedId);
            continue;
          }

          // ---- Chat message from __chat surface ----
          if (action.name === 'chat_send' && action.surfaceId === '__chat') {
            const chatText = (action.context as { text?: string })?.text;
            if (chatText) {
              queueAsync(() => handleChatSend(entry.sessionId, chatText));
            }
            continue;
          }

          // ---- Generic UI action — forward to LLM ----
          const clientDataModel = actionMsg._clientDataModel?.dataModel;
          const formatted = formatAction(entry.sessionId, action, clientDataModel);

          queueChat(formatted, entry.sessionId).then(
            (response) => console.log('[Agent] Action response:', response),
            (error) => console.error('[Agent] Action processing error:', error)
          );
        }
      }
    } catch (error) {
      console.error('[Agent] Error handling action notification:', error);
    }
  }
);

// ============================================================================
// Express Server (health + clear only — chat flows through A2UI)
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Clear conversation history and per-session chat state.
 */
app.post('/clear', (_req, res) => {
  agent.clearHistory();
  sessionChatMessages.clear();
  res.json({ success: true });
});

/**
 * Health check.
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Agent] Server running on http://localhost:${PORT}`);
  console.log(`[Agent] Chat flows through A2UI __chat surface`);
  console.log(`[Agent] Gateway MCP: connected via stdio`);
  console.log(`[Agent] Gateway HTTP: http://localhost:${GATEWAY_PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Agent] Shutting down...');
  try {
    await mcpClient.close();
  } catch {
    // ignore
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Agent] Shutting down...');
  try {
    await mcpClient.close();
  } catch {
    // ignore
  }
  process.exit(0);
});
