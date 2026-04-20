/**
 * @fileoverview Example React Application using Freesail
 *
 * This example shows how to integrate Freesail into a React application
 * to enable AI agents to drive the UI using the A2UI v0.9 protocol.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {ReactUI} from 'freesail';
import { StandardCatalog } from '@freesail/standard-catalog';
import { ChatCatalog } from '@freesail/chat-catalog';
import { WeatherCatalog } from '@freesail-community/weather-catalog';

const CHAT_CATALOG_ID = ChatCatalog.namespace;

/**
 * Derive the gateway base URL.
 *
 * Priority order:
 *  1. VITE_GATEWAY_URL — full URL (https://api.myapp.com) or path prefix (/ or /api/gateway).
 *     Use a path prefix when the gateway is reverse-proxied onto the same domain as the UI.
 *     In that case the app uses relative-origin URLs (/sse, /message) and no CORS is needed.
 *  2. VITE_GATEWAY_PORT — same host as the UI, different port (e.g. 3001 in dev).
 *  3. Default: same host, port 3001.
 */
function getGatewayUrl(): string {
  const gatewayUrl = import.meta.env['VITE_GATEWAY_URL'] as string | undefined;

  if (gatewayUrl) {
    if (gatewayUrl.startsWith('/')) {
      // Path-prefix mode: reverse proxy on same domain.
      // Strip trailing slash so /sse appends cleanly.
      return `${window.location.protocol}//${window.location.host}${gatewayUrl.replace(/\/$/, '')}`;
    }
    // Full URL mode: different domain.
    return gatewayUrl.replace(/\/$/, '');
  }

  const port = import.meta.env['VITE_GATEWAY_PORT'] ?? '3001';
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}

const ALL_CATALOGS: ReactUI.CatalogDefinition[] = [
  StandardCatalog,
  ChatCatalog,
  WeatherCatalog,
];

const FONT_SCALES: Record<'normal' | 'large', Partial<ReactUI.FreesailThemeTokens>> = {
  normal: {},
  large: {
    typeCaption: 'clamp(12px, 1.2cqi, 14px)',
    typeLabel:   'clamp(13px, 1.4cqi, 16px)',
    typeBody:    'clamp(15px, 1.8cqi, 18px)',
    typeH5:      'clamp(15px, 1.8cqi, 18px)',
    typeH4:      'clamp(18px, 2.4cqi, 22px)',
    typeH3:      'clamp(20px, 3cqi, 26px)',
    typeH2:      'clamp(24px, 3.5cqi, 32px)',
    typeH1:      'clamp(28px, 4.5cqi, 42px)',
  },
};

// A custom hot-pink theme just to show overrides working
const customThemeProps: Partial<ReactUI.FreesailThemeTokens> = {
  primary: '#e11d48', // Rose 600
  primaryHover: '#be123c', // Rose 700
  bgRaised: '#fff1f2', // Rose 50
  radiusMd: '0px', // Square corners for demonstration
};

/**
 * Main App component.
 */
const MIN_CHAT_WIDTH = 260;
const MAX_CHAT_WIDTH = 700;
const DEFAULT_CHAT_WIDTH = 380;

