export default function SettingsPanel({ config, setConfig, palette, onClose, fullscreen }) {
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
        <Section label="palette">
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
