import type { Catalog, Channel, LiveChannel, PlayableStream, PlayMode, Stream } from './types';
import { categoryLabel, countryName, normalize } from './labels';
import { isDead } from '../lib/stores';

export interface Env {
  preferNative: boolean;
  nativeHls: boolean;
  mse: boolean;
  pageHttp: boolean;
  proxy: boolean;
  /** catalogue vérifié par la CI (sinon les drapeaux CORS sont inconnus) */
  checked: boolean;
}

/** Numérotation TNT (Arcom, en vigueur depuis le 6 juin 2025). */
export const TNT: Record<string, number> = {
  'TF1.fr': 1,
  'France2.fr': 2,
  'France3.fr': 3,
  'France4.fr': 4,
  'France5.fr': 5,
  'M6.fr': 6,
  'arte.fr': 7,
  'LCP.fr': 8,
  'W9.fr': 9,
  'TMC.fr': 10,
  'TFX.fr': 11,
  'Gulli.fr': 12,
  'BFMTV.fr': 13,
  'CNews.fr': 14,
  'LCI.fr': 15,
  'Franceinfo.fr': 16,
  'CStar.fr': 17,
  'T18.fr': 18,
  'NOVO19.fr': 19,
  'TF1SeriesFilms.fr': 20,
  'LEquipe.fr': 21,
  '6ter.fr': 22,
  'RMCStory.fr': 23,
  'RMCDecouverte.fr': 24,
  'RMCLife.fr': 25,
};

export function playMode(s: Stream, env: Env): PlayMode {
  // Une page https ne peut pas charger un flux http (contenu mixte).
  const secureOk = s.h === 1 || env.pageHttp;
  if (!secureOk) return env.proxy ? 'proxy' : 'external';
  if (env.preferNative) return 'native';
  const corsOk = s.x === 1 || !env.checked;
  if (env.mse && corsOk) return 'hls';
  if (env.nativeHls) return 'native';
  if (env.proxy && env.mse) return 'proxy';
  return 'external';
}

const MODE_RANK: Record<PlayMode, number> = { hls: 0, native: 0, proxy: 1, external: 3 };

export const qualityHeight = (q?: string) => Number(/^(\d{3,4})/.exec(q ?? '')?.[1] ?? 0);

