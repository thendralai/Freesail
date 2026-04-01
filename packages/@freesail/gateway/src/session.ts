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
import { writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@freesail/logger';

const logger = createLogger(['freesail', 'session']);
// Sub-loggers for surface events — filterable independently via --log-filter
const agentSurfaceLogger  = createLogger(['freesail', 'session', 'agent-surface']);
const clientSurfaceLogger = createLogger(['freesail', 'session', 'client-surface']);
import { generateCatalogPrompt, generateCatalogIndex, prewarmCatalogDetailCache, type Catalog } from './converter.js';

/** Extract the surfaceId embedded in any DownstreamMessage variant. */
function getSurfaceId(message: DownstreamMessage): string | null {
  const m = message as any;
  return m.createSurface?.surfaceId
    ?? m.updateComponents?.surfaceId
    ?? m.updateDataModel?.surfaceId
    ?? m.deleteSurface?.surfaceId
    ?? m.getDataModel?.surfaceId
    ?? null;
}

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
  /** Directory to write catalog prompt logs to (overrides CATALOG_LOG_DIR env var) */
  catalogLogDir?: string;
}

const DEFAULT_OPTIONS: Required<Omit<SessionManagerOptions, 'catalogLogDir'>> = {
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
  /** Disconnect notifications for browser sessions that have gone offline, keyed by the claiming agent ID.
   *  Held until the agent collects them via drainDisconnectNotifications. */
  private disconnectNotifications: Map<string, Array<{ sessionId: string, actions: UpstreamMessage[] }>> = new Map();
  private pendingDataModelRequests: Map<string, { resolve: (data: Record<string, unknown>) => void; timer: ReturnType<typeof setTimeout> }> = new Map();
  private options: Required<Omit<SessionManagerOptions, 'catalogLogDir'>>;
  private catalogLogDir: string | undefined;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SessionManagerOptions = {}) {
    const { catalogLogDir, ...rest } = options;
    this.options = { ...DEFAULT_OPTIONS, ...rest };
    this.catalogLogDir = catalogLogDir;
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
      logger.info(`[SessionManager] Registered catalog: ${catalog.title} (${catalog.id}) for session ${sessionId}`);
      prewarmCatalogDetailCache(catalog);

      const logDir = this.catalogLogDir ?? process.env['CATALOG_LOG_DIR'];
      if (logDir) {
        try {
          if (!existsSync(logDir) || !statSync(logDir).isDirectory()) {
            logger.warn(`[SessionManager] CATALOG_LOG_DIR '${logDir}' is not a valid directory — skipping catalog prompt write`);
          } else {
            const slug = catalog.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            const filePath = join(logDir, `${slug}.md`);
            const logContent = generateCatalogIndex(catalog) + '\n---\n\n' + generateCatalogPrompt(catalog);
            writeFileSync(filePath, logContent, 'utf8');
            logger.info(`[SessionManager] Wrote catalog prompt to ${filePath}`);
          }
        } catch (err) {
          logger.error(`[SessionManager] Failed to write catalog prompt for '${catalog.title}':`, err);
        }
      }
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
   * Returns an empty array if no catalog constraints have been declared.
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

    // If no constraints declared, return nothing (don't leak other clients' catalogs)
    if (allowedIds.size === 0) return [];

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
    // Ensure the catalog is actually registered in the gateway
    if (!this.catalogStore.has(catalogId)) {
      return `Catalog '${catalogId}' is not registered in the gateway`;
    }

    const session = this.sessions.get(sessionId);
    if (!session) return `Session ${sessionId} not found`;

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
   * Validate that a surface exists for a session before sending data/components.
   * System surfaces (prefixed with __) are always allowed.
   * Agent-created surfaces must have been registered via create_surface.
   * Returns an error string if invalid, null if OK.
   */
  validateSurfaceForSession(sessionId: string, surfaceId: string): string | null {
    // System surfaces (__chat, __system, etc.) are always valid
    if (surfaceId.startsWith('__')) return null;

    const session = this.sessions.get(sessionId);
    if (!session) return `Session ${sessionId} not found`;

    if (!session.surfaces.has(surfaceId as SurfaceId)) {
      const existing = Array.from(session.surfaces);
      const hint = existing.length > 0
        ? ` Active surfaces: [${existing.join(', ')}]. Call create_surface first.`
        : ' No surfaces have been created for this session yet. Call create_surface first.';
      return `Surface '${surfaceId}' does not exist for session ${sessionId}.${hint}`;
    }

    return null;
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
   * Store a disconnect notification for a browser session that has gone offline.
   * Held under the claiming agent's ID until the agent drains them.
   */
  enqueueDisconnectNotification(agentId: string, sessionId: string, message: UpstreamMessage): void {
    let queues = this.disconnectNotifications.get(agentId);
    if (!queues) {
      queues = [];
      this.disconnectNotifications.set(agentId, queues);
    }

    // Check if we already have an entry for this session
    let sessionQueue = queues.find((q: { sessionId: string; actions: UpstreamMessage[] }) => q.sessionId === sessionId);
    if (!sessionQueue) {
      sessionQueue = { sessionId, actions: [] };
      queues.push(sessionQueue);
    }
    sessionQueue.actions.push(message);
  }

  /**
   * Drain all pending disconnect notifications for an agent and return them.
   */
  drainDisconnectNotifications(agentId: string): Array<{ sessionId: string; actions: UpstreamMessage[] }> {
    const queues = this.disconnectNotifications.get(agentId);
    if (!queues || queues.length === 0) return [];
    this.disconnectNotifications.delete(agentId);
    return queues;
  }

  /**
   * Discard all pending disconnect notifications for an agent.
   * Called when the agent itself disconnects and can no longer collect them.
   */
  clearDisconnectNotifications(agentId: string): void {
    this.disconnectNotifications.delete(agentId);
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
      logger.warn(`[SessionManager] No surface-to-session mapping found for surface: ${surfaceId}`);
      return undefined;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[SessionManager] Session ${sessionId} not found for surface: ${surfaceId}`);
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

      // Remove catalogs that were registered by this session and are no longer
      // referenced by any remaining session.
      const remainingCatalogIds = new Set<string>();
      for (const [sid, s] of this.sessions) {
        if (sid !== id) {
          for (const cid of s.catalogIds) remainingCatalogIds.add(cid);
        }
      }
      for (const catalogId of session.catalogIds) {
        if (!remainingCatalogIds.has(catalogId)) {
          this.catalogStore.delete(catalogId);
        }
      }

      // Cancel any pending data model requests for this session
      for (const key of this.pendingDataModelRequests.keys()) {
        if (key.startsWith(`${id}:`)) {
          const pending = this.pendingDataModelRequests.get(key)!;
          clearTimeout(pending.timer);
          this.pendingDataModelRequests.delete(key);
        }
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
      logger.warn(`[SessionManager] No session found for surface: ${surfaceId}`);
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
      logger.warn(`[SessionManager] Session not found: ${sessionId}`);
      return false;
    }

    try {
      const surfaceId = getSurfaceId(message);
      const isClientSurface = surfaceId?.startsWith('__') ?? false;
      const surfaceLogger = isClientSurface ? clientSurfaceLogger : agentSurfaceLogger;

      if ('updateComponents' in message) {
        surfaceLogger.info(`[SessionManager] Sending updateComponents to session ${sessionId}:`,
          JSON.stringify((message as any).updateComponents, null, 2));
      } else if ('updateDataModel' in message) {
        surfaceLogger.info(`[SessionManager] Sending updateDataModel to session ${sessionId}:`,
          JSON.stringify((message as any).updateDataModel, null, 2));
      } else if ('createSurface' in message) {
        surfaceLogger.info(`[SessionManager] Sending createSurface to session ${sessionId}:`,
          JSON.stringify((message as any).createSurface, null, 2));
      }
      const data = `data: ${JSON.stringify(message)}\n\n`;
      session.response.write(data);
      session.lastActivity = Date.now();
      return true;
    } catch (error) {
      logger.error(`[SessionManager] Error sending to session ${sessionId}:`, error);
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
        error: `Session ${sessionId} is already claimed by another agent`,
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
          logger.error(`[SessionManager] Error in ${event} listener:`, error);
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
    this.surfaceToSession.clear();
    this.surfaceToCatalog.clear();
    this.actionQueue.clear();
    this.disconnectNotifications.clear();
    this.agentBindings.clear();
    this.sessionToAgent.clear();
    for (const pending of this.pendingDataModelRequests.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingDataModelRequests.clear();
    this.catalogListeners.length = 0;
    this.actionListeners.length = 0;
    this.sessionEventListeners.clear();
  }

  // ==========================================================================
  // Data Model Request/Response
  // ==========================================================================

  /**
   * Request the current data model from the client for a surface.
   * Sends a getDataModel downstream message and returns a Promise that
   * resolves when the client responds with __get_data_model_response.
   */
  requestDataModel(sessionId: string, surfaceId: SurfaceId, timeoutMs = 10_000): Promise<Record<string, unknown>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error(`Session ${sessionId} not found`));
    }

    const message: DownstreamMessage = {
      version: A2UI_VERSION,
      getDataModel: { surfaceId },
    } as DownstreamMessage;

    const sent = this.sendToSession(sessionId, message);
    if (!sent) {
      return Promise.reject(new Error(`Failed to send getDataModel request to session ${sessionId}: client connection may be lost`));
    }

    const key = `${sessionId}:${surfaceId}`;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingDataModelRequests.delete(key);
        reject(new Error(`Timed out waiting for data model response from client (surface: ${surfaceId})`));
      }, timeoutMs);

      this.pendingDataModelRequests.set(key, { resolve, timer });
    });
  }

  /**
   * Resolve a pending data model request when the client responds.
   * Returns true if a pending request was found and resolved.
   */
  resolveDataModelRequest(sessionId: string, surfaceId: string, dataModel: Record<string, unknown>): boolean {
    const key = `${sessionId}:${surfaceId}`;
    const pending = this.pendingDataModelRequests.get(key);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pendingDataModelRequests.delete(key);
    pending.resolve(dataModel);
    return true;
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
      logger.info(`[SessionManager] Removing stale session: ${id}`);
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
