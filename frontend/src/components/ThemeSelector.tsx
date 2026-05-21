import { useRef, useState } from 'react';
import { useTheme, THEMES } from '../state/theme';

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.name === theme) ?? THEMES[0];

  const toggle = () => setOpen((v) => !v);
  const close = () => setOpen(false);

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <button
        type="button"
        aria-label="Select theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-xl hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <span
          className="h-3 w-3 rounded-full ring-1 ring-white/30"
          style={{ backgroundColor: current.swatch }}
        />
        <span>{current.label}</span>
        <svg
          className={`h-3 w-3 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Theme"
          className="absolute right-0 top-full z-50 mt-1.5 min-w-[9rem] overflow-hidden rounded-2xl border border-white/15 bg-black/60 py-1 shadow-xl backdrop-blur-2xl"
        >
          {THEMES.map((t) => (
            <li
              key={t.name}
              role="option"
              aria-selected={t.name === theme}
              tabIndex={0}
              onClick={() => {
                setTheme(t.name);
                close();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTheme(t.name);
                  close();
                }
              }}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-white/10 focus-visible:outline-none focus-visible:bg-white/10 ${
                t.name === theme ? 'text-white' : 'text-white/70'
              }`}
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/30"
                style={{ backgroundColor: t.swatch }}
              />
              <span>{t.label}</span>
              {t.name === theme && (
                <svg
                  className="ml-auto h-3 w-3 shrink-0 text-white/70"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    d="M2 6l3 3 5-5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
