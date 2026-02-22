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
import { configure, getConsoleSink, getFileSink, getTextFormatter, type LogRecord, logger } from '@freesail/logger';

/**
 * CLI configuration.
 */
interface CLIConfig {
  /** MCP mode: 'stdio' or 'http' */
  mcpMode: 'stdio' | 'http';
  /** HTTP port for SSE server */
  httpPort: number;
  /** MCP HTTP port (if mode is 'http') */
  mcpPort: number;
  /** MCP HTTP host to bind to (if mode is 'http') */
  mcpHost: string;
  /** Webhook URL for forwarding upstream messages */
  webhookUrl?: string;
  /** Path to log file */
  logFile?: string;
}

/**
 * Parse CLI arguments.
 */
function parseArgs(): CLIConfig {
  const args = process.argv.slice(2);
  const config: CLIConfig = {
    mcpMode: 'stdio',
    httpPort: 3001,
    mcpPort: 3000,
    mcpHost: '127.0.0.1',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--http-port':
        config.httpPort = parseInt(args[++i] ?? '3001', 10);
        break;
      case '--mcp-port':
        config.mcpPort = parseInt(args[++i] ?? '3000', 10);
        break;
      case '--mcp-mode':
        config.mcpMode = (args[++i] ?? 'stdio') as 'stdio' | 'http';
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

Usage: freesail-gateway [options]

Options:
  --http-port <port>     Port for the A2UI HTTP/SSE server (default: 3001)
  --mcp-mode <mode>      MCP transport mode: 'stdio' or 'http' (default: stdio)
  --mcp-port <port>      Port for MCP Streamable HTTP server (default: 3000, http mode only)
  --mcp-host <host>      Host to bind MCP HTTP server to (default: 127.0.0.1, http mode only)
  --webhook-url <url>    URL to forward upstream UI actions to (e.g. http://localhost:3002/action)
  --log-file <file>      Path to log file (default: logs to console/stderr only)
  --help                 Show this help message

Catalogs are provided by clients on connection via the /register-catalogs endpoint.
Upstream actions are queued per-session and exposed as MCP resources.
If --webhook-url is set, actions are also forwarded via HTTP POST.

Examples:
  freesail-gateway                                          # stdio MCP mode
  freesail-gateway --mcp-mode http                          # HTTP MCP on localhost:3000
  freesail-gateway --mcp-mode http --mcp-port 4000          # HTTP MCP on custom port
  freesail-gateway --http-port 8080
  freesail-gateway --webhook-url http://localhost:3002/action
  freesail-gateway --log-file gateway.log
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
      { category: [], sinks: Object.keys(scriptSinks), level: 'info' },
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

  await startExpressServer(app, config.httpPort);

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

main().catch((error) => {
  logger.fatal('[Freesail] Fatal error:', error);
  process.exit(1);
});
