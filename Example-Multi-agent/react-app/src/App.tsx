import React, { useState, useRef, useEffect } from 'react';
import { ReactUI } from 'freesail';
import { StandardCatalog} from '@freesail/catalogs';
import { WeatherCatalog } from '@freesail-community/weathercatalog';

const ALL_CATALOGS: ReactUI.CatalogDefinition[] = [
  WeatherCatalog,
  StandardCatalog
];

// Agent A (Conversation Agent) URL
const AGENT_A_URL = 'http://localhost:5001/chat';

function ChatApp() {
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([
    { role: 'assistant', content: 'Hello! I am your conversational assistant. How can I help you today? If you need a dashboard or visual UI, just ask!' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  // Extract session ID assigned by the Gateway
  const sessionId = ReactUI.useSessionId();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || !sessionId) return; // Wait for sessionId to be ready before sending

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);

    try {
      const response = await fetch(AGENT_A_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMsg,
          session_id: sessionId
        }),
      });

      const data = await response.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Make sure Agent A is running.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#0f172a' }}>
      
      {/* Left Panel: Conversational Chat (HTTP) */}
      <div style={{ 
        width: '400px', 
        borderRight: '1px solid #334155', 
        display: 'flex', 
        flexDirection: 'column',
        backgroundColor: '#1e293b'
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f8fafc' }}>Conversational Agent A</h2>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Session: {sessionId ?? 'Connecting...'}</div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.role === 'user' ? '#3b82f6' : '#334155',
              color: '#f8fafc',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              maxWidth: '85%',
              lineHeight: '1.4'
            }}>
              {msg.content}
            </div>
          ))}
          {isTyping && (
            <div style={{
              alignSelf: 'flex-start',
              backgroundColor: '#334155',
              color: '#94a3b8',
              padding: '12px 16px',
              borderRadius: '16px 16px 16px 4px',
            }}>
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid #334155' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={sessionId ? "Type a message..." : "Connecting to Gateway..."}
              disabled={!sessionId}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #475569',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                outline: 'none',
                opacity: sessionId ? 1 : 0.5
              }}
            />
            <button 
              onClick={handleSend}
              disabled={isTyping || !sessionId}
              style={{
                padding: '0 20px',
                borderRadius: '8px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                cursor: (isTyping || !sessionId) ? 'not-allowed' : 'pointer',
                opacity: (isTyping || !sessionId) ? 0.7 : 1
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel: Freesail UI (SSE) */}
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ paddingBottom: '20px', borderBottom: '1px solid #334155', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, color: '#f8fafc' }}>Freesail UI Panel (Driven by Agent B)</h2>
          <ConnectionStatus />
        </div>
        
        <div style={{ flex: 1 }}>
          <SurfaceList />
        </div>
      </div>
      
    </div>
  );
}

export default function App() {
  return (
    <ReactUI.FreesailThemeProvider theme="dark">
      <ReactUI.FreesailProvider
        sseUrl="http://localhost:3001/sse"
        postUrl="http://localhost:3001/message"
        catalogDefinitions={ALL_CATALOGS}
      >
        <ChatApp />
      </ReactUI.FreesailProvider>
    </ReactUI.FreesailThemeProvider>
  );
}

function ConnectionStatus() {
  const { isConnected } = ReactUI.useConnectionStatus();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '14px' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: isConnected ? '#10b981' : '#ef4444' }} />
      {isConnected ? 'Gateway Connected' : 'Gateway Disconnected'}
    </div>
  );
}

function SurfaceList() {
  const allSurfaces = ReactUI.useSurfaces();
  
  if (allSurfaces.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        No surfaces active. Ask Agent A to render something!
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {allSurfaces.map(surface => (
        <div key={surface.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Surface: {surface.id}</span>
            <span>Catalog: {surface.catalogId.split('/').pop()}</span>
          </div>
          <ReactUI.FreesailSurface surfaceId={surface.id} />
        </div>
      ))}
    </div>
  );
}
