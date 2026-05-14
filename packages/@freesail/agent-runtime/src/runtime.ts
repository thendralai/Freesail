import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "@freesail/logger";
import { FreesailAgent, AgentFactory, ActionEvent, ClientErrorEvent, SessionNotification } from "./types.js";
import { FreesailSessionClientImpl, FreesailToolProvider, ToolDefinition } from "./session-client.js";
import { fetchFreesailSystemPrompt } from "./utils.js";

const SESSIONS_URI = "mcp://freesail.dev/sessions";

export interface AgentRuntimeConfig {
  /** URL of the Freesail gateway MCP endpoint, e.g. http://localhost:3000/mcp */
  gatewayUrl: string | URL;
  /** Factory to create a new agent instance for each claimed session */
  agentFactory: AgentFactory;
  /** MCP client identity sent to the gateway (default: freesail-agent / 1.0.0) */
  clientInfo?: { name: string; version: string };
}

export class FreesailAgentRuntime implements FreesailToolProvider {
  private gatewayUrl: URL;
  private clientInfo: { name: string; version: string };
  private agentFactory: AgentFactory;

  private coordinatorClient: Client | null = null;
  private agentClients: Map<string, Client> = new Map();

  private activeAgents: Map<string, FreesailAgent> = new Map();

  /**
   * Per-session serial queues for lifecycle events (connect/disconnect).
   * Isolates sessions from each other — a slow connect in session A
   * never delays session B's lifecycle processing.
   */
  private sessionChains: Map<string, Promise<void>> = new Map();

  /**
   * Tracks in-flight onAction promises per session so disconnect can drain them.
   */
  private inFlightActions: Map<string, Set<Promise<void>>> = new Map();

  /**
   * Session IDs we currently know about, used to diff the sessions list.
   */
  private knownSessions: Set<string> = new Set();

  /**
   * Serialises concurrent handleSessionsUpdate calls.
   */
  private sessionsUpdateChain: Promise<void> = Promise.resolve();

  /**
   * Session IDs whose per-session subscription failed — polled via list_changed.
   */
  private missedSubscriptions: Set<string> = new Set();

  constructor(config: AgentRuntimeConfig) {
    this.gatewayUrl = new URL(config.gatewayUrl.toString());
    this.clientInfo = config.clientInfo ?? { name: 'freesail-agent', version: '1.0.0' };
    this.agentFactory = config.agentFactory;
  }

  private async createClient(): Promise<Client> {
    const RETRY_DELAYS_MS = [100, 500];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await new Promise<void>(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
      }
      try {
        const transport = new StreamableHTTPClientTransport(new URL(this.gatewayUrl.toString()));
        const client = new Client(this.clientInfo, { capabilities: {} });
        await client.connect(transport);
        return client;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  /**
   * Start the runtime. Creates the coordinator client, subscribes to the sessions
   * resource, and performs an initial read to pick up pre-existing sessions.
   */
  async start(): Promise<void> {
    this.coordinatorClient = await this.createClient();

    await this.coordinatorClient.subscribeResource({ uri: SESSIONS_URI });

    this.coordinatorClient.setNotificationHandler(
      ResourceUpdatedNotificationSchema,
      async (notification) => {
        if (notification.params.uri === SESSIONS_URI) {
          this.sessionsUpdateChain = this.sessionsUpdateChain
            .then(() => this.handleSessionsUpdate())
            .catch((err) => logger.error("[AgentRuntime] Sessions update failed:", err));
        }
      },
    );

    // Poll missed subscriptions whenever the resource list changes
    this.coordinatorClient.setNotificationHandler<any>(
      z.object({ method: z.literal('notifications/resources/list_changed') }).passthrough(),
      async () => { await this.pollPendingActions(); },
    );

    await this.handleSessionsUpdate();

    logger.info("[AgentRuntime] Started");
  }

  /**
   * Stop the runtime. Releases all sessions and closes all clients.
   */
  async stop(): Promise<void> {
    if (this.coordinatorClient) {
      try {
        await this.coordinatorClient.unsubscribeResource({ uri: SESSIONS_URI });
      } catch {}
      try {
        await this.coordinatorClient.close();
      } catch {}
      this.coordinatorClient = null;
    }

    for (const [sessionId, client] of this.agentClients) {
      const sessionUri = `mcp://freesail.dev/sessions/${encodeURIComponent(sessionId)}`;
      try { await client.callTool({ name: 'release_session', arguments: { sessionId } }); } catch {}
      try { await client.unsubscribeResource({ uri: sessionUri }); } catch {}
      try { await client.close(); } catch {}
    }
    this.agentClients.clear();
  }

  /**
   * Drain pending actions for sessions whose subscription failed.
   * Call from a resources/list_changed handler as a fallback.
   */
  async pollPendingActions(): Promise<void> {
    if (this.agentClients.size === 0) return;
    await Promise.allSettled(
      [...this.agentClients.entries()].map(([sessionId, client]) =>
        this.handleSessionActions(sessionId, client)
      )
    );
  }

  // ── FreesailToolProvider ────────────────────────────────────────────────────
  // Delegates to the coordinator client for shared / bootstrap use (e.g. SharedCache).

  private _systemPrompt: Promise<string> | null = null;
  private _toolDefs: Promise<ToolDefinition[]> | null = null;

  async getSystemPrompt(): Promise<string> {
    if (!this.coordinatorClient) throw new Error('[AgentRuntime] Not started — call start() first');
    if (!this._systemPrompt) {
      this._systemPrompt = fetchFreesailSystemPrompt(this.coordinatorClient)
        .catch(err => { this._systemPrompt = null; throw err; });
    }
    return this._systemPrompt;
  }

  async getToolDefinitions(): Promise<ToolDefinition[]> {
    if (!this.coordinatorClient) throw new Error('[AgentRuntime] Not started — call start() first');
    if (!this._toolDefs) {
      this._toolDefs = this.coordinatorClient.listTools()
        .then(({ tools }) => tools.map(t => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema })))
        .catch(err => { this._toolDefs = null; throw err; });
    }
    return this._toolDefs;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.coordinatorClient) throw new Error('[AgentRuntime] Not started — call start() first');
    const result = await this.coordinatorClient.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    return content.map(c => c.type === 'text' ? c.text ?? '' : JSON.stringify(c)).join('\n');
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private queueForSession(sessionId: string, fn: () => Promise<void>): void {
    const current = this.sessionChains.get(sessionId) ?? Promise.resolve();
    const next = current
      .then(() => fn())
      .catch((err) => logger.error(`[AgentRuntime] Queue item failed (session=${sessionId}):`, err));
    this.sessionChains.set(sessionId, next);
  }

