/**
 * @fileoverview Chat Catalog Components
 *
 * React components for the Freesail Chat Catalog.
 * Renders a complete chat interface as an A2UI surface.
 */

import React, { useState, useRef, useEffect, type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';

// =============================================================================
// ChatContainer
// =============================================================================

/**
 * Top-level chat layout — header + scrollable messages + input.
 */
export function ChatContainer({ component, children }: FreesailComponentProps) {
  const height = (component['height'] as string) ?? '100%';
  const title = component['title'] as string | undefined;

  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: 'var(--freesail-bg-root, #ffffff)',
    borderRight: '1px solid var(--freesail-border, #e2e8f0)',
  };

  return (
    <div style={style}>
      {title && (
        <div style={{
          padding: '16px',
          borderBottom: '1px solid var(--freesail-border, #e2e8f0)',
          fontWeight: 600,
          fontSize: '16px',
          color: 'var(--freesail-text-main, #0f172a)',
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

// =============================================================================
// ChatMessageList
// =============================================================================

/**
 * Scrollable message list with auto-scroll to bottom.
 */
export function ChatMessageList({ children }: FreesailComponentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  });

  const style: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const hasChildren = React.Children.count(children) > 0;

  return (
    <div ref={containerRef} style={style}>
      {hasChildren ? children : (
        <div style={{ color: 'var(--freesail-text-muted, #64748b)', textAlign: 'center', marginTop: '40px' }}>
          <p>Ask the agent to create UI components!</p>
          <p style={{ fontSize: '13px', marginTop: '8px' }}>
            Try: &quot;Show me a welcome card&quot; or &quot;Create a counter&quot;
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ChatMessage
// =============================================================================

/**
 * A single chat message bubble.
 */
export function ChatMessage({ component, scopeData }: FreesailComponentProps) {
  // Resolve from direct props or scope data (when inside a ChildList template)
  const role = (component['role'] as string) ?? (scopeData as any)?.role ?? 'user';
  const content = (component['content'] as string) ?? (scopeData as any)?.content ?? '';
  const timestamp = (component['timestamp'] as string) ?? (scopeData as any)?.timestamp;

  const isUser = role === 'user';
  const isSystem = role === 'system';

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: isUser ? 'flex-end' : 'flex-start',
  };

  const bubbleStyle: CSSProperties = {
    maxWidth: '85%',
    padding: '10px 14px',
    borderRadius: isUser ? 'var(--freesail-radius-lg) var(--freesail-radius-lg) 4px var(--freesail-radius-lg)' : 'var(--freesail-radius-lg) var(--freesail-radius-lg) var(--freesail-radius-lg) 4px',
    backgroundColor: isSystem ? 'var(--freesail-warning, #f59e0b)' : isUser ? 'var(--freesail-primary, #2563eb)' : 'var(--freesail-bg-muted, #f8fafc)',
    color: isUser ? 'var(--freesail-primary-text, #ffffff)' : 'var(--freesail-text-main, #0f172a)',
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxShadow: 'var(--freesail-shadow-sm)',
  };

  const timeStyle: CSSProperties = {
    fontSize: '11px',
    color: 'var(--freesail-text-muted, #64748b)',
    marginTop: '4px',
    paddingLeft: isUser ? undefined : '4px',
    paddingRight: isUser ? '4px' : undefined,
  };

  return (
    <div style={containerStyle}>
      <div style={bubbleStyle}>{content}</div>
      {timestamp && (
        <span style={timeStyle}>
          {formatTime(timestamp)}
        </span>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// =============================================================================
// ChatInput
// =============================================================================

/**
 * Chat input field with send button.
 * Fires a 'chat_send' action with context { text: string }.
 */
export function ChatInput({ component, onAction }: FreesailComponentProps) {
  const placeholder = (component['placeholder'] as string) ?? 'Type a message...';
  const disabled = (component['disabled'] as boolean) ?? false;
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    if (onAction) {
      onAction('chat_send', { text: trimmed });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const containerStyle: CSSProperties = {
    padding: '16px',
    borderTop: '1px solid var(--freesail-border, #e2e8f0)',
    display: 'flex',
    gap: '8px',
    backgroundColor: 'var(--freesail-bg-root, #ffffff)'
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    padding: '10px 14px',
    border: '1px solid var(--freesail-border, #e2e8f0)',
    borderRadius: '20px',
    fontSize: '14px',
    outline: 'none',
    opacity: disabled ? 0.6 : 1,
    backgroundColor: 'var(--freesail-bg-surface, #ffffff)',
    color: 'var(--freesail-text-main, #0f172a)',
  };

  const buttonStyle: CSSProperties = {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '20px',
    backgroundColor: 'var(--freesail-primary, #2563eb)',
    color: 'var(--freesail-primary-text, #ffffff)',
    fontSize: '14px',
    cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
    opacity: disabled || !text.trim() ? 0.5 : 1,
  };

  return (
    <div style={containerStyle}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={inputStyle}
      />
      <button onClick={handleSend} disabled={disabled || !text.trim()} style={buttonStyle}>
        Send
      </button>
    </div>
  );
}

// =============================================================================
// ChatTypingIndicator
// =============================================================================

/**
 * Animated typing indicator.
 */
export function ChatTypingIndicator({ component, scopeData }: FreesailComponentProps) {
  const visible = (component['visible'] as boolean) ?? (scopeData as any)?.visible ?? false;
  const text = (component['text'] as string) ?? 'Thinking...';

  if (!visible) return null;

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    color: 'var(--freesail-text-muted, #64748b)',
    fontSize: '14px',
  };

  const dotStyle: CSSProperties = {
    display: 'inline-flex',
    gap: '4px',
  };

  return (
    <div style={style}>
      <span style={dotStyle}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </span>
      <span>{text}</span>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  const [opacity, setOpacity] = useState(0.3);

  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity(prev => prev === 1 ? 0.3 : 1);
    }, 600);

    const timeout = setTimeout(() => {
      setOpacity(1);
    }, delay);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [delay]);

  return (
    <span style={{
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      backgroundColor: 'var(--freesail-text-muted, #64748b)',
      opacity,
      transition: 'opacity 0.3s ease',
      display: 'inline-block',
    }} />
  );
}

// =============================================================================
// Component Map Export
// =============================================================================

/**
 * All chat catalog components mapped by name.
 */
export const chatCatalogComponents: Record<string, React.ComponentType<FreesailComponentProps>> = {
  ChatContainer,
  ChatMessageList,
  ChatMessage,
  ChatInput,
  ChatTypingIndicator,
};
