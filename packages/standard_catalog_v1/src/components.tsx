/**
 * @fileoverview Standard Catalog Components
 *
 * Basic UI components that ship with Freesail.
 * These form the "standard_catalog_v1" vocabulary.
 *
 * Built as a standalone package using the Freesail SDK, exactly
 * the way any external developer would create a custom catalog.
 */

import React, { useState, useEffect, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import type { FreesailComponentProps } from '@freesail/react';

// =============================================================================
// Layout Components
// =============================================================================

/**
 * Column layout - stacks children vertically.
 */
export function Column({ component, children }: FreesailComponentProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: (component['gap'] as string) ?? '8px',
    padding: (component['padding'] as string) ?? undefined,
    alignItems: (component['align'] as CSSProperties['alignItems']) ?? 'stretch',
    flex: component['weight'] ? (component['weight'] as number) : undefined,
  };

  return <div style={style}>{children}</div>;
}

/**
 * Row layout - arranges children horizontally.
 */
export function Row({ component, children }: FreesailComponentProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap: (component['gap'] as string) ?? '8px',
    padding: (component['padding'] as string) ?? undefined,
    alignItems: (component['align'] as CSSProperties['alignItems']) ?? 'center',
    justifyContent: mapJustify(component['justify'] as string),
    flexWrap: (component['wrap'] as CSSProperties['flexWrap']) ?? 'nowrap',
  };

  return <div style={style}>{children}</div>;
}

function mapJustify(justify: string | undefined): CSSProperties['justifyContent'] {
  switch (justify) {
    case 'start': return 'flex-start';
    case 'end': return 'flex-end';
    case 'center': return 'center';
    case 'spaceBetween': return 'space-between';
    case 'spaceAround': return 'space-around';
    default: return 'flex-start';
  }
}

/**
 * Card - a contained surface with optional border and shadow.
 */
export function Card({ component, children }: FreesailComponentProps) {
  const style: CSSProperties = {
    padding: (component['padding'] as string) ?? '16px',
    borderRadius: (component['borderRadius'] as string) ?? '8px',
    border: '1px solid #e0e0e0',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    background: (component['background'] as string) ?? '#fff',
  };

  return <div style={style}>{children}</div>;
}

// =============================================================================
// Text Components
// =============================================================================

/**
 * Text - displays text content with Markdown support.
 */
export function Text({ component }: FreesailComponentProps) {
  // Text value may come from resolved data binding
  const rawText = component['text'] ?? '';
  const text = String(rawText);

  const style: CSSProperties = {
    fontSize: (component['size'] as string) ?? '14px',
    fontWeight: (component['weight'] as CSSProperties['fontWeight']) ?? 'normal',
    color: (component['color'] as string) ?? 'inherit',
    margin: 0,
  };

  const variant = (component['variant'] as string) ?? 'body';

  // Simple markdown heading detection
  if (text.startsWith('# ')) {
    return <h1 style={{ ...style, fontSize: '2em', fontWeight: 'bold' }}>{text.slice(2)}</h1>;
  }
  if (text.startsWith('## ')) {
    return <h2 style={{ ...style, fontSize: '1.5em', fontWeight: 'bold' }}>{text.slice(3)}</h2>;
  }
  if (text.startsWith('### ')) {
    return <h3 style={{ ...style, fontSize: '1.17em', fontWeight: 'bold' }}>{text.slice(4)}</h3>;
  }

  switch (variant) {
    case 'h1':
      return <h1 style={{ ...style, fontSize: '2em', fontWeight: 'bold' }}>{text}</h1>;
    case 'h2':
      return <h2 style={{ ...style, fontSize: '1.5em', fontWeight: 'bold' }}>{text}</h2>;
    case 'h3':
      return <h3 style={{ ...style, fontSize: '1.17em', fontWeight: 'bold' }}>{text}</h3>;
    case 'caption':
    case 'label':
      return <label style={{ ...style, fontWeight: '500', fontSize: '12px' }}>{text}</label>;
    default:
      return <span style={style}>{text}</span>;
  }
}

/**
 * Markdown - displays full markdown content.
 */
