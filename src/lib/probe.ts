// Vérification en arrière-plan, sur l'appareil, des chaînes affichées à l'écran.
// Complète la vérification faite toutes les 6 h par la CI : géo-blocage, panne récente…
import type { LiveChannel, PlayableStream } from '../data/types';
import { deadStore, isDead, pruneDead, settingsStore } from './stores';
import { saveData } from './platform';
import { proxied } from './proxy';

const PROBE_TTL = 3 * 3600 * 1000;
const CONCURRENCY = 3;
const TIMEOUT = 8000;

const probedAt = new Map<string, number>();
const queue: PlayableStream[] = [];
const queued = new Set<string>();
let running = 0;
let pendingDead: string[] = [];
let pendingAlive: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

try {
  const raw = sessionStorage.getItem('zp.probed');
  if (raw) for (const [u, t] of Object.entries(JSON.parse(raw) as Record<string, number>)) probedAt.set(u, t);
} catch {
  /* rien */
}

function persistProbed() {
  try {
    const now = Date.now();
    const obj: Record<string, number> = {};
    for (const [u, t] of probedAt) if (now - t < PROBE_TTL) obj[u] = t;
    sessionStorage.setItem('zp.probed', JSON.stringify(obj));
  } catch {
    /* rien */
  }
}

// Regroupe les mises à jour pour ne recalculer les listes qu'une fois par seconde.
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    const dead = pendingDead;
    const alive = pendingAlive;
    pendingDead = [];
    pendingAlive = [];
    if (!dead.length && !alive.some((u) => u in deadStore.get())) return;
    deadStore.set((d) => {
      const next = pruneDead(d);
      for (const u of alive) delete next[u];
      for (const u of dead) next[u] = Date.now();
      return next;
    });
    persistProbed();
  }, 1000);
}

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/** true = vivant, false = mort, null = indéterminé (on laisse le lecteur trancher). */
export async function probeStream(s: PlayableStream): Promise<boolean | null> {
  const { proxyUrl, proxyToken } = settingsStore.get();
  const url = s.mode === 'proxy' ? proxied(s.u, proxyUrl, proxyToken) : s.u;
  const readable = s.mode === 'hls' || s.mode === 'proxy' || s.x === 1;
  const t = withTimeout(TIMEOUT);
  try {
    if (readable) {
      const r = await fetch(url, { signal: t.signal, cache: 'no-store', credentials: 'omit' });
      if (!r.ok) return false;
      const text = (await r.text()).slice(0, 4096);
      return /#EXTM3U/.test(text);
    }
    // Sans CORS on ne voit pas la réponse, mais un échec réseau prouve que le flux est injoignable.
    await fetch(url, { mode: 'no-cors', signal: t.signal, cache: 'no-store', credentials: 'omit' });
    return null;
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return false;
    // Lecture native possible même si le CORS a changé : on ne condamne pas.
    if (readable && s.mode === 'native') return null;
    return false;
  } finally {
    t.done();
  }
}

async function pump() {
  while (running < CONCURRENCY && queue.length) {
    const s = queue.shift()!;
    queued.delete(s.u);
    running++;
    probeStream(s)
      .then((ok) => {
        probedAt.set(s.u, Date.now());
        if (ok === false) pendingDead.push(s.u);
        if (ok === true) pendingAlive.push(s.u);
        scheduleFlush();
      })
      .finally(() => {
        running--;
        setTimeout(pump, 120);
      });
  }
}

/** Ajoute à la file la première source jouable de chaque chaîne (déjà vérifiée récemment = ignorée). */
export function probeChannels(channels: LiveChannel[]) {
  const settings = settingsStore.get();
  if (!settings.probe || saveData || document.hidden) return;
  const dead = deadStore.get();
  const now = Date.now();
  for (const ch of channels) {
    const s = ch.play.find((p) => p.mode !== 'external' && !isDead(dead, p.u));
    if (!s || queued.has(s.u)) continue;
    const t = probedAt.get(s.u);
    if (t && now - t < PROBE_TTL) continue;
    queued.add(s.u);
    queue.push(s);
  }
  void pump();
}

export function cancelProbes() {
  queue.length = 0;
  queued.clear();
}
