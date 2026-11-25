import { settingsStore } from '../lib/stores';
import { tmdb } from '../lib/tmdb';
import { navigate, usePageRoute } from '../router';
import { PageHead } from '../components/Layout';
import { PosterRow, TmdbSetup } from '../components/Media';

export default function News() {
  const { tmdbKey } = settingsStore.use();
  const { params } = usePageRoute();
  const type = params.get('type') === 'tv' ? 'tv' : 'movie';

  if (!tmdbKey.trim()) {
    return (
      <div className="page page-narrow">
        <PageHead title="Nouveautés" />
        <div className="panel">
          <h2>Active les sorties ciné et séries</h2>
          <p>
            Zapette récupère les nouveautés sur TMDB, la grande base de données collaborative du cinéma, et t’indique où chaque film ou série est
            disponible légalement en France : gratuit, avec pub, abonnement ou location. Il faut une clé gratuite, à créer une fois.
          </p>
          <TmdbSetup />
        </div>
      </div>
    );
  }

  return (
    <div className="page page-flush">
      <PageHead title="Nouveautés">
        <div className="segmented" role="tablist" aria-label="Type">
          <button type="button" role="tab" aria-selected={type === 'movie'} onClick={() => navigate('/nouveautes', { replace: true })}>
            Films
          </button>
          <button type="button" role="tab" aria-selected={type === 'tv'} onClick={() => navigate('/nouveautes?type=tv', { replace: true })}>
            Séries
          </button>
        </div>
      </PageHead>
      <div className="rows">
        {type === 'movie' ? (
          <>
            <PosterRow title="À l’affiche en France" loader={tmdb.nowPlaying} />
            <PosterRow title="Bientôt au cinéma" loader={tmdb.upcoming} />
            <PosterRow title="Tendances de la semaine" loader={() => tmdb.trending('movie')} />
          </>
        ) : (
          <>
            <PosterRow title="Tendances de la semaine" loader={() => tmdb.trending('tv')} />
            <PosterRow title="Nouveaux épisodes cette semaine" loader={tmdb.onTheAir} />
            <PosterRow title="Les plus populaires" loader={tmdb.popularTv} />
          </>
        )}
      </div>
      <p className="attribution page-attr">Données films et séries : TMDB. Disponibilités en France : JustWatch.</p>
    </div>
  );
}
