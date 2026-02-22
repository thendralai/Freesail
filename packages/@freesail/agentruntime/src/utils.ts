import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { logger } from '@freesail/logger';

const FALLBACK_SYSTEM_PROMPT = `You are a helpful AI assistant that can create visual UI components using the available tools.

When the user asks to show something visually, use the tools to create UI surfaces with components.
Always respond conversationally AND create UI when appropriate.`;

/**
 * Fetch the system prompt from the MCP server.
 * The prompt is dynamically generated with current catalog information.
 * 
 * @param mcpClient The connected MCP Client instance
 * @returns The resolved system prompt string or a default fallback
 */
export async function fetchFreesailSystemPrompt(mcpClient: Client): Promise<string> {
  try {
    const result = await mcpClient.getPrompt({ name: 'a2ui_system' });
    const prompt = result.messages
      .map((m: any) => {
        if (typeof m.content === 'string') return m.content;
        if (m.content.type === 'text') return m.content.text;
        return '';
      })
      .join('\\n');
    logger.debug('[FreesailUtils] System prompt loaded from MCP server');
    return prompt;
  } catch (error) {
    logger.warn('[FreesailUtils] Failed to get MCP prompt, using fallback');
    return FALLBACK_SYSTEM_PROMPT;
  }
}

/**
 * Fallback logic for Gemini 2.5 Flash which sometimes embeds function calls directly
 * inside the raw 'content' array payload during streaming instead of populating `tool_calls`.
 * 
 * By passing the final chunk parsed from `streamModelResponse` through this function, 
 * you can safely extract nested `functionCall` elements and map them to the standard array format.
 * 
 * @param finalChunk The aggregated final chunk from a Langchain `.stream` operation
 * @returns A cleaned chunk reference with tool calls appropriately extracted
 */
export function extractGeminiToolCalls(finalChunk: any): any {
  if (!finalChunk) return finalChunk;

  if ((!finalChunk.tool_calls || finalChunk.tool_calls.length === 0) && Array.isArray(finalChunk.content)) {
    const extractedToolCalls = [];
    for (const part of finalChunk.content) {
      if (part.functionCall) {
         extractedToolCalls.push({
           name: part.functionCall.name,
           args: part.functionCall.args,
           id: `call_${Math.random().toString(36).substring(2, 9)}`, // Synthetic unique ID
         });
      }
    }
    
    if (extractedToolCalls.length > 0) {
      finalChunk.tool_calls = extractedToolCalls;
      // Clean out the content array to just be text parts, or an empty string, so the LLM format doesn't break
      const textParts = finalChunk.content.filter((p: any) => p.type === 'text');
      finalChunk.content = textParts.length > 0 ? textParts : '';
    }
  }

  return finalChunk;
}
