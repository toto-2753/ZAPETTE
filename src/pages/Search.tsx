import { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { useCatalog } from '../data/catalog';
import { searchChannels } from '../data/scoring';
import { settingsStore } from '../lib/stores';
import { tmdb } from '../lib/tmdb';
import { navigate, usePageRoute } from '../router';
import { Grid } from '../components/Channel';
import { Icon } from '../components/Icon';
import { PosterRow } from '../components/Media';
import { EmptyState } from '../components/ui';

export default function Search() {
  const { visible, status } = useCatalog();
  const { tmdbKey } = settingsStore.use();
  const { params } = usePageRoute();
  const q = params.get('q') ?? '';
  const dq = useDeferredValue(q);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const results = useMemo(() => searchChannels(visible, dq), [visible, dq]);
  const tmdbQ = dq.trim().length >= 2 ? dq.trim() : '';

  return (
    <div className="page">
      <form className="search-box" role="search" onSubmit={(e) => e.preventDefault()}>
        <Icon name="search" />
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          placeholder="Une chaîne, un pays, un numéro, un film…"
          value={q}
          onChange={(e) => navigate(`/recherche?q=${encodeURIComponent(e.target.value)}`, { replace: true })}
          aria-label="Rechercher"
        />
      </form>
      {!q.trim() ? (
        <EmptyState icon="search" title="Que veux-tu regarder ?">
          <p>Tape le nom d’une chaîne (France 24, Arte…), un pays, une catégorie comme « sport », ou son numéro.</p>
        </EmptyState>
      ) : (
        <>
          {status === 'ready' && (
            <section className="search-section">
              <h2>
                Chaînes <span className="muted">{results.length}</span>
              </h2>
              {results.length ? <Grid items={results} /> : <p className="muted">Aucune chaîne ne correspond à « {q} ».</p>}
            </section>
          )}
          {tmdbKey && tmdbQ && (
            <div className="rows">
              <PosterRow title="Films et séries" loader={() => tmdb.search(tmdbQ)} deps={[tmdbQ]} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
