## UI Catalog: Freesail Standard Catalog
**Catalog ID (use this as catalogId in create_surface):** `https://freesail.dev/catalogs/standard_catalog_v1.json`

Unified catalog of standard A2UI components and functions.

### Available Components:

**Text**
  Properties:
    [REQUIRED]
    - text: string | Binding - The text content to display. While simple Markdown formatting is supported (i.e. without HTML, images, or links), utilizing dedicated UI components is generally preferred for a richer and more structured presentation.
    [OPTIONAL]
    - variant: string - A hint for the base text style.

**Image**
  Properties:
    [REQUIRED]
    - url: string | Binding - The URL of the image to display.
    [OPTIONAL]
    - fit: string - Specifies how the image should be resized to fit its container. This corresponds to the CSS 'object-fit' property.
    - variant: string - A hint for the image size and style.

**Icon**
  Properties:
    [REQUIRED]
    - name: undefined - The name of the icon to display.

**Video**
  Properties:
    [REQUIRED]
    - url: string | Binding - The URL of the video to display.
    [OPTIONAL]
    - embed: boolean - When true, the video is rendered inside an iframe. This MUST be set to true for third-party sources such as YouTube (youtube.com, youtu.be) and Vimeo (vimeo.com). When false or omitted, a native video player is used, which only works with direct video file URLs (e.g. .mp4, .webm).

**AudioPlayer**
  Properties:
    [REQUIRED]
    - url: string | Binding - The URL of the audio to be played.
    [OPTIONAL]
    - description: string | Binding - A description of the audio, such as a title or summary.
    - embed: boolean - When true, the audio is rendered inside an iframe embed player. This MUST be set to true for third-party sources such as Spotify (open.spotify.com) and SoundCloud (soundcloud.com). When false or omitted, a native audio player is used, which only works with direct audio file URLs (e.g. .mp3, .wav).

**Row**
  Properties:
    [REQUIRED]
    - children: string[] | ChildTemplate - Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.
    [OPTIONAL]
    - gap: string | Binding - The spacing between children.
    - padding: string | Binding - Padding around the content.
    - justify: string - Defines the arrangement of children along the main axis (horizontally). Use 'spaceBetween' to push items to the edges, or 'start'/'end'/'center' to pack them together.
    - align: string - Defines the alignment of children along the cross axis (vertically). This is similar to the CSS 'align-items' property, but uses camelCase values (e.g., 'start').
  Supports children: yes

**Column**
  Properties:
    [REQUIRED]
    - children: string[] | ChildTemplate - Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.
    [OPTIONAL]
    - gap: string | Binding - The spacing between children.
    - padding: string | Binding - Padding around the content.
    - justify: string - Defines the arrangement of children along the main axis (vertically). Use 'spaceBetween' to push items to the edges (e.g. header at top, footer at bottom), or 'start'/'end'/'center' to pack them together.
    - align: string - Defines the alignment of children along the cross axis (horizontally). This is similar to the CSS 'align-items' property.
  Supports children: yes

**List**
  Properties:
    [REQUIRED]
    - children: string[] | ChildTemplate - Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list.
    [OPTIONAL]
    - direction: string - The direction in which the list items are laid out.
    - align: string - Defines the alignment of children along the cross axis.
  Supports children: yes

**Card**
  Properties:
    [REQUIRED]
    - child: ComponentId - The ID of the single child component to be rendered inside the card. To display multiple elements, you MUST wrap them in a layout component (like Column or Row) and pass that container's ID here. Do NOT pass multiple IDs or a non-existent ID. Do NOT define the child component inline.
    [OPTIONAL]
    - padding: string | Binding - Padding inside the card.
    - width: string | Binding - The width of the card.
    - height: string | Binding - The height of the card.

**Tabs**
  Properties:
    [REQUIRED]
    - tabs: array[object] - An array of objects, where each object defines a tab with a title and a child component.

**Modal**
  Properties:
    [REQUIRED]
    - trigger: ComponentId - The ID of the component that opens the modal when interacted with (e.g., a button). Do NOT define the component inline.
    - content: ComponentId - The ID of the component to be displayed inside the modal. Do NOT define the component inline.

**Divider**
  Properties:
    [OPTIONAL]
    - axis: string - The orientation of the divider.

**Button**
  Properties:
    [REQUIRED]
    - action: Action
    [OPTIONAL]
    - label: string | Binding - The text label for the button. Used if 'child' is not provided.
    - child: ComponentId - The ID of the child component. Use a 'Text' component for a labeled button. Only use an 'Icon' if the requirements explicitly ask for an icon-only button. Do NOT define the child component inline.
    - variant: string - A hint for the button style. If omitted, a default button style is used.

**TextField**
  Properties:
    [REQUIRED]
    - label: string | Binding - The text label for the input field.
    [OPTIONAL]
    - value: string | Binding - The value of the text field.
    - variant: string - The type of input field to display.
    - hideLabel: boolean - When true, hides the label above the input. Use this when the TextField is inside a GridLayout — the column headers already act as labels, so showing them again inside each cell is redundant and makes rows too tall.

