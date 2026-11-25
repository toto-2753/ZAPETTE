import { useEffect, useRef, useState } from 'react';
import { tmdb, tmdbImg, TmdbError, type MediaDetail, type MediaItem, type Provider } from '../lib/tmdb';
import { settingsStore } from '../lib/stores';
import { Icon } from './Icon';
import { Sheet, toast } from './ui';

const year = (d?: string) => (d ? d.slice(0, 4) : '');
const frDate = (d?: string) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** Charge une liste TMDB ; rend null tant qu'il n'y a pas de clé. */
export function useTmdbList(loader: () => Promise<MediaItem[]>, deps: unknown[] = []) {
  const { tmdbKey } = settingsStore.use();
  const [state, setState] = useState<{ items: MediaItem[]; error?: string; loading: boolean }>({ items: [], loading: true });
  useEffect(() => {
    if (!tmdbKey.trim()) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    loader()
      .then((items) => !cancelled && setState({ items, loading: false }))
      .catch((e: TmdbError) => !cancelled && setState({ items: [], loading: false, error: e.message }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKey, ...deps]);
  return tmdbKey.trim() ? state : null;
}

export function PosterRow({ title, loader, deps = [] }: { title: string; loader: () => Promise<MediaItem[]>; deps?: unknown[] }) {
  const data = useTmdbList(loader, deps);
  const track = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<MediaItem | null>(null);
  if (!data) return null;
  if (!data.loading && !data.items.length && !data.error) return null;
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="row row-posters">
      <header className="row-head">
        <h2>{title}</h2>
      </header>
      {data.error ? (
        <p className="row-error">
          {data.error}. <a href="#/reglages">Vérifier la clé TMDB</a>
        </p>
      ) : (
        <div className="row-body">
          <button type="button" className="row-nav prev" onClick={() => scroll(-1)} aria-label="Défiler vers la gauche" tabIndex={-1}>
            <Icon name="left" />
          </button>
          <div className="row-track" ref={track}>
            {data.loading
              ? Array.from({ length: 8 }, (_, i) => <span key={i} className="poster poster-skeleton" aria-hidden="true" />)
              : data.items.map((m) => <PosterCard key={`${m.type}-${m.id}`} item={m} onOpen={() => setOpen(m)} />)}
          </div>
          <button type="button" className="row-nav next" onClick={() => scroll(1)} aria-label="Défiler vers la droite" tabIndex={-1}>
            <Icon name="right" />
          </button>
        </div>
      )}
      {open && <MediaSheet item={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

export function PosterCard({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  return (
    <button type="button" className="poster" onClick={onOpen} aria-label={`${item.title}, détails`}>
      <img src={tmdbImg(item.poster, 'w342')} alt="" loading="lazy" decoding="async" />
      <span className="poster-title">{item.title}</span>
      <span className="poster-meta">
        {item.date && <span>{year(item.date)}</span>}
        {item.vote ? <span className="vote">★ {item.vote.toFixed(1)}</span> : null}
      </span>
    </button>
  );
}

function ProviderGroup({ label, list }: { label: string; list: Provider[] }) {
  if (!list.length) return null;
  return (
    <div className="prov-group">
      <h4>{label}</h4>
      <ul>
        {list.map((p) => (
          <li key={p.id}>
            {p.logo ? <img src={tmdbImg(p.logo, 'w92')} alt="" loading="lazy" /> : <span className="prov-ph" />}
            <span>{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MediaSheet({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [d, setD] = useState<MediaDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [trailer, setTrailer] = useState(false);
  useEffect(() => {
    tmdb
      .detail(item.type, item.id)
      .then(setD)
      .catch((e: Error) => setErr(e.message));
  }, [item]);
  const m = d ?? item;
  const p = d?.providers;
  const inCinema = item.type === 'movie' && item.date && Date.now() - new Date(item.date).getTime() < 75 * 86400_000 && Date.now() >= new Date(item.date).getTime();
  const anyProvider = p && (p.free.length || p.ads.length || p.flatrate.length || p.rent.length || p.buy.length);
  return (
    <Sheet title={m.title} onClose={onClose} wide>
      <div className="media">
        <div className="media-backdrop">
          {trailer && d?.trailer ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${d.trailer.key}?autoplay=1&rel=0`}
              title={`Bande-annonce : ${m.title}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <>
              {m.backdrop ? <img src={tmdbImg(m.backdrop, 'w1280')} alt="" /> : <span className="media-noimg" />}
              {d?.trailer && (
                <button type="button" className="btn btn-primary media-trailer" onClick={() => setTrailer(true)}>
                  <Icon name="trailer" size={20} /> Bande-annonce
                </button>
              )}
            </>
          )}
        </div>
        <div className="media-body">
          <p className="media-facts">
            <span>{item.type === 'movie' ? 'Film' : 'Série'}</span>
            {m.date && <span>{item.type === 'movie' ? frDate(m.date) : `Depuis ${year(m.date)}`}</span>}
            {d?.runtime ? <span>{item.type === 'movie' ? `${Math.floor(d.runtime / 60)} h ${String(d.runtime % 60).padStart(2, '0')}` : `${d.runtime} min / épisode`}</span> : null}
            {d?.seasons ? <span>{d.seasons} saison{d.seasons > 1 ? 's' : ''}</span> : null}
            {m.vote ? <span className="vote">★ {m.vote.toFixed(1)}</span> : null}
          </p>
          {d?.genres?.length ? <p className="media-genres">{d.genres.join(', ')}</p> : null}
          {d?.tagline && <p className="media-tagline">{d.tagline}</p>}
          <p className="media-overview">{m.overview || 'Pas encore de résumé en français.'}</p>
          {d?.cast?.length ? <p className="media-cast">Avec {d.cast.join(', ')}</p> : null}

          <h3 className="media-where">Où le regarder en France</h3>
          {err && <p className="muted">{err}</p>}
          {!d && !err && <p className="muted">Recherche des offres…</p>}
          {d && (
            <>
              {inCinema && <p className="media-cinema">Au cinéma en ce moment.</p>}
              {anyProvider ? (
                <div className="providers">
                  <ProviderGroup label="Gratuit" list={p!.free} />
                  <ProviderGroup label="Gratuit avec pub" list={p!.ads} />
                  <ProviderGroup label="Avec abonnement" list={p!.flatrate} />
                  <ProviderGroup label="Location" list={p!.rent} />
                  <ProviderGroup label="Achat" list={p!.buy} />
                </div>
              ) : (
                !inCinema && <p className="muted">Pas encore disponible en streaming en France.</p>
              )}
              {p?.link && (
                <a className="btn btn-ghost" href={p.link} target="_blank" rel="noreferrer">
                  <Icon name="external" size={18} /> Voir les offres sur JustWatch
                </a>
              )}
            </>
          )}
          <p className="attribution">Données TMDB. Disponibilités JustWatch.</p>
        </div>
      </div>
    </Sheet>
  );
}

/** Saisie de la clé TMDB, avec test immédiat. */
export function TmdbSetup({ compact = false }: { compact?: boolean }) {
  const settings = settingsStore.use();
  const [value, setValue] = useState(settings.tmdbKey);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const key = value.trim();
    if (!key) {
      settingsStore.set((s) => ({ ...s, tmdbKey: '' }));
      return;
    }
    setBusy(true);
    try {
      await tmdb.test(key);
      settingsStore.set((s) => ({ ...s, tmdbKey: key }));
      toast('Clé TMDB enregistrée : les nouveautés sont activées.');
    } catch (e) {
      toast((e as Error).message || 'Clé refusée');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={`tmdb-setup${compact ? ' compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {!compact && (
        <ol className="steps">
          <li>
            Crée un compte gratuit sur{' '}
            <a href="https://www.themoviedb.org/signup" target="_blank" rel="noreferrer">
              themoviedb.org
            </a>
            .
          </li>
          <li>
            Ouvre{' '}
            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
              Paramètres → API
            </a>{' '}
            et demande une clé (usage personnel).
          </li>
          <li>Colle la « clé d’API » ou le « jeton d’accès en lecture » ci-dessous.</li>
        </ol>
      )}
      <div className="field-row">
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Clé d’API TMDB"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Clé d’API TMDB"
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Test…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

/** Carte d'invitation affichée tant que TMDB n'est pas configuré. */
export function TmdbInvite() {
  const { tmdbKey } = settingsStore.use();
  if (tmdbKey.trim()) return null;
  return (
    <section className="invite">
      <div>
        <h2>Les sorties ciné et séries, et où les regarder</h2>
        <p>Ajoute une clé TMDB gratuite pour voir les films à l’affiche, les séries du moment, les bandes-annonces et les offres légales en France.</p>
      </div>
      <a className="btn btn-primary" href="#/nouveautes">
        <Icon name="sparkle" size={20} /> Activer les nouveautés
      </a>
    </section>
  );
}
