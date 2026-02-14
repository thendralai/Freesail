/**
 * @fileoverview Example React Application using Freesail
 *
 * This example shows how to integrate Freesail into a React application
 * to enable AI agents to drive the UI using the A2UI v0.9 protocol.
 */

import React, { useState, useMemo } from 'react';
import {
  FreesailProvider,
  FreesailSurface,
  useSurfaces,
  useConnectionStatus,
} from '@freesail/react';
import type { CatalogDefinition } from '@freesail/react';
import { StandardCatalog } from '@freesail/standard-catalog';
import { WeatherCatalog } from '@freesail/weather-catalog';
import { ChatCatalog } from '@freesail/chat-catalog';

/**
 * All available catalogs the user can choose from.
 */
const AVAILABLE_CATALOGS: { id: string; label: string; description: string; definition: CatalogDefinition }[] = [
  {
    id: StandardCatalog.namespace,
    label: 'Standard',
    description: 'Layout, text, buttons, inputs, images',
    definition: StandardCatalog,
  },
  {
    id: WeatherCatalog.namespace,
    label: 'Weather',
    description: 'Weather cards, forecasts, alerts, gauges',
    definition: WeatherCatalog,
  },
];

/**
 * Main App component.
 *
 * Renders a catalog selector above the FreesailProvider so the user
 * can choose which catalogs to send to the gateway. Changing the
 * selection remounts the provider (reconnects with new catalogs).
 */
function App() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(AVAILABLE_CATALOGS.map((c) => c.id))
  );

  const selectedDefinitions = useMemo(
    () => [
      ChatCatalog, // Always included — required for the __chat surface
      ...AVAILABLE_CATALOGS.filter((c) => selectedIds.has(c.id)).map((c) => c.definition),
    ],
    [selectedIds]
  );

  // Use the serialised set as a key so the provider remounts on change
  const providerKey = useMemo(() => Array.from(selectedIds).sort().join(','), [selectedIds]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Catalog selector bar */}
      <CatalogSelector selectedIds={selectedIds} onChange={setSelectedIds} />

      {/* Provider remounts when providerKey changes */}
      <FreesailProvider
        key={providerKey}
        sseUrl="http://localhost:3001/sse"
        postUrl="http://localhost:3001/message"
        catalogDefinitions={selectedDefinitions}
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
            <FreesailSurface surfaceId="__chat" />
          </div>

          {/* Main Content */}
          <div style={{
            flex: 1,
            padding: '20px',
            overflow: 'auto',
            backgroundColor: '#f5f5f5',
          }}>
            <header style={{ marginBottom: '20px' }}>
              <h1 style={{ margin: 0, fontSize: '24px' }}>Freesail Demo</h1>
              <ConnectionIndicator />
            </header>

            <main>
              <SurfaceList />
            </main>
          </div>
        </div>
      </FreesailProvider>
    </div>
  );
}

// =============================================================================
// Catalog Selector
// =============================================================================

function CatalogSelector({
  selectedIds,
  onChange,
}: {
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      // Don't allow deselecting all
      if (next.size <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 16px',
      borderBottom: '1px solid #e0e0e0',
      backgroundColor: '#fff',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>
        Catalogs
      </span>
      {AVAILABLE_CATALOGS.map((cat) => {
        const active = selectedIds.has(cat.id);
        return (
          <button
            key={cat.id}
            onClick={() => toggle(cat.id)}
            title={cat.description}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              fontSize: '13px',
              border: active ? '1.5px solid #007bff' : '1.5px solid #ccc',
              borderRadius: '16px',
              backgroundColor: active ? '#e7f1ff' : '#fff',
              color: active ? '#007bff' : '#666',
              cursor: 'pointer',
              fontWeight: active ? 600 : 400,
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: active ? '#007bff' : '#ccc',
              flexShrink: 0,
            }} />
            {cat.label}
          </button>
        );
      })}
      <span style={{ fontSize: '11px', color: '#999', marginLeft: 'auto' }}>
        {selectedIds.size} of {AVAILABLE_CATALOGS.length} active
      </span>
    </div>
  );
}

/**
 * Shows connection status.
 */
function ConnectionIndicator() {
  const { isConnected } = useConnectionStatus();

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
  const allSurfaces = useSurfaces();
  const surfaces = allSurfaces.filter((s) => s.id !== '__chat');

  if (surfaces.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {surfaces.map((surface) => (
        <div key={surface.id}>
          <FreesailSurface
            surfaceId={surface.id}
            className="surface-container"
          />
        </div>
      ))}
    </div>
  );
}

export default App;

