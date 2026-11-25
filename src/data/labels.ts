import categoriesFr from '../../shared/categories-fr.json';

const CATS = categoriesFr as Record<string, string>;

export const categoryLabel = (id: string) => CATS[id] ?? id;

/** Couleurs de la mire (barres de test TV) attribuées aux familles de catégories. */
const CATEGORY_TINT: Record<string, string> = {
  news: 'cyan',
  business: 'cyan',
  legislative: 'cyan',
  weather: 'cyan',
  movies: 'magenta',
  series: 'magenta',
  classic: 'magenta',
  comedy: 'magenta',
  sports: 'green',
  outdoor: 'green',
  auto: 'green',
  kids: 'yellow',
  animation: 'yellow',
  family: 'yellow',
  music: 'red',
  entertainment: 'red',
  lifestyle: 'red',
  cooking: 'red',
  documentary: 'blue',
  science: 'blue',
  education: 'blue',
  culture: 'blue',
  travel: 'blue',
};
export const categoryTint = (ids: string[]) => {
  for (const id of ids) if (CATEGORY_TINT[id]) return CATEGORY_TINT[id];
  return 'white';
};

// iptv-org utilise « UK » là où les normes utilisent « GB ».
const isoRegion = (code: string) => (code === 'UK' ? 'GB' : code);

let regionNames: Intl.DisplayNames | null = null;
let languageNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(['fr'], { type: 'region' });
  languageNames = new Intl.DisplayNames(['fr'], { type: 'language' });
} catch {
  /* navigateur ancien : on affichera les codes */
}

export function countryName(code?: string) {
  if (!code) return '';
  if (code === 'INT') return 'International';
  try {
    return regionNames?.of(isoRegion(code)) ?? code;
  } catch {
    return code;
  }
}

export function countryFlag(code?: string) {
  if (!code || code.length !== 2) return '';
  const c = isoRegion(code).toUpperCase();
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function languageName(code?: string) {
  if (!code) return '';
  try {
    const n = languageNames?.of(code) ?? code;
    return n.charAt(0).toUpperCase() + n.slice(1);
  } catch {
    return code;
  }
}

/** Langues proposées dans les réglages (codes ISO 639-3 utilisés par iptv-org). */
export const LANGUAGE_CHOICES = ['fra', 'eng', 'spa', 'por', 'ita', 'deu', 'ara', 'nld', 'tur', 'rus', 'pol', 'ron'];

/** Supprime accents et casse pour la recherche. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function qualityLabel(q?: string) {
  const h = Number(/^(\d{3,4})/.exec(q ?? '')?.[1] ?? 0);
  if (h >= 2000) return '4K';
  if (h >= 1080) return 'Full HD';
  if (h >= 720) return 'HD';
  if (h > 0) return 'SD';
  return '';
}

const rtf = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat('fr', { numeric: 'auto' }) : null;
export function timeAgo(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (!rtf) return new Date(iso).toLocaleString('fr-FR');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export const formatInt = (n: number) => n.toLocaleString('fr-FR');
