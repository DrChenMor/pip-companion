// Bogan Shimon's sprite engine, shared by the bar (ShimonStage) and the
// mobile/desktop views (ShimonBuddy).
//
// Draws one element with background-position per frame - no React re-render
// per frame, which keeps it light on weak devices. Sprites are rendered from
// the approved poser drawings by tools/shimon-sprites/build.mjs.

const BASE = '/shimon/';

let manifestPromise = null;
const lookPromises = {};

// the manifest, with his first look's sheets loaded
export function loadShimon() {
  if (!manifestPromise) {
    manifestPromise = fetch(BASE + 'sprites.json')
      .then(r => r.json())
      .then(m => loadLook(m, m.defaultLook).then(() => m))
      .catch(e => { manifestPromise = null; throw e; });
  }
  return manifestPromise;
}

// one look's sheets, decoded and ready (so a swap never shows a blank frame)
export function loadLook(man, id) {
  if (!lookPromises[id]) {
    const sheets = Object.values(man.looks[id]?.sheets || {});
    lookPromises[id] = Promise.all(sheets.map(s => new Promise(res => {
      const img = new Image();
      img.onload = img.onerror = () => res();
      img.src = BASE + s.file;
    })));
  }
  return lookPromises[id];
}

// his next look, by weight: mostly the grumpy bogan (40%), the other three 20% each.
// A plain weighted draw (repeats allowed), so over time he really is in each look that share of the time.
export const LOOK_WEIGHTS = { bogan: 40, eshay: 20, beanie: 20, snapback: 20 };
export function pickLook(man) {
  const ids = Object.keys(man.looks);
  const w = ids.map(id => LOOK_WEIGHTS[id] ?? 20), total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ids.length; i++) { if ((r -= w[i]) < 0) return ids[i]; }
  return ids[0];
}

// each look comes with a mood: how fast he talks, how long he holds a face, and which faces he swaps for his own
export const MOODS = {
  grumpy: { he: 'עצבני', type: 58, hold: 1400, remap: {} },
  fired:  { he: 'חם על כולם', type: 44, hold: 1300, remap: { sneer: 'swear', stare: 'swear' } },
  chill:  { he: 'ראש קטן', type: 78, hold: 1900, remap: { swear: 'sneer', stare: 'sleepy' } },
  stoked: { he: 'במצב רוח טוב', type: 52, hold: 1600, remap: { stare: 'sneer', swear: 'sneer', sneer: 'stoked' } },
};

export const isNight = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };

export class ShimonActor {
  // metrics(): { stand: px from sand to the top of his head, ground: y of the sand in the element's container }
  constructor(el, man, metrics) {
    this.el = el; this.man = man; this.metrics = metrics;
    this.mode = 'idle'; this.pose = 'puff'; this.mouth = 0;
    this.x = 0; this.face = 1;
    this.restPose = null;                 // a pose to hold instead of the idle loop (e.g. 'sleepy')
    this.blinkUntil = 0; this.nextBlink = performance.now() + 3000;
    this.hop = null; this.raf = 0; this.last = {};
    this.look = man.defaultLook || Object.keys(man.looks)[0];
    this.loop = this.loop.bind(this);
  }

  scale() { return this.metrics().stand / this.man.standHeight; }
  start() { this.raf = requestAnimationFrame(this.loop); }
  stop() { cancelAnimationFrame(this.raf); if (this.hop) { this.hop.done(); this.hop = null; } }
  loop(now) { this.draw(now); this.raf = requestAnimationFrame(this.loop); }

  // ---- what he wears, and the mood that comes with it
  setLook(id) { if (this.man.looks[id]) this.look = id; }
  mood() { return MOODS[this.man.looks[this.look]?.mood] || MOODS.grumpy; }

  // ---- what he does
  idle() { this.mode = 'idle'; }
  strike(pose) { this.mode = 'pose'; this.pose = this.mood().remap[pose] || pose; }
  talking(mouth) { this.mode = 'talk'; this.mouth = mouth; }
  blink() { this.blinkUntil = performance.now() + 130; }

