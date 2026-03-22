/**
 * @fileoverview Common Components
 *
 * The shared UI component set that all Freesail catalogs include.
 * These form the base vocabulary every agent can rely on.
 *
 * When a developer runs `npx freesail new catalog`, this file is copied
 * into the new catalog's src/ folder. The developer then owns it and can
 * modify or extend it freely.
 */

import React, { useState, useEffect, type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';
import type { FunctionCall } from '@freesail/core';
import { commonFunctions } from './CommonFunctions.js';
import {
  getSemanticColor,
  getSemanticBackground,
  mapJustify,
  toInputFormat,
  validateChecks,
} from './common-utils.js';

// =============================================================================
// Layout Components
// =============================================================================

export function Column({ component, children }: FreesailComponentProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: (component['gap'] as string) ?? '8px',
    padding: (component['padding'] as string) ?? undefined,
    alignItems: (component['align'] as CSSProperties['alignItems']) ?? 'start',
  };

  return <div style={style}>{children}</div>;
}

export function Row({ component, children }: FreesailComponentProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap: (component['gap'] as string) ?? '8px',
    padding: (component['padding'] as string) ?? undefined,
    alignItems: (component['align'] as CSSProperties['alignItems']) ?? 'start',
    justifyContent: mapJustify(component['justify'] as string),
    flexWrap: (component['wrap'] as CSSProperties['flexWrap']) ?? 'nowrap',
  };

  return <div style={style}>{children}</div>;
}

export function Card({ component, children }: FreesailComponentProps) {
  const style: CSSProperties = {
    padding: (component['padding'] as string) ?? '1.5rem',
    width: (component['width'] as string) ?? undefined,
    height: (component['height'] as string) ?? undefined,
    borderRadius: (component['borderRadius'] as string) ?? 'var(--freesail-radius-md)',
    border: '1px solid var(--freesail-border, #e2e8f0)',
    boxShadow: 'var(--freesail-shadow-sm)',
    background: getSemanticBackground(component['background'] as string) ?? 'var(--freesail-bg-surface, #ffffff)',
    color: getSemanticColor(component['color'] as string) ?? 'var(--freesail-text-main, #0f172a)',
    alignSelf: 'stretch',
  };

  return <div style={style}>{children}</div>;
}

// =============================================================================
// Text Components
// =============================================================================

export function Text({ component }: FreesailComponentProps) {
  const rawText = component['text'] ?? '';
  const text = (typeof rawText === 'object' && rawText !== null
    ? JSON.stringify(rawText)
    : String(rawText)).replace(/\\n/g, '\n');

  const style: CSSProperties = {
    fontSize: (component['size'] as string) ?? '14px',
    fontWeight: (component['weight'] as CSSProperties['fontWeight']) ?? 'normal',
    color: getSemanticColor(component['color'] as string) ?? 'inherit',
    whiteSpace: 'pre-line',
    margin: 0,
  };

  const variant = (component['variant'] as string) ?? 'body';

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
      // Fallback: detect markdown-style heading prefixes only when no explicit variant
      if (text.startsWith('# ')) {
        return <h1 style={{ ...style, fontSize: '2em', fontWeight: 'bold' }}>{text.slice(2)}</h1>;
      }
      if (text.startsWith('## ')) {
        return <h2 style={{ ...style, fontSize: '1.5em', fontWeight: 'bold' }}>{text.slice(3)}</h2>;
      }
      if (text.startsWith('### ')) {
        return <h3 style={{ ...style, fontSize: '1.17em', fontWeight: 'bold' }}>{text.slice(4)}</h3>;
      }
      return <span style={style}>{text}</span>;
  }
}

