import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { FreesailAgent, ActionEvent } from '@freesail/agent-runtime';
import { SharedCache } from '@freesail/agent-runtime';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { NativeLogger } from '@freesail/logger';

const logger = new NativeLogger('langchain-agent');

/**
 * Workaround for a transient Gemini streaming bug: Gemini 2.5 sometimes embeds
 * function calls inside the raw `content` array instead of `tool_calls`.
 * TODO: Remove once Gemini fixes this in their API.
 */
function extractGeminiToolCalls(finalChunk: any): any {
  if (!finalChunk) return finalChunk;
  if ((!finalChunk.tool_calls || finalChunk.tool_calls.length === 0) && Array.isArray(finalChunk.content)) {
    const extracted = finalChunk.content
      .filter((p: any) => p.functionCall)
      .map((p: any) => ({
        name: p.functionCall.name,
        args: p.functionCall.args,
        id: `call_${Math.random().toString(36).substring(2, 9)}`,
      }));
    if (extracted.length > 0) {
      finalChunk.tool_calls = extracted;
      const textParts = finalChunk.content.filter((p: any) => p.type === 'text');
      finalChunk.content = textParts.length > 0 ? textParts : '';
    }
  }
  return finalChunk;
}

interface FreesailLangchainAgentConfig {
  /** The connected MCP Client instance */
  mcpClient: Client;
  /** The Langchain Chat Model (e.g. ChatOpenAI, ChatAnthropic, ChatGoogleGenerativeAI) */
  model: BaseChatModel;
  /** Shared cache for system prompt and tools — mutex-safe across concurrent sessions */
  sharedCache: SharedCache<DynamicStructuredTool[]>;
}

/**
 * A per-session agent instance implementing FreesailAgent.
 *
 * The AgentFactory creates one of these per connected session. All
 * per-session state (chat messages, conversation history) lives here as
 * instance fields — there is no shared mutable state between sessions.
 */
export class FreesailLangchainSessionAgent implements FreesailAgent {
  private sessionId: string;
  private mcpClient: Client;
  private model: BaseChatModel;
  private sharedCache: SharedCache<DynamicStructuredTool[]>;

  // Per-session state
  private conversationHistory: (HumanMessage | AIMessage | ToolMessage)[] = [];
  private chatMessages: Array<{ role: string; content: string; timestamp: string }> = [];

  constructor(sessionId: string, config: FreesailLangchainAgentConfig) {
    this.sessionId = sessionId;
    this.mcpClient = config.mcpClient;
    this.model = config.model;
    this.sharedCache = config.sharedCache;
  }

  // ============================================================================
  // FreesailAgent lifecycle hooks
  // ============================================================================

  async onSessionConnected(sessionId: string): Promise<void> {
    // Invalidate the cache so this session fetches the latest catalog list.
    // A new session may have registered catalogs that weren't present before;
    // the MCP notification fires the invalidation too, but this closes the
    // race window where the poll could fire before the notification arrives.
    this.sharedCache.invalidate();
    logger.info(`[${sessionId}] Session connected — agent ready`);
  }

  async onSessionDisconnected(sessionId: string): Promise<void> {
    // State is held on this instance, so garbage collection handles cleanup.
    // Explicit clear for large allocations (conversation history, chat log).
    this.conversationHistory = [];
    this.chatMessages = [];
    logger.info(`[${sessionId}] Session disconnected — agent state cleared`);
  }

  async onAction(action: ActionEvent): Promise<void> {
    // Route chat_send on __chat surface → conversational reply
    if (action.name === 'chat_send' && action.surfaceId === '__chat') {
      const chatText = (action.context as { text?: string })?.text;
      if (chatText) {
        await this.handleChat(chatText, true);
      }
      return;
    }

    // All other UI actions are formatted into a natural-language message
    const contextStr =
      action.context && Object.keys(action.context).length > 0
        ? `\nAction data: ${JSON.stringify(action.context, null, 2)}`
        : '';
    const dataModelStr =
      action.clientDataModel && Object.keys(action.clientDataModel).length > 0
        ? `\nClient data model: ${JSON.stringify(action.clientDataModel, null, 2)}`
        : '';

    const message =
      `[UI Action] The user clicked "${action.name}" on component ` +
      `"${action.sourceComponentId}" in surface "${action.surfaceId}".${contextStr}${dataModelStr}`;

    logger.info(`[${this.sessionId}] Action: ${action.name}`);
    await this.handleChat(message, false);
  }

  // ============================================================================
  // Chat data model helpers
  // ============================================================================

  private updateChatModel(path: string, value: unknown): Promise<unknown> {
    return this.mcpClient.callTool({
      name: 'update_data_model',
      arguments: { surfaceId: '__chat', sessionId: this.sessionId, path, value },
    });
  }

  // ============================================================================
  // Internal chat handler
  // ============================================================================

