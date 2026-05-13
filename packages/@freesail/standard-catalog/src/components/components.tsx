/**
 * @fileoverview Standard Catalog Components
 */

import React, { useState, useEffect, useId, useMemo, type CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import * as RadixSelect from '@radix-ui/react-select';
import * as RadixSlider from '@radix-ui/react-slider';
import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixTabs from '@radix-ui/react-tabs';
import * as RadixPopover from '@radix-ui/react-popover';
import { DayPicker } from 'react-day-picker';
import type { FreesailComponentProps } from '@freesail/react';
import { useFreesailTheme, tokensToCssVars } from '@freesail/react';
import type { FunctionCall } from '@freesail/core';
import {
  getSemanticColor,
  applyComponentTheme,
  mapJustify,
  validateChecks,
} from './utils.js';

// =============================================================================
// Shared style helpers
// =============================================================================

function fieldBorder(hasError: boolean): string {
  return hasError
    ? '1px solid var(--freesail-error)'
    : '1px solid var(--freesail-border)';
}

function DigitalTimePicker({
  h24,
  m,
  timeStep,
  timeFormat,
  onConfirm,
  onCancel,
}: {
  h24: number;
  m: number;
  timeStep: number;
  timeFormat: '24h' | '12h';
  onConfirm: (h24: number, m: number) => void;
  onCancel: () => void;
}) {
  const isPm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const [draftH, setDraftH] = useState(
    timeFormat === '12h' ? String(h12) : String(h24)
  );
  const [draftM, setDraftM] = useState(String(m).padStart(2, '0'));
  const [draftPm, setDraftPm] = useState(isPm);

  const h12to24 = (h: number, pm: boolean) => pm ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);

  const handleOk = () => {
    const parsedH = parseInt(draftH, 10) || 0;
    const parsedM = parseInt(draftM, 10) || 0;
    const clampedM = Math.min(59, Math.max(0, Math.round(parsedM / timeStep) * timeStep % 60));
    if (timeFormat === '12h') {
      const clampedH = Math.min(12, Math.max(1, parsedH));
      onConfirm(h12to24(clampedH, draftPm), clampedM);
    } else {
      const clampedH = Math.min(23, Math.max(0, parsedH));
      onConfirm(clampedH, clampedM);
    }
  };

  const fieldStyle: CSSProperties = {
    width: '72px',
    textAlign: 'center',
    fontSize: 'var(--freesail-type-h2)',
    fontWeight: 600,
    padding: '8px 4px',
    border: '1px solid var(--freesail-border)',
    borderRadius: 'var(--freesail-radius-md)',
    background: 'color-mix(in srgb, var(--freesail-primary) 10%, var(--freesail-bg))',
    color: 'var(--freesail-text-foreground)',
    outline: 'none',
    MozAppearance: 'textfield' as any,
    WebkitAppearance: 'none' as any,
  };

  const labelStyle: CSSProperties = {
    fontSize: 'var(--freesail-type-caption)',
    color: 'var(--freesail-text-secondary)',
    textAlign: 'center',
    marginTop: '4px',
  };

  const amPmStyle = (active: boolean): CSSProperties => ({
    padding: '6px 10px',
    fontSize: 'var(--freesail-type-label)',
    fontWeight: active ? 700 : 400,
    border: '1px solid var(--freesail-border)',
    borderRadius: 'var(--freesail-radius-sm)',
    background: active ? 'var(--freesail-primary)' : 'var(--freesail-bg-muted)',
    color: active ? 'var(--freesail-primary-foreground)' : 'var(--freesail-text-secondary)',
    cursor: 'pointer',
  });

  const actionBtnStyle = (primary: boolean): CSSProperties => ({
    padding: '6px 14px',
    fontSize: 'var(--freesail-type-label)',
    fontWeight: 500,
    border: 'none',
    borderRadius: 'var(--freesail-radius-sm)',
    background: primary ? 'var(--freesail-primary)' : 'transparent',
    color: primary ? 'var(--freesail-primary-foreground)' : 'var(--freesail-text-secondary)',
    cursor: 'pointer',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-md)' }}>
      <div style={{ fontSize: 'var(--freesail-type-label)', color: 'var(--freesail-text-secondary)', fontWeight: 500 }}>
        Select time
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--freesail-space-sm)' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <input
            type="number"
            min={timeFormat === '12h' ? 1 : 0}
            max={timeFormat === '12h' ? 12 : 23}
            value={draftH}
            onChange={e => setDraftH(e.target.value)}
            onBlur={e => {
              const v = parseInt(e.target.value, 10);
              const max = timeFormat === '12h' ? 12 : 23;
              const min = timeFormat === '12h' ? 1 : 0;
              setDraftH(String(Math.min(max, Math.max(min, isNaN(v) ? min : v))).padStart(2, '0'));
            }}
            style={fieldStyle}
          />
          <div style={labelStyle}>Hour</div>
        </div>

        <span style={{ fontSize: 'var(--freesail-type-h2)', fontWeight: 700, color: 'var(--freesail-text-secondary)', lineHeight: 1, marginBottom: '18px' }}>:</span>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <input
            type="number"
            min={0}
            max={59}
            step={timeStep}
            value={draftM}
            onChange={e => setDraftM(e.target.value)}
            onBlur={e => {
              const v = parseInt(e.target.value, 10);
              const snapped = Math.round(Math.min(59, Math.max(0, isNaN(v) ? 0 : v)) / timeStep) * timeStep % 60;
              setDraftM(String(snapped).padStart(2, '0'));
            }}
            style={fieldStyle}
          />
          <div style={labelStyle}>Minute</div>
        </div>

        {timeFormat === '12h' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '18px' }}>
            <button type="button" style={amPmStyle(!draftPm)} onClick={() => setDraftPm(false)}>AM</button>
            <button type="button" style={amPmStyle(draftPm)} onClick={() => setDraftPm(true)}>PM</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--freesail-space-xs)' }}>
        <button type="button" style={actionBtnStyle(false)} onClick={onCancel}>Cancel</button>
        <button type="button" style={actionBtnStyle(true)} onClick={handleOk}>OK</button>
      </div>
    </div>
  );
}

// =============================================================================
// Layout Components
// =============================================================================

const GAP_MAP: Record<string, string> = {
  none: '0',
  xs: 'var(--freesail-space-xs)',
  sm: 'var(--freesail-space-sm)',
  small: 'var(--freesail-space-sm)',
  md: 'var(--freesail-space-md)',
  medium: 'var(--freesail-space-md)',
  lg: 'var(--freesail-space-lg)',
  large: 'var(--freesail-space-lg)',
  xl: 'var(--freesail-space-xl)',
};

function resolveGap(gap: string | undefined): string {
  if (!gap) return 'var(--freesail-space-sm)';
  return GAP_MAP[gap] ?? gap;
}

export function Column({ component, children }: FreesailComponentProps) {
  const theme = component['theme'] as Record<string, string> | undefined;
  const themeVars = applyComponentTheme(theme);
  const style: CSSProperties = {
    ...themeVars,
    display: 'flex',
    flexDirection: 'column',
    gap: resolveGap(component['gap'] as string | undefined),
    padding: (component['padding'] as string) ?? undefined,
    alignItems: (component['align'] as CSSProperties['alignItems']) ?? 'start',
    background: theme?.['bg'] ? 'var(--freesail-bg)' : undefined,
    width: (component['width'] as string) ?? undefined,
    minWidth: 0,
    minHeight: 0,
  };

  return <div className="fs-layout" style={style}>{children}</div>;
}

export function Row({ component, children }: FreesailComponentProps) {
  const theme = component['theme'] as Record<string, string> | undefined;
  const themeVars = applyComponentTheme(theme);
  const style: CSSProperties = {
    ...themeVars,
    display: 'flex',
    flexDirection: 'row',
    gap: resolveGap(component['gap'] as string | undefined),
    padding: (component['padding'] as string) ?? undefined,
    alignItems: (component['align'] as CSSProperties['alignItems']) ?? 'flex-end',
    justifyContent: mapJustify(component['justify'] as string),
    flexWrap: (component['wrap'] as CSSProperties['flexWrap']) ?? 'wrap',
    background: theme?.['bg'] ? 'var(--freesail-bg)' : undefined,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
  };

  return <div className="fs-layout" style={style}>{children}</div>;
}

