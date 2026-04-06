#!/usr/bin/env node
/**
 * @fileoverview Freesail Server CLI
 *
 * Entry point for running the Freesail MCP server.
 * The gateway no longer loads catalogs from disk — clients provide
 * their catalog definitions on connection.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createSessionManager } from './session.js';
import { createExpressServer, startExpressServer } from './express.js';
import { createMCPServer, runMCPServer, runMCPServerHTTP } from './mcp.js';
import { configure, getConsoleSink, getFileSink, getTextFormatter, type LogLevel, type LogRecord, logger } from '@freesail/logger';

/**
 * CLI configuration.
 */
interface CLIConfig {
  /** Path to JSON config file (default: freesail-gateway.config.json in CWD) */
  configFile?: string;
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
  webhookUrl?: string;
  /** Session timeout in seconds */
  sessionTimeout?: number;
  /** Session resumption grace period in seconds */
  reconnectGracePeriod?: number;
  /** Directory to write catalog prompt logs to */
  catalogLogDir?: string;
  /** JSON body size limit (default: '5mb') */
  bodyLimit?: string;
  /** Allowed CORS origin(s). Single origin or array for multi-app deployments. Omit when behind nginx. */
  corsOrigins?: string | string[];
  /** Path to log file */
  logFile?: string;
  /** Minimum log level to emit (default: info) */
  logLevel: LogLevel;
  /** Per-subsystem log level overrides: subsystem name → level */
  logFilters: Record<string, LogLevel>;
}

/**
 * Shape of the optional JSON config file.
 * All fields are optional; CLI flags take precedence over file values.
 */
interface FileConfig {
  httpPort?: number;
  httpHost?: string;
  mcpPort?: number;
  mcpHost?: string;
  mcpMode?: 'stdio' | 'http';
  webhookUrl?: string;
  sessionTimeout?: number;
  reconnectGracePeriod?: number;
  catalogLogDir?: string;
  bodyLimit?: string;
  /** Allowed CORS origin(s). Single origin or array for multi-app deployments. Omit when behind nginx. */
  corsOrigins?: string | string[];
  log?: {
    file?: string;
    level?: LogLevel;
    filters?: Record<string, LogLevel>;
  };
}

/**
 * Load and parse a JSON config file. Returns an empty object if the file does not exist.
 */
function loadConfigFile(configFile?: string): FileConfig {
  const filePath = configFile ?? join(process.cwd(), 'freesail-gateway.config.json');
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as FileConfig;
  } catch (err) {
    console.error(`Failed to parse config file '${filePath}':`, err);
    process.exit(1);
  }
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
      case '--config':
        config.configFile = args[++i];
        break;
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
      case '--session-timeout':
        config.sessionTimeout = parseFloat(args[++i] ?? '1800');
        break;
      case '--reconnect-grace-period':
        config.reconnectGracePeriod = parseFloat(args[++i] ?? '180');
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
  --config <file>        Path to JSON config file (default: freesail-gateway.config.json in CWD)
  --http-port <port>     Port for the A2UI HTTP/SSE server (default: 3001)
  --http-host <host>     Host to bind the A2UI HTTP/SSE server to (default: 0.0.0.0)
  --mcp-mode <mode>      MCP transport mode: 'stdio' or 'http' (default: http)
  --mcp-port <port>      Port for MCP Streamable HTTP server (default: 3000)
  --mcp-host <host>      Host to bind MCP HTTP server to (default: 127.0.0.1)
  --session-timeout <s>  Session idle timeout in seconds (default: 1800)
  --reconnect-grace-period <s>  Session resumption window in seconds (default: 180)
  --log-file <file>      Path to log file (default: logs to console/stderr only)
  --log-level <level>    Minimum log level: fatal|error|warn|info|debug (default: info)
  --log-filter <f>       Per-subsystem level override, e.g. express:debug or mcp:warn
                         Top-level subsystems: express, mcp, session
                         Surface sub-categories: session.agent-surface, session.client-surface
                         Dot-notation maps to nested categories (repeatable)
  --help                 Show this help message

