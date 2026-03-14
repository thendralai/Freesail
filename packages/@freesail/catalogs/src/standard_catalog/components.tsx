/**
 * @fileoverview Standard Catalog Components
 *
 * Standard-specific UI components that extend the common set.
 * These form the "standard_catalog_v1" vocabulary together with
 * the common components imported from ../common/.
 */

import React, { useState, useEffect, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import type { FreesailComponentProps } from '@freesail/react';
import { commonComponents, getSemanticColor, validateChecks } from '../common/CommonComponents.js';

/** Sanitize a string for safe use in CSS class names / values. */
function sanitizeCssIdent(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function sanitizeCssValue(value: string): string {
  return value.replace(/[;{}"'<>\\]/g, '');
}

/** Check that a URL is safe for use in src attributes (http/https only). */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// =============================================================================
// Layout Components
// =============================================================================

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
  const gridClass = `freesail-grid-${sanitizeCssIdent(String(component['id'] ?? 'default'))}`;
  const rowPadding = sanitizeCssValue((component['rowPadding'] as string) ?? '10px 16px');

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

  return (
    <>
      {/* Make the Row wrapper and its flex div transparent to the grid */}
      <style>{`
        .${gridClass} > .freesail-grid-row,
        .${gridClass} > .freesail-grid-row > div {
          display: contents !important;
        }
        .${gridClass} > .freesail-grid-row > div > * {
          padding: ${rowPadding};
          border-bottom: 1px solid var(--freesail-border, #e2e8f0);
        }
        .${gridClass} > .freesail-grid-row > div > button {
          width: fit-content;
          align-self: center;
          justify-self: start;
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
          {headers.map((header, i) => {
            const headerText = typeof header === 'object' && header !== null && 'label' in header 
              ? String((header as any).label)
              : String(header);
            return <div key={`h-${i}`} style={headerCellStyle}>{headerText}</div>;
          })}
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
 * Markdown - displays full markdown content.
 */
export function Markdown({ component }: FreesailComponentProps) {
  const rawText = component['text'] ?? '';
  const text = typeof rawText === 'object' && rawText !== null 
    ? JSON.stringify(rawText) 
    : String(rawText);

  const style: CSSProperties = {
    fontSize: (component['size'] as string) ?? '14px',
    color: getSemanticColor(component['color'] as string) ?? 'inherit',
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
 * CheckBox - checkbox with label.
 */
export function CheckBox({ component, onDataChange }: FreesailComponentProps) {
  const label = (component['label'] as string) ?? '';
  const checked = (component['value'] as boolean) ?? false;
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
      {validationError && <div style={{ fontSize: '12px', color: 'var(--freesail-error, #ef4444)' }}>{validationError}</div>}
    </div>
  );
}

// =============================================================================
// Display Components
// =============================================================================

/**
 * Image - displays an image.
 */
export function Image({ component }: FreesailComponentProps) {
  const src = String((component['src'] as string) ?? (component['url'] as string) ?? '');
  const alt = String((component['alt'] as string) ?? '');
  const [error, setError] = useState(false);

  if (!isSafeUrl(src)) {
    return <div style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '14px' }}>Invalid image URL</div>;
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderRadius: (component['borderRadius'] as string) ?? '8px',
        border: '1px solid var(--freesail-border, #e2e8f0)',
        backgroundColor: 'var(--freesail-bg-muted, #f8fafc)',
        color: 'var(--freesail-text-muted, #64748b)',
        fontSize: '14px',
        maxWidth: '100%',
      }}>
        <span style={{ fontSize: '20px' }}>🖼️</span>
        <span>Image could not be loaded</span>
      </div>
    );
  }

  const style: CSSProperties = {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: (component['borderRadius'] as string) ?? '0',
  };

  return <img src={src} alt={alt} style={style} onError={() => setError(true)} />;
}

/**
 * Divider - horizontal or vertical line separator.
 */
export function Divider({ component }: FreesailComponentProps) {
  const axis = (component['axis'] as string) ?? 'horizontal';
  const color = getSemanticColor(component['color'] as string) ?? 'var(--freesail-border, #e2e8f0)';

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
      <div style={tabBarStyle} role="tablist">
        {tabs.map((tab, index) => (
          <div
            key={index}
            role="tab"
            tabIndex={index === activeTab ? 0 : -1}
            aria-selected={index === activeTab}
            style={tabStyle(index === activeTab)}
            onClick={() => setActiveTab(index)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTab(index);
              } else if (e.key === 'ArrowRight') {
                setActiveTab((index + 1) % tabs.length);
              } else if (e.key === 'ArrowLeft') {
                setActiveTab((index - 1 + tabs.length) % tabs.length);
              }
            }}
          >
            {tab.title}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }} role="tabpanel">
        {React.Children.toArray(children)[activeTab]}
      </div>
    </div>
  );
}

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
    if (!isSafeUrl(url)) {
      return <div style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '14px' }}>Invalid video URL</div>;
    }
    return (
      <iframe
        src={url}
        style={{ ...style, width: '100%', aspectRatio: '16 / 9', border: 'none' }}
        allowFullScreen
        sandbox="allow-scripts allow-same-origin"
      />
    );
  }

  // Native <video> for direct file URLs (mp4, webm, etc.)
  if (!isSafeUrl(url)) {
    return <div style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '14px' }}>Invalid video URL</div>;
  }
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
    if (!isSafeUrl(url)) {
      return <div style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '14px' }}>Invalid audio URL</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        {descriptionEl}
        <iframe
          src={url}
          style={{ width: '100%', height: '166px', border: 'none', borderRadius: '12px' }}
          allow="autoplay"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    );
  }

  // Fallback: native <audio> for direct file URLs (mp3, wav, ogg, etc.)
  if (!isSafeUrl(url)) {
    return <div style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '14px' }}>Invalid audio URL</div>;
  }
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
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

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
      {validationError && <div style={{ fontSize: '12px', color: 'var(--freesail-error, #ef4444)', marginTop: '2px' }}>{validationError}</div>}
    </div>
  );
}

/**
 * Dropdown - A select dropdown for choosing a single option.
 */
export function Dropdown({ component, onDataChange }: FreesailComponentProps) {
  const label = component['label'] as string | undefined;
  const hideLabel = (component['hideLabel'] as boolean) ?? false;
  const placeholder = (component['placeholder'] as string | undefined) ?? 'Select an option';
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

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
      {label && !hideLabel && <label style={{ fontSize: '14px', fontWeight: 500 }}>{label}</label>}
      <select
        value={localValue}
        onChange={handleChange}
        style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--freesail-radius-md)', border: validationError ? '1px solid var(--freesail-error, #ef4444)' : '1px solid var(--freesail-border, #e2e8f0)', fontSize: '14px', backgroundColor: 'var(--freesail-bg-root, #ffffff)', color: 'var(--freesail-text-main, #0f172a)' }}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {validationError && <div style={{ fontSize: '12px', color: 'var(--freesail-error, #ef4444)', marginTop: '2px' }}>{validationError}</div>}
    </div>
  );
}

// =============================================================================
// Export catalog components map
// =============================================================================

export const standardCatalogComponents = {
  ...commonComponents,
  GridLayout,
  Markdown,
  CheckBox,
  Image,
  Divider,
  List,
  Tabs,
  Video,
  AudioPlayer,
  Slider,
  Dropdown,
};
