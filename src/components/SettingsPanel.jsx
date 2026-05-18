import { useState } from 'react';

export default function SettingsPanel({ config, setConfig, palette, onClose, gaError, gaConnected }) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div style={{
      position: 'fixed', left: 24, bottom: 24, width: 320,
      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)',
      borderRadius: 20, border: '2.5px solid ' + palette.ink,
      boxShadow: '4px 4px 0 ' + palette.ink,
      zIndex: 1000, fontFamily: '"M PLUS Rounded 1c", system-ui',
      overflow: 'hidden',
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
          <Field label="GA4 Property ID" value={config.gaPropertyId} onChange={v => setConfig({ ...config, gaPropertyId: v })} placeholder="e.g. 123456789" />
          <Field label="GA API Key" value={config.gaApiKey} onChange={v => setConfig({ ...config, gaApiKey: v })} type="password" />
          {config.gaPropertyId && config.gaApiKey && (
            <div style={{
              fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8,
              background: gaError ? '#FFE0E0' : gaConnected ? '#D4EDDA' : '#FFF3CD',
              color: gaError ? '#9B1C1C' : gaConnected ? '#155724' : '#856404',
            }}>
              {gaError ? `error: ${gaError}` : gaConnected ? 'connected to GA4 ♡' : 'connecting...'}
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
