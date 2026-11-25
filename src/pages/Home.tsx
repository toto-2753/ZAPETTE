import { useMemo } from 'react';
import { useCatalog } from '../data/catalog';
import { homeRows } from '../data/scoring';
import { favoritesStore, historyStore, settingsStore } from '../lib/stores';
import { tmdb } from '../lib/tmdb';
import { formatInt, timeAgo } from '../data/labels';
import { Hero, pickHero } from '../components/Hero';
import { Row } from '../components/Channel';
import { PosterRow, TmdbInvite } from '../components/Media';
import { LoadError, Skeleton } from './states';

export default function Home() {
  const { status, visible, byId, catalog, error, reload } = useCatalog();
  const settings = settingsStore.use();
  const favs = favoritesStore.use();
  const hist = historyStore.use();

  const visibleIds = useMemo(() => new Set(visible.map((c) => c.id)), [visible]);
  const rows = useMemo(() => homeRows(visible, settings.country, settings.lang), [visible, settings.country, settings.lang]);
  const hero = useMemo(
    () => pickHero(visible, (c) => c.c === settings.country && c.g.some((g) => ['general', 'news', 'entertainment', 'movies'].includes(g))),
    [visible, settings.country],
  );
  const resume = useMemo(() => hist.map((h) => byId.get(h.id)).filter((c) => c && visibleIds.has(c.id)) as typeof visible, [hist, byId, visibleIds]);
  const mine = useMemo(() => favs.map((id) => byId.get(id)).filter((c) => c && visibleIds.has(c.id)) as typeof visible, [favs, byId, visibleIds]);

  if (status === 'loading') return <Skeleton hero />;
  if (status === 'error') return <LoadError message={error} onRetry={reload} />;

  return (
    <>
      {hero && <Hero ch={hero} list={rows[0]?.items ?? visible} />}
      <div className="rows">
        {resume.length > 0 && <Row title="Reprendre" items={resume} />}
        {mine.length > 0 && <Row title="Ma liste" items={mine} more="/ma-liste" />}
        {rows.slice(0, 2).map((r) => (
          <Row key={r.id} title={r.title} items={r.items} more={r.more} />
        ))}
        <TmdbInvite />
        <PosterRow title="Au cinéma en ce moment" loader={tmdb.nowPlaying} />
        {rows.slice(2, 4).map((r) => (
          <Row key={r.id} title={r.title} items={r.items} more={r.more} />
        ))}
        <PosterRow title="Séries du moment" loader={() => tmdb.trending('tv')} />
        {rows.slice(4).map((r) => (
          <Row key={r.id} title={r.title} items={r.items} more={r.more} />
        ))}
      </div>
      {catalog && (
        <footer className="catalog-foot">
          {catalog.checked ? (
            <p>
              Liste vérifiée {timeAgo(catalog.generatedAt)} : {formatInt(catalog.stats.channels)} chaînes en ligne,{' '}
              {formatInt(catalog.stats.dead)} liens morts écartés. Les chaînes qui tombent entre deux vérifications sont masquées
              automatiquement.
            </p>
          ) : (
            <p>Liste de développement non vérifiée : lance la vérification pour écarter les liens morts.</p>
          )}
          <p>
            Chaînes publiques recensées par <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer">iptv-org</a>.
          </p>
        </footer>
      )}
    </>
  );
}
