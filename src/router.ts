import { createContext, useContext, useSyncExternalStore } from 'react';

export interface Route {
  /** ex. « /chaines » */
  path: string;
  /** segments, ex. ['regarder', 'France24.fr'] */
  parts: string[];
  params: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  const path = p.startsWith('/') ? p : '/' + p;
  return {
    path,
    parts: path.split('/').filter(Boolean).map((s) => decodeURIComponent(s)),
    params: new URLSearchParams(q),
  };
}

let current = parse();
let currentKey = location.hash;
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  currentKey = location.hash;
  listeners.forEach((l) => l());
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getKey = () => currentKey;

export function useRoute(): Route {
  useSyncExternalStore(subscribe, getKey, getKey);
  return current;
}

// Vrai dès qu'on a navigué dans l'app : « retour » peut alors utiliser l'historique du navigateur.
let navigatedInApp = false;

export function navigate(to: string, { replace = false } = {}) {
  const hash = '#' + (to.startsWith('/') ? to : '/' + to);
  if (replace) {
    history.replaceState(history.state, '', hash);
    current = parse();
    currentKey = location.hash;
    listeners.forEach((l) => l());
  } else if (location.hash !== hash) {
    navigatedInApp = true;
    location.hash = hash;
  }
}

/** Revient en arrière si on est arrivé ici depuis l'app, sinon va à `fallback`. */
export function goBack(fallback = '/') {
  if (navigatedInApp) history.back();
  else navigate(fallback, { replace: true });
}

export const watchPath = (id: string) => `/regarder/${encodeURIComponent(id)}`;

/** Lien absolu partageable vers une chaîne. */
export const absoluteWatchUrl = (id: string) => `${location.origin}${location.pathname}#${watchPath(id)}`;

/** Route de la page affichée sous le lecteur (le lecteur s'ouvre par-dessus sans la démonter). */
export const PageRouteContext = createContext<Route | null>(null);
export function usePageRoute(): Route {
  const ctx = useContext(PageRouteContext);
  const r = useRoute();
  return ctx ?? r;
}
