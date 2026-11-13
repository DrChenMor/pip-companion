import { useState, useEffect, useMemo } from 'react';
import ShimonBuddy from './components/ShimonBuddy';
import { BackgroundDoodles, SpeechBubble, TypewriterText, StatsCell } from './components/BarComponents';
import ChatPanel from './components/ChatPanel';
import SettingsPanel from './components/SettingsPanel';
import ShimonStage from './components/ShimonStage';
import { buildStations } from './utils/shimonStations';
import { useBarStats } from './hooks/useBarStats';
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
  creatureName: 'Shimon',
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
  const { data: serverData, error: serverError } = useServerAnalytics();
  const mockData = useMockAnalytics({ multiplier: config.trafficMultiplier, spike, enabled: !serverData });
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
    creatureName: 'Shimon',   // the companion is bogan Shimon now (ignores an old saved name)
    siteName: config.siteName,
  });

  // Bogan Shimon: walks the horizontal bar (?bar) and lives in the mobile/desktop views
  const shimonBar = barMode && !barVertical;
  const barStats = useBarStats();
  // the same stat cards he presents on the bar, for the dashboard (live is already its own card)
  const statCards = useMemo(
    () => (barStats ? buildStations(data, barStats, null).filter(s => s.id !== 'live') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [barStats],
  );

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
      {!shimonBar && <BackgroundDoodles palette={palette} mood={mood} />}

      {shimonBar && (
        <ShimonStage data={data} stats={barStats} insight={config.geminiApiKey ? message : null}
          palette={palette} onSettings={() => setSettingsOpen(o => !o)} />
      )}

      {/* Mobile header: Shimon hanging about + speech bubble below */}
      {!barMode && vpWidth < 500 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 16px 6px', position: 'relative', zIndex: 2 }}>
          <ShimonBuddy mood={mood} message={message} stand={118} wander />
          <div style={{ width: '100%', marginTop: 4 }}>
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
      {!shimonBar && (barMode || vpWidth >= 500) && <div style={{
        height: barMode ? '100%' : 'auto',
        minHeight: barMode ? 0 : 124,
        width: '100%',
        display: barVertical ? 'flex' : (barMode ? 'flex' : 'grid'),
        ...(barVertical
          ? { flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 4px', gap: 8 }
          : barMode
            ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', gap: 12 }
            : { gridTemplateColumns: '200px 1fr auto', alignItems: 'end', padding: '10px 22px 6px 8px', gap: 20 }
        ),
        position: 'relative', zIndex: 2,
        overflowY: barVertical ? 'auto' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', width: barVertical ? '100%' : 200, height: barVertical ? 'auto' : '100%' }}>
          <ShimonBuddy mood={mood} message={message} stand={barVertical ? Math.max(barDim * 0.55, 40) : 84} wander={!barVertical} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center', width: barVertical ? '100%' : undefined, flex: barMode && !barVertical ? '1 1 0' : undefined, height: barVertical ? 'auto' : '100%', minWidth: 0 }}>
          <SpeechBubble palette={palette} barDim={barMode ? barDim : 0} clamp={barMode}>
            <TypewriterText text={message} />
          </SpeechBubble>
        </div>
        {!barVertical && <div style={{ flex: barMode ? '1 0 auto' : undefined, display: 'flex', justifyContent: 'center', alignSelf: 'center' }}><StatsCell data={data} palette={palette} mood={mood} barDim={barMode ? barDim : 0} /></div>}
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
          <div style={{ fontSize: 12, color: palette.subInk, marginTop: 2 }}>visitors from {data.country}</div>
        </DashCard>

        {statCards.map((st, i) => (
          <DashCard key={st.id} palette={palette} title={st.kicker} color={palette.stickers[(i + 1) % palette.stickers.length]} rtl>
            <StationBody station={st} palette={palette} />
          </DashCard>
        ))}

        <DashCard palette={palette} title="shimon's mood" color={palette.stickers[3]}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{mood}</div>
            <div style={{ fontSize: 12, color: palette.subInk, marginTop: 4 }}>
              {MOOD_LINES[mood] || "she'll be right, mate"}
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
                {e.kind === 'conversion' && 'conversion! stoked'}
                {e.kind === 'spike' && '✿ traffic spike!'}
                {e.kind === 'visit' && `→ ${e.page} from ${e.country}`}
              </div>
            ))}
            {data.events.length === 0 && <div style={{ color: palette.subInk }}>waiting for events...</div>}
          </div>
        </DashCard>

        {gemini.memory.length > 0 && (
          <DashCard palette={palette} title="shimon's memory" color={palette.stickers[0]}>
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
          💬 chat with shimon
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

// what Shimon reckons about each mood (dashboard card)
const MOOD_LINES = {
  sleeping: 'zzz... bloody quiet out there, mate',
  drowsy: 'half asleep. slow arvo.',
  bored: "what are you lookin' at? no one's here.",
  content: "she'll be right. steady as she goes.",
  focused: "they're actually reading it. fair dinkum.",
  curious: "oi, who's this then?",
  happy: 'decent crowd. not bad, mate.',
  excited: 'heaps of people in! stoked!',
  surprised: "strewth, where'd they all come from?",
  overwhelmed: 'too many at once! #@$%!',
  dizzy: "mate, the room's spinning",
  anxious: 'they bail too quick. #@$%!',
  proud: 'bloody oath, look at that',
  fancy: 'classy crowd in today',
  smitten: 'someone converted! stoked!',
};

// one of Shimon's bar stations, as a dashboard card (Hebrew, right to left)
function StationBody({ station: s, palette }) {
  let big;
  if (s.kind === 'chart') big = <MiniTrend values={[...s.big]} palette={palette} />;
  else if (s.kind === 'text') big = <div dir="auto" style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.25 }}>{s.big}</div>;
  else big = <div style={{ fontSize: s.kind === 'flags' ? 40 : 52, fontWeight: 900, lineHeight: 1, direction: 'ltr', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: '"M PLUS Rounded 1c", system-ui' }}>{s.big}</div>;
  return (
    <>
      {big}
      {s.sub && <div style={{ fontSize: 13, color: palette.subInk }}>{s.sub}</div>}
      <div dir="auto" style={{ fontSize: 13, color: palette.ink, background: palette.bg, borderRadius: 10, padding: '6px 10px', marginTop: 2 }}>
        <span style={{ fontWeight: 800 }}>שמעון: </span>{s.line}
      </div>
    </>
  );
}

function DashCard({ children, palette, title, color, rtl }) {
  return (
    <div dir={rtl ? 'rtl' : undefined} style={{
      fontFamily: rtl ? '"Varela Round", "M PLUS Rounded 1c", system-ui' : undefined,
      textAlign: rtl ? 'right' : undefined,
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
