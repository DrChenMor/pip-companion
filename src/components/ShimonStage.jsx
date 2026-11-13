import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildStations } from '../utils/shimonStations';
import { ShimonActor, loadShimon, loadLook, pickLook, mouthFor, isNight, actorStyle } from '../utils/shimonActor';

// Bogan Shimon on the companion bar: he hop-walks along the strip from card to
// card, takes a drag, tells you the number (lip-synced), pulls a face about it,
// and the card flips to a new stat after he leaves. Each time he hops off the
// end he comes back in another look, and each look has its own mood.
//
// Drawing is sprite sheets rendered from the approved poser drawings
// (tools/shimon-sprites). One element, background-position per frame, no React
// re-render per frame - light enough for the bar's Android board.


function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize(s => (Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}


export default function ShimonStage({ data, stats, insight, palette, onSettings }) {
  const rootRef = useRef(null);
  const actorRef = useRef(null);
  const { w: W, h: H } = useSize(rootRef);

  const stations = useMemo(
    () => buildStations(data, stats, insight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.active, data.country, stats, insight],
  );
  const stationsRef = useRef(stations);

  // ---- layout: cards across the strip, a gap left of each card for Shimon
  const reserve = Math.max(H * 1.3, 130);
  const stageW = Math.max(0, W - reserve);
  const cardW = Math.min(440, Math.max(230, H * 2.15));
  const n = H ? Math.max(1, Math.floor(stageW / (cardW + H * 1.0))) : 0;
  const gap = n ? (stageW - n * cardW) / n : 0;
  const cardH = H * 0.84;
  const cards = Array.from({ length: n }, (_, i) => ({ left: gap + i * (cardW + gap), stand: gap / 2 + i * (cardW + gap) }));
  const geo = useRef({});

  // ---- which station each card shows; rotates as Shimon passes
  const [slotIds, setSlotIds] = useState([]);
  const slotIdsRef = useRef(slotIds);
  // the tour (a long-running async loop) reads the latest layout and stations through refs
  useLayoutEffect(() => {
    stationsRef.current = stations;
    slotIdsRef.current = slotIds;
    geo.current = { W, H, n, cards };
  });
  const queue = useRef(0);
  const pickNext = (ids, taken) => {
    for (let k = 0; k < ids.length; k++) {
      const id = ids[queue.current++ % ids.length];
      if (!taken.includes(id)) return id;
    }
    return ids[0];
  };
  useEffect(() => {
    const ids = stations.map(s => s.id);
    setSlotIds(prev => {
      const next = [];
      for (let i = 0; i < n; i++) {
        let id = prev[i];
        if (!id || !ids.includes(id) || next.includes(id)) id = pickNext(ids, next);
        next.push(id);
      }
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [n, stations]);
  const rotateSlot = (i) => setSlotIds(prev => {
    const ids = stationsRef.current.map(s => s.id);
    const copy = [...prev];
    copy[i] = pickNext(ids, prev.filter((_, j) => j !== i));
    return copy;
  });

  const [active, setActive] = useState(-1);
  const [speech, setSpeech] = useState({ slot: -1, text: '' });
  const [mood, setMood] = useState(null);

  // ---- the actor and his tour
  useEffect(() => {
    let cancelled = false;
    let actor = null;
    const timers = new Set();
    const sleep = (ms) => new Promise(r => { const id = setTimeout(() => { timers.delete(id); r(); }, ms); timers.add(id); });
    const metrics = () => ({ stand: (geo.current.H || 0) * 0.8, ground: (geo.current.H || 0) * 0.965 });

    const talk = async (slot, station) => {
      setActive(slot);
      const md = actor.mood();
      actor.strike('puff');                               // a drag first
      await sleep(750);
      if (cancelled) return;
      const line = station.line;
      let prev = 0;
      for (let i = 1; i <= line.length && !cancelled; i++) {
        setSpeech({ slot, text: line.slice(0, i) });
        const ch = line[i - 1];
        prev = mouthFor(ch, prev);
        actor.talking(prev);
        await sleep(ch === '.' || ch === '!' || ch === '?' ? 220 : md.type);
      }
      actor.talking(0);
      await sleep(350);
      if (cancelled) return;
      actor.strike(station.pose || 'puff');
      await sleep(actor.pose === 'swear' ? md.hold + 300 : md.hold);
      actor.idle();
      await sleep(2200);
    };

    const tour = async () => {
      let next = pickLook(actor.man);
      while (!cancelled) {
        const k = actor.scale();
        setMood(actor.mood());
        loadLook(actor.man, next);                        // the next outfit loads while he does this lap
        actor.x = -actor.man.cell.w * k * 0.5; actor.face = 1;
        for (let i = 0; !cancelled && i < geo.current.n; i++) {
          await actor.hopTo(geo.current.cards[i]?.stand ?? actor.x);
          if (cancelled) return;
          await sleep(isNight() ? 4000 : 400);
          const id = slotIdsRef.current[i];
          const station = stationsRef.current.find(s => s.id === id);
          if (station) await talk(i, station);
          if (cancelled) return;
          setActive(-1); setSpeech({ slot: -1, text: '' });
          const slot = i;
          const t = setTimeout(() => { timers.delete(t); rotateSlot(slot); }, 1600);   // flips after he's gone
          timers.add(t);
        }
        if (cancelled) return;
        await actor.hopTo(geo.current.W + actor.man.cell.w * k * 0.5);   // hops off the end
        await sleep(isNight() ? 30000 : 2500);
        // off screen: change into the next look (and mood) before he comes back
        await loadLook(actor.man, next);
        if (cancelled) return;
        actor.setLook(next);
        next = pickLook(actor.man);
      }
    };

    loadShimon()
      .then(man => {
        if (cancelled || !actorRef.current) return;
        actor = new ShimonActor(actorRef.current, man, metrics);
        actor.restPose = isNight() ? 'sleepy' : null;
        actor.start();
        tour();
      })
      .catch(e => console.warn('Shimon sprites failed to load', e));

    return () => {
      cancelled = true;
      if (actor) actor.stop();
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = Object.fromEntries(stations.map(s => [s.id, s]));

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* the sand he walks on */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: H * 0.05,
        background: palette.stickers[2], opacity: 0.35, borderTop: `${Math.max(1, H * 0.012)}px dashed ${palette.ink}22`,
      }} />

      {cards.map((c, i) => {
        const s = byId[slotIds[i]];
        if (!s) return null;
        return (
          <StationCard key={i + ':' + s.id} station={s} left={c.left} top={(H - cardH) / 2 - H * 0.03}
            width={cardW} height={cardH} H={H} palette={palette} color={palette.stickers[i % palette.stickers.length]}
            active={active === i} speech={speech.slot === i ? speech.text : null} />
        );
      })}

      <LiveBadge data={data} palette={palette} H={H} width={reserve} onSettings={onSettings} mood={mood} />

      <div ref={actorRef} style={{ ...actorStyle, zIndex: 5 }} />
    </div>
  );
}

function StationCard({ station: s, left, top, width, height, H, palette, color, active, speech }) {
  const pad = H * 0.07;
  const bw = Math.max(1.5, H * 0.016);
  return (
    <div className="shimon-card-in" style={{
      position: 'absolute', left, top, width, height, boxSizing: 'border-box',
      background: '#fff', border: `${bw}px solid ${palette.ink}`, borderRadius: H * 0.13,
      boxShadow: `${bw * 1.4}px ${bw * 1.4}px 0 ${palette.ink}`,
      padding: `${pad * 0.8}px ${pad}px`, direction: 'rtl', textAlign: 'right',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      transform: active ? `translateY(${-H * 0.025}px) scale(1.025)` : 'none',
      transition: 'transform 0.35s cubic-bezier(.3,1.6,.5,1)',
      fontFamily: '"Varela Round", "M PLUS Rounded 1c", system-ui, sans-serif', color: palette.ink,
    }}>
      {/* a speech tail toward Shimon, who stands left of the card */}
      {active && <div style={{
        position: 'absolute', left: -H * 0.11, bottom: H * 0.16, width: 0, height: 0,
        borderTop: `${H * 0.07}px solid transparent`, borderBottom: `${H * 0.07}px solid transparent`,
        borderRight: `${H * 0.11}px solid ${palette.ink}`,
      }} />}
      <div style={{ fontSize: H * 0.095, fontWeight: 700, color: palette.subInk, display: 'flex', alignItems: 'center', gap: H * 0.04, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ width: H * 0.06, height: H * 0.06, borderRadius: '50%', background: color, border: `1px solid ${palette.ink}`, flexShrink: 0 }} />
        {s.kicker}
      </div>
      <Big station={s} H={H} palette={palette} width={width - pad * 2} />
      <div dir="auto" style={{
        fontSize: H * 0.088, fontWeight: 700, lineHeight: 1.2, color: speech != null ? palette.ink : palette.subInk,
        overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: speech != null ? 2 : 1,
        minHeight: H * 0.105,
      }}>
        {speech != null ? <span>{speech}<span className="shimon-caret">▍</span></span> : s.sub}
      </div>
    </div>
  );
}

function Big({ station: s, H, palette, width }) {
  if (s.kind === 'chart') {
    const v = s.big, h = H * 0.28, max = Math.max(...v, 1), wd = width;
    const pts = v.map((y, i) => [(i / (v.length - 1)) * wd, h - (y / max) * (h - 4) - 2]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    return (
      <svg width={wd} height={h} style={{ display: 'block', transform: 'scaleX(-1)' /* time runs right-to-left in RTL */ }}>
        <path d={`${d} L ${wd},${h} L 0,${h} Z`} fill={palette.stickers[1]} fillOpacity="0.45" />
        <path d={d} fill="none" stroke={palette.ink} strokeWidth={Math.max(1.5, H * 0.014)} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    );
  }
  if (s.kind === 'text') {
    return (
      <div dir="auto" style={{
        fontSize: H * 0.12, fontWeight: 800, lineHeight: 1.15, overflow: 'hidden',
        display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
      }}>{s.big}</div>
    );
  }
  return (
    <div style={{
      fontSize: s.kind === 'flags' ? H * 0.24 : H * 0.3, fontWeight: 900, lineHeight: 1,
      fontVariantNumeric: 'tabular-nums', fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif',
      direction: 'ltr', textAlign: 'right', whiteSpace: 'nowrap',
    }}>{s.big}</div>
  );
}

function LiveBadge({ data, palette, H, width, onSettings, mood }) {
  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Varela Round", "M PLUS Rounded 1c", system-ui, sans-serif', color: palette.ink,
      borderLeft: `${Math.max(1, H * 0.012)}px dashed ${palette.ink}33`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: H * 0.05 }}>
        <span className="shimon-live-dot" style={{ width: H * 0.075, height: H * 0.075, borderRadius: '50%', background: '#E83A6E' }} />
        <span style={{ fontSize: H * 0.38, fontWeight: 900, lineHeight: 1, fontFamily: '"M PLUS Rounded 1c", system-ui', fontVariantNumeric: 'tabular-nums' }}>{data.active}</span>
      </div>
      <div style={{ fontSize: H * 0.1, fontWeight: 700, color: palette.subInk, marginTop: H * 0.03 }}>עכשיו באתר</div>
      {mood && <div dir="rtl" style={{ fontSize: H * 0.075, fontWeight: 700, color: palette.subInk, opacity: 0.75, marginTop: H * 0.03, whiteSpace: 'nowrap' }}>
        שמעון {isNight() ? 'ישן' : mood.he}
      </div>}
      <button onClick={onSettings} aria-label="settings" style={{
        position: 'absolute', top: H * 0.04, right: H * 0.06, background: 'none', border: 'none',
        cursor: 'pointer', fontSize: Math.max(12, H * 0.12), color: palette.subInk, opacity: 0.45, padding: 0, lineHeight: 1,
      }}>✿</button>
    </div>
  );
}
