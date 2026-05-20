import { useState, useRef, useEffect } from 'react';

const STARTERS = [
  'which post is performing best?',
  'where is my traffic coming from?',
  'what should I write about next?',
  'how can I reduce bounce rate?',
];

// Detect if text contains Hebrew characters
function isHebrew(text) {
  return /[֐-׿]/.test(text);
}

function getDir(text) {
  return isHebrew(text) ? 'rtl' : 'ltr';
}

export default function ChatPanel({ gemini, palette, isOpen, onClose, isMobile }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || gemini.isThinking) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    const reply = await gemini.chat(msg);
    if (reply) setMessages(prev => [...prev, { role: 'pip', text: reply }]);
  };

  if (!isOpen) return null;

  const panelStyle = isMobile ? {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: '#fff',
    display: 'flex', flexDirection: 'column',
    fontFamily: '"M PLUS Rounded 1c", system-ui',
  } : {
    position: 'fixed', right: 24, bottom: 24, width: 380, maxHeight: 500,
    background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)',
    borderRadius: 20, border: '2.5px solid ' + palette.ink,
    boxShadow: '4px 4px 0 ' + palette.ink,
    display: 'flex', flexDirection: 'column', zIndex: 1000,
    fontFamily: '"M PLUS Rounded 1c", system-ui', overflow: 'hidden',
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '2px solid ' + palette.ink,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: palette.stickers[0], flexShrink: 0,
      }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: palette.ink }}>chat with pip ♡</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 18, color: palette.ink, fontWeight: 700,
        }}>✕</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: 12, display: 'flex',
        flexDirection: 'column', gap: 8, minHeight: isMobile ? 0 : 200,
      }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0' }}>
            <div style={{ color: palette.subInk, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
              ask me anything about your blog's analytics ✿
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {STARTERS.map((q, i) => (
                <button key={i} onClick={() => send(q)} style={{
                  padding: '6px 12px', borderRadius: 12,
                  border: '1.5px solid ' + palette.ink, background: palette.stickers[i % palette.stickers.length],
                  cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  fontFamily: 'inherit', color: palette.ink,
                  opacity: gemini.isThinking ? 0.5 : 1,
                }}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const dir = getDir(m.text);
          return (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? palette.stickers[1] : '#fff',
              border: '2px solid ' + palette.ink,
              borderRadius: 14, padding: '8px 14px',
              maxWidth: '85%', fontSize: 13, fontWeight: 600,
              color: palette.ink, boxShadow: '2px 2px 0 ' + palette.ink,
              direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left',
              lineHeight: 1.5, whiteSpace: 'pre-wrap',
            }}>
              {m.text}
            </div>
          );
        })}
        {gemini.isThinking && (
          <div style={{ alignSelf: 'flex-start', color: palette.subInk, fontSize: 12, fontWeight: 600, padding: '4px 8px' }}>
            pip is thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: 10, borderTop: '2px solid ' + palette.ink,
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="ask pip something..."
          dir="auto"
          style={{
            flex: 1, border: '2px solid ' + palette.ink, borderRadius: 10,
            padding: '8px 12px', fontSize: 13, fontWeight: 600,
            fontFamily: 'inherit', outline: 'none', background: '#fff',
          }}
        />
        <button onClick={() => send()} style={{
          background: palette.stickers[0], border: '2px solid ' + palette.ink,
          borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
          fontWeight: 800, fontSize: 13, color: palette.ink,
          fontFamily: 'inherit', boxShadow: '2px 2px 0 ' + palette.ink,
        }}>♡</button>
      </div>
    </div>
  );
}
