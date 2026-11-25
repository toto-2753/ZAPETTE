import { useMemo } from 'react';
import { useCatalog } from '../data/catalog';
import { byScore } from '../data/scoring';
import { languageName } from '../data/labels';
import { settingsStore } from '../lib/stores';
import { tmdb } from '../lib/tmdb';
import { Hero, pickHero } from '../components/Hero';
import { Row } from '../components/Channel';
import { PosterRow, TmdbInvite } from '../components/Media';
import { EmptyState } from '../components/ui';
import { LoadError, Skeleton } from './states';

/** Rubriques Films et Séries : chaînes thématiques vérifiées + nouveautés TMDB. */
export default function MediaPage({ kind }: { kind: 'movies' | 'series' }) {
  const { status, visible, error, reload } = useCatalog();
  const settings = settingsStore.use();
  const label = kind === 'movies' ? 'Films' : 'Séries';

  const channels = useMemo(() => visible.filter((c) => c.g.includes(kind)).sort(byScore), [visible, kind]);
  const hero = useMemo(() => pickHero(channels, (c) => c.lg?.includes(settings.lang) ?? c.c === settings.country), [channels, settings.lang, settings.country]);
  const groups = useMemo(() => {
    const mine = channels.filter((c) => c.lg?.includes(settings.lang) || c.c === settings.country);
    const counts = new Map<string, number>();
    for (const c of channels) for (const l of c.lg ?? []) if (l !== settings.lang) counts.set(l, (counts.get(l) ?? 0) + 1);
    const others = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([l]) => ({ id: l, title: `${label} en ${languageName(l).toLowerCase()}`, items: channels.filter((c) => c.lg?.includes(l)).slice(0, 30) }));
    const classics = kind === 'movies' ? channels.filter((c) => c.g.includes('classic')) : [];
    return { mine: mine.slice(0, 40), others, classics, all: channels.slice(0, 40) };
  }, [channels, settings.lang, settings.country, kind, label]);

  if (status === 'loading') return <Skeleton hero />;
  if (status === 'error') return <LoadError message={error} onRetry={reload} />;
  if (!channels.length)
    return (
      <EmptyState icon={kind === 'movies' ? 'film' : 'series'} title={`Aucune chaîne ${label.toLowerCase()} disponible ici`}>
        <p>Les chaînes reviennent dès que leurs liens répondent à nouveau.</p>
      </EmptyState>
    );

  return (
    <>
      {hero && <Hero ch={hero} list={channels} kicker={kind === 'movies' ? 'Ciné en direct' : 'Séries en direct'} />}
      <div className="rows">
        {groups.mine.length > 0 && <Row title={`Chaînes ${label.toLowerCase()} pour toi`} items={groups.mine} />}
        <TmdbInvite />
        {kind === 'movies' ? (
          <>
            <PosterRow title="À l’affiche en France" loader={tmdb.nowPlaying} />
            <PosterRow title="Films tendance cette semaine" loader={() => tmdb.trending('movie')} />
            <PosterRow title="Bientôt au cinéma" loader={tmdb.upcoming} />
          </>
        ) : (
          <>
            <PosterRow title="Séries tendance cette semaine" loader={() => tmdb.trending('tv')} />
            <PosterRow title="Nouveaux épisodes cette semaine" loader={tmdb.onTheAir} />
          </>
        )}
        {groups.classics.length > 0 && <Row title="Grands classiques" items={groups.classics} />}
        {groups.others.map((g) => (
          <Row key={g.id} title={g.title} items={g.items} />
        ))}
        <Row title={`Toutes les chaînes ${label.toLowerCase()}`} items={groups.all} more={`/chaines?pays=all&cat=${kind}`} />
      </div>
    </>
  );
}