export function Icon({ component }: FreesailComponentProps) {
  const rawName = component['name'];
  const name = (typeof rawName === 'string') ? rawName : 'help';
  const size = (component['size'] as string) ?? '24px';
  const color = getSemanticColor(component['color'] as string) ?? 'currentColor';

  // Convert camelCase icon names to snake_case for Material Symbols font ligatures
  const toSnakeCase = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

  // Map names that differ between our enum and Material Symbols ligature names
  const aliasMap: Record<string, string> = {
    favoriteOff: 'favorite_border',
    starOff: 'star_border',
    clock: 'schedule',
    database: 'storage',
    bug: 'bug_report',
    shield: 'security',
    draft: 'drafts',
    email: 'mail',
    videoCamera: 'videocam',
    table: 'table_chart',
    tag: 'label',
    task: 'task_alt',
  };

  const ligature = aliasMap[name] ?? toSnakeCase(name);

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

  return <span style={style}>{ligature}</span>;
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
    padding: '0.5rem 1rem',
    borderRadius: 'var(--freesail-radius-md)',
    border: 'none',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    opacity: isDisabled ? 0.55 : 1,
    transition: 'background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease, opacity 0.15s ease',
    transform: !isDisabled && isActive ? 'scale(0.97)' : 'scale(1)',
    userSelect: 'none',
    outline: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  };

  const variantStyles: Record<string, CSSProperties> = {
    primary: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-primary, #2563eb) 80%, #000)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-primary, #2563eb) 88%, #000)'
          : 'var(--freesail-primary, #2563eb)',
      color: 'var(--freesail-primary-text, #ffffff)',
      boxShadow: !isDisabled && isActive
        ? 'none'
        : !isDisabled && isHovered
          ? '0 2px 8px color-mix(in srgb, var(--freesail-primary, #2563eb) 40%, transparent)'
          : '0 1px 3px rgba(0,0,0,0.15)',
    },
    secondary: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-bg-muted, #f1f5f9) 70%, #000)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-bg-muted, #f1f5f9) 85%, #000)'
          : 'var(--freesail-bg-muted, #f1f5f9)',
      color: 'var(--freesail-text-main, #0f172a)',
      boxShadow: !isDisabled && isActive ? 'none' : !isDisabled && isHovered ? '0 2px 6px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.08)',
    },
    outline: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-primary, #2563eb) 10%, transparent)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-primary, #2563eb) 6%, transparent)'
          : 'transparent',
      border: `1px solid ${!isDisabled && isHovered ? 'var(--freesail-primary, #2563eb)' : 'var(--freesail-border, #e2e8f0)'}`,
      color: !isDisabled && isHovered ? 'var(--freesail-primary, #2563eb)' : 'var(--freesail-text-main, #0f172a)',
    },
    borderless: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-primary, #2563eb) 12%, transparent)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-primary, #2563eb) 7%, transparent)'
          : 'transparent',
      color: 'var(--freesail-primary, #2563eb)',
      textDecoration: !isDisabled && isHovered ? 'underline' : 'none',
    },
    danger: {
      background: !isDisabled && isActive
        ? 'color-mix(in srgb, var(--freesail-error, #ef4444) 80%, #000)'
        : !isDisabled && isHovered
          ? 'color-mix(in srgb, var(--freesail-error, #ef4444) 88%, #000)'
          : 'var(--freesail-error, #ef4444)',
      color: '#fff',
      boxShadow: !isDisabled && isActive ? 'none' : !isDisabled && isHovered ? '0 2px 8px rgba(239,68,68,0.35)' : '0 1px 3px rgba(0,0,0,0.15)',
    },
  };

  const safeVariant = variant === 'text' ? 'borderless' : (variantStyles[variant] ? variant : 'primary');
  const style = { ...baseStyle, ...variantStyles[safeVariant] };

  const handleClick = () => {
    if (isDisabled) return;

    // Execute local function call if present
    if (action && 'functionCall' in action && action.functionCall && onFunctionCall) {
        onFunctionCall(action.functionCall);
    } else if (action && 'call' in action && onFunctionCall) {
        onFunctionCall(action);
    }

    // Dispatch server action — skip if action is purely a client-side function call
    if (onAction && !isFunctionCallAction) {
        onAction(actionName, actionContext);
    }
  };

  return (
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
  );
}

export function TextField({ component, onAction, onDataChange }: FreesailComponentProps) {
  const label = (component['label'] as string) ?? '';
  const hideLabel = (component['hideLabel'] as boolean) ?? false;
  const name = (component['name'] as string) ?? component.id;
  const placeholder = (component['placeholder'] as string) ?? label;
  const variant = (component['variant'] as string) ?? 'shortText';
  const value = (component['value'] as string) ?? '';
  const min = component['min'] as number | undefined;
  const max = component['max'] as number | undefined;

  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path ? rawValue.path : null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (onDataChange && boundPath) {
      onDataChange(boundPath, newValue);
    }
  };

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: hideLabel ? '0' : '8px',
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
      {label && !hideLabel && <label style={labelStyle}>{label}</label>}
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
      {validationError && <div style={errorStyle}>{validationError}</div>}
    </div>
  );
}

// =============================================================================
// Form Components
// =============================================================================

