import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { jsonSchemaToZod } from '@freesail/agentruntime';
import { logger } from '@freesail/logger';

export class LangChainAdapter {
  /**
   * Build LangChain tools from MCP tools.
   * Each MCP tool is wrapped as a DynamicStructuredTool that proxies
   * calls through the MCP client.
   *
   * Catalog discovery is handled by the `get_catalogs` MCP tool which is
   * auto-proxied from the server's tool list — no separate resource tools needed.
   */
  static async getTools(mcpClient: Client): Promise<any> {
    const { tools: mcpTools } = await mcpClient.listTools();

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
    )];
  }
}
