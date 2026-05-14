import { tool, type DynamicStructuredTool } from '@langchain/core/tools';
import { jsonSchemaToZod, type FreesailSessionClient, type ToolDefinition } from '@freesail/agent-runtime';
import { logger } from '@freesail/logger';

export class LangChainAdapter {
  /**
   * Bind tool definitions to a specific session.
   * All tool invocations are routed through the session's dedicated MCP client,
   * so list_sessions / create_surface etc. operate on the correct claimed session.
   */
  static bindTools(toolDefs: ToolDefinition[], session: FreesailSessionClient): DynamicStructuredTool[] {
    return toolDefs.map(toolDef =>
      tool(
        async (args: Record<string, unknown>) => {
          const surfaceId = (args as any).surfaceId as string | undefined;

          if (toolDef.name === 'update_components') {
            const comps = (args as any).components;
            logger.debug(`[AgentRuntime] Calling update_components for surface ${surfaceId} with ${comps?.length} components`);
          }
          if (toolDef.name === 'update_data_model') {
            logger.debug(`[AgentRuntime] Calling update_data_model for surface ${surfaceId}: ${JSON.stringify(args, null, 2)}`);
          }

          return session.callTool(toolDef.name, args);
        },
        {
          name: toolDef.name,
          description: toolDef.description || `Freesail tool: ${toolDef.name}`,
          schema: jsonSchemaToZod(toolDef.inputSchema as Record<string, unknown>),
        }
      ) as unknown as DynamicStructuredTool
    );
  }
}
