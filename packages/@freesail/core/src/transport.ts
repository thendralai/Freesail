/**
 * @fileoverview SSE Transport Layer
 *
 * Implements the Server-Sent Events client with auto-reconnect
 * and offline message queueing capabilities.
 */

import {
  A2UI_VERSION,
  type DownstreamMessage,
  type UpstreamMessage,
  type SurfaceId,
  type ComponentId,
  type A2UIClientCapabilities,
  type A2UIClientDataModel,
} from './protocol.js';
import { A2UIParser } from './parser.js';

/**
 * Transport connection states.
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

/**
 * Transport configuration options.
 */
export interface TransportOptions {
  /** SSE endpoint URL for receiving downstream messages */
  sseUrl: string;
  /** HTTP endpoint URL for sending upstream messages */
  postUrl: string;
  /** Client capabilities to announce on connection */
  capabilities?: A2UIClientCapabilities;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Reconnect delay multiplier (default: 2) */
  reconnectMultiplier?: number;
  /** Maximum number of queued messages (default: 100) */
  maxQueueSize?: number;
  /** Request timeout in ms (default: 30000) */
  requestTimeout?: number;
}

/**
 * Event types emitted by the transport.
 */
export interface TransportEvents {
  message: (message: DownstreamMessage) => void;
  dataStream: (surfaceId: SurfaceId, path: string, delta: string) => void;
  stateChange: (state: ConnectionState) => void;
  error: (error: Error) => void;
  queueFlushed: (count: number) => void;
  /** Emitted when the server assigns a session ID on connection */
  sessionStart: (sessionId: string) => void;
}

type EventCallback<K extends keyof TransportEvents> = TransportEvents[K];

const DEFAULT_OPTIONS: Required<Omit<TransportOptions, 'sseUrl' | 'postUrl' | 'capabilities'>> = {
  autoReconnect: true,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  reconnectMultiplier: 2,
  maxQueueSize: 100,
  requestTimeout: 30000,
};

/**
 * A2UI Transport Layer
 *
 * Manages the bi-directional communication between client and server:
 * - Downstream (Server → Client): SSE stream for receiving messages
 * - Upstream (Client → Server): HTTP POST for sending messages
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Offline message queueing with automatic flush on reconnect
 * - Event-based message handling
 * - Client capabilities handshake
 */
export class A2UITransport {
  private options: Required<Omit<TransportOptions, 'capabilities'>> & { capabilities?: A2UIClientCapabilities };
  private state: ConnectionState = 'disconnected';
  private eventSource: EventSource | null = null;
  private parser: A2UIParser;
  private messageQueue: UpstreamMessage[] = [];
  private currentReconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Map<keyof TransportEvents, Set<EventCallback<keyof TransportEvents>>> =
    new Map();
  private dataModelProviders: Map<SurfaceId, () => Record<string, unknown>> = new Map();
  private _sessionId: string | null = null;

  constructor(options: TransportOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.parser = new A2UIParser();
    this.currentReconnectDelay = this.options.reconnectDelay;
  }

  /**
   * Get the session ID assigned by the server.
   */
  get sessionId(): string | null {
    return this._sessionId;
  }

  /**
   * Register a data model provider for a surface.
   * Used when sendDataModel is enabled to get current state.
   */
  registerDataModelProvider(
    surfaceId: SurfaceId,
    provider: () => Record<string, unknown>
  ): void {
    this.dataModelProviders.set(surfaceId, provider);
  }

  /**
   * Unregister a data model provider.
   */
  unregisterDataModelProvider(surfaceId: SurfaceId): void {
    this.dataModelProviders.delete(surfaceId);
  }

  /**
   * Connect to the SSE stream.
   */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');

