import { useEffect, useRef } from 'react';
import { KMOODS } from '../utils/constants';
import { lerp, lerpColor } from '../utils/colorMath';

export default function KawaiiCreature({ mood = 'content', size = 104, shape = 'blob' }) {
  const ref = useRef(null);
  const state = useRef({
    body: '#FFE08A', ink: '#3D2818', cheek: '#FFB8D9',
    bob: 0.4, shake: 0, wander: 0.5,
    eyeMix: { caret: 1 }, mouthMix: { soft: 1 }, decorMix: { none: 1 },
    blinkT: 2, blinkClose: 0, t: 0,
    appliedMood: 'content',
    queuedMood: null,
    phase: 'idle',
  });

  useEffect(() => {
    const s = state.current;
    if (s.appliedMood === mood && !s.queuedMood) return;
    s.queuedMood = mood;
    if (s.phase === 'idle' && s.blinkClose < 0.1) {
      s.phase = 'closing';
    }
  }, [mood]);

  useEffect(() => {
    let raf;
    const tick = (now) => {
      const s = state.current;
      s.t = now / 1000;

      if (s.phase === 'closing') {
        s.blinkClose = Math.min(1, s.blinkClose + 0.18);
        if (s.blinkClose >= 0.98) {
          if (s.queuedMood) { s.appliedMood = s.queuedMood; s.queuedMood = null; }
          s.phase = 'opening';
          s.blinkT = 3 + Math.random() * 4;
        }
      } else if (s.phase === 'opening') {
        s.blinkClose = Math.max(0, s.blinkClose - 0.10);
        if (s.blinkClose <= 0.02) {
          s.phase = 'idle';
          if (s.queuedMood && s.queuedMood !== s.appliedMood) s.phase = 'closing';
          else s.queuedMood = null;
        }
      } else {
        const target = KMOODS[s.appliedMood] || KMOODS.content;
        s.blinkT -= 1 / 60;
        if (s.blinkT <= 0 && target.eye !== 'sleep' && target.eye !== 'half') {
          s.blinkT = 2.8 + Math.random() * 4;
          s.blinkClose = 1;
        }
        s.blinkClose = Math.max(0, s.blinkClose - 0.20);
        if (s.queuedMood && s.queuedMood !== s.appliedMood && s.blinkClose < 0.05) {
          s.phase = 'closing';
        }
      }

      const target = KMOODS[s.appliedMood] || KMOODS.content;
      const ck = 0.04;
      s.body  = lerpColor(s.body,  target.body,  ck);
      s.ink   = lerpColor(s.ink,   target.ink,   ck);
      s.cheek = lerpColor(s.cheek, target.cheek, ck);
      s.bob    = lerp(s.bob,    target.bob,    0.05);
      s.shake  = lerp(s.shake,  target.shake,  0.05);
      s.wander = lerp(s.wander, target.wander, 0.05);

      const blendT = s.phase === 'opening' ? 0.18 : 0.06;
      const blend = (mixObj, key) => {
        const next = {};
        for (const k of Object.keys(mixObj)) next[k] = lerp(mixObj[k] || 0, 0, blendT);
        next[key] = lerp(next[key] || 0, 1, blendT);
        return next;
      };
      s.eyeMix   = blend(s.eyeMix,   target.eye);
      s.mouthMix = blend(s.mouthMix, target.mouth);
      s.decorMix = blend(s.decorMix, target.decor);

      drawKawaii(ref.current, s, { size, shape });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size, shape]);

  return <canvas ref={ref} width={size * 2} height={size * 2}
                 style={{ width: size, height: size, display: 'block' }} />;
}

function drawKawaii(canvas, s, opts) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(2, 2);
  const W = canvas.width / 2, H = canvas.height / 2;
  const cx = W / 2;
  const bob = Math.sin(s.t * 2.4) * 2.0 * s.bob;
  const shake = Math.sin(s.t * 30) * 1.0 * s.shake;
  const wander = Math.sin(s.t * 0.55) * 5 * s.wander +
                 Math.sin(s.t * 1.7 + 1.3) * 1.5 * s.wander;
  const cy = H * 0.56 + bob;
  const r = W * 0.32;

  ctx.save();
  ctx.translate(cx + wander + shake, cy);
  ctx.fillStyle = s.body; ctx.strokeStyle = s.ink; ctx.lineWidth = 2.8;
  if (opts.shape === 'orb') {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (opts.shape === 'pill') {
    const rw = r * 0.85, rh = r * 1.05;
    roundRect(ctx, -rw, -rh, rw * 2, rh * 2, rw); ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const wob = 1 + Math.sin(s.t * 1.4 + a * 3) * 0.035 + Math.sin(s.t * 1.9 + a * 2) * 0.025;
      const rr = r * wob;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.95;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  ctx.fillStyle = s.cheek;
  ctx.beginPath(); ctx.arc(-r * 0.52, r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( r * 0.52, r * 0.18, r * 0.13, 0, Math.PI * 2); ctx.fill();

  drawKawaiiEyes(ctx, r, s);
  drawKawaiiMouth(ctx, r, s);
  ctx.restore();

  drawDecor(ctx, cx + wander, cy, r, s);
  ctx.restore();
}

function drawKawaiiEyes(ctx, r, s) {
  const eyeY = -r * 0.05;
  for (const side of [-1, 1]) {
    const eyeX = side * r * 0.38;
    for (const shape of Object.keys(s.eyeMix)) {
      const w = s.eyeMix[shape]; if (w < 0.04) continue;
      ctx.save();
      ctx.translate(eyeX, eyeY);
      ctx.globalAlpha = w;
      const blink = 1 - s.blinkClose;
      drawEyeShape(ctx, shape, r * 0.13, s.ink, blink, side, s.t);
      ctx.restore();
    }
  }
}

function drawEyeShape(ctx, shape, R, ink, blink, side, t) {
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = R * 0.35; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (shape === 'sleep') { ctx.beginPath(); ctx.arc(0, R * 0.1, R, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); return; }
  if (shape === 'half') {
    ctx.beginPath(); ctx.arc(0, R * 0.05, R * 0.85 * blink, 0, Math.PI, false);
    ctx.lineTo(-R * 0.85 * blink, R * 0.05); ctx.closePath(); ctx.fill(); return;
  }
  if (shape === 'caret') { ctx.beginPath(); ctx.moveTo(-R * 0.9, R * 0.3); ctx.lineTo(0, -R * 0.5 * blink); ctx.lineTo(R * 0.9, R * 0.3); ctx.stroke(); return; }
  if (shape === 'line') { ctx.beginPath(); ctx.moveTo(-R * 0.8, 0); ctx.lineTo(R * 0.8, 0); ctx.stroke(); return; }
  if (shape === 'tilt') {
    const liftY = side > 0 ? -R * 0.25 : 0;
    ctx.beginPath(); ctx.arc(R * 0.1, -R * 0.2 + liftY, R * 0.7 * blink, 0, Math.PI * 2); ctx.fill(); return;
  }
  if (shape === 'wobble') { const wob = Math.sin(t * 12 + side) * R * 0.18; ctx.beginPath(); ctx.arc(wob, 0, R * 0.85 * blink, 0, Math.PI * 2); ctx.fill(); return; }
  if (shape === 'sparkle') {
    ctx.beginPath(); ctx.arc(0, 0, R * 1.05 * blink, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'white'; const sR = R * 0.5 * blink;
    drawSparkle(ctx, -R * 0.25, -R * 0.15, sR); return;
  }
  if (shape === 'wide') {
    ctx.beginPath(); ctx.arc(0, 0, R * 1.2 * blink, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(R * 0.25, -R * 0.3, R * 0.35 * blink, 0, Math.PI * 2); ctx.fill(); return;
  }
  if (shape === 'shock') {
    ctx.beginPath(); ctx.arc(0, 0, R * 1.35 * blink, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(R * 0.3, -R * 0.35, R * 0.32 * blink, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-R * 0.3, R * 0.35, R * 0.18 * blink, 0, Math.PI * 2); ctx.fill(); return;
  }
  if (shape === 'spiral') {
    const rot = t * 4 * side;
    ctx.save(); ctx.rotate(rot); ctx.lineWidth = R * 0.22;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.85 * blink, 0, Math.PI * 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.45 * blink, Math.PI, Math.PI * 2.4); ctx.stroke();
    ctx.restore(); return;
  }
  if (shape === 'heart') {
    ctx.beginPath(); const s_ = R * 1.0 * blink;
    ctx.moveTo(0, s_ * 0.65);
    ctx.bezierCurveTo(s_ * 1.2, s_ * 0.05, s_ * 0.7, -s_ * 0.9, 0, -s_ * 0.25);
    ctx.bezierCurveTo(-s_ * 0.7, -s_ * 0.9, -s_ * 1.2, s_ * 0.05, 0, s_ * 0.65);
    ctx.closePath(); ctx.fill(); return;
  }
  ctx.beginPath(); ctx.arc(0, 0, R * 0.85 * blink, 0, Math.PI * 2); ctx.fill();
}

function drawSparkle(ctx, x, y, sz) {
  ctx.beginPath(); ctx.moveTo(x, y - sz); ctx.quadraticCurveTo(x, y, x + sz, y);
  ctx.quadraticCurveTo(x, y, x, y + sz); ctx.quadraticCurveTo(x, y, x - sz, y);
  ctx.quadraticCurveTo(x, y, x, y - sz); ctx.closePath(); ctx.fill();
}

function drawKawaiiMouth(ctx, r, s) {
  ctx.save(); ctx.translate(0, r * 0.32);
  for (const shape of Object.keys(s.mouthMix)) {
    const w = s.mouthMix[shape]; if (w < 0.04) continue;
    ctx.save(); ctx.globalAlpha = w;
    drawMouthShape(ctx, shape, r * 0.34, s);
    ctx.restore();
  }
  ctx.restore();
}

function drawMouthShape(ctx, shape, R, s) {
  ctx.strokeStyle = s.ink; ctx.fillStyle = s.ink; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (shape === 'smile') { ctx.beginPath(); ctx.arc(0, -R * 0.05, R * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
  else if (shape === 'soft') { ctx.beginPath(); ctx.moveTo(-R * 0.32, 0); ctx.quadraticCurveTo(0, R * 0.18, R * 0.32, 0); ctx.stroke(); }
  else if (shape === 'flat') { ctx.beginPath(); ctx.arc(0, 0, R * 0.18, 0, Math.PI * 2); ctx.fill(); }
  else if (shape === 'dotMouth') { ctx.beginPath(); ctx.arc(0, -R * 0.05, R * 0.10, 0, Math.PI * 2); ctx.fill(); }
  else if (shape === 'tinyO') { ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); ctx.fill(); }
  else if (shape === 'sideMouth') { ctx.beginPath(); ctx.moveTo(R * 0.05, -R * 0.05); ctx.quadraticCurveTo(R * 0.2, R * 0.12, R * 0.35, 0); ctx.stroke(); }
  else if (shape === 'open') {
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.32, R * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FF7AA0'; ctx.beginPath(); ctx.ellipse(0, R * 0.2, R * 0.2, R * 0.18, 0, 0, Math.PI); ctx.fill();
  }
  else if (shape === 'ohh') { ctx.beginPath(); ctx.ellipse(0, 0, R * 0.18, R * 0.32, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (shape === 'wide') { ctx.beginPath(); ctx.ellipse(0, 0, R * 0.5, R * 0.25, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (shape === 'wobble') {
    const wob = Math.sin(s.t * 10) * R * 0.08;
    ctx.beginPath(); ctx.moveTo(-R * 0.45, wob); ctx.quadraticCurveTo(-R * 0.18, -wob, 0, wob); ctx.quadraticCurveTo(R * 0.18, wob, R * 0.45, -wob); ctx.stroke();
  }
  else if (shape === 'smug') { ctx.beginPath(); ctx.moveTo(-R * 0.35, R * 0.08); ctx.quadraticCurveTo(0, -R * 0.12, R * 0.45, -R * 0.05); ctx.stroke(); }
  else if (shape === 'mustache') {
    ctx.save(); ctx.lineWidth = 2.6; const my = -R * 0.05;
    ctx.beginPath(); ctx.moveTo(0, my); ctx.bezierCurveTo(-R * 0.15, my - R * 0.18, -R * 0.45, my + R * 0.12, -R * 0.6, my - R * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, my); ctx.bezierCurveTo(R * 0.15, my - R * 0.18, R * 0.45, my + R * 0.12, R * 0.6, my - R * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R * 0.18, R * 0.32); ctx.lineTo(R * 0.18, R * 0.32); ctx.stroke();
    ctx.restore();
  }
}

function drawDecor(ctx, cx, cy, r, s) {
  for (const key of Object.keys(s.decorMix)) {
    const a = s.decorMix[key]; if (a < 0.05 || key === 'none') continue;
    ctx.save(); ctx.globalAlpha = a;
    if (key === 'sparkle') drawSideSparkles(ctx, cx, cy, r, s);
    else if (key === 'sweat') drawSweat(ctx, cx, cy, r, s);
    else if (key === 'hearts') drawHearts(ctx, cx, cy, r, s);
    ctx.restore();
  }
}

function drawSideSparkles(ctx, cx, cy, r, s) {
  const positions = [
    { x: -r * 1.15, y: r * 0.10, size: 6, phase: 0 },
    { x: r * 1.20, y: -r * 0.10, size: 7, phase: 1.2 },
    { x: r * 1.05, y: r * 0.55, size: 5, phase: 0.6 },
    { x: -r * 1.00, y: r * 0.55, size: 6, phase: 2.0 },
  ];
  ctx.fillStyle = '#FFD93D';
  for (const p of positions) {
    const a = 0.45 + 0.55 * Math.sin(s.t * 3 + p.phase);
    drawSparkle(ctx, cx + p.x, cy + p.y, p.size * (0.55 + a * 0.6));
  }
}

function drawSweat(ctx, cx, cy, r, s) {
  const drop = (Math.sin(s.t * 2) + 1) / 2;
  ctx.fillStyle = '#5BAEDB'; ctx.strokeStyle = '#1A2D4A'; ctx.lineWidth = 1.5;
  const x = cx + r * 1.05, y = cy - r * 0.20 + drop * 6;
  ctx.beginPath(); ctx.moveTo(x, y-7); ctx.quadraticCurveTo(x+5,y-1,x+3,y+4);
  ctx.quadraticCurveTo(x,y+6,x-3,y+4); ctx.quadraticCurveTo(x-5,y-1,x,y-7);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawHearts(ctx, cx, cy, r, s) {
  ctx.fillStyle = '#FF4D6D';
  for (let i = 0; i < 3; i++) {
    const phase = i * 0.7;
    const k = ((s.t * 0.6 + phase) % 2.4) / 2.4;
    const op = 1 - k;
    if (op <= 0) continue;
    ctx.save(); ctx.globalAlpha *= op;
    const x = cx + r * 1.0 + Math.sin((k + phase) * 4) * 4;
    const y = cy + r * 0.4 - k * r * 1.5;
    drawHeart(ctx, x, y, 4 + i * 0.8);
    ctx.restore();
  }
}

function drawHeart(ctx, x, y, sz) {
  ctx.beginPath(); ctx.moveTo(x, y + sz * 0.65);
  ctx.bezierCurveTo(x + sz * 1.2, y + sz * 0.05, x + sz * 0.7, y - sz * 0.9, x, y - sz * 0.25);
  ctx.bezierCurveTo(x - sz * 0.7, y - sz * 0.9, x - sz * 1.2, y + sz * 0.05, x, y + sz * 0.65);
  ctx.closePath(); ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}
