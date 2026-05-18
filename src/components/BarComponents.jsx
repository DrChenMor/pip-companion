import { useState, useEffect, useRef } from 'react';
import { fmt, fmtTime, bounceFlair, countryFlair } from '../utils/format';

export function BackgroundDoodles({ palette, mood }) {
  const items = useRef(null);
  if (!items.current) {
    items.current = Array.from({ length: 14 }, (_, i) => ({
      x: 6 + Math.random() * 94, y: 5 + Math.random() * 90,
      size: 6 + Math.random() * 14, rot: Math.random() * 360,
      kind: ['heart', 'star', 'dot', 'sakura'][Math.floor(Math.random() * 4)],
      color: palette.stickers[i % palette.stickers.length],
      phase: Math.random() * Math.PI * 2,
    }));
  }
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5 }}>
      {items.current.map((it, i) => <Doodle key={i} item={it} palette={palette} />)}
    </div>
  );
}

function Doodle({ item, palette }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, last = performance.now();
    const tick = (n) => { setT((n - last) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const float = Math.sin(t * 0.8 + item.phase) * 3;
  const style = { position: 'absolute', left: item.x + '%', top: `calc(${item.y}% + ${float}px)`, width: item.size, height: item.size, transform: `rotate(${item.rot}deg)`, color: item.color };
  if (item.kind === 'heart') return <svg viewBox="0 0 20 20" style={style}><path d="M10 17 L3 9 a4 4 0 0 1 7-3 a4 4 0 0 1 7 3 Z" fill="currentColor" /></svg>;
  if (item.kind === 'star') return <svg viewBox="-10 -10 20 20" style={style}><path d="M0 -10 Q0 0 10 0 Q0 0 0 10 Q0 0 -10 0 Q0 0 0 -10 Z" fill="currentColor" /></svg>;
  if (item.kind === 'sakura') return (
    <svg viewBox="-10 -10 20 20" style={style}>
      {[0,1,2,3,4].map(i => <ellipse key={i} cx="0" cy="-5" rx="3" ry="5" fill="currentColor" transform={`rotate(${i * 72})`} />)}
      <circle r="1.6" fill={palette.bg} />
    </svg>
  );
  return <div style={{ ...style, borderRadius: '50%', background: 'currentColor' }} />;
}

export function SpeechBubble({ children, palette }) {
  const border = '2.5px solid ' + palette.ink;
  return (
    <div style={{
      position: 'relative', background: '#FFFFFF', border, borderRadius: 18,
      padding: '10px 22px', fontSize: 19, lineHeight: 1.2, letterSpacing: 0.1,
      fontWeight: 700, color: palette.ink, width: '100%', maxHeight: 80,
      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical', boxShadow: '3px 3px 0 ' + palette.ink,
    }}>
      <div style={{
        position: 'absolute', left: -10, top: '55%', transform: 'translateY(-50%) rotate(45deg)',
        width: 16, height: 16, background: '#FFFFFF', borderLeft: border, borderBottom: border,
      }} />
      {children}
    </div>
  );
}

export function TypewriterText({ text }) {
  const [shown, setShown] = useState('');
  const targetRef = useRef(text);
  useEffect(() => {
    targetRef.current = text;
    let i = 0; setShown('');
    const id = setInterval(() => {
      if (targetRef.current !== text) { clearInterval(id); return; }
      i += 1; setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  return <span>{shown}<Caret /></span>;
}

function Caret() {
  const [on, setOn] = useState(true);
  useEffect(() => { const id = setInterval(() => setOn(o => !o), 520); return () => clearInterval(id); }, []);
  return <span style={{ opacity: on ? 0.5 : 0, marginLeft: 2 }}>▍</span>;
}

export function LiveBadge({ value, palette }) {
  const [pulse, setPulse] = useState(false);
  useEffect(() => { const id = setInterval(() => setPulse(p => !p), 1000); return () => clearInterval(id); }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '4px 14px 6px', background: palette.stickers[0], border: '2.2px solid ' + palette.ink, borderRadius: 14, boxShadow: '2.5px 2.5px 0 ' + palette.ink, minWidth: 92 }}>
      <span style={{ fontSize: 10, letterSpacing: 1.5, display: 'flex', alignItems: 'center', gap: 5, color: palette.ink, fontWeight: 800 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E83A6E', boxShadow: pulse ? '0 0 0 3px rgba(232,58,110,0.3)' : 'none', transition: 'box-shadow 0.4s' }} />
        LIVE ♡ NOW
      </span>
      <span style={{ fontSize: 38, fontWeight: 900, lineHeight: 0.95, marginTop: 2, fontVariantNumeric: 'tabular-nums', color: palette.ink }}>{value}</span>
    </div>
  );
}

export function StatCard({ label, value, color, palette, suffix }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '4px 12px 6px', background: color, border: '2.2px solid ' + palette.ink, borderRadius: 14, boxShadow: '2.5px 2.5px 0 ' + palette.ink, minWidth: 78 }}>
      <span style={{ fontSize: 9.5, letterSpacing: 1.2, color: palette.ink, fontWeight: 800, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, marginTop: 3, fontVariantNumeric: 'tabular-nums', color: palette.ink }}>
        {value}{suffix && <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 700 }}>{suffix}</span>}
      </span>
    </div>
  );
}

export function TopPageCard({ data, palette }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '4px 14px 6px', background: '#FFFFFF', border: '2.2px solid ' + palette.ink, borderRadius: 14, boxShadow: '2.5px 2.5px 0 ' + palette.ink, minWidth: 200, maxWidth: 240 }}>
      <span style={{ fontSize: 9.5, letterSpacing: 1.2, color: palette.ink, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ background: '#FF4D6D', color: '#fff', padding: '1px 6px', borderRadius: 6, fontSize: 9, fontWeight: 900 }}>HOT</span> TOP · NOW
      </span>
      <span style={{ fontSize: 17, fontWeight: 800, marginTop: 2, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{data.topPage}</span>
      <span style={{ fontSize: 10, color: palette.subInk, marginTop: 1, fontWeight: 600 }}>via {data.topReferrer} · {countryFlair(data.country)}</span>
    </div>
  );
}

