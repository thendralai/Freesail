import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {LangChainAdapter} from './langchain-adapter.js';
import { fetchFreesailSystemPrompt, extractGeminiToolCalls } from '@freesail/agentruntime';
import type { DynamicStructuredTool } from '@langchain/core/tools';

interface FreesailLangchainAgentConfig {
  /** The connected MCP Client instance */
  mcpClient: Client;
  /** The Langchain Chat Model (e.g. ChatOpenAI, ChatAnthropic, ChatGoogleGenerativeAI) */
  model: BaseChatModel;
  /** Optional custom system prompt. If omitted, fetches `a2ui_system` from the MCP gateway. */
  systemPrompt?: string;
}

/**
 * A batteries-included wrapper that orchestrates an entire Freesail 
 * conversational agent using Langchain and MCP.
 * 
 * It automatically manages tool discovery, iterative tool execution loops, 
 * session histories, and Gemini streaming quirks.
 */
export class FreesailLangchainAgent {
  private mcpClient: Client;
  private model: BaseChatModel;
  
  // Per-session conversation history
  private sessionHistories = new Map<string, (HumanMessage | AIMessage | ToolMessage)[]>();
  
  // Cached MCP data
  private cachedSystemPrompt: string | null = null;
  private cachedTools: DynamicStructuredTool[] | null = null;

  constructor(config: FreesailLangchainAgentConfig) {
    this.mcpClient = config.mcpClient;
    this.model = config.model;
    if (config.systemPrompt) {
      this.cachedSystemPrompt = config.systemPrompt;
    }
  }

  /**
   * Clears the internal prompt and tool caches so they will be re-fetched 
   * on the next turn. Useful when upstream catalogs change.
   */
  public invalidateCache(): void {
    this.cachedSystemPrompt = null;
    this.cachedTools = null;
  }

  /**
   * Returns the array of messages for a given session.
   */
  public getHistory(sessionId: string): (HumanMessage | AIMessage | ToolMessage)[] {
    if (!this.sessionHistories.has(sessionId)) {
      this.sessionHistories.set(sessionId, []);
    }
    return this.sessionHistories.get(sessionId)!;
  }

  /**
   * Clears the conversation history for a given session.
   */
  public clearHistory(sessionId: string): void {
    this.sessionHistories.delete(sessionId);
  }

  private async getSystemPrompt(): Promise<string> {
    if (this.cachedSystemPrompt) return this.cachedSystemPrompt;
    this.cachedSystemPrompt = await fetchFreesailSystemPrompt(this.mcpClient);
    return this.cachedSystemPrompt??"";
  }

  private async getTools(): Promise<DynamicStructuredTool[]> {
    if (this.cachedTools) return this.cachedTools;
    const tools = await LangChainAdapter.getTools(this.mcpClient);
    this.cachedTools = tools;
    console.log(`[FreesailLangchainAgent] Loaded ${tools.length} tools from MCP`);
    return tools;
  }

  /**
   * Helper to stream from the model, call onToken callbacks, and aggregate the chunks.
   */
  private async streamModelResponse(
    modelWithTools: any, 
    messages: any[], 
    onToken?: (token: string) => void
  ): Promise<any> {
    const stream = await modelWithTools.stream(messages);
    let finalChunk: any | null = null;
    let accumulatedContent = '';

    for await (const chunk of stream) {
      if (typeof chunk.content === 'string' && chunk.content) {
        if (onToken) onToken(chunk.content);
        accumulatedContent += chunk.content;
      } else if (Array.isArray(chunk.content)) {
        for (const part of chunk.content) {
          if (part.type === 'text' && part.text) {
             onToken?.(part.text);
             accumulatedContent += part.text;
          }
        }
      }

      if (!finalChunk) {
        finalChunk = chunk;
      } else {
        finalChunk = finalChunk.concat(chunk);
      }
    }
    
    // Pass strictly through the utility parser to catch Gemini bugs
    return extractGeminiToolCalls(finalChunk);
  }

  /**
   * Process a single turn of conversation for a specific session.
   * Runs the Langchain execution loop autonomously until all tools resolve.
   * 
   * @param userMessage The new text from the user
   * @param sessionId The unique ID of the session
   * @param callbacks Optional callbacks for real-time streaming tokens
   * @returns The final generated text string from the assistant
   */
  public async chat(
    userMessage: string,
    sessionId: string = 'default',
    callbacks?: { onToken?: (token: string) => void }
  ): Promise<string> {
    const systemPrompt = await this.getSystemPrompt();
    const currentTools = await this.getTools();
    const modelWithTools = (this.model as any).bindTools(currentTools);

    const conversationHistory = this.getHistory(sessionId);
    conversationHistory.push(new HumanMessage(userMessage));

    const messages = [
      new SystemMessage(systemPrompt),
      ...conversationHistory,
    ];

    let responseChunk = await this.streamModelResponse(modelWithTools, messages, callbacks?.onToken);

    // Track tool messages for this complex turn
    const turnToolMessages: (AIMessage | ToolMessage)[] = [];

    // Iteratively execute tools until the LLM yields a final conclusion
    while (responseChunk && responseChunk.tool_calls && responseChunk.tool_calls.length > 0) {
      // Add the AI's call intent to the history
      turnToolMessages.push(new AIMessage({
        content: typeof responseChunk.content === 'string' ? responseChunk.content : '',
        tool_calls: responseChunk.tool_calls,
      }));

      const toolMessages: ToolMessage[] = [];
      for (const toolCall of responseChunk.tool_calls) {
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
          console.error(`[FreesailLangchainAgent] Tool error (${toolCall.name}):`, error);
        }

        toolMessages.push(new ToolMessage({
          content: result,
          name: toolCall.name,
          tool_call_id: toolCall.id ?? toolCall.name,
        }));
      }

      turnToolMessages.push(...toolMessages);

      // Stream again with the results fed back to the LLM
      responseChunk = await this.streamModelResponse(
        modelWithTools,
        [
          new SystemMessage(systemPrompt),
          ...conversationHistory,
          ...turnToolMessages,
        ],
        callbacks?.onToken
      );
    }

    // Persist all intermediate tool sequences
    conversationHistory.push(...turnToolMessages);

    // Parse the final text output
    const assistantMessage = typeof responseChunk?.content === 'string'
      ? responseChunk.content
      : Array.isArray(responseChunk?.content)
        ? responseChunk.content.map((p: any) => p.text ?? '').join('')
        : JSON.stringify(responseChunk?.content ?? '');

    if (assistantMessage && assistantMessage.trim() !== '') {
      conversationHistory.push(new AIMessage(assistantMessage));
    } else {
      console.log('[FreesailLangchainAgent] Final response chunk was empty (silent execution).');
    }

    return assistantMessage;
  }
}
