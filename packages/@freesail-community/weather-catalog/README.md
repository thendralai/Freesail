# Weather Catalog

Weather-specific UI components for displaying forecasts, conditions, and alerts

## Getting Started

```bash
npm install
npm run build
```

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

## Importing from a Catalog Package

To pull components and functions from an installed catalog package:

```bash
npx freesail import catalog --package @freesail/standard-catalog
```

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
| `npx freesail prepare catalog` | Merge schemas and generate `weather-catalog.json` |
| `npx freesail validate catalog` | Validate implementations match the catalog schema |
| `npx freesail import catalog --package <name>` | Import components/functions from a catalog package |
| `npm run build` | Compile TypeScript (runs prepare + validate automatically) |
| `npm run dev` | Watch mode for development |
| `npm run clean` | Remove build artifacts |

## Registering the Catalog

In your application entry point:

```tsx
import { FreesailProvider } from '@freesail/react';
import { WeatherCatalog } from '@freesail-community/weathercatalog';

function App() {
  return (
    <FreesailProvider
      gateway="/api"
      catalogDefinitions={[WeatherCatalog]}
    >
      {/* your app */}
    </FreesailProvider>
  );
}
```
