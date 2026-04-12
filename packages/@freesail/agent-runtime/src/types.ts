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

/**
 * A notification dispatched to the agent from the session queue.
 * Discriminated by `type` — use a switch or type guard to handle each case.
 * New notification types may be added in future versions.
 */
export type SessionNotification =
  | { type: 'action'; event: ActionEvent }
  | { type: 'error'; event: ClientErrorEvent };

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
   * Called for every action or error notification from the session queue.
   * If not implemented, the runtime will NOT drain the queue — messages stay
   * in the gateway queue and the gateway gate will block write tools until
   * the agent explicitly calls get_pending_actions.
   */
  onSessionNotification?(notification: SessionNotification): Promise<void>;
}

/**
 * A factory function provided to the runtime to instantiate a new agent per session.
 */
export type AgentFactory = (sessionId: string) => FreesailAgent;
