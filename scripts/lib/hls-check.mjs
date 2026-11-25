// Vérifie qu'un flux HLS est vraiment vivant : manifeste → variante → segment vidéo.
// Relève au passage https, CORS (lisible par hls.js dans un navigateur), latence et résolution.

const RESTRICTED = new Set([401, 403, 451]);
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export class CheckError extends Error {
  constructor(reason, { restricted = false } = {}) {
    super(reason);
    this.reason = reason;
    this.restricted = restricted;
  }
}

/** Récupère les variantes d'un manifeste maître. */
export function parseMaster(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
    const bw = /BANDWIDTH=(\d+)/i.exec(line);
    const res = /RESOLUTION=(\d+)x(\d+)/i.exec(line);
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith('#'))) j++;
    if (j >= lines.length) break;
    variants.push({
      uri: new URL(lines[j].trim(), baseUrl).href,
      bandwidth: bw ? Number(bw[1]) : 0,
      height: res ? Number(res[2]) : null,
    });
    i = j;
  }
  return variants;
}

/** Récupère les segments d'une playlist média. */
export function parseMedia(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const segments = [];
  let drm = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-KEY') || line.startsWith('#EXT-X-SESSION-KEY')) {
      const method = /METHOD=([A-Z0-9-]+)/i.exec(line)?.[1]?.toUpperCase();
      const format = /KEYFORMAT="([^"]+)"/i.exec(line)?.[1] || '';
      // AES-128 est lisible par hls.js ; SAMPLE-AES / FairPlay / Widevine = DRM.
      if ((method && method !== 'NONE' && method !== 'AES-128') || /widevine|playready|streamingkeydelivery/i.test(format)) {
        drm = true;
      }
    }
    if (!line.startsWith('#EXTINF')) continue;
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith('#'))) j++;
    if (j >= lines.length) break;
    segments.push(new URL(lines[j].trim(), baseUrl).href);
    i = j;
  }
  return { segments, drm };
}

function corsOk(headers, origin) {
  const v = headers.get('access-control-allow-origin');
  if (!v) return false;
  return v.trim() === '*' || v.trim() === origin;
}

async function request(url, { timeout, origin, userAgent, fetchImpl, range, readBody }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { 'User-Agent': userAgent, Origin: origin, Accept: '*/*' };
    if (range) headers.Range = 'bytes=0-4095';
    const res = await fetchImpl(url, { headers, redirect: 'follow', signal: ctrl.signal });
    let text = '';
    if (readBody && res.ok) {
      text = await readLimited(res, 2_000_000);
    } else {
      try {
        await res.body?.cancel();
      } catch {
        /* rien */
      }
    }
    return { status: res.status, headers: res.headers, url: res.url || url, text };
  } catch (e) {
    if (e?.name === 'AbortError') throw new CheckError('timeout');
    const code = e?.cause?.code || e?.code || e?.message || 'network';
    throw new CheckError(String(code));
  } finally {
    clearTimeout(timer);
  }
}

