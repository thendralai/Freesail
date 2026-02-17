import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { jsonSchemaToZod } from './schema.js';

export class LangChainAdapter {
  /**
   * Build LangChain tools from MCP tools.
   * Each MCP tool is wrapped as a DynamicStructuredTool that proxies
   * calls through the MCP client.
   */
  static async getTools(mcpClient: Client): Promise<any> {
    const { tools: mcpTools } = await mcpClient.listTools();
    
    return mcpTools.map(mcpTool =>
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
      ) as unknown as DynamicStructuredTool
    );
  }
}
