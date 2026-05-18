import { useState } from 'react';

export default function SettingsPanel({ config, setConfig, palette, onClose, gaError, gaConnected, googleAuth, fullscreen }) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div style={{
      position: 'fixed',
      ...(fullscreen
        ? { top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', borderRadius: 0, border: 'none', boxShadow: 'none' }
        : { left: 24, bottom: 24, width: 320, borderRadius: 20, border: '2.5px solid ' + palette.ink, boxShadow: '4px 4px 0 ' + palette.ink }
      ),
      background: fullscreen ? '#fff' : 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)',
      zIndex: 1000, fontFamily: '"M PLUS Rounded 1c", system-ui',
      overflow: 'auto',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '2px solid ' + palette.ink,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: palette.stickers[3],
      }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: palette.ink }}>settings ✿</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: palette.ink, fontWeight: 700 }}>✕</button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Section label="identity">
          <Field label="Site name" value={config.siteName} onChange={v => setConfig({ ...config, siteName: v })} />
          <Field label="Companion name" value={config.creatureName} onChange={v => setConfig({ ...config, creatureName: v })} />
        </Section>

        <Section label="gemini ai">
          <Field label="Gemini API key" value={config.geminiApiKey} onChange={v => setConfig({ ...config, geminiApiKey: v })} type={showApiKey ? 'text' : 'password'} />
          <label style={{ display: 'flex', gap: 6, fontSize: 11, color: palette.subInk, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={showApiKey} onChange={() => setShowApiKey(p => !p)} /> show key
          </label>
        </Section>

        <Section label="google analytics">
          <Field label="OAuth Client ID" value={config.gaClientId} onChange={v => setConfig({ ...config, gaClientId: v })} placeholder="xxxxx.apps.googleusercontent.com" />
          <Field label="GA4 Property ID" value={config.gaPropertyId} onChange={v => setConfig({ ...config, gaPropertyId: v })} placeholder="e.g. 505919713" />
          {config.gaClientId && config.gaPropertyId && (
            googleAuth.isSignedIn ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{
                  flex: 1, fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8,
                  background: gaError ? '#FFE0E0' : gaConnected ? '#D4EDDA' : '#FFF3CD',
                  color: gaError ? '#9B1C1C' : gaConnected ? '#155724' : '#856404',
                }}>
                  {gaError ? `error: ${gaError}` : gaConnected ? 'connected to GA4 ♡' : 'fetching data...'}
                </div>
                <button onClick={googleAuth.signOut} style={{
                  fontSize: 10, background: 'none', border: '1.5px solid #ccc',
                  borderRadius: 8, padding: '3px 8px', cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 700, color: '#999',
                }}>disconnect</button>
              </div>
            ) : (
              <button onClick={googleAuth.signIn} style={{
                padding: '8px 14px', borderRadius: 10,
                border: '2px solid ' + palette.ink, cursor: 'pointer',
                background: palette.stickers[1], fontWeight: 800, fontSize: 12,
                color: palette.ink, fontFamily: 'inherit', width: '100%',
              }}>connect to google analytics ♡</button>
            )
          )}
          {googleAuth.error && (
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9B1C1C' }}>
              {googleAuth.error}
            </div>
          )}
          <div style={{ fontSize: 10, color: palette.subInk, fontWeight: 600, lineHeight: 1.4 }}>
            leave blank to use simulated demo data ♡
          </div>
        </Section>

        <Section label="appearance">
          <div style={{ display: 'flex', gap: 6 }}>
            {['blob', 'orb', 'pill'].map(s => (
              <button key={s} onClick={() => setConfig({ ...config, faceShape: s })} style={{
                flex: 1, padding: '6px 0', borderRadius: 10,
                border: '2px solid ' + palette.ink, cursor: 'pointer',
                background: config.faceShape === s ? palette.stickers[0] : '#fff',
                fontWeight: 700, fontSize: 12, color: palette.ink,
                fontFamily: 'inherit',
              }}>{s}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['peach', 'sakura', 'mint', 'vanilla', 'cloud'].map(p => (
              <button key={p} onClick={() => setConfig({ ...config, palette: p })} style={{
                padding: '4px 10px', borderRadius: 8,
                border: config.palette === p ? '2px solid ' + palette.ink : '2px solid transparent',
                background: { peach: '#FFF4E6', sakura: '#FFE9F0', mint: '#E8F7EE', vanilla: '#FFF9E6', cloud: '#EAF3FF' }[p],
                cursor: 'pointer', fontWeight: 700, fontSize: 11, fontFamily: 'inherit',
                color: palette.ink,
              }}>{p}</button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#666', marginBottom: 2 }}>{label}</div>
      <input
        type={type} value={value || ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '6px 10px', border: '1.5px solid #ddd',
          borderRadius: 8, fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
          outline: 'none', background: '#fafafa',
        }}
      />
    </div>
  );
}
