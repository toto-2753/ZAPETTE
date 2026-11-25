#!/usr/bin/env node
// Construit le catalogue Zapette : récupère iptv-org (+ playlists complémentaires), vérifie
// chaque flux, et écrit public/data/channels.json, public/data/status.json et des playlists M3U.
//
// Usage :
//   node scripts/update-data.mjs                      # tout, avec vérification
//   node scripts/update-data.mjs --extra-dir /tmp/itant/streams
//   node scripts/update-data.mjs --api ./data-raw --no-check   # dev hors-ligne, sans vérification
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parseM3U, writeM3U } from './lib/m3u.mjs';
import { buildCandidates, finalize } from './lib/catalog.mjs';
import { checkStream, hostPool } from './lib/hls-check.mjs';
import { encryptCatalog, ITERATIONS, playlistToken, saltFor } from './lib/vault.mjs';
import categoriesFr from '../shared/categories-fr.json' with { type: 'json' };

const { values: args } = parseArgs({
  options: {
    api: { type: 'string', default: 'https://iptv-org.github.io/api' },
    'extra-dir': { type: 'string', multiple: true, default: [] },
    'extra-url': { type: 'string', multiple: true, default: [] },
    'no-check': { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '48' },
    'per-host': { type: 'string', default: '6' },
    'host-breaker': { type: 'string', default: '6' },
    timeout: { type: 'string', default: '8000' },
    origin: { type: 'string', default: process.env.ZAPETTE_ORIGIN || 'https://zapette.app' },
    out: { type: 'string', default: 'public' },
    limit: { type: 'string' },
  },
});

const API_FILES = ['channels', 'feeds', 'streams', 'logos', 'blocklist', 'categories'];
const API_FALLBACK = 'https://raw.githubusercontent.com/iptv-org/api/gh-pages';
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

async function fetchJson(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      err = e;
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
  throw err;
}

async function loadApi(src) {
  const api = {};
  for (const name of API_FILES) {
    if (existsSync(src)) {
      api[name] = JSON.parse(await readFile(path.join(src, `${name}.json`), 'utf8'));
    } else {
      try {
        api[name] = await fetchJson(`${src.replace(/\/$/, '')}/${name}.json`);
      } catch (e) {
        log(`⚠️  ${name}.json indisponible sur ${src} (${e.message}), essai du miroir GitHub…`);
        api[name] = await fetchJson(`${API_FALLBACK}/${name}.json`);
      }
    }
    log(`API ${name}: ${api[name].length}`);
  }
  return api;
}

async function loadExtra() {
  const entries = [];
  for (const dir of args['extra-dir']) {
    if (!existsSync(dir)) {
      log(`⚠️  dossier absent, ignoré : ${dir}`);
      continue;
    }
    const files = (await readdir(dir)).filter((f) => f.endsWith('.m3u') || f.endsWith('.m3u8'));
    for (const f of files) entries.push(...parseM3U(await readFile(path.join(dir, f), 'utf8')));
    log(`Playlists complémentaires ${dir}: ${files.length} fichiers`);
  }
  for (const url of args['extra-url']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      entries.push(...parseM3U(await r.text()));
      log(`Playlist complémentaire ${url}: ok`);
    } catch (e) {
      log(`⚠️  ${url}: ${e.message}`);
    }
  }
  return entries;
}

const TRANSIENT = /timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket|network|fetch failed/i;
// Erreurs qui touchent tout le serveur (nom inconnu, connexion refusée, certificat, délai dépassé).
const HOST_LEVEL = /timeout|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|CERT|certificate|SSL|TLS|UND_ERR_CONNECT|fetch failed/i;

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

async function verify(urls) {
  const concurrency = Number(args.concurrency);
  const timeout = Number(args.timeout);
  const breaker = Number(args['host-breaker']);
  const perHost = Number(args['per-host']);
  const results = new Map();
  // Par serveur : réponses valides et pannes « serveur entier ». Un serveur qui échoue `breaker` fois
  // sans jamais répondre est considéré hors ligne : ses autres liens ne sont pas testés un à un
  // (les vieux liens du fork pointent souvent vers des serveurs disparus, avec des centaines de flux).
  const hosts = new Map();
  const hostState = (u) => {
    const h = hostOf(u);
    if (!hosts.has(h)) hosts.set(h, { ok: 0, down: 0 });
    return hosts.get(h);
  };
  let skipped = 0;
  const t0 = Date.now();
  let last = 0;
  const progress = (done, total) => {
    if (done - last >= 1000 || done === total) {
      last = done;
      const alive = [...results.values()].filter((r) => r.ok).length;
      log(`  ${done}/${total} testés — ${alive} en ligne — ${skipped} sur serveurs hors ligne — ${Math.round((Date.now() - t0) / 1000)} s`);
    }
  };
  const test = async (url, t) => {
    const st = hostState(url);
    if (st.ok === 0 && st.down >= breaker) {
      skipped++;
      return { ok: false, restricted: false, https: url.startsWith('https:'), cors: false, ms: 0, height: null, reason: 'serveur hors ligne' };
    }
    const r = await checkStream(url, { timeout: t, origin: args.origin });
    if (r.ok || r.restricted) st.ok++;
    else if (HOST_LEVEL.test(r.reason)) st.down++;
    return r;
  };
  await hostPool(
    urls,
    { concurrency, perHost },
    async (url) => {
      results.set(url, await test(url, timeout));
    },
    progress,
  );

  // Deuxième chance pour les échecs passagers, seulement sur les serveurs qui répondent par ailleurs
  // (un serveur entièrement muet ne sera pas plus bavard dans une minute). Bornée en nombre.
  const retry = urls
    .filter((u) => {
      const r = results.get(u);
      return !r.ok && !r.restricted && TRANSIENT.test(r.reason) && hostState(u).ok > 0;
    })
    .slice(0, 1500);
  if (retry.length) {
    log(`Nouvel essai pour ${retry.length} flux en échec passager…`);
    let recovered = 0;
    await hostPool(retry, { concurrency: Math.max(8, concurrency >> 1), perHost }, async (url) => {
      const r = await checkStream(url, { timeout: timeout + 4000, origin: args.origin });
      if (r.ok || r.restricted) {
        results.set(url, r);
        recovered++;
      }
    });
    log(`  ${recovered} flux récupérés au deuxième essai.`);
  }
  log(`Serveurs hors ligne : ${[...hosts.values()].filter((h) => h.ok === 0 && h.down >= breaker).length} (${skipped} liens non retestés).`);
  return { results, seconds: Math.round((Date.now() - t0) / 1000) };
}

