import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { fetchFreesailSystemPrompt } from './utils.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

/**
 * Minimal interface for listing and invoking Freesail tools.
 * Implemented by both FreesailSessionClient (per-session) and
 * FreesailAgentRuntime (coordinator-level, for shared cache bootstrap).
 */
export interface FreesailToolProvider {
  getToolDefinitions(): Promise<ToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  getSystemPrompt(): Promise<string>;
}

/**
 * Typed interface for interacting with a claimed Freesail gateway session.
 * Passed to AgentFactory so framework-specific agents never touch raw MCP.
 */
export interface FreesailSessionClient extends FreesailToolProvider {
  readonly sessionId: string;

  // Surface management
  createSurface(params: { surfaceId: string; catalogId: string; sendDataModel?: boolean }): Promise<unknown>;
  updateComponents(surfaceId: string, components: unknown[]): Promise<void>;
  deleteSurface(surfaceId: string): Promise<void>;

  // Data model
  updateDataModel(surfaceId: string, path?: string, value?: unknown): Promise<void>;
  getDataModel(surfaceId: string): Promise<unknown>;

  // Introspection
  getComponentTree(surfaceId: string): Promise<unknown>;
  getPendingActions(): Promise<unknown[]>;
  listSessions(): Promise<unknown[]>;

  // Catalog helpers
  getCatalogs(): Promise<unknown[]>;
  getComponentDetails(catalogId: string, components: string[]): Promise<string>;
  getFunctionDetails(catalogId: string, functions: string[]): Promise<string>;
}

export class FreesailSessionClientImpl implements FreesailSessionClient {
  readonly sessionId: string;
  private client: Client;

  constructor(sessionId: string, client: Client) {
    this.sessionId = sessionId;
    this.client = client;
  }

  private extractText(result: Awaited<ReturnType<Client['callTool']>>): string {
    const content = result.content as Array<{ type: string; text?: string }>;
    return content
      .map(c => c.type === 'text' ? c.text ?? '' : JSON.stringify(c))
      .join('\n');
  }

  private extractResult(result: Awaited<ReturnType<Client['callTool']>>): unknown {
    const text = this.extractText(result);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async createSurface(params: { surfaceId: string; catalogId: string; sendDataModel?: boolean }): Promise<unknown> {
    const result = await this.client.callTool({
      name: 'create_surface',
      arguments: { ...params, sessionId: this.sessionId },
    });
    return this.extractResult(result);
  }

  async updateComponents(surfaceId: string, components: unknown[]): Promise<void> {
    await this.client.callTool({
      name: 'update_components',
      arguments: { surfaceId, sessionId: this.sessionId, components },
    });
  }

  async deleteSurface(surfaceId: string): Promise<void> {
    await this.client.callTool({
      name: 'delete_surface',
      arguments: { surfaceId, sessionId: this.sessionId },
    });
  }

  async updateDataModel(surfaceId: string, path?: string, value?: unknown): Promise<void> {
    const args: Record<string, unknown> = { surfaceId, sessionId: this.sessionId };
    if (path !== undefined) args['path'] = path;
    if (value !== undefined) args['value'] = value;
    await this.client.callTool({ name: 'update_data_model', arguments: args });
  }

  async getDataModel(surfaceId: string): Promise<unknown> {
    const result = await this.client.callTool({
      name: 'get_data_model',
      arguments: { surfaceId, sessionId: this.sessionId },
    });
    return this.extractResult(result);
  }

  async getComponentTree(surfaceId: string): Promise<unknown> {
    const result = await this.client.callTool({
      name: 'get_component_tree',
      arguments: { surfaceId, sessionId: this.sessionId },
    });
    return this.extractResult(result);
  }

  async getPendingActions(): Promise<unknown[]> {
    const result = await this.client.callTool({
      name: 'get_pending_actions',
      arguments: { sessionId: this.sessionId },
    });
    const parsed = this.extractResult(result);
    return Array.isArray(parsed) ? parsed : [];
  }

  async listSessions(): Promise<unknown[]> {
    const result = await this.client.callTool({ name: 'list_sessions', arguments: {} });
    const parsed = this.extractResult(result);
    return Array.isArray(parsed) ? parsed : [];
  }

  async getCatalogs(): Promise<unknown[]> {
    const result = await this.client.callTool({
      name: 'get_catalogs',
      arguments: { sessionId: this.sessionId },
    });
    const parsed = this.extractResult(result);
    return Array.isArray(parsed) ? parsed : [];
  }

  async getComponentDetails(catalogId: string, components: string[]): Promise<string> {
    const result = await this.client.callTool({
      name: 'get_component_details',
      arguments: { sessionId: this.sessionId, catalogId, components },
    });
    return this.extractText(result);
  }

  async getFunctionDetails(catalogId: string, functions: string[]): Promise<string> {
    const result = await this.client.callTool({
      name: 'get_function_details',
      arguments: { sessionId: this.sessionId, catalogId, functions },
    });
    return this.extractText(result);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.client.callTool({ name, arguments: args });
    return this.extractText(result);
  }

  async getToolDefinitions(): Promise<ToolDefinition[]> {
    const { tools } = await this.client.listTools();
    return tools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema,
    }));
  }

  async getSystemPrompt(): Promise<string> {
    return fetchFreesailSystemPrompt(this.client);
  }
}