Config file (freesail-gateway.config.json) supports all of the above plus:
  sessionTimeout         Session idle timeout in seconds (default: 1800)
  reconnectGracePeriod   Session resumption window in seconds (default: 180)
  catalogLogDir          Directory to write catalog prompt logs to (overrides CATALOG_LOG_DIR env var)
  bodyLimit              JSON body size limit (default: "5mb")
  corsOrigins            Allowed CORS origin(s) — string or array of strings.
                         Omit when the gateway is behind a reverse proxy (nginx) on the same
                         origin as the UI; no CORS headers are needed in that case.
                         Required when the UI and gateway are on different origins (e.g. dev
                         without a proxy, or multiple web apps sharing one gateway).
                         Example: "https://app.example.com"
                         Example: ["https://app1.example.com", "https://app2.example.com"]
  log.file / log.level / log.filters  (same as CLI flags above)

CLI flags take precedence over config file values.

Deployment models:
  Same-origin (recommended for production):
    Run the gateway behind nginx (or Vite proxy in dev) on the same domain as the UI.
    Set corsOrigins only if multiple separate origins share one gateway.
    In FreesailProvider, omit the gateway prop — requests use relative paths automatically.

  Cross-origin (direct access):
    Set corsOrigins in the config to the UI origin(s).
    Pass the gateway URL explicitly to FreesailProvider: gateway="https://gateway.example.com".

Catalogs are provided by clients on connection via the /register-catalogs endpoint.
Upstream actions are queued per-session and exposed as MCP resources.
If --webhook-url is set, actions are also forwarded via HTTP POST.

Examples:
  freesail run gateway                                      # HTTP MCP on localhost:3000
  freesail run gateway --config /etc/freesail/config.json  # custom config file
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
  // Parse CLI args first so we know if --config was supplied
  const cliArgs = parseArgs();

  // Load file config, then overlay CLI args on top (CLI wins)
  const fileConfig = loadConfigFile(cliArgs.configFile);

  const config: CLIConfig = {
    configFile: cliArgs.configFile,
    mcpMode: cliArgs.mcpMode !== 'http' ? cliArgs.mcpMode : (fileConfig.mcpMode ?? cliArgs.mcpMode),
    httpPort: cliArgs.httpPort !== 3001 ? cliArgs.httpPort : (fileConfig.httpPort ?? cliArgs.httpPort),
    httpHost: cliArgs.httpHost !== '0.0.0.0' ? cliArgs.httpHost : (fileConfig.httpHost ?? cliArgs.httpHost),
    mcpPort: cliArgs.mcpPort !== 3000 ? cliArgs.mcpPort : (fileConfig.mcpPort ?? cliArgs.mcpPort),
    mcpHost: cliArgs.mcpHost !== '127.0.0.1' ? cliArgs.mcpHost : (fileConfig.mcpHost ?? cliArgs.mcpHost),
    webhookUrl: cliArgs.webhookUrl ?? fileConfig.webhookUrl,
    sessionTimeout: cliArgs.sessionTimeout ?? fileConfig.sessionTimeout,
    reconnectGracePeriod: cliArgs.reconnectGracePeriod ?? fileConfig.reconnectGracePeriod,
    catalogLogDir: cliArgs.catalogLogDir ?? fileConfig.catalogLogDir,
    bodyLimit: cliArgs.bodyLimit ?? fileConfig.bodyLimit,
    corsOrigins: cliArgs.corsOrigins ?? fileConfig.corsOrigins,
    logFile: cliArgs.logFile ?? fileConfig.log?.file,
    logLevel: cliArgs.logLevel !== 'info' ? cliArgs.logLevel : (fileConfig.log?.level ?? cliArgs.logLevel),
    logFilters: { ...(fileConfig.log?.filters ?? {}), ...cliArgs.logFilters },
  };

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
  const sessionManager = createSessionManager({
    sessionTimeout: config.sessionTimeout != null ? config.sessionTimeout * 1000 : undefined,
    reconnectGracePeriod: config.reconnectGracePeriod != null ? config.reconnectGracePeriod * 1000 : undefined,
    catalogLogDir: config.catalogLogDir,
  });

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
      bodyLimit: config.bodyLimit,
    });
  }

  // Start HTTP/SSE server
  const app = createExpressServer({
    sessionManager,
    webhookUrl: config.webhookUrl,
    bodyLimit: config.bodyLimit,
    corsOrigin: config.corsOrigins,
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
