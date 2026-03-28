# Creating Custom Catalogs

This guide explains how to create a custom Freesail catalog — a package that bundles a JSON schema describing UI components with their concrete React implementations. Agents use the schema to know what components exist; the React code renders them in the browser.

## Quick Start

```bash
npx freesail new catalog
```

This scaffolds a complete catalog package with a starter layout and a default import of the standard catalog's `Card` component. You own every file and can modify them freely.

## Generated Structure

```
{name}-catalog/
  package.json
  tsconfig.json
  src/
    {name}-catalog.json      # Generated — full resolved catalog (do not edit directly)
    index.ts                  # Exports CatalogDefinition
    includes/
      catalog.include.json   # Declare which packages to import from
      generated-includes.ts  # Auto-generated bridge (do not edit)
    components/
      components.json        # Custom component schemas
      components.tsx         # Custom component implementations
    functions/
      functions.json         # Custom function schemas
      functions.ts           # Custom function implementations
```

### Catalog ID

The `catalogId` in the generated catalog JSON is derived from the npm package name's org scope:

- `@acme/weather-catalog` → `https://acme.local/catalogs/weather-catalog.json`
- `@catamaran-4f8a2c/my-catalog` → `https://catamaran-4f8a2c.local/catalogs/my-catalog.json`

During scaffolding, a random boat-type scope is generated as a default (e.g. `@catamaran-4f8a2c`). You can accept it or type your own org name. Replace the `.local` domain with a real one before publishing.

To override the derived catalogId, add a `freesail` block to `package.json`:

```json
{
  "freesail": {
    "catalogId": "https://mycompany.com/catalogs/weather-catalog.json",
    "title": "Weather Catalog",
    "description": "Weather UI components"
  }
}
```

### Build Pipeline

The generated `package.json` includes:

```json
{
  "scripts": {
    "prepare:catalog": "freesail prepare catalog",
    "prebuild": "freesail prepare catalog && freesail validate catalog",
    "build": "tsc"
  }
}
```

- **`freesail prepare catalog`** — reads `catalog.include.json`, merges imported and local schemas, and writes `{name}-catalog.json` and `generated-includes.ts`
- **`freesail validate catalog`** — checks that every JSON-declared component/function has a matching implementation

Both run automatically before each `npm run build`.

---

## Importing from a Catalog Package

The inclusion model lets you pull components and functions from any installed catalog package into your own catalog. This is the primary way to reuse the standard Freesail components.

```bash
npx freesail include catalog --package @freesail/standard-catalog
```

This command:
1. Reads all components and functions from the installed package's catalog JSON
2. Writes them into `src/includes/catalog.include.json`
3. Re-runs `freesail prepare catalog`

Edit `catalog.include.json` afterwards to remove anything you don't need:

```json
{
  "includes": {
    "@freesail/standard-catalog": {
      "catalogPath": "dist/standard-catalog.json",
      "components": ["Card", "Button", "TextInput"],
      "functions": ["formatString"]
    }
  }
}
```

You can import from multiple packages by running `freesail include catalog` once per package, or by editing `catalog.include.json` directly.

---

## Step 1: Define Custom Schemas

Add custom component schemas in `src/components/components.json`:

```json
{
  "components": {
    "StatusCard": {
      "type": "object",
      "allOf": [
        { "$ref": "#/$defs/ComponentCommon" },
        {
          "type": "object",
          "description": "A card displaying a status with a title, message, and severity level.",
          "properties": {
            "component": { "const": "StatusCard" },
            "title":    { "type": "string", "description": "Card heading" },
            "message":  { "type": "string", "description": "Body text" },
            "severity": {
              "type": "string",
              "enum": ["info", "warning", "error", "success"],
              "description": "Visual severity level"
            }
          },
          "required": ["component", "title"]
        }
      ]
    }
  }
}
```

Add custom function schemas in `src/functions/functions.json`:

```json
{
  "functions": {
    "truncate": {
      "description": "Truncates a string to maxLength characters.",
      "returnType": "string",
      "parameters": {
        "type": "object",
        "properties": {
          "value": { "type": "string" },
          "maxLength": { "type": "integer" }
        },
        "required": ["value"]
      }
    }
  }
}
```

