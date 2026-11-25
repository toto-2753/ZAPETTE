import { useSyncExternalStore } from 'react';

/** Petit store persistant (localStorage) utilisable avec useSyncExternalStore. */
export function persisted<T>(key: string, initial: T, merge = false) {
  const read = (): T => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const v = JSON.parse(raw);
      return merge && typeof v === 'object' && v && !Array.isArray(v) ? { ...initial, ...v } : (v as T);
    } catch {
      return initial;
    }
  };
  let state = read();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const set = (next: T | ((prev: T) => T)) => {
    state = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* stockage plein ou interdit : on garde en mémoire */
    }
    emit();
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === key) {
        state = read();
        emit();
      }
    });
  }
  const get = () => state;
  const use = () => useSyncExternalStore(subscribe, get, get);
  return { get, set, subscribe, use };
}

export interface Settings {
  /** pays de référence (code iptv-org) */
  country: string;
  /** langue préférée (ISO 639-3) */
  lang: string;
  /** vérifier en arrière-plan les chaînes affichées */
  probe: boolean;
  /** montrer aussi les chaînes lisibles seulement dans VLC */
  showExternal: boolean;
  /** aperçu vidéo muet dans le bandeau d'accueil (grands écrans) */
  heroPreview: boolean;
  /** clé ou jeton d'accès TMDB */
  tmdbKey: string;
  /** proxy facultatif (voir proxy/README.md) */
  proxyUrl: string;
  proxyToken: string;
}

export const DEFAULT_SETTINGS: Settings = {
  country: 'FR',
  lang: 'fra',
  probe: true,
  showExternal: false,
  heroPreview: true,
  tmdbKey: '',
  proxyUrl: '',
  proxyToken: '',
};

export const settingsStore = persisted<Settings>('zp.settings', DEFAULT_SETTINGS, true);
export const favoritesStore = persisted<string[]>('zp.favorites', []);
export const historyStore = persisted<{ id: string; at: number }[]>('zp.history', []);

export function toggleFavorite(id: string) {
  favoritesStore.set((f) => (f.includes(id) ? f.filter((x) => x !== id) : [id, ...f]));
}

export function pushHistory(id: string) {
  historyStore.set((h) => [{ id, at: Date.now() }, ...h.filter((x) => x.id !== id)].slice(0, 30));
}

// ---------- Flux morts constatés sur cet appareil ----------
/** Durée pendant laquelle un flux en échec est écarté sur l'appareil. */
export const DEAD_TTL = 6 * 3600 * 1000;
export const deadStore = persisted<Record<string, number>>('zp.dead', {});

export function markDead(url: string) {
  deadStore.set((d) => ({ ...pruneDead(d), [url]: Date.now() }));
}
export function markAlive(url: string) {
  if (!(url in deadStore.get())) return;
  deadStore.set((d) => {
    const n = { ...d };
    delete n[url];
    return n;
  });
}
export function pruneDead(d: Record<string, number>) {
  const now = Date.now();
  const out: Record<string, number> = {};
  for (const [u, t] of Object.entries(d)) if (now - t < DEAD_TTL) out[u] = t;
  return out;
}
export const isDead = (d: Record<string, number>, url: string) => {
  const t = d[url];
  return t !== undefined && Date.now() - t < DEAD_TTL;
};
