import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "@freesail/logger";
import { FreesailAgent, AgentFactory, ActionEvent, ClientErrorEvent } from "./types.js";

const SESSIONS_URI = "mcp://freesail.dev/sessions";

export interface AgentRuntimeConfig {
  mcpClient: Client;
  /**
   * Factory to create a new agent instance for a specific session.
   */
  agentFactory: AgentFactory;
}

export class FreesailAgentRuntime {
  private mcpClient: Client;
  private agentFactory: AgentFactory;

  // Manage agent instances by sessionId
  private activeAgents: Map<string, FreesailAgent> = new Map();

  /**
   * Per-session serial queues for lifecycle events (connect/disconnect).
   * Isolates sessions from each other — a slow connect in session A
   * never delays session B's lifecycle processing.
   */
  private sessionChains: Map<string, Promise<void>> = new Map();

  /**
   * Tracks in-flight onAction promises per session so disconnect can drain them.
   * Each entry is a Set of promises that resolve when the action completes.
   */
  private inFlightActions: Map<string, Set<Promise<void>>> = new Map();

  /**
   * URIs we have active MCP resource subscriptions for.
   * Includes SESSIONS_URI and per-session URIs.
   */
  private activeSubscriptions: Set<string> = new Set();

  /**
   * Session IDs we currently know about, used to diff the sessions list
   * and detect connects/disconnects from ResourceUpdated notifications.
   */
  private knownSessions: Set<string> = new Set();

  /**
   * Serialises concurrent handleSessionsUpdate calls so two rapid
   * SESSIONS_URI notifications can't race on the knownSessions diff.
   */
  private sessionsUpdateChain: Promise<void> = Promise.resolve();

  constructor(config: AgentRuntimeConfig) {
    this.mcpClient = config.mcpClient;
    this.agentFactory = config.agentFactory;
  }

  /**
   * Start the runtime.
   * Subscribes to the sessions resource for push notifications and performs
   * an initial read to pick up any already-connected sessions.
   *
   * Requires the MCP client to be initialised with
   * `{ capabilities: { resources: { subscribe: true } } }`.
   */
  async start(): Promise<void> {
    // Subscribe to the sessions list — fires on every connect/disconnect
    await this.mcpClient.subscribeResource({ uri: SESSIONS_URI });
    this.activeSubscriptions.add(SESSIONS_URI);

    // Route ResourceUpdated notifications by URI
    this.mcpClient.setNotificationHandler(
      ResourceUpdatedNotificationSchema,
      async (notification) => {
        const { uri } = notification.params;

        if (uri === SESSIONS_URI) {
          // Serialise concurrent updates to avoid races on knownSessions
          this.sessionsUpdateChain = this.sessionsUpdateChain
            .then(() => this.handleSessionsUpdate())
            .catch((err) =>
              logger.error("[AgentRuntime] Sessions update failed:", err)
            );
          return;
        }

        const match = /^mcp:\/\/freesail\.dev\/sessions\/(.+)$/.exec(uri);
        if (match) {
          const sessionId = decodeURIComponent(match[1]!);
          await this.handleSessionActions(sessionId);
        }
      },
    );

    // Read current state on startup to handle pre-existing sessions
    await this.handleSessionsUpdate();

    logger.info("[AgentRuntime] Started with MCP resource subscription model");
  }

  /**
   * Stop the runtime. Unsubscribes from all active resource subscriptions.
   * Call this for clean shutdown before closing the MCP client.
   */
  async stop(): Promise<void> {
    for (const uri of this.activeSubscriptions) {
      try {
        await this.mcpClient.unsubscribeResource({ uri });
      } catch (err) {
        logger.warn(`[AgentRuntime] Failed to unsubscribe from ${uri}:`, err);
      }
    }
    this.activeSubscriptions.clear();
  }

  /**
   * Enqueue a lifecycle operation for a specific session, running serially
   * within that session but concurrently with all other sessions.
   */
  private queueForSession(sessionId: string, fn: () => Promise<void>): void {
    const current = this.sessionChains.get(sessionId) ?? Promise.resolve();
    const next = current
      .then(() => fn())
      .catch((err) => logger.error(`[AgentRuntime] Queue item failed (session=${sessionId}):`, err));
    this.sessionChains.set(sessionId, next);
  }