/*
 * ============================================================================
 * EXAMPLE: How an AI Agent drives UI via MCP (A2UI Protocol v0.9)
 * ============================================================================
 *
 * All messages include `version: "v0.9"` when sent over the wire.
 *
 * 1. Create a surface with sendDataModel enabled:
 *    {
 *      "name": "create_surface",
 *      "arguments": {
 *        "surfaceId": "welcome_card",
 *        "catalogId": "https://a2ui.dev/specification/v0_9/standard_catalog.json",
 *        "sendDataModel": true,
 *        "rootComponent": {
 *          "id": "root",
 *          "type": "Column",
 *          "props": { "gap": "16", "padding": "24" },
 *          "children": [
 *            {
 *              "id": "title",
 *              "type": "Text",
 *              "props": { "content": "# Welcome!", "variant": "heading" }
 *            },
 *            {
 *              "id": "message",
 *              "type": "Text",
 *              "props": { "content": "This UI was generated by an AI agent." }
 *            },
 *            {
 *              "id": "actions",
 *              "type": "Row",
 *              "props": { "gap": "12" },
 *              "children": [
 *                {
 *                  "id": "btn_learn",
 *                  "type": "Button",
 *                  "props": {
 *                    "label": "Learn More",
 *                    "variant": "secondary",
 *                    "action": {
 *                      "event": {
 *                        "name": "learn_more_click",
 *                        "context": { "section": "intro" }
 *                      }
 *                    }
 *                  }
 *                },
 *                {
 *                  "id": "btn_start",
 *                  "type": "Button",
 *                  "props": {
 *                    "label": "Get Started",
 *                    "variant": "primary",
 *                    "action": {
 *                      "event": {
 *                        "name": "get_started_click"
 *                      }
 *                    }
 *                  }
 *                }
 *              ]
 *            }
 *          ]
 *        }
 *      }
 *    }
 *
 * 2. Create a surface with data binding:
 *    {
 *      "name": "create_surface",
 *      "arguments": {
 *        "surfaceId": "user_form",
 *        "catalogId": "https://a2ui.dev/specification/v0_9/standard_catalog.json",
 *        "sendDataModel": true,
 *        "rootComponent": {
 *          "id": "root",
 *          "type": "Column",
 *          "props": { "gap": "12" },
 *          "children": [
 *            {
 *              "id": "name_field",
 *              "type": "TextField",
 *              "props": {
 *                "label": "Name",
 *                "value": { "path": "/user/name" }
 *              }
 *            },
 *            {
 *              "id": "email_field",
 *              "type": "TextField",
 *              "props": {
 *                "label": "Email",
 *                "value": { "path": "/user/email" }
 *              }
 *            },
 *            {
 *              "id": "submit_btn",
 *              "type": "Button",
 *              "props": {
 *                "label": "Submit",
 *                "action": { "event": { "name": "submit_form" } }
 *              }
 *            }
 *          ]
 *        },
 *        "dataModel": {
 *          "user": { "name": "Alice", "email": "alice@example.com" }
 *        }
 *      }
 *    }
 *
 * 3. Update data model (JSON Patch, no 'op' wrapper):
 *    {
 *      "name": "update_data_model",
 *      "arguments": {
 *        "surfaceId": "user_form",
 *        "patch": [
 *          { "op": "replace", "path": "/user/name", "value": "Alice Smith" }
 *        ]
 *      }
 *    }
 *
 * 4. Create a list with ChildList template:
 *    {
 *      "name": "create_surface",
 *      "arguments": {
 *        "surfaceId": "task_list",
 *        "catalogId": "https://a2ui.dev/specification/v0_9/standard_catalog.json",
 *        "sendDataModel": true,
 *        "rootComponent": {
 *          "id": "root",
 *          "type": "List",
 *          "props": { "gap": "8" },
 *          "children": {
 *            "componentId": "task_item",
 *            "path": "/tasks"
 *          }
 *        },
 *        "dataModel": {
 *          "tasks": [
 *            { "id": "1", "title": "Learn A2UI", "done": true },
 *            { "id": "2", "title": "Build an agent", "done": false }
 *          ]
 *        }
 *      }
 *    }
 *
 * When the user clicks a button, the client sends an action message:
 *    {
 *      "version": "v0.9",
 *      "type": "action",
 *      "action": {
 *        "name": "get_started_click",
 *        "surfaceId": "welcome_card",
 *        "sourceComponentId": "btn_start",
 *        "timestamp": 1704067200000,
 *        "context": {}
 *      },
 *      "dataModel": { ... }  // Included if sendDataModel was true
 *    }
 *
 * The agent receives this and can respond with more UI updates!
 */
