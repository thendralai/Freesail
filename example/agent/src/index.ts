/**
 * @fileoverview Freesail Agent Server
 *
 * Connects to the Freesail gateway via MCP HTTP SSE transport.
 * The gateway runs as a separate process — this agent connects to it
 * over HTTP rather than spawning it as a child process.
 *
 * Chat communication flows through the A2UI protocol via a __chat surface
 * rather than a separate HTTP endpoint. When a client connects, the agent
 * runtime creates a new FreesailLangchainSessionAgent for that session
 * via the factory pattern, achieving full per-session state isolation.
 */

import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { NativeLogger, getConsoleSink, configure } from '@freesail/logger';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { FreesailAgentRuntime, SharedCache } from '@freesail/agentruntime';
import { FreesailLangchainSessionAgent } from './langchain-agent.js';
import { LangChainAdapter } from './langchain-adapter.js';

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: [], sinks: ['console'], level: 'info' }],
});
const logger = new NativeLogger('freesail-agent');

// Configuration
const PORT = parseInt(process.env['AGENT_PORT'] ?? '3002', 10);
const MCP_PORT = parseInt(process.env['MCP_PORT'] ?? '3000', 10);
const GATEWAY_PORT = parseInt(process.env['GATEWAY_PORT'] ?? '3001', 10);
const AGENT_ID = 'freesail-example-agent';

// ============================================================================
// LLM Provider Selection
// Supported: 'gemini' (default), 'openai'
// Set LLM_PROVIDER=openai and OPENAI_API_KEY, or
//     LLM_PROVIDER=gemini and GOOGLE_API_KEY.
// ============================================================================

const LLM_PROVIDER = (process.env['LLM_PROVIDER'] ?? 'gemini').toLowerCase();
const LLM_TEMPERATURE = parseFloat(process.env['LLM_TEMPERATURE'] ?? '0.7');

let model: BaseChatModel;

if (LLM_PROVIDER === 'openai') {
  const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
  if (!OPENAI_API_KEY) {
    logger.fatal('OPENAI_API_KEY environment variable is required when LLM_PROVIDER=openai.');
    process.exit(1);
  }
  const { ChatOpenAI } = await import('@langchain/openai');
  const openaiModel = process.env['OPENAI_MODEL'] ?? 'gpt-4o';
  model = new ChatOpenAI({
    apiKey: OPENAI_API_KEY,
    model: openaiModel,
    temperature: LLM_TEMPERATURE,
    streaming: true,
  });
  logger.info(`LLM provider: OpenAI (${openaiModel})`);
} else {
  // Default: Gemini
  const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'];
  if (!GOOGLE_API_KEY) {
    logger.fatal('GOOGLE_API_KEY environment variable is required when LLM_PROVIDER=gemini (default). Set it with: export GOOGLE_API_KEY=your-api-key');
    process.exit(1);
  }
  const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
  const geminiModel = process.env['GEMINI_MODEL'] ?? 'gemini-2.5-pro';
  model = new ChatGoogleGenerativeAI({
    apiKey: GOOGLE_API_KEY,
    model: geminiModel,
    temperature: LLM_TEMPERATURE,
  });
  logger.info(`LLM provider: Google Gemini (${geminiModel})`);
}

// ============================================================================
// MCP Client Setup — connect to gateway via HTTP SSE
// ============================================================================

logger.info(`Connecting to Freesail gateway MCP at http://localhost:${MCP_PORT}/mcp ...`);

const transport = new StreamableHTTPClientTransport(
  new URL(`http://localhost:${MCP_PORT}/mcp`)
);

const mcpClient = new Client(
  { name: 'freesail-agent', version: '0.1.0' },
  { capabilities: {} }
);

await mcpClient.connect(transport);
logger.info('Connected to gateway MCP server via SSE');

const { tools } = await mcpClient.listTools();
logger.info(`MCP tools: ${tools.map(t => t.name).join(', ')}`);

const { prompts } = await mcpClient.listPrompts();
logger.info(`MCP prompts: ${prompts.map(p => p.name).join(', ')}`);

// ============================================================================
// Shared cache — fetched once and reused across all session agents
// ============================================================================

// Shared cache for system prompt and tools — deduplication mutex built in
// toolsFactory is passed here so the cache stays framework-agnostic in agentruntime
const sharedCache = new SharedCache<any[]>(mcpClient, () => LangChainAdapter.getTools(mcpClient));

// The gateway sends resources/list_changed on every upstream UI action
// (to signal pending actions in the mcp://freesail.dev/actions/{sessionId} resource).
// Catalog content is fetched on-demand via get_catalogs — no cache invalidation needed.
mcpClient.setNotificationHandler<any>(
  z.object({ method: z.literal('notifications/resources/list_changed') }).passthrough(),
  async () => {}
);


// ============================================================================
// Agent Runtime — session-based factory pattern
// ============================================================================

const runtime = new FreesailAgentRuntime({
  mcpClient,
  agentId: AGENT_ID,
  agentFactory: (sessionId) =>
    new FreesailLangchainSessionAgent(sessionId, {
      mcpClient,
      model,
      sharedCache,
    }),
});

runtime.start();

// ============================================================================
// Express Server (health endpoint)
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  logger.info(`Agent server running on http://localhost:${PORT}`);
  logger.info(`Chat flows through A2UI __chat surface`);
  logger.info(`Gateway MCP: http://localhost:${MCP_PORT}/mcp (SSE)`);
  logger.info(`Gateway HTTP: http://localhost:${GATEWAY_PORT}`);
  logger.info(`Agent ID: ${AGENT_ID}`);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  try { await mcpClient.close(); } catch {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  try { await mcpClient.close(); } catch {}
  process.exit(0);
});
