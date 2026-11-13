import { useEffect, useRef } from 'react';
import { ShimonActor, loadShimon, loadLook, pickLook, mouthFor, actorStyle } from '../utils/shimonActor';

// Bogan Shimon for the mobile and desktop views (the bar has ShimonStage).
// He smokes and breathes in place, talks while the speech bubble types out a
// message, pulls a face that fits the mood, and can hop around his box.
// Now and then he hops out of the box and comes back in another look (each
// look has its own mood, which colours the faces he pulls).

// the face he pulls after he's said his piece, per mood
const MOOD_POSE = {
  sleeping: 'sleepy', drowsy: 'sleepy', bored: 'stare', content: 'puff', focused: 'sneer',
  curious: 'sneer', happy: 'stoked', excited: 'stoked', surprised: 'stoked', overwhelmed: 'swear',
  dizzy: 'swear', anxious: 'swear', proud: 'stoked', fancy: 'sneer', smitten: 'stoked',
};
const TYPE_MS = 18;   // TypewriterText's speed, so his mouth stops when the text does

export default function ShimonBuddy({ mood = 'content', message = '', stand = 120, wander = false, width = '100%' }) {
  const boxRef = useRef(null);
  const actorEl = useRef(null);
  const actorRef = useRef(null);
  const moodRef = useRef(mood);
  const standRef = useRef(stand);
  const talkToken = useRef(0);
  const height = Math.round(stand * 1.4);

  useEffect(() => {
    moodRef.current = mood;
    standRef.current = stand;
    const a = actorRef.current;
    if (a) a.restPose = mood === 'sleeping' || mood === 'drowsy' ? 'sleepy' : null;
  }, [mood, stand]);

  // mount: load the sprites, stand him in the middle, let him wander
  useEffect(() => {
    let alive = true;
    const timers = new Set();
    const sleep = (ms) => new Promise(r => { const id = setTimeout(() => { timers.delete(id); r(); }, ms); timers.add(id); });
    const boxW = () => boxRef.current?.clientWidth || 0;
    const metrics = () => ({ stand: standRef.current, ground: Math.round(standRef.current * 1.4) - standRef.current * 0.05 });

    loadShimon().then(async man => {
      if (!alive || !actorEl.current) return;
      const a = new ShimonActor(actorEl.current, man, metrics);
      a.x = boxW() / 2;
      a.restPose = moodRef.current === 'sleeping' || moodRef.current === 'drowsy' ? 'sleepy' : null;
      actorRef.current = a;
      a.setLook(pickLook(man));                     // a look of his own each visit
      await loadLook(man, a.look);
      if (!alive) return;
      a.start();
      let next = pickLook(man), hops = 0;
      while (alive && wander) {
        await sleep(9000 + Math.random() * 12000);
        if (!alive) return;
        if (a.mode !== 'idle' || a.restPose) continue;      // not while talking, posing or asleep
        const W = boxW(), margin = standRef.current * 0.5;
        if (W < margin * 4) continue;
        loadLook(man, next);
        if (++hops % 4 === 0) {                           // off he goes, and back in something else
          const out = a.man.cell.w * a.scale() * 0.55;
          await a.hopTo(W + out);
          await sleep(1500);
          await loadLook(man, next);
          if (!alive) return;
          a.setLook(next);
          next = pickLook(man);
          a.x = -out;
          await a.hopTo(margin + Math.random() * (W - margin * 2));
          continue;
        }
        const target = margin + Math.random() * (W - margin * 2);
        if (Math.abs(target - a.x) > standRef.current * 0.6) await a.hopTo(target);
      }
    }).catch(e => console.warn('Shimon sprites failed to load', e));

    // keep him inside his box if it gets narrower
    const ro = new ResizeObserver(() => {
      const a = actorRef.current;
      if (!a) return;
      const W = boxW(), margin = standRef.current * 0.5;
      if (a.mode !== 'hop' && (a.x < margin || a.x > W - margin)) a.x = W / 2;
    });
    if (boxRef.current) ro.observe(boxRef.current);

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      ro.disconnect();
      if (actorRef.current) actorRef.current.stop();
      actorRef.current = null;
    };
  }, [wander]);

  // a new message: he says it (mouth moves while it types), then pulls a face
  useEffect(() => {
    const a = actorRef.current;
    if (!a || !message) return;
    const my = ++talkToken.current;
    const live = () => my === talkToken.current && actorRef.current === a;
    (async () => {
      if (a.mode === 'hop') return;                         // mid-hop: let the bubble talk for him
      const t0 = performance.now(), dur = Math.max(700, message.length * TYPE_MS);
      let prev = 0;
      while (live() && performance.now() - t0 < dur) {
        const i = Math.floor((performance.now() - t0) / TYPE_MS);
        prev = mouthFor(message[i] || 'a', prev);
        a.talking(prev);
        await new Promise(r => setTimeout(r, 70));
      }
      if (!live()) return;
      a.talking(0);
      await new Promise(r => setTimeout(r, 250));
      if (!live()) return;
      a.strike(MOOD_POSE[moodRef.current] || 'puff');
      await new Promise(r => setTimeout(r, 1600));
      if (live()) a.idle();
    })();
  }, [message]);

  return (
    <div ref={boxRef} style={{ position: 'relative', width, height, overflow: 'hidden', flexShrink: 0 }}>
      <div ref={actorEl} style={actorStyle} />
    </div>
  );
}
