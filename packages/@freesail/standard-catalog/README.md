# @freesail/standard-catalog

Freesail Standard UI Component Catalog — a collection of ready-to-use components and functions for building agent-driven UIs with Freesail.

## Components

| Component | Description |
|-----------|-------------|
| `Text` | Renders text content with variant support (h1–h5, caption, body) |
| `Icon` | Displays a Material Design icon (font auto-injected) |
| `Row` | Arranges children horizontally |
| `Column` | Arranges children vertically |
| `Card` | Styled container with border and optional shadow |
| `Modal` | Overlay dialog that covers the screen |
| `Button` | Clickable button that triggers an action |
| `TextField` | Single or multi-line text input |
| `ChoicePickerSingleSelect` | Selects exactly one option from a list |
| `ChoicePickerMultiSelect` | Selects one or more options from a list |
| `DateInput` | Date picker (ISO 8601 date strings, no time component) |
| `TimeInput` | Standalone hour/minute time picker |
| `Dropdown` | Dropdown select for a single option |
| `CheckBox` | Checkbox toggle for boolean values |
| `Slider` | Numeric range slider; supports single thumb or range |
| `Spacer` | Flexible spacing element |
| `Divider` | Horizontal separator line |
| `Image` | Displays an image |
| `Video` | Plays a video |
| `AudioPlayer` | Audio player supporting direct URLs and embedded third-party players |
| `List` | Scrollable list with vertical or horizontal layout |
| `TabGroup` | Tabbed container that shows one `Tab` at a time |
| `Tab` | A single tab within a `TabGroup` |
| `FluidGrid` | Responsive auto-fill grid that flows children into equal-width columns |
| `TabularGrid` | Fixed-column grid with optional header row and alternating row styles |
| `BarChart` | Bar chart from an array of data points |
| `LineChart` | Line chart from an array of data points |
| `PieChart` | Pie or donut chart from an array of segments |
| `Sparkline` | Compact inline sparkline from an array of numbers |
| `StatCard` | KPI card with a large value, label, and optional trend indicator |

## Functions

### Validation

| Function | Description |
|----------|-------------|
| `required` | Returns true if the value is not null, undefined, or empty |
| `regex` | Returns true if the value matches a regular expression |
| `checkLength` | Returns true if the string or array length satisfies min/max constraints |
| `numeric` | Returns true if the numeric value satisfies min/max/step constraints |
| `email` | Returns true if the value is a valid email address |

### Formatting

| Function | Description |
|----------|-------------|
| `formatString` | String interpolation with `${path}` expressions and nested function calls |
| `formatNumber` | Formats a number with grouping and decimal precision |
| `formatCurrency` | Formats a number as a currency string |
| `formatDate` | Formats a date string, ISO timestamp, or Unix timestamp (ms) using a pattern |
| `pluralize` | Returns a localized string based on the CLDR plural category of a count |
| `now` | Returns the current date and time as an ISO 8601 string |

### Logic & Comparison

| Function | Description |
|----------|-------------|
| `and` | Returns true if all arguments are truthy |
| `or` | Returns true if any argument is truthy |
| `isEmpty` | Returns true if the value is null, undefined, empty string, empty array, or empty object |
| `eq` | Returns true if two values are strictly equal |
| `neq` | Returns true if two values are not equal |
| `gt` | Returns true if the first value is greater than the second |
| `gte` | Returns true if the first value is greater than or equal to the second |
| `lt` | Returns true if the first value is less than the second |
| `lte` | Returns true if the first value is less than or equal to the second |

### Utilities

| Function | Description |
|----------|-------------|
| `getLength` | Returns the character count, array length, or string length of a number/date |
| `openUrl` | Opens a URL in the browser |
| `show` | Shows a component by its ID |
| `hide` | Hides a component by its ID |

## Setup

### Icon component

The `Icon` component uses [Material Symbols Outlined](https://fonts.google.com/icons) rendered via CSS font ligatures. The font stylesheet is automatically injected into `<head>` on first render — no manual setup required.

Icon names are passed in camelCase and converted to the correct ligature name automatically:

```json
{ "component": "Icon", "id": "icon1", "name": "home" }
{ "component": "Icon", "id": "icon2", "name": "arrowBack", "size": "32px" }
{ "component": "Icon", "id": "icon3", "name": "favorite", "color": "error" }
```

### Markdown component — bundled dependency

The `Markdown` component uses [`react-markdown`](https://github.com/remarkjs/react-markdown), which is bundled as a dependency of this package. No additional setup is required.

## License

MIT — see [LICENSE](./LICENSE)

Third-party attributions — see [3rdpartylicenses.txt](./3rdpartylicenses.txt)
