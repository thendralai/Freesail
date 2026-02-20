/**
 * @fileoverview Example React Application using Freesail
 *
 * This example shows how to integrate Freesail into a React application
 * to enable AI agents to drive the UI using the A2UI v0.9 protocol.
 */

import React, { useState } from 'react';
import {ReactUI} from 'freesail';
import {ChatCatalog, StandardCatalog} from '@freesail/catalogs';
import { WeatherCatalog } from '@freesail-community/weathercatalog';

const ALL_CATALOGS: ReactUI.CatalogDefinition[] = [
  ChatCatalog,
  StandardCatalog,
  WeatherCatalog,
];

// A custom hot-pink theme just to show overrides working
const customThemeProps: Partial<ReactUI.A2UIThemeTokens> = {
  primary: '#e11d48', // Rose 600
  primaryHover: '#be123c', // Rose 700
  bgSurface: '#fff1f2', // Rose 50
  radiusMd: '0px', // Square corners for demonstration
};

/**
 * Main App component.
 */
function App() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'custom'>('light');

  const activeTheme = themeMode === 'custom' ? customThemeProps : themeMode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <ReactUI.A2UIThemeProvider theme={activeTheme}>
        <ReactUI.FreesailProvider
          sseUrl="http://localhost:3001/sse"
          postUrl="http://localhost:3001/message"
          catalogDefinitions={ALL_CATALOGS}
          onConnectionChange={(connected) => {
            console.log('Connection status:', connected);
          }}
          onError={(error) => {
            console.error('Freesail error:', error);
          }}
        >
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
            {/* Chat Surface — rendered by the agent via A2UI */}
            <div style={{ width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <ReactUI.FreesailSurface surfaceId="__chat" />
            </div>

            {/* Main Content */}
            <div style={{
              flex: 1,
              padding: '20px',
              overflow: 'auto',
              backgroundColor: 'var(--freesail-bg-muted, #f8fafc)',
              color: 'var(--freesail-text-main, #0f172a)',
            }}>
              <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <h1 style={{ margin: 0, fontSize: '24px' }}>Freesail Demo</h1>
                  <ConnectionIndicator />
                </div>
                
                {/* Theme Switcher Controls */}
                <div style={{ display: 'flex', gap: '8px', background: 'var(--freesail-border, #e2e8f0)', padding: '4px', borderRadius: 'var(--freesail-radius-md)' }}>
                  <ThemeButton active={themeMode === 'light'} onClick={() => setThemeMode('light')}>Light</ThemeButton>
                  <ThemeButton active={themeMode === 'dark'} onClick={() => setThemeMode('dark')}>Dark</ThemeButton>
                  <ThemeButton active={themeMode === 'custom'} onClick={() => setThemeMode('custom')}>Custom (Rose)</ThemeButton>
                </div>
              </header>

              <main>
                <SurfaceList />
              </main>
            </div>
          </div>
        </ReactUI.FreesailProvider>
      </ReactUI.A2UIThemeProvider>
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
        background: active ? 'var(--freesail-bg-surface, #fff)' : 'transparent',
        color: active ? 'var(--freesail-text-main, #000)' : 'var(--freesail-text-muted, #666)',
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
 * Shows connection status.
 */
function ConnectionIndicator() {
  const { isConnected } = ReactUI.useConnectionStatus();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: isConnected ? '#0f0' : '#f00',
        }}
      />
      <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
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
