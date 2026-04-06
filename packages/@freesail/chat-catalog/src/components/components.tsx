/**
 * @fileoverview Chat Catalog Components
 *
 * React components for the Freesail Chat Catalog.
 * Renders a complete chat interface as an A2UI surface.
 */

import React, { useState, useRef, useEffect, useContext, useCallback, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import type { FreesailComponentProps } from '@freesail/react';
import { getSemanticColor, getSemanticBackground, getContrastTextColor } from '@freesail/standard-catalog/utils';
import { includedComponents } from '../includes/generated-includes.js';

// =============================================================================
// ChatContext  (internal — optimistic message reflection)
// =============================================================================

interface ChatContextValue {
  optimisticMessages: string[];
  addOptimisticMessage: (text: string) => void;
  clearOptimisticMessages: () => void;
}

const ChatContext = React.createContext<ChatContextValue | null>(null);

// =============================================================================
// OptimisticUserMessage  (internal — instant local echo while agent round-trips)
// =============================================================================

function OptimisticUserMessage({ text }: { text: string }) {
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  };
  const bubbleStyle: CSSProperties = {
    maxWidth: '85%',
    padding: '10px 14px',
    borderRadius: 'var(--freesail-radius-lg) var(--freesail-radius-lg) 4px var(--freesail-radius-lg)',
    backgroundColor: 'var(--freesail-primary, #2563eb)',
    color: '#ffffff',
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxShadow: 'var(--freesail-shadow-sm)',
    opacity: 0.85,
  };
  return (
    <div style={containerStyle}>
      <div style={bubbleStyle}>{text}</div>
    </div>
  );
}

// =============================================================================
// ChatContainer
// =============================================================================

/**
 * Top-level chat layout — header + scrollable content + fixed input.
 *
 * The last child is treated as the fixed footer (ChatInput).
 * All preceding children (messages, AgentStream, typing indicator) are
 * placed inside a single scrollable wrapper with auto-scroll.
 */
export function ChatContainer({ component, children }: FreesailComponentProps) {
  const height = (component['height'] as string) ?? '100%';
  const title = component['title'] as string | undefined;
  const rawBg = component['background'] as string | undefined;
  const background = getSemanticBackground(rawBg);
  const color = getSemanticColor(component['color'] as string | undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [optimisticMessages, setOptimisticMessages] = useState<string[]>([]);
  const addOptimisticMessage = useCallback((text: string) => {
    setOptimisticMessages(prev => [...prev, text]);
  }, []);
  const clearOptimisticMessages = useCallback(() => {
    setOptimisticMessages([]);
  }, []);
  const chatContextValue: ChatContextValue = { optimisticMessages, addOptimisticMessage, clearOptimisticMessages };

  const childArray = React.Children.toArray(children);
  const fixedBottom = childArray.length > 1 ? childArray[childArray.length - 1] : null;
  const scrollableContent = childArray.length > 1 ? childArray.slice(0, -1) : childArray;

  // Auto-scroll to bottom whenever scrollable content changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: background ?? 'var(--freesail-bg-root, #ffffff)',
    color: color ?? (rawBg ? getContrastTextColor(rawBg) : undefined),
    borderRight: '1px solid var(--freesail-border, #e2e8f0)',
  };

  const scrollStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  };

  return (
    <ChatContext.Provider value={chatContextValue}>
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
        <div ref={scrollRef} style={scrollStyle}>
          {scrollableContent}
        </div>
        {fixedBottom}
      </div>
    </ChatContext.Provider>
  );
}

// =============================================================================
// ChatMessageList
// =============================================================================

/**
 * Message list container. Scroll is managed by the parent ChatContainer.
 */