export function Sparkline({ values, palette }) {
  const W = 110, H = 56;
  if (!values || values.length < 2) return <div style={{ width: W, height: H }} />;
  const min = Math.min(...values), max = Math.max(...values, min + 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * (H - 8) - 4;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = d + ` L ${W},${H} L 0,${H} Z`;
  const color = palette.stickers[1];
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <defs><linearGradient id="kspark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.7" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#kspark)" />
      <path d={d} stroke={palette.ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3.5" fill={palette.ink} />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="1.5" fill="#fff" />
    </svg>
  );
}

export function Divider({ palette, kind = 'star' }) {
  const c = palette.stickers[2];
  if (kind === 'star') return <svg viewBox="-10 -10 20 20" width="14" height="14"><path d="M0 -10 Q0 0 10 0 Q0 0 0 10 Q0 0 -10 0 Q0 0 0 -10 Z" fill={c} /></svg>;
  if (kind === 'heart') return <svg viewBox="0 0 20 20" width="14" height="14"><path d="M10 17 L3 9 a4 4 0 0 1 7-3 a4 4 0 0 1 7 3 Z" fill={c} /></svg>;
  return <span style={{ fontSize: 16, color: palette.subInk }}>·</span>;
}

export function StatsCell({ data, palette, mood }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
      <LiveBadge value={data.active} palette={palette} mood={mood} />
      <Divider palette={palette} kind="heart" />
      <Sparkline values={data.trend} palette={palette} />
      <Divider palette={palette} kind="dot" />
      <StatCard label="24h views" value={fmt(data.pageviews24h)} color={palette.stickers[1]} palette={palette} />
      <StatCard label="bounce" value={Math.round(data.bounceRate * 100) + '%'} color={palette.stickers[2]} palette={palette} suffix={bounceFlair(data.bounceRate)} />
      <StatCard label="avg time" value={fmtTime(data.avgSession)} color={palette.stickers[3]} palette={palette} />
      <TopPageCard data={data} palette={palette} />
    </div>
  );
}
