// Construit le catalogue de chaînes à partir de l'API iptv-org et de playlists M3U complémentaires.
import { createHash } from 'node:crypto';
import { splitTitle } from './m3u.mjs';

const HTTP_RE = /^https?:\/\//i;
const DASH_RE = /\.mpd(\?|#|$)/i;
const RTMP_RE = /^rtmp|^rtsp|^udp|^rtp/i;

const shortHash = (s) => createHash('sha1').update(s).digest('base64url').slice(0, 10);

/** Choisit le meilleur logo d'une chaîne parmi ceux de logos.json. */
export function pickLogo(logos, mainFeed) {
  if (!logos?.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const l of logos) {
    if (!l?.url) continue;
    let s = 0;
    if (!l.feed) s += 3;
    else if (l.feed === mainFeed) s += 2;
    if (l.in_use !== false) s += 2;
    const fmt = String(l.format || '').toUpperCase();
    if (fmt === 'PNG' || fmt === 'SVG' || fmt === 'WEBP') s += 1;
    if ((l.width || 0) >= 256) s += 1;
    if (l.width && l.height) {
      const r = l.width / l.height;
      if (r >= 0.9 && r <= 2.6) s += 1;
    }
    if ((l.tags || []).some((t) => /picon/i.test(t))) s -= 1;
    if (s > bestScore) {
      bestScore = s;
      best = l.url;
    }
  }
  return best;
}

function normalizeUrl(u) {
  return String(u || '').trim();
}

/**
 * api: { channels, feeds, streams, logos, blocklist }
 * extra: entrées issues de parseM3U (playlists complémentaires, ex. fork ITAnt)
 * Retourne { channels: Map<id, channel>, streams: [{ channelId, url, ... }] }
 */
export function buildCandidates(api, extra = [], { log = () => {} } = {}) {
  const blocked = new Set((api.blocklist || []).map((b) => b.channel));
  const chById = new Map((api.channels || []).map((c) => [c.id, c]));
  const feedsBy = new Map();
  for (const f of api.feeds || []) {
    if (!feedsBy.has(f.channel)) feedsBy.set(f.channel, new Map());
    feedsBy.get(f.channel).set(f.id, f);
  }
  const logosBy = new Map();
  for (const l of api.logos || []) {
    if (!logosBy.has(l.channel)) logosBy.set(l.channel, []);
    logosBy.get(l.channel).push(l);
  }
  const categoryIds = new Set((api.categories || []).map((c) => c.id));

  const channels = new Map();
  const seenUrls = new Set();
  const skipped = { invalid: 0, headers: 0, dash: 0, nsfw: 0, duplicate: 0 };

  const ensureChannel = (id, fallback) => {
    if (channels.has(id)) return channels.get(id);
    const meta = chById.get(id);
    const feeds = feedsBy.get(id);
    const mainFeed = feeds ? [...feeds.values()].find((f) => f.is_main)?.id : null;
    const ch = meta
      ? {
          id,
          n: meta.name,
          a: meta.alt_names?.length ? meta.alt_names : undefined,
          l: pickLogo(logosBy.get(id), mainFeed) || fallback?.logo || undefined,
          c: meta.country || undefined,
          g: (meta.categories || []).filter((g) => g !== 'xxx'),
          w: meta.website || undefined,
          lg: new Set(),
          s: [],
        }
      : {
          id,
          n: fallback?.name || id,
          l: fallback?.logo || undefined,
          c: fallback?.country || undefined,
          g: fallback?.categories || [],
          lg: new Set(),
          s: [],
        };
    channels.set(id, ch);
    return ch;
  };

  const isBlockedChannel = (id) => {
    const meta = chById.get(id);
    if (blocked.has(id)) return true;
    if (meta && (meta.is_nsfw || (meta.categories || []).includes('xxx'))) return true;
    return false;
  };

  const add = ({ channelId, feedId, title, url, quality, labels, logo, country, categories, source }) => {
    url = normalizeUrl(url);
    if (!HTTP_RE.test(url) || RTMP_RE.test(url)) return void skipped.invalid++;
    if (DASH_RE.test(url)) return void skipped.dash++;
    if (seenUrls.has(url)) return void skipped.duplicate++;
    let id = channelId && chById.has(channelId) ? channelId : null;
    if (id && isBlockedChannel(id)) return void skipped.nsfw++;
    if (!id) {
      // Chaîne inconnue de la base : identifiant dérivé du tvg-id ou du titre.
      if (channelId && !blocked.has(channelId)) id = channelId;
      else id = 'x-' + shortHash((title || url).toLowerCase());
      if (categories?.includes('xxx')) return void skipped.nsfw++;
    }
    seenUrls.add(url);
    const ch = ensureChannel(id, { name: title, logo, country, categories });
    const feed = feedId ? feedsBy.get(id)?.get(feedId) : null;
    const langs = feed?.languages || [];
    langs.forEach((x) => ch.lg.add(x));
    ch.s.push({
      u: url,
      q: quality || undefined,
      f: feed?.name && feed.name !== 'SD' ? feed.name : undefined,
      lg: langs.length ? langs : undefined,
      n: labels?.some((l) => /24\/7/.test(l)) ? 1 : undefined,
      gb: labels?.some((l) => /geo/i.test(l)) ? 1 : undefined,
      main: feed?.is_main ? 1 : undefined,
      src: source,
    });
  };

  for (const s of api.streams || []) {
    if (s.user_agent || s.referrer) {
      skipped.headers++;
      continue;
    }
    const t = splitTitle(s.title || '');
    add({
      channelId: s.channel,
      feedId: s.feed,
      title: t.name,
      url: s.url,
      quality: s.quality || t.quality,
      labels: [...(s.labels || []), ...t.labels],
      source: 'iptv-org',
    });
  }

  for (const e of extra) {
    if (e.referrer || e.userAgent) {
      skipped.headers++;
      continue;
    }
    const tvg = e.attrs?.['tvg-id'] || '';
    const [cid, feedId] = tvg.split('@');
    const country = /\.([a-z]{2})$/i.exec(cid || '')?.[1]?.toUpperCase();
    const groups = String(e.attrs?.['group-title'] || '')
      .split(/[;,]/)
      .map((g) => g.trim().toLowerCase())
      .filter((g) => categoryIds.has(g));
    add({
      channelId: cid || null,
      feedId: feedId || null,
      title: e.name,
      url: e.url,
      quality: e.quality,
      labels: e.labels,
      logo: e.attrs?.['tvg-logo'] || undefined,
      country,
      categories: groups,
      source: 'extra',
    });
  }

  log(`Candidats : ${seenUrls.size} flux, ${channels.size} chaînes. Écartés : ${JSON.stringify(skipped)}`);
  return { channels, skipped };
}

const qualityRank = (q) => {
  const m = /^(\d{3,4})/.exec(q || '');
  return m ? Number(m[1]) : 0;
};

/**
 * Applique les résultats de vérification et produit la liste finale (chaînes avec au moins un flux vivant).
 * results: Map<url, { ok, restricted, https, cors, ms, height }> ; si null → pas de vérification (dev).
 */
export function finalize(channels, results) {
  const out = [];
  for (const ch of channels.values()) {
    const streams = [];
    for (const s of ch.s) {
      const r = results ? results.get(s.u) : null;
      if (results && !(r && (r.ok || r.restricted))) continue;
      const st = { ...s };
      delete st.src;
      if (r) {
        if (r.https) st.h = 1;
        if (r.ok && r.cors) st.x = 1;
        if (!r.ok && r.restricted) st.r = 1;
        if (r.ms) st.ms = Math.round(r.ms);
        if (!st.q && r.height) st.q = `${r.height}p`;
      } else if (s.u.startsWith('https:')) {
        st.h = 1;
      }
      streams.push(st);
    }
    if (!streams.length) continue;
    streams.sort(
      (a, b) =>
        (a.r ? 1 : 0) - (b.r ? 1 : 0) ||
        (b.h || 0) - (a.h || 0) ||
        (b.x || 0) - (a.x || 0) ||
        (b.main || 0) - (a.main || 0) ||
        (a.n || 0) - (b.n || 0) ||
        qualityRank(b.q) - qualityRank(a.q) ||
        (a.ms || 9e9) - (b.ms || 9e9),
    );
    const lg = [...ch.lg];
    // Allège le fichier : 8 sources max, langue par flux seulement si la chaîne en a plusieurs.
    const kept = streams.slice(0, 8).map((st) => {
      delete st.main;
      if (lg.length <= 1) delete st.lg;
      return st;
    });
    out.push({
      id: ch.id,
      n: ch.n,
      ...(ch.a ? { a: ch.a } : {}),
      ...(ch.l ? { l: ch.l } : {}),
      ...(ch.c ? { c: ch.c } : {}),
      g: ch.g,
      ...(lg.length ? { lg } : {}),
      ...(ch.w ? { w: ch.w } : {}),
      s: kept,
    });
  }
  out.sort((a, b) => a.n.localeCompare(b.n, 'fr', { sensitivity: 'base' }));
  return out;
}
