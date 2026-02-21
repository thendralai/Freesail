# Freesail Developer Guide: Building Generative UI Applications

This guide focuses on how to implement **Generative UI (GenUI)** in your React applications using the **Freesail SDK**. You'll learn how to allow an AI agent to dynamically drive your user interface by leveraging existing component catalogs.

---

## 1. Core Concept

Freesail functions as a bridge between an **AI Agent** (the brain) and your **Frontend Application**. Instead of the agent just sending text, it sends high-level UI descriptions using the **A2UI Protocol**. Your application then renders these components inside predefined "Surfaces."

The implementation involves two main parts:
1.  **Frontend (React)**: Hosting the surfaces and providing the catalogs.
2.  **AI Agent**: Using MCP tools to create and update UI components within those surfaces.

---

## 2. Setting Up the React Application

To enable GenUI, you need to configure the Freesail environment and define where the AI is allowed to render.

### Install the SDK
```bash
npm install freesail @freesail/catalogs
```

### Configure the FreesailProvider
The `FreesailProvider` (exported via `ReactUI`) manages the connection to your AI agent gateway and handles the registration of available component catalogs.

```tsx
import { ReactUI } from 'freesail';
import { StandardCatalog, ChatCatalog } from '@freesail/catalogs';

// Define which catalogs the agent is allowed to use
const CATALOGS: ReactUI.CatalogDefinition[] = [
  StandardCatalog,
  ChatCatalog,
];

function App() {
  return (
    <ReactUI.FreesailProvider
      sseUrl="http://localhost:3001/sse"
      postUrl="http://localhost:3001/message"
      catalogDefinitions={CATALOGS}
    >
      <MainLayout />
    </ReactUI.FreesailProvider>
  );
}
```

### Adding Surfaces
A `FreesailSurface` is a designated area in your layout that the AI agent can control. You identify surfaces by a `surfaceId`.

### Surface Naming Conventions
When defining or creating surfaces, the following rules apply:
1. **Agent-created surfaces**: Must contain only alphanumeric characters. Agents can create (`create_surface`), update (`update_components`, `update_data_model`), and delete (`delete_surface`) these dynamically.
2. **Client-managed surfaces**: Must start with a double underscore (`__`) and contain alphanumeric characters afterward (e.g., `__chat` or `__sidebar`). These surfaces are managed strictly by the client application.
3. **Agent restrictions on client-managed surfaces**: Agents are *not* permitted to create, delete, or update the component structure of client-managed surfaces. They are restricted exclusively to sending `updateDataModel` messages to these surfaces.

```tsx
import { ReactUI } from 'freesail';

function MainLayout() {
  return (
    <div className="app-container">
      {/* A client-managed surface, managed by the React app (starting with __) */}
      <aside className="sidebar">
        <ReactUI.FreesailSurface surfaceId="__chat" />
      </aside>

      {/* A standard agent-created surface area (alphanumeric only) */}
      <main className="content">
        <ReactUI.FreesailSurface surfaceId="workspace" />
      </main>
    </div>
  );
}
```


---

## 3. How the Agent Drives the UI

The AI agent does not "write code" for your frontend. Instead, it uses **MCP Tools** to manipulate components defined in the catalogs you've provided.

### Creating a Surface
The agent starts by claiming a surface and specifying which catalog to use for it.

```typescript
// Agent call to initialize a surface
await mcp.callTool("create_surface", {
  surfaceId: "workspace",
  catalogId: "https://a2ui.dev/specification/v0_9/standard_catalog.json",
  sessionId: "session_abc123" // The unique session for this specific user
});
```

---

## 4. Driving Interactivity (Data Models)

GenUI applications use **Data Models** to sync state between the agent and the UI efficiently.

### Using Data Binding
The agent can bind component properties to the `dataModel`. This allows the UI to update automatically whenever the data changes.

```typescript
// Agent sets up a surface with linked data
await mcp.callTool("create_surface", {
  surfaceId: "ticker",
  catalogId: "...",
  rootComponent: {
    id: "price_display",
    component: "Text",
    props: { 
      content: { path: "/currentPrice" } // Binds to dataModel
    }
  },
  dataModel: {
    currentPrice: "$150.00"
  }
});
```

### Pushing Real-Time Updates
To update the UI without re-sending the entire component tree, the agent simply updates the data model.

```typescript
// Agent updates only the data; the UI reflects this instantly
await mcp.callTool("update_data_model", {
  surfaceId: "ticker",
  patch: [
    { op: "replace", path: "/currentPrice", value: "$155.50" }
  ]
});
```

---

## 5. Handling User Actions

When a user interacts with a component (e.g., clicks a button), the SDK sends an **Action** back to the agent.

1.  **UI Event**: The user clicks a button in the browser.
2.  **Action Payload**: Freesail sends a message to the agent containing the action name and the current state of the `dataModel`.
3.  **Agent Response**: The agent processes the action (e.g., performing a calculation) and responds by updating the UI or data model.

```json
{
  "type": "action",
  "name": "analyze_click",
  "surfaceId": "workspace",
  "dataModel": { ... }
}
```

---

## 6. Protocol Details & Debugging

For developers debugging network traffic or implementing custom Gateways, understanding how Freesail manages sessions is critical.

### Session Identification
Every connection is assigned a unique `sessionId` by the Gateway.
*   **Discovery**: When the React app connects to the SSE stream, the first message it receives contains the `sessionId`.
*   **Upstream Routing**: The React SDK automatically attaches this ID to every HTTP POST request in the **`X-A2UI-Session`** header.
*   **Agent Awareness**: The agent receives this `sessionId` in the `context` of the synthetic `__session_connected` action.

### Monitoring Actions
If your agent is not receiving updates, check the browser's Network tab for requests to `/message`. Verify that:
1.  The `X-A2UI-Session` header matches the ID the agent is expecting.
2.  The `X-A2UI-DataModel` header is present (if `sendDataModel` is enabled), which contains the encoded state of the UI.

---

## 7. Best Practices

*   **Surface Isolation**: Use different `surfaceId`s for different logical parts of your app (e.g., `sidebar`, `main`).
*   **Data-Driven UI**: Prefer `update_data_model` for high-frequency updates (like progress bars or live data) to keep the interaction smooth.
*   **Catalog Selection**: Only provide the catalogs necessary for a specific surface to keep the agent's "understanding" focused.