  /**
   * Retrieves or creates an agent for a given session ID.
   */
  private getOrCreateAgent(sessionId: string): FreesailAgent {
    if (!this.activeAgents.has(sessionId)) {
      logger.info(`[AgentRuntime] Creating new agent for session: ${sessionId}`);
      const agent = this.agentFactory(sessionId);
      this.activeAgents.set(sessionId, agent);
    }
    return this.activeAgents.get(sessionId)!;
  }

  /**
   * Tears down an agent and removes it from memory.
   */
  private removeAgent(sessionId: string) {
    if (this.activeAgents.has(sessionId)) {
      logger.info(`[AgentRuntime] Tearing down agent for session: ${sessionId}`);
      this.activeAgents.delete(sessionId);
    }
    this.inFlightActions.delete(sessionId);
    this.sessionChains.delete(sessionId);
  }

  /**
   * Dispatch an action to an agent as fire-and-forget, but track the promise
   * so the disconnect handler can drain it before tearing down the agent.
   */
  private dispatchAction(sessionId: string, agent: FreesailAgent, actionEvent: ActionEvent): void {
    if (!this.inFlightActions.has(sessionId)) {
      this.inFlightActions.set(sessionId, new Set());
    }
    const pending = this.inFlightActions.get(sessionId)!;

    const p = (agent.onAction?.(actionEvent) ?? Promise.resolve()).catch((err) =>
      logger.error(`[AgentRuntime] onAction failed (session=${sessionId}):`, err)
    );

    pending.add(p);
    // Clean up the set entry once the promise resolves
    p.finally(() => pending.delete(p));
  }

  private dispatchError(sessionId: string, agent: FreesailAgent, errorEvent: ClientErrorEvent): void {
    if (!this.inFlightActions.has(sessionId)) {
      this.inFlightActions.set(sessionId, new Set());
    }
    const pending = this.inFlightActions.get(sessionId)!;

    const p = (agent.onClientError?.(errorEvent) ?? Promise.resolve()).catch((err) =>
      logger.error(`[AgentRuntime] onClientError failed (session=${sessionId}):`, err)
    );

    pending.add(p);
    p.finally(() => pending.delete(p));
  }

  /**
   * Wait for all in-flight actions for a session to complete.
   * Called from the disconnect path before removing the agent.
   */
  private async drainSession(sessionId: string): Promise<void> {
    const pending = this.inFlightActions.get(sessionId);
    if (!pending || pending.size === 0) return;

    logger.info(
      `[AgentRuntime] Draining ${pending.size} in-flight action(s) for session ${sessionId} before disconnect`,
    );
    await Promise.allSettled([...pending]);
  }

