/**
 * @fileoverview Freesail Agent — MCP Client with LangChain + Gemini
 *
 * This agent connects to the Freesail gateway via MCP (Model Context Protocol)
 * and uses LangChain with Gemini to process chat messages and create dynamic UIs.
 *
 * The MCP server provides:
 * - System prompt (a2ui_system) with protocol docs and catalog info
 * - UI tools (create_surface, update_components, update_data_model, delete_surface)
 * - Action tools (get_pending_actions, get_all_pending_actions)
 * - Session tools (list_sessions)
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Agent configuration.
 */
export interface AgentConfig {
  /** Google API Key for Gemini */
  googleApiKey: string;
  /** MCP Client connected to the Freesail gateway */
  mcpClient: Client;
}

/**
 * Chat message format.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// JSON Schema → Zod Converter
// ============================================================================

/**
 * Convert a JSON Schema property to a Zod type.
 */
function propertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop['type'] as string | undefined;

  switch (type) {
    case 'string': {
      const enumValues = prop['enum'] as string[] | undefined;
      if (enumValues && enumValues.length > 0) {
        return z.enum(enumValues as [string, ...string[]]);
      }
      return z.string();
    }
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array': {
      const items = prop['items'] as Record<string, unknown> | undefined;
      return z.array(items ? propertyToZod(items) : z.unknown());
    }
    case 'object': {
      const properties = prop['properties'] as Record<string, Record<string, unknown>> | undefined;
      if (properties) {
        return jsonSchemaToZod(prop);
      }
      return z.record(z.unknown());
    }
    default:
      return z.unknown();
  }
}

/**
 * Convert a JSON Schema object to a Zod object schema.
 * Handles nested objects, arrays, optionals, and descriptions.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodObject<z.ZodRawShape> {
  const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  const required = schema['required'] as string[] | undefined;

  if (!properties) return z.object({}).passthrough();

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let field: z.ZodTypeAny = propertyToZod(prop);

    const description = prop['description'] as string | undefined;
    if (description) {
      field = field.describe(description);
    }

    if (!required?.includes(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return z.object(shape).passthrough();
}

// ============================================================================
// Agent
// ============================================================================

const FALLBACK_SYSTEM_PROMPT = `You are a helpful AI assistant that can create visual UI components using the available tools.

When the user asks to show something visually, use the tools to create UI surfaces with components.
Always respond conversationally AND create UI when appropriate.`;

/**
 * Create the Freesail agent powered by MCP + LangChain + Gemini.
 *
 * The agent:
 * 1. Fetches its system prompt from the MCP server (includes protocol docs + catalogs)
 * 2. Discovers available tools from MCP and wraps them for LangChain
 * 3. Routes all tool calls through the MCP client to the gateway
 */