function topReasons(results) {
  const counts = {};
  for (const r of results.values()) {
    if (r.ok) continue;
    const key = r.restricted ? 'restreint (401/403/451)' : r.reason.replace(/https?:\/\/\S+/g, '').slice(0, 40);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15));
}

function playlistEntries(channels, filter) {
  const out = [];
  for (const ch of channels) {
    if (!filter(ch)) continue;
    const s = ch.s.find((x) => !x.r) || ch.s[0];
    if (!s) continue;
    out.push({
      tvgId: ch.id.startsWith('x-') ? '' : ch.id,
      name: ch.n,
      logo: ch.l,
      group: categoriesFr[ch.g[0]] || 'Autres',
      quality: s.q,
      url: s.u,
    });
  }
  return out;
}

async function main() {
  log(`Source iptv-org : ${args.api}`);
  const api = await loadApi(args.api);
  const extra = await loadExtra();
  const { channels: candidates, skipped } = buildCandidates(api, extra, { log });

  let urls = [...candidates.values()].flatMap((c) => c.s.map((s) => s.u));
  if (args.limit) urls = urls.slice(0, Number(args.limit));

  let results = null;
  let seconds = 0;
  if (!args['no-check']) {
    log(`Vérification de ${urls.length} flux (concurrence ${args.concurrency}, ${args['per-host']}/serveur)…`);
    ({ results, seconds } = await verify(urls));
  } else {
    log('⚠️  --no-check : aucune vérification (données de développement).');
  }

  const final = finalize(candidates, results);
  const allStreams = final.reduce((n, c) => n + c.s.length, 0);
  const stats = {
    tested: results ? results.size : 0,
    alive: results ? [...results.values()].filter((r) => r.ok).length : 0,
    restricted: results ? [...results.values()].filter((r) => !r.ok && r.restricted).length : 0,
    dead: results ? [...results.values()].filter((r) => !r.ok && !r.restricted).length : 0,
    cors: results ? [...results.values()].filter((r) => r.ok && r.cors).length : 0,
    channels: final.length,
    streams: allStreams,
    skipped,
    seconds,
  };
  const generatedAt = new Date().toISOString();
  const checked = Boolean(results);

  const dataDir = path.join(args.out, 'data');
  await mkdir(dataDir, { recursive: true });
  const catalogJson = JSON.stringify({ v: 1, generatedAt, checked, stats, channels: final });

  // Zapette privée : si ZAPETTE_PASSWORD est défini, la liste est chiffrée et les playlists TV
  // vont dans un dossier secret. Sans le mot de passe, l'app ne peut rien afficher.
  const password = process.env.ZAPETTE_PASSWORD || '';
  let plDir = path.join(args.out, 'playlists');
  if (password) {
    const salt = saltFor(process.env.ZAPETTE_SALT_SEED || process.env.GITHUB_REPOSITORY || 'zapette');
    await writeFile(path.join(dataDir, 'channels.enc'), await encryptCatalog(catalogJson, password, salt));
    await rm(path.join(dataDir, 'channels.json'), { force: true });
    await rm(plDir, { recursive: true, force: true });
    plDir = path.join(plDir, playlistToken(password));
    await writeFile(
      path.join(dataDir, 'manifest.json'),
      JSON.stringify({ v: 1, locked: true, file: 'channels.enc', kdf: { name: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: salt.toString('base64') } }),
    );
    log('🔒 Mode privé : liste chiffrée, playlists dans un dossier secret.');
  } else {
    await writeFile(path.join(dataDir, 'channels.json'), catalogJson);
    await rm(path.join(dataDir, 'channels.enc'), { force: true });
    await writeFile(path.join(dataDir, 'manifest.json'), JSON.stringify({ v: 1, locked: false, file: 'channels.json' }));
  }
  await mkdir(plDir, { recursive: true });
  await writeFile(
    path.join(dataDir, 'status.json'),
    JSON.stringify({ generatedAt, checked, stats, reasons: results ? topReasons(results) : {} }, null, 2),
  );
  await writeFile(path.join(plDir, 'zapette.m3u'), writeM3U(playlistEntries(final, () => true)));
  await writeFile(
    path.join(plDir, 'zapette-fr.m3u'),
    writeM3U(playlistEntries(final, (c) => c.c === 'FR' || (c.lg || []).includes('fra'))),
  );
  log(
    `✅ ${final.length} chaînes, ${allStreams} flux` +
      (checked ? ` (${stats.alive} en ligne, ${stats.restricted} restreints, ${stats.dead} morts écartés)` : ''),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