**CheckBox**
  Properties:
    [REQUIRED]
    - label: string | Binding - The text to display next to the checkbox.
    - value: boolean | Binding - The current state of the checkbox (true for checked, false for unchecked).

**ChoicePicker**
  Properties:
    [REQUIRED]
    - options: undefined - The list of available options to choose from. Can be a literal array or a data binding to a list in the data model.
    - value: stringlist | Binding - The list of currently selected values. This should be bound to a string array in the data model.
    [OPTIONAL]
    - label: string | Binding - The label for the group of options.
    - variant: string - A hint for how the choice picker should be displayed and behave.

**Dropdown**
  Properties:
    [REQUIRED]
    - options: undefined - The list of available options to choose from. Can be a literal array or a data binding to a list in the data model.
    - value: string | Binding - The currently selected value. This should be bound to a string in the data model.
    [OPTIONAL]
    - label: string | Binding - The label for the dropdown.
    - hideLabel: boolean - When true, hides the label above the dropdown. Use this when the Dropdown is inside a GridLayout — the column headers already act as labels.
    - placeholder: string | Binding - Placeholder text shown when no option is selected.

**Slider**
  Properties:
    [REQUIRED]
    - min: number - The minimum value of the slider.
    - max: number - The maximum value of the slider.
    - value: number | Binding - The current value of the slider.
    [OPTIONAL]
    - label: string | Binding - The label for the slider.

**Spacer**
  Properties:
    [OPTIONAL]
    - width: undefined - The width of the spacer. If a number is provided, it is treated as pixels. Defaults to '16px'.
    - height: undefined - The height of the spacer. If a number is provided, it is treated as pixels. Defaults to '16px'.

**Markdown**
  Properties:
    [REQUIRED]
    - text: string | Binding - The markdown content to display.

**DateTimeInput**
  Properties:
    [REQUIRED]
    - value: string | Binding - The selected date and/or time value in ISO 8601 format. If not yet set, initialize with an empty string.
    [OPTIONAL]
    - enableDate: boolean - If true, allows the user to select a date.
    - enableTime: boolean - If true, allows the user to select a time.
    - min: undefined - The minimum allowed date/time in ISO 8601 format.
    - max: undefined - The maximum allowed date/time in ISO 8601 format.
    - label: string | Binding - The text label for the input field.

**GridLayout**
  Properties:
    [REQUIRED]
    - children: string[] | ChildTemplate - Defines the row content. Use a template object { componentId, path } to generate rows from a data list. The componentId should reference a Row component containing Text components for each column.
    [OPTIONAL]
    - headers: array[string | Binding] - The column header labels displayed in the header row.
    - rowPadding: string | Binding - CSS padding applied to every cell in each data row. Use this to control row height and vertical spacing. Defaults to '10px 16px'. Example: '16px' for taller rows with more breathing room.
  Supports children: yes

### Available Functions:

**required**
  Checks that the value is not null, undefined, or empty.

**regex**
  Checks that the value matches a regular expression string.

**length**
  Checks string length constraints.

**numeric**
  Checks numeric range constraints.

**email**
  Checks that the value is a valid email address.

**formatString**
  Performs string interpolation of data model values and other functions in the catalog functions list and returns the resulting string. The value string can contain interpolated expressions in the `${expression}` format. Supported expression types include: JSON Pointer paths to the data model (e.g., `${/absolute/path}` or `${relative/path}`), and client-side function calls (e.g., `${now()}`). Function arguments must be literals (quoted strings, numbers, booleans) or nested expressions (e.g., `${formatDate(${/currentDate}, 'MM-dd')}`). To include a literal `${` sequence, escape it as `\${`.

**formatNumber**
  Formats a number with the specified grouping and decimal precision.

**formatCurrency**
  Formats a number as a currency string.

**formatDate**
  Formats a timestamp into a string using a pattern.

**pluralize**
  Returns a localized string based on the Common Locale Data Repository (CLDR) plural category of the count (zero, one, two, few, many, other). Requires an 'other' fallback. For English, just use 'one' and 'other'.

**openUrl**
  Opens the specified URL in a browser or handler. This function has no return value.

**not**
  Returns the logical negation of the value.

**and**
  Returns true if all arguments are truthy.

**or**
  Returns true if any argument is truthy.

**isEmpty**
  Returns true if the value is null, undefined, empty string, empty array, or empty object.

**eq**
  Returns true if the two values are strictly equal.

**neq**
  Returns true if the two values are not equal.

**gt**
  Returns true if the first value is greater than the second (converted to numbers).

**gte**
  Returns true if the first value is greater than or equal to the second (converted to numbers).

**lt**
  Returns true if the first value is less than the second (converted to numbers).

**lte**
  Returns true if the first value is less than or equal to the second (converted to numbers).
