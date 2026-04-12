# @freesail/react

React bindings for Freesail — connects your React app to a Freesail gateway and renders agent-driven UI surfaces.

## Installation

```bash
npm install @freesail/react @freesail/standard-catalog
```

## Quick Start

```tsx
import { FreesailProvider, FreesailSurface } from '@freesail/react';
import { standardCatalogComponents, standardCatalogFunctions } from '@freesail/standard-catalog';
import standardCatalogSchema from '@freesail/standard-catalog/dist/standard-catalog.json';

function App() {
  return (
    <FreesailProvider
      gateway="http://localhost:3001"
      catalogs={[{
        namespace: 'https://your-catalog-id/catalogs/your-catalog.json',
        components: standardCatalogComponents,
        functions: standardCatalogFunctions,
        schema: standardCatalogSchema,
      }]}
    >
      <FreesailSurface surfaceId="main" />
    </FreesailProvider>
  );
}
```

## Components

### `FreesailProvider`

Root provider that manages the gateway connection and surface state. Must wrap all `FreesailSurface` components.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `gateway` | `string` | Yes | Base gateway URL (e.g. `http://localhost:3001`) |
| `catalogs` | `CatalogDefinition[]` | No | Catalogs to register with the provider |
| `transportOptions` | `object` | No | Additional transport configuration |
| `additionalCapabilities` | `Record<string, unknown>` | No | Extra capability key/values advertised to the agent |
| `onConnectionChange` | `(connected: boolean) => void` | No | Called when connection state changes |
| `onError` | `(error: Error) => void` | No | Called when a transport error occurs |
| `onBeforeCreateSurface` | interceptor | No | Called before honouring an agent `createSurface` — return `{ allowed: false }` to block |
| `onBeforeUpdateComponents` | interceptor | No | Called before honouring an agent `updateComponents` — return `{ allowed: false }` to block |
| `onBeforeUpdateDataModel` | interceptor | No | Called before honouring an agent `updateDataModel` — return `{ allowed: false }` to block |
| `onBeforeDeleteSurface` | interceptor | No | Called before honouring an agent `deleteSurface` — return `{ allowed: false }` to block |

### `FreesailSurface`

Renders a single agent-driven surface. Subscribes to updates automatically.

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `surfaceId` | `string` | Yes | The surface ID to render |
| `className` | `string` | No | CSS class for the container element |
| `loading` | `ReactNode` | No | Shown while the surface has not yet been created by the agent |
| `error` | `ReactNode` | No | Shown when the catalog is not registered |
| `empty` | `ReactNode` | No | Shown when the surface exists but has no components |

## Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useSurface(surfaceId)` | `Surface \| undefined` | Subscribe to a surface and re-render on updates |
| `useSurfaceData(surfaceId, path?)` | `T \| undefined` | Read a value from the surface data model at an optional JSON Pointer path |
| `useAction(surfaceId)` | `dispatch` | Returns a function to send user actions upstream |
| `useConnectionStatus()` | `{ isConnected }` | Current gateway connection state |
| `useSurfaces()` | `Surface[]` | All active surfaces |
| `useSessionId()` | `string \| null` | Session ID assigned by the gateway after connection |

## Interceptors

Each `onBefore*` prop lets you validate or block agent operations before they are applied. Return `{ allowed: false, message: '...' }` to block — the message is sent back to the agent as an error. Return `{ allowed: true, message: '...' }` to allow and also notify the agent with a validation message.

```tsx
<FreesailProvider
  gateway="http://localhost:3001"
  catalogs={[...]}
  onBeforeCreateSurface={(_surfaceId, _catalogId, _sendDataModel, surfaceManager) => {
    if (surfaceManager.getAllSurfaces().length >= 3) {
      return { allowed: false, message: 'Surface limit reached. Please remove a surface first.' };
    }
    return { allowed: true, message: '' };
  }}
  onBeforeUpdateComponents={(surfaceId, components, surfaceManager) => {
    if (components.length > 50) {
      return { allowed: false, message: 'Too many components' };
    }
    return { allowed: true, message: '' };
  }}
>
  ...
</FreesailProvider>
```

## License

MIT — see [LICENSE](./LICENSE)
