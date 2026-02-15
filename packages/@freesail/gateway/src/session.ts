/**
 * @fileoverview Session Manager
 *
 * Manages client sessions, session-scoped catalogs, agent bindings,
 * and their associated surfaces.
 */

import {
  A2UI_VERSION,
  type SurfaceId,
  type DownstreamMessage,
  type UpstreamMessage,
  type A2UIClientCapabilities,
} from '@freesail/core';
import type { Catalog } from './converter.js';

/**
 * Represents a connected client session.
 */
export interface ClientSession {
  /** Unique session identifier */
  id: string;
  /** SSE response object for sending messages */
  response: {
    write: (data: string) => void;
    end: () => void;
  };
  /** Surfaces owned by this session */
  surfaces: Set<SurfaceId>;
  /** Catalog IDs registered by this session */
  catalogIds: Set<string>;
  /** Client capabilities (supported catalogs, etc.) */
  capabilities: A2UIClientCapabilities | null;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
}

/**
 * Represents an agent binding to client sessions.
 */
export interface AgentBinding {
  /** Agent identifier */
  agentId: string;
  /** Client session IDs this agent has claimed */
  sessionIds: Set<string>;
  /** Timestamp of binding creation */
  createdAt: number;
}

/**
 * Session lifecycle event types.
 */
export interface SessionManagerEvents {
  sessionCreated: (session: ClientSession) => void;
  sessionRemoved: (sessionId: string) => void;
}

/**
 * Session manager configuration.
 */
export interface SessionManagerOptions {
  /** Session timeout in ms (default: 30 minutes) */
  sessionTimeout?: number;
  /** Cleanup interval in ms (default: 1 minute) */
  cleanupInterval?: number;
}

const DEFAULT_OPTIONS: Required<SessionManagerOptions> = {
  sessionTimeout: 30 * 60 * 1000,
  cleanupInterval: 60 * 1000,
};

/**
 * Manages client sessions for SSE connections.
 */
