# Creating Custom Catalogs

This guide explains how to create a custom Freesail catalog — a package that bundles a JSON schema describing UI components with their concrete React implementations. Agents use the schema to know what components exist; the React code renders them in the browser.

## Package Structure

```
{name}_catalog/
  package.json          # "prebuild": "freesail validate catalog"
  tsconfig.json
  src/
    {name}_catalog.json # Component schema — edit this first
    components.tsx      # React implementations
    functions.ts        # Custom client-side functions (optional)
    index.ts            # Exports CatalogDefinition
```

---

## Step 1: Define the Schema (`{name}_catalog.json`)

The schema is a JSON file that tells the agent exactly which components exist and what properties each one accepts. The gateway uses it to validate agent output before it reaches the browser.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/catalogs/myapp_catalog_v1.json",
  "catalogId": "https://example.com/catalogs/myapp_catalog_v1.json",
  "title": "MyApp Catalog",
  "description": "Custom components for MyApp.",
  "components": {
    "StatusCard": {
      "description": "A card displaying a status with a title, message, and severity level.",
      "properties": {
        "title":    { "type": "string", "description": "Card heading" },
        "message":  { "type": "string", "description": "Body text" },
        "severity": {
          "type": "string",
          "enum": ["info", "warning", "error", "success"],
          "description": "Visual severity level"
        }
      },
      "required": ["title"]
    }
  },
  "functions": []
}
```

**Key rules:**
- `$id` and `catalogId` must be the same URL. Use a real published URL before shipping; a placeholder is fine during development.
- `components` keys are the component names agents will use (e.g. `"component": "StatusCard"`).
- `description` fields are included in the agent's system prompt — write them clearly.
- `functions` is an array of custom function definitions. Leave it empty (`[]`) if you have none; common functions (`formatString`, `not`, `isEmpty`, etc.) are inherited automatically.

---

## Step 2: Implement Components (`components.tsx`)

Each key in `components` needs a matching React function. All components receive `FreesailComponentProps` — the `component` object holds the resolved prop values sent by the agent.

```tsx
import React, { type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';

// ── StatusCard ─────────────────────────────────────────────────────────────

export function StatusCard({ component, children }: FreesailComponentProps) {
  const title    = (component['title'] as string) ?? '';
  const message  = (component['message'] as string) ?? '';
  const severity = (component['severity'] as string) ?? 'info';

  const colors: Record<string, string> = {
    info:    'var(--freesail-info, #3b82f6)',
    warning: 'var(--freesail-warning, #f59e0b)',
    error:   'var(--freesail-error, #ef4444)',
    success: 'var(--freesail-success, #22c55e)',
  };

  const style: CSSProperties = {
    padding: '16px',
    borderRadius: '8px',
    border: `1px solid ${colors[severity] ?? colors.info}`,
    background: 'var(--freesail-bg-surface, #ffffff)',
    color: 'var(--freesail-text-main, #0f172a)',
  };

  return (
    <div style={style}>
      <strong>{title}</strong>
      {message && <p style={{ margin: '8px 0 0' }}>{message}</p>}
      {children}
    </div>
  );
}

// ── Component map (must match keys in the JSON schema) ─────────────────────

export const myappCatalogComponents: Record<string, React.ComponentType<FreesailComponentProps>> = {
  StatusCard,
};
```

**Conventions followed by all Freesail catalogs:**
- Export each component as a named `export function`.
- Cast props with `as string` (or the appropriate type) — all values arrive as `unknown`.
- Use CSS custom properties (`var(--freesail-*)`) for colors and spacing so components respect the host app's theme.
- Collect all components in a single `export const {name}CatalogComponents` map at the bottom of the file. The map keys must exactly match the component names in the JSON schema.

### `FreesailComponentProps` reference

| Prop | Type | Purpose |
|------|------|---------|
| `component` | `A2UIComponent` | All resolved props the agent sent for this component instance |
| `children` | `ReactNode` | Rendered child components (for containers) |
| `scopeData` | `unknown` | Current item data when inside a dynamic list template |
| `dataModel` | `Record<string, unknown>` | Full surface data model (read-only snapshot) |
| `onAction` | `(name, context) => void` | Dispatch a named action to the agent |
| `onDataChange` | `(path, value) => void` | Write a value to the local data model (two-way binding) |
| `onFunctionCall` | `(call) => void` | Execute a client-side function call |

### Two-way binding (input components)

For components that let users enter data, read the bound path from `component['__rawValue']` and call `onDataChange` on every change:

```tsx
export function MyInput({ component, onDataChange }: FreesailComponentProps) {
  const value = (component['value'] as string) ?? '';

  // __rawValue holds the original binding object before resolution
  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path
    ? rawValue.path
    : `/input/${component.id}`;   // auto-bind fallback

  return (
    <input
      value={value}
      onChange={(e) => onDataChange?.(boundPath, e.target.value)}
    />
  );
}
```

### Validation (`checks`)

Any component can render validation errors from the agent's `checks` array. Add this helper and call it in your component:

```tsx
function validateChecks(checks: any[]): string | null {
  for (const check of checks) {
    if (check.condition === false) return check.message ?? 'Invalid';
  }
  return null;
}

export function MyInput({ component, onDataChange }: FreesailComponentProps) {
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  return (
    <div>
      <input
        style={{ border: validationError ? '1px solid red' : undefined }}
        // ...
      />
      {validationError && (
        <div style={{ color: 'var(--freesail-error, #ef4444)', fontSize: '12px' }}>
          {validationError}
        </div>
      )}
    </div>
  );
}
```

---

## Step 3: Add Custom Functions (`functions.ts`)

Skip this file if you don't need custom client-side logic — common functions (`formatString`, `not`, `isEmpty`, `lte`, `now`, etc.) are inherited automatically via `commonFunctions` in `index.ts`.

To add custom functions:

```ts
import type { FunctionImplementation } from '@freesail/react';

export const myappCatalogFunctions: Record<string, FunctionImplementation> = {
  // Custom function: truncates a string to maxLength characters
  truncate: (value: unknown, maxLength: number) => {
    const str = String(value ?? '');
    return str.length > maxLength ? str.slice(0, maxLength) + '…' : str;
  },
};
```

To declare the function for agents, add an entry to `functions` in the JSON schema:

```json
"functions": [
  {
    "name": "truncate",
    "description": "Truncates a string to maxLength characters, appending '…' if shortened.",
    "args": [
      { "name": "value",     "type": "string", "description": "The string to truncate" },
      { "name": "maxLength", "type": "number", "description": "Maximum character count" }
    ]
  }
]
```

---

## Step 4: Wire Up `index.ts`

```ts
import type { CatalogDefinition } from '@freesail/react';
import { commonFunctions } from '@freesail/catalogs/common';
import catalogSchema from './myapp_catalog.json';
import { myappCatalogComponents } from './components.js';
import { myappCatalogFunctions } from './functions.js';

export * from './components.js';
export * from './functions.js';

export const MYAPP_CATALOG_ID = catalogSchema.catalogId;

export const MyappCatalog: CatalogDefinition = {
  namespace: MYAPP_CATALOG_ID,
  schema: catalogSchema,
  components: myappCatalogComponents,
  functions: {
    ...commonFunctions,         // Inherits formatString and all standard functions
    ...myappCatalogFunctions,   // Custom functions override common ones if names clash
  },
};
```

> **`commonFunctions` is required.** The agent system prompt relies on `formatString`. The `freesail validate catalog` command will error if it is absent from the runtime function map.

---

## Step 5: Register with `FreesailProvider`

```tsx
import { FreesailProvider } from '@freesail/react';
import { MyappCatalog } from 'myapp-catalog';
import { StandardCatalog } from '@freesail/catalogs/standard';

function App() {
  return (
    <FreesailProvider
      sseUrl="/api/sse"
      postUrl="/api/message"
      catalogDefinitions={[StandardCatalog, MyappCatalog]}
    >
      <YourApp />
    </FreesailProvider>
  );
}
```

Multiple catalogs can coexist. Each surface is bound to exactly one catalog, identified by `catalogId`.

---

## Validation

Before building, run:

```bash
npx freesail validate catalog
```

This checks that:
- Every component key in the JSON schema has a matching entry in the components map.
- `formatString` is present in the runtime function map.
- Required schema fields (`catalogId`, `$id`) are set.

The `prebuild` script in the generated `package.json` runs this automatically on every `npm run build`.

---

## `CatalogDefinition` API Reference

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `namespace` | `string` | ✅ | The `catalogId` URI — must match `schema.catalogId` |
| `schema` | `object` | ✅ | The parsed JSON schema object |
| `components` | `Record<string, ComponentType<FreesailComponentProps>>` | ✅ | Component name → React component map |
| `functions` | `Record<string, FunctionImplementation>` | ✅ | Function name → implementation map (always spread `commonFunctions`) |
