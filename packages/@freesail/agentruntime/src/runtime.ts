import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ResourceListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "@freesail/logger";
import { FreesailAgent, AgentFactory, ActionEvent } from "./types.js";

export interface AgentRuntimeConfig {
  mcpClient: Client;
  /**
   * Agent identifier used to claim and release sessions via the gateway.
   * The runtime calls `claim_session` on connect and `release_session` on
   * disconnect so the gateway can track session ownership.
   *
   * If omitted, a random UUID is generated at startup — every runtime instance
   * gets a stable identity without any configuration. For multi-agent deployments
   * set this explicitly so sessions are identifiable in `list_sessions` output.
   */
  agentId?: string;
  /**
   * Factory to create a new agent instance for a specific session.
   */
  agentFactory: AgentFactory;
}

export class FreesailAgentRuntime {
  private mcpClient: Client;
  private agentId: string; // always set — either from config or auto-generated UUID
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

  constructor(config: AgentRuntimeConfig) {
    this.mcpClient = config.mcpClient;
    this.agentId = config.agentId ?? crypto.randomUUID();
    this.agentFactory = config.agentFactory;
    logger.debug(`[AgentRuntime] Agent ID: ${this.agentId}`);
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
      },
    );
    // Fallback: poll every 2s in case a notification was missed
    setInterval(() => this.checkPendingActions(), 2000);
    logger.info("[AgentRuntime] Started action polling loop with session management");
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

  private async checkPendingActions() {
    try {
      // Always poll without agentId filter so new (unclaimed) sessions are visible.
      // The claim_session call in the __session_connected handler establishes ownership.
      // For subsequent polls, the gateway still returns the claimed sessions' actions
      // regardless of filter, but deduplication is handled by the session queue drain.
      const result = await this.mcpClient.callTool({
        name: "get_all_pending_actions",
        arguments: {},
      });

      const content = result.content as Array<{ type: string; text?: string }>;
      const text =
        content[0]?.type === "text" ? (content[0].text ?? "[]") : "[]";

      if (text === "No pending actions." || text === "[]") return;

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
        const sessionId = entry.sessionId;

        for (const actionMsg of entry.actions) {
          const rawAction = actionMsg.action;
          if (!rawAction) continue;

          logger.debug(
            `[AgentRuntime] Routing Action: ${rawAction.name} (session=${sessionId})`,
          );

          if (rawAction.name === "__session_connected") {
            this.queueForSession(sessionId, async () => {
              try {
                await this.mcpClient.callTool({
                  name: "claim_session",
                  arguments: { agentId: this.agentId, sessionId },
                });
                logger.info(`[AgentRuntime] Claimed session ${sessionId} for agent ${this.agentId}`);
              } catch (err) {
                logger.warn(`[AgentRuntime] Could not claim session ${sessionId}:`, err);
              }
              const agent = this.getOrCreateAgent(sessionId);
              await agent.onSessionConnected?.(sessionId);
            });
            continue;
          }

          if (rawAction.name === "__session_disconnected") {
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
                  arguments: { agentId: this.agentId, sessionId },
                });
              } catch (err) {
                logger.warn(`[AgentRuntime] Could not release session ${sessionId}:`, err);
              }
            });
            continue;
          }

          // Skip any other internal lifecycle events to avoid noise
          if (rawAction.name?.startsWith("__session_")) continue;

          // Ensure agent exists (in case we missed a connect event)
          const agent = this.getOrCreateAgent(sessionId);

          // Build clean action event — routing chat vs UI is the agent's responsibility
          const actionEvent: ActionEvent = {
            name: rawAction.name,
            surfaceId: rawAction.surfaceId,
            sourceComponentId: rawAction.sourceComponentId,
            context: rawAction.context,
            clientDataModel: actionMsg._clientDataModel?.dataModel,
          };

          // Fire-and-forget, but tracked so disconnect can drain in-flight calls
          this.dispatchAction(sessionId, agent, actionEvent);
        }
      }
    } catch (error) {
      logger.error("[AgentRuntime] Error handling action notification:", error);
    }
  }
}
