/**
 * @fileoverview freesail run gateway
 *
 * Starts the Freesail gateway server.
 * All gateway CLI flags are passed through unchanged.
 *
 * Usage: freesail run gateway [options]
 *
 * Options:
 *   --http-port <port>   Port for the A2UI HTTP/SSE server (default: 3001)
 *   --http-host <host>   Host to bind the A2UI server to (default: 0.0.0.0)
 *   --mcp-mode <mode>    MCP transport: 'stdio' or 'http' (default: stdio)
 *   --mcp-port <port>    Port for MCP HTTP server (default: 3000, http mode only)
 *   --mcp-host <host>    Host to bind MCP HTTP server to (default: 127.0.0.1)
 *   --webhook-url <url>  Forward UI actions to this URL via HTTP POST
 *   --log-file <file>    Write logs to file (in addition to console)
 *
 * Examples:
 *   freesail run gateway                                          (HTTP MCP mode, default)
 *   freesail run gateway --mcp-mode stdio                        (stdio MCP mode)
 *   freesail run gateway --http-port 8080
 *   freesail run gateway --mcp-port 4000 --http-port 8080
 *   freesail run gateway --webhook-url http://localhost:3002/action
 */
export async function run(): Promise<void> {
  // process.argv at this point: ['node', 'freesail', 'run', 'gateway', ...rest]
  // @freesail/gateway's parseArgs() uses process.argv.slice(2), which yields
  // ['run', 'gateway', ...rest]. Unknown tokens are silently skipped by its
  // switch/case parser, so the gateway flags pass through correctly.
  const { startGateway } = await import('@freesail/gateway');
  await startGateway();
}
