# **Freesail Architecture Overview**

## **1\. Executive Summary**

Freesail is a Generative UI SDK that enables AI Agents to drive user interfaces across any frontend framework (React, Angular, Legacy). It achieves this by decoupling the **Agent** (Brain) from the **Client** (Renderer) using the **Model Context Protocol (MCP)** and the **A2UI Protocol**.

The core philosophy is **"Headless & Contract-First"**. The system relies on a strict JSON schema (catalog.json) to define the UI capabilities, ensuring the Agent never "hallucinates" invalid UI components.

## **2\. The "Triangle Pattern" Architecture**

Freesail operates on a three-node architecture that separates control logic from data streaming.

### **Node A: The Agent (Orchestrator)**

* **Role:** The intelligence layer (LangChain, LlamaIndex, Claude).  
* **Interface:** Connects to Freesail via **MCP (HTTP SSE)**.  
* **Responsibility:** Decides *what* to show. It calls atomic tools like create\_surface and update\_components. It does NOT generate raw HTML or React code; it generates structured JSON data based on the Catalog.

### **Node B: The Freesail Gateway (Bridge)**

* **Role:** The translation and streaming engine.  
* **Interface:** Exposes an MCP Server (Port 3000\) to the Agent and an HTTP SSE Stream (Port 3001\) to the Client.  
* **Responsibility:**  
  * **Catalog Injection:** Loads catalog.json and injects it into the Agent's system prompt so the Agent knows valid inputs.  
  * **Validation:** Validates Agent tool calls against the Catalog schema.  
  * **Streaming:** Pushes validated A2UI payloads to the Client via Server-Sent Events (SSE).

### **Node C: The Frontend (Renderer)**

* **Role:** The presentation layer (React, Web Components).  
* **Interface:** Connects to Freesail Server via HTTP SSE.  
* **Responsibility:**  
  * **Rendering:** Maps the incoming A2UI JSON tree to actual React components using a **Registry**.  
  * **State Management:** Maintains the local Data Model and handles user interactions.  
  * **Resilience:** Queues user actions if the network drops and retries automatically.

## **3\. The A2UI Protocol (Agent-to-User Experience)**

This specification adheres to the A2UI v0.9 Schema.

### **Downstream (Server \-\> Client) via SSE**

These messages allow the Agent to drive the UI.

| **Message** | **Description** | **Example** |
| :--- | :--- | :--- |
| **`createSurface`** | Initializes a UI container. | `{"createSurface": {"surfaceId": "main", ...}}` |
| **`updateComponents`** | Streams a tree of UI components. | `{"updateComponents": {"surfaceId": "main", ...}}` |
| **`updateDataModel`** | Pushes atomic data updates (JSON Patch). | `{"updateDataModel": {"surfaceId": "main", "path": "/price", "value": 100}}` |
| **`deleteSurface`** | Explicitly removes a surface. | `{"deleteSurface": {"surfaceId": "main"}}` |

#### The High-Speed Data Stream (Fast Path)
For generative text (like streaming LLM tokens into a text box or markdown renderer), Freesail uses a custom, minified SSE event type. This bypasses the heavy `updateDataModel` JSON patching logic and performs a direct string append in the state engine.

| **Event** | **Description** | **Example Payload** |
| :--- | :--- | :--- |
| **`data_stream`** | Directly appends a text delta to a specific JSON path in the Data Model. | `event: data_stream\ndata: {"s": "main", "p": "/draft", "d": "Hello"}` |

### Upstream (Client -> Server) via HTTP POST**

These messages allow the User to drive the Agent. Conforms to client\_to\_server.json (A2UI v0.9).

| Message Key | Description | Example |
| :---- | :---- | :---- |
| **action** | Reports a user interaction or event. Includes `sourceComponentId`. | {"version": "v0.9", "type": "action", "action": {"name": "submit", "surfaceId": "form", "sourceComponentId": "btn-1", "context": {...}}} |
| **error** | Reports a client-side validation or runtime error. | {"version": "v0.9", "type": "error", "error": {"code": "VALIDATION\_FAILED", "message": "..."}} |

#### **Data Model Submission (v0.9 sendDataModel)**

When a surface is created with `sendDataModel: true`, the client includes the full data model state with action messages:

```json
{
  "version": "v0.9",
  "type": "action",
  "action": {
    "name": "submit_form",
    "surfaceId": "checkout",
    "sourceComponentId": "submit-btn",
    "timestamp": 1704067200000,
    "context": {}
  },
  "dataModel": {
    "items": [...],
    "total": 99.99
  }
}
```

## **4\. Directory Structure & Key Files**

### **/packages/core**

* **Purpose:** Pure TypeScript logic for the Client. No UI framework dependencies.  
* **Key Files:**  
  * protocol.ts: TypeScript definitions for the A2UI messages.  
  * parser.ts: logic to parse incoming JSON streams and handle partial chunks.  
  * transport.ts: The SSE Client implementation with auto-reconnect and offline queueing.

### **/packages/react**

* **Purpose:** The React implementation of the Renderer.  
* **Key Files:**  
  * catalogs/: The folder containing catalog.json and the corresponding React components.  
  * components/FreesailSurface.tsx: The main container component that users drop into their app.  
  * hooks/useFreesail.ts: Hooks for accessing the data model state.

### **/packages/gateway**

* **Purpose:** The Node.js server that bridges Agents and Clients.  
* **Key Files:**  
  * mcp.ts: The MCP Server implementation defining tools like create\_surface.  
  * express.ts: The HTTP server handling the SSE stream for the browser.  
  * session.ts: Client session management with capability storage.  
  * converter.ts: Logic to convert catalog.json into MCP Tool schemas.

## **5\. Key Engineering Concepts**

### **Schema-First Development**

We do not write code first. We write the **Contract** (catalog.json) first.

1. Define a component (e.g., Ticker) in catalog.json.  
2. The Agent *immediately* sees a new tool: render\_ticker.  
3. The React Developer implements Ticker.tsx using withCatalog(catalog, 'Ticker').  
   This ensures the Agent and the UI never drift out of sync.

### **Stateless Agent / Stateful Client**

The AI Agent is treated as stateless. It does not remember the history of every UI update.

* **Client Responsibility:** The Client holds the "Truth" (the Data Model).  
* **Sync:** Every time the user acts (action), the Client sends the **Full Relevant Context** back to the Agent.