  private getOrCreateAgent(sessionId: string, session: FreesailSessionClientImpl): FreesailAgent {
    if (!this.activeAgents.has(sessionId)) {
      logger.info(`[AgentRuntime] Creating new agent for session: ${sessionId}`);
      const agent = this.agentFactory(sessionId, session);
      this.activeAgents.set(sessionId, agent);
    }
    return this.activeAgents.get(sessionId)!;
  }

  private removeAgent(sessionId: string) {
    if (this.activeAgents.has(sessionId)) {
      logger.info(`[AgentRuntime] Tearing down agent for session: ${sessionId}`);
      this.activeAgents.delete(sessionId);
    }
    this.inFlightActions.delete(sessionId);
    this.sessionChains.delete(sessionId);
  }

  private dispatchNotification(sessionId: string, agent: FreesailAgent, notification: SessionNotification): void {
    const pending = this.inFlightActions.get(sessionId) ?? new Set();
    this.inFlightActions.set(sessionId, pending);

    const p = agent.onSessionNotification!(notification).catch((err) =>
      logger.error(`[AgentRuntime] onSessionNotification failed (session=${sessionId}):`, err)
    );

    pending.add(p);
    p.finally(() => pending.delete(p));
  }

  private async drainSession(sessionId: string): Promise<void> {
    const pending = this.inFlightActions.get(sessionId);
    if (!pending || pending.size === 0) return;
    logger.info(`[AgentRuntime] Draining ${pending.size} in-flight action(s) for session ${sessionId}`);
    await Promise.allSettled([...pending]);
  }

