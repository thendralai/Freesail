# {{title}}

{{description}}

## Getting Started

```bash
npm install
npm run build
```

---

## Project Structure

```
src/
  {{prefix}}-catalog.json   # Generated catalog (do not edit manually)
  index.ts                  # Catalog entry point
  includes/
    catalog.include.json    # Declare which packages to import from
    generated-includes.ts   # Auto-generated bridge (do not edit)
  components/
    components.json         # Component schemas
    components.tsx          # React implementations
  functions/
    functions.json          # Function schemas
    functions.ts            # Function implementations
```

### Catalog ID

The `catalogId` in the catalog JSON is derived from your npm package name's org scope. Override it in `package.json`:

```json
{
  "freesail": {
    "catalogId": "https://mycompany.com/catalogs/{{prefix}}-catalog.json",
    "title": "{{title}}",
    "description": "{{description}}"
  }
}
```

### Build Pipeline

```json
{
  "scripts": {
    "prepare:catalog": "freesail prepare catalog",
    "prebuild": "freesail prepare catalog && freesail validate catalog",
    "build": "tsc"
  }
}
```

- **`freesail prepare catalog`** — merges imported and local schemas, writes the catalog JSON and `generated-includes.ts`
- **`freesail validate catalog`** — checks every JSON-declared component/function has a matching implementation

---

## Importing from a Catalog Package

Pull components and functions from any installed catalog package into your catalog:

```bash
npx freesail include catalog --package @freesail/standard-catalog
```

Edit `catalog.include.json` afterwards to remove anything you don't need:

```json
{
  "includes": {
    "@freesail/standard-catalog": {
      "catalogPath": "dist/standard-catalog.json",
      "components": ["Card", "Button", "Text"],
      "functions": ["formatString"]
    }
  }
}
```

---

## Step 1: Define Custom Schemas (`components/components.json`)

```json
{
  "components": {
    "MyComponent": {
      "type": "object",
      "allOf": [
        { "$ref": "#/$defs/ComponentCommon" },
        {
          "type": "object",
          "description": "Description agents will see — be precise.",
          "properties": {
            "component": { "const": "MyComponent" },
            "title":     { "type": "string", "description": "Heading text" },
            "severity":  { "type": "string", "enum": ["info","warning","error","success"] }
          },
          "required": ["component", "title"]
        }
      ]
    }
  }
}
```

**Key rules:**
- Component name keys are the names agents use in `"component": "MyComponent"`.
- `description` fields appear in the agent's system prompt — write them precisely.
- Use `allOf` + `$ref: "#/$defs/ComponentCommon"` for consistent structure.
- Never edit the generated `{{prefix}}-catalog.json` directly.

Run `npx freesail prepare catalog` after every schema change.

---

## Step 2: Implement Components (`components/components.tsx`)

```tsx
import React, { type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';
import { includedComponents } from '../includes/generated-includes.js';

export function MyComponent({ component, children }: FreesailComponentProps) {
  const title    = (component['title'] as string) ?? '';
  const severity = (component['severity'] as string) ?? 'info';

  const colors: Record<string, string> = {
    info:    'var(--freesail-info, #3b82f6)',
    warning: 'var(--freesail-warning, #f59e0b)',
    error:   'var(--freesail-error, #ef4444)',
    success: 'var(--freesail-success, #22c55e)',
  };

  const style: CSSProperties = {
    padding: 'var(--freesail-space-md)',
    borderRadius: 'var(--freesail-radius-md)',
    backgroundColor: 'var(--freesail-bg-raised, #ffffff)',
    color: 'var(--freesail-text-main, #0f172a)',
    border: `1px solid ${colors[severity] ?? colors['info']}`,
    boxShadow: 'var(--freesail-shadow-sm)',
  };

  return (
    <div style={style}>
      <strong style={{ fontSize: 'var(--freesail-type-h4)' }}>{title}</strong>
      {children}
    </div>
  );
}

export const {{camelPrefix}}CatalogComponents = {
  ...includedComponents,
  MyComponent,
};
```

