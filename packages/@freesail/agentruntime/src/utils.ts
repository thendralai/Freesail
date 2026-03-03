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

/** Represents a single MCP resource entry. */
export interface McpResourceEntry {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
}

/**
 * List all MCP resources (catalogs, files, etc.) registered on the gateway.
 *
 * Every agent LLM MUST have access to this via a tool. The A2UI system prompt
 * instructs the model to call `list_resources` to discover available catalogs
 * before creating any surface. Without this tool the model will guess component
 * names and likely produce invalid UI.
 *
 * @returns Array of resource entries, or an empty array on failure
 */
export async function listCatalogResources(mcpClient: Client): Promise<McpResourceEntry[]> {
  try {
    const result = await mcpClient.listResources();
    return result.resources.map(r => ({
      uri: r.uri,
      name: r.name,
      mimeType: r.mimeType,
      description: r.description ?? undefined,
    }));
  } catch (error) {
    logger.error('[FreesailUtils] Failed to list MCP resources:', error);
    return [];
  }
}

/**
 * Read the content of a single MCP resource by URI (e.g. a catalog definition).
 *
 * Every agent LLM MUST have access to this via a tool. The A2UI system prompt
 * instructs the model to call `read_resource` to load component definitions
 * from a catalog before creating a surface.
 *
 * If the resource cannot be read, this function **re-throws** so the framework
 * adapter can return the error as a tool result. The system prompt instructs the
 * LLM to surface this failure to the user as a visible warning rather than
 * silently continuing with guessed component names.
 *
 * @param uri The exact URI returned by `listCatalogResources`
 * @returns The resource content as a string
 * @throws If the MCP resource cannot be read
 */
export async function readCatalogResource(mcpClient: Client, uri: string): Promise<string> {
  try {
    const result = await mcpClient.readResource({ uri });
    return result.contents
      .map(c => {
        if ('text' in c) return c.text;
        if ('blob' in c) return `[Binary resource: ${c.mimeType}]`;
        return '';
      })
      .join('\n\n');
  } catch (error) {
    logger.error(`[FreesailUtils] Failed to read MCP resource "${uri}":`, error);
    throw error; // surface to LLM as a tool error → LLM warns the user
  }
}