  private async handleSessionsUpdate(): Promise<void> {
    try {
      const result = await this.coordinatorClient!.readResource({ uri: SESSIONS_URI });
      const content = result.contents[0];
      if (!content || !("text" in content) || !content.text) return;

      const sessions = JSON.parse(content.text) as Array<{ id: string }>;
      const currentIds = new Set(sessions.map((s) => s.id));

      // Detect new sessions
      for (const sessionId of currentIds) {
        if (this.knownSessions.has(sessionId)) continue;
        this.knownSessions.add(sessionId);

        this.queueForSession(sessionId, async () => {
          // Create a dedicated client and claim the session.
          // Both steps are retried together: if claim_session's first POST fails
          // (stale keep-alive socket), we close the client and reconnect from scratch.
          const CLAIM_RETRY_DELAYS_MS = [200, 1000];
          let agentClient: Client | null = null;
          let claimed = false;
          let claimSkip = false; // gateway explicitly rejected (not a network error)

          for (let attempt = 0; attempt <= CLAIM_RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) {
              await new Promise<void>(r => setTimeout(r, CLAIM_RETRY_DELAYS_MS[attempt - 1]));
            }
            if (agentClient) {
              try { await agentClient.close(); } catch {}
            }
            try {
              agentClient = await this.createClient();
            } catch (err) {
              logger.warn(`[AgentRuntime] Could not connect for session ${sessionId} (attempt ${attempt + 1}):`, err);
              continue;
            }

            try {
              const claimResult = await agentClient.callTool({
                name: "claim_session",
                arguments: { sessionId },
              });
              const claimContent = (claimResult as any).content;
              const first = Array.isArray(claimContent) ? claimContent[0] : null;
              const text = first && "text" in first ? (first as { text: string }).text : null;
              const parsed = text ? JSON.parse(text) : null;
              claimed = parsed?.success === true;
              if (claimed) {
                logger.info(`[AgentRuntime] Claimed session ${sessionId}`);
              } else {
                logger.info(`[AgentRuntime] Could not claim session ${sessionId} — skipping: ${parsed?.error ?? 'unknown reason'}`);
                claimSkip = true;
              }
              break; // tool call succeeded (even if gateway rejected) — stop retrying
            } catch (err) {
              logger.warn(`[AgentRuntime] claim_session failed for ${sessionId} (attempt ${attempt + 1}):`, err);
            }
          }

          if (!claimed) {
            if (agentClient) { try { await agentClient.close(); } catch {} }
            if (!claimSkip) {
              logger.warn(`[AgentRuntime] Gave up claiming session ${sessionId} after retries`);
            }
            return;
          }

          // Narrow type: agentClient is non-null here (null path returned above)
          const claimedClient = agentClient as Client;

          // Register per-session notification handler on the dedicated client
          claimedClient.setNotificationHandler(
            ResourceUpdatedNotificationSchema,
            async (notification) => {
              const match = /^mcp:\/\/freesail\.dev\/sessions\/(.+)$/.exec(notification.params.uri);
              if (match) {
                const sid = decodeURIComponent(match[1]!);
                await this.handleSessionActions(sid, claimedClient);
              }
            },
          );

          this.agentClients.set(sessionId, claimedClient);

          // Subscribe to per-session resource on the dedicated client
          const sessionUri = `mcp://freesail.dev/sessions/${encodeURIComponent(sessionId)}`;
          const RETRY_DELAYS_MS = [100, 500];
          let subscribed = false;
          let lastErr: unknown;
          for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) {
              await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
            }
            try {
              await claimedClient.subscribeResource({ uri: sessionUri });
              subscribed = true;
              break;
            } catch (err) {
              lastErr = err;
            }
          }
          if (subscribed) {
            this.missedSubscriptions.delete(sessionId);
          } else {
            logger.warn(`[AgentRuntime] Failed to subscribe to session ${sessionId} — will poll via list_changed:`, lastErr);
            this.missedSubscriptions.add(sessionId);
          }

          const session = new FreesailSessionClientImpl(sessionId, claimedClient);
          const agent = this.getOrCreateAgent(sessionId, session);
          await agent.onSessionConnected?.(sessionId);

          await this.handleSessionActions(sessionId, claimedClient);
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

          const agentClient = this.agentClients.get(sessionId);
          if (agentClient) {
            const sessionUri = `mcp://freesail.dev/sessions/${encodeURIComponent(sessionId)}`;
            try {
              await agentClient.callTool({ name: 'release_session', arguments: { sessionId } });
            } catch (err) {
              logger.warn(`[AgentRuntime] Could not release session ${sessionId}:`, err);
            }
            try {
              await agentClient.unsubscribeResource({ uri: sessionUri });
            } catch (err) {
              logger.warn(`[AgentRuntime] Failed to unsubscribe from session ${sessionId}:`, err);
            }
            try { await agentClient.close(); } catch {}
            this.agentClients.delete(sessionId);
          }
          this.missedSubscriptions.delete(sessionId);
        });
      }
    } catch (error) {
      logger.error("[AgentRuntime] Error handling sessions update:", error);
    }
  }

  private async handleSessionActions(sessionId: string, client: Client): Promise<void> {
    const agent = this.activeAgents.get(sessionId);
    if (!agent?.onSessionNotification) return;

    try {
      const sessionUri = `mcp://freesail.dev/sessions/${encodeURIComponent(sessionId)}`;
      const result = await client.readResource({ uri: sessionUri });
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
        if (msg.error) {
          this.dispatchNotification(sessionId, agent, {
            type: 'error',
            event: {
              code: msg.error.code,
              message: msg.error.message,
              surfaceId: msg.error.surfaceId,
              path: msg.error.path,
            } as ClientErrorEvent,
          });
          continue;
        }

        const rawAction = msg.action;
        if (!rawAction) continue;

        if (typeof rawAction.name !== 'string') {
          logger.warn(`[AgentRuntime] Skipping action with non-string name (session=${sessionId}):`, rawAction.name);
          continue;
        }
        if (rawAction.name.startsWith("__session_")) continue;

        logger.debug(`[AgentRuntime] Routing Action: ${rawAction.name} (session=${sessionId})`);

        this.dispatchNotification(sessionId, agent, {
          type: 'action',
          event: {
            name: rawAction.name,
            surfaceId: rawAction.surfaceId,
            sourceComponentId: rawAction.sourceComponentId,
            context: rawAction.context,
            clientDataModel: msg.dataModel?.dataModel,
          } as ActionEvent,
        });
      }
    } catch (error) {
      logger.error(`[AgentRuntime] Error handling session actions (session=${sessionId}):`, error);
    }
  }
}