**Conventions:**
- Export each component as a named `export function`.
- Cast all prop values with `as string` / `as number` — they arrive as `unknown`.
- Use `var(--freesail-*)` CSS custom properties for theming (see Token Reference below).
- Always include a hardcoded fallback: `var(--freesail-bg-raised, #ffffff)`.
- Map keys must exactly match component names in the JSON schema.

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

```tsx
export function MyInput({ component, onDataChange }: FreesailComponentProps) {
  const value = (component['value'] as string) ?? '';
  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path
    ? rawValue.path : `/input/${component.id}`;

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

```ts
import type { FunctionImplementation } from '@freesail/react';
import { includedFunctions } from '../includes/generated-includes.js';

const myFunction: FunctionImplementation = (args) => {
  const value = String((args as Record<string, unknown>)?.['value'] ?? '');
  return value.toUpperCase();
};

export const {{camelPrefix}}CatalogFunctions = {
  ...includedFunctions,
  myFunction,
};
```

Also declare the function in `src/functions/functions.json`.

---

## Step 4: Wire Up `index.ts`

```ts
import type { CatalogDefinition } from '@freesail/react';
import { {{camelPrefix}}CatalogComponents } from './components/components.js';
import { {{camelPrefix}}CatalogFunctions } from './functions/functions.js';
import catalogSchema from './{{prefix}}-catalog.json';

export const {{pascalPrefix}}Catalog: CatalogDefinition = {
  namespace: catalogSchema.catalogId,
  schema: catalogSchema,
  components: {{camelPrefix}}CatalogComponents,
  functions: {{camelPrefix}}CatalogFunctions,
};
```

> **`formatString` is required.** Import it from `@freesail/standard-catalog` via `catalog.include.json`, or implement it yourself. The agent system prompt relies on it.

---

## Registering the Catalog

```tsx
import { FreesailProvider } from '@freesail/react';
import { {{pascalPrefix}}Catalog } from '{{prefix}}-catalog';
import { StandardCatalog } from '@freesail/standard-catalog';

function App() {
  return (
    <FreesailProvider
      catalogs={[StandardCatalog, {{pascalPrefix}}Catalog]}
    >
      {/* your app */}
    </FreesailProvider>
  );
}
```

---

## Validation

```bash
npx freesail prepare catalog   # Merge schemas and regenerate catalog JSON
npx freesail validate catalog  # Check implementations match the schema
```

Both accept `--dir <path>` to target a different directory.

---

## Theme Token Reference

All `--freesail-*` CSS custom properties are injected by `FreesailProvider`. Always use them instead of hardcoded colours to support light/dark mode and host-app theming.

### Background

| CSS Custom Property | Light default | Dark default | Usage |
|---|---|---|---|
| `--freesail-bg` | `#f8fafc` | `#020617` | Page / surface base background |
| `--freesail-bg-raised` | `#ffffff` | `#0f172a` | Cards, modals, input fields, raised panels |
| `--freesail-bg-muted` | `#f1f5f9` | `#1e293b` | Subtle fills, alternating rows, chips |
| `--freesail-bg-overlay` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.7)` | Modal/drawer backdrop |

### Text

| CSS Custom Property | Light default | Dark default | Usage |
|---|---|---|---|
| `--freesail-text-main` | `#0f172a` | `#f8fafc` | Primary body text, headings |
| `--freesail-text-muted` | `#64748b` | `#94a3b8` | Secondary/helper text, labels |

### Brand & Interactive

| CSS Custom Property | Light default | Dark default | Usage |
|---|---|---|---|
| `--freesail-primary` | `#2563eb` | `#3b82f6` | Buttons, links, active states |
| `--freesail-primary-hover` | `#1d4ed8` | `#2563eb` | Hover state for primary elements |
| `--freesail-primary-text` | `#ffffff` | `#ffffff` | Text on primary-coloured backgrounds |

