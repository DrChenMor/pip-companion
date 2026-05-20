import { useState, useEffect, useMemo } from 'react';
import KawaiiCreature from './components/KawaiiCreature';
import { BackgroundDoodles, SpeechBubble, TypewriterText, StatsCell } from './components/BarComponents';
import ChatPanel from './components/ChatPanel';
import SettingsPanel from './components/SettingsPanel';
import { useMockAnalytics, useGoogleAnalytics, useServerAnalytics, moodFromAnalytics } from './hooks/useAnalytics';
import { useGemini } from './hooks/useGemini';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { useInsightMessage } from './hooks/useInsightMessage';
import { PALETTES } from './utils/constants';

const CONFIG_KEY = 'pip-companion-config';

function loadConfig() {
  try {
    const saved = { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
    const params = new URLSearchParams(window.location.search);
    let dirty = false;
    for (const [key, val] of params.entries()) {
      if (key in DEFAULT_CONFIG && val) { saved[key] = val; dirty = true; }
    }
    if (dirty) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(saved));
      window.history.replaceState({}, '', window.location.pathname);
    }
    return saved;
  } catch { return DEFAULT_CONFIG; }
}

const DEFAULT_CONFIG = {
  siteName: import.meta.env.VITE_SITE_NAME || 'train2aus.com',
  creatureName: import.meta.env.VITE_CREATURE_NAME || 'Pip',
  faceShape: 'blob',
  palette: 'peach',
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || '',
  gaPropertyId: import.meta.env.VITE_GA_PROPERTY_ID || '',
  gaClientId: import.meta.env.VITE_GA_CLIENT_ID || '',
  trafficMultiplier: 1,
};

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    w: window.visualViewport?.width || window.innerWidth,
    h: window.visualViewport?.height || window.innerHeight,
  }));
  useEffect(() => {
    const update = () => setSize({
      w: window.visualViewport?.width || window.innerWidth,
      h: window.visualViewport?.height || window.innerHeight,
    });
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  return size;
}

const BAR_MODE_THRESHOLD = 250;

export default function App() {
  const [config, setConfigState] = useState(loadConfig);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const spike = 0;
  const { w: vpWidth, h: vpHeight } = useViewportSize();
  const minDim = Math.min(vpWidth, vpHeight);
  const [forceBar] = useState(() => new URLSearchParams(window.location.search).has('bar'));
  const barMode = forceBar || minDim < BAR_MODE_THRESHOLD;
  const barVertical = barMode && vpWidth < vpHeight;
  const barDim = barMode ? (barVertical ? vpWidth : vpHeight) : minDim;

  const setConfig = (next) => {
    setConfigState(next);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  };

  const googleAuth = useGoogleAuth(config.gaClientId);
  const mockData = useMockAnalytics({ multiplier: config.trafficMultiplier, spike });
  const { data: serverData, error: serverError } = useServerAnalytics();
  const { gaData, error: gaError } = useGoogleAnalytics({
    propertyId: config.gaPropertyId,
    accessToken: googleAuth.accessToken,
  });

  const data = serverData || ((config.gaPropertyId && googleAuth.isSignedIn && gaData) ? gaData : mockData);
  const mood = moodFromAnalytics(data);
  const palette = PALETTES[config.palette] || PALETTES.peach;

  const gemini = useGemini({
    apiKey: config.geminiApiKey,
    data,
    mood,
    creatureName: config.creatureName,
    siteName: config.siteName,
  });

  const message = useInsightMessage({
    data,
    mood,
    gemini: config.geminiApiKey ? gemini : null,
  });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setChatOpen(false); setSettingsOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!barMode) return;
    const goFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    document.addEventListener('click', goFullscreen, { once: true });
    return () => document.removeEventListener('click', goFullscreen);
  }, [barMode]);

  return (
    <div style={{
      width: '100vw', height: '100dvh', background: palette.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif',
      fontWeight: 700, color: palette.ink, overflow: 'hidden',
      position: 'relative',
    }}>
      <BackgroundDoodles palette={palette} mood={mood} />

      {/* Mobile header: Pip centered + speech bubble below */}
      {!barMode && vpWidth < 500 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 16px 6px', position: 'relative', zIndex: 2 }}>
          <KawaiiCreature mood={mood} size={140} shape={config.faceShape} />
          <div style={{ width: '100%', marginTop: 10 }}>
            <SpeechBubble palette={palette} barDim={0} mobile>
              <TypewriterText text={message} />
            </SpeechBubble>
          </div>
          <button onClick={() => setSettingsOpen(o => !o)} style={{
            position: 'absolute', top: 10, right: 12, background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 18, color: palette.subInk, opacity: 0.6,
          }}>✿</button>
          <button onClick={() => setChatOpen(o => !o)} style={{
            position: 'absolute', top: 8, left: 12, background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 22, color: palette.subInk, opacity: 0.7, lineHeight: 1,
          }}>💬</button>
        </div>
      )}

      {/* Desktop/bar header */}
      {(barMode || vpWidth >= 500) && <div style={{
        height: barMode ? '100%' : 108,
        minHeight: barMode ? 0 : 108,
        width: '100%',
        display: barVertical ? 'flex' : (barMode ? 'flex' : 'grid'),
        ...(barVertical
          ? { flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 4px', gap: 8 }
          : barMode
            ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', gap: 12 }
            : { gridTemplateColumns: '130px 1fr auto', alignItems: 'center', padding: '0 22px 0 18px', gap: 26 }
        ),
        position: 'relative', zIndex: 2,
        overflowY: barVertical ? 'auto' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: barVertical ? '100%' : barMode ? 'auto' : 130, height: barVertical ? 'auto' : '100%', padding: barMode ? '4px 0' : 0 }}>
          <KawaiiCreature mood={mood} size={barMode ? (barVertical ? Math.max(barDim * 0.7, 40) : Math.max(barDim * 0.85, 40)) : 104} shape={config.faceShape} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', width: barVertical ? '100%' : undefined, flex: barMode && !barVertical ? '1 1 0' : undefined, height: barVertical ? 'auto' : '100%', minWidth: 0 }}>
          <SpeechBubble palette={palette} barDim={barMode ? barDim : 0}>
            <TypewriterText text={message} />
          </SpeechBubble>
        </div>
        {!barVertical && <div style={{ flex: barMode ? '1 0 auto' : undefined, display: 'flex', justifyContent: 'center' }}><StatsCell data={data} palette={palette} mood={mood} barDim={barMode ? barDim : 0} /></div>}
        {barMode && !barVertical && <MoodBadge mood={mood} palette={palette} barDim={barDim} />}
        {barMode && (
          <button onClick={() => setSettingsOpen(o => !o)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: Math.max(14, barDim * 0.3), color: palette.subInk,
            padding: barVertical ? '4px' : '0 4px', lineHeight: 1, opacity: 0.5,
          }}>✿</button>
        )}
      </div>}

      {!barMode && <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: vpWidth < 500 ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: vpWidth < 500 ? 10 : 16, padding: vpWidth < 500 ? '10px 12px 16px' : '16px 22px 60px', overflowY: 'auto',
        position: 'relative', zIndex: 2,
      }}>
        <DashCard palette={palette} title="live activity" color={palette.stickers[0]}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{data.active}</div>
            <div style={{ fontSize: 13, color: palette.subInk, marginTop: 4 }}>visitors right now</div>
          </div>
          <MiniTrend values={data.trend} palette={palette} />
        </DashCard>

        <DashCard palette={palette} title="24h overview" color={palette.stickers[1]}>
          <MetricRow label="pageviews" value={Math.round(data.pageviews24h).toLocaleString()} />
          <MetricRow label="sessions" value={Math.round(data.sessions24h).toLocaleString()} />
          <MetricRow label="bounce rate" value={Math.round(data.bounceRate * 100) + '%'} warn={data.bounceRate > 0.6} />
          <MetricRow label="avg session" value={Math.floor(data.avgSession / 60) + 'm ' + Math.round(data.avgSession % 60) + 's'} />
        </DashCard>

        <DashCard palette={palette} title="top content" color={palette.stickers[2]}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{data.topPage}</div>
          <div style={{ fontSize: 12, color: palette.subInk }}>via {data.topReferrer}</div>
          <div style={{ fontSize: 12, color: palette.subInk, marginTop: 2 }}>visitors from {data.country} ♡</div>
        </DashCard>

        <DashCard palette={palette} title="pip's mood" color={palette.stickers[3]}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{mood}</div>
            <div style={{ fontSize: 12, color: palette.subInk, marginTop: 4 }}>
              {mood === 'sleeping' && 'zzz... too quiet right now'}
              {mood === 'drowsy' && 'barely awake... low traffic hours'}
              {mood === 'bored' && 'not many visitors today...'}
              {mood === 'content' && 'things are looking steady ♡'}
              {mood === 'focused' && 'deep readers, long sessions ♡'}
              {mood === 'curious' && 'interesting traffic patterns...'}
              {mood === 'happy' && 'yay! good traffic today!'}
              {mood === 'excited' && 'woah!! so many visitors!!'}
              {mood === 'surprised' && 'sudden traffic spike!!'}
              {mood === 'overwhelmed' && 'too many at once!!'}
              {mood === 'dizzy' && 'spinning from all this traffic...'}
              {mood === 'anxious' && 'bounce rate is concerning...'}
              {mood === 'proud' && 'numbers looking great ♡'}
              {mood === 'fancy' && 'premium engaged traffic ✿'}
              {mood === 'smitten' && 'we got a conversion!! ♡'}
            </div>
          </div>
          {config.geminiApiKey && (
            <div style={{ fontSize: 10, color: palette.subInk, marginTop: 8, textAlign: 'center' }}>
              ✿ gemini-powered insights active
            </div>
          )}
        </DashCard>

        <DashCard palette={palette} title="recent events" color={palette.stickers[4]}>
          <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 12 }}>
            {data.events.slice(-8).reverse().map((e, i) => (
              <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid ' + palette.bg, color: palette.ink }}>
                {e.kind === 'conversion' && '♡ conversion!'}
                {e.kind === 'spike' && '✿ traffic spike!'}
                {e.kind === 'visit' && `→ ${e.page} from ${e.country}`}
              </div>
            ))}
            {data.events.length === 0 && <div style={{ color: palette.subInk }}>waiting for events...</div>}
          </div>
        </DashCard>

        {gemini.memory.length > 0 && (
          <DashCard palette={palette} title="pip's memory" color={palette.stickers[0]}>
            <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 11 }}>
              {gemini.memory.slice(-6).reverse().map((m, i) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid ' + palette.bg, color: palette.subInk }}>
                  <span style={{ fontSize: 9, color: '#999' }}>{new Date(m.ts).toLocaleTimeString()}</span>{' '}
                  {m.content.slice(0, 80)}
                </div>
              ))}
            </div>
            <button onClick={gemini.clearMemory} style={{
              marginTop: 8, fontSize: 10, background: 'none', border: '1.5px solid ' + palette.ink,
              borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: 700, color: palette.ink,
            }}>clear memory</button>
          </DashCard>
        )}
      </div>}

      {!barMode && vpWidth >= 500 && <div style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, zIndex: 999,
      }}>
        <PillButton palette={palette} onClick={() => setChatOpen(o => !o)} active={chatOpen}>
          💬 chat with pip
        </PillButton>
        <PillButton palette={palette} onClick={() => setSettingsOpen(o => !o)} active={settingsOpen}>
          ✿ settings
        </PillButton>
      </div>}

      {!barMode && <ChatPanel gemini={gemini} palette={palette} isOpen={chatOpen} onClose={() => setChatOpen(false)} isMobile={vpWidth < 500} />}
      {settingsOpen && <SettingsPanel config={config} setConfig={setConfig} palette={palette} onClose={() => setSettingsOpen(false)} fullscreen={barMode} />}
    </div>
  );
}