export function Card({ component, children }: FreesailComponentProps) {
  const fsTheme = useFreesailTheme();
  const cssVars = tokensToCssVars(fsTheme.tokens, fsTheme.mode);
  const zoomable = component['zoomable'] as boolean | undefined;
  const [isZoomed, setIsZoomed] = useState(false);
  const variant = (component['variant'] as string) ?? 'raised';
  const isFlat = variant === 'flat';
  const borderWeight = component['borderWeight'] !== undefined ? Number(component['borderWeight']) : 1;
  const themeVars = applyComponentTheme(component['theme'] as Record<string, string> | undefined);
  const align = component['align'] as string | undefined;
  const justify = component['justify'] as string | undefined;

  const cardStyle: CSSProperties = {
    ...themeVars,
    display: 'flex',
    flexDirection: 'column',
    alignItems: (align as CSSProperties['alignItems']) ?? 'stretch',
    justifyContent: mapJustify(justify),
    padding: (component['padding'] as string) ?? 'var(--freesail-space-lg)',
    width: (component['width'] as string) ?? undefined,
    height: (component['height'] as string) ?? undefined,
    borderRadius: isFlat ? '0' : ((component['borderRadius'] as string) ?? 'var(--freesail-radius-md)'),
    border: borderWeight > 0 ? `${borderWeight}px solid var(--freesail-border)` : 'none',
    boxShadow: isFlat ? 'none' : 'var(--freesail-shadow-sm)',
    background: isFlat ? 'var(--freesail-bg)' : 'var(--freesail-bg-raised)',
    color: 'var(--freesail-text-foreground)',
    alignSelf: 'stretch',
    position: 'relative',
    overflow: 'hidden',
    minWidth: (component['minWidth'] as string) ?? ((component['width'] as string) ? undefined : '180px'),
  };

  const zoomBtnStyle: CSSProperties = {
    position: 'absolute',
    top: '0.5rem',
    right: '0.5rem',
    width: '22px',
    height: '22px',
    borderRadius: '4px',
    border: '1px solid var(--freesail-border)',
    background: 'var(--freesail-bg-raised)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--freesail-text-secondary)',
    zIndex: 1,
    padding: 0,
  };

  const zoomBtn = zoomable && (
    <button
      type="button"
      style={zoomBtnStyle}
      onClick={() => setIsZoomed(z => !z)}
      title={isZoomed ? 'Restore' : 'Zoom in'}
    >
      {isZoomed ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6z"/>
        </svg>
      )}
    </button>
  );

  const overlayContent = isZoomed && ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={() => setIsZoomed(false)}
    >
      <div
        style={{
          ...cssVars,
          ...cardStyle,
          width: '70vw',
          maxWidth: '1200px',
          height: 'auto',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--freesail-shadow-md)',
          alignSelf: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {zoomBtn}
        {children}
      </div>
    </div>,
    document.body
  );

  return (
    <div style={cardStyle}>
      {zoomBtn}
      {overlayContent}
      {children}
    </div>
  );
}

// =============================================================================
// Text Components
// =============================================================================

const THEMED_LINK_STYLE: CSSProperties = {
  color: 'var(--freesail-primary)',
  textDecorationColor: 'var(--freesail-primary)',
};

function ThemedLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const safe = href && !href.trimStart().toLowerCase().startsWith('javascript:') ? href : undefined;
  return <a href={safe} target="_blank" rel="noopener noreferrer" style={THEMED_LINK_STYLE}>{children}</a>;
}

