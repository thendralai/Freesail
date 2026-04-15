# Weather Catalog

Weather-specific UI components for displaying forecasts, conditions, and alerts.

This catalog was built using the Freesail custom catalog system. The guide below covers everything you need to understand, modify, or extend it.

---

## Quick Start

```bash
npm install
npm run build
```

---

## Project Structure

```
src/
  weather-catalog.json      # Generated catalog (do not edit manually)
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

The `catalogId` in the catalog JSON is derived from the npm package name's org scope:

- `@acme/weather-catalog` → `https://acme.local/catalogs/weather-catalog.json`

Override it via `package.json`:

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

```json
{
  "scripts": {
    "prepare:catalog": "freesail prepare catalog",
    "prebuild": "freesail prepare catalog && freesail validate catalog",
    "build": "tsc"
  }
}
```

- **`freesail prepare catalog`** — reads `catalog.include.json`, merges imported and local schemas, writes the catalog JSON and `generated-includes.ts`
- **`freesail validate catalog`** — checks every JSON-declared component/function has a matching implementation

---

## Importing from a Catalog Package

Pull components and functions from any installed catalog package into this one:

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
    "WeatherCard": {
      "type": "object",
      "allOf": [
        { "$ref": "#/$defs/ComponentCommon" },
        {
          "type": "object",
          "description": "Displays current weather conditions for a location.",
          "properties": {
            "component": { "const": "WeatherCard" },
            "location":    { "type": "string", "description": "City name" },
            "temperature": { "type": "number", "description": "Temperature value" },
            "unit":        { "type": "string", "enum": ["C","F"], "description": "Temperature unit" },
            "condition":   { "type": "string", "description": "e.g. sunny, rainy, cloudy" }
          },
          "required": ["component", "location"]
        }
      ]
    }
  }
}
```

**Key rules:**
- Component name keys (e.g. `WeatherCard`) are the names agents use in `"component": "WeatherCard"`.
- `description` fields appear in the agent's system prompt — write them precisely.
- Use `allOf` + `$ref: "#/$defs/ComponentCommon"` for consistent structure.
- Never edit the generated `{name}-catalog.json` directly.

After editing, run:

```bash
npx freesail prepare catalog
```

---

## Step 2: Implement Components (`components/components.tsx`)

```tsx
import React, { type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';
import { includedComponents } from '../includes/generated-includes.js';

export function WeatherCard({ component }: FreesailComponentProps) {
  const location    = String((component['location'] as string) ?? 'Unknown');
  const temperature = component['temperature'] !== undefined
    ? parseFloat(String(component['temperature'])) : undefined;
  const unit      = (component['unit'] as string) ?? 'C';
  const condition = (component['condition'] as string) ?? 'sunny';

  const style: CSSProperties = {
    padding: 'var(--freesail-space-lg)',
    borderRadius: 'var(--freesail-radius-lg)',
    backgroundColor: 'var(--freesail-bg-raised, #ffffff)',
    border: '1px solid var(--freesail-border, #e2e8f0)',
    boxShadow: 'var(--freesail-shadow-md)',
    color: 'var(--freesail-text-main, #0f172a)',
  };

  return (
    <div style={style}>
      <div style={{ fontSize: 'var(--freesail-type-h4)', fontWeight: 600 }}>
        {location}
      </div>
      {temperature !== undefined && (
        <div style={{ fontSize: 'var(--freesail-type-h1)', fontWeight: 200 }}>
          {Math.round(temperature)}°{unit}
        </div>
      )}
      <div style={{ color: 'var(--freesail-text-muted, #64748b)', textTransform: 'capitalize' }}>
        {condition}
      </div>
    </div>
  );
}

export const weatherCatalogComponents = {
  ...includedComponents,
  WeatherCard,
};
```

**Conventions:**
- Export each component as a named `export function`.
- Cast all prop values with `as string` / `as number` — values arrive as `unknown`.
- Use `var(--freesail-*)` CSS custom properties for theming (see Token Reference below).
- Always include a hardcoded fallback in `var()`: `var(--freesail-bg-raised, #ffffff)`.
- Map keys must exactly match the component names in the JSON schema.

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

const formatWindSpeed: FunctionImplementation = (args) => {
  const speed = Number((args as Record<string, unknown>)?.['speed'] ?? 0);
  const unit  = String((args as Record<string, unknown>)?.['unit'] ?? 'km/h');
  return `${speed} ${unit}`;
};

export const weatherCatalogFunctions = {
  ...includedFunctions,
  formatWindSpeed,
};
```

Also declare the function in `src/functions/functions.json`.

---

## Step 4: Wire Up `index.ts`

```ts
import type { CatalogDefinition } from '@freesail/react';
import { weatherCatalogComponents } from './components/components.js';
import { weatherCatalogFunctions } from './functions/functions.js';
import catalogSchema from './weather-catalog.json';

export const WeatherCatalog: CatalogDefinition = {
  namespace: catalogSchema.catalogId,
  schema: catalogSchema,
  components: weatherCatalogComponents,
  functions: weatherCatalogFunctions,
};
```

> **`formatString` is required.** Import it from `@freesail/standard-catalog` via `catalog.include.json`, or implement it yourself. The agent system prompt relies on it.

---

## Registering the Catalog

```tsx
import { FreesailProvider } from '@freesail/react';
import { WeatherCatalog } from '@freesail-community/weather-catalog';
import { StandardCatalog } from '@freesail/standard-catalog';

function App() {
  return (
    <FreesailProvider
      catalogs={[StandardCatalog, WeatherCatalog]}
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
| `npx freesail prepare catalog` | Merge schemas and regenerate catalog JSON |
| `npx freesail validate catalog` | Validate implementations match the schema |
| `npx freesail include catalog --package <name>` | Include components/functions from a catalog package |
| `npm run build` | Compile TypeScript (runs prepare + validate automatically) |
| `npm run dev` | Watch mode for development |
| `npm run clean` | Remove build artifacts |

---

## License

MIT — see [LICENSE](./LICENSE)
