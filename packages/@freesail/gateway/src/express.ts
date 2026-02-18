/**
 * @fileoverview Express HTTP Server
 *
 * Handles HTTP endpoints for SSE streaming to clients
 * and receiving upstream messages.
 */

import express, { type Express, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import type { UpstreamMessage } from '@freesail/core';
import { SessionManager } from './session.js';
import { parseCatalog, type Catalog } from './converter.js';
import { logger } from '@freesail/logger';

/**
 * Express server configuration.
 */
export interface ExpressServerOptions {
  /** HTTP port (default: 3001) */
  port?: number;
  /** Session manager instance */
  sessionManager: SessionManager;
  /** Callback when upstream message is received */
  onUpstreamMessage?: (sessionId: string | null, message: UpstreamMessage) => void;
  /** Callback when catalogs are registered by a client */
  onCatalogsRegistered?: (catalogs: Catalog[]) => void;
  /** URL to forward upstream actions to (e.g. agent webhook) */
  webhookUrl?: string;
  /** CORS origin (default: '*') */
  corsOrigin?: string;
}

/**
 * Creates the Express HTTP server.
 */
export function createExpressServer(options: ExpressServerOptions): Express {
  const {
    sessionManager,
    onUpstreamMessage,
    onCatalogsRegistered,
    webhookUrl,
    corsOrigin = '*',
  } = options;

  const app = express();

  // Middleware
  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-A2UI-Capabilities, X-A2UI-DataModel, X-A2UI-Session');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      sessions: sessionManager.getSessionCount(),
      timestamp: new Date().toISOString(),
    });
  });

  // SSE endpoint for clients to receive downstream messages
  app.get('/sse', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Generate session ID
    const sessionId = generateSessionId();

    // Create session
    const session = sessionManager.createSession(sessionId, {
      write: (data: string) => res.write(data),
      end: () => res.end(),
    });

    logger.info(`[Express] Client connected: ${sessionId}`);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ connected: true, sessionId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      logger.info(`[Express] Client disconnected: ${sessionId}`);

      // Inject synthetic __session_disconnected event before removal
      // so agents polling actions can observe the disconnect
      const disconnectEvent = {
        version: 'v0.9' as const,
        action: {
          name: '__session_disconnected',
          surfaceId: '__system',
          sourceComponentId: '__gateway',
          timestamp: new Date().toISOString(),
          context: { sessionId },
        },
      };
      // Enqueue into all OTHER sessions so agents observing those queues see it
      for (const s of sessionManager.getAllSessions()) {
        if (s.id !== sessionId) {
          sessionManager.enqueueAction(s.id, disconnectEvent as any);
        }
      }

      sessionManager.removeSession(sessionId);
    });

    // Keep-alive ping every 30 seconds
    const pingInterval = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(pingInterval);
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  // Endpoint for clients to send upstream messages
  app.post('/message', (req: Request, res: Response) => {
    try {
      const message = req.body as UpstreamMessage;
      const sessionId = req.headers['x-a2ui-session'] as string | undefined;

      if (!message) {
        res.status(400).json({ error: 'Missing message body' });
        return;
      }

      // Validate message structure (v0.9 protocol uses 'action' and 'error')
      if (!('action' in message) && !('error' in message)) {
        res.status(400).json({ error: 'Invalid message format' });
        return;
      }

      // Attach client data model from header (sendDataModel feature).
      // This allows the full data model to travel with the action through
      // the queue so the agent receives it via get_pending_actions.
      const dataModelHeader = req.headers['x-a2ui-datamodel'] as string | undefined;
      if (dataModelHeader && 'action' in message) {
        try {
          (message as unknown as Record<string, unknown>)['_clientDataModel'] = JSON.parse(decodeURIComponent(dataModelHeader));
        } catch {
          // Silently ignore malformed header
        }
      }

      logger.info(`[Express] Received upstream message: ${JSON.stringify(message)}`);

      // Resolve session: from header, or from surface→session mapping
      let resolvedSessionId = sessionId ?? null;
      if (!resolvedSessionId) {
        resolvedSessionId = sessionManager.enqueueActionBySurface(message);
      } else {
        sessionManager.enqueueAction(resolvedSessionId, message);
      }

      // Notify callback
      if (onUpstreamMessage) {
        onUpstreamMessage(resolvedSessionId, message);
      }

      // Forward to webhook (agent) if configured
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: resolvedSessionId,
            message,
          }),
        }).catch((err) => {
          logger.error('[Express] Webhook forward failed:', err);
        });
      }

      res.json({ success: true, sessionId: resolvedSessionId });
    } catch (error) {
      logger.error('[Express] Error processing message:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Register surface with session
  app.post('/register-surface', (req: Request, res: Response) => {
    const { sessionId, surfaceId } = req.body as {
      sessionId: string;
      surfaceId: string;
    };

    if (!sessionId || !surfaceId) {
      res.status(400).json({ error: 'Missing sessionId or surfaceId' });
      return;
    }

    const success = sessionManager.addSurface(sessionId, surfaceId);
    if (!success) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({ success: true });
  });

  // Send to a specific session (session-scoped alternative to /broadcast)
  app.post('/send', (req: Request, res: Response) => {
    try {
      const { sessionId, message } = req.body as { sessionId?: string; message?: unknown };

      if (!message) {
        res.status(400).json({ error: 'Missing message body' });
        return;
      }

      if (sessionId) {
        // Targeted send to one session
        const sent = sessionManager.sendToSession(sessionId, message as any);
        if (!sent) {
          // Fallback: try surface-based routing, then broadcast
          const surfaceId = extractSurfaceId(message);
          if (surfaceId) {
            const surfaceSent = sessionManager.sendToSurface(surfaceId, message as any);
            if (!surfaceSent) {
              logger.warn(`[Express] Session ${sessionId} not found, and surface ${surfaceId} not found`);
            }
          } else {
            logger.warn(`[Express] Session ${sessionId} not found, and no surfaceId provided`);
          }
        } else {
          // Also register surface→session mapping for createSurface
          const surfaceId = extractSurfaceId(message);
          if (surfaceId && typeof message === 'object' && message !== null && 'createSurface' in (message as any)) {
            sessionManager.addSurface(sessionId, surfaceId);
          }
          logger.info(`[Express] Sent message to session ${sessionId}`);
        }
      } else {
        // No session: try surface-based routing, then broadcast
        const surfaceId = extractSurfaceId(message);
        if (surfaceId) {
          const sent = sessionManager.sendToSurface(surfaceId, message as any);
          if (sent) {
            logger.info(`[Express] Sent message to surface ${surfaceId}`);
          } else {
            logger.warn('[Express] Surface not mapped');
          }
        } else {
          logger.warn('[Express] No session or surface specified');
        }
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('[Express] Error sending message:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });


  // Register catalogs endpoint - clients send their catalog schemas on connection
  app.post('/register-catalogs', (req: Request, res: Response) => {
    try {
      const { sessionId, catalogs: rawCatalogs } = req.body as {
        sessionId: string;
        catalogs: unknown[];
      };

      if (!sessionId) {
        res.status(400).json({ error: 'Missing sessionId' });
        return;
      }

      if (!Array.isArray(rawCatalogs) || rawCatalogs.length === 0) {
        res.status(400).json({ error: 'Missing or empty catalogs array' });
        return;
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Parse and validate each catalog
      const catalogs: Catalog[] = [];
      const errors: string[] = [];

      for (let i = 0; i < rawCatalogs.length; i++) {
        try {
          const catalog = parseCatalog(rawCatalogs[i]);
          catalogs.push(catalog);
        } catch (error) {
          errors.push(`Catalog ${i}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (catalogs.length === 0) {
        res.status(400).json({ error: 'No valid catalogs', details: errors });
        return;
      }

      // Store catalogs in session manager (session-scoped)
      sessionManager.registerCatalogs(sessionId, catalogs);

      // Notify callback
      if (onCatalogsRegistered) {
        onCatalogsRegistered(catalogs);
      }

      logger.info(`[Express] Registered ${catalogs.length} catalog(s) from session ${sessionId}`);
      res.json({
        success: true,
        registered: catalogs.map((c) => c.id),
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      logger.error('[Express] Error registering catalogs:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return app;
}

/**
 * Start the Express server.
 */
export function startExpressServer(
  app: Express,
  port: number = 3001
): Promise<void> {
  return new Promise((resolve) => {
    app.listen(port, () => {
      logger.info(`[Express] HTTP server listening on port ${port}`);
      logger.info(`[Express] SSE endpoint: http://localhost:${port}/sse`);
      logger.info(`[Express] Message endpoint: http://localhost:${port}/message`);
      resolve();
    });
  });
}

// =============================================================================
// Helpers
// =============================================================================

function generateSessionId(): string {
  return `session_${randomUUID()}`;
}

function extractSurfaceId(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;
  const msg = message as Record<string, any>;
  return (
    msg['createSurface']?.surfaceId ??
    msg['updateComponents']?.surfaceId ??
    msg['updateDataModel']?.surfaceId ??
    msg['deleteSurface']?.surfaceId ??
    null
  );
}
