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
// Agent Runtime
// ============================================================================

import { FreesailAgentRuntime, formatAction, bootstrapChatSurface } from '@freesail/agentruntime';

const runtime = new FreesailAgentRuntime({
  mcpClient,
  onChat: async (message, sessionId) => agent.chat(message, sessionId),
  onAction: async (actionMsg, sessionId) => {
    const action = actionMsg.action;
    if (!action) return;

    console.log(`[Agent] Action: ${action.name} (session=${sessionId})`);

    // ---- Synthetic: session connected ----
    if (action.name === '__session_connected') {
      await bootstrapChatSurface(mcpClient, sessionId, AGENT_ID, CHAT_CATALOG_ID);
      return;
    }

    // ---- Synthetic: session disconnected ----
    if (action.name === '__session_disconnected') {
      const disconnectedId = (action.context?.['sessionId'] as string) ?? sessionId;
      handleSessionDisconnected(disconnectedId);
      return;
    }

    // ---- Chat message from __chat surface ----
    if (action.name === 'chat_send' && action.surfaceId === '__chat') {
      const chatText = (action.context as { text?: string })?.text;
      if (chatText) {
        await handleChatSend(sessionId, chatText);
      }
      return;
    }

    // ---- Generic UI action — forward to LLM ----
    const clientDataModel = actionMsg._clientDataModel?.dataModel;
    const formatted = formatAction(sessionId, action, clientDataModel);

    try {
      const response = await agent.chat(formatted, sessionId);
      console.log('[Agent] Action response:', response);
    } catch (error) {
      console.error('[Agent] Action processing error:', error);
    }
  },
});

// Start the action polling loop
runtime.start();





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
      `Only create new surfaces when you think the user needs visual UI.\n\n` +
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
// Express Server (health + clear only — chat flows through A2UI)
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());


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
