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
import { z } from 'zod';
import { logger } from '@freesail/logger';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { FreesailLangchainAgent, FreesailAgentRuntime, formatAction } from '@freesail/agentruntime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const PORT = parseInt(process.env['AGENT_PORT'] ?? '3002', 10);
const GATEWAY_PORT = parseInt(process.env['GATEWAY_PORT'] ?? '3001', 10);
const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'];
const CHAT_CATALOG_ID = 'https://freesail.dev/catalogs/chat_catalog_v1.json';
const AGENT_ID = 'freesail-example-agent';

if (!GOOGLE_API_KEY) {
  logger.fatal('GOOGLE_API_KEY environment variable is required. Set it with: export GOOGLE_API_KEY=your-api-key');
  process.exit(1);
}

// ============================================================================
// Per-session Chat State
// ============================================================================
// MCP Client Setup — spawn gateway as child process
// ============================================================================

logger.info('Spawning Freesail gateway as MCP server...');

// Resolve path to gateway CLI script (dev = source, prod = dist)
const isDev = import.meta.url.includes('/src/');
const gatewayScript = isDev
  ? path.resolve(__dirname, '../../../packages/@freesail/gateway/src/cli.ts')
  : path.resolve(__dirname, '../../../packages/@freesail/gateway/dist/cli.js');

const spawnCommand = isDev ? 'npx' : 'node';
const spawnArgs = isDev
  ? ['tsx', '--inspect=9229', gatewayScript, '--http-port', String(GATEWAY_PORT)]
  : [gatewayScript, '--http-port', String(GATEWAY_PORT)];

logger.info(`Gateway command: ${spawnCommand} ${spawnArgs.join(' ')}`);

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
logger.info('Connected to gateway MCP server');

// Log available capabilities
const { tools } = await mcpClient.listTools();
logger.info(`MCP tools: ${tools.map(t => t.name).join(', ')}`);

const { prompts } = await mcpClient.listPrompts();
logger.info(`MCP prompts: ${prompts.map(p => p.name).join(', ')}`);

mcpClient.setNotificationHandler<any>(
  z.object({ method: z.literal('notifications/prompts/list_changed') }).passthrough(),
  async () => {
    logger.info('Prompts changed, invalidating cache');
    agent.invalidateCache();
  }
);

// Use the correct notification handler API for the MCP SDK
// The SDK v1.0.0 uses setNotificationHandler
mcpClient.setNotificationHandler<any>(
  z.object({ method: z.literal('notifications/resources/list_changed') }).passthrough(),
  async () => {
    logger.info('Resources changed, invalidating cache');
    agent.invalidateCache();
  }
);

// ============================================================================
// Agent Setup
// ============================================================================

// ============================================================================
// Agent Setup
// ============================================================================

const model = new ChatGoogleGenerativeAI({
  apiKey: GOOGLE_API_KEY,
  model: 'gemini-2.5-pro',
  temperature: 0.7,
});

const agent = new FreesailLangchainAgent({
  mcpClient,
  model,
});

// ============================================================================
// Agent Runtime
// ============================================================================

const runtime = new FreesailAgentRuntime({
  mcpClient,
  onChat: handleChatSend,
  onAction: async (actionMsg: any, sessionId: string) => {
     const action = actionMsg.action;
     if (!action) return;
     
     if (action.name === '__session_connected' || action.name === '__session_disconnected') {
        if (action.name === '__session_disconnected') {
          handleSessionDisconnected((action.context?.['sessionId'] as string) ?? sessionId);
        }
        return; 
     }

     
     if (action.name === 'chat_send' && action.surfaceId === '__chat') {
       const chatText = (action.context as { text?: string })?.text;
       if (chatText) {
         await handleChatSend(chatText, sessionId, true);
       }
       return;
     }

     logger.info(`Action: ${action.name} (session=${sessionId})`);

     const contextStr = action.context && Object.keys(action.context).length > 0
       ? `\\nAction data: ${JSON.stringify(action.context, null, 2)}` : '';
     const dataModelStr = actionMsg._clientDataModel?.dataModel && Object.keys(actionMsg._clientDataModel.dataModel).length > 0
       ? `\\nClient data model: ${JSON.stringify(actionMsg._clientDataModel.dataModel, null, 2)}` : '';
     
     const message = `[UI Action] The user clicked "${action.name}" on component "${action.sourceComponentId}" in surface "${action.surfaceId}".${contextStr}${dataModelStr}`;
     
     await handleChatSend(message, sessionId, false);
  }
});

