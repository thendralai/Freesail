# @freesail/standard-catalog

Freesail Standard UI Component Catalog — a collection of ready-to-use components and functions for building agent-driven UIs with Freesail.

## Components

| Component | Description |
|-----------|-------------|
| `Column` | Vertical flex container |
| `Row` | Horizontal flex container |
| `Card` | Surfaced container with border and shadow |
| `Text` | Text display with variant support (body, label, heading, etc.) |
| `Icon` | Material Symbols icon (font auto-injected) |
| `Button` | Clickable button with action support |
| `TextField` | Single or multi-line text input |
| `DateTimeInput` | Date and/or time picker |
| `ChoicePickerSingleSelect` | Single-select option list |
| `ChoicePickerMultiSelect` | Multi-select option list |
| `Dropdown` | Dropdown select input |
| `CheckBox` | Checkbox input |
| `Spacer` | Flexible spacing element |
| `Divider` | Horizontal rule |
| `Modal` | Overlay dialog |
| `GridLayout` | Fixed-column grid container |
| `List` | Scrollable list of items |
| `Tab` / `TabGroup` | Tabbed navigation |
| `Image` | Image display |
| `Video` | Video player |
| `AudioPlayer` | Audio player |
| `Slider` | Range slider input |
| `Markdown` | Renders Markdown content |
| `BarChart` | Bar chart |
| `LineChart` | Line chart |
| `PieChart` | Pie/donut chart |
| `Sparkline` | Inline sparkline chart |
| `StatCard` | KPI stat display card |

## Functions

| Function | Description |
|----------|-------------|
| `formatString` | String formatting with `${...}` interpolation and positional `{0}`, `{1}` placeholders |

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