function App() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'custom'>('light');
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');
  const [maxConcurrentSurfaces, setMaxConcurrentSurfaces] = useState(2);

  useEffect(() => {
    const t = setTimeout(() => setMaxConcurrentSurfaces(3), 2 * 60 * 1000);
    return () => clearTimeout(t);
  }, []);
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_CHAT_WIDTH);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = chatWidth;
    e.preventDefault();
  }, [chatWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      document.body.style.userSelect = 'none';
      const newWidth = startWidth.current + (e.clientX - startX.current);
      setChatWidth(Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, newWidth)));
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const baseTokens = themeMode === 'dark'   ? ReactUI.defaultDarkTokens
                   : themeMode === 'custom' ? { ...ReactUI.defaultLightTokens, ...customThemeProps }
                   :                          ReactUI.defaultLightTokens;
  const activeTheme = { ...baseTokens, ...FONT_SCALES[fontSize] };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <ReactUI.FreesailProvider
          theme={activeTheme}
          catalogs={ALL_CATALOGS}
          additionalCapabilities={{ agentLimits: { maxConcurrentSurfaces: maxConcurrentSurfaces } }}
          onConnectionChange={(connected) => {
            console.log('Connection status:', connected);
          }}
          onError={(error) => {
            console.error('Freesail error:', error);
          }}
          onBeforeCreateSurface={(_surfaceId, _catalogId, _sendDataModel, surfaceManager) => {
            // Count agent created surfaces only (exclude __chat which is created natively)
            const surfaces = surfaceManager.getAllSurfaces().filter(s => s.id !== '__chat');
            if (surfaces.length > maxConcurrentSurfaces) {
              console.warn('Too many surfaces:', surfaces);
              return { allowed: false, message: 'Surface limit reached. Please remove a surface before adding another surface.' };
            }
            return { allowed: true, message: '' };
          }}
        >
          <ChatBootstrapper />
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
            {/* Chat Surface — rendered by the agent via A2UI */}
            <div style={{ width: `${chatWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <ReactUI.FreesailSurface surfaceId="__chat" theme={{ ...ReactUI.defaultLightTokens, ...FONT_SCALES[fontSize] }}/>
            </div>

            {/* Drag Handle */}
              <div
                onMouseDown={onMouseDown}
                style={{
                  width: '2px',
                  cursor: 'col-resize',
                  background: 'var(--freesail-border, rgba(128,128,128,0.4))',
                  flexShrink: 0,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--freesail-primary, #3b82f6)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--freesail-border, rgba(128,128,128,0.4))')}
                tabIndex={0}
                aria-label="Resize chat panel"
              />

            {/* Main Content */}
            <div style={{
              flex: 1,
              padding: '20px',
              overflow: 'auto',
              backgroundColor: 'var(--freesail-bg-muted, #f8fafc)',
              color: 'var(--freesail-text-foreground, #0f172a)',
            }}>
              <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <h1 style={{ margin: 0, fontSize: '24px' }}>Freesail</h1>
                  <ConnectionIndicator />
                </div>
                
                {/* Theme Switcher Controls */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', background: 'var(--freesail-border, #e2e8f0)', padding: '4px', borderRadius: 'var(--freesail-radius-md)' }}>
                    <ThemeButton active={themeMode === 'light'} onClick={() => setThemeMode('light')}>Light</ThemeButton>
                    <ThemeButton active={themeMode === 'dark'} onClick={() => setThemeMode('dark')}>Dark</ThemeButton>
                    <ThemeButton active={themeMode === 'custom'} onClick={() => setThemeMode('custom')}>Custom (Rose)</ThemeButton>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', background: 'var(--freesail-border, #e2e8f0)', padding: '4px', borderRadius: 'var(--freesail-radius-md)' }}>
                    <ThemeButton active={fontSize === 'normal'} onClick={() => setFontSize('normal')}>A</ThemeButton>
                    <ThemeButton active={fontSize === 'large'} onClick={() => setFontSize('large')}>A+</ThemeButton>
                  </div>
                </div>
              </header>

              <main>
                <SurfaceList />
              </main>
            </div>
          </div>
      </ReactUI.FreesailProvider>
    </div>
  );
}

function ThemeButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      style={{
        padding: '6px 12px',
        border: 'none',
        borderRadius: 'var(--freesail-radius-sm)',
        background: active ? 'var(--freesail-bg-raised, #fff)' : 'transparent',
        color: active ? 'var(--freesail-text-foreground, #000)' : 'var(--freesail-text-secondary, #666)',
        boxShadow: active ? 'var(--freesail-shadow-sm)' : 'none',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: active ? '500' : 'normal',
      }}
    >
      {children}
    </button>
  );
}

// =============================================================================
// Components
// =============================================================================

/**
 * Initializes the __chat surface natively so the agent doesn't need to.
 */
function ChatBootstrapper() {
  const { surfaceManager } = ReactUI.useFreesailContext();

  useEffect(() => {
    // 1. Create the __chat surface bound to the chat catalog
    surfaceManager.createSurface({
      surfaceId: '__chat',
      catalogId: CHAT_CATALOG_ID,
      sendDataModel: false,
    });

    // 2. Send the component tree (flat adjacency list)
    surfaceManager.updateComponents('__chat', [
      {
        id: 'root',
        component: 'ChatContainer',
        title: 'Chat',
        height: '100%',
        children: ['message_list', 'agent_stream', 'typing', 'chat_input'],
      },
      {
        id: 'message_list',
        component: 'ChatMessageList',
        children: { componentId: 'msg_template', path: '/messages' },
      },
      {
        id: 'msg_template',
        component: 'ChatMessage',
        // Properties flow from scopeData (each message object in /messages)
        // Explicitly bind them to satisfy strict schema validation
        role: { path: 'role' },
        content: { path: 'content' },
        timestamp: { path: 'timestamp' },
      },
      {
        id: 'agent_stream',
        component: 'AgentStream',
        token: { path: '/stream/token' },
        active: { path: '/stream/active' },
      },
      {
        id: 'typing',
        component: 'ChatTypingIndicator',
        visible: { path: '/isTyping' },
        text: 'Thinking...',
      },
      {
        id: 'chat_input',
        component: 'ChatInput',
        placeholder: 'Type a message...',
      },
    ]);

    // 3. Set initial data model
    surfaceManager.updateDataModel('__chat', '/', { messages: [], isTyping: false, stream: { token: '', active: false } });
  }, [surfaceManager]);

  return null;
}

/**
 * Shows connection status.
 */
function ConnectionIndicator() {
  const { isConnected } = ReactUI.useConnectionStatus();
  const color = isConnected ? '#06b09fff' : '#ef4444'; // Green for connected, Red for offline

  return (
    <div
      aria-label={isConnected ? "Connected" : "Disconnected"}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', color }}
    >
      {isConnected ? (
        // Wifi On Symbol
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      ) : (
        // Wifi Off Symbol
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        </svg>
      )}
    </div>
  );
}

/**
 * Renders all active surfaces except __chat (which has its own panel).
 */
function SurfaceList() {
  const allSurfaces = ReactUI.useSurfaces();
  const surfaces = allSurfaces.filter((s) => s.id !== '__chat');

  if (surfaces.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {surfaces.map((surface) => (
        <div key={surface.id}>
          <ReactUI.FreesailSurface
            surfaceId={surface.id}
            className="surface-container"
          />
        </div>
      ))}
    </div>
  );
}

export default App;