const sessionChatMessages = new Map<string, Array<{ role: string; content: string; timestamp: string }>>();
function getChatMessages(sessionId: string) {
  if (!sessionChatMessages.has(sessionId)) {
    sessionChatMessages.set(sessionId, []);
  }
  return sessionChatMessages.get(sessionId)!;
}

async function handleChatSend(message: string, sessionId: string, isUserChat: boolean = true) {
  try {
    const messages = getChatMessages(sessionId);
    
    if (isUserChat) {
      messages.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      });
    }

    const assistantIndex = messages.length;
    messages.push({
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    });
    
    await mcpClient.callTool({
      name: 'update_data_model',
      arguments: { surfaceId: '__chat', sessionId, path: '/', value: { messages: [...messages], isTyping: true } },
    });

    const sessionPrompt = `[Session Context] The following message is from session "${sessionId}". ` +
      `When calling ANY tool (create_surface, update_components, update_data_model, stream_data_model, delete_surface), ` +
      `you MUST use sessionId: "${sessionId}". Do NOT reuse a sessionId from a previous message.\n` +
      `IMPORTANT: Do NOT create or modify the "__chat" surface (this includes using tools like update_data_model or stream_data_model on it) — it is managed by the framework. Just reply normally in chat for standard conversation. ` +
      `Only create new surfaces when you think the user needs visual UI.\n\n` +
      `User: ${message}`;
      
    const response = await agent.chat(sessionPrompt, sessionId, {
      onToken: (token) => {
        mcpClient.callTool({
          name: 'stream_data_model',
          arguments: {
            surfaceId: '__chat',
            sessionId,
            path: `/messages/${assistantIndex}/content`,
            delta: token,
          }
        }).catch(err => logger.error('Streaming error', err));
      }
    });
    
    if (response && response.trim() !== '') {
      if (messages[assistantIndex]) {
        messages[assistantIndex].content = response;
      }
    } else {
      messages.splice(assistantIndex, 1);
    }
    
    logger.info(`Assistant: ${response}`);

    await mcpClient.callTool({
      name: 'update_data_model',
      arguments: { surfaceId: '__chat', sessionId, path: '/', value: { messages: [...messages], isTyping: false } },
    });

  } catch (error) {
    logger.error('Chat error:', error);
    const messages = getChatMessages(sessionId);
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.content === '') {
      messages.pop();
    }
    messages.push({ role: 'assistant', content: 'An error occurred.', timestamp: new Date().toISOString() });
    
    await mcpClient.callTool({
      name: 'update_data_model',
      arguments: { surfaceId: '__chat', sessionId, path: '/', value: { messages: [...messages], isTyping: false } },
    });
  }
  
  return "ok";
}

runtime.start();

// ============================================================================
// Session Cleanup
// ============================================================================

function handleSessionDisconnected(sessionId: string): void {
  sessionChatMessages.delete(sessionId);
  agent.clearHistory(sessionId);
  logger.info(`Cleaned up chat state for session ${sessionId}`);
}

// ============================================================================
// Express Server (health + clear only — chat flows through A2UI)
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Chat flows through A2UI __chat surface`);
  logger.info(`Gateway MCP: connected via stdio`);
  logger.info(`Gateway HTTP: http://localhost:${GATEWAY_PORT}`);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  try {
    await mcpClient.close();
  } catch {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  try {
    await mcpClient.close();
  } catch {}
  process.exit(0);
});