// Lit au plus `max` octets (un « manifeste » qui est en fait une vidéo ne doit pas tout télécharger).
async function readLimited(res, max) {
  if (!res.body?.getReader) return (await res.text()).slice(0, max);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= max) {
      try {
        await reader.cancel();
      } catch {
        /* rien */
      }
      break;
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

function assertStatus(r, what) {
  if (RESTRICTED.has(r.status)) throw new CheckError(`${what} http ${r.status}`, { restricted: true });
  if (r.status >= 400) throw new CheckError(`${what} http ${r.status}`);
}

function assertPlaylist(r, what) {
  const head = r.text.replace(/^﻿/, '').trimStart();
  if (head.startsWith('#EXTM3U')) return;
  if (/^<\?xml|^<MPD/i.test(head)) throw new CheckError('dash-unsupported');
  throw new CheckError(`${what} not-hls`);
}

/**
 * Teste un flux. Ne lève jamais : retourne un résultat.
 * { ok, restricted, https, cors, ms, height, reason }
 */
export async function checkStream(url, opts = {}) {
  const o = {
    timeout: opts.timeout ?? 10_000,
    origin: opts.origin ?? 'https://zapette.app',
    userAgent: opts.userAgent ?? DEFAULT_UA,
    fetchImpl: opts.fetchImpl ?? globalThis.fetch,
  };
  const t0 = Date.now();
  const out = { ok: false, restricted: false, https: true, cors: true, ms: 0, height: null, reason: '' };
  const track = (r) => {
    out.cors = out.cors && corsOk(r.headers, o.origin);
    out.https = out.https && r.url.startsWith('https:');
  };
  try {
    const m = await request(url, { ...o, readBody: true });
    assertStatus(m, 'manifest');
    assertPlaylist(m, 'manifest');
    track(m);
    out.ms = Date.now() - t0;

    let playlist = m.text;
    let base = m.url;
    for (let depth = 0; depth < 2 && /#EXT-X-STREAM-INF/i.test(playlist); depth++) {
      const variants = parseMaster(playlist, base);
      if (!variants.length) throw new CheckError('no-variants');
      const heights = variants.map((v) => v.height).filter(Boolean);
      if (heights.length && out.height == null) out.height = Math.max(...heights);
      // On teste la variante la plus légère (économise la bande passante), puis la plus lourde en secours.
      const sorted = [...variants].sort((a, b) => a.bandwidth - b.bandwidth);
      const tryList = sorted.length > 1 ? [sorted[0], sorted[sorted.length - 1]] : sorted;
      let lastErr = null;
      let got = null;
      for (const v of tryList) {
        try {
          const r = await request(v.uri, { ...o, readBody: true });
          assertStatus(r, 'variant');
          assertPlaylist(r, 'variant');
          got = r;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!got) throw lastErr;
      track(got);
      playlist = got.text;
      base = got.url;
    }

    const { segments, drm } = parseMedia(playlist, base);
    if (drm) throw new CheckError('drm');
    if (!segments.length) throw new CheckError('no-segments');
    // Segment au bord du direct (le plus récent), puis l'avant-dernier en secours.
    const candidates = [segments[segments.length - 1], segments[segments.length - 2]].filter(Boolean);
    let segErr = null;
    let seg = null;
    for (const s of candidates) {
      try {
        const r = await request(s, { ...o, range: true, readBody: false });
        assertStatus(r, 'segment');
        const type = r.headers.get('content-type') || '';
        if (/text\/html/i.test(type)) throw new CheckError('segment-html');
        seg = r;
        break;
      } catch (e) {
        segErr = e;
      }
    }
    if (!seg) throw segErr;
    track(seg);
    out.ok = true;
  } catch (e) {
    out.reason = e?.reason || e?.message || 'error';
    out.restricted = Boolean(e?.restricted);
    if (!out.ms) out.ms = Date.now() - t0;
  }
  if (!url.startsWith('https:')) out.https = false;
  return out;
}

/** Exécute `worker` sur `items` avec une concurrence bornée. */
export async function pool(items, concurrency, worker, onProgress) {
  let next = 0;
  let done = 0;
  const results = new Array(items.length);
  const run = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/** Réordonne pour étaler la charge : jamais deux requêtes d'affilée vers le même serveur si possible. */
export function interleaveByHost(urls) {
  const groups = new Map();
  for (const u of urls) {
    let host = 'x';
    try {
      host = new URL(u).host;
    } catch {
      /* rien */
    }
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(u);
  }
  const lists = [...groups.values()].sort((a, b) => b.length - a.length);
  const out = [];
  for (let i = 0; out.length < urls.length; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

const hostKey = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

/**
 * Comme `pool`, mais avec au plus `perHost` requêtes simultanées par serveur, sans blocage en tête
 * de file : un serveur lent ou saturé n'empêche jamais les autres d'avancer.
 */
export async function hostPool(urls, { concurrency, perHost }, worker, onProgress) {
  const queues = new Map();
  for (const u of urls) {
    const h = hostKey(u);
    if (!queues.has(h)) queues.set(h, []);
    queues.get(h).push(u);
  }
  const active = [...queues.keys()];
  const inflight = new Map();
  let rr = 0;
  let pending = urls.length;
  let done = 0;
  const take = () => {
    for (let k = 0; k < active.length; k++) {
      const idx = (rr + k) % active.length;
      const h = active[idx];
      if ((inflight.get(h) || 0) >= perHost) continue;
      const q = queues.get(h);
      const u = q.shift();
      if (!q.length) active.splice(idx, 1);
      rr = active.length ? (q.length ? idx + 1 : idx) % active.length : 0;
      return [h, u];
    }
    return null;
  };
  const run = async () => {
    while (pending > 0) {
      const item = take();
      if (!item) {
        await new Promise((r) => setTimeout(r, 10));
        continue;
      }
      pending--;
      const [h, u] = item;
      inflight.set(h, (inflight.get(h) || 0) + 1);
      try {
        await worker(u);
      } finally {
        inflight.set(h, inflight.get(h) - 1);
        done++;
        onProgress?.(done, urls.length);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, run));
}