export class SessionManager {
  private sessions: Map<string, ClientSession> = new Map();
  private surfaceToSession: Map<SurfaceId, string> = new Map();
  private surfaceToCatalog: Map<SurfaceId, string> = new Map();
  private catalogStore: Map<string, Catalog> = new Map();
  private catalogListeners: Array<(catalogs: Catalog[]) => void> = [];
  private actionQueue: Map<string, UpstreamMessage[]> = new Map();
  private actionListeners: Array<(sessionId: string, message: UpstreamMessage) => void> = [];
  private agentBindings: Map<string, AgentBinding> = new Map();
  private sessionToAgent: Map<string, string> = new Map();
  private sessionEventListeners: Map<keyof SessionManagerEvents, Array<(...args: any[]) => void>> = new Map();
  private options: Required<SessionManagerOptions>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SessionManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.startCleanup();
  }

  /**
   * Create a new client session.
   */
  createSession(
    id: string,
    response: ClientSession['response'],
    capabilities?: A2UIClientCapabilities
  ): ClientSession {
    const session: ClientSession = {
      id,
      response,
      surfaces: new Set(),
      catalogIds: new Set(),
      capabilities: capabilities ?? null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.sessions.set(id, session);
    this.actionQueue.set(id, []);

    // Emit lifecycle event
    this.emitSessionEvent('sessionCreated', session);

    // Inject synthetic __session_connected action into the action queue
    const connectEvent: UpstreamMessage = {
      version: A2UI_VERSION,
      action: {
        name: '__session_connected',
        surfaceId: '__system' as SurfaceId,
        sourceComponentId: '__gateway',
        timestamp: new Date().toISOString(),
        context: { sessionId: id },
      },
    };
    this.enqueueAction(id, connectEvent);

    return session;
  }

  /**
   * Update session capabilities (from handshake).
   */
  setCapabilities(sessionId: string, capabilities: A2UIClientCapabilities): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.capabilities = capabilities;
    session.lastActivity = Date.now();
    return true;
  }

  /**
   * Get session capabilities.
   */
  getCapabilities(sessionId: string): A2UIClientCapabilities | null {
    return this.sessions.get(sessionId)?.capabilities ?? null;
  }

  /**
   * Check if a session supports a catalog.
   */
  supportsCatalog(sessionId: string, catalogId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.capabilities) return true; // Default to allowing if no capabilities set
    return session.capabilities.catalogs.includes(catalogId);
  }

  // ==========================================================================
  // Catalog Store
  // ==========================================================================

  /**
   * Register catalogs provided by a client.
   * Catalogs are stored globally AND associated with the registering session.
   */
  registerCatalogs(sessionId: string, catalogs: Catalog[]): void {
    const session = this.sessions.get(sessionId);

    for (const catalog of catalogs) {
      this.catalogStore.set(catalog.id, catalog);
      if (session) {
        session.catalogIds.add(catalog.id);
      }
      console.error(`[SessionManager] Registered catalog: ${catalog.title || catalog.name} (${catalog.id}) for session ${sessionId}`);
    }
    // Notify listeners
    for (const listener of this.catalogListeners) {
      listener(catalogs);
    }
  }

  /**
   * Get all registered catalogs.
   */
  getCatalogs(): Catalog[] {
    return Array.from(this.catalogStore.values());
  }

  /**
   * Get a catalog by ID.
   */
  getCatalog(catalogId: string): Catalog | undefined {
    return this.catalogStore.get(catalogId);
  }

  /**
   * Get catalogs available to a specific session.
   * Returns catalogs the session registered OR declared in capabilities.
   * Falls back to all catalogs if no constraints declared (backward compat).
   */
  getCatalogsForSession(sessionId: string): Catalog[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const allowedIds = new Set<string>(session.catalogIds);
    if (session.capabilities) {
      for (const id of session.capabilities.catalogs) {
        allowedIds.add(id);
      }
    }

    // If no constraints declared, allow all (backward compat)
    if (allowedIds.size === 0) return this.getCatalogs();

    return Array.from(allowedIds)
      .map(id => this.catalogStore.get(id))
      .filter((c): c is Catalog => c !== undefined);
  }

  /**
   * Get the catalog associated with a surface.
   */
  getCatalogForSurface(surfaceId: string): Catalog | undefined {
    // Explicit mapping first
    const catalogId = this.surfaceToCatalog.get(surfaceId as SurfaceId);
    if (catalogId) {
      return this.catalogStore.get(catalogId);
    }
    return undefined;
  }

  /**
   * Validate that a session supports a catalog.
   * Returns an error string if invalid, null if OK.
   */
  validateCatalogForSession(sessionId: string, catalogId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return `Session ${sessionId} not found`;

    // If no capabilities and no registered catalogs, allow anything (backward compat)
    if (!session.capabilities && session.catalogIds.size === 0) return null;

    // Check capabilities
    if (session.capabilities?.catalogs.includes(catalogId)) return null;

    // Check registered catalogs
    if (session.catalogIds.has(catalogId)) return null;

    const supported = [
      ...session.catalogIds,
      ...(session.capabilities?.catalogs ?? []),
    ];
    return `Session ${sessionId} does not support catalog ${catalogId}. Supported: [${supported.join(', ')}]`;
  }

  /**
   * Subscribe to catalog registration events.
   */
  onCatalogsRegistered(listener: (catalogs: Catalog[]) => void): () => void {
    this.catalogListeners.push(listener);
    return () => {
      const idx = this.catalogListeners.indexOf(listener);
      if (idx >= 0) this.catalogListeners.splice(idx, 1);
    };
  }

  // ==========================================================================
  // Action Queue
  // ==========================================================================

  /**
   * Enqueue an upstream action for a session.
   */
  enqueueAction(sessionId: string, message: UpstreamMessage): boolean {
    const queue = this.actionQueue.get(sessionId);
    if (!queue) return false;

    queue.push(message);

    // Notify listeners
    for (const listener of this.actionListeners) {
      listener(sessionId, message);
    }

    return true;
  }

  /**
   * Enqueue an action by resolving the session from the surfaceId in the message.
   * Returns the resolved sessionId, or null.
   */
  enqueueActionBySurface(message: UpstreamMessage): string | null {
    const surfaceId =
      'action' in message ? (message as Record<string, any>)['action']?.surfaceId :
        'error' in message ? (message as Record<string, any>)['error']?.surfaceId :
          null;

    if (!surfaceId) return null;

    const sessionId = this.surfaceToSession.get(surfaceId as SurfaceId);
    if (!sessionId) return null;

    this.enqueueAction(sessionId, message);
    return sessionId;
  }

  /**
   * Dequeue all pending actions for a session (drains the queue).
   */
  dequeueActions(sessionId: string): UpstreamMessage[] {
    const queue = this.actionQueue.get(sessionId);
    if (!queue || queue.length === 0) return [];
    const actions = [...queue];
    queue.length = 0;
    return actions;
  }

  /**
   * Get pending action count for a session.
   */
  getActionCount(sessionId: string): number {
    return this.actionQueue.get(sessionId)?.length ?? 0;
  }

  /**
   * Dequeue all pending actions across all sessions.
   * Returns only sessions that have pending actions.
   */
  dequeueAllActions(): Array<{ sessionId: string; actions: UpstreamMessage[] }> {
    const result: Array<{ sessionId: string; actions: UpstreamMessage[] }> = [];
    for (const [sessionId, queue] of this.actionQueue) {
      if (queue.length > 0) {
        result.push({ sessionId, actions: [...queue] });
        queue.length = 0;
      }
    }
    return result;
  }

  /**
   * Get summaries of all active sessions.
   */
  getSessionSummaries(): Array<{
    id: string;
    surfaces: string[];
    catalogIds: string[];
    agentId: string | null;
    actionCount: number;
    createdAt: number;
    lastActivity: number;
  }> {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      surfaces: Array.from(s.surfaces),
      catalogIds: Array.from(s.catalogIds),
      agentId: this.sessionToAgent.get(s.id) ?? null,
      actionCount: this.actionQueue.get(s.id)?.length ?? 0,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
    }));
  }

  /**
   * Subscribe to action events.
   * Listener receives the sessionId and the action message.
   */
  onAction(listener: (sessionId: string, message: UpstreamMessage) => void): () => void {
    this.actionListeners.push(listener);
    return () => {
      const idx = this.actionListeners.indexOf(listener);
      if (idx >= 0) this.actionListeners.splice(idx, 1);
    };
  }

  /**
   * Get a session by ID.
   */
  getSession(id: string): ClientSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get the session that owns a surface.
   */
  getSessionBySurface(surfaceId: SurfaceId): ClientSession | undefined {
    const sessionId = this.surfaceToSession.get(surfaceId);
    if (!sessionId) {
      console.warn(`[SessionManager] No surface-to-session mapping found for surface: ${surfaceId}`);
      return undefined;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[SessionManager] Session ${sessionId} not found for surface: ${surfaceId}`);
    }
    return session;
  }

  /**
   * Remove a session.
   */
  removeSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      // Clean up surface mappings
      for (const surfaceId of session.surfaces) {
        this.surfaceToSession.delete(surfaceId);
        this.surfaceToCatalog.delete(surfaceId);
      }

      // Clean up agent binding
      const agentId = this.sessionToAgent.get(id);
      if (agentId) {
        this.releaseSession(agentId, id);
      }

      session.response.end();
      this.sessions.delete(id);
      this.actionQueue.delete(id);

      // Emit lifecycle event
      this.emitSessionEvent('sessionRemoved', id);
    }
  }

  /**
   * Associate a surface with a session and catalog.
   */
  addSurface(sessionId: string, surfaceId: SurfaceId, catalogId?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.surfaces.add(surfaceId);
    this.surfaceToSession.set(surfaceId, sessionId);
    if (catalogId) {
      this.surfaceToCatalog.set(surfaceId, catalogId);
    }
    session.lastActivity = Date.now();

    return true;
  }

  /**
   * Remove a surface from its session.
   */
  removeSurface(surfaceId: SurfaceId): boolean {
    const sessionId = this.surfaceToSession.get(surfaceId);
    if (!sessionId) return false;

    const session = this.sessions.get(sessionId);
    if (session) {
      session.surfaces.delete(surfaceId);
      session.lastActivity = Date.now();
    }

    this.surfaceToSession.delete(surfaceId);
    this.surfaceToCatalog.delete(surfaceId);
    return true;
  }

  /**
   * Send a message to a specific surface's session.
   */
  sendToSurface(surfaceId: SurfaceId, message: DownstreamMessage): boolean {
    const session = this.getSessionBySurface(surfaceId);
    if (!session) {
      console.warn(`[SessionManager] No session found for surface: ${surfaceId}`);
      return false;
    }

    return this.sendToSession(session.id, message);
  }

  /**
   * Send a message to a specific session.
   */
  sendToSession(sessionId: string, message: DownstreamMessage): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[SessionManager] Session not found: ${sessionId}`);
      return false;
    }

    try {
      const data = `data: ${JSON.stringify(message)}\n\n`;
      session.response.write(data);
      session.lastActivity = Date.now();
      return true;
    } catch (error) {
      console.error(`[SessionManager] Error sending to session ${sessionId}:`, error);
      this.removeSession(sessionId);
      return false;
    }
  }


  /**
   * Get all active sessions.
   */
  getAllSessions(): ClientSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count.
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Update session activity timestamp.
   */
  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  // ==========================================================================
  // Agent Binding
  // ==========================================================================

  /**
   * Bind an agent to a client session (claim it).
   * A session can only be claimed by one agent at a time.
   */
  claimSession(agentId: string, sessionId: string): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: `Session ${sessionId} not found` };

    const existingAgent = this.sessionToAgent.get(sessionId);
    if (existingAgent && existingAgent !== agentId) {
      return {
        success: false,
        error: `Session ${sessionId} already claimed by agent ${existingAgent}`,
      };
    }

    let binding = this.agentBindings.get(agentId);
    if (!binding) {
      binding = { agentId, sessionIds: new Set(), createdAt: Date.now() };
      this.agentBindings.set(agentId, binding);
    }
    binding.sessionIds.add(sessionId);
    this.sessionToAgent.set(sessionId, agentId);

    return { success: true };
  }

  /**
   * Release an agent's claim on a session.
   */
  releaseSession(agentId: string, sessionId: string): boolean {
    const binding = this.agentBindings.get(agentId);
    if (!binding) return false;

    binding.sessionIds.delete(sessionId);
    if (this.sessionToAgent.get(sessionId) === agentId) {
      this.sessionToAgent.delete(sessionId);
    }

    if (binding.sessionIds.size === 0) {
      this.agentBindings.delete(agentId);
    }
    return true;
  }

  /**
   * Get the agent that owns a session.
   */
  getAgentForSession(sessionId: string): string | null {
    return this.sessionToAgent.get(sessionId) ?? null;
  }

  /**
   * Get all sessions claimed by an agent.
   */
  getSessionsForAgent(agentId: string): string[] {
    return Array.from(this.agentBindings.get(agentId)?.sessionIds ?? []);
  }

  /**
   * Get all agent bindings summary.
   */
  getAgentSummaries(): Array<{ agentId: string; sessionIds: string[]; createdAt: number }> {
    return Array.from(this.agentBindings.values()).map(b => ({
      agentId: b.agentId,
      sessionIds: Array.from(b.sessionIds),
      createdAt: b.createdAt,
    }));
  }

  // ==========================================================================
  // Session Lifecycle Events
  // ==========================================================================

  /**
   * Subscribe to session lifecycle events.
   */
  onSessionEvent<K extends keyof SessionManagerEvents>(
    event: K,
    listener: SessionManagerEvents[K]
  ): () => void {
    if (!this.sessionEventListeners.has(event)) {
      this.sessionEventListeners.set(event, []);
    }
    this.sessionEventListeners.get(event)!.push(listener as (...args: any[]) => void);
    return () => {
      const arr = this.sessionEventListeners.get(event);
      if (arr) {
        const idx = arr.indexOf(listener as (...args: any[]) => void);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  private emitSessionEvent<K extends keyof SessionManagerEvents>(
    event: K,
    ...args: Parameters<SessionManagerEvents[K]>
  ): void {
    const listeners = this.sessionEventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (error) {
          console.error(`[SessionManager] Error in ${event} listener:`, error);
        }
      }
    }
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const session of this.sessions.values()) {
      session.response.end();
    }

    this.sessions.clear();
    this.sessions.clear();
    this.surfaceToSession.clear();
    this.surfaceToCatalog.clear();
    this.actionQueue.clear();
    this.agentBindings.clear();
    this.sessionToAgent.clear();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleSessions();
    }, this.options.cleanupInterval);
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    const stale: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.options.sessionTimeout) {
        stale.push(id);
      }
    }

    for (const id of stale) {
      console.error(`[SessionManager] Removing stale session: ${id}`);
      this.removeSession(id);
    }
  }
}

/**
 * Create a new session manager.
 */
export function createSessionManager(
  options?: SessionManagerOptions
): SessionManager {
  return new SessionManager(options);
}
