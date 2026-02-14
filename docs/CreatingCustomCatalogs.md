# Creating Custom Catalogs

This guide explains how to create a custom catalog of UI components and register them with the Freesail SDK.

## Overview

A **catalog** in Freesail bundles a JSON schema (describing available components and their properties) with concrete React implementations of those components. By creating a custom catalog you can extend the UI vocabulary that Freesail agents can use to build interfaces.

## 1. Define Your Schema

Create a `catalog.json` file that describes every component your catalog provides, including its properties and children.

```json
{
  "$id": "https://example.com/myown_catalog_v1.json",
  "title": "My Own Catalog",
  "components": {
    "MyCustomCard": {
      "description": "A custom card component",
      "properties": {
        "title":    { "type": "string", "description": "Card title" },
        "subtitle": { "type": "string", "description": "Card subtitle" },
        "imageUrl": { "type": "string", "description": "Hero image URL" }
      },
      "children": "allowed"
    }
  }
}
```

## 2. Create React Components

Write a standard React component that implements `FreesailComponentProps`. The `component` object passed as a prop contains all property values sent by the agent.

```tsx
// components/MyCustomCard.tsx
import React from 'react';
import type { FreesailComponentProps } from '@freesail/react';

export function MyCustomCard({ component, children }: FreesailComponentProps) {
  const title    = component['title'] as string | undefined;
  const subtitle = component['subtitle'] as string | undefined;
  const imageUrl = component['imageUrl'] as string | undefined;

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 8, overflow: 'hidden' }}>
      {imageUrl && <img src={imageUrl} alt={title} style={{ width: '100%' }} />}
      <div style={{ padding: 16 }}>
        {title && <h3>{title}</h3>}
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
```

## 3. (Optional) Bind with `withCatalog`

You can use the `withCatalog` higher-order function to register a component imperatively. This is useful when you want auto-registration on import.

```tsx
import { withCatalog } from '@freesail/react';
import { MyCustomCard as MyCustomCardImpl } from './components/MyCustomCard';

const CATALOG_ID = 'https://example.com/myown_catalog_v1.json';

export const MyCustomCard = withCatalog(CATALOG_ID, 'MyCustomCard', MyCustomCardImpl);
```

## 4. Bundle into a `CatalogDefinition`

Create an `index.ts` that exports a single `CatalogDefinition` object. This is the recommended approach for declarative registration.

```ts
// catalogs/myown/index.ts
import type { CatalogDefinition } from '@freesail/react';
import catalog from './catalog.json';
import { MyCustomCard } from './components/MyCustomCard';

export const MyOwnCatalog: CatalogDefinition = {
  namespace: 'https://example.com/myown_catalog_v1.json',
  schema: catalog,
  components: {
    'MyCustomCard': MyCustomCard,
  },
};
```

### Recommended folder structure

```
/src
  /catalogs
    /myown
      ├── catalog.json          # Schema definition
      ├── index.ts              # Entry point exporting CatalogDefinition
      └── /components
          ├── MyCustomCard.tsx   # Component implementation
          └── ...
```

## 5. Register with `FreesailProvider`

Pass your catalog definition to `FreesailProvider` via the `catalogDefinitions` prop. The provider will automatically register the components and advertise the catalog to the connected agent.

```tsx
// App.tsx
import { FreesailProvider } from '@freesail/react';
import { MyOwnCatalog } from './catalogs/myown';

function App() {
  return (
    <FreesailProvider
      sseUrl="/api/sse"
      postUrl="/api/message"
      catalogDefinitions={[MyOwnCatalog]}
    >
      {/* your app */}
    </FreesailProvider>
  );
}
```

You can also combine custom catalogs with the built-in standard catalog:

```tsx
<FreesailProvider
  sseUrl="/api/sse"
  postUrl="/api/message"
  catalogs={[STANDARD_CATALOG_ID]}
  catalogDefinitions={[MyOwnCatalog]}
>
```

## API Reference

### `CatalogDefinition`

| Property     | Type                                            | Description                                      |
| ------------ | ----------------------------------------------- | ------------------------------------------------ |
| `namespace`  | `string`                                        | Unique identifier for the catalog (URI or name)  |
| `schema`     | `any`                                           | JSON schema object describing available components |
| `components` | `Record<string, ComponentType<FreesailComponentProps>>` | Map of component names → React implementations   |

### `withCatalog(catalogId, componentName, Component)`

Registers a single component in the global registry and returns the component unchanged. Useful for auto-registration on import.

### `registerCatalog(catalogId, components)`

Registers all components for a catalog at once in the global registry. Called automatically by `FreesailProvider` when `catalogDefinitions` are provided.