  private async handleChat(message: string, isUserChat: boolean): Promise<void> {
    try {
      if (isUserChat) {
        this.chatMessages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      }

      // Full update: show user message + activate AgentStream
      await Promise.all([
        this.updateChatModel('/messages', [...this.chatMessages]),
        this.updateChatModel('/isTyping', true),
        this.updateChatModel('/stream', { token: '', active: true }),
      ]);

      const sessionPrompt =
        `[Session Context] The following message is from session "${this.sessionId}". ` +
        `When calling ANY tool (create_surface, update_components, update_data_model, delete_surface), ` +
        `you MUST use sessionId: "${this.sessionId}". Do NOT reuse a sessionId from a previous message.\n` +
        `IMPORTANT: Do NOT create or modify the "__chat" surface — it is managed by the framework. ` +
        `Just reply normally in chat for standard conversation. ` +
        `Only create new surfaces when you think the user needs visual UI.\n\n` +
        `User: ${message}`;

      const response = await this.chat(sessionPrompt, {
        onToken: (token: string) => {
          this.updateChatModel('/stream/token', token)
            .catch(err => logger.error('Streaming update error', err));
        },
      });

      // Stream complete — commit final assistant message, deactivate AgentStream
      if (response && response.trim() !== '') {
        this.chatMessages.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });
      }

      logger.info(`[${this.sessionId}] Assistant: ${response?.slice(0, 120)}...`);

      await Promise.all([
        this.updateChatModel('/messages', [...this.chatMessages]),
        this.updateChatModel('/isTyping', false),
        this.updateChatModel('/stream', { token: '', active: false }),
      ]);
    } catch (error) {
      logger.error(`[${this.sessionId}] Chat error:`, error);
      this.chatMessages.push({ role: 'assistant', content: 'An error occurred.', timestamp: new Date().toISOString() });
      await Promise.all([
        this.updateChatModel('/messages', [...this.chatMessages]),
        this.updateChatModel('/isTyping', false),
        this.updateChatModel('/stream', { token: '', active: false }),
      ]);
    }
  }

  // ============================================================================
  // LLM execution loop (Langchain agentic pattern)
  // ============================================================================

  private getSystemPrompt(): Promise<string> {
    return this.sharedCache.getSystemPrompt();
  }

  private getTools(): Promise<DynamicStructuredTool[]> {
    return this.sharedCache.getTools();
  }

  /** Invalidates the shared prompt/tool cache (e.g. when catalogs change upstream). */
  invalidateCache(): void {
    this.sharedCache.invalidate();
  }

  private async streamModelResponse(
    modelWithTools: any,
    messages: any[],
    onToken?: (token: string) => void,
  ): Promise<any> {
    const stream = await modelWithTools.stream(messages);
    let finalChunk: any | null = null;
    let accumulatedContent = '';

    for await (const chunk of stream) {
      if (typeof chunk.content === 'string' && chunk.content) {
        onToken?.(chunk.content);
        accumulatedContent += chunk.content;
      } else if (Array.isArray(chunk.content)) {
        for (const part of chunk.content) {
          if (part.type === 'text' && part.text) {
            onToken?.(part.text);
            accumulatedContent += part.text;
          }
        }
      }
      finalChunk = finalChunk ? finalChunk.concat(chunk) : chunk;
    }

    return extractGeminiToolCalls(finalChunk);
  }

  private async chat(
    userMessage: string,
    callbacks?: { onToken?: (token: string) => void },
  ): Promise<string> {
    const systemPrompt = await this.getSystemPrompt();
    const currentTools = await this.getTools();
    const modelWithTools = (this.model as any).bindTools(currentTools);

    this.conversationHistory.push(new HumanMessage(userMessage));

    const messages = [new SystemMessage(systemPrompt), ...this.conversationHistory];
    let responseChunk = await this.streamModelResponse(modelWithTools, messages, callbacks?.onToken);
    const turnToolMessages: (AIMessage | ToolMessage)[] = [];

    while (responseChunk?.tool_calls?.length > 0) {
      turnToolMessages.push(new AIMessage({
        content: typeof responseChunk.content === 'string' ? responseChunk.content : '',
        tool_calls: responseChunk.tool_calls,
      }));

      const toolMessages: ToolMessage[] = [];
      for (const toolCall of responseChunk.tool_calls) {
        const matchedTool = currentTools.find(t => t.name === toolCall.name);
        let result: string;
        try {
          result = matchedTool
            ? String(await matchedTool.invoke(toolCall.args))
            : `Unknown tool: ${toolCall.name}`;
        } catch (error) {
          result = `Error: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(`Tool error (${toolCall.name}):`, error);
        }
        toolMessages.push(new ToolMessage({
          content: result,
          name: toolCall.name,
          tool_call_id: toolCall.id ?? toolCall.name,
        }));
      }

      turnToolMessages.push(...toolMessages);
      responseChunk = await this.streamModelResponse(
        modelWithTools,
        [new SystemMessage(systemPrompt), ...this.conversationHistory, ...turnToolMessages],
        callbacks?.onToken,
      );
    }

    this.conversationHistory.push(...turnToolMessages);

    const assistantMessage =
      typeof responseChunk?.content === 'string'
        ? responseChunk.content
        : Array.isArray(responseChunk?.content)
          ? responseChunk.content.map((p: any) => p.text ?? '').join('')
          : JSON.stringify(responseChunk?.content ?? '');

    if (assistantMessage?.trim()) {
      this.conversationHistory.push(new AIMessage(assistantMessage));
    }

    return assistantMessage;
  }
}
