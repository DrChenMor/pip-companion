import { useState, useEffect, useRef, useCallback } from 'react';

const MEMORY_KEY = 'pip-gemini-memory';

function loadMemory() {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
  } catch { return []; }
}

function saveMemory(entries) {
  const trimmed = entries.slice(-50);
  localStorage.setItem(MEMORY_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function useGemini({ apiKey, data, mood, creatureName, siteName }) {
  const [memory, setMemory] = useState(loadMemory);
  const [chatHistory, setChatHistory] = useState([]);
  const [isThinking, setIsThinking] = useState(false);

  const addMemory = useCallback((entry) => {
    setMemory(prev => saveMemory([...prev, { ...entry, ts: Date.now() }]));
  }, []);

  const generateInsight = useCallback(async () => {
    if (!apiKey || !data) return null;

    const memoryContext = memory.slice(-10).map(m =>
      `[${new Date(m.ts).toLocaleString()}] ${m.type}: ${m.content}`
    ).join('\n');

    const prompt = `You are ${creatureName}, a cute kawaii creature living on a companion bar watching analytics for ${siteName}. You have memory of past observations.

MEMORY LOG:
${memoryContext || '(no memories yet - this is a fresh start!)'}

CURRENT STATS:
- Live visitors: ${data.active}
- Pageviews (24h): ${Math.round(data.pageviews24h)}
- Sessions (24h): ${Math.round(data.sessions24h)}
- Bounce rate: ${Math.round(data.bounceRate * 100)}%
- Avg session: ${Math.round(data.avgSession)}s
- Top page: ${data.topPage}
- Top referrer: ${data.topReferrer}
- Country: ${data.country}
- Current mood: ${mood}

RULES:
- Speak in one short sentence (max 14 words)
- Lowercase, sweet, a little dramatic, gently silly
- You may use ♡ or ✿ sparingly - NEVER use ★ stars, emoji, or hashtags
- NEVER use em-dashes. Use a simple hyphen (-) if needed
- Reference one real number when you can
- If you notice a trend compared to memory, mention it
- Reply with ONLY the one-liner. No quotes, no preamble.`;

    try {
      setIsThinking(true);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 60, temperature: 0.9 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini API: ${res.status}`);
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.split('\n')[0]?.slice(0, 140) || null;

      if (text) {
        addMemory({ type: 'insight', content: text, stats: { active: data.active, bounce: Math.round(data.bounceRate * 100) } });
      }
      return text;
    } catch (err) {
      console.warn('Gemini error:', err);
      return null;
    } finally {
      setIsThinking(false);
    }
  }, [apiKey, data, mood, creatureName, siteName, memory, addMemory]);

  const chat = useCallback(async (userMessage) => {
    if (!apiKey) return null;

    const memoryContext = memory.slice(-10).map(m =>
      `[${new Date(m.ts).toLocaleString()}] ${m.type}: ${m.content}`
    ).join('\n');

    const systemPrompt = `You are ${creatureName}, a cute kawaii analytics companion for ${siteName}. You have access to these stats:
- Live visitors: ${data.active} | 24h views: ${Math.round(data.pageviews24h)} | Bounce: ${Math.round(data.bounceRate * 100)}% | Top page: ${data.topPage}

MEMORY: ${memoryContext || '(empty)'}

Be helpful, cute, and insightful. Keep responses under 3 sentences. Use lowercase, be sweet but informative. You can use ♡ or ✿ sparingly.`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt + '\n\nUser: ' + userMessage }] },
    ];

    try {
      setIsThinking(true);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: { maxOutputTokens: 200, temperature: 0.8 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini API: ${res.status}`);
      const json = await res.json();
      const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'hmm, my brain is fuzzy right now ♡';

      setChatHistory(prev => [...prev.slice(-20), { role: 'user', text: userMessage }, { role: 'pip', text: reply }]);
      addMemory({ type: 'chat', content: `Q: ${userMessage} A: ${reply}` });

      return reply;
    } catch {
      return 'oops, something went wrong... try again? ♡';
    } finally {
      setIsThinking(false);
    }
  }, [apiKey, data, mood, creatureName, siteName, memory, addMemory]);

  useEffect(() => {
    if (data) {
      const interval = setInterval(() => {
        addMemory({
          type: 'snapshot',
          content: `active:${data.active} bounce:${Math.round(data.bounceRate*100)}% top:${data.topPage}`,
        });
      }, 300000);
      return () => clearInterval(interval);
    }
  }, [data, addMemory]);

  return { generateInsight, chat, chatHistory, isThinking, memory, clearMemory: () => { localStorage.removeItem(MEMORY_KEY); setMemory([]); } };
}
