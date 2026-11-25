import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Catalog, LiveChannel } from './types';
import { buildLive, isWatchable, type Env } from './scoring';
import { deadStore, settingsStore } from '../lib/stores';
import { mseSupported, nativeHls, pageIsHttp, preferNative } from '../lib/platform';
import {
  decryptCatalog,
  deriveKey,
  forgetKey,
  importSavedKey,
  playlistToken,
  readSaved,
  saveKey,
  vaultSupported,
  type LockInfo,
} from '../lib/vault';

interface Manifest {
  v: number;
  locked: boolean;
  file: string;
  kdf?: LockInfo;
}

export interface CatalogState {
  status: 'loading' | 'ready' | 'error' | 'locked';
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
  /** Zapette privée (liste chiffrée par mot de passe) */
  isPrivate: boolean;
  /** dossier secret des playlists TV en mode privé */
  playlistDir: string;
  unlock: (password: string) => Promise<void>;
  lockDevice: () => void;
}

const empty: CatalogState = {
  status: 'loading',
  all: [],
  visible: [],
  byId: new Map(),
  hiddenCount: 0,
  env: { preferNative, nativeHls, mse: mseSupported, pageHttp: pageIsHttp, proxy: false, checked: true },
  reload: () => {},
  isPrivate: false,
  playlistDir: 'playlists',
  unlock: async () => {},
  lockDevice: () => {},
};

async function fetchEncrypted(file: string, key: CryptoKey) {
  const r = await fetch(`./data/${file}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Erreur ${r.status}`);
  return decryptCatalog<Catalog>(await r.arrayBuffer(), key);
}

const Ctx = createContext<CatalogState>(empty);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);
  const settings = settingsStore.use();
  const dead = deadStore.use();

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [locked, setLocked] = useState(false);
  const [plToken, setPlToken] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    (async () => {
      const m: Manifest = await fetch('./data/manifest.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
        .catch(() => null) ?? { v: 1, locked: false, file: 'channels.json' };
      if (cancelled) return;
      setManifest(m);
      if (m.locked && m.kdf) {
        // Clé déjà mémorisée sur cet appareil (et toujours valable) ?
        const saved = readSaved();
        if (saved && saved.salt === m.kdf.salt && vaultSupported()) {
          try {
            const c = await fetchEncrypted(m.file, await importSavedKey(saved));
            if (cancelled) return;
            setPlToken(saved.pl);
            setLocked(false);
            setRaw(c);
            return;
          } catch {
            forgetKey(); // mot de passe changé depuis : on le redemande
          }
        }
        if (!cancelled) setLocked(true);
        return;
      }
      const r = await fetch(`./data/${m.file || 'channels.json'}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status === 404 ? 'Le catalogue n’a pas encore été généré.' : `Erreur ${r.status}`);
      const c = (await r.json()) as Catalog;
      if (!cancelled) setRaw(c);
    })().catch((e: Error) => !cancelled && setError(e.message || 'Réseau indisponible'));
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const unlock = useCallback(
    async (password: string) => {
      if (!manifest?.kdf) throw new Error('Rien à déverrouiller');
      if (!vaultSupported()) throw new Error('Ce navigateur est trop ancien pour ouvrir une Zapette privée. Mets-le à jour.');
      const key = await deriveKey(password, manifest.kdf);
      const c = await fetchEncrypted(manifest.file, key);
      const pl = await playlistToken(password);
      await saveKey(manifest.kdf, key, pl);
      setPlToken(pl);
      setLocked(false);
      setRaw(c);
    },
    [manifest],
  );

  const lockDevice = useCallback(() => {
    forgetKey();
    setRaw(null);
    setPlToken('');
    setLocked(true);
  }, []);

  const value = useMemo<CatalogState>(() => {
    const env: Env = {
      preferNative,
      nativeHls,
      mse: mseSupported,
      pageHttp: pageIsHttp,
      proxy: Boolean(settings.proxyUrl.trim()),
      checked: raw?.checked ?? true,
    };
    const isPrivate = Boolean(manifest?.locked);
    const common = { env, reload, isPrivate, playlistDir: isPrivate ? `playlists/${plToken}` : 'playlists', unlock, lockDevice };
    if (locked) return { ...empty, ...common, status: 'locked' };
    if (!raw) return { ...empty, ...common, status: error ? 'error' : 'loading', error };
    const all = buildLive(raw, env, settings.country, settings.lang, dead);
    const visible = all.filter((c) => isWatchable(c, dead, settings.showExternal));
    return {
      status: 'ready',
      catalog: raw,
      all,
      visible,
      byId: new Map(all.map((c) => [c.id, c])),
      hiddenCount: all.length - visible.length,
      ...common,
    };
  }, [raw, error, settings.country, settings.lang, settings.proxyUrl, settings.showExternal, dead, reload, manifest, locked, plToken, unlock, lockDevice]);

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
