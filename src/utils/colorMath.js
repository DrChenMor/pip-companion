export function lerp(a, b, t) { return a + (b - a) * t; }

function hexToHSL(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRGBHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, x];
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function parseColor(c) {
  if (c[0] === '#') return hexToHSL(c);
  const m = c.match(/\d+/g) || [0, 0, 0];
  const hex = '#' + [m[0], m[1], m[2]].map((n) => parseInt(n, 10).toString(16).padStart(2, '0')).join('');
  return hexToHSL(hex);
}

function lerpHue(h1, h2, t) {
  const d = ((h2 - h1 + 540) % 360) - 180;
  return (h1 + d * t + 360) % 360;
}

export function lerpColor(c1, c2, t) {
  const [h1, s1, l1] = parseColor(c1);
  const [h2, s2, l2] = parseColor(c2);
  return hslToRGBHex(lerpHue(h1, h2, t), lerp(s1, s2, t), lerp(l1, l2, t));
}
