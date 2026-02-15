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
  --help                 Show this help message

Catalogs are provided by clients on connection via the /register-catalogs endpoint.
Upstream actions are queued per-session and exposed as MCP resources.
If --webhook-url is set, actions are also forwarded via HTTP POST.

Examples:
  freesail-gateway
  freesail-gateway --http-port 8080
  freesail-gateway --webhook-url http://localhost:3002/action
`);
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const config = parseArgs();

  console.error('[Freesail] Starting server...');
  console.error(`[Freesail] HTTP port: ${config.httpPort}`);
  console.error(`[Freesail] MCP mode: ${config.mcpMode}`);
  if (config.webhookUrl) {
    console.error(`[Freesail] Webhook URL: ${config.webhookUrl}`);
  }
  console.error('[Freesail] Waiting for client to provide catalogs...');

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
    console.error(`[Freesail] MCP HTTP mode on port ${config.mcpPort}`);
    // TODO: Implement HTTP SSE transport for MCP
  }

  // Start HTTP/SSE server
  const app = createExpressServer({
    sessionManager,
    webhookUrl: config.webhookUrl,
    onUpstreamMessage: (sessionId, message) => {
      console.error(`[Freesail] Upstream message (session=${sessionId}):`, JSON.stringify(message));
    },
  });

  await startExpressServer(app, config.httpPort);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.error('\n[Freesail] Shutting down...');
    sessionManager.dispose();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error('\n[Freesail] Shutting down...');
    sessionManager.dispose();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[Freesail] Fatal error:', error);
  process.exit(1);
});