export function Text({ component }: FreesailComponentProps) {
  const rawText = component['text'] ?? '';
  const text = (typeof rawText === 'object' && rawText !== null
    ? JSON.stringify(rawText)
    : String(rawText)).replace(/\\n/g, '\n');

  const variant = (component['variant'] as string) ?? 'body';
  const explicitColor = getSemanticColor(component['color'] as string);
  const explicitSize = component['size'] as string | undefined;
  const explicitWeight = component['fontWeight'] as CSSProperties['fontWeight'] | undefined;

  // Variant-specific defaults — each uses the correct type token.
  // caption defaults to textSecondary; all others default to textForeground.
  const variantDefaults: Record<string, CSSProperties> = {
    h1:      { fontSize: 'var(--freesail-type-h1)',      fontWeight: '700', lineHeight: '1.2', color: 'var(--freesail-text-foreground)', margin: 0 },
    h2:      { fontSize: 'var(--freesail-type-h2)',      fontWeight: '700', lineHeight: '1.3', color: 'var(--freesail-text-foreground)', margin: 0 },
    h3:      { fontSize: 'var(--freesail-type-h3)',      fontWeight: '600', lineHeight: '1.4', color: 'var(--freesail-text-foreground)', margin: 0 },
    h4:      { fontSize: 'var(--freesail-type-h4)',      fontWeight: '600', lineHeight: '1.4', color: 'var(--freesail-text-foreground)', margin: 0 },
    h5:      { fontSize: 'var(--freesail-type-h5)',      fontWeight: '600', lineHeight: '1.5', color: 'var(--freesail-text-foreground)', margin: 0 },
    body:    { fontSize: 'var(--freesail-type-body)',    fontWeight: 'normal',                 color: 'var(--freesail-text-foreground)', margin: 0 },
    label:   { fontSize: 'var(--freesail-type-label)',   fontWeight: '500',                    color: 'var(--freesail-text-foreground)', margin: 0 },
    caption: { fontSize: 'var(--freesail-type-caption)', fontWeight: 'normal',                 color: 'var(--freesail-text-secondary)',  margin: 0 },
  };

  const explicitWidth = component['width'] as string | undefined;
  const defaults = variantDefaults[variant] ?? variantDefaults['body']!;
  const style: CSSProperties = {
    ...defaults,
    ...(explicitColor  ? { color: explicitColor }        : {}),
    ...(explicitSize   ? { fontSize: explicitSize }       : {}),
    ...(explicitWeight ? { fontWeight: explicitWeight }   : {}),
    ...(explicitWidth  ? { width: explicitWidth }         : {}),
  };

  // Headings render as native elements so inline styles fully control size, weight,
  // and color — ReactMarkdown's browser-default h1–h3 styles would override them.
  if (variant === 'h1') return <h1 style={style}>{text}</h1>;
  if (variant === 'h2') return <h2 style={style}>{text}</h2>;
  if (variant === 'h3') return <h3 style={style}>{text}</h3>;
  if (variant === 'h4') return <h4 style={style}>{text}</h4>;
  if (variant === 'h5') return <h5 style={style}>{text}</h5>;
  if (variant === 'label')   return <label style={style}>{text}</label>;
  if (variant === 'caption') return <span style={style}>{text}</span>;

  // body — ReactMarkdown for links, bold, italic, inline code
  return (
    <div style={style}>
      <ReactMarkdown components={{ a: ThemedLink }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

const MATERIAL_SYMBOLS_HREF = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap';

function ensureMaterialSymbols(): void {
  if (!document.querySelector(`link[href="${MATERIAL_SYMBOLS_HREF}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = MATERIAL_SYMBOLS_HREF;
    document.head.appendChild(link);
  }
}

const ICON_SIZE_TOKENS: Record<string, string> = {
  sm: 'var(--freesail-icon-sm)',
  md: 'var(--freesail-icon-md)',
  lg: 'var(--freesail-icon-lg)',
  xl: 'var(--freesail-icon-xl)',
  '2xl': 'var(--freesail-icon-2xl)',
  '3xl': 'var(--freesail-icon-3xl)',
  '4xl': 'var(--freesail-icon-4xl)',
};

export function Icon({ component }: FreesailComponentProps) {
  const rawName = component['name'];
  const name = (typeof rawName === 'string') ? rawName : 'help';
  const rawSize = (component['size'] as string) ?? 'lg';
  const size = ICON_SIZE_TOKENS[rawSize] ?? rawSize;
  const color = getSemanticColor(component['color'] as string) ?? 'currentColor';

  ensureMaterialSymbols();

  const toSnakeCase = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  const ligature = toSnakeCase(name);
  const [displayLigature, setDisplayLigature] = useState(ligature);

  useEffect(() => {
    setDisplayLigature(ligature); // reset if name prop changes
    document.fonts.load('24px "Material Symbols Outlined"').then(() => {
      const probe = document.createElement('span');
      Object.assign(probe.style, {
        position: 'absolute', top: '-9999px', left: '-9999px',
        fontFamily: "'Material Symbols Outlined', sans-serif",
        fontSize: '24px', whiteSpace: 'nowrap', visibility: 'hidden',
      });
      document.body.appendChild(probe);
      probe.textContent = ligature;
      const ligatureWidth = probe.getBoundingClientRect().width;
      probe.textContent = 'home'; // known-valid reference
      const referenceWidth = probe.getBoundingClientRect().width;
      document.body.removeChild(probe);
      if (ligatureWidth > referenceWidth * 1.5) {
        setDisplayLigature('help_outline');
      }
    });
  }, [ligature]);

  const style: CSSProperties = {
    fontSize: size,
    color,
    lineHeight: 1,
    fontFamily: "'Material Symbols Outlined', sans-serif",
    fontWeight: 'normal',
    fontStyle: 'normal',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    verticalAlign: 'middle',
    WebkitFontSmoothing: 'antialiased',
  };

  return <span style={style}>{displayLigature}</span>;
}

// =============================================================================
// Interactive Components
// =============================================================================

export function Button({ component, children, onAction, onFunctionCall }: FreesailComponentProps) {
  const label = children ?? (component['label'] as string) ?? 'Button';
  const variant = (component['variant'] as string) ?? 'primary';
  const disabled = (component['disabled'] as boolean) ?? false;

  const [isHovered, setIsHovered] = React.useState(false);
  const [isActive, setIsActive] = React.useState(false);

  const width = component['width'] as string | undefined;
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);
  const isDisabled = disabled || !!validationError;

  const action = component['action'] as
    | { event?: { name: string; context?: Record<string, unknown> }; functionCall?: any }
    | FunctionCall
    | undefined;

  const isFunctionCallAction = action && 'call' in action && !('event' in action);
  const eventAction = action && 'event' in action ? action : undefined;
  const actionName = eventAction?.event?.name ?? (!isFunctionCallAction ? (component['action'] as string) : undefined) ?? 'button_click';
  const actionContext = eventAction?.event?.context ?? {};

  const baseStyle: CSSProperties = {
    padding: 'var(--freesail-space-sm) var(--freesail-space-md)',
    borderRadius: 'var(--freesail-radius-md)',
    border: 'none',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    fontSize: 'var(--freesail-type-body)',
    fontWeight: '500',
    opacity: isDisabled ? 0.55 : 1,
    transition: 'background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease, opacity 0.15s ease',
    transform: !isDisabled && isActive ? 'scale(0.97)' : 'scale(1)',
    userSelect: 'none',
    outline: 'none',
    display: 'inline-flex',
    alignSelf: width ? 'auto' : 'flex-start',
    width: width ?? undefined,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--freesail-space-xs)',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  };

  const variantStyles: Record<string, CSSProperties> = {
    primary: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-primary) 80%, #000)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-primary) 88%, #000)'
          : 'var(--freesail-primary)',
      color: 'var(--freesail-primary-foreground)',
      boxShadow: !isDisabled && isActive
        ? 'none'
        : !isDisabled && isHovered
          ? '0 2px 8px color-mix(in srgb, var(--freesail-primary) 40%, transparent)'
          : '0 1px 3px rgba(0,0,0,0.15)',
    },
    secondary: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-bg-muted) 70%, #000)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-bg-muted) 85%, #000)'
          : 'var(--freesail-bg-muted)',
      color: 'var(--freesail-text-foreground)',
      boxShadow: !isDisabled && isActive ? 'none' : !isDisabled && isHovered ? '0 2px 6px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.08)',
    },
    outline: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-primary) 10%, transparent)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-primary) 6%, transparent)'
          : 'transparent',
      border: `1px solid ${!isDisabled && isHovered ? 'var(--freesail-primary-hover)' : 'var(--freesail-border)'}`,
      color: !isDisabled && isHovered ? 'var(--freesail-primary-hover)' : 'var(--freesail-text-foreground)',
    },
    borderless: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-primary) 10%, transparent)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-primary) 6%, transparent)'
          : 'transparent',
      color: !isDisabled && isHovered ? 'var(--freesail-primary-hover)' : 'var(--freesail-text-foreground)',
      textDecoration: 'underline',
    },
    danger: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-error) 80%, #000)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-error) 88%, #000)'
          : 'var(--freesail-error)',
      color: '#fff',
      boxShadow: !isDisabled && isActive ? 'none' : !isDisabled && isHovered ? '0 2px 8px rgba(239,68,68,0.35)' : '0 1px 3px rgba(0,0,0,0.15)',
    },
  };

  const safeVariant = variantStyles[variant] ? variant : 'primary';
  const style = { ...baseStyle, ...variantStyles[safeVariant] };

  const handleClick = () => {
    if (isDisabled) return;
    if (action && 'functionCall' in action && action.functionCall && onFunctionCall) {
        onFunctionCall(action.functionCall);
    } else if (action && 'call' in action && onFunctionCall) {
        onFunctionCall(action);
    }
    if (onAction && !isFunctionCallAction) {
        onAction(actionName, actionContext);
    }
  };

  return (
    <div style={{ display: 'contents' }}>
      <button
        type="button"
        style={style}
        onClick={handleClick}
        disabled={isDisabled}
        title={validationError || undefined}
        onMouseEnter={() => !isDisabled && setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsActive(false); }}
        onMouseDown={() => !isDisabled && setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        onFocus={() => !isDisabled && setIsHovered(true)}
        onBlur={() => { setIsHovered(false); setIsActive(false); }}
      >
        {label}
      </button>
    </div>
  );
}

export function TextField({ component, meta, onAction, onDataChange }: FreesailComponentProps) {
  const label = component['label'] as string | undefined;
  const width = component['width'] as string | undefined;
  const name = (component['name'] as string) ?? component.id;
  const placeholder = (component['placeholder'] as string) ?? '';
  const variant = (component['variant'] as string) ?? 'shortText';
  const value = (component['value'] as string) ?? '';
  const min = component['min'] as number | undefined;
  const max = component['max'] as number | undefined;

  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  const boundPath = meta.getBinding('value')?.path ?? null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (onDataChange && boundPath) {
      onDataChange(boundPath, newValue);
    }
  };

  const labelStyle: CSSProperties = {
    fontSize: 'var(--freesail-type-label)',
    fontWeight: '500',
    color: 'var(--freesail-text-foreground)',
    whiteSpace: 'nowrap',
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: 'var(--freesail-space-sm) var(--freesail-space-md)',
    borderRadius: 'var(--freesail-radius-md)',
    border: validationError ? '1px solid var(--freesail-error)' : '1px solid var(--freesail-border)',
    fontSize: 'var(--freesail-type-body)',
    boxSizing: 'border-box',
    backgroundColor: 'var(--freesail-bg)',
    color: 'var(--freesail-text-foreground)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)', width: width ?? '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: variant === 'longText' ? 'flex-start' : 'center', gap: 'var(--freesail-space-sm)' }}>
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
            min={variant === 'number' ? min : undefined}
            max={variant === 'number' ? max : undefined}
            style={inputStyle}
          />
        )}
      </div>
      {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)' }}>{validationError}</div>}
    </div>
  );
}

// =============================================================================
// Form Components
// =============================================================================

export function DateInput({ component, meta, onDataChange }: FreesailComponentProps) {
  const fsTheme = useFreesailTheme();
  const cssVars = tokensToCssVars(fsTheme.tokens, fsTheme.mode);
  const label = (component['label'] as string) ?? '';
  const rawMin = (component['min'] as string) ?? undefined;
  const rawMax = (component['max'] as string) ?? undefined;
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);
  const isRange = (component['mode'] as string) === 'range';

  const boundPath = meta.getBinding('value')?.path ?? null;

  const parseToDate = (v: string | undefined): Date | undefined => {
    if (!v) return undefined;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  };

  const formatDate = (d: Date): string => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  };

  // value is always string[] — [date] for single, [from, to] for range
  const valueArr = (component['value'] as string[] | undefined) ?? [];
  const singleValueStr = isRange ? '' : (valueArr[0] ?? '');
  const rangeFromStr = isRange ? (valueArr[0] ?? '') : '';
  const rangeToStr = isRange ? (valueArr[1] ?? '') : '';

  // confirmed = what has been emitted and shown in trigger
  const [confirmedDate, setConfirmedDate] = useState<Date | undefined>(() =>
    isRange ? undefined : parseToDate(singleValueStr)
  );
  const [confirmedFrom, setConfirmedFrom] = useState<Date | undefined>(() =>
    isRange ? parseToDate(rangeFromStr) : undefined
  );
  const [confirmedTo, setConfirmedTo] = useState<Date | undefined>(() =>
    isRange ? parseToDate(rangeToStr) : undefined
  );

  // pending = what the calendar shows while popover is open
  const [pendingDate, setPendingDate] = useState<Date | undefined>(undefined);
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>(undefined);
  const [pendingTo, setPendingTo] = useState<Date | undefined>(undefined);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    if (isRange) {
      setConfirmedFrom(parseToDate(rangeFromStr));
      setConfirmedTo(parseToDate(rangeToStr));
    } else {
      setConfirmedDate(parseToDate(singleValueStr));
    }
  }, [singleValueStr, rangeFromStr, rangeToStr]);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      // snapshot confirmed into pending when opening
      setPendingDate(confirmedDate);
      setPendingFrom(confirmedFrom);
      setPendingTo(confirmedTo);
    }
    setPopoverOpen(open);
  };

  const handleDaySelect = (date: Date | undefined) => {
    setPendingDate(date);
  };

  const handleRangeSelect = (range: { from?: Date; to?: Date } | undefined) => {
    setPendingFrom(range?.from);
    setPendingTo(range?.to);
  };

  const handleOk = () => {
    const writePath = boundPath ?? `/input/${component.id}`;
    if (isRange) {
      setConfirmedFrom(pendingFrom);
      setConfirmedTo(pendingTo);
      const arr: string[] = [];
      if (pendingFrom) arr.push(formatDate(pendingFrom));
      if (pendingTo) arr.push(formatDate(pendingTo));
      onDataChange?.(writePath, arr);
    } else {
      setConfirmedDate(pendingDate);
      onDataChange?.(writePath, pendingDate ? [formatDate(pendingDate)] : []);
    }
    setPopoverOpen(false);
  };

  const handleCancel = () => setPopoverOpen(false);

  const fmt = (d: Date) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const displayValue = isRange
    ? confirmedFrom ? `${fmt(confirmedFrom)} → ${confirmedTo ? fmt(confirmedTo) : '…'}` : ''
    : confirmedDate ? fmt(confirmedDate) : '';

  const minDate = rawMin ? parseToDate(rawMin) : undefined;
  const maxDate = rawMax ? parseToDate(rawMax) : undefined;
  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  const baseDayStyle: CSSProperties = {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--freesail-radius-sm)',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 'var(--freesail-type-label)',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const triggerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--freesail-space-sm)',
    padding: 'var(--freesail-space-sm) var(--freesail-space-md)',
    borderRadius: 'var(--freesail-radius-md)',
    border: fieldBorder(!!validationError),
    fontSize: 'var(--freesail-type-body)',
    backgroundColor: 'var(--freesail-bg)',
    color: displayValue ? 'var(--freesail-text-foreground)' : 'var(--freesail-text-secondary)',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)' }}>
      {label && <label style={{ fontSize: 'var(--freesail-type-label)', fontWeight: 500 }}>{label}</label>}

      <RadixPopover.Root open={popoverOpen} onOpenChange={handleOpenChange}>
        <RadixPopover.Trigger asChild>
          <button type="button" style={triggerStyle}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--freesail-text-secondary)' }}>
              <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 5h12M5 1v2M9 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span>{displayValue || 'Select date'}</span>
          </button>
        </RadixPopover.Trigger>
        <RadixPopover.Portal>
          <RadixPopover.Content
            align="start"
            sideOffset={4}
            style={{
              ...cssVars,
              background: 'var(--freesail-bg-raised)',
              border: '1px solid var(--freesail-border)',
              borderRadius: 'var(--freesail-radius-lg)',
              boxShadow: 'var(--freesail-shadow-md)',
              padding: 'var(--freesail-space-sm)',
              zIndex: 9999,
              overflow: 'hidden',
            }}
          >
            <DayPicker
              {...(isRange
                ? { mode: 'range', selected: { from: pendingFrom, to: pendingTo }, onSelect: handleRangeSelect as any }
                : { mode: 'single', selected: pendingDate, onSelect: handleDaySelect }
              )}
              disabled={disabledDays}
              styles={{
                root: { fontFamily: 'inherit', margin: 0 },
                month_caption: {
                  display: 'flex',
                  justifyContent: 'center',
                  fontWeight: 600,
                  padding: 'var(--freesail-space-xs) 0',
                  color: 'var(--freesail-text-foreground)',
                  fontSize: 'var(--freesail-type-label)',
                },
                weekdays: { color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-caption)' },
                nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
              }}
              components={{
                DayButton: ({ day, modifiers, ...props }: any) => {
                  const isEndpoint = modifiers.range_start || modifiers.range_end;
                  const isMiddle = modifiers.range_middle;
                  return (
                    <button
                      {...props}
                      style={{
                        ...baseDayStyle,
                        borderRadius: isMiddle ? '0' : '50%',
                        border: !isRange && modifiers.selected
                          ? '2px solid var(--freesail-primary)'
                          : '2px solid transparent',
                        background: isEndpoint
                          ? 'var(--freesail-primary)'
                          : isMiddle
                            ? 'color-mix(in srgb, var(--freesail-primary) 15%, transparent)'
                            : modifiers.today && !modifiers.selected
                              ? 'color-mix(in srgb, var(--freesail-primary) 12%, transparent)'
                              : 'none',
                        color: isEndpoint
                          ? 'var(--freesail-primary-foreground)'
                          : !isRange && modifiers.selected
                            ? 'var(--freesail-primary)'
                            : modifiers.disabled
                              ? 'var(--freesail-text-secondary)'
                              : 'var(--freesail-text-foreground)',
                        fontWeight: (modifiers.selected || isEndpoint || modifiers.today) ? 600 : 'normal',
                        opacity: modifiers.disabled ? 0.4 : 1,
                        cursor: modifiers.disabled ? 'not-allowed' : 'pointer',
                      }}
                    />
                  );
                },
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--freesail-space-xs)', paddingTop: 'var(--freesail-space-xs)' }}>
              <button type="button" onClick={handleCancel} style={{ padding: '5px 12px', fontSize: 'var(--freesail-type-label)', fontWeight: 500, border: 'none', borderRadius: 'var(--freesail-radius-sm)', background: 'transparent', color: 'var(--freesail-text-secondary)', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={handleOk} style={{ padding: '5px 12px', fontSize: 'var(--freesail-type-label)', fontWeight: 500, border: 'none', borderRadius: 'var(--freesail-radius-sm)', background: 'var(--freesail-primary)', color: 'var(--freesail-primary-foreground)', cursor: 'pointer' }}>OK</button>
            </div>
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>

      {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)' }}>{validationError}</div>}
    </div>
  );
}

export function TimeInput({ component, meta, onDataChange }: FreesailComponentProps) {
  const fsTheme = useFreesailTheme();
  const cssVars = tokensToCssVars(fsTheme.tokens, fsTheme.mode);
  const label = (component['label'] as string) ?? '';
  const timeStep = Math.max(1, Math.min(60, Number(component['timeStep'] ?? 1)));
  const timeFormat = ((component['timeFormat'] as string) ?? '24h') === '12h' ? '12h' : '24h';
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  const boundPath = meta.getBinding('value')?.path ?? null;

  const valueArr = (component['value'] as string[] | undefined) ?? [];
  const externalTime = valueArr[0] ?? '';

  const parseTime = (v: string) => {
    const parts = v ? v.split(':') : [];
    const h = parts[0] !== undefined ? parseInt(parts[0], 10) : 0;
    const m = parts[1] !== undefined ? parseInt(parts[1], 10) : 0;
    return { h24: isNaN(h) ? 0 : h, m: isNaN(m) ? 0 : m };
  };

  const [timeValue, setTimeValue] = useState(() => {
    if (externalTime) return externalTime;
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => { if (externalTime) setTimeValue(externalTime); }, [externalTime]);

  const { h24, m } = parseTime(timeValue);

  const formatDisplay = () => {
    if (!timeValue) return '';
    if (timeFormat === '12h') {
      const isPm = h24 >= 12;
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${isPm ? 'PM' : 'AM'}`;
    }
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const displayValue = formatDisplay();

  const handleConfirm = (newH: number, newM: number) => {
    const t = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    setTimeValue(t);
    const writePath = boundPath ?? `/input/${component.id}`;
    onDataChange?.(writePath, [t]);
    setPopoverOpen(false);
  };

  const handleCancel = () => setPopoverOpen(false);

  const triggerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--freesail-space-sm)',
    padding: 'var(--freesail-space-sm) var(--freesail-space-md)',
    borderRadius: 'var(--freesail-radius-md)',
    border: fieldBorder(!!validationError),
    fontSize: 'var(--freesail-type-body)',
    backgroundColor: 'var(--freesail-bg)',
    color: displayValue ? 'var(--freesail-text-foreground)' : 'var(--freesail-text-secondary)',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)' }}>
      {label && (
        <label style={{ fontSize: 'var(--freesail-type-label)', fontWeight: 500, color: 'var(--freesail-text-foreground)' }}>
          {label}
        </label>
      )}
      <RadixPopover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
        <RadixPopover.Trigger asChild>
          <button type="button" style={triggerStyle}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--freesail-text-secondary)' }}>
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M7 4v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{displayValue || 'Select time'}</span>
          </button>
        </RadixPopover.Trigger>
        <RadixPopover.Portal>
          <RadixPopover.Content
            align="start"
            sideOffset={4}
            style={{
              ...cssVars,
              background: 'var(--freesail-bg-raised)',
              border: '1px solid var(--freesail-border)',
              borderRadius: 'var(--freesail-radius-lg)',
              boxShadow: 'var(--freesail-shadow-md)',
              padding: 'var(--freesail-space-md)',
              zIndex: 9999,
              minWidth: '260px',
            }}
          >
            <DigitalTimePicker
              h24={h24}
              m={m}
              timeStep={timeStep}
              timeFormat={timeFormat as '24h' | '12h'}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
      {validationError && (
        <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)' }}>
          {validationError}
        </div>
      )}
    </div>
  );
}

