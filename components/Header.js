import { useState, useEffect, useRef } from 'react';

// Adicionar novas páginas aqui — o dropdown atualiza automaticamente
const PAGES = [
  { href: '/inicio', label: 'Início' },
  { href: '/sobre',  label: 'Sobre'  },
];

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2"    x2="12"    y2="6"/>
      <line x1="12" y1="18"   x2="12"    y2="22"/>
      <line x1="4.22" y1="4.22"  x2="7.05"  y2="7.05"/>
      <line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
      <line x1="2"  y1="12"   x2="6"     y2="12"/>
      <line x1="18" y1="12"   x2="22"    y2="12"/>
      <line x1="4.22" y1="19.78" x2="7.05"  y2="16.95"/>
      <line x1="16.95" y1="7.05"  x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

export default function Header({ currentPage, dark, toggleDark, onCurrentPageClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel = PAGES.find(p => p.href === `/${currentPage}`)?.label ?? currentPage;
  const s = getStyles(dark);

  return (
    <header style={s.header}>
      <div style={s.headerInner}>
        <a href="/" style={s.headerLogo}>
          <img src="/cover.png" alt="" style={s.headerThumb} />
          <div>
            <div style={s.headerTitle}>O Livro Amarelo</div>
            <div style={s.headerSub}>O Futuro é Glorioso</div>
          </div>
        </a>
        <nav style={s.nav}>
          <button onClick={toggleDark} style={s.darkToggle} title={dark ? 'Modo claro' : 'Modo escuro'}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(o => !o)} style={s.navDropdownBtn}>
              {currentLabel} <ChevronIcon open={menuOpen} />
            </button>
            {menuOpen && (
              <div style={s.navDropdown}>
                {PAGES.map(page => {
                  const isActive = page.href === `/${currentPage}`;
                  return (
                    <a
                      key={page.href}
                      href={page.href}
                      style={isActive ? s.navDropdownItemActive : s.navDropdownItem}
                      onClick={isActive
                        ? e => { e.preventDefault(); setMenuOpen(false); onCurrentPageClick?.(); }
                        : () => setMenuOpen(false)
                      }
                    >
                      {page.label}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function getStyles(dark) {
  const headerBg  = dark ? '#1A1A1A' : '#FFFFFF';
  const text1     = dark ? '#EEEEEE' : '#000000';
  const textMuted = dark ? '#888888' : '#666666';

  return {
    header: {
      background: headerBg,
      borderBottom: '3px solid #FCBF22',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    },
    headerInner: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLogo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      textDecoration: 'none',
    },
    headerThumb: {
      width: '36px',
      height: '36px',
      objectFit: 'cover',
      borderRadius: '4px',
      background: '#FCBF22',
    },
    headerTitle: {
      color: text1,
      fontSize: '1rem',
      fontWeight: 900,
      letterSpacing: '-0.03em',
    },
    headerSub: {
      color: textMuted,
      fontSize: '0.68rem',
      fontWeight: 500,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      marginTop: '1px',
    },
    nav: {
      display: 'flex',
      gap: '20px',
      alignItems: 'center',
    },
    darkToggle: {
      background: dark ? '#2A2A2A' : '#F0F0F0',
      border: 'none',
      cursor: 'pointer',
      color: dark ? '#FCBF22' : '#888888',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      padding: 0,
      flexShrink: 0,
    },
    navDropdownBtn: {
      background: 'none',
      border: `1px solid ${dark ? '#444444' : '#DDDDDD'}`,
      borderRadius: '8px',
      padding: '6px 10px 6px 12px',
      cursor: 'pointer',
      color: text1,
      fontSize: '0.9rem',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    navDropdown: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      right: 0,
      background: headerBg,
      border: `1px solid ${dark ? '#444444' : '#DDDDDD'}`,
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.08)',
      minWidth: '130px',
      zIndex: 200,
    },
    navDropdownItem: {
      display: 'block',
      padding: '10px 16px',
      color: textMuted,
      textDecoration: 'none',
      fontSize: '0.9rem',
      fontWeight: 500,
    },
    navDropdownItemActive: {
      display: 'block',
      padding: '10px 16px 10px 13px',
      color: text1,
      textDecoration: 'none',
      fontSize: '0.9rem',
      fontWeight: 700,
      background: dark ? '#252525' : '#F8F8F8',
      borderLeft: '3px solid #FCBF22',
    },
  };
}