export function ChatMessageList({ children }: FreesailComponentProps) {
  const chatContext = useContext(ChatContext);
  const childCount = React.Children.count(children);
  const prevChildCountRef = useRef(childCount);

  useEffect(() => {
    if (childCount > prevChildCountRef.current) {
      chatContext?.clearOptimisticMessages();
    }
    prevChildCountRef.current = childCount;
  }, [childCount, chatContext]);

  const style: CSSProperties = {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const optimisticMessages = chatContext?.optimisticMessages ?? [];
  const hasChildren = childCount > 0 || optimisticMessages.length > 0;

  return (
    <div style={style}>
      {hasChildren ? (
        <>
          {children}
          {optimisticMessages.map((msg, i) => (
            <OptimisticUserMessage key={`opt-${i}`} text={msg} />
          ))}
        </>
      ) : (
        <div style={{ color: 'var(--freesail-text-muted, #64748b)', textAlign: 'center', marginTop: '40px' }}>
          <p>Ask the agent anything!</p>
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
  const rawBg = component['background'] as string | undefined;
  const rawColor = component['color'] as string | undefined;
  const background = getSemanticBackground(rawBg);
  const color = getSemanticColor(rawColor);

  const isUser = role === 'user';
  const isSystem = role === 'system';

  const defaultBg = isSystem ? 'var(--freesail-warning, #f59e0b)' : isUser ? 'var(--freesail-primary, #2563eb)' : 'var(--freesail-bg-muted, #f8fafc)';
  const defaultColor = isUser ? '#ffffff' : 'var(--freesail-text-main, #0f172a)';

  // When agent provides a background but no explicit color, auto-derive contrast text
  const resolvedColor = rawColor
    ? (color ?? rawColor)
    : rawBg
      ? getContrastTextColor(rawBg, defaultColor)
      : defaultColor;

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: isUser ? 'flex-end' : 'flex-start',
  };

  const bubbleStyle: CSSProperties = {
    maxWidth: '85%',
    padding: '10px 14px',
    borderRadius: isUser ? 'var(--freesail-radius-lg) var(--freesail-radius-lg) 4px var(--freesail-radius-lg)' : 'var(--freesail-radius-lg) var(--freesail-radius-lg) var(--freesail-radius-lg) 4px',
    backgroundColor: background ?? defaultBg,
    color: resolvedColor,
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: isUser ? 'pre-wrap' : undefined,
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
      <div style={bubbleStyle}>
        {isUser ? content : (
          <div className="freesail-chat-md" style={{
            whiteSpace: 'normal',
          }}>
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
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

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

/**
 * Chat input field with send button.
 * Fires a 'chat_send' action with context { text: string }.
 */
export function ChatInput({ component, onAction }: FreesailComponentProps) {
  const placeholder = (component['placeholder'] as string) ?? 'Type a message...';
  const disabled = (component['disabled'] as boolean) ?? false;
  const [text, setText] = useState('');
  const chatContext = useContext(ChatContext);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    chatContext?.addOptimisticMessage(trimmed);
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

  const rawBg = component['background'] as string | undefined;
  const rawButtonColor = component['buttonColor'] as string | undefined;
  const background = getSemanticBackground(rawBg);
  const buttonColor = getSemanticBackground(rawButtonColor);

  const containerStyle: CSSProperties = {
    padding: '16px',
    borderTop: '1px solid var(--freesail-border, #e2e8f0)',
    display: 'flex',
    gap: '8px',
    backgroundColor: background ?? 'var(--freesail-bg-root, #ffffff)'
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
    color: rawBg ? getContrastTextColor(rawBg, 'var(--freesail-text-main, #0f172a)') : 'var(--freesail-text-main, #0f172a)',
  };

  const buttonStyle: CSSProperties = {
    width: '42px',
    height: '42px',
    padding: '10px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: buttonColor ?? 'var(--freesail-primary, #2563eb)',
    color: rawButtonColor ? getContrastTextColor(rawButtonColor, '#ffffff') : 'var(--freesail-primary-text, #ffffff)',
    cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
    opacity: disabled || !text.trim() ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
      <button onClick={handleSend} disabled={disabled || !text.trim()} style={buttonStyle} aria-label="Send message">
        <SendIcon />
      </button>
    </div>
  );
}

// =============================================================================
// ChatTypingIndicator
// =============================================================================

const THINKING_PHRASES = [
  'Thinking...', 'Planning...', 'Creating...', 'Building...',
  'Designing...', 'Working...', 'Crafting...', 'Almost there...',
];

/**
 * Animated typing indicator with rotating contextual phrases.
 */
export function ChatTypingIndicator({ component, scopeData }: FreesailComponentProps) {
  const visible = (component['visible'] as boolean) ?? (scopeData as any)?.visible ?? false;

  const [phraseIndex, setPhraseIndex] = useState(
    () => Math.floor(Math.random() * THINKING_PHRASES.length)
  );

  useEffect(() => {
    if (!visible) {
      setPhraseIndex(Math.floor(Math.random() * THINKING_PHRASES.length));
      return;
    }
    const interval = setInterval(() => {
      setPhraseIndex(prev => (prev + 1) % THINKING_PHRASES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [visible]);

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
      <span>{THINKING_PHRASES[phraseIndex]}</span>
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
// AgentStream
// =============================================================================

/**
 * Streaming token accumulator.
 *
 * The agent writes individual tokens to `/stream/token` via
 * `update_data_model`. This component appends each new token value to an
 * internal buffer and renders the accumulated text as an assistant message
 * bubble. When `active` transitions to `false` the buffer is frozen (the
 * canonical message is committed to `/messages` by the full-state update).
 */
export function AgentStream({ component }: FreesailComponentProps) {
  const active = (component['active'] as boolean) ?? false;
  const token = (component['token'] as string) ?? '';
  const rawBg = component['background'] as string | undefined;
  const rawColor = component['color'] as string | undefined;
  const background = getSemanticBackground(rawBg);
  const color = getSemanticColor(rawColor);

  const bufferRef = useRef('');
  const prevTokenRef = useRef('');
  const [display, setDisplay] = useState('');

  // Append whenever a new token value arrives while active
  useEffect(() => {
    if (!active) {
      // Stream ended — clear buffer for next round
      bufferRef.current = '';
      prevTokenRef.current = '';
      setDisplay('');
      return;
    }

    if (token && token !== prevTokenRef.current) {
      prevTokenRef.current = token;
      bufferRef.current += token;
      setDisplay(bufferRef.current);
    }
  }, [token, active]);

  if (!active && !display) return null;

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  };

  const bubbleStyle: CSSProperties = {
    maxWidth: '85%',
    padding: '10px 14px',
    borderRadius: 'var(--freesail-radius-lg) var(--freesail-radius-lg) var(--freesail-radius-lg) 4px',
    backgroundColor: background ?? 'var(--freesail-bg-muted, #f8fafc)',
    color: rawColor
      ? (color ?? rawColor)
      : rawBg
        ? getContrastTextColor(rawBg, 'var(--freesail-text-main, #0f172a)')
        : 'var(--freesail-text-main, #0f172a)',
    fontSize: '14px',
    lineHeight: '1.5',
    wordBreak: 'break-word',
    boxShadow: 'var(--freesail-shadow-sm)',
  };

  return (
    <div style={containerStyle}>
      <div style={bubbleStyle}>
        <div className="freesail-chat-md">
          <ReactMarkdown>{display}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Component Map Export
// =============================================================================

/**
 * All chat catalog components mapped by name.
 */
export const chatCatalogComponents: Record<string, React.ComponentType<FreesailComponentProps>> = {
  ...includedComponents,
  ChatContainer,
  ChatMessageList,
  ChatMessage,
  ChatInput,
  ChatTypingIndicator,
  AgentStream,
};
