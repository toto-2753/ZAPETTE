/** Un flux tel que produit par scripts/update-data.mjs (clés courtes pour alléger le fichier). */
export interface Stream {
  /** URL du flux HLS */
  u: string;
  /** qualité annoncée, ex. « 1080p » */
  q?: string;
  /** nom de la version (feed), ex. « French », « English HD » */
  f?: string;
  /** langues de cette version (si la chaîne en a plusieurs) */
  lg?: string[];
  /** 1 = servi en https de bout en bout */
  h?: 1;
  /** 1 = en-têtes CORS présents (lisible par hls.js dans tous les navigateurs) */
  x?: 1;
  /** 1 = a répondu 401/403/451 au vérificateur (souvent un géo-blocage hors de France) */
  r?: 1;
  /** 1 = ne diffuse pas 24 h/24 */
  n?: 1;
  /** 1 = signalé géo-bloqué par iptv-org */
  gb?: 1;
  /** temps de réponse mesuré (ms) */
  ms?: number;
}

export interface Channel {
  id: string;
  /** nom */
  n: string;
  /** autres noms */
  a?: string[];
  /** logo */
  l?: string;
  /** pays (code iptv-org, ex. FR, UK) */
  c?: string;
  /** catégories iptv-org */
  g: string[];
  /** langues */
  lg?: string[];
  /** site officiel */
  w?: string;
  s: Stream[];
}

export interface CatalogStats {
  tested: number;
  alive: number;
  restricted: number;
  dead: number;
  cors: number;
  channels: number;
  streams: number;
  seconds: number;
}

export interface Catalog {
  v: number;
  generatedAt: string;
  checked: boolean;
  stats: CatalogStats;
  channels: Channel[];
}

/** Chaîne enrichie côté appareil. */
export interface LiveChannel extends Channel {
  /** numéro de chaîne (numérotation TNT pour la France) */
  num: number;
  score: number;
  /** flux jouables ici, dans l'ordre d'essai */
  play: PlayableStream[];
  /** clé de recherche normalisée */
  key: string;
}

export type PlayMode = 'hls' | 'native' | 'proxy' | 'external';

export interface PlayableStream extends Stream {
  mode: PlayMode;
}