    try {
      this.eventSource = new EventSource(this.options.sseUrl);

      this.eventSource.onopen = () => {
        this.setState('connected');
        this.currentReconnectDelay = this.options.reconnectDelay;
        this.flushQueue();
      };

      this.eventSource.onmessage = (event) => {
        this.handleSSEMessage(event.data);
      };

      this.eventSource.addEventListener('data_stream', (event: any) => {
        this.handleDataStream(event.data);
      });

      this.eventSource.onerror = () => {
        this.handleDisconnect();
      };
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.handleDisconnect();
    }
  }

  /**
   * Disconnect from the SSE stream.
   */
  disconnect(): void {
    this.clearReconnectTimer();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setState('disconnected');
  }

  /**
   * Send an upstream message to the server.
   * If disconnected, the message is queued for later delivery.
   */
  async send(message: UpstreamMessage): Promise<boolean> {
    if (this.state !== 'connected') {
      return this.queueMessage(message);
    }

    return this.postMessage(message);
  }

  /**
   * Send an action message (v0.9 format).
   */
  async sendAction(
    surfaceId: SurfaceId,
    name: string,
    sourceComponentId: ComponentId,
    context: Record<string, unknown>,
    dataModel?: A2UIClientDataModel
  ): Promise<boolean> {
    const message: UpstreamMessage = {
      version: A2UI_VERSION,
      action: {
        name,
        surfaceId,
        sourceComponentId,
        timestamp: new Date().toISOString(),
        context,
      },
    };

    return this.postMessage(message, dataModel);
  }

  /**
   * Send an error message.
   */
  async sendError(
    surfaceId: SurfaceId,
    code: string,
    errorMessage: string,
    path?: string
  ): Promise<boolean> {
    const message: UpstreamMessage = {
      version: A2UI_VERSION,
      error: {
        code,
        message: errorMessage,
        surfaceId,
        path,
      },
    };

    return this.postMessage(message);
  }

  /**
   * Get the current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get the number of queued messages.
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Register catalog schemas with the gateway server.
   * Called after connecting to provide the server with catalog definitions.
   */
  async registerCatalogs(catalogs: unknown[]): Promise<boolean> {
    if (!this._sessionId) {
      this.emit('error', new Error('Cannot register catalogs: no session ID'));
      return false;
    }

    try {
      // Derive base URL from postUrl
      const baseUrl = new URL(this.options.postUrl).origin;
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.requestTimeout
      );

      const response = await fetch(`${baseUrl}/register-catalogs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this._sessionId,
          catalogs,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      this.emit(
        'error',
        error instanceof Error ? error : new Error(String(error))
      );
      return false;
    }
  }

  /**
   * Subscribe to transport events.
   */
  on<K extends keyof TransportEvents>(
    event: K,
    callback: TransportEvents[K]
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<keyof TransportEvents>);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback<keyof TransportEvents>);
    };
  }

  /**
   * Remove event listener.
   */
  off<K extends keyof TransportEvents>(
    event: K,
    callback: TransportEvents[K]
  ): void {
    this.listeners.get(event)?.delete(callback as EventCallback<keyof TransportEvents>);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', state);
    }
  }

  private emit<K extends keyof TransportEvents>(
    event: K,
    ...args: Parameters<TransportEvents[K]>
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          (callback as (...args: Parameters<TransportEvents[K]>) => void)(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  private handleSSEMessage(data: string): void {
    // Check for connection message (sent before protocol messages)
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && parsed.connected && parsed.sessionId) {
        this._sessionId = parsed.sessionId as string;
        this.emit('sessionStart', this._sessionId);
        return;
      }
    } catch {
      // Not a simple JSON object, continue with parser
    }

    const result = this.parser.parse(data);

    for (const message of result.messages) {
      // Auto-register surface→session mapping when we receive createSurface
      if ('createSurface' in message && this._sessionId) {
        const surfaceId = (message as Record<string, any>)['createSurface'].surfaceId;
        this.registerSurfaceWithGateway(surfaceId);
      }

      this.emit('message', message);
    }

    for (const error of result.errors) {
      this.emit('error', new Error(`Parse error: ${error.message}`));
    }
  }

  private handleDataStream(data: string): void {
     try {
       const parsed = JSON.parse(data);
       if (parsed && typeof parsed === 'object') {
          this.emit('dataStream', parsed.s as SurfaceId, parsed.p as string, parsed.d as string);
       }
     } catch (err) {
       console.error('[Transport] Failed to parse data_stream event', err);
     }
  }

  /**
   * Register a surface with the gateway so it knows which session owns it.
   */
  private async registerSurfaceWithGateway(surfaceId: string): Promise<void> {
    if (!this._sessionId) return;
    try {
      const baseUrl = new URL(this.options.postUrl).origin;
      await fetch(`${baseUrl}/register-surface`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this._sessionId,
          surfaceId,
        }),
      });
    } catch (error) {
      console.error('[Transport] Failed to register surface:', error);
    }
  }

  private handleDisconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this._sessionId = null;
    this.parser.reset();

    if (this.options.autoReconnect && this.state !== 'disconnected') {
      this.setState('reconnecting');
      this.scheduleReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      this.connect();

      // Exponential backoff
      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * this.options.reconnectMultiplier,
        this.options.maxReconnectDelay
      );
    }, this.currentReconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private queueMessage(message: UpstreamMessage): boolean {
    if (this.messageQueue.length >= this.options.maxQueueSize) {
      this.emit('error', new Error('Message queue full, dropping message'));
      return false;
    }

    this.messageQueue.push(message);
    return true;
  }

  private async flushQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    let flushedCount = 0;

    for (const message of messages) {
      const success = await this.postMessage(message);
      if (success) {
        flushedCount++;
      } else {
        // Re-queue failed messages
        this.messageQueue.push(message);
      }
    }

    if (flushedCount > 0) {
      this.emit('queueFlushed', flushedCount);
    }
  }

  private async postMessage(
    message: UpstreamMessage,
    dataModel?: A2UIClientDataModel
  ): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.requestTimeout
      );

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add session ID so gateway can route actions to correct session
      if (this._sessionId) {
        headers['X-A2UI-Session'] = this._sessionId;
      }

      // Add capabilities if configured
      if (this.options.capabilities) {
        headers['X-A2UI-Capabilities'] = JSON.stringify(this.options.capabilities);
      }

      // Add data model if provided (sendDataModel feature)
      if (dataModel) {
        // Encode to ensure header is ISO-8859-1 compliant (handles emojis/utf-8)
        headers['X-A2UI-DataModel'] = encodeURIComponent(JSON.stringify(dataModel));
      }

      const response = await fetch(this.options.postUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      this.emit(
        'error',
        error instanceof Error ? error : new Error(String(error))
      );
      return false;
    }
  }
}

/**
 * Create a new transport instance.
 */
export function createTransport(options: TransportOptions): A2UITransport {
  return new A2UITransport(options);
}