### Semantic Status

| CSS Custom Property | Light default | Dark default | Usage |
|---|---|---|---|
| `--freesail-error` | `#ef4444` | `#f87171` | Error states, destructive actions |
| `--freesail-success` | `#22c55e` | `#4ade80` | Success states, confirmations |
| `--freesail-warning` | `#f59e0b` | `#fbbf24` | Warning states, advisories |
| `--freesail-info` | `#3b82f6` | `#60a5fa` | Informational highlights |

> **Subtle status backgrounds** — derive with `color-mix`:
> ```css
> background: color-mix(in srgb, var(--freesail-warning) 12%, var(--freesail-bg));
> ```

### Structure & Shape

| CSS Custom Property | Light default | Dark default | Usage |
|---|---|---|---|
| `--freesail-border` | `#cbd5e1` | `#334155` | Dividers, input borders |
| `--freesail-radius-sm` | `0.25rem` | — | Chips, badges |
| `--freesail-radius-md` | `0.5rem` | — | Buttons, inputs, cards |
| `--freesail-radius-lg` | `0.75rem` | — | Modals, large panels |
| `--freesail-shadow-sm` | — | — | Subtle elevation |
| `--freesail-shadow-md` | — | — | Moderate elevation |

### Fluid Spacing (`clamp()` · container-relative)

| CSS Custom Property | Range |
|---|---|
| `--freesail-space-xs` | 2px – 4px |
| `--freesail-space-sm` | 4px – 8px |
| `--freesail-space-md` | 8px – 16px |
| `--freesail-space-lg` | 16px – 24px |
| `--freesail-space-xl` | 24px – 40px |

### Fluid Typography

| CSS Custom Property | Range |
|---|---|
| `--freesail-type-caption` | 10px – 12px |
| `--freesail-type-label` | 11px – 13px |
| `--freesail-type-body` | 13px – 15px |
| `--freesail-type-h5` | 13px – 15px |
| `--freesail-type-h4` | 15px – 18px |
| `--freesail-type-h3` | 17px – 22px |
| `--freesail-type-h2` | 20px – 28px |
| `--freesail-type-h1` | 24px – 36px |

### Fluid Icon Sizes

| CSS Custom Property | Range |
|---|---|
| `--freesail-icon-sm` | 14px – 16px |
| `--freesail-icon-md` | 18px – 20px |
| `--freesail-icon-lg` | 20px – 24px |
| `--freesail-icon-xl` | 28px – 32px |

### Full style example

```tsx
const style: CSSProperties = {
  padding: 'var(--freesail-space-md)',
  backgroundColor: 'var(--freesail-bg-raised, #ffffff)',
  color: 'var(--freesail-text-main, #0f172a)',
  border: '1px solid var(--freesail-border, #e2e8f0)',
  borderRadius: 'var(--freesail-radius-md)',
  boxShadow: 'var(--freesail-shadow-sm)',
  fontSize: 'var(--freesail-type-body)',
};
```

---

## `CatalogDefinition` API Reference

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `namespace` | `string` | ✅ | The `catalogId` URI — must match `schema.catalogId` |
| `schema` | `object` | ✅ | The parsed JSON schema object |
| `components` | `Record<string, ComponentType<FreesailComponentProps>>` | ✅ | Component name → React component map |
| `functions` | `Record<string, FunctionImplementation>` | ✅ | Function name → implementation map (must include `formatString`) |

---

## Build Commands

| Command | Description |
| --- | --- |
| `npx freesail prepare catalog` | Merge schemas and generate `{{prefix}}-catalog.json` |
| `npx freesail validate catalog` | Validate implementations match the catalog schema |
| `npx freesail include catalog --package <name>` | Include components/functions from a catalog package |
| `npm run build` | Compile TypeScript (runs prepare + validate automatically) |
| `npm run dev` | Watch mode for development |
| `npm run clean` | Remove build artifacts |

---

## License

MIT
