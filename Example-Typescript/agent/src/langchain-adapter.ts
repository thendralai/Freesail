import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { jsonSchemaToZod, listCatalogResources, readCatalogResource } from '@freesail/agentruntime';
import { logger } from '@freesail/logger';

export class LangChainAdapter {
  /**
   * Build LangChain tools from MCP tools.
   * Each MCP tool is wrapped as a DynamicStructuredTool that proxies
   * calls through the MCP client.
   *
   * `list_resources` and `read_resource` are always included — they are
   * required for the LLM to discover catalog component definitions before
   * creating any surface (as mandated by the A2UI system prompt).
   */
  static async getTools(mcpClient: Client): Promise<any> {
    const { tools: mcpTools } = await mcpClient.listTools();
    
    // list_resources — required for catalog discovery
    const listResourcesTool = tool(
      async () => {
        const resources = await listCatalogResources(mcpClient);
        if (resources.length === 0) {
          return 'No resources available. Inform the user that no component catalogs are currently registered.';
        }
        return resources
          .map(r => `[${r.name}] (${r.mimeType ?? 'unknown'})\nURI: ${r.uri}\nDescription: ${r.description ?? 'No description'}`)
          .join('\n\n');
      },
      {
        name: 'list_resources',
        description: 'List available MCP resources including component catalogs. MUST be called before creating any surface.',
        schema: z.object({}),
      }
    ) as unknown as DynamicStructuredTool;

    // read_resource — required to load catalog component definitions
    const readResourceTool = tool(
      async ({ uri }: { uri: string }) => {
        try {
          return await readCatalogResource(mcpClient, uri);
        } catch (error) {
          // Return structured error — LLM will surface this to the user per system prompt instructions
          return `ERROR: Unable to read resource "${uri}": ${error instanceof Error ? error.message : String(error)}. Inform the user that the catalog could not be loaded and do not attempt to create UI components from it.`;
        }
      },
      {
        name: 'read_resource',
        description: 'Read the contents of an MCP resource such as a component catalog. MUST be called with the exact URI from list_resources before creating a surface.',
        schema: z.object({
          uri: z.string().describe('The exact URI of the resource to read, from list_resources'),
        }),
      }
    ) as unknown as DynamicStructuredTool;

    return [...mcpTools.map(mcpTool =>
      tool(
        async (args: Record<string, unknown>) => {
          // Block LLM from writing to client-managed surfaces (__chat, __system, etc.)
          // Agent code uses mcpClient.callTool() directly and bypasses this wrapper.
          const surfaceId = (args as any).surfaceId as string | undefined;
          if (surfaceId?.startsWith('__')) {
            return `Error: "${surfaceId}" is a client-managed surface. Agents may not call ${mcpTool.name} on it. Use a surface you created with create_surface instead.`;
          }

          if (mcpTool.name === 'update_components') {
            const comps = (args as any).components;
            logger.debug(`[AgentRuntime] Calling update_components for surface ${surfaceId} with ${comps?.length} components`);
          }
          if (mcpTool.name === 'update_data_model') {
            logger.debug(`[AgentRuntime] Calling update_data_model for surface ${surfaceId}: ${JSON.stringify(args, null, 2)}`);
          }

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
      ) as unknown as DynamicStructuredTool
    ), listResourcesTool, readResourceTool];
  }
}