function DashCard({ children, palette, title, color }) {
  return (
    <div style={{
      background: '#fff', border: '2.5px solid ' + palette.ink,
      borderRadius: 18, padding: 16, boxShadow: '3px 3px 0 ' + palette.ink,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase',
        color: palette.ink, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {title}
      </div>
      {children}
    </div>
  );
}

function MetricRow({ label, value, warn }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: warn ? '#E83A6E' : 'inherit' }}>{value}</span>
    </div>
  );
}

function MiniTrend({ values, palette }) {
  const W = 240, H = 60;
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values, min + 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - ((v - min) / (max - min)) * (H - 8) - 4]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 8 }}>
      <path d={d + ` L ${W},${H} L 0,${H} Z`} fill={palette.stickers[1]} fillOpacity="0.3" />
      <path d={d} stroke={palette.ink} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function MoodBadge({ mood, palette, barDim }) {
  const s = Math.max(barDim / 108, 0.5);
  const moodEmoji = {
    sleeping: 'zzz', drowsy: '~.~', bored: '...', content: '♡', focused: '◎',
    curious: '?!', happy: '♡♡', excited: '!!', surprised: '?!', overwhelmed: '!!!',
    dizzy: '@@', anxious: '...', proud: '★', fancy: '✿', smitten: '♡♡♡',
  };
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: `${4*s}px ${14*s}px`, background: palette.stickers[3],
      border: `${2.2*s}px solid ${palette.ink}`, borderRadius: 14*s,
      boxShadow: `${2.5*s}px ${2.5*s}px 0 ${palette.ink}`,
    }}>
      <span style={{ fontSize: 20*s, fontWeight: 900, lineHeight: 1, color: palette.ink }}>{mood}</span>
      <span style={{ fontSize: 10*s, color: palette.subInk, fontWeight: 700, marginTop: 2*s }}>{moodEmoji[mood] || '♡'}</span>
    </div>
  );
}

function PillButton({ children, palette, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 18px', borderRadius: 999,
      border: '2.5px solid ' + palette.ink,
      background: active ? palette.stickers[0] : '#fff',
      boxShadow: '2px 2px 0 ' + palette.ink,
      fontFamily: '"M PLUS Rounded 1c", system-ui',
      fontWeight: 800, fontSize: 13, color: palette.ink,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>{children}</button>
  );
}