export function ChoicePickerSingleSelect({ component, meta, onDataChange }: FreesailComponentProps) {
  const label = String((component['label'] as string) ?? '');
  const variant = (component['variant'] as string) ?? 'radio';
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  const rawOptions = component['options'];
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

  const rawValueList = component['value'];
  const value: string = typeof rawValueList === 'string' ? rawValueList : (Array.isArray(rawValueList) && rawValueList.length > 0 ? rawValueList[0] : '');

  const boundPath = meta.getBinding('value')?.path ?? null;

  const [localValue, setLocalValue] = useState(value);
  useEffect(() => { setLocalValue(value); }, [value]);

  const handleRadioChange = (val: string) => {
    setLocalValue(val);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) {
      onDataChange(writePath, val);
    }
  };

  if (variant === 'chips') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-sm)' }}>
        {label && <div style={{ fontSize: 'var(--freesail-type-body)', fontWeight: 500 }}>{label}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--freesail-space-sm)' }}>
          {options.map((opt) => {
            const selected = localValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleRadioChange(opt.value)}
                style={{
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  fontSize: 'var(--freesail-type-body)',
                  border: `1px solid ${selected ? 'var(--freesail-primary)' : 'var(--freesail-border)'}`,
                  backgroundColor: selected ? 'var(--freesail-primary)' : 'transparent',
                  color: selected ? 'var(--freesail-primary-foreground)' : 'var(--freesail-text-foreground)',
                  padding: '4px 12px',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)', marginTop: 'var(--freesail-space-xs)' }}>{validationError}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-sm)' }}>
      {label && <div style={{ fontSize: 'var(--freesail-type-body)', fontWeight: 500 }}>{label}</div>}
      <RadixRadioGroup.Root
        value={localValue}
        onValueChange={handleRadioChange}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)' }}
      >
        {options.map((opt) => {
          const isSelected = localValue === opt.value;
          return (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 'var(--freesail-space-sm)', cursor: 'pointer' }}>
              <RadixRadioGroup.Item
                value={opt.value}
                style={{
                  width: '18px',
                  height: '18px',
                  flexShrink: 0,
                  borderRadius: '50%',
                  border: `2px solid ${isSelected ? 'var(--freesail-primary)' : 'var(--freesail-border)'}`,
                  background: isSelected ? 'var(--freesail-primary)' : 'var(--freesail-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  boxSizing: 'border-box',
                }}
              >
                {isSelected && (
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--freesail-primary-foreground)',
                    display: 'block',
                    flexShrink: 0,
                  }} />
                )}
              </RadixRadioGroup.Item>
              <span style={{ fontSize: 'var(--freesail-type-body)' }}>{opt.label}</span>
            </label>
          );
        })}
      </RadixRadioGroup.Root>
      {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)', marginTop: 'var(--freesail-space-xs)' }}>{validationError}</div>}
    </div>
  );
}

