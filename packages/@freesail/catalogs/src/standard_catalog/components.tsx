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
import { standardCatalogFunctions } from './functions.js';

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
    alignItems: (component['align'] as CSSProperties['alignItems']) ?? 'start',
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
    padding: (component['padding'] as string) ?? '1.5rem',
    width: (component['width'] as string) ?? undefined,
    height: (component['height'] as string) ?? undefined,
    borderRadius: (component['borderRadius'] as string) ?? 'var(--freesail-radius-md)',
    border: '1px solid var(--freesail-border, #e2e8f0)',
    boxShadow: 'var(--freesail-shadow-sm)',
    background: (component['background'] as string) ?? 'var(--freesail-bg-surface, #ffffff)',
    color: 'var(--freesail-text-main, #0f172a)',
  };

  return <div style={style}>{children}</div>;
}

/**
 * GridLayout - displays tabular data with column headers and styled rows.
 * Follows A2UI composition: headers come from props, row content is
 * composed using existing Row/Text components via the children template.
 *
 * Uses CSS Grid for column alignment. `display: contents` on the Row
 * wrapper makes its children (Text components) become direct grid cells,
 * aligning them under each column header.
 */
export function GridLayout({ component, children }: FreesailComponentProps) {
  const headers = (component['headers'] as string[]) ?? [];
  const colCount = headers.length || 1;
  const childArray = Array.isArray(children) ? children : children ? [children] : [];

  // Unique class scoped to this grid instance for CSS targeting
  const gridClass = `freesail-grid-${component['id'] ?? 'default'}`;

  const wrapperStyle: CSSProperties = {
    width: '100%',
    overflowX: 'auto',
    border: '1px solid var(--freesail-border, #e2e8f0)',
    borderRadius: 'var(--freesail-radius-md, 8px)',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${colCount}, minmax(min-content, 1fr))`,
    minWidth: '100%',
    fontSize: '14px',
    color: 'var(--freesail-text-main, #0f172a)',
  };

  const headerCellStyle: CSSProperties = {
    padding: '10px 16px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--freesail-text-muted, #64748b)',
    background: 'var(--freesail-bg-muted, #f1f5f9)',
    borderBottom: '2px solid var(--freesail-border, #e2e8f0)',
  };

  const cellStyle: CSSProperties = {
    padding: '10px 16px',
    borderBottom: '1px solid var(--freesail-border, #e2e8f0)',
  };

  return (
    <>
      {/* Make the Row wrapper and its flex div transparent to the grid */}
      <style>{`
        .${gridClass} > .freesail-grid-row,
        .${gridClass} > .freesail-grid-row > div {
          display: contents !important;
        }
        .${gridClass} > .freesail-grid-row > div > * {
          padding: 10px 16px;
          border-bottom: 1px solid var(--freesail-border, #e2e8f0);
        }
        .${gridClass} > .freesail-grid-row:nth-child(odd) > div > * {
          background: var(--freesail-bg-surface, #ffffff);
        }
        .${gridClass} > .freesail-grid-row:nth-child(even) > div > * {
          background: var(--freesail-bg-muted, #f8fafc);
        }
      `}</style>
      <div style={wrapperStyle}>
        <div className={gridClass} style={gridStyle}>
          {/* Header row */}
          {headers.map((header, i) => (
            <div key={`h-${i}`} style={headerCellStyle}>{String(header)}</div>
          ))}
          {/* Data rows — each child is a Row component */}
          {childArray.map((child, i) => (
            <div key={`r-${i}`} className="freesail-grid-row">
              {child}
            </div>
          ))}
        </div>
      </div>
    </>
  );
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
export function Button({ component, children, onAction, onFunctionCall }: FreesailComponentProps) {
  // v0.9: Use child component for label, or fallback to label prop
  const label = children ?? (component['label'] as string) ?? 'Button';
  const variant = (component['variant'] as string) ?? 'primary';
  const disabled = (component['disabled'] as boolean) ?? false;
  
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);
  const isDisabled = disabled || !!validationError;

  // v0.9 action structure
  const action = component['action'] as { 
      event?: { name: string; context?: Record<string, unknown> },
      functionCall?: any // LocalAction
  } | undefined;
  
  const actionName = action?.event?.name ?? (component['action'] as string) ?? 'button_click';
  // Pass context as-is — the framework resolves data bindings at dispatch time
  const actionContext = action?.event?.context ?? {};

  const baseStyle: CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: 'var(--freesail-radius-md)',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    opacity: disabled ? 0.6 : 1,
  };

  const variantStyles: Record<string, CSSProperties> = {
    primary: { background: 'var(--freesail-primary, #2563eb)', color: 'var(--freesail-primary-text, #ffffff)' },
    secondary: { background: 'var(--freesail-bg-muted, #f1f5f9)', color: 'var(--freesail-text-main, #0f172a)' },
    outline: { background: 'transparent', border: '1px solid var(--freesail-border, #e2e8f0)', color: 'var(--freesail-text-main, #0f172a)' },
    borderless: { background: 'transparent', color: 'var(--freesail-primary, #2563eb)' },
    danger: { background: 'var(--freesail-error, #ef4444)', color: '#fff' },
  };

  const style = { ...baseStyle, ...variantStyles[variant] };

  const handleClick = () => {
    if (isDisabled) return;

    if (action?.functionCall && onFunctionCall) {
        onFunctionCall(action.functionCall);
        return;
    }

    if (onAction) {
        // Always dispatch the server action as requested
        onAction(actionName, actionContext);

        // Hybrid handling: If the action name matches a known standard function,
        // execute it locally as well. This supports agents that use Server Actions
        // interchangeably with Local Actions for standard capabilities.
        if (onFunctionCall) {
            const funcs = standardCatalogFunctions as Record<string, any>;
            // Check direct match
            let targetFunction = funcs[actionName] ? actionName : null;
            
            // Check snake_case -> camelCase conversion (e.g. open_url -> openUrl)
            if (!targetFunction && actionName.includes('_')) {
                 const camelName = actionName.replace(/_([a-z])/g, (_match, p1) => p1.toUpperCase());
                 if (funcs[camelName]) {
                     targetFunction = camelName;
                 }
            }

            if (targetFunction) {
                onFunctionCall({
                    call: targetFunction,
                    args: actionContext as Record<string, any>
                });
            }
        }
    }
  };

  return (
    <button 
      type="button" 
      style={style} 
      onClick={handleClick} 
      disabled={isDisabled}
      title={validationError || undefined}
    >
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

  // Validation checks
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  // Extract the bound data model path for two-way binding.
  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path ? rawValue.path : null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (onDataChange && boundPath) {
      onDataChange(boundPath, newValue);
    }
  };
  
  // Basic styles
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '8px',
  };
  
  const labelStyle: CSSProperties = {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--freesail-text-main, #0f172a)',
  };
  
  const inputStyle: CSSProperties = {
    padding: '0.5rem 0.75rem',
    borderRadius: 'var(--freesail-radius-md)',
    border: validationError ? '1px solid var(--freesail-error, #ef4444)' : '1px solid var(--freesail-border, #e2e8f0)',
    fontSize: '14px',
    boxSizing: 'border-box',
    backgroundColor: 'var(--freesail-bg-root, #ffffff)',
    color: 'var(--freesail-text-main, #0f172a)',
  };

  const errorStyle: CSSProperties = {
    fontSize: '12px',
    color: 'var(--freesail-error, #ef4444)',
    marginTop: '2px',
  };

  return (
    <div style={containerStyle}>
      {label && <label style={labelStyle}>{label}</label>}
      {variant === 'longText' ? (
        <textarea 
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
        />
      ) : (
        <input 
          type={variant === 'obscured' ? 'password' : variant === 'number' ? 'number' : 'text'}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          style={inputStyle}
        />
      )}
      {validationError && <div style={errorStyle}>{validationError}</div>}
    </div>
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
  const color = (component['color'] as string) ?? 'var(--freesail-border, #e2e8f0)';

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
    borderBottom: '1px solid var(--freesail-border, #e2e8f0)',
    marginBottom: '1rem',
  };

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    borderBottom: active ? '2px solid var(--freesail-primary, #2563eb)' : '2px solid transparent',
    color: active ? 'var(--freesail-primary, #2563eb)' : 'var(--freesail-text-muted, #64748b)',
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
 * When embed=true, renders an iframe for YouTube/Vimeo sources.
 * Otherwise, uses a native <video> element for direct file URLs.
 */
export function Video({ component }: FreesailComponentProps) {
  const url = String((component['url'] as string) ?? '');
  const embed = Boolean(component['embed']);

  const style: CSSProperties = {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '8px',
  };

  if (embed) {
    // Detect YouTube URLs and convert to embed format
    const youtubeMatch = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/
    );
    if (youtubeMatch) {
      const videoId = youtubeMatch[1];
      return (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          style={{ ...style, width: '100%', aspectRatio: '16 / 9', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }

    // Detect Vimeo URLs and convert to embed format
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      const videoId = vimeoMatch[1];
      return (
        <iframe
          src={`https://player.vimeo.com/video/${videoId}`}
          style={{ ...style, width: '100%', aspectRatio: '16 / 9', border: 'none' }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      );
    }

    // Generic iframe fallback for other embed URLs
    return (
      <iframe
        src={url}
        style={{ ...style, width: '100%', aspectRatio: '16 / 9', border: 'none' }}
        allowFullScreen
      />
    );
  }

  // Native <video> for direct file URLs (mp4, webm, etc.)
  return <video src={url} controls style={style} />;
}

/**
 * AudioPlayer - displays an audio player with optional description.
 * When embed=true, renders an iframe for Spotify/SoundCloud sources.
 * Otherwise, uses a native <audio> element for direct file URLs.
 */
export function AudioPlayer({ component }: FreesailComponentProps) {
  const url = String((component['url'] as string) ?? '');
  const description = String((component['description'] as string) ?? '');
  const embed = Boolean(component['embed']);

  const descriptionEl = description ? (
    <div style={{ fontSize: '14px', color: 'var(--freesail-text-muted, #64748b)' }}>{description}</div>
  ) : null;

  if (embed) {
    // Detect Spotify URLs (track, album, playlist, episode)
    const spotifyMatch = url.match(
      /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/
    );
    if (spotifyMatch) {
      const [, type, id] = spotifyMatch;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {descriptionEl}
          <iframe
            src={`https://open.spotify.com/embed/${type}/${id}`}
            style={{ width: '100%', height: type === 'track' ? '152px' : '352px', border: 'none', borderRadius: '12px' }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
        </div>
      );
    }

    // Detect SoundCloud URLs
    if (url.includes('soundcloud.com')) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {descriptionEl}
          <iframe
            src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&show_artwork=true`}
            style={{ width: '100%', height: '166px', border: 'none' }}
            allow="autoplay"
          />
        </div>
      );
    }

    // Generic iframe fallback for other embed URLs
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {descriptionEl}
        <iframe
          src={url}
          style={{ width: '100%', height: '166px', border: 'none', borderRadius: '12px' }}
          allow="autoplay"
        />
      </div>
    );
  }

  // Fallback: native <audio> for direct file URLs (mp3, wav, ogg, etc.)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {descriptionEl}
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
        <span style={{ fontSize: '13px', color: 'var(--freesail-text-muted, #64748b)', minWidth: '32px' }}>{localValue}</span>
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
          padding: '0.5rem 0.75rem',
          borderRadius: 'var(--freesail-radius-md)',
          border: '1px solid var(--freesail-border, #e2e8f0)',
          fontSize: '14px',
          backgroundColor: 'var(--freesail-bg-root, #ffffff)',
          color: 'var(--freesail-text-main, #0f172a)',
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
          style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--freesail-radius-md)', border: '1px solid var(--freesail-border, #e2e8f0)', backgroundColor: 'var(--freesail-bg-root, #ffffff)', color: 'var(--freesail-text-main, #0f172a)' }}
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
        style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--freesail-radius-md)', border: '1px solid var(--freesail-border, #e2e8f0)', fontSize: '14px', backgroundColor: 'var(--freesail-bg-root, #ffffff)', color: 'var(--freesail-text-main, #0f172a)' }}
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
    backgroundColor: 'var(--freesail-bg-surface, #ffffff)',
    color: 'var(--freesail-text-main, #0f172a)',
    padding: '1.5rem',
    borderRadius: 'var(--freesail-radius-lg)',
    maxWidth: '90%',
    maxHeight: '90%',
    overflow: 'auto',
    position: 'relative',
    boxShadow: 'var(--freesail-shadow-md)',
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
  GridLayout,
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

// =============================================================================
// Helper Functions
// =============================================================================

function validateChecks(checks: any[]): string | null {
  if (!Array.isArray(checks)) return null;
  for (const check of checks) {
    // If condition is explicitly FALSE, the check failed.
    // (Assuming true = valid state)
    // Note: Falsy values like undefined/null are ignored (considered valid) to avoid
    // blocking on initial render if checks haven't run or are pending.
    // But boolean false is a definitive failure.
    if (check.condition === false) {
      return (check.message as string) || 'Validation failed';
    }
  }
  return null;
}
