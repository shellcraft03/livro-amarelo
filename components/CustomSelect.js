import { useState, useRef, useEffect } from 'react';

export default function CustomSelect({ value, onChange, options, disabled, dark }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const selected = options.find(o => String(o.value) === String(value));

  const bg     = dark ? '#111111' : '#FFFFFF';
  const bdr    = dark ? '#444444' : '#CCCCCC';
  const text   = dark ? '#EEEEEE' : '#000000';
  const listBg = dark ? '#1A1A1A' : '#FFFFFF';
  const hover  = dark ? '#2A2A2A' : '#F5F5F5';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          width: '100%',
          background: bg,
          border: `1px solid ${bdr}`,
          borderRadius: open ? '8px 8px 0 0' : '8px',
          padding: '10px 12px',
          color: disabled ? (dark ? '#555' : '#aaa') : text,
          fontSize: '0.9rem',
          cursor: disabled ? 'default' : 'pointer',
          outline: 'none',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? ''}
        </span>
        <span style={{ fontSize: '0.6rem', opacity: 0.5, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: listBg,
          border: `1px solid ${bdr}`,
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          zIndex: 200,
          maxHeight: '240px',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>
          {options.map(o => {
            const active = String(o.value) === String(value);
            return (
              <div
                key={o.value}
                onMouseDown={() => { onChange(o.value); setOpen(false); }}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: text,
                  fontSize: '0.9rem',
                  background: active ? hover : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = hover; }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? hover : 'transparent'; }}
              >
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
