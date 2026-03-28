export interface ActionContext {
  [key: string]: unknown;
}

export interface ClientDataModel {
  surfaceId: string;
  dataModel: Record<string, unknown>;
}

export interface ActionEvent {
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  context: ActionContext;
  clientDataModel?: Record<string, unknown>;
}

export interface ClientErrorEvent {
  code: string;
  message: string;
  surfaceId: string;
  path?: string;
}

export interface FreesailAgent {
  /**
   * Called when a new session is established.
   * Useful for sending welcome messages or initializing state.
   * The agent can store sessionId as `this.sessionId` for later use.
   */
  onSessionConnected?(sessionId: string): Promise<void>;

  /**
   * Called when a session is closed.
   * Useful for cleanup operations, clearing memory, saving final state, etc.
   */
  onSessionDisconnected?(sessionId: string): Promise<void>;

  /**
   * Called when the user sends a direct chat message.
   * The agent already knows its session from the factory; sessionId is not repeated here.
   */
  onChat?(message: string): Promise<void>;

  /**
   * Called when a generic UI action (button click, form submit, etc.) occurs.
   * The agent already knows its session from the factory; sessionId is not repeated here.
   */
  onAction?(action: ActionEvent): Promise<void>;

  /**
   * Called when the frontend reports a client-side error (validation failure, runtime error, etc.).
   * The agent already knows its session from the factory; sessionId is not repeated here.
   */
  onClientError?(error: ClientErrorEvent): Promise<void>;
}

/**
 * A factory function provided to the runtime to instantiate a new agent per session.
 */
export type AgentFactory = (sessionId: string) => FreesailAgent;
