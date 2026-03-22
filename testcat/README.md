# Test Catalog

A custom Freesail catalog for test

## Getting Started

```bash
npm install
npm run build
```

## Project Structure

```
src/
  common/               # Forked common components & functions (editable)
  schemas/              # JSON Schema for catalog validation
  components.json       # Custom component schemas
  components.tsx        # Custom component implementations
  functions.json        # Custom function schemas
  functions.ts          # Custom function implementations
  catalog.exclude.json  # Components/functions to exclude from the final catalog
  index.ts              # Catalog entry point
  test_catalog.json  # Generated catalog (do not edit manually)
```

## Adding Components

1. Define the component schema in `src/components.json`.
2. Implement the React component in `src/components.tsx`.
3. Run `npx freesail prepare catalog` to regenerate the catalog.

## Adding Functions

1. Define the function schema in `src/functions.json`.
2. Implement the function in `src/functions.ts`.
3. Run `npx freesail prepare catalog` to regenerate the catalog.

## Excluding Common Items

To exclude common components or functions from the final catalog,
add their names to `src/catalog.exclude.json`:

```json
{
  "components": ["Spacer"],
  "functions": ["clearScreen"]
}
```

## Build Pipeline

| Command | Description |
| --- | --- |
| `npx freesail prepare catalog` | Merge schemas and generate `test_catalog.json` |
| `npx freesail validate catalog` | Validate implementations match the catalog schema |
| `npx freesail update catalog` | Update common components, functions, and schemas to latest |
| `npm run build` | Compile TypeScript (runs prepare + validate automatically) |
| `npm run dev` | Watch mode for development |
| `npm run clean` | Remove build artifacts |

## Registering the Catalog

In your application entry point:

```tsx
import { FreesailProvider } from '@freesail/react';
import { TestCatalog } from 'test_catalog';

function App() {
  return (
    <FreesailProvider catalogs={[TestCatalog]}>
      {/* your app */}
    </FreesailProvider>
  );
}
```