  hopTo(x) {
    return new Promise(done => {
      if (this.hop) this.hop.done();
      const dist = x - this.x;
      const stepPx = this.man.hop.distance * this.scale();
      if (Math.abs(dist) < 4 || !stepPx) { this.x = x; this.hop = null; return done(); }
      const count = Math.max(1, Math.round(Math.abs(dist) / stepPx));
      this.face = dist > 0 ? 1 : -1;
      this.mode = 'hop';
      this.hop = { start: performance.now(), from: this.x, to: x, dir: Math.sign(dist), step: Math.abs(dist) / count, count, done };
    });
  }

  // ---- drawing
  draw(now) {
    const { el, man } = this;
    const m = this.metrics();
    if (!el || !m.stand) return;
    const k = m.stand / man.standHeight;

    let sheet = 'idle', frame = 0;
    if (this.mode === 'hop' && this.hop) {
      const h = this.hop, t = (now - h.start) / 1000;
      if (t >= h.count * 0.5) {
        this.x = h.to; this.hop = null; this.mode = 'idle';
        this.blinkUntil = now + 130;                 // he lands; the change of drawing hides under a blink
        h.done();
      } else {
        const hi = Math.floor(t / 0.5);
        const f = Math.min(11, Math.floor((t - hi * 0.5) * man.fps));
        sheet = 'hop'; frame = f;
        // x steps with the drawing (on ones) so the planted feet don't slide
        this.x = h.from + h.dir * (hi + man.hop.xs[f] / man.hop.distance) * h.step;
      }
    }
    if (this.mode === 'talk') { sheet = 'talk'; frame = this.mouth; }
    else if (this.mode === 'pose') {
      sheet = 'poses';
      const name = this.pose === 'swear' ? (Math.floor(now / 140) % 2 ? 'swear1' : 'swear2') : this.pose;
      frame = Math.max(0, man.poses.indexOf(name));
    } else if (this.mode === 'idle') {
      if (now > this.nextBlink) { this.blinkUntil = now + 125; this.nextBlink = now + 2500 + Math.random() * 4000; }
      if (now < this.blinkUntil) { sheet = 'poses'; frame = man.poses.indexOf('blink'); }
      else if (this.restPose) { sheet = 'poses'; frame = Math.max(0, man.poses.indexOf(this.restPose)); }
      else { sheet = 'idle'; frame = Math.floor((now / 1000) * man.fps) % man.looks[this.look].sheets.idle.frames; }
    }

    const info = man.looks[this.look].sheets[sheet], last = this.last;
    const cw = man.cell.w * k, chh = man.cell.h * k;
    if (last.k !== k || last.file !== info.file) {
      el.style.width = cw + 'px';
      el.style.height = chh + 'px';
      el.style.backgroundImage = `url(${BASE}${info.file})`;
      el.style.backgroundSize = `${info.cols * cw}px ${info.rows * chh}px`;
      el.style.transformOrigin = `${man.anchor.x * k}px ${man.anchor.y * k}px`;
    }
    if (last.k !== k || last.file !== info.file || last.frame !== frame) {
      el.style.backgroundPosition = `${-(frame % info.cols) * cw}px ${-Math.floor(frame / info.cols) * chh}px`;
    }
    if (last.k !== k || last.x !== this.x || last.face !== this.face || last.ground !== m.ground) {
      el.style.transform = `translate3d(${(this.x - man.anchor.x * k).toFixed(1)}px, ${(m.ground - man.anchor.y * k).toFixed(1)}px, 0) scaleX(${this.face})`;
    }
    Object.assign(last, { k, file: info.file, frame, x: this.x, face: this.face, ground: m.ground });
  }
}

// a talk mouth for one typed character (fake lip-sync); returns the talk-sheet frame
const PUNCT = /[\s.,!?·:;\-–'"()]/;
export function mouthFor(ch, prev) {
  if (PUNCT.test(ch)) return Math.random() < 0.5 ? 0 : 1;
  let m;
  do { m = 1 + Math.floor(Math.random() * 7); } while (m === prev);
  return m;
}

export const actorStyle = {
  position: 'absolute', left: 0, top: 0, pointerEvents: 'none',
  backgroundRepeat: 'no-repeat', willChange: 'transform', transform: 'translate3d(-9999px,0,0)',
};
