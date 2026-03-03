import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { fetchFreesailSystemPrompt } from './utils.js';
import { logger } from '@freesail/logger';

/**
 * A shared, process-level cache for MCP-fetched data (system prompt and
 * application-defined tools) that is constant across all sessions.
 *
 * ## Mutex via Promise deduplication
 *
 * Each slot stores the **in-flight Promise**, not the resolved value.
 * This means:
 *
 * - **No thundering herd**: if N session agents call `getSystemPrompt()` at
 *   the same time while the cache is cold, they all receive the *same* Promise
 *   and the underlying MCP fetch is issued exactly once.
 *
 * - **Mid-turn safety**: `await sharedCache.getSystemPrompt()` resolves to a
 *   plain `string` which the caller holds as a local variable. If `invalidate()`
 *   fires while the caller is mid-turn, the local string is unaffected. Only
 *   the *next* caller after invalidation will trigger a fresh fetch (again
 *   deduplicated).
 *
 * - **Failure recovery**: if a fetch rejects, the slot is cleared so the next
 *   caller can retry rather than permanently caching a rejected Promise.
 *
 * ## Generic tools slot
 *
 * The `TTools` type parameter lets any agent framework (LangChain, Vercel AI
 * SDK, etc.) share a single fetched tool list without coupling agentruntime
 * to any particular SDK. Pass a `toolsFactory` to the constructor.
 *
 * @example
 * ```typescript
 * const cache = new SharedCache(mcpClient, () => LangChainAdapter.getTools(mcpClient));
 *
 * // In any session agent:
 * const prompt = await cache.getSystemPrompt();
 * const tools  = await cache.getTools();
 *
 * // When upstream catalogs change:
 * cache.invalidate();
 * ```
 */
export class SharedCache<TTools = unknown> {
  private mcpClient: Client;
  private toolsFactory: () => Promise<TTools>;
  private systemPromptOverride?: string;

  private _systemPrompt: Promise<string> | null = null;
  private _tools: Promise<TTools> | null = null;

  constructor(
    mcpClient: Client,
    toolsFactory: () => Promise<TTools>,
    systemPromptOverride?: string,
  ) {
    this.mcpClient = mcpClient;
    this.toolsFactory = toolsFactory;
    this.systemPromptOverride = systemPromptOverride;
  }

  /**
   * Returns the system prompt, fetching it once and deduplicating concurrent
   * requests. Returns the same Promise to all concurrent callers.
   */
  getSystemPrompt(): Promise<string> {
    if (this.systemPromptOverride) {
      return Promise.resolve(this.systemPromptOverride);
    }
    if (!this._systemPrompt) {
      logger.info('[SharedCache] Fetching system prompt from MCP...');
      this._systemPrompt = fetchFreesailSystemPrompt(this.mcpClient).catch((err) => {
        this._systemPrompt = null;
        throw err;
      });
    }
    return this._systemPrompt;
  }

  /**
   * Returns the tool list, fetching it once via the provided factory and
   * deduplicating concurrent requests. Returns the same Promise to all
   * concurrent callers.
   */
  getTools(): Promise<TTools> {
    if (!this._tools) {
      logger.info('[SharedCache] Fetching tools...');
      this._tools = this.toolsFactory().catch((err) => {
        this._tools = null;
        throw err;
      });
    }
    return this._tools;
  }

  /**
   * Marks both slots as stale. In-flight callers are unaffected — they hold a
   * reference to the old Promise and will use its resolved value for the
   * remainder of their current operation. The next caller after this point
   * triggers a fresh fetch (again deduplicated).
   */
  invalidate(): void {
    logger.info('[SharedCache] Cache invalidated');
    this._systemPrompt = null;
    this._tools = null;
  }
}
