// Bogan Shimon's sprite engine, shared by the bar (ShimonStage) and the
// mobile/desktop views (ShimonBuddy).
//
// Draws one element with background-position per frame - no React re-render
// per frame, which keeps it light on weak devices. Sprites are rendered from
// the approved poser drawings by tools/shimon-sprites/build.mjs.

const BASE = '/shimon/';

let manifestPromise = null;
export function loadShimon() {
  if (!manifestPromise) {
    manifestPromise = fetch(BASE + 'sprites.json')
      .then(r => r.json())
      .then(m => {
        for (const s of Object.values(m.sheets)) { const img = new Image(); img.src = BASE + s.file; }
        return m;
      })
      .catch(e => { manifestPromise = null; throw e; });
  }
  return manifestPromise;
}

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
    this.loop = this.loop.bind(this);
  }

  scale() { return this.metrics().stand / this.man.standHeight; }
  start() { this.raf = requestAnimationFrame(this.loop); }
  stop() { cancelAnimationFrame(this.raf); if (this.hop) { this.hop.done(); this.hop = null; } }
  loop(now) { this.draw(now); this.raf = requestAnimationFrame(this.loop); }

  // ---- what he does
  idle() { this.mode = 'idle'; }
  strike(pose) { this.mode = 'pose'; this.pose = pose; }
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
      else { sheet = 'idle'; frame = Math.floor((now / 1000) * man.fps) % man.sheets.idle.frames; }
    }

    const info = man.sheets[sheet], last = this.last;
    const cw = man.cell.w * k, chh = man.cell.h * k;
    if (last.k !== k || last.sheet !== sheet) {
      el.style.width = cw + 'px';
      el.style.height = chh + 'px';
      el.style.backgroundImage = `url(${BASE}${info.file})`;
      el.style.backgroundSize = `${info.cols * cw}px ${info.rows * chh}px`;
      el.style.transformOrigin = `${man.anchor.x * k}px ${man.anchor.y * k}px`;
    }
    if (last.k !== k || last.sheet !== sheet || last.frame !== frame) {
      el.style.backgroundPosition = `${-(frame % info.cols) * cw}px ${-Math.floor(frame / info.cols) * chh}px`;
    }
    if (last.k !== k || last.x !== this.x || last.face !== this.face || last.ground !== m.ground) {
      el.style.transform = `translate3d(${(this.x - man.anchor.x * k).toFixed(1)}px, ${(m.ground - man.anchor.y * k).toFixed(1)}px, 0) scaleX(${this.face})`;
    }
    Object.assign(last, { k, sheet, frame, x: this.x, face: this.face, ground: m.ground });
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
