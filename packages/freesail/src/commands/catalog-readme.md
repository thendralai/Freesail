# {{title}}

{{description}}

## Getting Started

```bash
npm install
npm run build
```

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

## Importing from a Catalog Package

To pull components and functions from an installed catalog package into your catalog:

```bash
npx freesail include catalog --package @freesail/standard-catalog
```

This reads all components and functions from the installed package, writes them into
`src/includes/catalog.include.json`, and re-runs `freesail prepare catalog`.
Edit `catalog.include.json` afterwards to remove anything you don't need.

## Adding Components

1. Define the component schema in `src/components/components.json`.
2. Implement the React component in `src/components/components.tsx`.
3. Run `npx freesail prepare catalog` to regenerate the catalog.

## Adding Functions

1. Define the function schema in `src/functions/functions.json`.
2. Implement the function in `src/functions/functions.ts`.
3. Run `npx freesail prepare catalog` to regenerate the catalog.

## Build Pipeline

| Command | Description |
| --- | --- |
| `npx freesail prepare catalog` | Merge schemas and generate `{{prefix}}-catalog.json` |
| `npx freesail validate catalog` | Validate implementations match the catalog schema |
| `npx freesail include catalog --package <name>` | Include components/functions from a catalog package |
| `npm run build` | Compile TypeScript (runs prepare + validate automatically) |
| `npm run dev` | Watch mode for development |
| `npm run clean` | Remove build artifacts |

## Registering the Catalog

In your application entry point:

```tsx
import { FreesailProvider } from '@freesail/react';
import { {{pascalPrefix}}Catalog } from '{{prefix}}-catalog';

function App() {
  return (
    <FreesailProvider
      gateway="/api"
      catalogDefinitions={[{{pascalPrefix}}Catalog]}
    >
      {/* your app */}
    </FreesailProvider>
  );
}
```
