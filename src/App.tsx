import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { CatalogProvider, useCatalog } from './data/catalog';
import { PageRouteContext, useRoute, type Route } from './router';
import { Layout } from './components/Layout';
import { Toasts, EmptyState } from './components/ui';
import Home from './pages/Home';
import Channels from './pages/Channels';
import MediaPage from './pages/Media';
import News from './pages/News';
import Search from './pages/Search';
import MyList from './pages/MyList';
import Settings from './pages/Settings';
import Lock from './pages/Lock';

const Player = lazy(() => import('./pages/Player'));

const TITLES: Record<string, string> = {
  chaines: 'Chaînes',
  films: 'Films',
  series: 'Séries',
  nouveautes: 'Nouveautés',
  recherche: 'Recherche',
  'ma-liste': 'Ma liste',
  reglages: 'Réglages',
};

function page(route: Route): ReactNode {
  switch (route.parts[0]) {
    case undefined:
      return <Home />;
    case 'chaines':
      return <Channels />;
    case 'films':
      return <MediaPage key="movies" kind="movies" />;
    case 'series':
      return <MediaPage key="series" kind="series" />;
    case 'nouveautes':
      return <News />;
    case 'recherche':
      return <Search />;
    case 'ma-liste':
      return <MyList />;
    case 'reglages':
      return <Settings />;
    default:
      return (
        <EmptyState icon="tv" title="Cette page n’existe pas">
          <a className="btn btn-primary" href="#/">
            Retour à l’accueil
          </a>
        </EmptyState>
      );
  }
}

function Shell() {
  const { status } = useCatalog();
  if (status === 'locked') return <Lock />;
  return <Pages />;
}

function Pages() {
  const route = useRoute();
  const { byId } = useCatalog();
  const watchingId = route.parts[0] === 'regarder' ? route.parts[1] : undefined;
  // La page d'où l'on vient reste montée sous le lecteur : retour instantané, défilement conservé.
  const lastPage = useRef<Route>(watchingId ? { path: '/', parts: [], params: new URLSearchParams() } : route);
  if (!watchingId) lastPage.current = route;
  const bg = lastPage.current;

  useEffect(() => {
    const html = document.documentElement;
    if (watchingId) html.classList.add('is-watching');
    else html.classList.remove('is-watching');
  }, [watchingId]);

  useEffect(() => {
    const ch = watchingId ? byId.get(watchingId) : undefined;
    const t = watchingId ? ch?.n : TITLES[bg.parts[0] ?? ''];
    document.title = t ? `${t} — Zapette` : 'Zapette — la télé gratuite';
  }, [watchingId, byId, bg]);

  // Remonte en haut quand on change de page (pas quand on ferme le lecteur).
  const prevPath = useRef(bg.path);
  useEffect(() => {
    if (prevPath.current !== bg.path) window.scrollTo({ top: 0 });
    prevPath.current = bg.path;
  }, [bg.path]);

  return (
    <>
      <PageRouteContext.Provider value={bg}>
        <div className="page-layer" inert={Boolean(watchingId)} aria-hidden={watchingId ? true : undefined}>
          <Layout>{page(bg)}</Layout>
        </div>
      </PageRouteContext.Provider>
      {watchingId && (
        <Suspense fallback={<div className="player" />}>
          <Player id={watchingId} />
        </Suspense>
      )}
    </>
  );
}

export function App() {
  return (
    <CatalogProvider>
      <Shell />
      <Toasts />
    </CatalogProvider>
  );
}