export function ChoicePickerMultiSelect({ component, meta, onDataChange }: FreesailComponentProps) {
  const label = String((component['label'] as string) ?? '');
  const variant = (component['variant'] as string) ?? 'checkbox';
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  const rawOptions = component['options'];
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

  const rawValueList = component['value'];
  const value: string[] = Array.isArray(rawValueList) ? rawValueList : [];

  const boundPath = meta.getBinding('value')?.path ?? null;

  const [localValue, setLocalValue] = useState(value);
  const valueKey = JSON.stringify(value);
  useEffect(() => { setLocalValue(value); }, [valueKey]);

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

  if (variant === 'chips') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-sm)' }}>
        {label && <div style={{ fontSize: 'var(--freesail-type-body)', fontWeight: 500 }}>{label}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--freesail-space-sm)' }}>
          {options.map((opt) => {
            const selected = localValue.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleCheckboxChange(opt.value, !selected)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  borderRadius: '9999px',
                  cursor: 'pointer',
                  fontSize: 'var(--freesail-type-body)',
                  border: `1px solid ${selected ? 'var(--freesail-primary)' : 'var(--freesail-border)'}`,
                  backgroundColor: selected ? 'var(--freesail-primary)' : 'transparent',
                  color: selected ? 'var(--freesail-primary-foreground)' : 'var(--freesail-text-foreground)',
                  padding: '4px 12px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ visibility: selected ? 'visible' : 'hidden' }}>
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {opt.label}
              </button>
            );
          })}
        </div>
        {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)', marginTop: 'var(--freesail-space-xs)' }}>{validationError}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-sm)' }}>
      {label && <div style={{ fontSize: 'var(--freesail-type-body)', fontWeight: 500 }}>{label}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)' }}>
        {options.map((opt) => {
          const isChecked = localValue.includes(opt.value);
          return (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 'var(--freesail-space-sm)', cursor: 'pointer' }}>
              <RadixCheckbox.Root
                checked={isChecked}
                onCheckedChange={(checked) => handleCheckboxChange(opt.value, checked === true)}
                style={{
                  width: '16px',
                  height: '16px',
                  flexShrink: 0,
                  borderRadius: 'var(--freesail-radius-sm)',
                  border: fieldBorder(false),
                  background: isChecked ? 'var(--freesail-primary)' : 'var(--freesail-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <RadixCheckbox.Indicator>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="var(--freesail-primary-foreground)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </RadixCheckbox.Indicator>
              </RadixCheckbox.Root>
              <span style={{ fontSize: 'var(--freesail-type-body)' }}>{opt.label}</span>
            </label>
          );
        })}
      </div>
      {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)', marginTop: 'var(--freesail-space-xs)' }}>{validationError}</div>}
    </div>
  );
}

// =============================================================================
// Display Components
// =============================================================================

export function Spacer({ component }: FreesailComponentProps) {
  const rawWidth = component['width'] ?? '16px';
  const width = typeof rawWidth === 'number' ? `${rawWidth}px` : String(rawWidth);
  const rawHeight = component['height'] ?? '16px';
  const height = typeof rawHeight === 'number' ? `${rawHeight}px` : String(rawHeight);

  return <div style={{ height, width }} />;
}