/** Ordonne les sources d'une chaîne : jouables ici, dans la bonne langue, non bloquées, en premier. */
export function orderStreams(ch: Channel, env: Env, lang: string, dead: Record<string, number>): PlayableStream[] {
  const multiLang = (ch.lg?.length ?? 0) > 1;
  const ranked = ch.s.map((s, i) => {
    const mode = playMode(s, env);
    let rank = MODE_RANK[mode] * 10;
    if (isDead(dead, s.u)) rank += 50;
    if (s.r) rank += 2;
    if (multiLang && s.lg && !s.lg.includes(lang)) rank += 3;
    return { s: { ...s, mode }, rank, i };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return ranked.map((r) => r.s);
}

export function scoreChannel(ch: Channel, play: PlayableStream[], country: string, lang: string) {
  let s = 0;
  if (ch.l) s += 3;
  if (ch.c === country) s += 4;
  if (ch.lg?.includes(lang)) s += 3;
  const best = play[0];
  if (best) {
    if (best.mode === 'hls' || best.mode === 'native') s += 2;
    if (!best.r) s += 1;
    if (!best.n) s += 1;
    const h = qualityHeight(best.q);
    if (h >= 720) s += 1;
    if (h >= 1080) s += 0.5;
  }
  if (ch.g.includes('general')) s += 1;
  if (ch.w) s += 0.5;
  if (ch.s.length > 1) s += 0.5;
  if (ch.id.startsWith('x-')) s -= 5;
  if (country === 'FR' && TNT[ch.id]) s += 10;
  return s;
}

/** Enrichit le catalogue pour cet appareil : sources jouables, score, numéro, clé de recherche. */
export function buildLive(catalog: Catalog, env: Env, country: string, lang: string, dead: Record<string, number>): LiveChannel[] {
  const all: LiveChannel[] = catalog.channels.map((ch) => {
    const play = orderStreams(ch, env, lang, dead);
    return {
      ...ch,
      play,
      score: scoreChannel(ch, play, country, lang),
      num: 0,
      key: '',
    };
  });
  // Numéros stables pour un catalogue donné (indépendants de ce que l'appareil peut lire).
  const used = new Set<number>();
  if (country === 'FR') {
    for (const ch of all) {
      const n = TNT[ch.id];
      if (n) {
        ch.num = n;
        used.add(n);
      }
    }
  }
  let next = country === 'FR' ? 30 : 1;
  const rest = all.filter((c) => !c.num).sort((a, b) => b.score - a.score || a.n.localeCompare(b.n, 'fr'));
  for (const ch of rest) {
    while (used.has(next)) next++;
    ch.num = next++;
  }
  for (const ch of all) {
    ch.key = normalize([ch.n, ...(ch.a ?? []), countryName(ch.c), ...ch.g.map(categoryLabel), String(ch.num)].join(' '));
  }
  all.sort((a, b) => a.num - b.num);
  return all;
}

/** Une chaîne est montrée si au moins une source peut se lire ici et n'est pas morte. */
export function isWatchable(ch: LiveChannel, dead: Record<string, number>, showExternal: boolean) {
  return ch.play.some((s) => !isDead(dead, s.u) && (s.mode !== 'external' || showExternal));
}

export const byScore = (a: LiveChannel, b: LiveChannel) => b.score - a.score || a.num - b.num;

export function pick(list: LiveChannel[], pred: (c: LiveChannel) => boolean, limit = 30) {
  return list.filter(pred).sort(byScore).slice(0, limit);
}

export interface RowDef {
  id: string;
  title: string;
  items: LiveChannel[];
  /** lien « Tout voir » */
  more?: string;
}

const has = (ch: LiveChannel, ...cats: string[]) => cats.some((c) => ch.g.includes(c));

export function homeRows(list: LiveChannel[], country: string, lang: string): RowDef[] {
  const local = (c: LiveChannel) => c.c === country || (c.lg?.includes(lang) ?? false);
  const rows: RowDef[] = [];
  if (country === 'FR') {
    rows.push({
      id: 'tnt',
      title: 'La TNT',
      items: list.filter((c) => c.num <= 25).sort((a, b) => a.num - b.num),
      more: '/chaines?pays=FR',
    });
  } else {
    rows.push({ id: 'local', title: `Chaînes : ${countryName(country)}`, items: pick(list, (c) => c.c === country), more: `/chaines?pays=${country}` });
  }
  rows.push({ id: 'news', title: 'Info en continu', items: pick(list, (c) => has(c, 'news') && local(c)), more: '/chaines?cat=news' });
  rows.push({ id: 'movies', title: 'Films', items: pick(list, (c) => has(c, 'movies')), more: '/films' });
  rows.push({ id: 'series', title: 'Séries', items: pick(list, (c) => has(c, 'series')), more: '/series' });
  rows.push({ id: 'sports', title: 'Sport', items: pick(list, (c) => has(c, 'sports')), more: '/chaines?cat=sports' });
  rows.push({ id: 'kids', title: 'Enfants', items: pick(list, (c) => has(c, 'kids', 'animation')), more: '/chaines?cat=kids' });
  rows.push({
    id: 'docs',
    title: 'Documentaires et découverte',
    items: pick(list, (c) => has(c, 'documentary', 'science', 'travel', 'outdoor')),
    more: '/chaines?cat=documentary',
  });
  rows.push({ id: 'music', title: 'Musique', items: pick(list, (c) => has(c, 'music')), more: '/chaines?cat=music' });
  if (country === 'FR') {
    rows.push({
      id: 'fr-more',
      title: 'Régions et autres chaînes françaises',
      items: pick(list, (c) => c.c === 'FR' && c.num > 25),
      more: '/chaines?pays=FR',
    });
  }
  rows.push({
    id: 'world',
    title: 'Autour du monde',
    items: pick(list, (c) => c.c !== country && !!c.l && has(c, 'general', 'news', 'entertainment')),
    more: '/chaines?pays=all',
  });
  return rows.filter((r) => r.items.length > 0);
}

export function searchChannels(list: LiveChannel[], query: string, limit = 120) {
  const q = normalize(query);
  if (!q) return [];
  const terms = q.split(' ');
  const out: { r: number; ch: LiveChannel }[] = [];
  for (const ch of list) {
    if (!terms.every((t) => ch.key.includes(t))) continue;
    const name = normalize(ch.n);
    let r = ch.score;
    if (String(ch.num) === q) r += 100;
    if (name === q) r += 40;
    else if (name.startsWith(q)) r += 20;
    else if (name.includes(q)) r += 10;
    out.push({ r, ch });
  }
  out.sort((a, b) => b.r - a.r);
  return out.slice(0, limit).map((x) => x.ch);
}
