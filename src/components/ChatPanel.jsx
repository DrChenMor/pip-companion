import { useState, useRef, useEffect } from 'react';

export default function ChatPanel({ gemini, palette, isOpen, onClose }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    if (!input.trim() || gemini.isThinking) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    const reply = await gemini.chat(text);
    if (reply) setMessages(prev => [...prev, { role: 'pip', text: reply }]);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', right: 24, bottom: 24, width: 380, maxHeight: 500,
      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)',
      borderRadius: 20, border: '2.5px solid ' + palette.ink,
      boxShadow: '4px 4px 0 ' + palette.ink,
      display: 'flex', flexDirection: 'column', zIndex: 1000,
      fontFamily: '"M PLUS Rounded 1c", system-ui', overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '2px solid ' + palette.ink,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: palette.stickers[0],
      }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: palette.ink }}>chat with pip ♡</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 18, color: palette.ink, fontWeight: 700,
        }}>✕</button>
      </div>

      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: 12, display: 'flex',
        flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 350,
      }}>
        {messages.length === 0 && (
          <div style={{ color: palette.subInk, fontSize: 13, fontWeight: 600, textAlign: 'center', padding: 20 }}>
            ask me anything about your analytics! ✿
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            background: m.role === 'user' ? palette.stickers[1] : '#fff',
            border: '2px solid ' + palette.ink,
            borderRadius: 14, padding: '8px 14px',
            maxWidth: '80%', fontSize: 13, fontWeight: 600,
            color: palette.ink, boxShadow: '2px 2px 0 ' + palette.ink,
          }}>
            {m.text}
          </div>
        ))}
        {gemini.isThinking && (
          <div style={{ alignSelf: 'flex-start', color: palette.subInk, fontSize: 12, fontWeight: 600, padding: '4px 8px' }}>
            pip is thinking...
          </div>
        )}
      </div>

      <div style={{
        padding: 10, borderTop: '2px solid ' + palette.ink,
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="ask pip something..."
          style={{
            flex: 1, border: '2px solid ' + palette.ink, borderRadius: 10,
            padding: '8px 12px', fontSize: 13, fontWeight: 600,
            fontFamily: 'inherit', outline: 'none', background: '#fff',
          }}
        />
        <button onClick={send} style={{
          background: palette.stickers[0], border: '2px solid ' + palette.ink,
          borderRadius: 10, padding: '8px 14px', cursor: 'pointer',
          fontWeight: 800, fontSize: 13, color: palette.ink,
          fontFamily: 'inherit', boxShadow: '2px 2px 0 ' + palette.ink,
        }}>♡</button>
      </div>
    </div>
  );
}
