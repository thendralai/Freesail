#!/usr/bin/env node
/**
 * @fileoverview Freesail Server CLI
 *
 * Entry point for running the Freesail MCP server.
 * The gateway no longer loads catalogs from disk — clients provide
 * their catalog definitions on connection.
 */

import { createSessionManager } from './session.js';
import { createExpressServer, startExpressServer } from './express.js';
import { createMCPServer, runMCPServer, runMCPServerHTTP } from './mcp.js';
import { configure, getConsoleSink, getFileSink, getTextFormatter, type LogLevel, type LogRecord, logger } from '@freesail/logger';

/**
 * CLI configuration.
 */
interface CLIConfig {
  /** MCP mode: 'stdio' or 'http' */
  mcpMode: 'stdio' | 'http';
  /** HTTP port for SSE server */
  httpPort: number;
  /** HTTP host to bind to */
  httpHost: string;
  /** MCP HTTP port (if mode is 'http') */
  mcpPort: number;
  /** MCP HTTP host to bind to (if mode is 'http') */
  mcpHost: string;
  /** Webhook URL for forwarding upstream messages. Undocumented for now */
  //webhookUrl?: string;
  /** Path to log file */
  logFile?: string;
  /** Minimum log level to emit (default: info) */
  logLevel: LogLevel;
  /** Per-subsystem log level overrides: subsystem name → level */
  logFilters: Record<string, LogLevel>;
}

/**
 * Parse CLI arguments.
 */