  /**
   * Read the sessions list resource and diff against knownSessions to detect
   * newly connected and disconnected sessions.
   *
   * On connect: claim the session, subscribe to its per-session URI, create
   * the agent instance, and call onSessionConnected.
   *
   * On disconnect: drain in-flight actions, call onSessionDisconnected,
   * release the session, and unsubscribe from the per-session URI.
   */
  private async handleSessionsUpdate(): Promise<void> {
    try {
      const result = await this.mcpClient.readResource({ uri: SESSIONS_URI });
      const content = result.contents[0];
      if (!content || !("text" in content) || !content.text) return;

      const sessions = JSON.parse(content.text) as Array<{ id: string }>;
      const currentIds = new Set(sessions.map((s) => s.id));

      // Detect new sessions
      for (const sessionId of currentIds) {
        if (this.knownSessions.has(sessionId)) continue;

        this.knownSessions.add(sessionId);

        this.queueForSession(sessionId, async () => {
          let claimed = false;
          try {
            const result = await this.mcpClient.callTool({
              name: "claim_session",
              arguments: { sessionId },
            });
            const content = (result as any).content;
            const first = Array.isArray(content) ? content[0] : null;
            const text = first && "text" in first ? (first as { text: string }).text : null;
            const parsed = text ? JSON.parse(text) : null;
            claimed = parsed?.success === true;
            if (claimed) {
              logger.info(`[AgentRuntime] Claimed session ${sessionId}`);
            } else {
              logger.info(`[AgentRuntime] Session ${sessionId} already claimed by another agent — skipping`);
            }
          } catch (err) {
            logger.warn(`[AgentRuntime] Could not claim session ${sessionId}:`, err);
          }
          if (!claimed) return;

          // Subscribe to per-session resource only after claiming — prevents other
          // agents from dequeuing actions that belong to this agent.
          const sessionUri = `mcp://freesail.dev/sessions/${encodeURIComponent(sessionId)}`;
          if (!this.activeSubscriptions.has(sessionUri)) {
            try {
              await this.mcpClient.subscribeResource({ uri: sessionUri });
              this.activeSubscriptions.add(sessionUri);
            } catch (err) {
              logger.warn(`[AgentRuntime] Failed to subscribe to session ${sessionId}:`, err);
            }
          }

          const agent = this.getOrCreateAgent(sessionId);
          await agent.onSessionConnected?.(sessionId);

          // Drain any actions already queued before our subscription was set up
          await this.handleSessionActions(sessionId);
        });
      }

      // Detect removed sessions
      for (const sessionId of this.knownSessions) {
        if (currentIds.has(sessionId)) continue;

        this.knownSessions.delete(sessionId);

        this.queueForSession(sessionId, async () => {
          const agent = this.activeAgents.get(sessionId);
          if (agent) {
            await this.drainSession(sessionId);
            await agent.onSessionDisconnected?.(sessionId);
            this.removeAgent(sessionId);
          }
          try {
            await this.mcpClient.callTool({
              name: "release_session",
              arguments: { sessionId },
            });
          } catch (err) {
            logger.warn(`[AgentRuntime] Could not release session ${sessionId}:`, err);
          }
          // Unsubscribe from the per-session resource
          const sessionUri = `mcp://freesail.dev/sessions/${encodeURIComponent(sessionId)}`;
          if (this.activeSubscriptions.has(sessionUri)) {
            try {
              await this.mcpClient.unsubscribeResource({ uri: sessionUri });
            } catch (err) {
              logger.warn(`[AgentRuntime] Failed to unsubscribe from session ${sessionId}:`, err);
            }
            this.activeSubscriptions.delete(sessionUri);
          }
        });
      }
    } catch (error) {
      logger.error("[AgentRuntime] Error handling sessions update:", error);
    }
  }

  /**
   * Read the per-session resource to drain the action queue and dispatch
   * any pending actions to the session's agent.
   *
   * Lifecycle events (__session_*) are skipped — they are handled via the
   * sessions list subscription in handleSessionsUpdate.
   */
  private async handleSessionActions(sessionId: string): Promise<void> {
    try {
      const sessionUri = `mcp://freesail.dev/sessions/${encodeURIComponent(sessionId)}`;
      const result = await this.mcpClient.readResource({ uri: sessionUri });
      const content = result.contents[0];
      if (!content || !("text" in content) || !content.text) return;

      const messages = JSON.parse(content.text) as Array<{
        action?: {
          name: string;
          surfaceId: string;
          sourceComponentId: string;
          context: Record<string, unknown>;
        };
        error?: {
          code: string;
          message: string;
          surfaceId: string;
          path?: string;
        };
        dataModel?: {
          surfaceId: string;
          dataModel: Record<string, unknown>;
        };
      }>;

      if (!Array.isArray(messages) || messages.length === 0) return;

      for (const msg of messages) {
        const agent = this.activeAgents.get(sessionId);
        if (!agent) continue;

        if (msg.error) {
          const errorEvent: ClientErrorEvent = {
            code: msg.error.code,
            message: msg.error.message,
            surfaceId: msg.error.surfaceId,
            path: msg.error.path,
          };
          this.dispatchError(sessionId, agent, errorEvent);
          continue;
        }

        const rawAction = msg.action;
        if (!rawAction) continue;

        // Skip internal lifecycle events — handled via sessions list subscription
        if (typeof rawAction.name !== 'string') {
          logger.warn(`[AgentRuntime] Skipping action with non-string name (session=${sessionId}):`, rawAction.name);
          continue;
        }
        if (rawAction.name.startsWith("__session_")) continue;

        logger.debug(
          `[AgentRuntime] Routing Action: ${rawAction.name} (session=${sessionId})`,
        );

        const actionEvent: ActionEvent = {
          name: rawAction.name,
          surfaceId: rawAction.surfaceId,
          sourceComponentId: rawAction.sourceComponentId,
          context: rawAction.context,
          clientDataModel: msg.dataModel?.dataModel,
        };

        // Fire-and-forget, but tracked so disconnect can drain in-flight calls
        this.dispatchAction(sessionId, agent, actionEvent);
      }
    } catch (error) {
      logger.error(`[AgentRuntime] Error handling session actions (session=${sessionId}):`, error);
    }
  }
}