export function createAgent(config: AgentConfig) {
  const { googleApiKey, mcpClient } = config;

  // Initialize Gemini model
  const model = new ChatGoogleGenerativeAI({
    apiKey: googleApiKey,
    model: 'gemini-3-flash-preview',
    temperature: 0.7,
  });

  // Per-session conversation history
  const sessionHistories = new Map<string, (HumanMessage | AIMessage | ToolMessage)[]>();

  function getHistory(sessionId: string): (HumanMessage | AIMessage | ToolMessage)[] {
    if (!sessionHistories.has(sessionId)) {
      sessionHistories.set(sessionId, []);
    }
    return sessionHistories.get(sessionId)!;
  }

  // Cached MCP data
  let cachedSystemPrompt: string | null = null;
  let cachedTools: DynamicStructuredTool[] | null = null;

  /**
   * Fetch the system prompt from the MCP server.
   * The prompt is dynamically generated with current catalog information.
   */
  async function getSystemPrompt(): Promise<string> {
    if (cachedSystemPrompt) return cachedSystemPrompt;

    try {
      const result = await mcpClient.getPrompt({ name: 'a2ui_system' });
      cachedSystemPrompt = result.messages
        .map(m => {
          if (typeof m.content === 'string') return m.content;
          if (m.content.type === 'text') return m.content.text;
          return '';
        })
        .join('\n');
      console.log('[Agent] System prompt loaded from MCP server');
    } catch (error) {
      console.error('[Agent] Failed to get MCP prompt, using fallback:', error);
      cachedSystemPrompt = FALLBACK_SYSTEM_PROMPT;
    }

    return cachedSystemPrompt;
  }

  /**
   * Build LangChain tools from MCP tools.
   * Each MCP tool is wrapped as a DynamicStructuredTool that proxies
   * calls through the MCP client.
   */
  async function getTools(): Promise<DynamicStructuredTool[]> {
    if (cachedTools) return cachedTools;

    const { tools: mcpTools } = await mcpClient.listTools();
    console.log(
      `[Agent] Loaded ${mcpTools.length} tools from MCP:`,
      mcpTools.map(t => t.name).join(', ')
    );

    cachedTools = mcpTools.map(mcpTool =>
      tool(
        async (args: Record<string, unknown>) => {
          const result = await mcpClient.callTool({
            name: mcpTool.name,
            arguments: args,
          });
          const content = result.content as Array<{ type: string; text?: string }>;
          return content
            .map(c => c.type === 'text' ? c.text ?? '' : JSON.stringify(c))
            .join('\n');
        },
        {
          name: mcpTool.name,
          description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
          schema: jsonSchemaToZod(mcpTool.inputSchema as Record<string, unknown>),
        }
      )
    );

    return cachedTools;
  }

  /**
   * Invalidate cached prompt and tools.
   * Called when MCP resources/prompts change (e.g., new catalogs registered).
   */
  function invalidateCache(): void {
    cachedSystemPrompt = null;
    cachedTools = null;
  }

  /**
   * Process a chat message and return the response.
   * Uses the MCP-provided system prompt and tools.
   */
  async function chat(userMessage: string, sessionId: string = 'default'): Promise<string> {
    const systemPrompt = await getSystemPrompt();
    const currentTools = await getTools();
    const modelWithTools = model.bindTools(currentTools);

    const conversationHistory = getHistory(sessionId);

    conversationHistory.push(new HumanMessage(userMessage));

    const messages = [
      new SystemMessage(systemPrompt),
      ...conversationHistory,
    ];

    // Call model with tools
    let response = await modelWithTools.invoke(messages);

    // Track tool messages for this turn (kept separate until the turn ends)
    const turnToolMessages: (AIMessage | ToolMessage)[] = [];

    // Process tool calls iteratively
    while (response.tool_calls && response.tool_calls.length > 0) {
      // Add AI message with tool calls to turn history
      turnToolMessages.push(new AIMessage({
        content: typeof response.content === 'string' ? response.content : '',
        tool_calls: response.tool_calls,
      }));

      // Execute each tool call
      const toolMessages: ToolMessage[] = [];
      for (const toolCall of response.tool_calls) {
        const matchedTool = currentTools.find(t => t.name === toolCall.name);
        let result: string;

        try {
          if (matchedTool) {
            result = String(await matchedTool.invoke(toolCall.args));
          } else {
            result = `Unknown tool: ${toolCall.name}`;
          }
        } catch (error) {
          result = `Error: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`[Agent] Tool error (${toolCall.name}):`, error);
        }

        toolMessages.push(new ToolMessage({
          content: result,
          tool_call_id: toolCall.id ?? toolCall.name,
        }));
      }

      turnToolMessages.push(...toolMessages);

      response = await modelWithTools.invoke([
        new SystemMessage(systemPrompt),
        ...conversationHistory,
        ...turnToolMessages,
      ]);
    }

    // Conversation ended — persist all tool interactions so the LLM
    // remembers what tools it called and what values it set (e.g. which
    // data model values were the original ones).
    conversationHistory.push(...turnToolMessages);

    const assistantMessage = typeof response.content === 'string'
      ? response.content
      : Array.isArray(response.content)
        ? response.content.map((p: any) => p.text ?? '').join('')
        : JSON.stringify(response.content);

    conversationHistory.push(new AIMessage(assistantMessage));

    return assistantMessage;
  }

  /**
   * Clear conversation history for a session, or all sessions.
   */
  function clearHistory(sessionId?: string): void {
    if (sessionId) {
      sessionHistories.delete(sessionId);
    } else {
      sessionHistories.clear();
    }
  }

  return { chat, clearHistory, invalidateCache };
}