function parseArgs(): CLIConfig {
  const args = process.argv.slice(2);
  const config: CLIConfig = {
    mcpMode: 'http',
    httpPort: 3001,
    httpHost: '0.0.0.0',
    mcpPort: 3000,
    mcpHost: '127.0.0.1',
    logLevel: 'info',
    logFilters: {},
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--http-port':
        config.httpPort = parseInt(args[++i] ?? '3001', 10);
        break;
      case '--http-host':
        config.httpHost = args[++i] ?? '0.0.0.0';
        break;
      case '--mcp-port':
        config.mcpPort = parseInt(args[++i] ?? '3000', 10);
        break;
      case '--mcp-mode':
        config.mcpMode = (args[++i] ?? 'http') as 'stdio' | 'http';
        break;
      case '--mcp-host':
        config.mcpHost = args[++i] ?? '127.0.0.1';
        break;
      case '--webhook-url':
        config.webhookUrl = args[++i];
        break;
      case '--log-file':
        config.logFile = args[++i];
        break;
      case '--log-level': {
        const lvl = args[++i] as LogLevel;
        const valid: LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug'];
        if (!valid.includes(lvl)) {
          console.error(`Invalid --log-level '${lvl}'. Valid values: ${valid.join(', ')}`);
          process.exit(1);
        }
        config.logLevel = lvl;
        break;
      }
      case '--log-filter': {
        // Format: subsystem:level  e.g. express:debug  or  mcp:warn
        const raw = args[++i] ?? '';
        const sep = raw.indexOf(':');
        if (sep === -1) {
          console.error(`Invalid --log-filter '${raw}'. Expected format: <subsystem>:<level>`);
          process.exit(1);
        }
        const subsystem = raw.slice(0, sep);
        const level = raw.slice(sep + 1) as LogLevel;
        config.logFilters[subsystem] = level;
        break;
      }
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  return config;
}

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`
Freesail Gateway

Usage:
  freesail run gateway [options]
  freesail-gateway [options]

Options:
  --http-port <port>     Port for the A2UI HTTP/SSE server (default: 3001)
  --http-host <host>     Host to bind the A2UI HTTP/SSE server to (default: 0.0.0.0)
  --mcp-mode <mode>      MCP transport mode: 'stdio' or 'http' (default: http)
  --mcp-port <port>      Port for MCP Streamable HTTP server (default: 3000)
  --mcp-host <host>      Host to bind MCP HTTP server to (default: 127.0.0.1)
  --log-file <file>      Path to log file (default: logs to console/stderr only)
  --log-level <level>    Minimum log level: fatal|error|warn|info|debug (default: info)
  --log-filter <f>       Per-subsystem level override, e.g. express:debug or mcp:warn
                         Top-level subsystems: express, mcp, session
                         Surface sub-categories: session.agent-surface, session.client-surface
                         Dot-notation maps to nested categories (repeatable)
  --help                 Show this help message

Catalogs are provided by clients on connection via the /register-catalogs endpoint.
Upstream actions are queued per-session and exposed as MCP resources.
If --webhook-url is set, actions are also forwarded via HTTP POST.

Examples:
  freesail run gateway                                      # HTTP MCP on localhost:3000
  freesail run gateway --mcp-mode stdio                     # stdio MCP mode
  freesail run gateway --mcp-port 4000                      # HTTP MCP on custom port
  freesail run gateway --http-port 8080
  freesail run gateway --webhook-url http://localhost:3002/action
  freesail run gateway --log-file gateway.log
  freesail run gateway --log-level warn
  freesail run gateway --log-level info --log-filter mcp:debug
  freesail run gateway --log-level warn --log-filter session:debug --log-file gateway.log
  freesail run gateway --log-filter session.agent-surface:debug --log-filter session.client-surface:warn
`);
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const config = parseArgs();

  // Configure logging
  // If running in stdio mode, we MUST write logs to stderr to avoid corrupting the MCP protocol
  const sink = config.mcpMode === 'stdio'
    ? (record: LogRecord) => process.stderr.write(getTextFormatter()(record) + '\n')
    : getConsoleSink();

  const scriptSinks: Record<string, (record: LogRecord) => void> = {
    console: sink,
  };

  if (config.logFile) {
    scriptSinks['file'] = getFileSink(config.logFile);
  }
  
  await configure({
    sinks: scriptSinks,
    loggers: [
      // Root logger — covers everything not matched by a subsystem filter
      { category: [], sinks: Object.keys(scriptSinks), level: config.logLevel },
      // Per-subsystem overrides from --log-filter flags
      // Keys support dot-notation for nested categories, e.g. "session.agent-surface"
      // maps to category ['freesail', 'session', 'agent-surface'].
      ...Object.entries(config.logFilters).map(([subsystem, level]) => ({
        category: ['freesail', ...subsystem.split('.')],
        sinks: Object.keys(scriptSinks),
        level,
      })),
    ],
    reset: true,
  });

  logger.info('[Freesail] Starting server...');
  logger.info(`[Freesail] HTTP port: ${config.httpPort}`);
  logger.info(`[Freesail] MCP mode: ${config.mcpMode}`);
  if (config.webhookUrl) {
    logger.info(`[Freesail] Webhook URL: ${config.webhookUrl}`);
  }
  logger.info('[Freesail] Waiting for client to provide catalogs...');

  // Create session manager
  const sessionManager = createSessionManager();

  // Start MCP server first to ensure action listeners are registered
  // before any clients connect to Express
  if (config.mcpMode === 'stdio') {
    await runMCPServer({
      sessionManager,
    });
  } else {
    // HTTP SSE mode: MCP on separate port, bound to localhost for network isolation
    await runMCPServerHTTP({
      sessionManager,
      port: config.mcpPort,
      host: config.mcpHost,
    });
  }

  // Start HTTP/SSE server
  const app = createExpressServer({
    sessionManager,
    webhookUrl: config.webhookUrl,
    onUpstreamMessage: (sessionId, message) => {
      logger.info(`[Freesail] Upstream message (session=${sessionId}):`, JSON.stringify(message));
    },
  });

  await startExpressServer(app, config.httpPort, config.httpHost);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('\n[Freesail] Shutting down...');
    sessionManager.dispose();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('\n[Freesail] Shutting down...');
    sessionManager.dispose();
    process.exit(0);
  });
}

// Only auto-run when invoked directly as the gateway entry point, not when
// imported as a module by another CLI (e.g. `freesail run gateway`).
const isMain = process.argv[1] != null && (
  process.argv[1].endsWith('freesail-gateway') ||
  (process.argv[1].includes('gateway') && process.argv[1].endsWith('cli.js')) ||
  (process.argv[1].includes('gateway') && process.argv[1].endsWith('cli.ts'))
);

if (isMain) {
  main().catch((error) => {
    logger.fatal('[Freesail] Fatal error:', error);
    process.exit(1);
  });
}

export { main as run };
