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
import { commonComponents } from '../common/CommonComponents.js';
import { getSemanticColor, validateChecks } from '../common/common-utils.js';

// =============================================================================
// Shared Chart Helpers
// =============================================================================

const defaultPalette = [
  '#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

function parseData(raw: unknown): DataPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Record<string, unknown>) => ({
    label: String(item['label'] ?? ''),
    value: Number(item['value'] ?? 0),
    color: item['color'] != null ? String(item['color']) : undefined,
  }));
}

function ChartTitle({ title }: { title?: string }) {
  if (!title) return null;
  return (
    <div style={{
      fontSize: '14px',
      fontWeight: 600,
      color: 'var(--freesail-text-main, #0f172a)',
      marginBottom: '12px',
    }}>
      {title}
    </div>
  );
}

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
  const columnWeights = (component['columnWeights'] as number[]) ?? [];

  // Unique class scoped to this grid instance for CSS targeting
  const gridClass = `freesail-grid-${sanitizeCssIdent(String(component['id'] ?? 'default'))}`;
  const rowPadding = sanitizeCssValue((component['rowPadding'] as string) ?? '10px 16px');

  // Build grid-template-columns from weights or fall back to equal sizing
  let gridCols: string;
  if (columnWeights.length > 0) {
    gridCols = Array.from({ length: colCount }, (_, i) => {
      const w = columnWeights[i] ?? 1;
      return `minmax(min-content, ${w}fr)`;
    }).join(' ');
  } else {
    gridCols = `repeat(${colCount}, minmax(min-content, 1fr))`;
  }

  const wrapperStyle: CSSProperties = {
    width: '100%',
    overflowX: 'auto',
    border: '1px solid var(--freesail-border, #e2e8f0)',
    borderRadius: 'var(--freesail-radius-md, 8px)',
  };

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridCols,
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
        .${gridClass} > .freesail-grid-row > div,
        .${gridClass} > .freesail-grid-row [data-freesail-weight] {
          display: contents !important;
        }
        .${gridClass} > .freesail-grid-row > div > *,
        .${gridClass} > .freesail-grid-row > div > [data-freesail-weight] > * {
          padding: ${rowPadding};
          border-bottom: 1px solid var(--freesail-border, #e2e8f0);
        }
        .${gridClass} > .freesail-grid-row > div > button,
        .${gridClass} > .freesail-grid-row > div > [data-freesail-weight] > button {
          width: fit-content;
          align-self: center;
          justify-self: start;
        }
        .${gridClass} > .freesail-grid-row:nth-child(odd) > div > *,
        .${gridClass} > .freesail-grid-row:nth-child(odd) > div > [data-freesail-weight] > * {
          background: var(--freesail-bg-surface, #ffffff);
        }
        .${gridClass} > .freesail-grid-row:nth-child(even) > div > *,
        .${gridClass} > .freesail-grid-row:nth-child(even) > div > [data-freesail-weight] > * {
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
 * Tab - a single tab within a TabGroup. Has a title and a child.
 */
export function Tab({ component, children }: FreesailComponentProps) {
  // Tab just renders its child content — TabGroup handles visibility
  return <>{children}</>;
}

/**
 * TabGroup - tabbed container that shows one Tab child at a time.
 */
export function TabGroup({ component, children }: FreesailComponentProps) {
  const [activeTab, setActiveTab] = useState(0);
  const childArray = React.Children.toArray(children);

  // Extract tab titles from child Tab component props
  const tabTitles: string[] = childArray.map((child) => {
    if (React.isValidElement(child) && child.props?.component?.title) {
      return String(child.props.component.title);
    }
    return 'Tab';
  });

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
        {tabTitles.map((title, index) => (
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
                setActiveTab((index + 1) % tabTitles.length);
              } else if (e.key === 'ArrowLeft') {
                setActiveTab((index - 1 + tabTitles.length) % tabTitles.length);
              }
            }}
          >
            {title}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }} role="tabpanel">
        {childArray[activeTab]}
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
// Chart Components
// =============================================================================

/**
 * BarChart - renders vertical or horizontal bar charts from data points.
 */
export function BarChart({ component }: FreesailComponentProps) {
  const title = component['title'] as string | undefined;
  const data = parseData(component['data']);
  const orientation = (component['orientation'] as string) ?? 'vertical';
  const defaultColor = getSemanticColor(component['color'] as string) ?? '#2563eb';
  const showValues = component['showValues'] !== false;
  const height = Number(component['height'] ?? 300);

  if (data.length === 0) {
    return <div style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '14px' }}>No chart data</div>;
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);

  if (orientation === 'horizontal') {
    const barHeight = 28;
    const gap = 8;
    const labelWidth = 100;
    const svgHeight = data.length * (barHeight + gap) - gap;
    const chartWidth = 300;

    return (
      <div>
        <ChartTitle title={title} />
        <svg width="100%" height={Math.min(svgHeight, height)} viewBox={`0 0 ${labelWidth + chartWidth + 60} ${svgHeight}`}
          preserveAspectRatio="xMinYMin meet" style={{ overflow: 'visible' }}>
          {data.map((d, i) => {
            const y = i * (barHeight + gap);
            const barW = (d.value / maxVal) * chartWidth;
            const fill = d.color ?? defaultColor;
            return (
              <g key={i}>
                <text x={labelWidth - 8} y={y + barHeight / 2} textAnchor="end"
                  dominantBaseline="central" fontSize="12"
                  fill="var(--freesail-text-muted, #64748b)">
                  {d.label}
                </text>
                <rect x={labelWidth} y={y} width={barW} height={barHeight}
                  rx={4} fill={fill} opacity={0.85} />
                {showValues && (
                  <text x={labelWidth + barW + 6} y={y + barHeight / 2}
                    dominantBaseline="central" fontSize="12" fontWeight="500"
                    fill="var(--freesail-text-main, #0f172a)">
                    {d.value.toLocaleString()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // Vertical orientation
  const padding = { top: 16, right: 16, bottom: 40, left: 48 };
  const svgWidth = 500;
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const barWidth = Math.min(40, (chartW / data.length) * 0.6);
  const step = chartW / data.length;

  // Y-axis gridlines
  const gridLines = 4;
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxVal / gridLines) * i));

  return (
    <div>
      <ChartTitle title={title} />
      <svg width="100%" height={height} viewBox={`0 0 ${svgWidth} ${height}`}
        preserveAspectRatio="xMinYMin meet" style={{ overflow: 'visible' }}>
        {/* Grid lines */}
        {gridVals.map((v, i) => {
          const y = padding.top + chartH - (v / maxVal) * chartH;
          return (
            <g key={`grid-${i}`}>
              <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y}
                stroke="var(--freesail-border, #e2e8f0)" strokeWidth={1} />
              <text x={padding.left - 8} y={y} textAnchor="end" dominantBaseline="central"
                fontSize="11" fill="var(--freesail-text-muted, #64748b)">
                {v.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const x = padding.left + i * step + (step - barWidth) / 2;
          const barH = (d.value / maxVal) * chartH;
          const y = padding.top + chartH - barH;
          const fill = d.color ?? defaultColor;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={3}
                fill={fill} opacity={0.85} />
              {showValues && (
                <text x={x + barWidth / 2} y={y - 6} textAnchor="middle"
                  fontSize="11" fontWeight="500"
                  fill="var(--freesail-text-main, #0f172a)">
                  {d.value.toLocaleString()}
                </text>
              )}
              <text x={x + barWidth / 2} y={padding.top + chartH + 16}
                textAnchor="middle" fontSize="11"
                fill="var(--freesail-text-muted, #64748b)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * LineChart - renders a line chart with optional area fill and dots.
 */
export function LineChart({ component }: FreesailComponentProps) {
  const title = component['title'] as string | undefined;
  const data = parseData(component['data']);
  const color = getSemanticColor(component['color'] as string) ?? '#2563eb';
  const showDots = component['showDots'] !== false;
  const showArea = component['showArea'] === true;
  const height = Number(component['height'] ?? 300);

  if (data.length < 2) {
    return <div style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '14px' }}>Need at least 2 data points</div>;
  }

  const padding = { top: 16, right: 16, bottom: 40, left: 48 };
  const svgWidth = 500;
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const minVal = Math.min(...data.map(d => d.value), 0);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - ((d.value - minVal) / range) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = linePath +
    ` L${points[points.length - 1]!.x},${padding.top + chartH}` +
    ` L${points[0]!.x},${padding.top + chartH} Z`;

  // Grid
  const gridLines = 4;
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) =>
    minVal + (range / gridLines) * i);

  return (
    <div>
      <ChartTitle title={title} />
      <svg width="100%" height={height} viewBox={`0 0 ${svgWidth} ${height}`}
        preserveAspectRatio="xMinYMin meet" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`area-grad-${color.replace(/[^a-zA-Z0-9]/g, '')}`}
            x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridVals.map((v, i) => {
          const y = padding.top + chartH - ((v - minVal) / range) * chartH;
          return (
            <g key={`grid-${i}`}>
              <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y}
                stroke="var(--freesail-border, #e2e8f0)" strokeWidth={1} />
              <text x={padding.left - 8} y={y} textAnchor="end" dominantBaseline="central"
                fontSize="11" fill="var(--freesail-text-muted, #64748b)">
                {Math.round(v).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {showArea && (
          <path d={areaPath}
            fill={`url(#area-grad-${color.replace(/[^a-zA-Z0-9]/g, '')})`} />
        )}

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {showDots && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4}
            fill="white" stroke={color} strokeWidth={2} />
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          const x = padding.left + (i / (data.length - 1)) * chartW;
          // Show every label if ≤ 10 points, otherwise thin them out
          if (data.length > 10 && i % Math.ceil(data.length / 10) !== 0 && i !== data.length - 1) return null;
          return (
            <text key={`label-${i}`} x={x} y={padding.top + chartH + 16}
              textAnchor="middle" fontSize="11"
              fill="var(--freesail-text-muted, #64748b)">
              {d.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * PieChart - renders a pie or donut chart.
 */
export function PieChart({ component }: FreesailComponentProps) {
  const title = component['title'] as string | undefined;
  const data = parseData(component['data']);
  const donut = component['donut'] === true;
  const size = Number(component['size'] ?? 250);

  if (data.length === 0) {
    return <div style={{ color: 'var(--freesail-text-muted, #64748b)', fontSize: '14px' }}>No chart data</div>;
  }

  const total = data.reduce((sum, d) => sum + Math.abs(d.value), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = donut ? outerR * 0.55 : 0;

  // Build arc segments
  let currentAngle = -Math.PI / 2; // start at top
  const segments = data.map((d, i) => {
    const fraction = Math.abs(d.value) / total;
    const angle = fraction * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);

    let path: string;
    if (innerR > 0) {
      const ix1 = cx + innerR * Math.cos(endAngle);
      const iy1 = cy + innerR * Math.sin(endAngle);
      const ix2 = cx + innerR * Math.cos(startAngle);
      const iy2 = cy + innerR * Math.sin(startAngle);
      path = `M${x1},${y1} A${outerR},${outerR} 0 ${largeArc} 1 ${x2},${y2}` +
        ` L${ix1},${iy1} A${innerR},${innerR} 0 ${largeArc} 0 ${ix2},${iy2} Z`;
    } else {
      path = `M${cx},${cy} L${x1},${y1} A${outerR},${outerR} 0 ${largeArc} 1 ${x2},${y2} Z`;
    }

    return {
      path,
      color: d.color ?? defaultPalette[i % defaultPalette.length],
      label: d.label,
      value: d.value,
      percentage: Math.round(fraction * 100),
    };
  });

  return (
    <div>
      <ChartTitle title={title} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map((seg, i) => (
            <path key={i} d={seg.path} fill={seg.color} stroke="white" strokeWidth={2} />
          ))}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {segments.map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <div style={{
                width: '12px', height: '12px', borderRadius: '2px',
                backgroundColor: seg.color, flexShrink: 0,
              }} />
              <span style={{ color: 'var(--freesail-text-main, #0f172a)' }}>{seg.label}</span>
              <span style={{ color: 'var(--freesail-text-muted, #64748b)' }}>
                {seg.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Sparkline - compact inline sparkline chart.
 */
export function Sparkline({ component }: FreesailComponentProps) {
  const values = (component['values'] as number[]) ?? [];
  const color = getSemanticColor(component['color'] as string) ?? '#2563eb';
  const width = Number(component['width'] ?? 120);
  const height = Number(component['height'] ?? 32);

  if (!Array.isArray(values) || values.length < 2) {
    return <div style={{ width, height }} />;
  }

  const nums = values.map(Number);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const pad = 2;

  const points = nums.map((v, i) => ({
    x: pad + (i / (nums.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}>
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1]!.x} cy={points[points.length - 1]!.y}
        r={2.5} fill={color} />
    </svg>
  );
}

/**
 * StatCard - KPI / summary statistic card with trend indicator.
 */
export function StatCard({ component, children }: FreesailComponentProps) {
  const label = (component['label'] as string) ?? '';
  const value = (component['value'] as string) ?? '';
  const trend = component['trend'] as string | undefined;
  const trendValue = component['trendValue'] as string | undefined;
  const accentColor = getSemanticColor(component['color'] as string) ?? 'var(--freesail-primary, #2563eb)';

  const defaultTrendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : 'var(--freesail-text-muted, #64748b)';
  const trendColor = getSemanticColor(component['trendColor'] as string) ?? defaultTrendColor;
  
  const cardStyle: CSSProperties = {
    flex: '1 1 auto',
    minWidth: '140px',
    padding: '16px 20px',
    borderRadius: '12px',
    border: '1px solid var(--freesail-border, #e2e8f0)',
    backgroundColor: 'var(--freesail-bg-card, #ffffff)',
    borderLeft: `4px solid ${accentColor}`,
    alignSelf: 'stretch',
  };

  return (
    <div style={cardStyle}>
      <div style={{
        fontSize: '13px',
        color: 'var(--freesail-text-muted, #64748b)',
        marginBottom: '4px',
      }}>{label}</div>
      <div style={{
        fontSize: '28px',
        fontWeight: 700,
        color: 'var(--freesail-text-main, #0f172a)',
        lineHeight: 1.2,
        minHeight: '1.2em',
      }}>{value || '\u00A0'}</div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginTop: '6px',
        fontSize: '14px',
        fontWeight: 600,
        color: trendColor,
        visibility: (trend || trendValue) ? 'visible' : 'hidden',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={trendColor} style={{ flexShrink: 0 }}>
          {trend === 'up' && <path d="M5 17.59L12 4l7 13.59H5z" />}
          {trend === 'down' && <path d="M5 6.41L12 20l7-13.59H5z" />}
          {trend !== 'up' && trend !== 'down' && <path d="M6 4l14 8-14 8V4z" />}
        </svg>
        {trendValue && <span>{trendValue}</span>}
        {/* Reserve space when no trend data */}
        {!trendValue && <span>&nbsp;</span>}
      </div>
      {children}
    </div>
  );
}

// =============================================================================
// Export catalog components map
// =============================================================================

export const standardCatalogComponents: Record<string, React.ComponentType<FreesailComponentProps>> = {
  ...commonComponents,
  GridLayout,
  Markdown,
  CheckBox,
  Image,
  Divider,
  List,
  Tab,
  TabGroup,
  Video,
  AudioPlayer,
  Slider,
  Dropdown,
  BarChart,
  LineChart,
  PieChart,
  Sparkline,
  StatCard,
};