export function Markdown({ component }: FreesailComponentProps) {
  const rawText = component['text'] ?? '';
  const text = String(rawText);

  const style: CSSProperties = {
    fontSize: (component['size'] as string) ?? '14px',
    color: (component['color'] as string) ?? 'inherit',
    lineHeight: 1.5,
  };

  return (
    <div style={style}>
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}

// =============================================================================
// Interactive Components
// =============================================================================

/**
 * Button - clickable action trigger.
 * Supports v0.9 action format with event.name and event.context.
 */
export function Button({ component, children, onAction }: FreesailComponentProps) {
  // v0.9: Use child component for label, or fallback to label prop
  const label = children ?? (component['label'] as string) ?? 'Button';
  const variant = (component['variant'] as string) ?? 'primary';
  const disabled = (component['disabled'] as boolean) ?? false;

  // v0.9 action structure
  const action = component['action'] as { event?: { name: string; context?: Record<string, unknown> } } | undefined;
  const actionName = action?.event?.name ?? (component['action'] as string) ?? 'button_click';
  // Pass context as-is — the framework resolves data bindings at dispatch time
  const actionContext = action?.event?.context ?? {};

  const baseStyle: CSSProperties = {
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    opacity: disabled ? 0.6 : 1,
  };

  const variantStyles: Record<string, CSSProperties> = {
    primary: { background: '#007bff', color: '#fff' },
    secondary: { background: '#6c757d', color: '#fff' },
    outline: { background: 'transparent', border: '1px solid #007bff', color: '#007bff' },
    borderless: { background: 'transparent', color: '#007bff' },
    danger: { background: '#dc3545', color: '#fff' },
  };

  const style = { ...baseStyle, ...variantStyles[variant] };

  const handleClick = () => {
    if (!disabled && onAction) {
      onAction(actionName, actionContext);
    }
  };

  return (
    <button type="button" style={style} onClick={handleClick} disabled={disabled}>
      {label}
    </button>
  );
}

/**
 * TextField - text input field with two-way binding.
 */
export function TextField({ component, onAction, onDataChange }: FreesailComponentProps) {
  const label = (component['label'] as string) ?? '';
  const name = (component['name'] as string) ?? component.id;
  const placeholder = (component['placeholder'] as string) ?? label;
  const variant = (component['variant'] as string) ?? 'shortText';
  const value = (component['value'] as string) ?? '';

  // Extract the bound data model path for two-way binding.
  // The raw component value may be a DataBinding like {"path": "/formData/email"}
  // which was resolved to the actual string by the framework. We need the
  // original path to know WHERE to write back.
  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path ? rawValue.path : null;

  const [localValue, setLocalValue] = useState(value);

  // Sync if the bound value changes externally (e.g. agent updates data model)
  useEffect(() => { setLocalValue(value); }, [value]);

  const style: CSSProperties = {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  };

  // Determine write-back path: explicit binding, or auto-bind fallback
  const writePath = boundPath ?? `/input/${component.id}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    // Two-way binding: write back to the local data model
    if (onDataChange) {
      onDataChange(writePath, newValue);
    }
  };

  if (variant === 'longText') {
    return (
      <textarea
        style={{ ...style, minHeight: '100px', resize: 'vertical' }}
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        name={name}
      />
    );
  }

  return (
    <input
      style={style}
      type="text"
      placeholder={placeholder}
      value={localValue}
      onChange={handleChange}
      name={name}
    />
  );
}

/**
 * CheckBox - checkbox with label.
 */
export function CheckBox({ component, onDataChange }: FreesailComponentProps) {
  const label = (component['label'] as string) ?? '';
  const checked = (component['value'] as boolean) ?? false;
  const rawValue = component['__rawValue'] as { path?: string } | boolean | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path ? rawValue.path : null;
  const [localChecked, setLocalChecked] = useState(checked);

  useEffect(() => { setLocalChecked(checked); }, [checked]);

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  };

  return (
    <label style={style}>
      <input
        type="checkbox"
        checked={localChecked}
        onChange={(e) => {
          const writePath = boundPath ?? `/input/${component.id}`;
          setLocalChecked(e.target.checked);
          if (onDataChange) {
            onDataChange(writePath, e.target.checked);
          }
        }}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Input - legacy text input field (for backward compatibility).
 
export function Input({ component, onAction, onDataChange }: FreesailComponentProps) {
  const placeholder = (component['placeholder'] as string) ?? '';
  const inputType = (component['inputType'] as string) ?? 'text';
  const name = (component['name'] as string) ?? component.id;
  const value = (component['value'] as string) ?? '';
  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path ? rawValue.path : null;

  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  const style: CSSProperties = {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
  };

  // Determine write-back path: explicit binding, or auto-bind fallback
  const writePath = boundPath ?? `/input/${component.id}`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    if (onDataChange) {
      onDataChange(writePath, newValue);
    }
  };

  return (
    <input
      style={style}
      type={inputType}
      placeholder={placeholder}
      name={name}
      value={localValue}
      onChange={handleChange}
    />
  );
}
*/
// =============================================================================
// Display Components
// =============================================================================

/**
 * Image - displays an image.
 */
export function Image({ component }: FreesailComponentProps) {
  const src = String((component['src'] as string) ?? (component['url'] as string) ?? '');
  const alt = String((component['alt'] as string) ?? '');

  const style: CSSProperties = {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: (component['borderRadius'] as string) ?? '0',
  };

  return <img src={src} alt={alt} style={style} />;
}

/**
 * Icon - displays a system icon.
 */
export function Icon({ component }: FreesailComponentProps) {
  const name = String((component['name'] as string) ?? 'circle');
  const size = (component['size'] as string) ?? '24px';
  const color = (component['color'] as string) ?? 'currentColor';

  // Simple icon implementation using unicode/emoji fallbacks
  const iconMap: Record<string, string> = {
    mail: '✉️',
    check: '✓',
    close: '✕',
    menu: '☰',
    search: '🔍',
    user: '👤',
    settings: '⚙️',
    home: '🏠',
    star: '⭐',
    heart: '❤️',
    circle: '●',
  } as const;

  const style: CSSProperties = {
    fontSize: size,
    color,
    lineHeight: 1,
  };

  return <span style={style}>{iconMap[name as keyof typeof iconMap] ?? iconMap['circle']}</span>;
}

/**
 * Divider - horizontal or vertical line separator.
 */
export function Divider({ component }: FreesailComponentProps) {
  const axis = (component['axis'] as string) ?? 'horizontal';
  const color = (component['color'] as string) ?? '#e0e0e0';

  if (axis === 'vertical') {
    return (
      <div
        style={{
          width: '1px',
          alignSelf: 'stretch',
          backgroundColor: color,
          margin: '0 8px',
        }}
      />
    );
  }

  const style: CSSProperties = {
    border: 'none',
    borderTop: `1px solid ${color}`,
    margin: (component['margin'] as string) ?? '16px 0',
    width: '100%',
  };

  return <hr style={style} />;
}

/**
 * Spacer - empty space for layout.
*/
export function Spacer({ component }: FreesailComponentProps) {
  const rawWidth = component['width'] ?? '16px';
  const width = typeof rawWidth === 'number' ? `${rawWidth}px` : String(rawWidth);
  const rawHeight = component['height'] ?? '16px';
  const height = typeof rawHeight === 'number' ? `${rawHeight}px` : String(rawHeight);

  return <div style={{ height, width }} />;
}


/**
 * List - scrollable list of components.
 */
export function List({ component, children }: FreesailComponentProps) {
  const maxHeight = (component['maxHeight'] as string) ?? 'auto';

  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight,
    overflowY: maxHeight !== 'auto' ? 'auto' : undefined,
  };

  return <div style={style}>{children}</div>;
}

/**
 * Tabs - tabbed container.
 */
export function Tabs({ component, children }: FreesailComponentProps) {
  const tabsProp = component['tabs'];
  const tabs: Array<{ title: string; child: string }> = Array.isArray(tabsProp) ? tabsProp : [];
  const [activeTab, setActiveTab] = useState(0);

  const tabBarStyle: CSSProperties = {
    display: 'flex',
    borderBottom: '1px solid #e0e0e0',
    marginBottom: '16px',
  };

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '8px 16px',
    cursor: 'pointer',
    borderBottom: active ? '2px solid #007bff' : '2px solid transparent',
    color: active ? '#007bff' : '#666',
    fontWeight: active ? '500' : 'normal',
  });

  return (
    <div>
      <div style={tabBarStyle}>
        {tabs.map((tab, index) => (
          <div
            key={index}
            style={tabStyle(index === activeTab)}
            onClick={() => setActiveTab(index)}
          >
            {tab.title}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {React.Children.toArray(children)[activeTab]}
      </div>
    </div>
  );
}

// =============================================================================
// Export catalog components map
// =============================================================================


// =============================================================================
// Media Components
// =============================================================================

/**
 * Video - displays a video player.
 */
export function Video({ component }: FreesailComponentProps) {
  const url = String((component['url'] as string) ?? '');

  const style: CSSProperties = {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '8px',
  };

  return <video src={url} controls style={style} />;
}

/**
 * AudioPlayer - displays an audio player with optional description.
 */
export function AudioPlayer({ component }: FreesailComponentProps) {
  const url = String((component['url'] as string) ?? '');
  const description = String((component['description'] as string) ?? '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {description && <div style={{ fontSize: '14px', color: '#555' }}>{description}</div>}
      <audio src={url} controls style={{ width: '100%' }} />
    </div>
  );
}

// =============================================================================
// Form Components
// =============================================================================

/**
 * Slider - range input.
 */
export function Slider({ component, onDataChange }: FreesailComponentProps) {
  const label = String((component['label'] as string) ?? '');
  const min = Number((component['min'] as number) ?? 0);
  const max = Number((component['max'] as number) ?? 100);
  const value = Number((component['value'] as number) ?? min);

  const rawValue = component['__rawValue'] as { path?: string } | number | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path ? rawValue.path : null;

  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setLocalValue(newValue);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) {
      onDataChange(writePath, newValue);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label style={{ fontSize: '14px', fontWeight: 500 }}>{label}</label>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="range"
          min={min}
          max={max}
          value={localValue}
          onChange={handleChange}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: '13px', color: '#666', minWidth: '32px' }}>{localValue}</span>
      </div>
    </div>
  );
}

/**
 * DateTimeInput - date/time picker.
 */
export function DateTimeInput({ component, onDataChange }: FreesailComponentProps) {
  const label = (component['label'] as string) ?? '';
  const value = (component['value'] as string) ?? '';
  const enableDate = (component['enableDate'] as boolean) ?? true;
  const enableTime = (component['enableTime'] as boolean) ?? false;

  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path ? rawValue.path : null;

  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  const inputType = enableDate && enableTime ? 'datetime-local' : enableTime ? 'time' : 'date';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) {
      onDataChange(writePath, newValue);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label style={{ fontSize: '14px', fontWeight: 500 }}>{label}</label>}
      <input
        type={inputType}
        value={localValue}
        onChange={handleChange}
        style={{
          padding: '8px',
          borderRadius: '4px',
          border: '1px solid #ccc',
          fontSize: '14px',
        }}
      />
    </div>
  );
}

/**
 * ChoicePicker - select or radio group.
 */
export function ChoicePicker({ component, onDataChange }: FreesailComponentProps) {
  const label = String((component['label'] as string) ?? '');
  const variant = (component['variant'] as string) ?? 'mutuallyExclusive';

  const rawOptions = component['options'];

  // Normalize options: handle both string arrays and object arrays
  // Agent might send ["Option1", "Option2"] or [{label: "...", value: "..."}]
  const options: Array<{ label: string; value: string }> = Array.isArray(rawOptions)
    ? rawOptions.map((opt) => {
      if (typeof opt === 'string') {
        // String array: auto-generate value from label
        return { label: opt, value: opt.toLowerCase().replace(/\s+/g, '_') };
      } else if (opt && typeof opt === 'object' && 'label' in opt && 'value' in opt) {
        // Object array: use as-is
        return { label: String(opt.label), value: String(opt.value) };
      } else {
        // Malformed option: fallback to empty
        return { label: '', value: '' };
      }
    })
    : [];

  // Value is a list of strings
  const rawValueList = component['value'];
  const value: string[] = Array.isArray(rawValueList) ? rawValueList : [];

  const rawValue = component['__rawValue'] as { path?: string } | string[] | undefined;
  const boundPath = (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue) && 'path' in rawValue) ? (rawValue as { path?: string }).path : null;

  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = [e.target.value];
    setLocalValue(newValue);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) {
      onDataChange(writePath, newValue);
    }
  };

  const handleRadioChange = (val: string) => {
    const newValue = [val];
    setLocalValue(newValue);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) {
      onDataChange(writePath, newValue);
    }
  };

  // Multiple selection via checkboxes
  const handleCheckboxChange = (val: string, checked: boolean) => {
    let newValue = [...localValue];
    if (checked) {
      if (!newValue.includes(val)) newValue.push(val);
    } else {
      newValue = newValue.filter(v => v !== val);
    }
    setLocalValue(newValue);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) {
      onDataChange(writePath, newValue);
    }
  };

  if (variant === 'multipleSelection') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {label && <div style={{ fontSize: '14px', fontWeight: 500 }}>{label}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {options.map((opt) => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={localValue.includes(opt.value)}
                onChange={(e) => handleCheckboxChange(opt.value, e.target.checked)}
              />
              <span style={{ fontSize: '14px' }}>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  // Default: mutuallyExclusive (Radio or Select)
  // Use select for > 5 options, otherwise radio
  if (options.length > 5) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {label && <label style={{ fontSize: '14px', fontWeight: 500 }}>{label}</label>}
        <select
          value={localValue[0] ?? ''}
          onChange={handleSelectChange}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="" disabled>Select an option</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {label && <div style={{ fontSize: '14px', fontWeight: 500 }}>{label}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {options.map((opt) => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="radio"
              name={component.id}
              checked={localValue.includes(opt.value)}
              onChange={() => handleRadioChange(opt.value)}
            />
            <span style={{ fontSize: '14px' }}>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Dropdown - A select dropdown for choosing a single option.
 */
export function Dropdown({ component, onDataChange }: FreesailComponentProps) {
  const label = component['label'] as string | undefined;
  const placeholder = (component['placeholder'] as string | undefined) ?? 'Select an option';

  const rawOptions = component['options'];

  // Normalize options: handle both string arrays and object arrays
  const options: Array<{ label: string; value: string }> = Array.isArray(rawOptions)
    ? rawOptions.map((opt) => {
      if (typeof opt === 'string') {
        return { label: opt, value: opt.toLowerCase().replace(/\s+/g, '_') };
      } else if (opt && typeof opt === 'object' && 'label' in opt && 'value' in opt) {
        return { label: String(opt.label), value: String(opt.value) };
      } else {
        return { label: '', value: '' };
      }
    })
    : [];

  // Value is a single string
  const rawValueString = component['value'];
  const value: string = typeof rawValueString === 'string' ? rawValueString : '';

  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue) && 'path' in rawValue) ? (rawValue as { path?: string }).path : null;

  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) {
      onDataChange(writePath, newValue);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label style={{ fontSize: '14px', fontWeight: 500 }}>{label}</label>}
      <select
        value={localValue}
        onChange={handleChange}
        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px' }}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * Modal - displays content in a dialog.
 */
export function Modal({ component, children }: FreesailComponentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerVariant = (component['triggerVariant'] as string) ?? 'click';

  const [trigger, content] = React.Children.toArray(children);

  const modalOverlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalContentStyle: CSSProperties = {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '8px',
    maxWidth: '90%',
    maxHeight: '90%',
    overflow: 'auto',
    position: 'relative',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  };

  const closeButtonStyle: CSSProperties = {
    position: 'absolute',
    top: '8px',
    right: '8px',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    fontSize: '20px',
  };

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        style={{ cursor: triggerVariant === 'click' ? 'pointer' : 'default' }}
      >
        {trigger}
      </div>

      {isOpen && (
        <div style={modalOverlayStyle} onClick={() => setIsOpen(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button style={closeButtonStyle} onClick={() => setIsOpen(false)}>
              &times;
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}

export const standardCatalogComponents = {
  Column,
  Row,
  Card,
  Text,
  Button,
  TextField,
  CheckBox,
  Image,
  Video,
  AudioPlayer,
  Icon,
  Divider,
  List,
  Tabs,
  Slider,
  DateTimeInput,
  ChoicePicker,
  Dropdown,
  Modal,
  Spacer,
  Markdown
};
