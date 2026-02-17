import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { formatAction } from './formatter.js';

export interface AgentRuntimeConfig {
  mcpClient: Client;
  /**
   * Handler for chat messages from the user.
   */
  onChat: (message: string, sessionId: string) => Promise<string>;
  /**
   * Optional handler for component actions.
   * If not provided, actions are formatted as text and sent to `onChat`.
   */
  onAction?: (action: any, sessionId: string) => Promise<void>;
}

export class FreesailAgentRuntime {
  private mcpClient: Client;
  private processingChain = Promise.resolve();
  private onChat: (message: string, sessionId: string) => Promise<string>;
  private onAction?: (action: any, sessionId: string) => Promise<void>;

  constructor(config: AgentRuntimeConfig) {
    this.mcpClient = config.mcpClient;
    this.onChat = config.onChat;
    this.onAction = config.onAction;
  }

  /**
   * Start the runtime loop.
   * Sets up notification handlers for MCP resources.
   */
  start() {
    this.mcpClient.setNotificationHandler(
      ResourceListChangedNotificationSchema,
      async () => {
        await this.checkPendingActions();
      }
    );
    console.log('[AgentRuntime] Started action polling loop');
  }

  /**
   * Queue an async operation to run serially.
   */
  private queue(fn: () => Promise<void>): void {
    this.processingChain = this.processingChain.then(fn, () => fn().catch(() => { }));
  }

  private async checkPendingActions() {
    try {
      const result = await this.mcpClient.callTool({
        name: 'get_all_pending_actions',
        arguments: {},
      });

      const content = result.content as Array<{ type: string; text?: string }>;
      const text = content[0]?.type === 'text' ? content[0].text ?? '[]' : '[]';

      if (text === 'No pending actions.' || text === '[]') return;

      const allActions = JSON.parse(text) as Array<{
        sessionId: string;
        actions: Array<{
          action?: {
            name: string;
            surfaceId: string;
            sourceComponentId: string;
            context: Record<string, unknown>;
          };
          _clientDataModel?: {
            surfaceId: string;
            dataModel: Record<string, unknown>;
          };
        }>;
      }>;

      for (const entry of allActions) {
        for (const actionMsg of entry.actions) {
          const action = actionMsg.action;
          if (!action) continue;

          console.log(`[AgentRuntime] Action: ${action.name} (session=${entry.sessionId})`);

          this.queue(async () => {
             // Let the specific agent implementation handle specific actions if needed
             // For now, we mainly handle the generic polling structure
             
             // Synthetic events usually handled by specific agent logic (e.g. bootstrapping)
             // We can expose these as specific hooks if we want to standardize,
             // but for now let's pass everything to the handler.
             
             if (this.onAction) {
                await this.onAction(actionMsg, entry.sessionId);
                return;
             }

             // Default behavior: Format generic actions as chat
             // Special case: chat_send on __chat is direct chat
             if (action.name === 'chat_send' && action.surfaceId === '__chat') {
                const chatText = (action.context as { text?: string })?.text;
                if (chatText) {
                   await this.onChat(chatText, entry.sessionId);
                }
                return;
             }
             
             // Skip synthetic connection events in default handler to avoid noise
             if (action.name?.startsWith('__session_')) return;

             const clientDataModel = actionMsg._clientDataModel?.dataModel;
             const formatted = formatAction(entry.sessionId, action, clientDataModel);
             await this.onChat(formatted, entry.sessionId);
          });
        }
      }
    } catch (error) {
      console.error('[AgentRuntime] Error handling action notification:', error);
    }
  }
}