export function Modal({ component, children, onAction, onFunctionCall }: FreesailComponentProps) {
  const { mode, tokens } = useFreesailTheme();
  const themeVars = {
    ...tokensToCssVars(tokens, mode),
    ...applyComponentTheme(component['theme'] as Record<string, string> | undefined),
  };

  const handleClose = () => {
    if (onFunctionCall) {
      onFunctionCall({ call: 'hide', args: { componentId: component.id } });
    }
    if (onAction) {
      onAction('modal_closed', { componentId: component.id });
    }
  };

  return (
    <RadixDialog.Root open={true} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
          }}
        />
        <RadixDialog.Content
          onEscapeKeyDown={handleClose}
          onInteractOutside={handleClose}
          style={{
            ...themeVars,
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'var(--freesail-bg-raised)',
            color: 'var(--freesail-text-foreground)',
            padding: 'var(--freesail-space-lg)',
            borderRadius: 'var(--freesail-radius-lg)',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: 'var(--freesail-shadow-md)',
            zIndex: 1001,
          }}
        >
          <RadixDialog.Title style={{ display: 'none' }} />
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 'var(--freesail-space-sm)',
              right: 'var(--freesail-space-sm)',
              cursor: 'pointer',
              border: 'none',
              background: 'none',
              fontSize: 'var(--freesail-icon-lg)',
              color: 'var(--freesail-text-secondary)',
            }}
          >
            &times;
          </button>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

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
      fontSize: 'var(--freesail-type-body)',
      fontWeight: 600,
      color: 'var(--freesail-text-foreground)',
      marginBottom: 'var(--freesail-space-md)',
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
// ---------------------------------------------------------------------------
// FluidGrid — responsive auto-fill masonry-style grid (no headers)
// ---------------------------------------------------------------------------
export function FluidGrid({ component, children }: FreesailComponentProps) {
  const minItemWidth = sanitizeCssValue(
    (component['minItemWidth'] as string) ?? '200px'
  );
  const gap = sanitizeCssValue(
    (component['gap'] as string) ?? 'var(--freesail-space-sm)'
  );
  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(min(${minItemWidth}, 100%), 1fr))`,
    gap,
    width: '100%',
  };
  return <div style={style}>{children}</div>;
}

// ---------------------------------------------------------------------------
// TabularGrid — header row + data rows, collapses to single column < 480 cqi
// ---------------------------------------------------------------------------
export function TabularGrid({ component, children }: FreesailComponentProps) {
  const uid = useId().replace(/:/g, '');
  const gridClass = `fs-grid-${uid}`;

  const headers = (component['headers'] as string[]) ?? [];
  const colCount = headers.length || (component['columns'] as number) || 1;
  const childArray = Array.isArray(children) ? children : children ? [children] : [];
  const columnWeights = (component['columnWeights'] as number[]) ?? [];
  const rowPadding = sanitizeCssValue((component['rowPadding'] as string) ?? '10px 16px');

  // Build grid-template-columns from optional weights or fall back to equal sizing
  const gridCols = useMemo(() => {
    if (columnWeights.length > 0) {
      return Array.from({ length: colCount }, (_, i) => {
        const w = columnWeights[i] ?? 1;
        return `minmax(min-content, ${w}fr)`;
      }).join(' ');
    }
    return `repeat(${colCount}, minmax(min-content, 1fr))`;
  }, [colCount, columnWeights.join(',')]);

  const hasHeaders = headers.length > 0;
  const showGridLines = component['showGridLines'] !== false;
  const themeVars = applyComponentTheme(component['theme'] as Record<string, string> | undefined);

  const wrapperClass = `${gridClass}-wrapper`;

  const styleContent = useMemo(() => `
    .${wrapperClass}::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    .${wrapperClass}::-webkit-scrollbar-track {
      background: transparent;
      margin: 6px;
    }
    .${wrapperClass}::-webkit-scrollbar-thumb {
      background: var(--freesail-border);
      border-radius: 99px;
      border: 3px solid transparent;
      background-clip: content-box;
    }
    .${wrapperClass}::-webkit-scrollbar-thumb:hover {
      background: var(--freesail-text-secondary);
      background-clip: content-box;
    }
    .${wrapperClass} {
      scrollbar-width: thin;
      scrollbar-color: var(--freesail-border) transparent;
    }
    .${gridClass} {
      display: grid;
      grid-template-columns: ${gridCols};
      min-width: 100%;
      font-size: var(--freesail-type-body);
      color: var(--freesail-text-foreground);
    }
    /* All wrappers transparent — cover explicit depths + any intermediate layout div */
    .${gridClass} > .fs-grid-row,
    .${gridClass} > .fs-grid-row > div,
    .${gridClass} > .fs-grid-row > div > div,
    .${gridClass} > .fs-grid-row > div > div > div,
    .${gridClass} > .fs-grid-row [data-freesail-weight],
    .${gridClass} > .fs-grid-row [data-freesail-component],
    .${gridClass} > .fs-grid-row [data-freesail-component] > div.fs-layout {
      display: contents !important;
    }
    /* Leaf cell: flex-centered, full height */
    .${gridClass} > .fs-grid-row [data-freesail-component] > *:not([data-freesail-component]) {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: flex-start !important;
      padding: ${rowPadding};
      ${showGridLines ? 'border-bottom: 1px solid var(--freesail-border);' : ''}
    }
    ${hasHeaders ? `
    .${gridClass} > .fs-grid-row:nth-child(odd) [data-freesail-component] > *:not([data-freesail-component]) {
      background: var(--freesail-bg-raised) !important;
    }
    .${gridClass} > .fs-grid-row:nth-child(even) [data-freesail-component] > *:not([data-freesail-component]) {
      background: var(--freesail-bg-muted) !important;
    }` : ''}
    @container freesail-surface (max-width: 480px) {
      .${gridClass} { grid-template-columns: 1fr; }
      .${gridClass} > .fs-grid-row [data-freesail-component] > *:not([data-freesail-component]) {
        display: block;
      }
    }
  `, [gridClass, wrapperClass, gridCols, rowPadding, hasHeaders, showGridLines]);




  const wrapperStyle: CSSProperties = {
    ...themeVars,
    width: '100%',
    overflowX: 'auto',
    overflowY: 'auto',
    border: '1px solid var(--freesail-border)',
    borderRadius: 'var(--freesail-radius-md)',
  };

  const headerCellStyle: CSSProperties = {
    padding: 'var(--freesail-space-sm) var(--freesail-space-md)',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 'var(--freesail-type-caption)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--freesail-text-secondary)',
    background: 'var(--freesail-bg-muted)',
    borderBottom: '2px solid var(--freesail-border)',
  };

  return (
    <>
      <style>{styleContent}</style>
      <div className={wrapperClass} style={wrapperStyle}>
        <div className={gridClass}>
          {/* Header row */}
          {headers.length > 0 ? headers.map((header, i) => {
            const headerText = typeof header === 'object' && header !== null && 'label' in header
              ? String((header as any).label)
              : String(header);
            return <div key={`h-${i}`} style={headerCellStyle}>{headerText}</div>;
          }) : null}
          {/* Data rows */}
          {childArray.map((child, i) => (
            <div key={`r-${i}`} className="fs-grid-row">
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


// =============================================================================
// Interactive Components
// =============================================================================

/**
 * CheckBox - checkbox with label.
 */
export function CheckBox({ component, meta, onDataChange }: FreesailComponentProps) {
  const label = (component['label'] as string) ?? '';
  const checked = (component['value'] as boolean) ?? false;
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);
  const boundPath = meta.getBinding('value')?.path ?? null;
  const [localChecked, setLocalChecked] = useState(checked);

  useEffect(() => { setLocalChecked(checked); }, [checked]);

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--freesail-space-sm)',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)' }}>
      <label style={style}>
        <RadixCheckbox.Root
          checked={localChecked}
          onCheckedChange={(checked) => {
            const newVal = checked === 'indeterminate' ? false : Boolean(checked);
            setLocalChecked(newVal);
            const writePath = boundPath ?? `/input/${component.id}`;
            if (onDataChange) onDataChange(writePath, newVal);
          }}
          style={{
            width: '16px',
            height: '16px',
            flexShrink: 0,
            borderRadius: 'var(--freesail-radius-sm)',
            border: fieldBorder(!!validationError),
            background: localChecked ? 'var(--freesail-primary)' : 'var(--freesail-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <RadixCheckbox.Indicator>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="var(--freesail-primary-foreground)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
        <span>{label}</span>
      </label>
      {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)' }}>{validationError}</div>}
    </div>
  );
}

// =============================================================================
// Display Components
// =============================================================================

/**
 * Image - displays an image.
 */
export function Image({ component, onAction }: FreesailComponentProps) {
  const src = String((component['src'] as string) ?? (component['url'] as string) ?? '');
  const alt = String((component['alt'] as string) ?? '');
  const [error, setError] = useState(false);
  useEffect(() => { setError(false); }, [src]);

  if (!isSafeUrl(src)) {
    return <div style={{ color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-body)' }}>Invalid image URL</div>;
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        minHeight: '40px',
        color: 'var(--freesail-border)',
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 5v6.59l-3-3.01-4 4.01-4-4-4 4-3-3.01V5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2zm-3 6.42 3 3.01V19c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-6.58l3 2.99 4-4 4 4 4-3.99z"/>
          <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }

  const fit = (component['fit'] as React.CSSProperties['objectFit']) ?? 'contain';

  const style: CSSProperties = {
    width: (component['width'] as string) ?? '100%',
    height: (component['height'] as string) ?? '100%',
    objectFit: fit,
    display: 'block',
    borderRadius: (component['borderRadius'] as string) ?? '0',
  };

  return <img src={src} alt={alt} style={style} onError={() => {
    setError(true);
  }} />;
}

/**
 * Divider - horizontal or vertical line separator.
 */
export function Divider({ component }: FreesailComponentProps) {
  const axis = (component['axis'] as string) ?? 'horizontal';
  const color = getSemanticColor(component['color'] as string) ?? 'var(--freesail-border)';

  if (axis === 'vertical') {
    return (
      <div
        style={{
          width: '1px',
          alignSelf: 'stretch',
          backgroundColor: color,
          margin: '0 var(--freesail-space-sm)',
        }}
      />
    );
  }

  const style: CSSProperties = {
    border: 'none',
    borderTop: `1px solid ${color}`,
    margin: (component['margin'] as string) ?? 'var(--freesail-space-md) 0',
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
    gap: 'var(--freesail-space-sm)',
    maxHeight,
    overflowY: maxHeight !== 'auto' ? 'auto' : undefined,
  };

  return <div className="fs-layout" style={style}>{children}</div>;
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
  const [activeTab, setActiveTab] = useState('0');
  const childArray = React.Children.toArray(children);

  const getComponentTitle = (child: React.ReactNode): string | undefined => {
    if (!React.isValidElement(child)) return undefined;
    if (child.props?.component && 'title' in child.props.component) {
      return String(child.props.component.title);
    }
    if (child.props?.children) {
      if (Array.isArray(child.props.children)) {
        for (const c of child.props.children) {
          const title = getComponentTitle(c);
          if (title !== undefined) return title;
        }
      } else {
        return getComponentTitle(child.props.children);
      }
    }
    return undefined;
  };

  const tabTitles: string[] = childArray.map((child) => getComponentTitle(child) ?? 'Tab');

  return (
    <RadixTabs.Root value={activeTab} onValueChange={setActiveTab} style={{ display: 'flex', flexDirection: 'column' }}>
      <RadixTabs.List
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--freesail-border)',
          marginBottom: 'var(--freesail-space-md)',
        }}
      >
        {tabTitles.map((title, index) => {
          const val = String(index);
          const isActive = activeTab === val;
          return (
            <RadixTabs.Trigger
              key={val}
              value={val}
              style={{
                padding: 'var(--freesail-space-sm) var(--freesail-space-md)',
                cursor: 'pointer',
                border: 'none',
                background: 'none',
                borderBottom: isActive ? '2px solid var(--freesail-primary)' : '2px solid transparent',
                color: isActive ? 'var(--freesail-primary-hover)' : 'var(--freesail-text-secondary)',
                fontWeight: isActive ? '500' : 'normal',
                fontSize: 'var(--freesail-type-body)',
              }}
            >
              {title}
            </RadixTabs.Trigger>
          );
        })}
      </RadixTabs.List>
      {childArray.map((child, index) => (
        <RadixTabs.Content key={index} value={String(index)} style={{ flex: 1, minHeight: 0 }}>
          {child}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
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
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
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
      return <div style={{ color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-body)' }}>Invalid video URL</div>;
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
    return <div style={{ color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-body)' }}>Invalid video URL</div>;
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
    <div style={{ fontSize: 'var(--freesail-type-body)', color: 'var(--freesail-text-secondary)' }}>{description}</div>
  ) : null;

  if (embed) {
    // Detect Spotify URLs (track, album, playlist, episode)
    const spotifyMatch = url.match(
      /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/
    );
    if (spotifyMatch) {
      const [, type, id] = spotifyMatch;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-sm)', width: '100%' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-sm)', width: '100%' }}>
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
      return <div style={{ color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-body)' }}>Invalid audio URL</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-sm)', width: '100%' }}>
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
    return <div style={{ color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-body)' }}>Invalid audio URL</div>;
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
export function Slider({ component, meta, onDataChange }: FreesailComponentProps) {
  const label = String((component['label'] as string) ?? '');
  const step = Number((component['step'] as number) ?? 1);
  const stepStr = step.toString();
  const dp = Math.min(stepStr.includes('.') ? (stepStr.split('.')[1] ?? '').length : 0, 2);
  const round = (n: number) => dp > 0 ? parseFloat(n.toFixed(dp)) : n;
  const fmt = (n: number) => dp > 0 ? n.toFixed(dp) : String(n);

  const min = round(Number((component['min'] as number) ?? 0));
  const max = round(Number((component['max'] as number) ?? 100));
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  const boundPath = meta.getBinding('value')?.path ?? null;

  const rawValue = component['value'];
  const isMulti = Array.isArray(rawValue);
  const valueArray: number[] = isMulti
    ? (rawValue as unknown[]).map(v => round(Number(v)))
    : [round(Number(rawValue ?? min))];

  const [localValues, setLocalValues] = useState<number[]>(valueArray);

  const valueKey = JSON.stringify(valueArray);
  useEffect(() => { setLocalValues(valueArray); }, [valueKey]);

  const handleSliderChange = (values: number[]) => {
    const rounded = values.map(round);
    setLocalValues(rounded);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) {
      const out = dp > 0 ? rounded.map(fmt) : rounded;
      onDataChange(writePath, isMulti ? out : out[0]);
    }
  };

  const displayValue = isMulti ? localValues.map(fmt).join(' – ') : fmt(localValues[0] ?? min);

  const sliderWidth = `clamp(160px, ${(max - min) / step}cqi, 100%)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)', width: sliderWidth }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--freesail-space-lg)' }}>
          <label style={{ fontSize: 'var(--freesail-type-body)', fontWeight: 500 }}>{label}</label>
          <span style={{ fontSize: 'var(--freesail-type-label)', color: 'var(--freesail-text-secondary)', flexShrink: 0 }}>{displayValue}</span>
        </div>
      )}
      <RadixSlider.Root
        min={min}
        max={max}
        step={step}
        value={localValues}
        onValueChange={handleSliderChange}
        style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '20px', userSelect: 'none', width: '100%' }}
      >
        <RadixSlider.Track
          style={{
            position: 'relative',
            flexGrow: 1,
            borderRadius: '9999px',
            height: '4px',
            background: 'var(--freesail-border)',
          }}
        >
          <RadixSlider.Range
            style={{
              position: 'absolute',
              borderRadius: '9999px',
              height: '100%',
              background: 'var(--freesail-primary)',
            }}
          />
        </RadixSlider.Track>
        {localValues.map((_, index) => (
          <RadixSlider.Thumb
            key={index}
            aria-label={isMulti ? `${label} thumb ${index + 1}` : label}
            style={{
              display: 'block',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: 'var(--freesail-primary)',
              border: '2px solid var(--freesail-bg-raised)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              cursor: 'pointer',
            }}
          />
        ))}
      </RadixSlider.Root>
      {!label && (
        <span style={{ fontSize: 'var(--freesail-type-label)', color: 'var(--freesail-text-secondary)', textAlign: 'right' }}>{displayValue}</span>
      )}
      {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)' }}>{validationError}</div>}
    </div>
  );
}

