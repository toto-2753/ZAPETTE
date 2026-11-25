import { useMemo } from 'react';
import { useCatalog } from '../data/catalog';
import { favoritesStore, historyStore } from '../lib/stores';
import { downloadText, toM3U } from '../lib/share';
import { Grid, Row } from '../components/Channel';
import { PageHead } from '../components/Layout';
import { Icon } from '../components/Icon';
import { EmptyState, toast } from '../components/ui';

export default function MyList() {
  const { byId } = useCatalog();
  const favs = favoritesStore.use();
  const hist = historyStore.use();
  const mine = useMemo(() => favs.map((id) => byId.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof byId.get>>[], [favs, byId]);
  const recent = useMemo(() => hist.map((h) => byId.get(h.id)).filter(Boolean) as NonNullable<ReturnType<typeof byId.get>>[], [hist, byId]);

  const exportM3U = () => {
    downloadText('zapette-ma-liste.m3u', toM3U(mine.map((ch) => ({ ch, stream: ch.play.find((s) => s.mode !== 'external') ?? ch.play[0] }))));
    toast('Playlist téléchargée : ouvre-la dans VLC ou ton app IPTV.');
  };

  return (
    <div className="page">
      <PageHead title="Ma liste">
        {mine.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={exportM3U}>
            <Icon name="download" size={18} /> Exporter en M3U
          </button>
        )}
      </PageHead>
      {mine.length ? (
        <Grid items={mine} />
      ) : (
        <EmptyState icon="star" title="Ta liste est vide">
          <p>Ajoute une chaîne avec le bouton « Ma liste » ou l’étoile du lecteur : elle apparaîtra ici et en haut de l’accueil.</p>
        </EmptyState>
      )}
      {recent.length > 0 && (
        <div className="rows rows-tight">
          <Row title="Regardées récemment" items={recent} />
          <button
            type="button"
            className="btn btn-text"
            onClick={() => {
              historyStore.set([]);
              toast('Historique effacé.');
            }}
          >
            Effacer l’historique
          </button>
        </div>
      )}
    </div>
  );
}
