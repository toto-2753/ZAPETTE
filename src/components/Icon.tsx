// Jeu d'icônes maison (trait 1,8 px sur grille 24).
const PATHS: Record<string, string> = {
  home: 'M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z',
  tv: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM8 21h8M8.5 2.5 12 6l3.5-3.5',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  series: 'M7 3h10M5 6.5h14M4 10h16v10H4zM10 13v4l3.5-2z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z',
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  plus: 'M12 5v14M5 12h14',
  check: 'M4.5 12.5l5 5L19.5 7',
  back: 'M15 5l-7 7 7 7',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  volume: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  fullscreen: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  'fullscreen-exit': 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  pip: 'M3.5 5.5h17v13h-17zM12.5 12h6v4.5h-6z',
  cast: 'M3 17.5a3.5 3.5 0 0 1 3.5 3.5M3 13.5A7.5 7.5 0 0 1 10.5 21M3 9.5A11.5 11.5 0 0 1 14.5 21M7 4.5h12.5A1.5 1.5 0 0 1 21 6v12a1.5 1.5 0 0 1-1.5 1.5H17',
  airplay: 'M6.5 17H4.5A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-2M12 14.5l4.5 6h-9z',
  share: 'M12 3.5v12M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19h2M19 14h1',
  list: 'M8.5 6h12M8.5 12h12M8.5 18h12M4 6h.01M4 12h.01M4 18h.01',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.5h.01',
  close: 'M6 6l12 12M18 6 6 18',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5',
  download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5V5a.5.5 0 0 0-.5-.5H5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h3.5',
  layers: 'M12 3.5 21 8l-9 4.5L3 8zM3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5',
  sliders: 'M5 4v6M5 14v6M12 4v3M12 11v9M19 4v9M19 17v3M3 10h4M10 7h4M17 17h4',
  alert: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01',
  trailer: 'M4 5.5h16v13H4zM10 9.5v5l4.5-2.5z',
  signal: 'M5 19v-3M9.5 19v-6.5M14 19V9.5M18.5 19V5',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, filled = false, className }: { name: IconName; size?: number; filled?: boolean; className?: string }) {
  const solid = filled || name === 'play';
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={solid ? 1.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Marque Zapette : barres de mire + mot. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="Zapette">
      <span className="brand-bars" aria-hidden="true">
        <i style={{ background: 'var(--m-white)' }} />
        <i style={{ background: 'var(--m-yellow)' }} />
        <i style={{ background: 'var(--m-cyan)' }} />
        <i style={{ background: 'var(--m-green)' }} />
        <i style={{ background: 'var(--m-magenta)' }} />
        <i style={{ background: 'var(--m-red)' }} />
        <i style={{ background: 'var(--m-blue)' }} />
      </span>
      {!compact && <span className="brand-word">zapette</span>}
    </span>
  );
}