/**
 * Dropdown - A select dropdown for choosing a single option.
 */
export function Dropdown({ component, meta, onDataChange }: FreesailComponentProps) {
  const fsTheme = useFreesailTheme();
  const cssVars = tokensToCssVars(fsTheme.tokens, fsTheme.mode);
  const label = component['label'] as string | undefined;
  const placeholder = (component['placeholder'] as string | undefined) ?? 'Select an option';
  const width = component['width'] as string | undefined;
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  const rawOptions = component['options'];

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

  const rawValueString = component['value'];
  const value: string = typeof rawValueString === 'string' ? rawValueString : '';

  const boundPath = meta.getBinding('value')?.path ?? null;

  const [localValue, setLocalValue] = useState(value);
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleValueChange = (newValue: string) => {
    setLocalValue(newValue);
    const writePath = boundPath ?? `/input/${component.id}`;
    if (onDataChange) onDataChange(writePath, newValue);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)', width: width ?? undefined }}>
      {label && <label style={{ fontSize: 'var(--freesail-type-label)', fontWeight: 500 }}>{label}</label>}
      <RadixSelect.Root value={localValue} onValueChange={handleValueChange}>
        <RadixSelect.Trigger
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--freesail-space-sm) var(--freesail-space-md)',
            borderRadius: 'var(--freesail-radius-md)',
            border: fieldBorder(!!validationError),
            fontSize: 'var(--freesail-type-body)',
            backgroundColor: 'var(--freesail-bg)',
            color: localValue ? 'var(--freesail-text-foreground)' : 'var(--freesail-text-secondary)',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            style={{
              ...cssVars,
              background: 'var(--freesail-bg-raised)',
              border: '1px solid var(--freesail-border)',
              borderRadius: 'var(--freesail-radius-md)',
              boxShadow: 'var(--freesail-shadow-md)',
              zIndex: 9999,
              minWidth: 'var(--radix-select-trigger-width)',
              overflow: 'hidden',
            }}
          >
            <RadixSelect.Viewport style={{ padding: 'var(--freesail-space-xs)' }}>
              {options.map((opt) => {
                const isSelected = localValue === opt.value;
                const isHovered = hoveredValue === opt.value;
                return (
                  <RadixSelect.Item
                    key={opt.value}
                    value={opt.value}
                    onMouseEnter={() => setHoveredValue(opt.value)}
                    onMouseLeave={() => setHoveredValue(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: 'var(--freesail-space-sm) var(--freesail-space-md)',
                      borderRadius: 'var(--freesail-radius-sm)',
                      fontSize: 'var(--freesail-type-body)',
                      cursor: 'pointer',
                      outline: isHovered && !isSelected ? '1px solid var(--freesail-border)' : 'none',
                      userSelect: 'none',
                      background: isSelected
                        ? 'var(--freesail-primary)'
                        : isHovered
                          ? 'var(--freesail-bg-muted)'
                          : 'transparent',
                      color: isSelected
                        ? 'var(--freesail-primary-foreground)'
                        : 'var(--freesail-text-foreground)',
                    }}
                  >
                    <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                  </RadixSelect.Item>
                );
              })}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
      {validationError && <div style={{ fontSize: 'var(--freesail-type-caption)', color: 'var(--freesail-error)', marginTop: 'var(--freesail-space-xs)' }}>{validationError}</div>}
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
  const CHART_H = typeof component['chartHeight'] === 'number' ? component['chartHeight'] : 244;
  const heightProp = component['height'] as string | undefined;
  const widthProp = component['width'] as string | undefined;

  if (data.length === 0) {
    return <div style={{ color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-body)' }}>No chart data</div>;
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);

  if (orientation === 'horizontal') {
    const barHeight = 28;
    const gap = 8;
    const labelWidth = Math.min(200, Math.max(80, Math.max(...data.map(d => d.label.length)) * 7));
    const svgHeight = data.length * (barHeight + gap) - gap;
    const chartWidth = 300;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: widthProp ?? (heightProp ? 'fit-content' : '100%'), minWidth: 0 }}>
        <ChartTitle title={title} />
        <svg viewBox={`0 0 ${labelWidth + chartWidth + 60} ${svgHeight}`}
          preserveAspectRatio="xMinYMin meet"
          {...(heightProp ? { height: heightProp } : { width: '100%' })}
          style={{ overflow: 'visible', display: 'block', ...(!heightProp && { aspectRatio: `${labelWidth + chartWidth + 60} / ${svgHeight}` }) }}>
          {data.map((d, i) => {
            const y = i * (barHeight + gap);
            const barW = (d.value / maxVal) * chartWidth;
            const fill = d.color ?? defaultColor;
            return (
              <g key={i}>
                <text x={labelWidth - 8} y={y + barHeight / 2} textAnchor="end"
                  dominantBaseline="central" fontSize="12"
                  fill="var(--freesail-text-secondary)">
                  {d.label}
                </text>
                <rect x={labelWidth} y={y} width={barW} height={barHeight}
                  rx={4} fill={fill} opacity={0.85} />
                {showValues && (
                  <text x={labelWidth + barW + 6} y={y + barHeight / 2}
                    dominantBaseline="central" fontSize="12" fontWeight="500"
                    fill="var(--freesail-text-foreground)">
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
  const gridLines = 4;
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxVal / gridLines) * i));
  const maxYLabelLen = Math.max(...gridVals.map(v => v.toLocaleString().length));
  const yAxisLeftPad = Math.max(40, maxYLabelLen * 7 + 12);
  const svgWidth = 500;
  const chartWEst = svgWidth - yAxisLeftPad - 16;
  const stepEst = chartWEst / data.length;
  const maxXLabelLen = Math.max(...data.map(d => d.label.length));
  const rotateLabels = maxXLabelLen * 7 > stepEst * 0.9;
  const firstLabelBleed = rotateLabels ? Math.ceil((data[0]?.label.length ?? 0) * 4.95) : 0;
  const leftPad = Math.max(yAxisLeftPad, firstLabelBleed);
  const bottomPad = rotateLabels ? Math.min(120, Math.round(maxXLabelLen * 4.5) + 8) : 40;
  const svgHeight = 16 + CHART_H + bottomPad;
  const padding = { top: 16, right: 16, bottom: bottomPad, left: leftPad };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = CHART_H;
  const barWidth = Math.min(40, (chartW / data.length) * 0.6);
  const step = chartW / data.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: widthProp ?? (heightProp ? 'fit-content' : '100%'), minWidth: 0 }}>
      <ChartTitle title={title} />
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMinYMin meet"
        {...(heightProp ? { height: heightProp } : { width: '100%' })}
        style={{ overflow: 'visible', display: 'block', ...(!heightProp && { aspectRatio: `${svgWidth} / ${svgHeight}` }) }}>
        {/* Grid lines */}
        {gridVals.map((v, i) => {
          const y = padding.top + chartH - (v / maxVal) * chartH;
          return (
            <g key={`grid-${i}`}>
              <line x1={padding.left} y1={y} x2={svgWidth - padding.right} y2={y}
                stroke="var(--freesail-border)" strokeWidth={1} />
              <text x={padding.left - 8} y={y} textAnchor="end" dominantBaseline="central"
                fontSize="11" fill="var(--freesail-text-secondary)">
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
          const labelY = padding.top + chartH + 16;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={3}
                fill={fill} opacity={0.85} />
              {showValues && (
                <text x={x + barWidth / 2} y={y - 6} textAnchor="middle"
                  fontSize="11" fontWeight="500"
                  fill="var(--freesail-text-foreground)">
                  {d.value.toLocaleString()}
                </text>
              )}
              {rotateLabels ? (
                <text x={x + barWidth / 2} y={labelY} textAnchor="end" fontSize="11"
                  transform={`rotate(-45 ${x + barWidth / 2} ${labelY})`}
                  fill="var(--freesail-text-secondary)">
                  {d.label}
                </text>
              ) : (
                <text x={x + barWidth / 2} y={labelY} textAnchor="middle" fontSize="11"
                  fill="var(--freesail-text-secondary)">
                  {d.label}
                </text>
              )}
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
  const CHART_H = typeof component['chartHeight'] === 'number' ? component['chartHeight'] : 244;
  const heightProp = component['height'] as string | undefined;
  const widthProp = component['width'] as string | undefined;

  if (data.length < 2) {
    return <div style={{ color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-body)' }}>Need at least 2 data points</div>;
  }

  const svgWidth = 500;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const minVal = Math.min(...data.map(d => d.value), 0);
  const range = maxVal - minVal || 1;

  // Grid
  const gridLines = 4;
  const gridVals = Array.from({ length: gridLines + 1 }, (_, i) =>
    minVal + (range / gridLines) * i);
  const maxYLabelLen = Math.max(...gridVals.map(v => Math.round(v).toLocaleString().length));
  const yAxisLeftPad = Math.max(40, maxYLabelLen * 7 + 12);
  const chartWEst = svgWidth - yAxisLeftPad - 16;
  const stepWEst = data.length > 1 ? chartWEst / (data.length - 1) : chartWEst;
  const maxXLabelLen = Math.max(...data.map(d => d.label.length));
  const rotateLabels = maxXLabelLen * 7 > stepWEst * 0.9;
  const firstLabelBleed = rotateLabels ? Math.ceil((data[0]?.label.length ?? 0) * 4.95) : 0;
  const leftPad = Math.max(yAxisLeftPad, firstLabelBleed);
  const bottomPad = rotateLabels ? Math.min(120, Math.round(maxXLabelLen * 4.5) + 8) : 40;
  const svgHeight = 16 + CHART_H + bottomPad;
  const padding = { top: 16, right: 16, bottom: bottomPad, left: leftPad };

  const chartW = svgWidth - padding.left - padding.right;
  const chartH = CHART_H;

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - ((d.value - minVal) / range) * chartH,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = linePath +
    ` L${points[points.length - 1]!.x},${padding.top + chartH}` +
    ` L${points[0]!.x},${padding.top + chartH} Z`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: widthProp ?? (heightProp ? 'fit-content' : '100%'), minWidth: 0 }}>
      <ChartTitle title={title} />
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMinYMin meet"
        {...(heightProp ? { height: heightProp } : { width: '100%' })}
        style={{ overflow: 'visible', display: 'block', ...(!heightProp && { aspectRatio: `${svgWidth} / ${svgHeight}` }) }}>
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
                stroke="var(--freesail-border)" strokeWidth={1} />
              <text x={padding.left - 8} y={y} textAnchor="end" dominantBaseline="central"
                fontSize="11" fill="var(--freesail-text-secondary)">
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
          const labelY = padding.top + chartH + 16;
          return rotateLabels ? (
            <text key={`label-${i}`} x={x} y={labelY} textAnchor="end" fontSize="11"
              transform={`rotate(-45 ${x} ${labelY})`}
              fill="var(--freesail-text-secondary)">
              {d.label}
            </text>
          ) : (
            <text key={`label-${i}`} x={x} y={labelY} textAnchor="middle" fontSize="11"
              fill="var(--freesail-text-secondary)">
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
  const size = (component['size'] as number) ?? 250;

  if (data.length === 0) {
    return <div style={{ color: 'var(--freesail-text-secondary)', fontSize: 'var(--freesail-type-body)' }}>No chart data</div>;
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
      color: getSemanticColor(d.color) ?? defaultPalette[i % defaultPalette.length],
      label: d.label,
      value: d.value,
      percentage: Math.round(fraction * 100),
    };
  });

  const align = (component['align'] as string) ?? 'start';
  const justifyMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end' };
  const justify = justifyMap[align] ?? 'flex-start';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}>
      <ChartTitle title={title} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: justify, gap: 'var(--freesail-space-lg)', flexWrap: 'wrap', width: '100%' }}>
        <svg viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet" style={{ flex: '1 1 0', maxWidth: `${size}px`, minWidth: `${Math.round(size / 2)}px`, aspectRatio: '1 / 1', overflow: 'visible', display: 'block' }}>
          {segments.map((seg, i) => (
            <path key={i} d={seg.path} fill={seg.color} stroke="white" strokeWidth={2} />
          ))}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--freesail-space-xs)', flexShrink: 0 }}>
          {segments.map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--freesail-space-sm)', fontSize: 'var(--freesail-type-label)', whiteSpace: 'nowrap' }}>
              <div style={{
                width: '12px', height: '12px', borderRadius: '2px',
                backgroundColor: seg.color, flexShrink: 0,
              }} />
              <span style={{ color: 'var(--freesail-text-foreground)' }}>{seg.label}</span>
              <span style={{ color: 'var(--freesail-text-secondary)' }}>
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
  const width = parseInt(String(component['width'] ?? 120), 10) || 120;
  const height = parseInt(String(component['height'] ?? 32), 10) || 32;

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
  ensureMaterialSymbols();
  const label = (component['label'] as string) ?? '';
  const value = (component['value'] as string) ?? '';
  const trend = component['trend'] as string | undefined;
  const trendValue = component['trendValue'] as string | undefined;
  const accentColor = getSemanticColor(component['color'] as string) ?? 'var(--freesail-primary)';
  const width = component['width'] as string | undefined;

  const defaultTrendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : 'var(--freesail-text-secondary)';
  const trendColor = getSemanticColor(component['trendColor'] as string) ?? defaultTrendColor;

  const cardStyle: CSSProperties = {
    flex: width ? '0 0 auto' : '0 1 auto',
    minWidth: '200px',
    width: width ?? undefined,
    padding: 'var(--freesail-space-md)',
    borderRadius: '12px',
    border: '1px solid var(--freesail-border)',
    backgroundColor: 'var(--freesail-bg-raised)',
    borderLeft: `4px solid ${accentColor}`,
    alignSelf: 'stretch',
    overflow: 'hidden',
  };

  return (
    <div style={cardStyle}>
      <div style={{
        fontSize: 'var(--freesail-type-label)',
        color: 'var(--freesail-text-secondary)',
        marginBottom: 'var(--freesail-space-xs)',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        overflow: 'hidden',
      }}>{label}</div>
      <div style={{
        fontSize: 'var(--freesail-type-h2)',
        fontWeight: 700,
        color: 'var(--freesail-text-foreground)',
        lineHeight: 1.2,
        minHeight: '1.2em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{value || '\u00A0'}</div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--freesail-space-xs)',
        marginTop: 'var(--freesail-space-xs)',
        fontSize: 'var(--freesail-type-body)',
        fontWeight: 600,
        color: trendColor,
        visibility: (trend || trendValue) ? 'visible' : 'hidden',
      }}>
        <span style={{
          fontFamily: "'Material Symbols Outlined'",
          fontSize: 'var(--freesail-icon-sm)',
          lineHeight: 1,
          color: trendColor,
          flexShrink: 0,
        }}>
          {trend === 'up' ? 'arrow_upward' : trend === 'down' ? 'arrow_downward' : 'arrow_forward'}
        </span>
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
  Column, Row, Card, Text, Button, TextField, Icon, DateInput, TimeInput, Modal, Spacer,
  ChoicePickerSingleSelect, ChoicePickerMultiSelect,
  FluidGrid, TabularGrid, CheckBox, Image, Divider, List, Tab, TabGroup,
  Video, AudioPlayer, Slider, Dropdown, BarChart, LineChart, PieChart, Sparkline, StatCard,
};