export function DateTimeInput({ component, onDataChange }: FreesailComponentProps) {
  const label = (component['label'] as string) ?? '';
  const value = (component['value'] as string) ?? '';
  const enableDate = (component['enableDate'] as boolean) ?? true;
  const enableTime = (component['enableTime'] as boolean) ?? false;
  const rawMin = (component['min'] as string) ?? undefined;
  const rawMax = (component['max'] as string) ?? undefined;
  const checks = (component['checks'] as any[]) ?? [];
  const validationError = validateChecks(checks);

  const rawValue = component['__rawValue'] as { path?: string } | string | undefined;
  const boundPath = typeof rawValue === 'object' && rawValue?.path ? rawValue.path : null;

  const inputType = enableDate && enableTime ? 'datetime-local' : enableTime ? 'time' : 'date';

  const normalizedValue = toInputFormat(value, inputType);
  const min = rawMin !== undefined ? toInputFormat(rawMin, inputType) : undefined;
  const max = rawMax !== undefined ? toInputFormat(rawMax, inputType) : undefined;

  const [localValue, setLocalValue] = useState(normalizedValue);

  useEffect(() => { setLocalValue(normalizedValue); }, [normalizedValue]);

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
        min={min}
        max={max}
        style={{
          padding: '0.5rem 0.75rem',
          borderRadius: 'var(--freesail-radius-md)',
          border: validationError ? '1px solid var(--freesail-error, #ef4444)' : '1px solid var(--freesail-border, #e2e8f0)',
          fontSize: '14px',
          backgroundColor: 'var(--freesail-bg-root, #ffffff)',
          color: 'var(--freesail-text-main, #0f172a)',
        }}
      />
      {validationError && <div style={{ fontSize: '12px', color: 'var(--freesail-error, #ef4444)', marginTop: '2px' }}>{validationError}</div>}
    </div>
  );
}

export function ChoicePicker({ component, onDataChange }: FreesailComponentProps) {
  const label = String((component['label'] as string) ?? '');
  const variant = (component['variant'] as string) ?? 'mutuallyExclusive';
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

  const rawValue = component['__rawValue'] as { path?: string } | string[] | undefined;
  const boundPath = (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue) && 'path' in rawValue) ? (rawValue as { path?: string }).path : null;

  const [localValue, setLocalValue] = useState(value);

  const valueKey = JSON.stringify(value);
  useEffect(() => { setLocalValue(value); }, [valueKey]);

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
        {validationError && <div style={{ fontSize: '12px', color: 'var(--freesail-error, #ef4444)', marginTop: '2px' }}>{validationError}</div>}
      </div>
    );
  }

  if (options.length > 5) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {label && <label style={{ fontSize: '14px', fontWeight: 500 }}>{label}</label>}
        <select
          value={localValue[0] ?? ''}
          onChange={handleSelectChange}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--freesail-radius-md)', border: validationError ? '1px solid var(--freesail-error, #ef4444)' : '1px solid var(--freesail-border, #e2e8f0)', backgroundColor: 'var(--freesail-bg-root, #ffffff)', color: 'var(--freesail-text-main, #0f172a)' }}
        >
          <option value="" disabled>Select an option</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {validationError && <div style={{ fontSize: '12px', color: 'var(--freesail-error, #ef4444)', marginTop: '2px' }}>{validationError}</div>}
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
      {validationError && <div style={{ fontSize: '12px', color: 'var(--freesail-error, #ef4444)', marginTop: '2px' }}>{validationError}</div>}
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
  const modalRef = React.useRef<HTMLDivElement>(null);

  const handleClose = () => {
    // Hide the modal via hide (writes to data model, triggers re-render)
    if (onFunctionCall) {
      onFunctionCall({ call: 'hide', args: { componentId: component.id } });
    }
    // Notify the agent that the modal was closed
    if (onAction) {
      onAction('modal_closed', { componentId: component.id });
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus the modal content when mounted
  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.focus();
    }
  }, []);

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

  // Modal is always rendered when visible (visibility is controlled by renderComponent)
  return (
    <div style={modalOverlayStyle} onClick={handleClose} role="dialog" aria-modal="true">
      <div ref={modalRef} style={modalContentStyle} onClick={(e) => e.stopPropagation()} tabIndex={-1}>
        <button style={closeButtonStyle} onClick={handleClose} aria-label="Close">
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Component Map
// =============================================================================

export const commonComponents: Record<string, React.ComponentType<FreesailComponentProps>> = {
  Column,
  Row,
  Card,
  Text,
  Button,
  TextField,
  Icon,
  DateTimeInput,
  ChoicePicker,
  Modal,
  Spacer,
};
