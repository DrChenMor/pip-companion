// Renders bogan Shimon sprite sheets from the poser into public/shimon/.
// Usage: node tools/shimon-sprites/build.mjs        (needs Google Chrome)
// Based on shimon/rive/poser/render.mjs, plus a transparent background.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const page = resolve(here, 'sprites.html');
const outDir = resolve(here, '../../public/shimon');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9400 + Math.floor(Math.random() * 400);
const prof = join(process.env.TMPDIR || tmpdir(), `shimon-sprites-${port}`);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', `--remote-debugging-port=${port}`,
  `--user-data-dir=${prof}`, '--force-device-scale-factor=1', '--allow-file-access-from-files', '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 100 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch { }
  if (!target) await sleep(100);
}
if (!target) { chrome.kill(); throw new Error('Chrome did not start'); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result?.result?.value;
};
try {
  await send('Page.enable');
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', { url: pathToFileURL(page).href });
  for (let i = 0; i < 200; i++) { if (await evaluate('document.readyState') === 'complete') break; await sleep(50); }
  const names = await evaluate('window.SHEET_NAMES');
  if (!names) throw new Error('sprites.html failed to build (check the poser script paths)');
  mkdirSync(outDir, { recursive: true });
  for (const name of names) {
    const { w, h } = await evaluate(`window.showSheet(${JSON.stringify(name)})`);
    await send('Emulation.setDeviceMetricsOverride', { width: Math.ceil(w), height: Math.ceil(h), deviceScaleFactor: 1, mobile: false });
    await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
    console.log(`${name}.png  ${Math.round(w)}x${Math.round(h)}`);
  }
  const manifest = await evaluate('window.MANIFEST');
  writeFileSync(join(outDir, 'sprites.json'), JSON.stringify(manifest, null, 1));
  console.log('sprites.json written ->', outDir);
} finally {
  ws.close(); chrome.kill();
  try { rmSync(prof, { recursive: true, force: true }); } catch { }
}