After editing, run `npx freesail prepare catalog` to regenerate the resolved catalog JSON.

**Key rules:**
- `components` keys are the component names agents will use (e.g. `"component": "StatusCard"`).
- `description` fields are included in the agent's system prompt — write them clearly.
- Use `allOf` with `$ref: "#/$defs/ComponentCommon"` for consistent component structure.
- Do not edit `{name}-catalog.json` directly — it is regenerated by `freesail prepare catalog`.

---

## Step 2: Implement Components (`components/components.tsx`)

The scaffolded file imports included components from `generated-includes.ts` and spreads them into the export map. Add your custom components alongside:

```tsx
import React, { type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';
import { includedComponents } from '../includes/generated-includes.js';

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
    border: `1px solid ${colors[severity] ?? colors['info']}`,
  };

  return (
    <div style={style}>
      <strong>{title}</strong>
      {message && <p style={{ margin: '8px 0 0' }}>{message}</p>}
      {children}
    </div>
  );
}

export const myappCatalogComponents = {
  ...includedComponents,
  StatusCard,
};
```

**Conventions:**
- Export each component as a named `export function`.
- Cast props with `as string` — all values arrive as `unknown`.
- Use CSS custom properties (`var(--freesail-*)`) for theming.
- The map keys must exactly match the component names in the JSON schema.

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

  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path
    ? rawValue.path
    : `/input/${component.id}`;

  return (
    <input
      value={value}
      onChange={(e) => onDataChange?.(boundPath, e.target.value)}
    />
  );
}
```

---

## Step 3: Add Custom Functions (`functions/functions.ts`)

The scaffolded file re-exports included functions. Add custom functions alongside:

```ts
import type { FunctionImplementation } from '@freesail/react';
import { includedFunctions } from '../includes/generated-includes.js';

const truncate: FunctionImplementation = (args) => {
  const value = String((args as Record<string, unknown>)?.['value'] ?? '');
  const maxLength = Number((args as Record<string, unknown>)?.['maxLength'] ?? 100);
  return value.length > maxLength ? value.slice(0, maxLength) + '…' : value;
};

export const myappCatalogFunctions = {
  ...includedFunctions,
  truncate,
};
```

Remember to also declare the function in `src/functions/functions.json` (see Step 1).

---

## Step 4: Wire Up `index.ts`

The scaffolded `index.ts` is ready to use:

```ts
import type { CatalogDefinition } from '@freesail/react';
import { myappCatalogComponents } from './components/components.js';
import { myappCatalogFunctions } from './functions/functions.js';
import catalogSchema from './myapp-catalog.json';

export const MyappCatalog: CatalogDefinition = {
  namespace: catalogSchema.catalogId,
  schema: catalogSchema,
  components: myappCatalogComponents,
  functions: myappCatalogFunctions,
};
```

> **`formatString` is required.** The agent system prompt relies on it. Both `freesail prepare catalog` and `freesail validate catalog` will warn if it is missing. Import it from `@freesail/standard-catalog` via `catalog.include.json`, or implement it yourself.

---

## Validation

The generated `package.json` runs both `freesail prepare catalog` and `freesail validate catalog` before every build. You can also run them manually:

```bash
npx freesail prepare catalog   # Merge schemas and regenerate catalog JSON
npx freesail validate catalog  # Check implementations match the schema
```

Both commands accept `--dir <path>` to target a catalog in a different directory:

```bash
npx freesail prepare catalog --dir ./packages/my-catalog
npx freesail validate catalog --dir ./packages/my-catalog
```

Validation checks:
- Every component key in the catalog JSON has a matching entry in the components map.
- Every function key in the catalog JSON has a matching implementation.
- `formatString` is present in the catalog (warns if missing).
- Required schema fields (`catalogId`, `title`) are set.
- Warns if `catalogId` uses a `.local` placeholder domain.

---

## `CatalogDefinition` API Reference

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `namespace` | `string` | ✅ | The `catalogId` URI — must match `schema.catalogId` |
| `schema` | `object` | ✅ | The parsed JSON schema object |
| `components` | `Record<string, ComponentType<FreesailComponentProps>>` | ✅ | Component name → React component map |
| `functions` | `Record<string, FunctionImplementation>` | ✅ | Function name → implementation map (must include `formatString`) |
