import { useEffect, useState, type ReactNode } from 'react';
import { Brand, Icon, type IconName } from './Icon';
import { usePageRoute } from '../router';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Accueil', icon: 'home' },
  { to: '/chaines', label: 'Chaînes', icon: 'tv' },
  { to: '/films', label: 'Films', icon: 'film' },
  { to: '/series', label: 'Séries', icon: 'series' },
  { to: '/nouveautes', label: 'Nouveautés', icon: 'sparkle' },
];

const isActive = (path: string, to: string) => (to === '/' ? path === '/' : path.startsWith(to));

export function Layout({ children }: { children: ReactNode }) {
  const { path } = usePageRoute();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <div className="app">
      <a className="skip" href="#contenu" onClick={(e) => {
        e.preventDefault();
        document.getElementById('contenu')?.focus();
      }}>
        Aller au contenu
      </a>
      <header className={`topbar${scrolled ? ' is-scrolled' : ''}`}>
        <a href="#/" className="brand-link" aria-label="Zapette, accueil">
          <Brand />
        </a>
        <nav className="topnav" aria-label="Rubriques">
          {NAV.map((n) => (
            <a key={n.to} href={'#' + n.to} aria-current={isActive(path, n.to) ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="top-actions">
          <a href="#/recherche" className="icon-btn" aria-label="Rechercher" aria-current={path === '/recherche' ? 'page' : undefined}>
            <Icon name="search" />
          </a>
          <a href="#/ma-liste" className="icon-btn" aria-label="Ma liste" aria-current={path === '/ma-liste' ? 'page' : undefined}>
            <Icon name="star" />
          </a>
          <a href="#/reglages" className="icon-btn" aria-label="Réglages" aria-current={path === '/reglages' ? 'page' : undefined}>
            <Icon name="gear" />
          </a>
        </div>
      </header>
      <main id="contenu" tabIndex={-1}>
        {children}
      </main>
      <nav className="tabbar" aria-label="Rubriques">
        {NAV.map((n) => (
          <a key={n.to} href={'#' + n.to} aria-current={isActive(path, n.to) ? 'page' : undefined}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children}
    </div>
  );
}
