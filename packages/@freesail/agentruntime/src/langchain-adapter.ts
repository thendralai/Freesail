import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { jsonSchemaToZod } from './schema.js';

export class LangChainAdapter {
  /**
   * Build LangChain tools from MCP tools.
   * Each MCP tool is wrapped as a DynamicStructuredTool that proxies
   * calls through the MCP client.
   */
  static async getTools(mcpClient: Client): Promise<any> {
    const { tools: mcpTools } = await mcpClient.listTools();
    
    // Add built-in list_resources tool
    const listResourcesTool = tool(
      async () => {
        try {
          const result = await mcpClient.listResources();
          return result.resources
            .map(r => `[${r.name}] (${r.mimeType})\nURI: ${r.uri}\nDescription: ${r.description ?? 'No description'}`)
            .join('\n\n');
        } catch (error) {
          return `Error listing resources: ${error}`;
        }
      },
      {
        name: 'list_resources',
        description: 'List available MCP resources (catalogs, files, prompts).',
        schema: z.object({}),
      }
    ) as unknown as DynamicStructuredTool;

    // Add built-in read_resource tool
    const readResourceTool = tool(
      async ({ uri }: { uri: string }) => {
        try {
          const result = await mcpClient.readResource({ uri });
          const contents = result.contents;
          return contents
            .map(c => {
              if ('text' in c) {
                return c.text;
              }
              if ('blob' in c) {
                return `[Binary data: ${c.mimeType}]`;
              }
              return '';
            })
            .join('\n\n');
        } catch (error) {
          return `Error reading resource: ${error}`;
        }
      },
      {
        name: 'read_resource',
        description: 'Read the contents of an MCP resource (e.g. file, prompt, or data).',
        schema: z.object({
          uri: z.string().describe('The URI of the resource to read'),
        }),
      }
    ) as unknown as DynamicStructuredTool;

    return [...mcpTools.map(mcpTool =>
      tool(
        async (args: Record<string, unknown>) => {
          if (mcpTool.name === 'update_components') {
            const comps = (args as any).components;
            console.log(`[AgentRuntime] Calling update_components for surface ${(args as any).surfaceId} with ${comps?.length} components`);
          }
          if (mcpTool.name === 'update_data_model') {
            console.log(`[AgentRuntime] Calling update_data_model for surface ${(args as any).surfaceId}:`, JSON.stringify(args, null, 2));
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
