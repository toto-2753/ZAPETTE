// Nouveautés films et séries via l'API TMDB (clé gratuite à saisir dans les réglages).
// Les disponibilités « où regarder » viennent de JustWatch, via TMDB.
import { settingsStore } from './stores';

const API = 'https://api.themoviedb.org/3';
const TTL = 6 * 3600 * 1000;

export const tmdbImg = (path: string | null | undefined, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : '');

export type MediaType = 'movie' | 'tv';

export interface MediaItem {
  id: number;
  type: MediaType;
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  date?: string;
  overview?: string;
  vote?: number;
}

export interface Provider {
  id: number;
  name: string;
  logo: string | null;
}

export interface WatchProviders {
  link?: string;
  free: Provider[];
  ads: Provider[];
  flatrate: Provider[];
  rent: Provider[];
  buy: Provider[];
}

export interface MediaDetail extends MediaItem {
  genres: string[];
  runtime?: number;
  seasons?: number;
  tagline?: string;
  trailer?: { key: string; name: string };
  providers: WatchProviders | null;
  cast: string[];
  homepage?: string;
}

export class TmdbError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const memory = new Map<string, { at: number; data: unknown }>();

/* eslint-disable @typescript-eslint/no-explicit-any */
async function call<T = any>(path: string, params: Record<string, string> = {}, keyOverride?: string): Promise<T> {
  const key = (keyOverride ?? settingsStore.get().tmdbKey).trim();
  if (!key) throw new TmdbError('Aucune clé TMDB', 0);
  const url = new URL(API + path);
  if (path !== '/configuration') url.searchParams.set('language', 'fr-FR');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const cacheKey = `${key.slice(-6)}:${url.pathname}?${url.searchParams}`;
  const hit = memory.get(cacheKey) ?? readSession(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;

  const headers: Record<string, string> = { accept: 'application/json' };
  // Jeton v4 (commence par « eyJ ») ou clé v3 classique.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);
  let r: Response;
  try {
    r = await fetch(url, { headers });
  } catch {
    throw new TmdbError('TMDB injoignable (connexion ?)', -1);
  }
  if (!r.ok) throw new TmdbError(r.status === 401 ? 'Clé TMDB refusée' : `TMDB a répondu ${r.status}`, r.status);
  const data = (await r.json()) as T;
  const entry = { at: Date.now(), data };
  memory.set(cacheKey, entry);
  writeSession(cacheKey, entry);
  return data;
}

function readSession(k: string) {
  try {
    const raw = sessionStorage.getItem('zp.tmdb.' + k);
    return raw ? (JSON.parse(raw) as { at: number; data: unknown }) : undefined;
  } catch {
    return undefined;
  }
}
function writeSession(k: string, v: unknown) {
  try {
    sessionStorage.setItem('zp.tmdb.' + k, JSON.stringify(v));
  } catch {
    /* plein : tant pis */
  }
}

export const mapItem = (x: any, type?: MediaType): MediaItem => ({
  id: x.id,
  type: (type ?? x.media_type) as MediaType,
  title: x.title ?? x.name ?? '',
  poster: x.poster_path,
  backdrop: x.backdrop_path,
  date: x.release_date ?? x.first_air_date,
  overview: x.overview,
  vote: x.vote_average,
});

const list = (type: MediaType) => (r: any) => ((r?.results ?? []) as any[]).map((x) => mapItem(x, type)).filter((x) => x.poster);

const providerList = (arr: any[] | undefined): Provider[] =>
  (arr ?? [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));

export function pickTrailer(videos: any[] | undefined) {
  const yt = (videos ?? []).filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  yt.sort(
    (a, b) =>
      (a.iso_639_1 === 'fr' ? 0 : 1) - (b.iso_639_1 === 'fr' ? 0 : 1) ||
      (a.type === 'Trailer' ? 0 : 1) - (b.type === 'Trailer' ? 0 : 1) ||
      (b.official ? 1 : 0) - (a.official ? 1 : 0),
  );
  return yt[0] ? { key: yt[0].key as string, name: yt[0].name as string } : undefined;
}

export function mapDetail(d: any, type: MediaType): MediaDetail {
  const fr = d?.['watch/providers']?.results?.FR;
  return {
    ...mapItem(d, type),
    genres: (d.genres ?? []).map((g: any) => g.name),
    runtime: d.runtime || (d.episode_run_time?.[0] ?? undefined),
    seasons: d.number_of_seasons,
    tagline: d.tagline || undefined,
    trailer: pickTrailer(d.videos?.results),
    providers: fr
      ? {
          link: fr.link,
          free: providerList(fr.free),
          ads: providerList(fr.ads),
          flatrate: providerList(fr.flatrate),
          rent: providerList(fr.rent),
          buy: providerList(fr.buy),
        }
      : null,
    cast: (d.credits?.cast ?? []).slice(0, 6).map((c: any) => c.name),
    homepage: d.homepage || undefined,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

export const tmdb = {
  test: (key: string) => call('/configuration', {}, key),
  nowPlaying: () => call('/movie/now_playing', { region: 'FR' }).then(list('movie')),
  upcoming: () =>
    call('/movie/upcoming', { region: 'FR' })
      .then(list('movie'))
      .then((l) => l.filter((x) => !x.date || x.date >= today()).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))),
  trending: (type: MediaType) => call(`/trending/${type}/week`).then(list(type)),
  onTheAir: () => call('/tv/on_the_air', { timezone: 'Europe/Paris' }).then(list('tv')),
  popularTv: () => call('/tv/popular').then(list('tv')),
  search: (q: string) =>
    call('/search/multi', { query: q, include_adult: 'false' }).then((r) =>
      ((r?.results ?? []) as any[]).filter((x) => (x.media_type === 'movie' || x.media_type === 'tv') && x.poster_path).map((x) => mapItem(x)),
    ),
  detail: (type: MediaType, id: number) =>
    call(`/${type}/${id}`, { append_to_response: 'videos,watch/providers,credits', include_video_language: 'fr,en,null' }).then((d) =>
      mapDetail(d, type),
    ),
};
