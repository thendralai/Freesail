/**
 * @fileoverview Freesail MCP Server - Public API
 */

// Converter
export type {
  CatalogProperty,
  CatalogComponent,
  Catalog,
  MCPTool,
} from './converter.js';
export {
  catalogToMCPTools,
  generateCatalogPrompt,
  validateComponent,
  parseCatalog,
  catalogSchema,
} from './converter.js';

// Session Manager
export type {
  ClientSession,
  AgentBinding,
  SessionManagerOptions,
  SessionManagerEvents,
} from './session.js';
export { SessionManager, createSessionManager } from './session.js';

// MCP Server
export type { MCPServerOptions } from './mcp.js';
export { createMCPServer, runMCPServer } from './mcp.js';

// Express Server
export type { ExpressServerOptions } from './express.js';
export { createExpressServer, startExpressServer } from './express.js';
