# @freesail/gateway

The Freesail Gateway is the central bridge between AI agents and browser-based frontends. It exposes two network interfaces:

| Interface | Port | Protocol | Purpose |
|-----------|------|----------|---------|
| **Agent-facing** | 3000 (default) | MCP Streamable HTTP | Exposes tools, resources, and prompts to AI agents |
| **UI-facing** | 3001 (default) | HTTP SSE + POST | Streams UI updates to the frontend, receives user actions |

---

## Running the Gateway

The recommended way is via the `freesail` CLI:

```bash
npx freesail run gateway
```

Or directly if you have the package installed:

```bash
npx freesail-gateway
```

---

## CLI Options

```
--config <file>        Path to JSON config file (default: freesail-gateway.config.json in CWD)
--http-port <port>     Port for the A2UI HTTP/SSE server (default: 3001)
--http-host <host>     Host to bind the A2UI server to (default: 0.0.0.0)
--mcp-mode <mode>      MCP transport: 'stdio' or 'http' (default: http)
--mcp-port <port>      Port for MCP Streamable HTTP server (default: 3000)
--mcp-host <host>      Host to bind MCP HTTP server to (default: 127.0.0.1)
--log-file <file>      Write logs to file (in addition to console)
--log-level <level>    Minimum log level: fatal|error|warn|info|debug (default: info)
--log-filter <f>       Per-subsystem level override, e.g. express:debug (repeatable)
--help                 Show help
```

### Examples

```bash
# Default — HTTP MCP on port 3000, A2UI on port 3001
freesail run gateway

# Custom ports
freesail run gateway --http-port 8080 --mcp-port 4000

# Stdio MCP mode (agent spawns gateway as a child process)
freesail run gateway --mcp-mode stdio

# With a config file
freesail run gateway --config /etc/freesail/gateway.json

# Forward UI actions to an agent webhook
freesail run gateway --webhook-url http://localhost:3002/action

# Log to file, suppress MCP noise
freesail run gateway --log-file gateway.log --log-level info --log-filter mcp:warn
```

---

## Config File

All settings can be provided via a JSON config file. CLI flags take precedence over config file values.

The gateway looks for `freesail-gateway.config.json` in the current working directory by default. A sample is included in this package — copy it as a starting point:

```bash
cp node_modules/@freesail/gateway/freesail.config.sample.json freesail-gateway.config.json
```

### Full Reference

```json
{
  "httpPort": 3001,
  "httpHost": "0.0.0.0",
  "mcpMode": "http",
  "mcpPort": 3000,
  "mcpHost": "127.0.0.1",
  "webhookUrl": "http://localhost:3002/action",
  "sessionTimeout": 1800,
  "reconnectGracePeriod": 180,
  "bodyLimit": "5mb",
  "catalogLogDir": "/var/log/freesail/catalogs",
  "log": {
    "level": "info",
    "file": "/var/log/freesail/gateway.log",
    "filters": {
      "express": "info",
      "mcp": "warn",
      "session": "info",
      "session.agent-surface": "debug",
      "session.client-surface": "warn"
    }
  }
}
```

All fields are optional.

---

## Security

### Session Identity and CSRF Protection

The gateway separates two distinct concerns:

- **CSRF protection** — an `HttpOnly; SameSite=Strict` cookie (`freesail-gateway-token`) is set on every SSE connection. Its presence is validated on all write endpoints (`/message`, `/register-surface`, `/register-catalogs`). `SameSite=Strict` ensures cross-site requests cannot include it, blocking CSRF attacks.
- **Session identity** — the session ID is stored in `sessionStorage` by the client (tab-scoped) and sent as the `X-Freesail-Session` header on all requests. This ensures each browser tab maintains its own independent session.

No application code is required to handle sessions — `FreesailProvider` manages this automatically.

### User Context Propagation

When deployed behind nginx, the gateway reads the `X-User-Context` header on every SSE connection and stores the parsed JSON as `userContext` on the session. Agents receive this context via `list_sessions`.

Nginx validates the user's authentication (JWT, session cookie, etc.) and injects the header:

```nginx
location /sse {
    # After validating the user's auth token:
    proxy_set_header X-User-Context '{"userId":"$jwt_sub","orgId":"$jwt_org_id","email":"$jwt_email"}';
    proxy_pass http://127.0.0.1:3001;
    ...
}
```

The value must be a JSON object. Any valid JSON key/value pairs are accepted — include whatever claims your application needs (userId, orgId, roles, tenantId, etc.). The gateway trusts this header as-is, so it must only be set by a trusted reverse proxy, never by the browser.

`userContext` is refreshed on every reconnect, so if the user re-authenticates between sessions the agent always sees current claims.

---

## HTTPS / TLS

The gateway itself runs plain HTTP. For production, place nginx in front to handle TLS termination for both ports. This is the standard approach — nginx handles certificate renewal, HTTP/2, and security hardening without any changes to the gateway.

```
Browser → HTTPS :443  → nginx → HTTP :3001  (A2UI / SSE)
Agent   → HTTPS :8443 → nginx → HTTP :3000  (MCP HTTP)
```

Sample nginx config:

```nginx
# A2UI server — browser-facing SSE + POST
server {
    listen 443 ssl;
    server_name gateway.example.com;

    ssl_certificate     /etc/letsencrypt/live/gateway.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gateway.example.com/privkey.pem;

    location /sse {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # Required for SSE — disable buffering so events are flushed immediately
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Inject authenticated user context (replace with your actual auth variables)
        proxy_set_header X-User-Context '{"userId":"$jwt_sub","orgId":"$jwt_org_id"}';
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# MCP HTTP server — agent-facing (internal or separate TLS termination)
server {
    listen 8443 ssl;
    server_name gateway.example.com;

    ssl_certificate     /etc/letsencrypt/live/gateway.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gateway.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Certificates can be managed with [Certbot](https://certbot.eff.org/) — renewal is fully automatic and requires no changes to the gateway.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CATALOG_LOG_DIR` | Directory to write catalog prompt logs to. Overridden by `catalogLogDir` in the config file. |

---

## Logging

### Log levels

`fatal` | `error` | `warn` | `info` (default) | `debug`

### Subsystem filters

Override the log level for individual subsystems with `--log-filter <subsystem>:<level>` (repeatable) or via `log.filters` in the config file:

| Subsystem | Covers |
|-----------|--------|
| `express` | SSE connections, incoming actions, catalog registration |
| `mcp` | Agent MCP tool calls, session handshake |
| `session` | Surface creates/updates, data-model writes, stale-session cleanup |
| `session.agent-surface` | Downstream messages sent to agents |
| `session.client-surface` | Downstream messages sent to browser clients |

```bash
# Quiet MCP traffic, verbose agent-surface events
freesail run gateway --log-filter mcp:warn --log-filter session.agent-surface:debug
```

---

## Network Isolation

By default the MCP server binds to `127.0.0.1` so only local processes can reach it. The A2UI server binds to `0.0.0.0` to accept browser connections. Change `mcpHost` / `httpHost` in the config file if your deployment requires different bindings.

---

## Session Timeout

Idle sessions are cleaned up after **30 minutes** by default. Override via config:

```json
{ "sessionTimeout": 3600000 }
```

---

## License

MIT — see [LICENSE](./LICENSE)
