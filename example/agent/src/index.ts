/**
 * @fileoverview Freesail Agent Server
 *
 * Connects to the Freesail gateway via the agent runtime.
 * The runtime manages MCP client creation internally — one coordinator
 * client for session discovery, and one dedicated client per claimed session.
 *
 * Chat communication flows through the A2UI protocol via a __chat surface.
 */

import { NativeLogger, getConsoleSink, configure } from '@freesail/logger';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { FreesailAgentRuntime, SharedCache } from '@freesail/agent-runtime';
import type { FreesailSessionClient } from '@freesail/agent-runtime';
import { FreesailLangchainSessionAgent } from './langchain-agent.js';
import { LangChainAdapter } from './langchain-adapter.js';

await configure({
  sinks: { console: getConsoleSink() },
  loggers: [{ category: [], sinks: ['console'], level: 'info' }],
});
const logger = new NativeLogger('freesail-agent');

// Configuration
const MCP_PORT = parseInt(process.env['MCP_PORT'] ?? '3000', 10);
const GATEWAY_PORT = parseInt(process.env['GATEWAY_PORT'] ?? '3001', 10);
const AGENT_ID = 'freesail-example-agent';

// ============================================================================
// LLM Provider Selection
// Supported: 'gemini' (default), 'openai', 'claude'
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
  model = new ChatOpenAI({ apiKey: OPENAI_API_KEY, model: openaiModel, temperature: LLM_TEMPERATURE, streaming: true });
  logger.info(`LLM provider: OpenAI (${openaiModel})`);
} else if (LLM_PROVIDER === 'claude') {
  const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'];
  if (!ANTHROPIC_API_KEY) {
    logger.fatal('ANTHROPIC_API_KEY environment variable is required when LLM_PROVIDER=claude.');
    process.exit(1);
  }
  const { ChatAnthropic } = await import('@langchain/anthropic');
  const claudeModel = process.env['CLAUDE_MODEL'] ?? 'claude-sonnet-4-5-20250929';
  model = new ChatAnthropic({ anthropicApiKey: ANTHROPIC_API_KEY, model: claudeModel, temperature: LLM_TEMPERATURE, streaming: true });
  logger.info(`LLM provider: Anthropic Claude (${claudeModel})`);
} else {
  const GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'];
  if (!GOOGLE_API_KEY) {
    logger.fatal('GOOGLE_API_KEY environment variable is required when LLM_PROVIDER=gemini (default).');
    process.exit(1);
  }
  const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
  const geminiModel = process.env['GEMINI_MODEL'] ?? 'gemini-2.5-pro';
  model = new ChatGoogleGenerativeAI({ apiKey: GOOGLE_API_KEY, model: geminiModel, temperature: LLM_TEMPERATURE });
  logger.info(`LLM provider: Google Gemini (${geminiModel})`);
}

// ============================================================================
// Agent Runtime
// The runtime creates and manages all MCP clients internally.
// sharedCache is initialised after start() so the coordinator client is ready.
// The agentFactory closure reads sharedCache lazily (on first session action),
// so it is always initialised by the time it is accessed.
// ============================================================================

let sharedCache!: SharedCache<any[]>;

logger.info(`Connecting to Freesail gateway at http://localhost:${MCP_PORT}/mcp ...`);

const runtime = new FreesailAgentRuntime({
  gatewayUrl: `http://localhost:${MCP_PORT}/mcp`,
  clientInfo: { name: 'freesail-agent', version: '0.1.0' },
  agentFactory: (sessionId, session) =>
    new FreesailLangchainSessionAgent(sessionId, { session, model, sharedCache }),
});

await runtime.start();
logger.info('Connected to gateway');

sharedCache = new SharedCache<any[]>(
  () => runtime.getSystemPrompt(),
  () => LangChainAdapter.getToolDefinitions(runtime),
);

logger.info(`Chat flows through A2UI __chat surface`);
logger.info(`Gateway MCP: http://localhost:${MCP_PORT}/mcp`);
logger.info(`Gateway HTTP: http://localhost:${GATEWAY_PORT}`);
logger.info(`Agent ID: ${AGENT_ID}`);

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  try { await runtime.stop(); } catch {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  try { await runtime.stop(); } catch {}
  process.exit(0);
});
