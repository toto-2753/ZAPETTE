import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Catalog, LiveChannel } from './types';
import { buildLive, isWatchable, type Env } from './scoring';
import { deadStore, settingsStore } from '../lib/stores';
import { mseSupported, nativeHls, pageIsHttp, preferNative } from '../lib/platform';

export interface CatalogState {
  status: 'loading' | 'ready' | 'error';
  error?: string;
  catalog?: Catalog;
  /** toutes les chaînes du catalogue, numérotées */
  all: LiveChannel[];
  /** chaînes lisibles sur cet appareil (sans les mortes) */
  visible: LiveChannel[];
  byId: Map<string, LiveChannel>;
  hiddenCount: number;
  env: Env;
  reload: () => void;
}

const empty: CatalogState = {
  status: 'loading',
  all: [],
  visible: [],
  byId: new Map(),
  hiddenCount: 0,
  env: { preferNative, nativeHls, mse: mseSupported, pageHttp: pageIsHttp, proxy: false, checked: true },
  reload: () => {},
};

const Ctx = createContext<CatalogState>(empty);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);
  const settings = settingsStore.use();
  const dead = deadStore.use();

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    fetch('./data/channels.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Le catalogue n’a pas encore été généré.' : `Erreur ${r.status}`);
        return r.json() as Promise<Catalog>;
      })
      .then((c) => !cancelled && setRaw(c))
      .catch((e: Error) => !cancelled && setError(e.message || 'Réseau indisponible'));
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<CatalogState>(() => {
    const env: Env = {
      preferNative,
      nativeHls,
      mse: mseSupported,
      pageHttp: pageIsHttp,
      proxy: Boolean(settings.proxyUrl.trim()),
      checked: raw?.checked ?? true,
    };
    if (!raw) return { ...empty, status: error ? 'error' : 'loading', error, env, reload };
    const all = buildLive(raw, env, settings.country, settings.lang, dead);
    const visible = all.filter((c) => isWatchable(c, dead, settings.showExternal));
    return {
      status: 'ready',
      catalog: raw,
      all,
      visible,
      byId: new Map(all.map((c) => [c.id, c])),
      hiddenCount: all.length - visible.length,
      env,
      reload,
    };
  }, [raw, error, settings.country, settings.lang, settings.proxyUrl, settings.showExternal, dead, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCatalog = () => useContext(Ctx);

// ---------- Liste de zapping ----------
// Quand on lance une chaîne depuis une rangée ou une grille, ↑/↓ zappe dans cette même liste.
let zapIds: string[] = [];
export const setZapList = (ids: string[]) => {
  zapIds = ids;
};
export const getZapList = () => zapIds;
