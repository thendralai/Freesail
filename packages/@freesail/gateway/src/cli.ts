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
import { createMCPServer, runMCPServer } from './mcp.js';
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
  --http-port <port>     Port for HTTP/SSE server (default: 3001)
  --mcp-port <port>      Port for MCP HTTP server (default: 3000)
  --mcp-mode <mode>      MCP transport mode: 'stdio' or 'http' (default: stdio)
  --webhook-url <url>    URL to forward upstream UI actions to (e.g. http://localhost:3002/action)
  --log-file <file>      Path to log file (default: logs to console/stderr only)
  --help                 Show this help message

Catalogs are provided by clients on connection via the /register-catalogs endpoint.
Upstream actions are queued per-session and exposed as MCP resources.
If --webhook-url is set, actions are also forwarded via HTTP POST.

Examples:
  freesail-gateway
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
    // HTTP mode would use a different transport
    logger.info(`[Freesail] MCP HTTP mode on port ${config.mcpPort}`);
    // TODO: Implement HTTP SSE transport for MCP
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
